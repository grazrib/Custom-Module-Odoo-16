/**
 * RACCOLTA ORDINI - MAIN APPLICATION
 * Entry point per l'applicazione web raccolta ordini
 */

(function() {
    'use strict';

    // Namespace globale
    window.RaccoltaApp = window.RaccoltaApp || {};

    /**
     * Configurazione base applicazione
     */
    const CONFIG = {
        API_BASE: '/raccolta/api',
        VERSION: '1.0.0',
        DEBUG: false,
        STORAGE_PREFIX: 'raccolta_',
        SYNC_INTERVAL: 30000, // 30 secondi
        OFFLINE_TIMEOUT: 5000, // 5 secondi
    };

    /**
     * Classe principale applicazione
     */
    class RaccoltaApplication {
        constructor() {
            this.models = new Map();
            this.screens = new Map();
            this.currentUser = null;
            this.currentConfig = null;
            this.currentSession = null;
            this.isOnline = navigator.onLine;
            this.syncQueue = [];
            
            // Bind eventi
            this.bindEvents();
            
            console.log('Raccolta App inizializzata', CONFIG.VERSION);
        }

        /**
         * Inizializza l'applicazione
         */
        async init() {
            try {
                // Mostra loading
                this.showLoading('Inizializzazione applicazione...');

                // Verifica supporto browser
                if (!this.checkBrowserSupport()) {
                    throw new Error('Browser non supportato');
                }

                // Inizializza storage offline
                await this.initOfflineStorage();

                // Verifica autenticazione
                await this.checkAuthentication();

                // Carica configurazione
                await this.loadConfiguration();

                // Inizializza UI
                this.initUI();

                // Avvia sincronizzazione
                this.startSyncManager();

                console.log('Raccolta App pronta');
                this.hideLoading();

            } catch (error) {
                console.error('Errore inizializzazione:', error);
                this.showError('Errore durante l\'inizializzazione: ' + error.message);
            }
        }

        /**
         * Verifica supporto browser
         */
        checkBrowserSupport() {
            const required = [
                'localStorage',
                'indexedDB',
                'fetch',
                'Promise',
                'addEventListener'
            ];

            for (const feature of required) {
                if (!(feature in window)) {
                    console.error(`Feature non supportata: ${feature}`);
                    return false;
                }
            }

            return true;
        }

        /**
         * Inizializza storage offline
         */
        async initOfflineStorage() {
            try {
                if (!this.models.has('storage')) {
                    // Se il modello storage non è caricato, usiamo localStorage base
                    this.storage = {
                        get: (key) => {
                            try {
                                const data = localStorage.getItem(CONFIG.STORAGE_PREFIX + key);
                                return data ? JSON.parse(data) : null;
                            } catch (e) {
                                console.warn('Errore lettura storage:', e);
                                return null;
                            }
                        },
                        set: (key, value) => {
                            try {
                                localStorage.setItem(CONFIG.STORAGE_PREFIX + key, JSON.stringify(value));
                                return true;
                            } catch (e) {
                                console.warn('Errore scrittura storage:', e);
                                return false;
                            }
                        },
                        remove: (key) => {
                            localStorage.removeItem(CONFIG.STORAGE_PREFIX + key);
                        }
                    };
                }
            } catch (error) {
                console.warn('Storage offline non disponibile, uso memoria');
                this.storage = new Map();
            }
        }

        /**
         * Verifica autenticazione utente
         */
        async checkAuthentication() {
            try {
                const response = await this.apiCall('/health');
                if (response.success && response.user_id) {
                    this.currentUser = {
                        id: response.user_id,
                        is_agent: response.is_agent
                    };

                    if (!response.is_agent) {
                        throw new Error('Utente non autorizzato come agente raccolta');
                    }
                } else {
                    throw new Error('Utente non autenticato');
                }
            } catch (error) {
                console.error('Errore autenticazione:', error);
                window.location.href = '/web/login';
            }
        }

        /**
         * Carica configurazione utente
         */
        async loadConfiguration() {
            try {
                const response = await this.apiCall('/config');
                if (response.success) {
                    this.currentConfig = response.config;
                    this.storage.set('config', this.currentConfig);
                } else {
                    // Prova a caricare da storage offline
                    this.currentConfig = this.storage.get('config');
                    if (!this.currentConfig) {
                        throw new Error('Configurazione non trovata');
                    }
                }
            } catch (error) {
                console.error('Errore caricamento configurazione:', error);
                throw error;
            }
        }

        /**
         * Inizializza interfaccia utente
         */
        initUI() {
            // Nasconde loading screen se presente
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }

            // Mostra interfaccia principale
            const appContainer = document.getElementById('app-container');
            if (appContainer) {
                appContainer.style.display = 'block';
            }

            // Inizializza navigazione mobile se presente
            this.initMobileNavigation();

            // Inizializza status network
            this.initNetworkStatus();
        }

        /**
         * Inizializza navigazione mobile
         */
        initMobileNavigation() {
            const mobileNav = document.querySelector('.mobile-nav');
            if (!mobileNav) return;

            const navItems = mobileNav.querySelectorAll('.mobile-nav-item');
            navItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    // Rimuovi active da tutti
                    navItems.forEach(nav => nav.classList.remove('active'));
                    
                    // Aggiungi active al corrente
                    item.classList.add('active');
                    
                    // Naviga alla schermata
                    const target = item.dataset.screen;
                    if (target) {
                        this.navigateToScreen(target);
                    }
                });
            });
        }

        /**
         * Inizializza status network
         */
        initNetworkStatus() {
            const statusEl = document.querySelector('.network-status');
            
            const updateStatus = () => {
                if (!statusEl) return;
                
                if (this.isOnline) {
                    statusEl.className = 'network-status online';
                    statusEl.textContent = 'Connesso';
                    setTimeout(() => {
                        statusEl.classList.remove('online');
                    }, 3000);
                } else {
                    statusEl.className = 'network-status offline';
                    statusEl.textContent = 'Modalità Offline';
                }
            };

            updateStatus();
        }

        /**
         * Avvia gestore sincronizzazione
         */
        startSyncManager() {
            // Sincronizzazione periodica
            setInterval(() => {
                if (this.isOnline && this.syncQueue.length > 0) {
                    this.processSyncQueue();
                }
            }, CONFIG.SYNC_INTERVAL);

            // Sincronizzazione quando torna online
            window.addEventListener('online', () => {
                this.isOnline = true;
                this.processSyncQueue();
                this.initNetworkStatus();
            });
        }

        /**
         * Processa coda sincronizzazione
         */
        async processSyncQueue() {
            if (this.syncQueue.length === 0) return;

            console.log(`Processando ${this.syncQueue.length} elementi in coda sync`);

            const toProcess = [...this.syncQueue];
            this.syncQueue = [];

            for (const item of toProcess) {
                try {
                    await this.syncItem(item);
                } catch (error) {
                    console.error('Errore sync item:', error);
                    // Rimetti in coda se fallisce
                    this.syncQueue.push(item);
                }
            }
        }

        /**
         * Sincronizza singolo elemento
         */
        async syncItem(item) {
            switch (item.type) {
                case 'order':
                    return await this.syncOrder(item.data);
                case 'session':
                    return await this.syncSession(item.data);
                default:
                    console.warn('Tipo sync non supportato:', item.type);
            }
        }

        /**
         * Naviga a schermata
         */
        navigateToScreen(screenName) {
            // Nasconde tutte le schermate
            const screens = document.querySelectorAll('.screen');
            screens.forEach(screen => {
                screen.style.display = 'none';
            });

            // Mostra schermata richiesta
            const targetScreen = document.getElementById(`screen-${screenName}`);
            if (targetScreen) {
                targetScreen.style.display = 'block';
                
                // Aggiorna titolo se presente
                const title = targetScreen.dataset.title;
                if (title) {
                    document.title = `${title} - Raccolta Ordini`;
                }
            }
        }

        /**
         * Bind eventi globali
         */
        bindEvents() {
            // Gestione connettività
            window.addEventListener('online', () => {
                this.isOnline = true;
                console.log('Connessione ripristinata');
            });

            window.addEventListener('offline', () => {
                this.isOnline = false;
                console.log('Connessione persa');
            });

            // Gestione errori globali
            window.addEventListener('error', (e) => {
                console.error('Errore globale:', e.error);
            });

            // Gestione Promise rejection
            window.addEventListener('unhandledrejection', (e) => {
                console.error('Promise rejection:', e.reason);
            });

            // Gestione back button
            window.addEventListener('popstate', (e) => {
                if (e.state && e.state.screen) {
                    this.navigateToScreen(e.state.screen);
                }
            });
        }

        /**
         * Chiamata API con gestione offline
         */
        async apiCall(endpoint, options = {}) {
            const url = CONFIG.API_BASE + endpoint;
            const defaultOptions = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin'
            };

            const finalOptions = { ...defaultOptions, ...options };

            // Se offline e non è una GET, aggiungi alla coda sync
            if (!this.isOnline && finalOptions.method !== 'GET') {
                const syncItem = {
                    type: 'api_call',
                    endpoint,
                    options: finalOptions,
                    timestamp: Date.now()
                };
                this.syncQueue.push(syncItem);
                return { success: false, offline: true };
            }

            try {
                const response = await fetch(url, finalOptions);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                return data;

            } catch (error) {
                console.error('Errore API call:', error);
                
                // Se non online, prova da storage
                if (!this.isOnline) {
                    const cachedData = this.storage.get(`api_cache_${endpoint}`);
                    if (cachedData) {
                        return cachedData;
                    }
                }

                throw error;
            }
        }

        /**
         * Registra modello
         */
        registerModel(name, model) {
            this.models.set(name, model);
            console.log(`Modello registrato: ${name}`);
        }

        /**
         * Ottieni modello
         */
        getModel(name) {
            return this.models.get(name);
        }

        /**
         * Registra schermata
         */
        registerScreen(name, screen) {
            this.screens.set(name, screen);
            console.log(`Schermata registrata: ${name}`);
        }

        /**
         * Mostra loading
         */
        showLoading(message = 'Caricamento...') {
            let loadingEl = document.getElementById('global-loading');
            
            if (!loadingEl) {
                loadingEl = document.createElement('div');
                loadingEl.id = 'global-loading';
                loadingEl.className = 'raccolta-loading';
                loadingEl.innerHTML = `
                    <div class="raccolta-spinner"></div>
                    <div id="loading-message">${message}</div>
                `;
                document.body.appendChild(loadingEl);
            } else {
                document.getElementById('loading-message').textContent = message;
                loadingEl.style.display = 'flex';
            }
        }

        /**
         * Nasconde loading
         */
        hideLoading() {
            const loadingEl = document.getElementById('global-loading');
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
        }

        /**
         * Mostra errore
         */
        showError(message, title = 'Errore') {
            this.hideLoading();
            
            // Usa native alert come fallback
            alert(`${title}: ${message}`);
            
            // TODO: Implementare modal di errore personalizzato
        }

        /**
         * Mostra notifica
         */
        showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.className = `raccolta-alert ${type}`;
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                min-width: 300px;
                animation: slideInDown 0.3s ease-out;
            `;
            
            document.body.appendChild(notification);
            
            // Rimuovi dopo 5 secondi
            setTimeout(() => {
                notification.style.animation = 'slideInUp 0.3s ease-out reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 5000);
        }
    }

    /**
     * Utility functions globali
     */
    window.RaccoltaApp.utils = {
        formatCurrency: (amount, currency = 'EUR') => {
            return new Intl.NumberFormat('it-IT', {
                style: 'currency',
                currency: currency
            }).format(amount);
        },

        formatDate: (date, options = {}) => {
            const defaultOptions = {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            };
            return new Intl.DateTimeFormat('it-IT', { ...defaultOptions, ...options }).format(new Date(date));
        },

        formatDateTime: (date) => {
            return new Intl.DateTimeFormat('it-IT', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date(date));
        },

        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        generateId: () => {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }
    };

    /**
     * Inizializzazione quando DOM pronto
     */
    document.addEventListener('DOMContentLoaded', () => {
        // Crea istanza globale app
        window.RaccoltaApp.instance = new RaccoltaApplication();
        
        // Avvia inizializzazione
        window.RaccoltaApp.instance.init().catch(error => {
            console.error('Errore fatale inizializzazione:', error);
        });
    });

    // Export per moduli
    window.RaccoltaApp.Application = RaccoltaApplication;
    window.RaccoltaApp.CONFIG = CONFIG;

})();