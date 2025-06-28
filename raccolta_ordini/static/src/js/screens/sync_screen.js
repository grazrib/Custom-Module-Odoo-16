/**
 * Sync Screen - Schermata sincronizzazione documenti
 * Mostra stato sync, consente sync manuale e visualizza log
 */

class SyncScreen {
    constructor() {
        this.container = null;
        this.syncManager = null;
        this.storage = null;
        this.refreshInterval = null;
        this.syncData = {
            stats: {},
            pendingDocuments: [],
            syncLog: [],
            isOnline: navigator.onLine
        };
    }

    /**
     * Inizializza schermata sync
     */
    async initialize(container) {
        this.container = container;
        this.syncManager = window.RaccoltaApp.getModel('sync');
        this.storage = window.RaccoltaApp.getModel('storage');

        // Carica dati iniziali
        await this.loadSyncData();

        // Render UI
        this.render();

        // Bind eventi
        this.bindEvents();

        // Avvia auto-refresh
        this.startAutoRefresh();

        console.log('🔄 Sync Screen inizializzata');
    }

    /**
     * Carica dati sincronizzazione
     */
    async loadSyncData() {
        try {
            // Carica statistiche sync
            this.syncData.stats = await this.syncManager.getSyncStats();

            // Carica documenti pending
            this.syncData.pendingDocuments = await this.loadPendingDocuments();

            // Carica log sync (dal localStorage)
            this.syncData.syncLog = this.loadSyncLog();

            // Stato rete
            this.syncData.isOnline = navigator.onLine;

        } catch (error) {
            console.error('Errore caricamento dati sync:', error);
        }
    }

    /**
     * Carica documenti da sincronizzare
     */
    async loadPendingDocuments() {
        const pendingOrders = await this.storage.getPendingOrders();

        // Aggiungi tipo documento
        const documents = pendingOrders.map(order => ({
            ...order,
            doc_type: 'order',
            doc_icon: '📋',
            doc_label: 'Ordine'
        }));

        // TODO: Aggiungi picking e DDT pending quando implementati

        return documents.sort((a, b) => new Date(b.date_order) - new Date(a.date_order));
    }

    /**
     * Carica log sincronizzazione
     */
    loadSyncLog() {
        try {
            const stored = localStorage.getItem('raccolta_sync_log');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Render interfaccia sync
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="sync-screen">
                <!-- Header con stato -->
                <div class="sync-header">
                    <div class="sync-title">
                        <h2>🔄 Sincronizzazione</h2>
                        <div class="sync-subtitle">
                            Gestione sincronizzazione documenti offline
                        </div>
                    </div>

                    <div class="sync-status">
                        <div class="network-status ${this.syncData.isOnline ? 'online' : 'offline'}">
                            ${this.syncData.isOnline ? '🟢 Online' : '🔴 Offline'}
                        </div>

                        <div class="sync-progress ${this.syncData.stats.is_syncing ? 'active' : ''}">
                            ${this.syncData.stats.is_syncing ? '🔄 Sincronizzazione in corso...' : '✅ Pronto'}
                        </div>
                    </div>
                </div>

                <!-- Statistiche sync -->
                <div class="sync-stats-section">
                    <h3>📊 Statistiche Sincronizzazione</h3>
                    <div class="stats-grid">
                        ${this.renderSyncStats()}
                    </div>
                </div>

                <!-- Azioni sincronizzazione -->
                <div class="sync-actions-section">
                    <h3>⚙️ Azioni</h3>
                    <div class="actions-grid">
                        ${this.renderSyncActions()}
                    </div>
                </div>

                <!-- Documenti pending -->
                <div class="pending-docs-section">
                    <h3>📋 Documenti da Sincronizzare (${this.syncData.pendingDocuments.length})</h3>
                    <div class="pending-docs-container">
                        ${this.renderPendingDocuments()}
                    </div>
                </div>

                <!-- Log sincronizzazione -->
                <div class="sync-log-section">
                    <h3>📝 Log Sincronizzazione</h3>
                    <div class="log-container">
                        ${this.renderSyncLog()}
                    </div>
                </div>

            </div>
        `;
    }

    /**
     * Render statistiche sync
     */
    renderSyncStats() {
        const stats = this.syncData.stats;

        return `
            <div class="stat-card primary">
                <div class="stat-icon">📋</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.total_orders || 0}</div>
                    <div class="stat-label">Ordini Totali</div>
                </div>
            </div>

            <div class="stat-card warning">
                <div class="stat-icon">⏳</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.pending_sync || 0}</div>
                    <div class="stat-label">Da Sincronizzare</div>
                </div>
            </div>

            <div class="stat-card success">
                <div class="stat-icon">✅</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.synced || 0}</div>
                    <div class="stat-label">Sincronizzati</div>
                </div>
            </div>

            <div class="stat-card error">
                <div class="stat-icon">❌</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.errors || 0}</div>
                    <div class="stat-label">Errori</div>
                </div>
            </div>

            <div class="stat-card info">
                <div class="stat-icon">📊</div>
                <div class="stat-content">
                    <div class="stat-number">${stats.sync_percentage || 0}%</div>
                    <div class="stat-label">Completato</div>
                </div>
            </div>

            <div class="stat-card secondary">
                <div class="stat-icon">🕒</div>
                <div class="stat-content">
                    <div class="stat-number">${this.formatLastSync(stats.last_sync)}</div>
                    <div class="stat-label">Ultima Sync</div>
                </div>
            </div>
        `;
    }

    /**
     * Render azioni sincronizzazione
     */
    renderSyncActions() {
        const isOnline = this.syncData.isOnline;
        const isSyncing = this.syncData.stats.is_syncing;
        const hasPending = this.syncData.stats.pending_sync > 0;

        return `
            <button class="action-btn primary ${!isOnline || isSyncing ? 'disabled' : ''}"
                    data-action="sync-all" ${!isOnline || isSyncing ? 'disabled' : ''}>
                <i class="icon">🔄</i>
                <span>Sincronizza Tutto</span>
                ${hasPending ? `<span class="badge">${this.syncData.stats.pending_sync}</span>` : ''}
            </button>

            <button class="action-btn warning ${!isOnline || isSyncing ? 'disabled' : ''}"
                    data-action="force-sync" ${!isOnline || isSyncing ? 'disabled' : ''}>
                <i class="icon">⚡</i>
                <span>Forza Sincronizzazione</span>
            </button>

            <button class="action-btn secondary" data-action="check-status">
                <i class="icon">🔍</i>
                <span>Verifica Stato</span>
            </button>

            <button class="action-btn info ${!isOnline ? 'disabled' : ''}"
                    data-action="download-data" ${!isOnline ? 'disabled' : ''}>
                <i class="icon">📥</i>
                <span>Scarica Dati</span>
            </button>

            <button class="action-btn accent" data-action="export-log">
                <i class="icon">📤</i>
                <span>Esporta Log</span>
            </button>

            <button class="action-btn danger" data-action="clear-log">
                <i class="icon">🗑️</i>
                <span>Pulisci Log</span>
            </button>
        `;
    }

    /**
     * Render documenti pending
     */
    renderPendingDocuments() {
        if (this.syncData.pendingDocuments.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <div class="empty-title">Nessun documento da sincronizzare</div>
                    <div class="empty-message">
                        Tutti i documenti sono stati sincronizzati con successo
                    </div>
                </div>
            `;
        }

        return `
            <div class="pending-docs-list">
                ${this.syncData.pendingDocuments.map(doc => this.renderPendingDocument(doc)).join('')}
            </div>
        `;
    }

    /**
     * Render singolo documento pending
     */
    renderPendingDocument(doc) {
        const age = this.calculateDocumentAge(doc.date_order);
        const isOld = age > 24; // Più di 24 ore

        return `
            <div class="pending-doc ${isOld ? 'old' : ''}" data-doc-id="${doc.local_id}">
                <div class="doc-icon">
                    ${doc.doc_icon}
                </div>

                <div class="doc-info">
                    <div class="doc-header">
                        <span class="doc-name">${doc.name}</span>
                        <span class="doc-type">${doc.doc_label}</span>
                    </div>

                    <div class="doc-details">
                        <span class="doc-client">${doc.partner_name || 'Cliente non specificato'}</span>
                        <span class="doc-date">${this.formatDateTime(doc.date_order)}</span>
                        <span class="doc-amount">€${this.formatCurrency(doc.amount_total || 0)}</span>
                    </div>

                    ${age > 1 ? `
                        <div class="doc-age ${isOld ? 'warning' : ''}">
                            ⏰ ${Math.floor(age)}h fa
                        </div>
                    ` : ''}
                </div>

                <div class="doc-status">
                    <span class="status-badge pending">Da sincronizzare</span>
                    ${doc.sync_error ? `
                        <span class="status-badge error" title="${doc.sync_error}">
                            ❌ Errore
                        </span>
                    ` : ''}
                </div>

                <div class="doc-actions">
                    <button class="btn-doc-sync" data-action="sync-document" title="Sincronizza">
                        🔄
                    </button>
                    <button class="btn-doc-view" data-action="view-document" title="Visualizza">
                        👁️
                    </button>
                    <button class="btn-doc-retry" data-action="retry-document" title="Riprova"
                            ${!doc.sync_error ? 'style="display:none"' : ''}>
                        ↻
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render log sincronizzazione
     */
    renderSyncLog() {
        if (this.syncData.syncLog.length === 0) {
            return `
                <div class="empty-log">
                    <div class="empty-icon">📝</div>
                    <div class="empty-message">Nessun evento di sincronizzazione registrato</div>
                </div>
            `;
        }

        return `
            <div class="log-header">
                <div class="log-filters">
                    <select class="log-level-filter" data-action="filter-log">
                        <option value="">Tutti i livelli</option>
                        <option value="info">Info</option>
                        <option value="success">Successo</option>
                        <option value="warning">Warning</option>
                        <option value="error">Errore</option>
                    </select>
                </div>

                <div class="log-actions">
                    <button class="btn-log-refresh" data-action="refresh-log">🔄</button>
                    <button class="btn-log-clear" data-action="clear-log">🗑️</button>
                </div>
            </div>

            <div class="log-entries">
                ${this.syncData.syncLog.slice(-50).reverse().map(entry => this.renderLogEntry(entry)).join('')}
            </div>
        `;
    }
