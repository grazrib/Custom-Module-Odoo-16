/**
 * Dashboard Screen - Schermata principale dell'applicazione
 * Mostra statistiche, ordini recenti e azioni rapide
 */

class DashboardScreen {
    constructor() {
        this.container = null;
        this.data = {
            stats: {},
            recentOrders: [],
            syncStatus: {},
            counters: {}
        };
        this.refreshInterval = null;
    }

    /**
     * Inizializza dashboard
     */
    async initialize(container) {
        this.container = container;

        // Carica dati iniziali
        await this.loadData();

        // Render UI
        this.render();

        // Bind eventi
        this.bindEvents();

        // Avvia auto-refresh
        this.startAutoRefresh();

        console.log('📊 Dashboard inizializzata');
    }

    /**
     * Carica dati dashboard
     */
    async loadData() {
        try {
            const app = window.RaccoltaApp;
            const storage = app.getModel('storage');
            const sync = app.getModel('sync');
            const counter = app.getModel('counter');

            // Carica statistiche
            this.data.stats = await this.loadStats(storage);

            // Carica ordini recenti
            this.data.recentOrders = await this.loadRecentOrders(storage);

            // Carica stato sincronizzazione
            this.data.syncStatus = await sync.getSyncStats();

            // Carica statistiche contatori
            this.data.counters = counter.getCounterStats();

        } catch (error) {
            console.error('Errore caricamento dati dashboard:', error);
        }
    }

    /**
     * Carica statistiche generali
     */
    async loadStats(storage) {
        const orders = await storage.getAllOrders();
        const session = await storage.getSession();

        // Filtra ordini della sessione corrente
        const sessionOrders = orders.filter(o => o.raccolta_session_id === session?.id);

        // Calcola statistiche
        const today = new Date().toISOString().split('T')[0];
        const todayOrders = sessionOrders.filter(o => o.date_order?.startsWith(today));

        const totalAmount = sessionOrders.reduce((sum, order) => sum + (order.amount_total || 0), 0);
        const avgOrderValue = sessionOrders.length > 0 ? totalAmount / sessionOrders.length : 0;

        return {
            total_orders: sessionOrders.length,
            today_orders: todayOrders.length,
            total_amount: totalAmount,
            avg_order_value: avgOrderValue,
            session_duration: this.calculateSessionDuration(session),
            orders_per_hour: this.calculateOrdersPerHour(sessionOrders, session)
        };
    }

    /**
     * Carica ordini recenti
     */
    async loadRecentOrders(storage) {
        const orders = await storage.getAllOrders();

        // Ordina per data più recente e prendi i primi 5
        return orders
            .sort((a, b) => new Date(b.date_order) - new Date(a.date_order))
            .slice(0, 5)
            .map(order => ({
                local_id: order.local_id,
                name: order.name,
                partner_name: order.partner_name || 'Cliente',
                amount_total: order.amount_total || 0,
                state: order.state,
                sync_status: order.sync_status,
                date_order: order.date_order,
                has_ddt: !!(order.ddt_ids && order.ddt_ids.length > 0)
            }));
    }

    /**
     * Render dashboard UI
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="dashboard-screen">
                <!-- Header con informazioni sessione -->
                <div class="dashboard-header">
                    <div class="session-info">
                        <h2>Dashboard Raccolta Ordini</h2>
                        <div class="session-details">
                            <span class="session-name">${this.getSessionName()}</span>
                            <span class="session-status ${this.getSessionStatusClass()}">${this.getSessionStatus()}</span>
                        </div>
                    </div>

                    <div class="network-status">
                        <span class="network-indicator ${this.getNetworkClass()}" id="network-status">
                            ${this.getNetworkStatus()}
                        </span>
                    </div>
                </div>

                <!-- Statistiche principali -->
                <div class="stats-grid">
                    ${this.renderStatsCards()}
                </div>

                <!-- Azioni rapide -->
                <div class="quick-actions">
                    <h3>Azioni Rapide</h3>
                    <div class="action-buttons">
                        ${this.renderActionButtons()}
                    </div>
                </div>

                <!-- Ordini recenti -->
                <div class="recent-orders">
                    <h3>Ordini Recenti</h3>
                    <div class="orders-list">
                        ${this.renderRecentOrders()}
                    </div>
                </div>

                <!-- Stato sincronizzazione -->
                <div class="sync-status">
                    <h3>Stato Sincronizzazione</h3>
                    <div class="sync-info">
                        ${this.renderSyncStatus()}
                    </div>
                </div>

                <!-- Footer con azioni sistema -->
                <div class="dashboard-footer">
                    ${this.renderFooterActions()}
                </div>
            </div>
        `;

        // Applica stili dinamici
        this.applyStyles();
    }

    /**
     * Render cards statistiche
     */
    renderStatsCards() {
        const stats = this.data.stats;

        return `
            <div class="stat-card primary">
                <div class="stat-icon">📋</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.total_orders || 0}</div>
                    <div class="stat-label">Ordini Totali</div>
                </div>
            </div>

            <div class="stat-card success">
                <div class="stat-icon">📅</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.today_orders || 0}</div>
                    <div class="stat-label">Ordini Oggi</div>
                </div>
            </div>

            <div class="stat-card info">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="stat-number">€${this.formatCurrency(stats.total_amount || 0)}</div>
                    <div class="stat-label">Fatturato</div>
                </div>
            </div>

            <div class="stat-card warning">
                <div class="stat-icon">📊</div>
                <div class="stat-content">
                    <div class="stat-number">€${this.formatCurrency(stats.avg_order_value || 0)}</div>
                    <div class="stat-label">Valore Medio</div>
                </div>
            </div>

            <div class="stat-card secondary">
                <div class="stat-icon">⏱️</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.session_duration || '0h'}</div>
                    <div class="stat-label">Durata Sessione</div>
                </div>
            </div>

            <div class="stat-card accent">
                <div class="stat-icon">🚀</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.orders_per_hour || 0}</div>
                    <div class="stat-label">Ordini/Ora</div>
                </div>
            </div>
        `;
    }

    /**
     * Render pulsanti azioni rapide
     */
    renderActionButtons() {
        return `
            <button class="action-btn primary" data-action="new-order">
                <i class="icon">➕</i>
                <span>Nuovo Ordine</span>
            </button>

            <button class="action-btn secondary" data-action="view-orders">
                <i class="icon">📋</i>
                <span>Visualizza Ordini</span>
            </button>

            <button class="action-btn info" data-action="sync-data">
                <i class="icon">🔄</i>
                <span>Sincronizza</span>
                ${this.data.syncStatus.pending_sync > 0 ?
                    `<span class="badge">${this.data.syncStatus.pending_sync}</span>` : ''}
            </button>

            <button class="action-btn success" data-action="print-test">
                <i class="icon">🖨️</i>
                <span>Test Stampa</span>
            </button>

            <button class="action-btn warning" data-action="export-data">
                <i class="icon">📤</i>
                <span>Export Dati</span>
            </button>

            <button class="action-btn accent" data-action="settings">
                <i class="icon">⚙️</i>
                <span>Impostazioni</span>
            </button>
        `;
    }

    /**
     * Render lista ordini recenti
     */
    renderRecentOrders() {
        if (this.data.recentOrders.length === 0) {
            return '<div class="empty-state">Nessun ordine recente</div>';
        }

        return this.data.recentOrders.map(order => `
            <div class="order-item" data-order-id="${order.local_id}">
                <div class="order-info">
                    <div class="order-name">${order.name}</div>
                    <div class="order-client">${order.partner_name}</div>
                    <div class="order-date">${this.formatDateTime(order.date_order)}</div>
                </div>

                <div class="order-amount">
                    €${this.formatCurrency(order.amount_total)}
                </div>

                <div class="order-status">
                    <span class="status-badge ${order.state}">${this.getOrderStateLabel(order.state)}</span>
                    <span class="sync-badge ${order.sync_status}">${this.getSyncStatusLabel(order.sync_status)}</span>
                    ${order.has_ddt ? '<span class="ddt-badge">DDT</span>' : ''}
                </div>

                <div class="order-actions">
                    <button class="btn-icon" data-action="view-order" title="Visualizza">👁️</button>
                    <button class="btn-icon" data-action="print-receipt" title="Stampa">🖨️</button>
                    <button class="btn-icon" data-action="edit-order" title="Modifica">✏️</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render stato sincronizzazione
     */
    renderSyncStatus() {
        const sync = this.data.syncStatus;

        return `
            <div class="sync-stats">
                <div class="sync-stat">
                    <span class="sync-label">Totale Ordini:</span>
                    <span class="sync-value">${sync.total_orders || 0}</span>
                </div>

                <div class="sync-stat">
                    <span class="sync-label">Da Sincronizzare:</span>
                    <span class="sync-value ${sync.pending_sync > 0 ? 'warning' : 'success'}">
                        ${sync.pending_sync || 0}
                    </span>
                </div>

                <div class="sync-stat">
                    <span class="sync-label">Sincronizzati:</span>
                    <span class="sync-value success">${sync.synced || 0}</span>
                </div>

                <div class="sync-stat">
                    <span class="sync-label">Errori:</span>
                    <span class="sync-value ${sync.errors > 0 ? 'error' : ''}">${sync.errors || 0}</span>
                </div>
            </div>

            <div class="sync-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${sync.sync_percentage || 0}%"></div>
                </div>
                <div class="progress-text">${sync.sync_percentage || 0}% sincronizzato</div>
            </div>

            <div class="sync-actions">
                <button class="btn-sync ${sync.is_syncing ? 'syncing' : ''}"
                        data-action="force-sync"
                        ${sync.is_syncing ? 'disabled' : ''}>
                    ${sync.is_syncing ? '🔄 Sincronizzazione...' : '🔄 Sincronizza Ora'}
                </button>

                <div class="sync-info-text">
                    ${sync.last_sync ?
                        `Ultima sync: ${this.formatDateTime(sync.last_sync)}` :
                        'Mai sincronizzato'}
                </div>
            </div>
        `;
    }

    /**
     * Render azioni footer
     */
    renderFooterActions() {
        return `
            <div class="footer-left">
                <button class="btn-footer" data-action="reload-data">
                    🔄 Aggiorna Dati
                </button>

                <button class="btn-footer" data-action="clear-cache">
                    🗑️ Pulisci Cache
                </button>
            </div>

            <div class="footer-center">
                <div class="app-info">
                    Raccolta Ordini v1.0.0 |
                    Agente: ${this.getAgentCode()} |
                    ${this.getNetworkStatus()}
                </div>
            </div>

            <div class="footer-right">
                <button class="btn-footer" data-action="help">
                    ❓ Aiuto
                </button>

                <button class="btn-footer" data-action="about">
                    ℹ️ Info
                </button>
            </div>
        `;
    }

    /**
     * Bind eventi dashboard
     */
    bindEvents() {
        if (!this.container) return;

        // Eventi azioni rapide
        this.container.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action) {
                this.handleAction(action, e.target);
            }
        });

        // Eventi ordini
        this.container.addEventListener('click', (e) => {
            const orderItem = e.target.closest('.order-item');
            if (orderItem) {
                const orderId = orderItem.dataset.orderId;
                const action = e.target.closest('[data-action]')?.dataset.action;

                if (action) {
                    this.handleOrderAction(action, orderId);
                }
            }
        });

        // Eventi sync progress
        window.addEventListener('raccolta-sync-progress', (e) => {
            this.updateSyncProgress(e.detail);
        });

        // Eventi network status
        window.addEventListener('online', () => this.updateNetworkStatus(true));
        window.addEventListener('offline', () => this.updateNetworkStatus(false));
    }

    /**
     * Gestisce azioni dashboard
     */
    async handleAction(action, target) {
        const app = window.RaccoltaApp;

        try {
            switch (action) {
                case 'new-order':
                    app.showScreen('order_screen');
                    break;

                case 'view-orders':
                    app.showScreen('order_list');
                    break;

                case 'sync-data':
                    await this.syncData();
                    break;

                case 'print-test':
                    await this.printTestReceipt();
                    break;

                case 'export-data':
                    await this.exportData();
                    break;

                case 'settings':
                    app.showScreen('settings');
                    break;

                case 'reload-data':
                    await this.reloadData();
                    break;

                case 'clear-cache':
                    await this.clearCache();
                    break;

                case 'force-sync':
                    await this.forceSyncAll();
                    break;

                case 'help':
                    this.showHelp();
                    break;

                case 'about':
                    this.showAbout();
                    break;

                default:
                    console.warn('Azione non riconosciuta:', action);
            }
        } catch (error) {
            console.error(`Errore esecuzione azione ${action}:`, error);
            app.getModel('notification').error(`Errore: ${error.message}`);
        }
    }

    /**
     * Gestisce azioni su ordini
     */
    async handleOrderAction(action, orderId) {
        const app = window.RaccoltaApp;

        try {
            switch (action) {
                case 'view-order':
                    app.showScreen('order_detail', { orderId });
                    break;

                case 'edit-order':
                    app.showScreen('order_screen', { orderId, mode: 'edit' });
                    break;

                case 'print-receipt':
                    await this.printOrderReceipt(orderId);
                    break;

                default:
                    console.warn('Azione ordine non riconosciuta:', action);
            }
        } catch (error) {
            console.error(`Errore azione ordine ${action}:`, error);
            app.getModel('notification').error(`Errore: ${error.message}`);
        }
    }

    // === AZIONI DASHBOARD ===

    /**
     * Sincronizza dati
     */
    async syncData() {
        const sync = window.RaccoltaApp.getModel('sync');
        const notification = window.RaccoltaApp.getModel('notification');

        if (!navigator.onLine) {
            notification.warning('Connessione offline - impossibile sincronizzare');
            return;
        }

        notification.info('Avvio sincronizzazione...');

        const result = await sync.syncPendingData();

        if (result.success) {
            notification.success(`Sincronizzati ${result.synced} documenti`);
            await this.reloadData();
        } else {
            notification.error(`Errore sincronizzazione: ${result.error}`);
        }
    }

    /**
     * Forza sincronizzazione completa
     */
    async forceSyncAll() {
        const sync = window.RaccoltaApp.getModel('sync');
        const notification = window.RaccoltaApp.getModel('notification');

        notification.info('Avvio sincronizzazione forzata...');

        const result = await sync.forceSyncAll();

        if (result.success) {
            notification.success('Sincronizzazione forzata completata');
            await this.reloadData();
        } else {
            notification.error(`Errore sincronizzazione forzata: ${result.error}`);
        }
    }

    /**
     * Stampa ricevuta di test
     */
    async printTestReceipt() {
        const receipt = window.RaccoltaApp.getModel('receipt');
        const notification = window.RaccoltaApp.getModel('notification');

        notification.info('Generazione ricevuta di test...');

        try {
            const result = await receipt.printTestReceipt('48mm');

            if (result.success) {
                notification.success('Ricevuta di test stampata');
            } else {
                notification.error(`Errore stampa test: ${result.error}`);
            }
        } catch (error) {
            notification.error(`Errore stampa test: ${error.message}`);
        }
    }

    /**
     * Stampa ricevuta ordine
     */
    async printOrderReceipt(orderId) {
        const receipt = window.RaccoltaApp.getModel('receipt');
        const notification = window.RaccoltaApp.getModel('notification');

        notification.info('Stampa ricevuta...');

        try {
            const result = await receipt.generateCompleteReceipt(orderId);

            if (result.success) {
                notification.success('Ricevuta stampata');
            } else {
                notification.error(`Errore stampa: ${result.error}`);
            }
        } catch (error) {
            notification.error(`Errore stampa: ${error.message}`);
        }
    }

    /**
     * Export dati
     */
    async exportData() {
        const storage = window.RaccoltaApp.getModel('storage');
        const notification = window.RaccoltaApp.getModel('notification');

        try {
            notification.info('Export dati in corso...');

            const data = await storage.exportAllData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `raccolta_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();

            URL.revokeObjectURL(url);

            notification.success('Dati esportati con successo');

        } catch (error) {
            notification.error(`Errore export: ${error.message}`);
        }
    }

    /**
     * Ricarica dati dashboard
     */
    async reloadData() {
        const notification = window.RaccoltaApp.getModel('notification');

        try {
            notification.info('Ricaricamento dati...');

            await this.loadData();
            this.render();

            notification.success('Dati aggiornati');

        } catch (error) {
            notification.error(`Errore ricaricamento: ${error.message}`);
        }
    }

    /**
     * Pulisce cache
     */
    async clearCache() {
        const notification = window.RaccoltaApp.getModel('notification');

        if (!confirm('Sei sicuro di voler pulire la cache? Questo rimuoverà tutti i dati offline.')) {
            return;
        }

        try {
            notification.info('Pulizia cache...');

            // Pulisce localStorage
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('raccolta_')) {
                    localStorage.removeItem(key);
                }
            });

            // Pulisce sessionStorage
            Object.keys(sessionStorage).forEach(key => {
                if (key.startsWith('raccolta_')) {
                    sessionStorage.removeItem(key);
                }
            });

            // Ricarica app
            window.location.reload();

        } catch (error) {
            notification.error(`Errore pulizia cache: ${error.message}`);
        }
    }

    /**
     * Mostra aiuto
     */
    showHelp() {
        const helpContent = `
            <div class="help-modal">
                <h3>Aiuto Raccolta Ordini</h3>

                <div class="help-section">
                    <h4>🚀 Come iniziare</h4>
                    <ul>
                        <li>Clicca "Nuovo Ordine" per creare un ordine</li>
                        <li>Seleziona cliente e prodotti</li>
                        <li>Stampa la ricevuta</li>
                        <li>Sincronizza quando sei online</li>
                    </ul>
                </div>

                <div class="help-section">
                    <h4>🔄 Sincronizzazione</h4>
                    <ul>
                        <li>I documenti si sincronizzano automaticamente quando sei online</li>
                        <li>Usa "Sincronizza Ora" per forzare la sincronizzazione</li>
                        <li>I documenti non sincronizzati sono evidenziati</li>
                    </ul>
                </div>

                <div class="help-section">
                    <h4>🖨️ Stampa</h4>
                    <ul>
                        <li>Supporta stampanti termiche 48mm e 80mm</li>
                        <li>Usa "Test Stampa" per verificare la configurazione</li>
                        <li>Le ricevute includono dati DDT se presenti</li>
                    </ul>
                </div>

                <div class="help-section">
                    <h4>📱 Modalità Offline</h4>
                    <ul>
                        <li>L'app funziona completamente offline</li>
                        <li>I dati vengono salvati localmente</li>
                        <li>La sincronizzazione avviene quando torni online</li>
                    </ul>
                </div>
            </div>
        `;

        this.showModal('Aiuto', helpContent);
    }

    /**
     * Mostra informazioni app
     */
    showAbout() {
        const session = window.RaccoltaApp.getSession();
        const config = window.RaccoltaApp.getConfig();

        const aboutContent = `
            <div class="about-modal">
                <h3>Raccolta Ordini Offline</h3>

                <div class="about-info">
                    <div class="about-row">
                        <span class="about-label">Versione:</span>
                        <span class="about-value">1.0.0</span>
                    </div>

                    <div class="about-row">
                        <span class="about-label">Sessione:</span>
                        <span class="about-value">${session?.name || 'Non disponibile'}</span>
                    </div>

                    <div class="about-row">
                        <span class="about-label">Agente:</span>
                        <span class="about-value">${this.getAgentCode()}</span>
                    </div>

                    <div class="about-row">
                        <span class="about-label">Configurazione:</span>
                        <span class="about-value">${config?.name || 'Default'}</span>
                    </div>

                    <div class="about-row">
                        <span class="about-label">Storage:</span>
                        <span class="about-value">${this.getStorageInfo()}</span>
                    </div>

                    <div class="about-row">
                        <span class="about-label">Network:</span>
                        <span class="about-value">${this.getNetworkStatus()}</span>
                    </div>
                </div>

                <div class="about-footer">
                    <p>Sviluppato per la raccolta ordini offline con gestione DDT integrata.</p>
                </div>
            </div>
        `;

        this.showModal('Informazioni', aboutContent);
    }

    // === UTILITY ===

    /**
     * Avvia auto-refresh
     */
    startAutoRefresh() {
        // Refresh ogni 30 secondi
        this.refreshInterval = setInterval(async () => {
            await this.loadData();
            this.updateStats();
        }, 30000);
    }

    /**
     * Ferma auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Aggiorna solo le statistiche senza re-render completo
     */
    updateStats() {
        const statsGrid = this.container?.querySelector('.stats-grid');
        if (statsGrid) {
            statsGrid.innerHTML = this.renderStatsCards();
        }
    }

    /**
     * Aggiorna stato sync in tempo reale
     */
    updateSyncProgress(progressData) {
        const syncStatus = this.container?.querySelector('.sync-status');
        if (!syncStatus) return;

        if (progressData.type === 'progress') {
            // Aggiorna barra di progresso
            const progressBar = syncStatus.querySelector('.progress-fill');
            const progressText = syncStatus.querySelector('.progress-text');

            if (progressBar && progressData.total > 0) {
                const percentage = (progressData.current / progressData.total) * 100;
                progressBar.style.width = `${percentage}%`;
                progressText.textContent = `${Math.round(percentage)}% - ${progressData.message}`;
            }
        } else if (progressData.type === 'completed') {
            // Ricarica sezione sync
            setTimeout(() => {
                this.loadData().then(() => {
                    const syncInfo = syncStatus.querySelector('.sync-info');
                    if (syncInfo) {
                        syncInfo.innerHTML = this.renderSyncStatus();
                    }
                });
            }, 1000);
        }
    }

    /**
     * Aggiorna indicatore rete
     */
    updateNetworkStatus(isOnline) {
        const indicator = this.container?.querySelector('#network-status');
        if (indicator) {
            indicator.className = `network-indicator ${isOnline ? 'online' : 'offline'}`;
            indicator.textContent = isOnline ? '🟢 Online' : '🔴 Offline';
        }
    }

    /**
     * Mostra modal generico
     */
    showModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">✕</button>
                </div>
                <div class="modal-content">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-close">Chiudi</button>
                </div>
            </div>
        `;

        // Bind chiusura
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay') ||
                e.target.classList.contains('modal-close') ||
                e.target.classList.contains('btn-modal-close')) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
    }

    // === GETTER HELPER ===

    getSessionName() {
        const session = window.RaccoltaApp.getSession();
        return session?.name || 'Sessione Non Trovata';
    }

    getSessionStatus() {
        const session = window.RaccoltaApp.getSession();
        return session?.state === 'opened' ? 'Attiva' : 'Chiusa';
    }

    getSessionStatusClass() {
        const session = window.RaccoltaApp.getSession();
        return session?.state === 'opened' ? 'active' : 'inactive';
    }

    getNetworkStatus() {
        return navigator.onLine ? '🟢 Online' : '🔴 Offline';
    }

    getNetworkClass() {
        return navigator.onLine ? 'online' : 'offline';
    }

    getAgentCode() {
        const session = window.RaccoltaApp.getSession();
        const counter = window.RaccoltaApp.getModel('counter');
        return counter?.agentCode || session?.agent_code || 'AG001';
    }

    getStorageInfo() {
        return 'IndexedDB + localStorage';
    }

    getOrderStateLabel(state) {
        const labels = {
            draft: 'Bozza',
            sent: 'Inviato',
            sale: 'Confermato',
            done: 'Completato',
            cancel: 'Annullato'
        };
        return labels[state] || state;
    }

    getSyncStatusLabel(status) {
        const labels = {
            pending: 'Da Sync',
            synced: 'Sync',
            error: 'Errore'
        };
        return labels[status] || status;
    }

    // === FORMATTAZIONE ===

    formatCurrency(amount) {
        return new Intl.NumberFormat('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    formatDateTime(dateString) {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);
        return new Intl.DateTimeFormat('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    calculateSessionDuration(session) {
        if (!session?.start_at) return '0h';

        const start = new Date(session.start_at);
        const end = session.stop_at ? new Date(session.stop_at) : new Date();
        const duration = Math.floor((end - start) / (1000 * 60 * 60));

        return `${duration}h`;
    }

    calculateOrdersPerHour(orders, session) {
        if (!session?.start_at || orders.length === 0) return 0;

        const start = new Date(session.start_at);
        const end = session.stop_at ? new Date(session.stop_at) : new Date();
        const hours = (end - start) / (1000 * 60 * 60);

        return hours > 0 ? Math.round(orders.length / hours) : 0;
    }

    /**
     * Applica stili CSS per dashboard
     */
    applyStyles() {
        // Gli stili CSS verranno gestiti nel file raccolta.css
        // Questa funzione può essere usata per stili dinamici se necessario
    }

    /**
     * Cleanup quando si cambia schermata
     */
    destroy() {
        this.stopAutoRefresh();

        // Rimuovi event listeners
        window.removeEventListener('raccolta-sync-progress', this.updateSyncProgress);

        console.log('📊 Dashboard distrutta');
    }
}

export { DashboardScreen };
