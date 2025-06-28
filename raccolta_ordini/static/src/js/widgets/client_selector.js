/**
 * Widget Selettore Clienti per Raccolta Ordini
 * Ricerca, selezione e creazione rapida clienti
 */
class ClientSelector {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container ${containerId} non trovato`);
        }

        this.options = {
            placeholder: options.placeholder || 'Cerca cliente...',
            allowCreate: options.allowCreate !== false,
            minSearchLength: options.minSearchLength || 2,
            maxResults: options.maxResults || 20,
            onSelect: options.onSelect || (() => {}),
            onCreate: options.onCreate || (() => {}),
            onClear: options.onClear || (() => {}),
            ...options
        };

        this.selectedClient = null;
        this.searchTimeout = null;
        this.isOpen = false;
        this.clients = [];
        this.filteredClients = [];

        this.init();
    }

    /**
     * Inizializza widget
     */
    init() {
        this.createHTML();
        this.setupEventListeners();
        this.loadClients();
    }

    /**
     * Crea HTML del widget
     */
    createHTML() {
        this.container.innerHTML = `
            <div class="client-selector relative">
                <div class="client-input-container relative">
                    <input type="text"
                           id="client-search"
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                           placeholder="${this.options.placeholder}"
                           autocomplete="off">
                    <div class="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                        <button id="clear-client" class="text-gray-400 hover:text-gray-600 hidden">
                            <i class="fas fa-times"></i>
                        </button>
                        <button id="dropdown-client" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>

                <div id="client-dropdown" class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg hidden max-h-60 overflow-y-auto">
                    <div id="client-list" class="py-1">
                        <!-- Lista clienti popolata dinamicamente -->
                    </div>

                    ${this.options.allowCreate ? `
                    <div class="border-t border-gray-200">
                        <button id="create-client" class="w-full px-4 py-2 text-left text-blue-600 hover:bg-blue-50 flex items-center">
                            <i class="fas fa-plus mr-2"></i>
                            <span>Crea nuovo cliente</span>
                        </button>
                    </div>
                    ` : ''}
                </div>

                <div id="selected-client" class="hidden mt-2 p-3 bg-gray-50 rounded border">
                    <!-- Cliente selezionato -->
                </div>
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const searchInput = this.container.querySelector('#client-search');
        const dropdownBtn = this.container.querySelector('#dropdown-client');
        const clearBtn = this.container.querySelector('#clear-client');
        const createBtn = this.container.querySelector('#create-client');

        // Input ricerca
        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        searchInput.addEventListener('focus', () => {
            this.showDropdown();
        });

        searchInput.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });

        // Pulsante dropdown
        dropdownBtn.addEventListener('click', () => {
            this.toggleDropdown();
        });

        // Pulsante clear
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        // Pulsante crea cliente
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.showCreateClientModal();
            });
        }

        // Click fuori per chiudere dropdown
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.hideDropdown();
            }
        });
    }

    /**
     * Carica clienti da storage offline
     */
    async loadClients() {
        try {
            if (window.app && window.app.offlineStorage) {
                this.clients = await window.app.offlineStorage.getClients();
            } else {
                // Fallback se storage non disponibile
                this.clients = [];
            }

            this.filteredClients = [...this.clients];
            this.updateDropdownList();

        } catch (error) {
            console.error('Errore caricamento clienti:', error);
            this.clients = [];
            this.filteredClients = [];
        }
    }

    /**
     * Gestisce ricerca clienti
     */
    handleSearch(query) {
        clearTimeout(this.searchTimeout);

        this.searchTimeout = setTimeout(() => {
            this.filterClients(query);
            this.showDropdown();
        }, 300);
    }

    /**
     * Filtra clienti in base alla query
     */
    filterClients(query) {
        if (!query || query.length < this.options.minSearchLength) {
            this.filteredClients = [...this.clients];
        } else {
            const searchTerm = query.toLowerCase();
            this.filteredClients = this.clients.filter(client =>
                client.name.toLowerCase().includes(searchTerm) ||
                (client.vat && client.vat.toLowerCase().includes(searchTerm)) ||
                (client.email && client.email.toLowerCase().includes(searchTerm)) ||
                (client.city && client.city.toLowerCase().includes(searchTerm))
            );
        }

        // Limita risultati
        if (this.filteredClients.length > this.options.maxResults) {
            this.filteredClients = this.filteredClients.slice(0, this.options.maxResults);
        }

        this.updateDropdownList();
    }

    /**
     * Aggiorna lista dropdown
     */
    updateDropdownList() {
        const listContainer = this.container.querySelector('#client-list');

        if (this.filteredClients.length === 0) {
            listContainer.innerHTML = `
                <div class="px-4 py-2 text-gray-500 text-center">
                    <i class="fas fa-search mr-2"></i>
                    Nessun cliente trovato
                </div>
            `;
            return;
        }

        listContainer.innerHTML = this.filteredClients.map(client => `
            <div class="client-option px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                 data-client-id="${client.id}">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="font-medium text-gray-900">${this.escapeHtml(client.name)}</div>
                        <div class="text-sm text-gray-500">
                            ${client.vat ? `P.IVA: ${this.escapeHtml(client.vat)}` : ''}
                            ${client.vat && client.city ? ' • ' : ''}
                            ${client.city ? this.escapeHtml(client.city) : ''}
                        </div>
                        ${client.email ? `<div class="text-sm text-gray-400">${this.escapeHtml(client.email)}</div>` : ''}
                    </div>
                    <div class="text-xs text-gray-400 ml-2">
                        <i class="fas fa-user"></i>
                    </div>
                </div>
            </div>
        `).join('');

        // Aggiungi event listeners alle opzioni
        listContainer.querySelectorAll('.client-option').forEach(option => {
            option.addEventListener('click', () => {
                const clientId = parseInt(option.dataset.clientId);
                const client = this.clients.find(c => c.id === clientId);
                this.selectClient(client);
            });
        });
    }

    /**
     * Gestisce navigazione da tastiera
     */
    handleKeyboard(event) {
        const options = this.container.querySelectorAll('.client-option');
        let currentIndex = -1;

        // Trova opzione attualmente selezionata
        options.forEach((option, index) => {
            if (option.classList.contains('bg-blue-100')) {
                currentIndex = index;
            }
        });

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.highlightOption(options, currentIndex + 1);
                this.showDropdown();
                break;

            case 'ArrowUp':
                event.preventDefault();
                this.highlightOption(options, currentIndex - 1);
                break;

            case 'Enter':
                event.preventDefault();
                if (currentIndex >= 0 && options[currentIndex]) {
                    options[currentIndex].click();
                }
                break;

            case 'Escape':
                this.hideDropdown();
                break;
        }
    }

    /**
     * Evidenzia opzione nella lista
     */
    highlightOption(options, index) {
        // Rimuovi highlight precedente
        options.forEach(option => {
            option.classList.remove('bg-blue-100');
        });

        // Aggiungi highlight alla nuova opzione
        if (index >= 0 && index < options.length) {
            options[index].classList.add('bg-blue-100');
            options[index].scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Seleziona cliente
     */
    selectClient(client) {
        this.selectedClient = client;

        // Aggiorna input
        const searchInput = this.container.querySelector('#client-search');
        searchInput.value = client.name;

        // Mostra cliente selezionato
        this.showSelectedClient(client);

        // Mostra pulsante clear
        const clearBtn = this.container.querySelector('#clear-client');
        if (clearBtn) {
            clearBtn.classList.remove('hidden');
        }

        this.hideDropdown();
        this.options.onSelect(client);
    }

    /**
     * Mostra cliente selezionato
     */
    showSelectedClient(client) {
        const selectedContainer = this.container.querySelector('#selected-client');

        selectedContainer.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-900">${this.escapeHtml(client.name)}</h4>
                    <div class="mt-1 text-sm text-gray-600 space-y-1">
                        ${client.vat ? `<div><span class="font-medium">P.IVA:</span> ${this.escapeHtml(client.vat)}</div>` : ''}
                        ${client.email ? `<div><span class="font-medium">Email:</span> ${this.escapeHtml(client.email)}</div>` : ''}
                        ${client.phone ? `<div><span class="font-medium">Tel:</span> ${this.escapeHtml(client.phone)}</div>` : ''}
                        ${client.street || client.city ? `
                        <div class="font-medium">Indirizzo:</div>
                        <div class="ml-2">
                            ${client.street ? this.escapeHtml(client.street) + '<br>' : ''}
                            ${client.zip ? this.escapeHtml(client.zip) + ' ' : ''}
                            ${client.city ? this.escapeHtml(client.city) : ''}
                            ${client.state_id ? ' (' + this.escapeHtml(client.state_id) + ')' : ''}
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="ml-4">
                    <span class="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        <i class="fas fa-check mr-1"></i>Selezionato
                    </span>
                </div>
            </div>
        `;

        selectedContainer.classList.remove('hidden');
    }

    /**
     * Cancella selezione
     */
    clearSelection() {
        this.selectedClient = null;

        // Pulisci input
        const searchInput = this.container.querySelector('#client-search');
        searchInput.value = '';

        // Nascondi cliente selezionato
        const selectedContainer = this.container.querySelector('#selected-client');
        selectedContainer.classList.add('hidden');

        // Nascondi pulsante clear
        const clearBtn = this.container.querySelector('#clear-client');
        if (clearBtn) {
            clearBtn.classList.add('hidden');
        }

        this.hideDropdown();
        this.options.onClear();
    }

    /**
     * Mostra dropdown
     */
    showDropdown() {
        const dropdown = this.container.querySelector('#client-dropdown');
        dropdown.classList.remove('hidden');
        this.isOpen = true;

        // Aggiorna icona
        const icon = this.container.querySelector('#dropdown-client i');
        icon.className = 'fas fa-chevron-up';
    }

    /**
     * Nascondi dropdown
     */
    hideDropdown() {
        const dropdown = this.container.querySelector('#client-dropdown');
        dropdown.classList.add('hidden');
        this.isOpen = false;

        // Aggiorna icona
        const icon = this.container.querySelector('#dropdown-client i');
        icon.className = 'fas fa-chevron-down';
    }

    /**
     * Toggle dropdown
     */
    toggleDropdown() {
        if (this.isOpen) {
            this.hideDropdown();
        } else {
            this.showDropdown();
        }
    }

    /**
     * Mostra modal creazione cliente
     */
    showCreateClientModal() {
        const searchValue = this.container.querySelector('#client-search').value;

        // Crea modal semplificato
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3 class="text-lg font-medium text-gray-900">Nuovo Cliente</h3>
                </div>
                <form id="create-client-form" class="px-6 py-4 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                        <input type="text" name="name" value="${this.escapeHtml(searchValue)}"
                               class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" name="email"
                               class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                        <input type="tel" name="phone"
                               class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">P.IVA</label>
                        <input type="text" name="vat"
                               class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Città</label>
                        <input type="text" name="city"
                               class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                    </div>
                </form>
                <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button type="button" id="cancel-create" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        Annulla
                    </button>
                    <button type="submit" form="create-client-form" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Crea Cliente
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners modal
        modal.querySelector('#cancel-create').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('#create-client-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateClient(modal, new FormData(e.target));
        });

        // Focus primo campo
        modal.querySelector('input[name="name"]').focus();

        // ESC per chiudere
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    /**
     * Gestisce creazione nuovo cliente
     */
    async handleCreateClient(modal, formData) {
        const clientData = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            vat: formData.get('vat'),
            city: formData.get('city'),
            id: Date.now(), // ID temporaneo
            local_id: `new_${Date.now()}`,
            is_local: true,
            created_at: new Date().toISOString()
        };

        try {
            // Salva in storage offline
            if (window.app && window.app.offlineStorage) {
                await window.app.offlineStorage.saveClient(clientData);
            }

            // Aggiorna lista locale
            this.clients.push(clientData);
            this.filteredClients = [...this.clients];

            // Seleziona il nuovo cliente
            this.selectClient(clientData);

            // Callback
            this.options.onCreate(clientData);

            modal.remove();

            // Notifica successo
            if (window.app && window.app.showNotification) {
                window.app.showNotification('Cliente creato con successo', 'success');
            }

        } catch (error) {
            console.error('Errore creazione cliente:', error);
            alert('Errore durante la creazione del cliente');
        }
    }

    /**
     * Ottieni cliente selezionato
     */
    getSelectedClient() {
        return this.selectedClient;
    }

    /**
     * Imposta cliente selezionato
     */
    setSelectedClient(client) {
        if (client) {
            this.selectClient(client);
        } else {
            this.clearSelection();
        }
    }

    /**
     * Ricarica lista clienti
     */
    async refresh() {
        await this.loadClients();
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup widget
     */
    destroy() {
        clearTimeout(this.searchTimeout);
        // Rimuovi event listeners se necessario
    }
}

// Export per uso globale
window.ClientSelector = ClientSelector;

export { ClientSelector };
