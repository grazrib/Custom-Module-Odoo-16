/**
 * Order Screen - Creazione e modifica ordini
 * Interfaccia principale per gestire ordini con clienti e prodotti
 */

class OrderScreen {
    constructor() {
        this.container = null;
        this.currentOrder = null;
        this.selectedClient = null;
        this.orderLines = [];
        this.mode = 'create'; // create, edit
        this.isDirty = false;
    }

    /**
     * Inizializza schermata ordine
     */
    async initialize(container, data = {}) {
        this.container = container;
        this.mode = data.mode || 'create';

        if (data.orderId && this.mode === 'edit') {
            await this.loadExistingOrder(data.orderId);
        } else {
            this.initializeNewOrder();
        }

        this.render();
        this.bindEvents();

        console.log(`📝 Order Screen inizializzata (${this.mode})`);
    }

    /**
     * Carica ordine esistente per modifica
     */
    async loadExistingOrder(orderId) {
        try {
            const storage = window.RaccoltaApp.getModel('storage');
            this.currentOrder = await storage.getOrder(orderId);

            if (!this.currentOrder) {
                throw new Error('Ordine non trovato');
            }

            // Carica cliente
            if (this.currentOrder.partner_id) {
                const partners = await storage.getPartners();
                this.selectedClient = partners.find(p => p.id === this.currentOrder.partner_id);
            }

            // Carica righe ordine
            this.orderLines = this.currentOrder.products || [];

        } catch (error) {
            console.error('Errore caricamento ordine:', error);
            window.RaccoltaApp.getModel('notification').error('Errore caricamento ordine');
            window.RaccoltaApp.showScreen('dashboard');
        }
    }

    /**
     * Inizializza nuovo ordine
     */
    initializeNewOrder() {
        this.currentOrder = {
            local_id: null,
            name: 'Nuovo Ordine',
            partner_id: null,
            partner_name: '',
            date_order: new Date().toISOString(),
            state: 'draft',
            products: [],
            note: '',
            general_notes: '',
            delivery_instructions: ''
        };

        this.selectedClient = null;
        this.orderLines = [];
    }

    /**
     * Render interfaccia ordine
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="order-screen">
                <!-- Header con azioni -->
                <div class="order-header">
                    <div class="order-title">
                        <h2>${this.mode === 'edit' ? 'Modifica Ordine' : 'Nuovo Ordine'}</h2>
                        <div class="order-info">
                            ${this.currentOrder.name !== 'Nuovo Ordine' ?
                                `<span class="order-number">${this.currentOrder.name}</span>` : ''}
                            <span class="order-date">${this.formatDate(this.currentOrder.date_order)}</span>
                        </div>
                    </div>

                    <div class="order-actions">
                        <button class="btn-secondary" data-action="cancel">
                            ❌ Annulla
                        </button>
                        <button class="btn-primary" data-action="save" ${!this.canSave() ? 'disabled' : ''}>
                            💾 ${this.mode === 'edit' ? 'Aggiorna' : 'Salva'}
                        </button>
                        <button class="btn-success" data-action="save-and-print" ${!this.canSave() ? 'disabled' : ''}>
                            🖨️ Salva e Stampa
                        </button>
                    </div>
                </div>

                <!-- Form principale -->
                <div class="order-form">

                    <!-- Sezione cliente -->
                    <div class="form-section">
                        <h3>📋 Cliente</h3>
                        <div class="client-selection">
                            ${this.renderClientSection()}
                        </div>
                    </div>

                    <!-- Sezione prodotti -->
                    <div class="form-section">
                        <h3>🛍️ Prodotti</h3>
                        <div class="products-section">
                            <div class="products-actions">
                                <button class="btn-add-product" data-action="add-product">
                                    ➕ Aggiungi Prodotto
                                </button>
                                <button class="btn-scan-barcode" data-action="scan-barcode">
                                    📱 Scansiona Codice
                                </button>
                            </div>

                            <div class="order-lines">
                                ${this.renderOrderLines()}
                            </div>

                            <div class="order-totals">
                                ${this.renderTotals()}
                            </div>
                        </div>
                    </div>

                    <!-- Sezione note -->
                    <div class="form-section">
                        <h3>📝 Note</h3>
                        <div class="notes-section">
                            ${this.renderNotesSection()}
                        </div>
                    </div>

                </div>

                <!-- Status bar -->
                <div class="order-status-bar">
                    <div class="status-info">
                        <span class="client-status ${this.selectedClient ? 'selected' : 'empty'}">
                            Cliente: ${this.selectedClient ? this.selectedClient.name : 'Non selezionato'}
                        </span>
                        <span class="products-status ${this.orderLines.length > 0 ? 'selected' : 'empty'}">
                            Prodotti: ${this.orderLines.length}
                        </span>
                        <span class="total-status">
                            Totale: €${this.formatCurrency(this.calculateTotal())}
                        </span>
                    </div>

                    <div class="validation-status">
                        ${this.renderValidationStatus()}
                    </div>
                </div>

            </div>
        `;
    }

    /**
     * Render sezione cliente
     */
    renderClientSection() {
        if (this.selectedClient) {
            return `
                <div class="selected-client">
                    <div class="client-info">
                        <div class="client-name">${this.selectedClient.name}</div>
                        <div class="client-details">
                            ${this.selectedClient.email ? `📧 ${this.selectedClient.email}` : ''}
                            ${this.selectedClient.phone ? `📞 ${this.selectedClient.phone}` : ''}
                        </div>
                        ${this.selectedClient.street ?
                            `<div class="client-address">📍 ${this.formatAddress(this.selectedClient)}</div>` : ''}
                    </div>

                    <div class="client-actions">
                        <button class="btn-change-client" data-action="change-client">
                            🔄 Cambia
                        </button>
                        <button class="btn-client-details" data-action="client-details">
                            👁️ Dettagli
                        </button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="no-client">
                    <div class="no-client-message">
                        <span class="no-client-icon">👤</span>
                        <span class="no-client-text">Nessun cliente selezionato</span>
                    </div>

                    <div class="client-actions">
                        <button class="btn-select-client" data-action="select-client">
                            🔍 Seleziona Cliente
                        </button>
                        <button class="btn-new-client" data-action="new-client">
                            ➕ Nuovo Cliente
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Render righe ordine
     */
    renderOrderLines() {
        if (this.orderLines.length === 0) {
            return `
                <div class="no-products">
                    <div class="no-products-message">
                        <span class="no-products-icon">📦</span>
                        <span class="no-products-text">Nessun prodotto aggiunto</span>
                    </div>
                </div>
            `;
        }

        return this.orderLines.map((line, index) => `
            <div class="order-line" data-line-index="${index}">
                <div class="line-product">
                    <div class="product-name">${line.name}</div>
                    ${line.default_code ? `<div class="product-code">Cod: ${line.default_code}</div>` : ''}
                </div>

                <div class="line-quantity">
                    <label>Quantità:</label>
                    <div class="quantity-controls">
                        <button class="qty-btn minus" data-action="decrease-qty" data-index="${index}">-</button>
                        <input type="number" class="qty-input" value="${line.quantity}"
                               data-action="change-qty" data-index="${index}" min="0" step="0.01">
                        <button class="qty-btn plus" data-action="increase-qty" data-index="${index}">+</button>
                    </div>
                    ${line.uom_name ? `<span class="uom">${line.uom_name}</span>` : ''}
                </div>

                <div class="line-price">
                    <label>Prezzo:</label>
                    <input type="number" class="price-input" value="${line.price_unit || 0}"
                           data-action="change-price" data-index="${index}" min="0" step="0.01">
                    <span class="currency">€</span>
                </div>

                <div class="line-total">
                    €${this.formatCurrency(this.calculateLineTotal(line))}
                </div>

                <div class="line-actions">
                    <button class="btn-line-note" data-action="edit-line-note" data-index="${index}"
                            title="Note prodotto">
                        📝
                    </button>
                    <button class="btn-line-remove" data-action="remove-line" data-index="${index}"
                            title="Rimuovi">
                        🗑️
                    </button>
                </div>

                ${line.note ? `
                    <div class="line-note">
                        <strong>Note:</strong> ${line.note}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    /**
     * Render totali ordine
     */
    renderTotals() {
        const subtotal = this.calculateSubtotal();
        const tax = this.calculateTax(subtotal);
        const total = subtotal + tax;

        return `
            <div class="totals-grid">
                <div class="total-row">
                    <span class="total-label">Subtotale:</span>
                    <span class="total-value">€${this.formatCurrency(subtotal)}</span>
                </div>

                <div class="total-row">
                    <span class="total-label">IVA (22%):</span>
                    <span class="total-value">€${this.formatCurrency(tax)}</span>
                </div>

                <div class="total-row total-final">
                    <span class="total-label">TOTALE:</span>
                    <span class="total-value">€${this.formatCurrency(total)}</span>
                </div>
            </div>
        `;
    }

    /**
     * Render sezione note
     */
    renderNotesSection() {
        return `
            <div class="notes-grid">
                <div class="note-field">
                    <label for="general-notes">Note Generali:</label>
                    <textarea id="general-notes" placeholder="Note visibili al cliente..."
                              data-field="general_notes">${this.currentOrder.general_notes || ''}</textarea>
                </div>

                <div class="note-field">
                    <label for="internal-notes">Note Interne:</label>
                    <textarea id="internal-notes" placeholder="Note interne (non stampate)..."
                              data-field="internal_notes">${this.currentOrder.internal_notes || ''}</textarea>
                </div>

                <div class="note-field">
                    <label for="delivery-instructions">Istruzioni Consegna:</label>
                    <textarea id="delivery-instructions" placeholder="Istruzioni per la consegna..."
                              data-field="delivery_instructions">${this.currentOrder.delivery_instructions || ''}</textarea>
                </div>
            </div>
        `;
    }

    /**
     * Render stato validazione
     */
    renderValidationStatus() {
        const errors = this.validateOrder();

        if (errors.length === 0) {
            return '<span class="validation-ok">✅ Ordine valido</span>';
        } else {
            return `
                <div class="validation-errors">
                    <span class="validation-icon">⚠️</span>
                    <div class="validation-list">
                        ${errors.map(error => `<div class="validation-error">${error}</div>`).join('')}
                    </div>
                </div>
            `;
        }
    }

    /**
     * Bind eventi schermata
     */
    bindEvents() {
        if (!this.container) return;

        // Eventi azioni principali
        this.container.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const index = e.target.dataset.index;

            if (action) {
                this.handleAction(action, index, e.target);
            }
        });

        // Eventi input campi
        this.container.addEventListener('input', (e) => {
            this.handleInputChange(e);
        });

        // Eventi change per select e checkbox
        this.container.addEventListener('change', (e) => {
            this.handleInputChange(e);
        });

        // Prevenzione uscita con modifiche non salvate
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    /**
     * Gestisce azioni interfaccia
     */
    async handleAction(action, index, target) {
        try {
            switch (action) {
                case 'cancel':
                    await this.cancelOrder();
                    break;

                case 'save':
                    await this.saveOrder();
                    break;

                case 'save-and-print':
                    await this.saveAndPrint();
                    break;

                case 'select-client':
                case 'change-client':
                    await this.selectClient();
                    break;

                case 'new-client':
                    await this.createNewClient();
                    break;

                case 'client-details':
                    await this.showClientDetails();
                    break;

                case 'add-product':
                    await this.addProduct();
                    break;

                case 'scan-barcode':
                    await this.scanBarcode();
                    break;

                case 'remove-line':
                    this.removeLine(parseInt(index));
                    break;

                case 'increase-qty':
                    this.changeQuantity(parseInt(index), 1);
                    break;

                case 'decrease-qty':
                    this.changeQuantity(parseInt(index), -1);
                    break;

                case 'edit-line-note':
                    await this.editLineNote(parseInt(index));
                    break;

                default:
                    console.warn('Azione non riconosciuta:', action);
            }
        } catch (error) {
            console.error(`Errore azione ${action}:`, error);
            window.RaccoltaApp.getModel('notification').error(`Errore: ${error.message}`);
        }
    }

    /**
     * Gestisce cambi input
     */
    handleInputChange(e) {
        const action = e.target.dataset.action;
        const field = e.target.dataset.field;
        const index = e.target.dataset.index;

        this.isDirty = true;

        if (action === 'change-qty') {
            this.updateLineQuantity(parseInt(index), parseFloat(e.target.value) || 0);
        } else if (action === 'change-price') {
            this.updateLinePrice(parseInt(index), parseFloat(e.target.value) || 0);
        } else if (field) {
            this.updateOrderField(field, e.target.value);
        }

        // Aggiorna validation status
        this.updateValidationStatus();

        // Aggiorna totali se necessario
        if (action === 'change-qty' || action === 'change-price') {
            this.updateTotals();
        }
    }

    // === AZIONI ORDINE ===

    /**
     * Annulla ordine
     */
    async cancelOrder() {
        if (this.isDirty) {
            const confirmed = confirm('Hai modifiche non salvate. Sei sicuro di voler uscire?');
            if (!confirmed) return;
        }

        window.RaccoltaApp.showScreen('dashboard');
    }

    /**
     * Salva ordine
     */
    async saveOrder() {
        const errors = this.validateOrder();
        if (errors.length > 0) {
            window.RaccoltaApp.getModel('notification').error('Correggi gli errori prima di salvare');
            return;
        }

        try {
            const documentCreator = window.RaccoltaApp.getModel('documentCreator');
            const notification = window.RaccoltaApp.getModel('notification');

            notification.info('Salvataggio ordine...');

            const orderData = this.prepareOrderData();
            const result = await documentCreator.createCompleteOrder(orderData);

            if (result.success) {
                notification.success('Ordine salvato con successo');
                this.isDirty = false;

                // Torna alla dashboard
                window.RaccoltaApp.showScreen('dashboard');
            } else {
                throw new Error(result.error || 'Errore salvataggio ordine');
            }

        } catch (error) {
            window.RaccoltaApp.getModel('notification').error(`Errore salvataggio: ${error.message}`);
        }
    }

    /**
     * Salva e stampa ordine
     */
    async saveAndPrint() {
        await this.saveOrder();

        // Se il salvataggio è andato a buon fine, la schermata cambierà
        // La stampa verrà gestita dalla dashboard o da un callback
    }

    /**
     * Seleziona cliente
     */
    async selectClient() {
        const clientScreen = window.RaccoltaApp.getModel('clientScreen');

        // Apri schermata selezione cliente
        const selectedClient = await clientScreen.selectClient();

        if (selectedClient) {
            this.selectedClient = selectedClient;
            this.currentOrder.partner_id = selectedClient.id;
            this.currentOrder.partner_name = selectedClient.name;
            this.isDirty = true;

            // Re-render sezione cliente
            this.updateClientSection();
        }
    }

    /**
     * Aggiungi prodotto
     */
    async addProduct() {
        const productScreen = window.RaccoltaApp.getModel('productScreen');

        // Apri schermata selezione prodotto
        const selectedProduct = await productScreen.selectProduct();

        if (selectedProduct) {
            this.addProductToOrder(selectedProduct);
        }
    }

    /**
     * Scansiona barcode
     */
    async scanBarcode() {
        const barcodeScanner = window.RaccoltaApp.getModel('barcodeScanner');

        try {
            const barcode = await barcodeScanner.scan();

            if (barcode) {
                // Cerca prodotto per barcode
                const storage = window.RaccoltaApp.getModel('storage');
                const products = await storage.getProducts();
                const product = products.find(p => p.barcode === barcode);

                if (product) {
                    this.addProductToOrder(product);
                } else {
                    window.RaccoltaApp.getModel('notification').warning('Prodotto non trovato per questo codice');
                }
            }

        } catch (error) {
            window.RaccoltaApp.getModel('notification').error('Errore scansione barcode');
        }
    }

    // === UTILITY ===

    addProductToOrder(product) {
        const existingIndex = this.orderLines.findIndex(line => line.id === product.id);

        if (existingIndex >= 0) {
            // Incrementa quantità se già presente
            this.orderLines[existingIndex].quantity += 1;
        } else {
            // Aggiungi nuovo prodotto
            this.orderLines.push({
                id: product.id,
                name: product.name,
                default_code: product.default_code,
                quantity: 1,
                price_unit: product.list_price || 0,
                uom_name: product.uom_name || 'Pz',
                note: ''
            });
        }

        this.isDirty = true;
        this.updateProductsSection();
    }

    removeLine(index) {
        if (index >= 0 && index < this.orderLines.length) {
            this.orderLines.splice(index, 1);
            this.isDirty = true;
            this.updateProductsSection();
        }
    }

    changeQuantity(index, delta) {
        if (index >= 0 && index < this.orderLines.length) {
            const newQty = Math.max(0, this.orderLines[index].quantity + delta);
            this.orderLines[index].quantity = newQty;
            this.isDirty = true;
            this.updateProductsSection();
        }
    }

    updateLineQuantity(index, quantity) {
        if (index >= 0 && index < this.orderLines.length) {
            this.orderLines[index].quantity = Math.max(0, quantity);
            this.updateStatusBar();
        }
    }

    updateLinePrice(index, price) {
        if (index >= 0 && index < this.orderLines.length) {
            this.orderLines[index].price_unit = Math.max(0, price);
            this.updateStatusBar();
        }
    }

    updateOrderField(field, value) {
        this.currentOrder[field] = value;
    }

    // === CALCOLI ===

    calculateLineTotal(line) {
        return (line.quantity || 0) * (line.price_unit || 0);
    }

    calculateSubtotal() {
        return this.orderLines.reduce((sum, line) => sum + this.calculateLineTotal(line), 0);
    }

    calculateTax(subtotal) {
        return subtotal * 0.22; // IVA 22%
    }

    calculateTotal() {
        const subtotal = this.calculateSubtotal();
        return subtotal + this.calculateTax(subtotal);
    }

    // === VALIDAZIONE ===

    validateOrder() {
        const errors = [];

        if (!this.selectedClient) {
            errors.push('Seleziona un cliente');
        }

        if (this.orderLines.length === 0) {
            errors.push('Aggiungi almeno un prodotto');
        }

        // Valida quantità prodotti
        this.orderLines.forEach((line, index) => {
            if (!line.quantity || line.quantity <= 0) {
                errors.push(`Quantità non valida per prodotto ${index + 1}`);
            }
        });

        return errors;
    }

    canSave() {
        return this.validateOrder().length === 0;
    }

    prepareOrderData() {
        return {
            partner_id: this.selectedClient.id,
            partner_name: this.selectedClient.name,
            partner_email: this.selectedClient.email,
            partner_phone: this.selectedClient.phone,
            products: this.orderLines,
            note: this.currentOrder.note,
            general_notes: this.currentOrder.general_notes,
            internal_notes: this.currentOrder.internal_notes,
            delivery_instructions: this.currentOrder.delivery_instructions,
            validity_days: 30
        };
    }

    // === UPDATE UI HELPERS ===

    updateClientSection() {
        const clientSection = this.container?.querySelector('.client-selection');
        if (clientSection) {
            clientSection.innerHTML = this.renderClientSection();
        }
    }

    updateProductsSection() {
        const orderLines = this.container?.querySelector('.order-lines');
        if (orderLines) {
            orderLines.innerHTML = this.renderOrderLines();
        }
        this.updateTotals();
        this.updateStatusBar();
    }

    updateTotals() {
        const totalsDiv = this.container?.querySelector('.order-totals');
        if (totalsDiv) {
            totalsDiv.innerHTML = this.renderTotals();
        }
    }

    updateStatusBar() {
        const statusBar = this.container?.querySelector('.order-status-bar');
        if (statusBar) {
            statusBar.querySelector('.products-status').textContent = `Prodotti: ${this.orderLines.length}`;
            statusBar.querySelector('.total-status').textContent = `Totale: €${this.formatCurrency(this.calculateTotal())}`;
        }
    }

    updateValidationStatus() {
        const validationStatus = this.container?.querySelector('.validation-status');
        if (validationStatus) {
            validationStatus.innerHTML = this.renderValidationStatus();
        }

        // Aggiorna pulsanti save
        const saveButtons = this.container?.querySelectorAll('[data-action="save"], [data-action="save-and-print"]');
        const canSave = this.canSave();

        saveButtons?.forEach(btn => {
            btn.disabled = !canSave;
        });
    }

    // === FORMATTING ===

    formatCurrency(amount) {
        return new Intl.NumberFormat('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('it-IT');
    }

    formatAddress(client) {
        const parts = [];
        if (client.street) parts.push(client.street);
        if (client.city) parts.push(client.city);
        if (client.zip) parts.push(client.zip);
        return parts.join(', ');
    }

    /**
     * Cleanup
     */
    destroy() {
        // Cleanup event listeners se necessario
        console.log('📝 Order Screen distrutta');
    }
}

export { OrderScreen };
