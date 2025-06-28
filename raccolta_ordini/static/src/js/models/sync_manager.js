/**
 * Sync Manager - Gestione sincronizzazione documenti offline
 * Sincronizza ordini, picking e DDT con il server Odoo
 */

class SyncManager {
    constructor() {
        this.storage = null;
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.autoSyncInterval = null;
        this.syncQueue = [];
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.syncDelay = 5000; // 5 secondi tra sync automatiche
    }

    /**
     * Inizializza sync manager
     */
    initialize(storage) {
        this.storage = storage;
        this.bindNetworkEvents();
    }

    /**
     * Bind eventi di rete
     */
    bindNetworkEvents() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.startAutoSync();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.stopAutoSync();
        });
    }

    /**
     * Avvia sincronizzazione automatica
     */
    startAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        this.autoSyncInterval = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                this.syncPendingData();
            }
        }, this.syncDelay);

        console.log('Auto-sync avviato');
    }

    /**
     * Ferma sincronizzazione automatica
     */
    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }

        console.log('Auto-sync fermato');
    }

    /**
     * Sincronizza tutti i dati pending
     */
    async syncPendingData() {
        if (this.isSyncing || !this.isOnline) {
            return { success: false, reason: 'Sync già in corso o offline' };
        }

        this.isSyncing = true;

        try {
            console.log('🔄 Inizio sincronizzazione dati pending...');

            // 1. Sincronizza ordini
            const ordersResult = await this.syncPendingOrders();

            // 2. Sincronizza picking
            const pickingsResult = await this.syncPendingPickings();

            // 3. Sincronizza DDT
            const ddtsResult = await this.syncPendingDdts();

            // 4. Sincronizza contatori
            const countersResult = await this.syncCounters();

            const totalSynced = ordersResult.synced + pickingsResult.synced + ddtsResult.synced;
            const totalErrors = ordersResult.errors + pickingsResult.errors + ddtsResult.errors;

            console.log(`✅ Sincronizzazione completata: ${totalSynced} documenti, ${totalErrors} errori`);

            // Notifica risultato
            this.notifyProgress({
                type: 'completed',
                synced: totalSynced,
                errors: totalErrors,
                details: { ordersResult, pickingsResult, ddtsResult, countersResult }
            });

            return {
                success: true,
                synced: totalSynced,
                errors: totalErrors,
                details: { ordersResult, pickingsResult, ddtsResult, countersResult }
            };

        } catch (error) {
            console.error('❌ Errore durante sincronizzazione:', error);

            this.notifyProgress({
                type: 'error',
                error: error.message
            });

            return { success: false, error: error.message };

        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sincronizza ordini pending
     */
    async syncPendingOrders() {
        const pendingOrders = await this.storage.getPendingOrders();
        let synced = 0;
        let errors = 0;

        this.notifyProgress({
            type: 'progress',
            message: `Sincronizzazione ${pendingOrders.length} ordini...`,
            current: 0,
            total: pendingOrders.length
        });

        for (let i = 0; i < pendingOrders.length; i++) {
            const order = pendingOrders[i];

            try {
                const result = await this.syncOrder(order);

                if (result.success) {
                    synced++;
                    // Marca come sincronizzato
                    await this.storage.markOrderAsSynced(order.local_id, result.odoo_id);
                } else {
                    errors++;
                    await this.handleSyncError(order, result.error);
                }

                // Aggiorna progress
                this.notifyProgress({
                    type: 'progress',
                    message: `Sincronizzazione ordini: ${i + 1}/${pendingOrders.length}`,
                    current: i + 1,
                    total: pendingOrders.length
                });

                // Piccola pausa per non sovraccaricare il server
                await this.sleep(100);

            } catch (error) {
                console.error(`Errore sync ordine ${order.local_id}:`, error);
                errors++;
                await this.handleSyncError(order, error.message);
            }
        }

        return { synced, errors, total: pendingOrders.length };
    }

    /**
     * Sincronizza singolo ordine
     */
    async syncOrder(order) {
        try {
            // Prepara dati per il server
            const orderData = this.prepareOrderForSync(order);

            // Invia al server
            const response = await this.rpc('/raccolta/sync_order', {
                order_data: orderData,
                local_id: order.local_id
            });

            if (response.success) {
                console.log(`✅ Ordine ${order.name} sincronizzato - ID Odoo: ${response.odoo_id}`);
                return {
                    success: true,
                    odoo_id: response.odoo_id,
                    message: response.message
                };
            } else {
                throw new Error(response.error || 'Errore sconosciuto durante sync');
            }

        } catch (error) {
            console.error(`❌ Errore sync ordine ${order.local_id}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sincronizza picking pending
     */
    async syncPendingPickings() {
        // Carica tutti i picking pending
        const allPickings = await this.storage.getAllFromLocalStorage('pickings');
        const pendingPickings = allPickings.filter(p => p.sync_status === 'pending');

        let synced = 0;
        let errors = 0;

        for (const picking of pendingPickings) {
            try {
                const result = await this.syncPicking(picking);

                if (result.success) {
                    synced++;
                    // Aggiorna stato picking
                    picking.sync_status = 'synced';
                    picking.odoo_id = result.odoo_id;
                    picking.synced_at = new Date().toISOString();
                    await this.storage.savePicking(picking);
                } else {
                    errors++;
                }

            } catch (error) {
                console.error(`Errore sync picking ${picking.local_id}:`, error);
                errors++;
            }
        }

        return { synced, errors, total: pendingPickings.length };
    }

    /**
     * Sincronizza singolo picking
     */
    async syncPicking(picking) {
        try {
            const pickingData = this.preparePickingForSync(picking);

            const response = await this.rpc('/raccolta/sync_picking', {
                picking_data: pickingData,
                local_id: picking.local_id
            });

            return {
                success: response.success,
                odoo_id: response.odoo_id,
                error: response.error
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sincronizza DDT pending
     */
    async syncPendingDdts() {
        const allDdts = await this.storage.getAllFromLocalStorage('ddts');
        const pendingDdts = allDdts.filter(d => d.sync_status === 'pending');

        let synced = 0;
        let errors = 0;

        for (const ddt of pendingDdts) {
            try {
                const result = await this.syncDdt(ddt);

                if (result.success) {
                    synced++;
                    // Aggiorna stato DDT
                    ddt.sync_status = 'synced';
                    ddt.odoo_id = result.odoo_id;
                    ddt.synced_at = new Date().toISOString();
                    await this.storage.saveDdt(ddt);
                } else {
                    errors++;
                }

            } catch (error) {
                console.error(`Errore sync DDT ${ddt.local_id}:`, error);
                errors++;
            }
        }

        return { synced, errors, total: pendingDdts.length };
    }

    /**
     * Sincronizza singolo DDT
     */
    async syncDdt(ddt) {
        try {
            const ddtData = this.prepareDdtForSync(ddt);

            const response = await this.rpc('/raccolta/sync_ddt', {
                ddt_data: ddtData,
                local_id: ddt.local_id
            });

            return {
                success: response.success,
                odoo_id: response.odoo_id,
                error: response.error
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sincronizza contatori
     */
    async syncCounters() {
        try {
            const counterManager = window.RaccoltaApp.getModel('counter');
            const result = await counterManager.syncWithServer();

            return {
                success: result,
                message: result ? 'Contatori sincronizzati' : 'Errore sync contatori'
            };

        } catch (error) {
            console.error('Errore sync contatori:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === METODI PREPARAZIONE DATI ===

    /**
     * Prepara dati ordine per sincronizzazione
     */
    prepareOrderForSync(order) {
        return {
            // Identificatori
            local_id: order.local_id,
            name: order.name,

            // Dati principali
            partner_id: order.partner_id,
            date_order: order.date_order,
            validity_date: order.validity_date,
            state: order.state,

            // Righe ordine
            order_lines: order.order_lines || [],

            // Totali
            amount_untaxed: order.amount_untaxed,
            amount_tax: order.amount_tax,
            amount_total: order.amount_total,

            // Note
            note: order.note,
            general_notes: order.general_notes,
            internal_notes: order.internal_notes,
            delivery_instructions: order.delivery_instructions,

            // Metadata raccolta
            raccolta_session_id: order.raccolta_session_id,
            raccolta_agent_id: order.agent_id,
            raccolta_agent_code: order.agent_code,
            created_offline: order.created_offline,

            // Timestamp
            created_at: order.created_at,
            last_update: order.last_update
        };
    }

    /**
     * Prepara dati picking per sincronizzazione
     */
    preparePickingForSync(picking) {
        return {
            local_id: picking.local_id,
            name: picking.name,
            origin: picking.origin,
            partner_id: picking.partner_id,
            scheduled_date: picking.scheduled_date,
            state: picking.state,
            move_lines: picking.move_lines || [],
            location_id: picking.location_id,
            location_dest_id: picking.location_dest_id,
            order_local_id: picking.order_local_id,
            raccolta_session_id: picking.raccolta_session_id,
            created_offline: picking.created_offline,
            created_at: picking.created_at
        };
    }

    /**
     * Prepara dati DDT per sincronizzazione
     */
    prepareDdtForSync(ddt) {
        return {
            local_id: ddt.local_id,
            name: ddt.name,
            date: ddt.date,
            partner_id: ddt.partner_id,
            picking_local_id: ddt.picking_local_id,

            // Dati trasporto italiani
            transport_reason: ddt.transport_reason,
            goods_appearance: ddt.goods_appearance,
            transport_condition: ddt.transport_condition,
            transport_method: ddt.transport_method,

            // Dettagli spedizione
            packages: ddt.packages,
            gross_weight: ddt.gross_weight,
            net_weight: ddt.net_weight,
            carrier_name: ddt.carrier_name,
            carrier_vat: ddt.carrier_vat,

            // Timing
            transport_start_date: ddt.transport_start_date,
            transport_start_time: ddt.transport_start_time,

            // Metadata
            raccolta_session_id: ddt.raccolta_session_id,
            created_offline: ddt.created_offline,
            created_at: ddt.created_at
        };
    }

    // === GESTIONE ERRORI ===

    /**
     * Gestisce errori di sincronizzazione
     */
    async handleSyncError(document, error) {
        const key = document.local_id;
        const attempts = this.retryAttempts.get(key) || 0;

        if (attempts < this.maxRetries) {
            // Incrementa tentativi
            this.retryAttempts.set(key, attempts + 1);

            // Aggiunge alla coda di retry
            this.syncQueue.push({
                document: document,
                type: document.local_id.startsWith('order_') ? 'order' :
                      document.local_id.startsWith('picking_') ? 'picking' : 'ddt',
                attempt: attempts + 1,
                error: error
            });

            console.warn(`⚠️ Retry ${attempts + 1}/${this.maxRetries} per ${key}: ${error}`);

        } else {
            // Troppi tentativi, marca come errore permanente
            console.error(`❌ Troppi tentativi falliti per ${key}: ${error}`);

            // Aggiorna documento con stato errore
            if (document.local_id.startsWith('order_')) {
                document.sync_status = 'error';
                document.sync_error = error;
                await this.storage.saveOrder(document);
            }
            // TODO: Gestisci anche picking e DDT

            this.retryAttempts.delete(key);
        }
    }

    /**
     * Processa coda di retry
     */
    async processRetryQueue() {
        if (this.syncQueue.length === 0) return;

        console.log(`🔄 Processando ${this.syncQueue.length} documenti in retry...`);

        const retryItems = [...this.syncQueue];
        this.syncQueue = [];

        for (const item of retryItems) {
            try {
                let result;

                switch (item.type) {
                    case 'order':
                        result = await this.syncOrder(item.document);
                        break;
                    case 'picking':
                        result = await this.syncPicking(item.document);
                        break;
                    case 'ddt':
                        result = await this.syncDdt(item.document);
                        break;
                }

                if (result.success) {
                    console.log(`✅ Retry riuscito per ${item.document.local_id}`);
                    this.retryAttempts.delete(item.document.local_id);
                } else {
                    await this.handleSyncError(item.document, result.error);
                }

            } catch (error) {
                await this.handleSyncError(item.document, error.message);
            }
        }
    }

    // === UTILITY ===

    /**
     * Notifica progress di sincronizzazione
     */
    notifyProgress(data) {
        // Emette evento personalizzato per UI
        window.dispatchEvent(new CustomEvent('raccolta-sync-progress', { detail: data }));

        // Notifica anche tramite notification manager se disponibile
        const notificationManager = window.RaccoltaApp.getModel('notification');
        if (notificationManager) {
            switch (data.type) {
                case 'completed':
                    notificationManager.success(`Sincronizzazione completata: ${data.synced} documenti`);
                    break;
                case 'error':
                    notificationManager.error(`Errore sincronizzazione: ${data.error}`);
                    break;
            }
        }
    }

    /**
     * Ottiene statistiche sincronizzazione
     */
    async getSyncStats() {
        const pendingOrders = await this.storage.getPendingOrders();
        const allOrders = await this.storage.getAllOrders();

        const syncedOrders = allOrders.filter(o => o.sync_status === 'synced');
        const errorOrders = allOrders.filter(o => o.sync_status === 'error');

        return {
            total_orders: allOrders.length,
            pending_sync: pendingOrders.length,
            synced: syncedOrders.length,
            errors: errorOrders.length,
            sync_percentage: allOrders.length > 0 ? Math.round((syncedOrders.length / allOrders.length) * 100) : 0,
            last_sync: this.getLastSyncTime(),
            is_syncing: this.isSyncing,
            is_online: this.isOnline
        };
    }

    /**
     * Ottiene timestamp ultima sincronizzazione
     */
    getLastSyncTime() {
        try {
            return localStorage.getItem('raccolta_last_sync') || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Salva timestamp ultima sincronizzazione
     */
    saveLastSyncTime() {
        try {
            localStorage.setItem('raccolta_last_sync', new Date().toISOString());
        } catch (error) {
            console.error('Errore salvataggio last sync time:', error);
        }
    }

    /**
     * Forza sincronizzazione completa
     */
    async forceSyncAll() {
        console.log('🔄 Forza sincronizzazione completa...');

        // Reset retry attempts
        this.retryAttempts.clear();
        this.syncQueue = [];

        // Esegui sync completa
        const result = await this.syncPendingData();

        if (result.success) {
            this.saveLastSyncTime();
        }

        return result;
    }

    /**
     * Pulisce dati sync obsoleti
     */
    async cleanupSyncData() {
        // Rimuovi tentativi vecchi (> 24 ore)
        this.retryAttempts.clear();
        this.syncQueue = [];

        // Pulisci storage da documenti sincronizzati vecchi
        await this.storage.cleanup(7); // 7 giorni

        console.log('🧹 Cleanup dati sync completato');
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * RPC helper
     */
    async rpc(route, params = {}) {
        return window.RaccoltaApp.rpc(route, params);
    }
}

export { SyncManager };
