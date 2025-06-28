/**
 * Rilevamento Stato Rete per Raccolta Ordini
 * Monitora connessione online/offline con feedback visivo
 */
class NetworkDetector {
    constructor(options = {}) {
        this.options = {
            checkInterval: options.checkInterval || 30000, // 30 secondi
            checkUrl: options.checkUrl || '/api/ping',
            timeout: options.timeout || 5000,
            showIndicator: options.showIndicator !== false,
            indicatorPosition: options.indicatorPosition || 'top-right',
            onOnline: options.onOnline || (() => {}),
            onOffline: options.onOffline || (() => {}),
            onStatusChange: options.onStatusChange || (() => {}),
            ...options
        };

        this.isOnline = navigator.onLine;
        this.isChecking = false;
        this.checkInterval = null;
        this.lastCheck = null;
        this.consecutiveFailures = 0;
        this.indicator = null;

        this.init();
    }

    /**
     * Inizializza detector
     */
    init() {
        this.setupEventListeners();
        this.createIndicator();
        this.startMonitoring();
        this.checkConnection();
    }

    /**
     * Setup event listeners nativi browser
     */
    setupEventListeners() {
        // Eventi nativi browser
        window.addEventListener('online', () => {
            this.handleOnline();
        });

        window.addEventListener('offline', () => {
            this.handleOffline();
        });

        // Visibilità pagina
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.checkConnection();
            }
        });

        // Focus finestra
        window.addEventListener('focus', () => {
            if (this.isOnline) {
                this.checkConnection();
            }
        });
    }

    /**
     * Crea indicatore visivo stato rete
     */
    createIndicator() {
        if (!this.options.showIndicator) return;

        this.indicator = document.createElement('div');
        this.indicator.id = 'network-indicator';
        this.indicator.className = 'network-indicator';

        // Stili CSS
        this.indicator.style.cssText = `
            position: fixed;
            z-index: 10000;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            color: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            cursor: pointer;
            user-select: none;
        `;

        // Posizionamento
        this.setIndicatorPosition();

        // Click per dettagli
        this.indicator.addEventListener('click', () => {
            this.showNetworkDetails();
        });

        document.body.appendChild(this.indicator);
        this.updateIndicator();
    }

    /**
     * Imposta posizione indicatore
     */
    setIndicatorPosition() {
        if (!this.indicator) return;

        const positions = {
            'top-left': { top: '20px', left: '20px' },
            'top-right': { top: '20px', right: '20px' },
            'bottom-left': { bottom: '20px', left: '20px' },
            'bottom-right': { bottom: '20px', right: '20px' },
            'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
            'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)' }
        };

        const position = positions[this.options.indicatorPosition] || positions['top-right'];

        Object.assign(this.indicator.style, position);
    }

    /**
     * Aggiorna indicatore visivo
     */
    updateIndicator() {
        if (!this.indicator) return;

        const status = this.getNetworkStatus();

        this.indicator.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="network-dot w-2 h-2 rounded-full ${status.dotClass}"></div>
                <span>${status.text}</span>
                ${this.isChecking ? '<i class="fas fa-spinner fa-spin ml-1"></i>' : ''}
            </div>
        `;

        this.indicator.style.backgroundColor = status.bgColor;
        this.indicator.title = status.tooltip;
    }

    /**
     * Ottieni stato rete per indicatore
     */
    getNetworkStatus() {
        if (this.isChecking) {
            return {
                text: 'Controllo...',
                bgColor: '#f59e0b',
                dotClass: 'bg-yellow-300',
                tooltip: 'Verifica connessione in corso'
            };
        }

        if (this.isOnline) {
            return {
                text: 'Online',
                bgColor: '#10b981',
                dotClass: 'bg-green-300',
                tooltip: `Online - Ultimo controllo: ${this.formatTime(this.lastCheck)}`
            };
        } else {
            return {
                text: 'Offline',
                bgColor: '#ef4444',
                dotClass: 'bg-red-300',
                tooltip: `Offline - Tentativi falliti: ${this.consecutiveFailures}`
            };
        }
    }

    /**
     * Avvia monitoraggio periodico
     */
    startMonitoring() {
        this.stopMonitoring();

        this.checkInterval = setInterval(() => {
            this.checkConnection();
        }, this.options.checkInterval);
    }

    /**
     * Ferma monitoraggio
     */
    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Controlla connessione effettiva
     */
    async checkConnection() {
        if (this.isChecking) return;

        this.isChecking = true;
        this.updateIndicator();

        try {
            const isConnected = await this.performConnectionTest();
            this.handleConnectionResult(isConnected);

        } catch (error) {
            console.warn('Errore test connessione:', error);
            this.handleConnectionResult(false);
        } finally {
            this.isChecking = false;
            this.lastCheck = new Date();
            this.updateIndicator();
        }
    }

    /**
     * Esegue test connessione
     */
    async performConnectionTest() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

        try {
            const response = await fetch(this.options.checkUrl, {
                method: 'HEAD',
                cache: 'no-cache',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;

        } catch (error) {
            clearTimeout(timeoutId);

            // Se fetch fallisce, prova ping alternativo
            return await this.fallbackPing();
        }
    }

    /**
     * Ping alternativo se fetch fallisce
     */
    async fallbackPing() {
        try {
            // Tenta caricamento risorsa piccola
            const img = new Image();

            return new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(false), this.options.timeout);

                img.onload = () => {
                    clearTimeout(timeout);
                    resolve(true);
                };

                img.onerror = () => {
                    clearTimeout(timeout);
                    resolve(false);
                };

                // Usa timestamp per evitare cache
                img.src = `${window.location.origin}/favicon.ico?t=${Date.now()}`;
            });

        } catch (error) {
            return false;
        }
    }

    /**
     * Gestisce risultato test connessione
     */
    handleConnectionResult(isConnected) {
        const wasOnline = this.isOnline;

        if (isConnected) {
            this.consecutiveFailures = 0;
            if (!wasOnline) {
                this.handleOnline();
            }
        } else {
            this.consecutiveFailures++;
            if (wasOnline) {
                this.handleOffline();
            }
        }
    }

    /**
     * Gestisce evento online
     */
    handleOnline() {
        const wasOffline = !this.isOnline;
        this.isOnline = true;
        this.consecutiveFailures = 0;

        if (wasOffline) {
            console.log('🟢 Connessione ripristinata');
            this.showNotification('Connessione ripristinata', 'success');
            this.options.onOnline();
            this.options.onStatusChange(true);
        }

        this.updateIndicator();
        this.updatePageElements();
    }

    /**
     * Gestisce evento offline
     */
    handleOffline() {
        const wasOnline = this.isOnline;
        this.isOnline = false;

        if (wasOnline) {
            console.log('🔴 Connessione persa');
            this.showNotification('Connessione persa - Modalità offline attiva', 'warning');
            this.options.onOffline();
            this.options.onStatusChange(false);
        }

        this.updateIndicator();
        this.updatePageElements();
    }

    /**
     * Aggiorna elementi pagina in base allo stato
     */
    updatePageElements() {
        // Aggiorna classi body
        document.body.classList.toggle('network-online', this.isOnline);
        document.body.classList.toggle('network-offline', !this.isOnline);

        // Aggiorna elementi con attributi data
        document.querySelectorAll('[data-network-online]').forEach(el => {
            el.style.display = this.isOnline ? el.dataset.networkOnline : 'none';
        });

        document.querySelectorAll('[data-network-offline]').forEach(el => {
            el.style.display = !this.isOnline ? el.dataset.networkOffline : 'none';
        });

        // Disabilita pulsanti che richiedono connessione
        document.querySelectorAll('[data-requires-network]').forEach(el => {
            el.disabled = !this.isOnline;
            el.classList.toggle('opacity-50', !this.isOnline);
        });
    }

    /**
     * Mostra dettagli rete
     */
    showNetworkDetails() {
        const details = this.getDetailedNetworkInfo();

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="px-6 py-4 border-b">
                    <h3 class="text-lg font-medium">Stato Connessione</h3>
                </div>
                <div class="px-6 py-4 space-y-3">
                    <div class="flex justify-between">
                        <span class="text-gray-600">Stato:</span>
                        <span class="font-medium ${this.isOnline ? 'text-green-600' : 'text-red-600'}">
                            ${this.isOnline ? '🟢 Online' : '🔴 Offline'}
                        </span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Ultimo controllo:</span>
                        <span class="font-medium">${this.formatTime(this.lastCheck)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Tentativi falliti:</span>
                        <span class="font-medium">${this.consecutiveFailures}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Tipo connessione:</span>
                        <span class="font-medium">${details.connectionType}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Velocità stimata:</span>
                        <span class="font-medium">${details.effectiveType}</span>
                    </div>
                </div>
                <div class="px-6 py-4 border-t flex justify-between">
                    <button id="test-connection" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Test Connessione
                    </button>
                    <button id="close-modal" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
                        Chiudi
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('#close-modal').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('#test-connection').addEventListener('click', () => {
            this.checkConnection();
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * Ottieni informazioni dettagliate rete
     */
    getDetailedNetworkInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        return {
            connectionType: connection?.type || 'unknown',
            effectiveType: connection?.effectiveType || 'unknown',
            downlink: connection?.downlink || 'unknown',
            rtt: connection?.rtt || 'unknown'
        };
    }

    /**
     * Mostra notifica
     */
    showNotification(message, type = 'info') {
        if (window.app && window.app.showNotification) {
            window.app.showNotification(message, type);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }

    /**
     * Formatta timestamp
     */
    formatTime(date) {
        if (!date) return 'Mai';

        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Adesso';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min fa`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} ore fa`;

        return date
