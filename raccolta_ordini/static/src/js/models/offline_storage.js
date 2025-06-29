/**
 * RACCOLTA ORDINI - OFFLINE STORAGE
 * Gestione storage offline con IndexedDB e fallback localStorage
 */

(function() {
    'use strict';

    /**
     * Classe per gestione storage offline
     */
    class OfflineStorage {
        constructor() {
            this.dbName = 'RaccoltaDB';
            this.dbVersion = 1;
            this.db = null;
            this.isReady = false;
            this.fallbackToLocalStorage = false;

            this.stores = {
                orders: 'orders',
                customers: 'customers',
                products: 'products',
                sessions: 'sessions',
                counters: 'counters',
                config: 'config',
                sync_queue: 'sync_queue'
            };
        }

        /**
         * Inizializza storage
         */
        async init() {
            try {
                await this.initIndexedDB();
                this.isReady = true;
                console.log('Storage offline pronto (IndexedDB)');
            } catch (error) {
                console.warn('IndexedDB non disponibile, uso localStorage:', error);
                this.fallbackToLocalStorage = true;
                this.isReady = true;
                console.log('Storage offline pronto (localStorage)');
            }
        }

        /**
         * Inizializza IndexedDB
         */
        initIndexedDB() {
            return new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    reject(new Error('IndexedDB non supportato'));
                    return;
                }

                const request = window.indexedDB.open(this.dbName, this.dbVersion);

                request.onerror = () => {
                    reject(new Error('Errore apertura IndexedDB'));
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    // Store ordini
                    if (!db.objectStoreNames.contains(this.stores.orders)) {
                        const ordersStore = db.createObjectStore(this.stores.orders, {
                            keyPath: 'id'
                        });
                        ordersStore.createIndex('local_id', 'local_id', { unique: true });
                        ordersStore.createIndex('sync_status', 'sync_status');
                        ordersStore.createIndex('created_at', 'created_at');
                    }

                    // Store clienti
                    if (!db.objectStoreNames.contains(this.stores.customers)) {
                        const customersStore = db.createObjectStore(this.stores.customers, {
                            keyPath: 'id'
                        });
                        customersStore.createIndex('name', 'name');
                        customersStore.createIndex('vat', 'vat');
                    }

                    // Store prodotti
                    if (!db.objectStoreNames.contains(this.stores.products)) {
                        const productsStore = db.createObjectStore(this.stores.products, {
                            keyPath: 'id'
                        });
                        productsStore.createIndex('name', 'name');
                        productsStore.createIndex('barcode', 'barcode');
                        productsStore.createIndex('category', 'categ_id');
                    }

                    // Store sessioni
                    if (!db.objectStoreNames.contains(this.stores.sessions)) {
                        const sessionsStore = db.createObjectStore(this.stores.sessions, {
                            keyPath: 'id'
                        });
                        sessionsStore.createIndex('user_id', 'user_id');
                        sessionsStore.createIndex('state', 'state');
                    }

                    // Store contatori
                    if (!db.objectStoreNames.contains(this.stores.counters)) {
                        const countersStore = db.createObjectStore(this.stores.counters, {
                            keyPath: 'key'
                        });
                        countersStore.createIndex('user_id', 'user_id');
                        countersStore.createIndex('type', 'type');
                    }

                    // Store configurazione
                    if (!db.objectStoreNames.contains(this.stores.config)) {
                        db.createObjectStore(this.stores.config, {
                            keyPath: 'key'
                        });
                    }

                    // Store coda sincronizzazione
                    if (!db.objectStoreNames.contains(this.stores.sync_queue)) {
                        const syncStore = db.createObjectStore(this.stores.sync_queue, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        syncStore.createIndex('type', 'type');
                        syncStore.createIndex('created_at', 'created_at');
                    }
                };
            });
        }

        /**
         * Salva elemento
         */
        async save(storeName, data) {
            if (!this.isReady) {
                throw new Error('Storage non inizializzato');
            }

            if (this.fallbackToLocalStorage) {
                return this.saveToLocalStorage(storeName, data);
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);

                const request = store.put(data);

                request.onsuccess = () => resolve(data);
                request.onerror = () => reject(new Error('Errore salvataggio'));
            });
        }

        /**
         * Leggi elemento per ID
         */
        async get(storeName, id) {
            if (!this.isReady) {
                throw new Error('Storage non inizializzato');
            }

            if (this.fallbackToLocalStorage) {
                return this.getFromLocalStorage(storeName, id);
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);

                const request = store.get(id);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(new Error('Errore lettura'));
            });
        }

        /**
         * Leggi tutti gli elementi
         */
        async getAll(storeName, limit = null) {
            if (!this.isReady) {
                throw new Error('Storage non inizializzato');
            }

            if (this.fallbackToLocalStorage) {
                return this.getAllFromLocalStorage(storeName, limit);
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);

                const request = limit ? store.getAll(null, limit) : store.getAll();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(new Error('Errore lettura'));
            });
        }

        /**
         * Cerca elementi per indice
         */
        async findByIndex(storeName, indexName, value) {
            if (!this.isReady) {
                throw new Error('Storage non inizializzato');
            }

            if (this.fallbackToLocalStorage) {
                return this.findByIndexLocalStorage(storeName, indexName, value);
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);

                const request = index.getAll(value);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(new Error('Errore ricerca'));
            });
        }

        /**
         * Cancella elemento
         */
        async delete(storeName, id) {
            if (!this.isReady) {
                throw new Error('Storage non inizializzato');
            }

            if (this.fallbackToLocalStorage) {
                return this.deleteFromLocalStorage(storeName, id);
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);

                const request = store.delete(id);

                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(new Error('Errore cancellazione'));
            });
        }

        /**
         * Cancella tutti gli elementi
         */
        async clear(storeName) {
            if (!this.isReady) {
                throw new Error('Storage non inizializzato');
            }

            if (this.fallbackToLocalStorage) {
                return this.clearLocalStorage(storeName);
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);

                const request = store.clear();

                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(new Error('Errore pulizia'));
            });
        }

        // ===== METODI LOCALSTORAGE FALLBACK =====

        /**
         * Salva su localStorage
         */
        saveToLocalStorage(storeName, data) {
            try {
                const key = `raccolta_${storeName}_${data.id}`;
                localStorage.setItem(key, JSON.stringify(data));

                // Aggiorna indice
                this.updateLocalStorageIndex(storeName, data.id);

                return Promise.resolve(data);
            } catch (error) {
                return Promise.reject(error);
            }
        }

        /**
         * Leggi da localStorage
         */
        getFromLocalStorage(storeName, id) {
            try {
                const key = `raccolta_${storeName}_${id}`;
                const data = localStorage.getItem(key);
                return Promise.resolve(data ? JSON.parse(data) : null);
            } catch (error) {
                return Promise.reject(error);
            }
        }

        /**
         * Leggi tutti da localStorage
         */
        getAllFromLocalStorage(storeName, limit = null) {
            try {
                const indexKey = `raccolta_${storeName}_index`;
                const indexData = localStorage.getItem(indexKey);
                const ids = indexData ? JSON.parse(indexData) : [];

                const results = [];
                const maxItems = limit || ids.length;

                for (let i = 0; i < Math.min(maxItems, ids.length); i++) {
                    const key = `raccolta_${storeName}_${ids[i]}`;
                    const data = localStorage.getItem(key);
                    if (data) {
                        results.push(JSON.parse(data));
                    }
                }

                return Promise.resolve(results);
            } catch (error) {
                return Promise.reject(error);
            }
        }

        /**
         * Cerca per indice su localStorage
         */
        findByIndexLocalStorage(storeName, indexName, value) {
            return this.getAllFromLocalStorage(storeName).then(items => {
                return items.filter(item => item[indexName] === value);
            });
        }

        /**
         * Cancella da localStorage
         */
        deleteFromLocalStorage(storeName, id) {
            try {
                const key = `raccolta_${storeName}_${id}`;
                localStorage.removeItem(key);

                // Aggiorna indice
                this.removeFromLocalStorageIndex(storeName, id);

                return Promise.resolve(true);
            } catch (error) {
                return Promise.reject(error);
            }
        }

        /**
         * Pulisci localStorage
         */
        clearLocalStorage(storeName) {
            try {
                const indexKey = `raccolta_${storeName}_index`;
                const indexData = localStorage.getItem(indexKey);
                const ids = indexData ? JSON.parse(indexData) : [];

                // Rimuovi tutti gli elementi
                ids.forEach(id => {
                    const key = `raccolta_${storeName}_${id}`;
                    localStorage.removeItem(key);
                });

                // Rimuovi indice
                localStorage.removeItem(indexKey);

                return Promise.resolve(true);
            } catch (error) {
                return Promise.reject(error);
            }
        }

        /**
         * Aggiorna indice localStorage
         */
        updateLocalStorageIndex(storeName, id) {
            const indexKey = `raccolta_${storeName}_index`;
            const indexData = localStorage.getItem(indexKey);
            const ids = indexData ? JSON.parse(indexData) : [];

            if (!ids.includes(id)) {
                ids.push(id);
                localStorage.setItem(indexKey, JSON.stringify(ids));
            }
        }

        /**
         * Rimuovi da indice localStorage
         */
        removeFromLocalStorageIndex(storeName, id) {
            const indexKey = `raccolta_${storeName}_index`;
            const indexData = localStorage.getItem(indexKey);
            const ids = indexData ? JSON.parse(indexData) : [];

            const index = ids.indexOf(id);
            if (index > -1) {
                ids.splice(index, 1);
                localStorage.setItem(indexKey, JSON.stringify(ids));
            }
        }

        // ===== METODI SPECIFICI BUSINESS =====

        /**
         * Salva ordine
         */
        async saveOrder(order) {
            order.updated_at = new Date().toISOString();
            return this.save(this.stores.orders, order);
        }

        /**
         * Ottieni ordini pending sync
         */
        async getPendingOrders() {
            return this.findByIndex(this.stores.orders, 'sync_status', 'pending');
        }

        /**
         * Salva cliente
         */
        async saveCustomer(customer) {
            return this.save(this.stores.customers, customer);
        }

        /**
         * Cerca clienti per nome
         */
        async searchCustomers(query) {
            const customers = await this.getAll(this.stores.customers);
            return customers.filter(customer =>
                customer.name.toLowerCase().includes(query.toLowerCase())
            );
        }

        /**
         * Salva prodotto
         */
        async saveProduct(product) {
            return this.save(this.stores.products, product);
        }

        /**
         * Cerca prodotti per barcode
         */
        async findProductByBarcode(barcode) {
            const products = await this.findByIndex(this.stores.products, 'barcode', barcode);
            return products.length > 0 ? products[0] : null;
        }

        /**
         * Ottieni configurazione
         */
        async getConfig() {
            return this.get(this.stores.config, 'app_config');
        }

        /**
         * Salva configurazione
         */
        async saveConfig(config) {
            return this.save(this.stores.config, {
                key: 'app_config',
                ...config,
                updated_at: new Date().toISOString()
            });
        }

        /**
         * Ottieni sessione
         */
        async getSession() {
            return this.get(this.stores.config, 'current_session');
        }

        /**
         * Salva sessione
         */
        async saveSession(session) {
            return this.save(this.stores.config, {
                key: 'current_session',
                ...session,
                updated_at: new Date().toISOString()
            });
        }

        /**
         * Aggiungi elemento a coda sync
         */
        async addToSyncQueue(type, data, priority = 'normal') {
            const item = {
                type,
                data,
                priority,
                created_at: new Date().toISOString(),
                attempts: 0,
                max_attempts: 3
            };

            return this.save(this.stores.sync_queue, item);
        }

        /**
         * Ottieni coda sync
         */
        async getSyncQueue() {
            const items = await this.getAll(this.stores.sync_queue);

            // Ordina per priorità e data
            return items.sort((a, b) => {
                const priorities = { high: 3, normal: 2, low: 1 };
                const aPriority = priorities[a.priority] || 2;
                const bPriority = priorities[b.priority] || 2;

                if (aPriority !== bPriority) {
                    return bPriority - aPriority;
                }

                return new Date(a.created_at) - new Date(b.created_at);
            });
        }

        /**
         * Rimuovi da coda sync
         */
        async removeFromSyncQueue(id) {
            return this.delete(this.stores.sync_queue, id);
        }

        /**
         * Ottieni contatori
         */
        async getAllCounters(userId) {
            return this.findByIndex(this.stores.counters, 'user_id', userId);
        }

        /**
         * Ottieni contatore specifico
         */
        async getCounter(key) {
            return this.get(this.stores.counters, key);
        }

        /**
         * Salva contatore
         */
        async saveCounter(counter) {
            counter.updated_at = new Date().toISOString();
            return this.save(this.stores.counters, counter);
        }

        /**
         * Incrementa contatore
         */
        async incrementCounter(key, increment = 1) {
            const counter = await this.getCounter(key);
            if (counter) {
                counter.value += increment;
                counter.updated_at = new Date().toISOString();
                return this.save(this.stores.counters, counter);
            }
            return null;
        }

        /**
         * Statistiche storage
         */
        async getStorageStats() {
            const stats = {};

            for (const [name, storeName] of Object.entries(this.stores)) {
                try {
                    const items = await this.getAll(storeName);
                    stats[name] = {
                        count: items.length,
                        size: JSON.stringify(items).length
                    };
                } catch (error) {
                    stats[name] = { count: 0, size: 0, error: error.message };
                }
            }

            return stats;
        }

        /**
         * Pulisci dati vecchi
         */
        async cleanup(daysOld = 30) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            const cutoffISO = cutoffDate.toISOString();

            const results = {};

            // Pulisci ordini sincronizzati vecchi
            try {
                const orders = await this.getAll(this.stores.orders);
                const toDelete = orders.filter(order =>
                    order.sync_status === 'synced' &&
                    order.updated_at < cutoffISO
                );

                for (const order of toDelete) {
                    await this.delete(this.stores.orders, order.id);
                }

                results.orders_cleaned = toDelete.length;
            } catch (error) {
                results.orders_error = error.message;
            }

            // Pulisci elementi coda sync falliti
            try {
                const queueItems = await this.getAll(this.stores.sync_queue);
                const toDelete = queueItems.filter(item =>
                    item.attempts >= item.max_attempts &&
                    item.created_at < cutoffISO
                );

                for (const item of toDelete) {
                    await this.delete(this.stores.sync_queue, item.id);
                }

                results.sync_queue_cleaned = toDelete.length;
            } catch (error) {
                results.sync_queue_error = error.message;
            }

            return results;
        }

        /**
         * Export dati per backup
         */
        async exportData() {
            const exportData = {
                version: 1,
                exported_at: new Date().toISOString(),
                data: {}
            };

            for (const [name, storeName] of Object.entries(this.stores)) {
                try {
                    exportData.data[name] = await this.getAll(storeName);
                } catch (error) {
                    console.warn(`Errore export ${name}:`, error);
                    exportData.data[name] = [];
                }
            }

            return exportData;
        }

        /**
         * Import dati da backup
         */
        async importData(exportData) {
            if (!exportData.data) {
                throw new Error('Formato backup non valido');
            }

            const results = {};

            for (const [name, items] of Object.entries(exportData.data)) {
                if (!this.stores[name]) {
                    console.warn(`Store sconosciuto: ${name}`);
                    continue;
                }

                try {
                    // Pulisci store esistente
                    await this.clear(this.stores[name]);

                    // Importa elementi
                    let imported = 0;
                    for (const item of items) {
                        await this.save(this.stores[name], item);
                        imported++;
                    }

                    results[name] = { imported, total: items.length };
                } catch (error) {
                    results[name] = { error: error.message };
                }
            }

            return results;
        }

        /**
         * Verifica integrità storage
         */
        async verifyIntegrity() {
            const results = {
                total_stores: Object.keys(this.stores).length,
                healthy_stores: 0,
                errors: []
            };

            for (const [name, storeName] of Object.entries(this.stores)) {
                try {
                    const items = await this.getAll(storeName);

                    // Verifica struttura base
                    let validItems = 0;
                    for (const item of items) {
                        if (item && typeof item === 'object') {
                            validItems++;
                        }
                    }

                    if (validItems === items.length) {
                        results.healthy_stores++;
                    } else {
                        results.errors.push(`${name}: ${items.length - validItems} elementi corrotti`);
                    }

                } catch (error) {
                    results.errors.push(`${name}: ${error.message}`);
                }
            }

            results.is_healthy = results.errors.length === 0;
            return results;
        }
    }

    // Registra il modello nell'app
    if (window.RaccoltaApp) {
        window.RaccoltaApp.OfflineStorage = OfflineStorage;

        // Auto-registrazione quando app è pronta
        if (window.RaccoltaApp.instance) {
            const storage = new OfflineStorage();
            storage.init().then(() => {
                window.RaccoltaApp.instance.registerModel('storage', storage);
            });
        }
    }

    // Export per uso diretto
    window.OfflineStorage = OfflineStorage;

})();