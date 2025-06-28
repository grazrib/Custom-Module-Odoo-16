/**
 * Gestione Storage Offline con IndexedDB + fallback localStorage
 * Pattern simile al Point of Sale ma ottimizzato per raccolta ordini
 */

class OfflineStorage {
    constructor() {
        this.dbName = 'RaccoltaOrdersDB';
        this.dbVersion = 1;
        this.db = null;
        this.isSupported = this.checkSupport();
    }

    /**
     * Verifica supporto IndexedDB
     */
    checkSupport() {
        return 'indexedDB' in window &&
               'localStorage' in window &&
               'sessionStorage' in window;
    }

    /**
     * Inizializza database IndexedDB
     */
    async initialize() {
        if (!this.isSupported) {
            console.warn('IndexedDB non supportato, usando localStorage');
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store per ordini
                if (!db.objectStoreNames.contains('orders')) {
                    const ordersStore = db.createObjectStore('orders', { keyPath: 'local_id' });
                    ordersStore.createIndex('sync_status', 'sync_status', { unique: false });
                    ordersStore.createIndex('date_order', 'date_order', { unique: false });
                    ordersStore.createIndex('agent_id', 'agent_id', { unique: false });
                }

                // Store per picking
                if (!db.objectStoreNames.contains('pickings')) {
                    const pickingsStore = db.createObjectStore('pickings', { keyPath: 'local_id' });
                    pickingsStore.createIndex('order_local_id', 'order_local_id', { unique: false });
                    pickingsStore.createIndex('sync_status', 'sync_status', { unique: false });
                }

                // Store per DDT
                if (!db.objectStoreNames.contains('ddts')) {
                    const ddtsStore = db.createObjectStore('ddts', { keyPath: 'local_id' });
                    ddtsStore.createIndex('picking_local_id', 'picking_local_id', { unique: false });
                    ddtsStore.createIndex('sync_status', 'sync_status', { unique: false });
                }

                // Store per partners (clienti)
                if (!db.objectStoreNames.contains('partners')) {
                    const partnersStore = db.createObjectStore('partners', { keyPath: 'id' });
                    partnersStore.createIndex('name', 'name', { unique: false });
                    partnersStore.createIndex('customer_rank', 'customer_rank', { unique: false });
                }

                // Store per prodotti
                if (!db.objectStoreNames.contains('products')) {
                    const productsStore = db.createObjectStore('products', { keyPath: 'id' });
                    productsStore.createIndex('name', 'name', { unique: false });
                    productsStore.createIndex('default_code', 'default_code', { unique: false });
                    productsStore.createIndex('sale_ok', 'sale_ok', { unique: false });
                }

                // Store per configurazioni
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }

                // Store per sessioni
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'id' });
                }

                // Store per contatori
                if (!db.objectStoreNames.contains('counters')) {
                    const countersStore = db.createObjectStore('counters', { keyPath: 'key' });
                    countersStore.createIndex('agent_id', 'agent_id', { unique: false });
                }
            };
        });
    }

    // === GESTIONE ORDINI ===

    /**
     * Salva ordine in storage
     */
    async saveOrder(order) {
        order.last_update = new Date().toISOString();

        if (this.db) {
            return this.saveToIndexedDB('orders', order);
        } else {
            return this.saveToLocalStorage('orders', order.local_id, order);
        }
    }

    /**
     * Recupera ordine per local_id
     */
    async getOrder(localId) {
        if (this.db) {
            return this.getFromIndexedDB('orders', localId);
        } else {
            return this.getFromLocalStorage('orders', localId);
        }
    }

    /**
     * Recupera tutti gli ordini
     */
    async getAllOrders() {
        if (this.db) {
            return this.getAllFromIndexedDB('orders');
        } else {
            return this.getAllFromLocalStorage('orders');
        }
    }

    /**
     * Recupera ordini da sincronizzare
     */
    async getPendingOrders() {
        if (this.db) {
            return this.getIndexedData('orders', 'sync_status', 'pending');
        } else {
            const orders = await this.getAllOrders();
            return orders.filter(order => order.sync_status === 'pending');
        }
    }

    /**
     * Marca ordine come sincronizzato
     */
    async markOrderAsSynced(localId, odooId = null) {
        const order = await this.getOrder(localId);
        if (order) {
            order.sync_status = 'synced';
            order.odoo_id = odooId;
            order.synced_at = new Date().toISOString();
            await this.saveOrder(order);
        }
    }

    // === GESTIONE PICKING ===

    async savePicking(picking) {
        picking.last_update = new Date().toISOString();

        if (this.db) {
            return this.saveToIndexedDB('pickings', picking);
        } else {
            return this.saveToLocalStorage('pickings', picking.local_id, picking);
        }
    }

    async getPicking(localId) {
        if (this.db) {
            return this.getFromIndexedDB('pickings', localId);
        } else {
            return this.getFromLocalStorage('pickings', localId);
        }
    }

    async getPickingsByOrder(orderLocalId) {
        if (this.db) {
            return this.getIndexedData('pickings', 'order_local_id', orderLocalId);
        } else {
            const pickings = await this.getAllFromLocalStorage('pickings');
            return pickings.filter(p => p.order_local_id === orderLocalId);
        }
    }

    // === GESTIONE DDT ===

    async saveDdt(ddt) {
        ddt.last_update = new Date().toISOString();

        if (this.db) {
            return this.saveToIndexedDB('ddts', ddt);
        } else {
            return this.saveToLocalStorage('ddts', ddt.local_id, ddt);
        }
    }

    async getDdt(localId) {
        if (this.db) {
            return this.getFromIndexedDB('ddts', localId);
        } else {
            return this.getFromLocalStorage('ddts', localId);
        }
    }

    async getDdtsByPicking(pickingLocalId) {
        if (this.db) {
            return this.getIndexedData('ddts', 'picking_local_id', pickingLocalId);
        } else {
            const ddts = await this.getAllFromLocalStorage('ddts');
            return ddts.filter(d => d.picking_local_id === pickingLocalId);
        }
    }

    // === GESTIONE PARTNERS ===

    async savePartners(partners) {
        if (this.db) {
            const transaction = this.db.transaction(['partners'], 'readwrite');
            const store = transaction.objectStore('partners');

            for (const partner of partners) {
                await store.put(partner);
            }

            return transaction.complete;
        } else {
            localStorage.setItem('raccolta_partners', JSON.stringify(partners));
            localStorage.setItem('raccolta_partners_updated', new Date().toISOString());
        }
    }

    async getPartners() {
        if (this.db) {
            return this.getAllFromIndexedDB('partners');
        } else {
            const stored = localStorage.getItem('raccolta_partners');
            return stored ? JSON.parse(stored) : [];
        }
    }

    async searchPartners(query) {
        const partners = await this.getPartners();
        const lowQuery = query.toLowerCase();

        return partners.filter(partner =>
            partner.name.toLowerCase().includes(lowQuery) ||
            (partner.vat && partner.vat.toLowerCase().includes(lowQuery)) ||
            (partner.email && partner.email.toLowerCase().includes(lowQuery))
        );
    }

    // === GESTIONE PRODOTTI ===

    async saveProducts(products) {
        if (this.db) {
            const transaction = this.db.transaction(['products'], 'readwrite');
            const store = transaction.objectStore('products');

            for (const product of products) {
                await store.put(product);
            }

            return transaction.complete;
        } else {
            localStorage.setItem('raccolta_products', JSON.stringify(products));
            localStorage.setItem('raccolta_products_updated', new Date().toISOString());
        }
    }

    async getProducts() {
        if (this.db) {
            return this.getAllFromIndexedDB('products');
        } else {
            const stored = localStorage.getItem('raccolta_products');
            return stored ? JSON.parse(stored) : [];
        }
    }

    async searchProducts(query) {
        const products = await this.getProducts();
        const lowQuery = query.toLowerCase();

        return products.filter(product =>
            product.name.toLowerCase().includes(lowQuery) ||
            (product.default_code && product.default_code.toLowerCase().includes(lowQuery)) ||
            (product.barcode && product.barcode.includes(query))
        );
    }

    async getProductById(productId) {
        if (this.db) {
            return this.getFromIndexedDB('products', productId);
        } else {
            const products = await this.getProducts();
            return products.find(p => p.id === productId);
        }
    }

    // === GESTIONE CONFIGURAZIONI ===

    async saveConfig(config) {
        const configData = {
            key: 'main_config',
            data: config,
            updated_at: new Date().toISOString()
        };

        if (this.db) {
            return this.saveToIndexedDB('config', configData);
        } else {
            localStorage.setItem('raccolta_config', JSON.stringify(configData));
        }
    }

    async getConfig() {
        if (this.db) {
            const result = await this.getFromIndexedDB('config', 'main_config');
            return result ? result.data : null;
        } else {
            const stored = localStorage.getItem('raccolta_config');
            if (stored) {
                const parsed = JSON.parse(stored);
                return parsed.data;
            }
            return null;
        }
    }

    async saveDdtConfig(ddtConfig) {
        const configData = {
            key: 'ddt_config',
            data: ddtConfig,
            updated_at: new Date().toISOString()
        };

        if (this.db) {
            return this.saveToIndexedDB('config', configData);
        } else {
            localStorage.setItem('raccolta_ddt_config', JSON.stringify(configData));
        }
    }

    async getDdtConfig() {
        if (this.db) {
            const result = await this.getFromIndexedDB('config', 'ddt_config');
            return result ? result.data : null;
        } else {
            const stored = localStorage.getItem('raccolta_ddt_config');
            if (stored) {
                const parsed = JSON.parse(stored);
                return parsed.data;
            }
            return null;
        }
    }

    // === GESTIONE SESSIONI ===

    async saveSession(session) {
        session.updated_at = new Date().toISOString();

        if (this.db) {
            return this.saveToIndexedDB('sessions', session);
        } else {
            sessionStorage.setItem('raccolta_current_session', JSON.stringify(session));
        }
    }

    async getSession() {
        if (this.db) {
            // Cerca sessione attiva più recente
            const sessions = await this.getAllFromIndexedDB('sessions');
            return sessions.find(s => s.state === 'opened') || sessions[sessions.length - 1];
        } else {
            const stored = sessionStorage.getItem('raccolta_current_session');
            return stored ? JSON.parse(stored) : null;
        }
    }

    // === GESTIONE CONTATORI ===

    async saveCounter(key, value, agentId) {
        const counterData = {
            key: key,
            value: value,
            agent_id: agentId,
            updated_at: new Date().toISOString()
        };

        if (this.db) {
            return this.saveToIndexedDB('counters', counterData);
        } else {
            const counters = this.getCountersFromStorage();
            counters[key] = counterData;
            localStorage.setItem('raccolta_counters', JSON.stringify(counters));
        }
    }

    async getCounter(key) {
        if (this.db) {
            return this.getFromIndexedDB('counters', key);
        } else {
            const counters = this.getCountersFromStorage();
            return counters[key] || null;
        }
    }

    async getAllCounters(agentId = null) {
        if (this.db) {
            if (agentId) {
                return this.getIndexedData('counters', 'agent_id', agentId);
            } else {
                return this.getAllFromIndexedDB('counters');
            }
        } else {
            const counters = this.getCountersFromStorage();
            const result = Object.values(counters);

            if (agentId) {
                return result.filter(c => c.agent_id === agentId);
            }
            return result;
        }
    }

    getCountersFromStorage() {
        const stored = localStorage.getItem('raccolta_counters');
        return stored ? JSON.parse(stored) : {};
    }

    // === METODI HELPER INDEXEDDB ===

    async saveToIndexedDB(storeName, data) {
        if (!this.db) return false;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getFromIndexedDB(storeName, key) {
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getAllFromIndexedDB(storeName) {
        if (!this.db) return [];

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    }

    async getIndexedData(storeName, indexName, value) {
        if (!this.db) return [];

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    }

    // === METODI HELPER LOCALSTORAGE ===

    async saveToLocalStorage(category, key, data) {
        try {
            const storageKey = `raccolta_${category}`;
            const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
            existing[key] = data;
            localStorage.setItem(storageKey, JSON.stringify(existing));
            return true;
        } catch (error) {
            console.error('Errore salvataggio localStorage:', error);
            return false;
        }
    }

    async getFromLocalStorage(category, key) {
        try {
            const storageKey = `raccolta_${category}`;
            const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return existing[key] || null;
        } catch (error) {
            console.error('Errore lettura localStorage:', error);
            return null;
        }
    }

    async getAllFromLocalStorage(category) {
        try {
            const storageKey = `raccolta_${category}`;
            const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return Object.values(existing);
        } catch (error) {
            console.error('Errore lettura localStorage:', error);
            return [];
        }
    }

    // === UTILITY ===

    /**
     * Pulisce storage vecchio
     */
    async cleanup(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        const cutoffISO = cutoffDate.toISOString();

        // Pulisce ordini vecchi sincronizzati
        const orders = await this.getAllOrders();
        const ordersToKeep = orders.filter(order =>
            order.sync_status === 'pending' ||
            order.synced_at > cutoffISO
        );

        // Risalva solo quelli da tenere
        if (this.db) {
            const transaction = this.db.transaction(['orders'], 'readwrite');
            const store = transaction.objectStore(storeName);
            await store.clear();

            for (const order of ordersToKeep) {
                await store.put(order);
            }
        } else {
            const storageKey = 'raccolta_orders';
            const ordersMap = {};
            ordersToKeep.forEach(order => {
                ordersMap[order.local_id] = order;
            });
            localStorage.setItem(storageKey, JSON.stringify(ordersMap));
        }
    }

    /**
     * Calcola dimensione storage utilizzato
     */
    async getStorageSize() {
        if (this.db) {
            // Stima approssimativa per IndexedDB
            const orders = await this.getAllOrders();
            const partners = await this.getPartners();
            const products = await this.getProducts();

            const totalItems = orders.length + partners.length + products.length;
            return {
                estimated: true,
                items: totalItems,
                size_mb: Math.round(totalItems * 0.5) // ~0.5KB per item
            };
        } else {
            // Calcolo preciso per localStorage
            let totalSize = 0;
            for (let key in localStorage) {
                if (key.startsWith('raccolta_')) {
                    totalSize += localStorage[key].length;
                }
            }

            return {
                estimated: false,
                size_bytes: totalSize,
                size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100
            };
        }
    }

    /**
     * Esporta tutti i dati per backup
     */
    async exportAllData() {
        const data = {
            timestamp: new Date().toISOString(),
            orders: await this.getAllOrders(),
            partners: await this.getPartners(),
            products: await this.getProducts(),
            config: await this.getConfig(),
            session: await this.getSession(),
            counters: await this.getAllCounters()
        };

        return data;
    }

    /**
     * Importa dati da backup
     */
    async importAllData(backupData) {
        if (backupData.orders) {
            for (const order of backupData.orders) {
                await this.saveOrder(order);
            }
        }

        if (backupData.partners) {
            await this.savePartners(backupData.partners);
        }

        if (backupData.products) {
            await this.saveProducts(backupData.products);
        }

        if (backupData.config) {
            await this.saveConfig(backupData.config);
        }

        if (backupData.session) {
            await this.saveSession(backupData.session);
        }

        return true;
    }
}

export { OfflineStorage };
