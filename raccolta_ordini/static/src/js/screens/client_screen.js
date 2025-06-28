/**
 * Client Screen - Modal per selezione/gestione clienti
 * Popup che si apre durante creazione ordini per selezionare cliente
 */

class ClientScreen {
    constructor() {
        this.modal = null;
        this.clients = [];
        this.filteredClients = [];
        this.selectedClient = null;
        this.searchQuery = '';
        this.resolveCallback = null;
    }

    /**
     * Apre modal selezione cliente
     */
    async selectClient() {
        return new Promise(async (resolve) => {
            this.resolveCallback = resolve;

            // Carica clienti
            await this.loadClients();

            // Crea e mostra modal
            this.createModal();
            this.render();
            this.bindEvents();

            console.log('👤 Client Screen aperta');
        });
    }

    /**
     * Carica lista clienti
     */
    async loadClients() {
        try {
            const storage = window.RaccoltaApp.getModel('storage');
            this.clients = await storage.getPartners();
            this.filteredClients = [...this.clients];

        } catch (error) {
            console.error('Errore caricamento clienti:', error);
            this.clients = [];
            this.filteredClients = [];
        }
    }

    /**
     * Crea modal DOM
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'client-modal-overlay';
        document.body.appendChild(this.modal);
    }

    /**
     * Render interfaccia clienti
     */
    render() {
        if (!this.modal) return;

        this.modal.innerHTML = `
            <div class="client-modal">
                <!-- Header modal -->
                <div class="modal-header">
                    <h3>👤 Seleziona Cliente</h3>
                    <button class="modal-close" data-action="close">✕</button>
                </div>

                <!-- Ricerca e filtri -->
                <div class="modal-search">
                    <div class="search-box">
                        <input type="text" class="search-input" placeholder="Cerca cliente per nome, email o P.IVA..."
                               value="${this.searchQuery}" data-action="search">
                        <button class="search-clear" data-action="clear-search" ${this.searchQuery ? '' : 'style="display:none"'}>✕</button>
                    </div>

                    <div class="search-actions">
                        <button class="btn-new-client" data-action="new-client">
                            ➕ Nuovo Cliente
                        </button>
                        <button class="btn-refresh" data-action="refresh">
                            🔄 Aggiorna
                        </button>
                    </div>
                </div>

                <!-- Lista clienti -->
                <div class="modal-content">
                    <div class="clients-container">
                        ${this.renderClientsList()}
                    </div>
                </div>

                <!-- Footer -->
                <div class="modal-footer">
                    <div class="footer-info">
                        Trovati ${this.filteredClients.length} clienti
                        ${this.searchQuery ? ` per "${this.searchQuery}"` : ''}
                    </div>

                    <div class="footer-actions">
                        <button class="btn-cancel" data-action="cancel">
                            Annulla
                        </button>
                        <button class="btn-select" data-action="select" ${!this.selectedClient ? 'disabled' : ''}>
                            Seleziona
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render lista clienti
     */
    renderClientsList() {
        if (this.filteredClients.length === 0) {
            return this.renderEmptyState();
        }

        return `
            <div class="clients-list">
                ${this.filteredClients.map(client => this.renderClientItem(client)).join('')}
            </div>
        `;
    }

    /**
     * Render singolo cliente
     */
    renderClientItem(client) {
        const isSelected = this.selectedClient?.id === client.id;

        return `
            <div class="client-item ${isSelected ? 'selected' : ''}" data-client-id="${client.id}">
                <div class="client-avatar">
                    ${client.is_company ? '🏢' : '👤'}
                </div>

                <div class="client-info">
                    <div class="client-name">${client.name}</div>

                    <div class="client-details">
                        ${client.email ? `📧 ${client.email}` : ''}
                        ${client.phone ? `📞 ${client.phone}` : ''}
                        ${client.mobile && client.mobile !== client.phone ? `📱 ${client.mobile}` : ''}
                    </div>

                    ${client.street || client.city ? `
                        <div class="client-address">
                            📍 ${this.formatAddress(client)}
                        </div>
                    ` : ''}

                    <div class="client-business">
                        ${client.vat ? `P.IVA: ${client.vat}` : ''}
                        ${client.codice_fiscale && client.codice_fiscale !== client.vat ?
                            `C.F.: ${client.codice_fiscale}` : ''}
                    </div>
                </div>

                <div class="client-actions">
                    <button class="btn-client-select" data-action="select-client" title="Seleziona">
                        ✓
                    </button>
                    <button class="btn-client-details" data-action="client-details" title="Dettagli">
                        👁️
                    </button>
                    <button class="btn-client-edit" data-action="edit-client" title="Modifica">
                        ✏️
                    </button>
                </div>

                ${isSelected ? '<div class="selection-indicator">✓ Selezionato</div>' : ''}
            </div>
        `;
    }

    /**
     * Render stato vuoto
     */
    renderEmptyState() {
        if (this.searchQuery) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">Nessun cliente trovato</div>
                    <div class="empty-message">
                        Nessun cliente corrisponde alla ricerca "${this.searchQuery}"
                    </div>
                    <div class="empty-actions">
                        <button class="btn-clear-search" data-action="clear-search">
                            Cancella ricerca
                        </button>
                        <button class="btn-new-client" data-action="new-client">
                            Crea nuovo cliente
                        </button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <div class="empty-title">Nessun cliente disponibile</div>
                    <div class="empty-message">
                        Non ci sono clienti nel database locale.
                        Sincronizza con il server o crea un nuovo cliente.
                    </div>
                    <div class="empty-actions">
                        <button class="btn-refresh" data-action="refresh">
                            Sincronizza clienti
                        </button>
                        <button class="btn-new-client" data-action="new-client">
                            Crea nuovo cliente
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Bind eventi modal
     */
    bindEvents() {
        if (!this.modal) return;

        // Click su overlay per chiudere
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal(null);
            }
        });

        // Eventi azioni
        this.modal.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const clientId = e.target.closest('.client-item')?.dataset.clientId;

            if (action) {
                this.handleAction(action, clientId, e.target);
            }
        });

        // Eventi ricerca
        this.modal.addEventListener('input', (e) => {
            if (e.target.dataset.action === 'search') {
                this.handleSearch(e.target.value);
            }
        });

        // Eventi tastiera
        this.modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal(null);
            } else if (e.key === 'Enter') {
                if (this.selectedClient) {
                    this.closeModal(this.selectedClient);
                }
            }
        });

        // Focus su ricerca
        const searchInput = this.modal.querySelector('.search-input');
        if (searchInput) {
            searchInput.focus();
        }
    }

    /**
     * Gestisce azioni modal
     */
    async handleAction(action, clientId, target) {
        try {
            switch (action) {
                case 'close':
                case 'cancel':
                    this.closeModal(null);
                    break;

                case 'select':
                    this.closeModal(this.selectedClient);
                    break;

                case 'select-client':
                    this.selectClientById(parseInt(clientId));
                    break;

                case 'client-details':
                    await this.showClientDetails(parseInt(clientId));
                    break;

                case 'edit-client':
                    await this.editClient(parseInt(clientId));
                    break;

                case 'new-client':
                    await this.createNewClient();
                    break;

                case 'refresh':
                    await this.refreshClients();
                    break;

                case 'clear-search':
                    this.clearSearch();
                    break;

                default:
                    console.warn('Azione client non riconosciuta:', action);
            }
        } catch (error) {
            console.error(`Errore azione client ${action}:`, error);
            window.RaccoltaApp.getModel('notification').error(`Errore: ${error.message}`);
        }
    }

    /**
     * Gestisce ricerca clienti
     */
    handleSearch(query) {
        this.searchQuery = query.toLowerCase();

        if (!this.searchQuery) {
            this.filteredClients = [...this.clients];
        } else {
            this.filteredClients = this.clients.filter(client =>
                client.name.toLowerCase().includes(this.searchQuery) ||
                (client.email && client.email.toLowerCase().includes(this.searchQuery)) ||
                (client.vat && client.vat.toLowerCase().includes(this.searchQuery)) ||
                (client.phone && client.phone.includes(this.searchQuery)) ||
                (client.codice_fiscale && client.codice_fiscale.toLowerCase().includes(this.searchQuery))
            );
        }

        // Aggiorna lista
        this.updateClientsList();

        // Reset selezione se il cliente selezionato non è più visibile
        if (this.selectedClient && !this.filteredClients.find(c => c.id === this.selectedClient.id)) {
            this.selectedClient = null;
            this.updateFooter();
        }
    }

    /**
     * Seleziona cliente per ID
     */
    selectClientById(clientId) {
        const client = this.filteredClients.find(c => c.id === clientId);

        if (client) {
            this.selectedClient = client;

            // Aggiorna UI
            this.updateClientSelection();
            this.updateFooter();
        }
    }

    /**
     * Mostra dettagli cliente
     */
    async showClientDetails(clientId) {
        const client = this.clients.find(c => c.id === clientId);
        if (!client) return;

        const detailsModal = document.createElement('div');
        detailsModal.className = 'client-details-overlay';
        detailsModal.innerHTML = `
            <div class="client-details-modal">
                <div class="details-header">
                    <h3>👤 Dettagli Cliente</h3>
                    <button class="details-close">✕</button>
                </div>

                <div class="details-content">
                    <div class="detail-section">
                        <h4>Informazioni Generali</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>Nome:</label>
                                <span>${client.name}</span>
                            </div>
                            <div class="detail-item">
                                <label>Tipo:</label>
                                <span>${client.is_company ? 'Azienda' : 'Privato'}</span>
                            </div>
                            ${client.email ? `
                                <div class="detail-item">
                                    <label>Email:</label>
                                    <span>${client.email}</span>
                                </div>
                            ` : ''}
                            ${client.phone ? `
                                <div class="detail-item">
                                    <label>Telefono:</label>
                                    <span>${client.phone}</span>
                                </div>
                            ` : ''}
                            ${client.mobile ? `
                                <div class="detail-item">
                                    <label>Cellulare:</label>
                                    <span>${client.mobile}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    ${this.renderAddressSection(client)}
                    ${this.renderBusinessSection(client)}
                </div>

                <div class="details-footer">
                    <button class="btn-details-close">Chiudi</button>
                </div>
            </div>
        `;

        // Bind chiusura
        detailsModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('client-details-overlay') ||
                e.target.classList.contains('details-close') ||
                e.target.classList.contains('btn-details-close')) {
                detailsModal.remove();
            }
        });

        document.body.appendChild(detailsModal);
    }

    /**
     * Render sezione indirizzo
     */
    renderAddressSection(client) {
        if (!client.street && !client.city && !client.zip) {
            return '';
        }

        return `
            <div class="detail-section">
                <h4>Indirizzo</h4>
                <div class="detail-grid">
                    ${client.street ? `
                        <div class="detail-item">
                            <label>Via:</label>
                            <span>${client.street}</span>
                        </div>
                    ` : ''}
                    ${client.city ? `
                        <div class="detail-item">
                            <label>Città:</label>
                            <span>${client.city}</span>
                        </div>
                    ` : ''}
                    ${client.zip ? `
                        <div class="detail-item">
                            <label>CAP:</label>
                            <span>${client.zip}</span>
                        </div>
                    ` : ''}
                    ${client.state_id ? `
                        <div class="detail-item">
                            <label>Provincia:</label>
                            <span>${client.state_id[1] || client.state_id}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render sezione dati business
     */
    renderBusinessSection(client) {
        if (!client.vat && !client.codice_fiscale) {
            return '';
        }

        return `
            <div class="detail-section">
                <h4>Dati Fiscali</h4>
                <div class="detail-grid">
                    ${client.vat ? `
                        <div class="detail-item">
                            <label>Partita IVA:</label>
                            <span>${client.vat}</span>
                        </div>
                    ` : ''}
                    ${client.codice_fiscale ? `
                        <div class="detail-item">
                            <label>Codice Fiscale:</label>
                            <span>${client.codice_fiscale}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Crea nuovo cliente
     */
    async createNewClient() {
        // Per ora mostra messaggio - da implementare form creazione
        window.RaccoltaApp.getModel('notification').info('Funzionalità in sviluppo: creazione nuovo cliente');
    }

    /**
     * Modifica cliente
     */
    async editClient(clientId) {
        // Per ora mostra messaggio - da implementare form modifica
        window.RaccoltaApp.getModel('notification').info('Funzionalità in sviluppo: modifica cliente');
    }

    /**
     * Aggiorna lista clienti dal server
     */
    async refreshClients() {
        try {
            window.RaccoltaApp.getModel('notification').info('Aggiornamento clienti...');

            // Ricarica da server se online
            if (navigator.onLine) {
                const response = await window.RaccoltaApp.rpc('/raccolta/load_partners');
                const storage = window.RaccoltaApp.getModel('storage');
                await storage.savePartners(response.partners);
            }

            // Ricarica lista locale
            await this.loadClients();
            this.handleSearch(this.searchQuery);

            window.RaccoltaApp.getModel('notification').success('Clienti aggiornati');

        } catch (error) {
            window.RaccoltaApp.getModel('notification').error('Errore aggiornamento clienti');
        }
    }

    /**
     * Pulisce ricerca
     */
    clearSearch() {
        this.searchQuery = '';
        const searchInput = this.modal?.querySelector('.search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        this.handleSearch('');
    }

    /**
     * Chiude modal
     */
    closeModal(selectedClient) {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }

        if (this.resolveCallback) {
            this.resolveCallback(selectedClient);
            this.resolveCallback = null;
        }

        console.log('👤 Client Screen chiusa');
    }

    // === UPDATE UI HELPERS ===

    updateClientsList() {
        const container = this.modal?.querySelector('.clients-container');
        if (container) {
            container.innerHTML = this.renderClientsList();
        }
    }

    updateClientSelection() {
        // Rimuovi selezione precedente
        this.modal?.querySelectorAll('.client-item').forEach(item => {
            item.classList.remove('selected');
            item.querySelector('.selection-indicator')?.remove();
        });

        // Aggiungi nuova selezione
        if (this.selectedClient) {
            const selectedItem = this.modal?.querySelector(`[data-client-id="${this.selectedClient.id}"]`);
            if (selectedItem) {
                selectedItem.classList.add('selected');
                selectedItem.insertAdjacentHTML('beforeend', '<div class="selection-indicator">✓ Selezionato</div>');
            }
        }
    }

    updateFooter() {
        const footerInfo = this.modal?.querySelector('.footer-info');
        const selectBtn = this.modal?.querySelector('[data-action="select"]');

        if (footerInfo) {
            footerInfo.textContent = `Trovati ${this.filteredClients.length} clienti${this.searchQuery ? ` per "${this.searchQuery}"` : ''}`;
        }

        if (selectBtn) {
            selectBtn.disabled = !this.selectedClient;
        }
    }

    // === UTILITY ===

    formatAddress(client) {
        const parts = [];
        if (client.street) parts.push(client.street);
        if (client.zip && client.city) {
            parts.push(`${client.zip} ${client.city}`);
        } else if (client.city) {
            parts.push(client.city);
        }
        return parts.join(', ');
    }
}

export { ClientScreen };
