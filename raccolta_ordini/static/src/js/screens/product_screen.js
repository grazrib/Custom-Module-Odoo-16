/**
 * Product Screen - Modal per selezione prodotti
 * Popup catalogo prodotti con ricerca, filtri e scansione barcode
 */

class ProductScreen {
    constructor() {
        this.modal = null;
        this.products = [];
        this.filteredProducts = [];
        this.selectedProduct = null;
        this.searchQuery = '';
        this.categoryFilter = '';
        this.resolveCallback = null;
    }

    /**
     * Apre modal selezione prodotto
     */
    async selectProduct() {
        return new Promise(async (resolve) => {
            this.resolveCallback = resolve;

            // Carica prodotti
            await this.loadProducts();

            // Crea e mostra modal
            this.createModal();
            this.render();
            this.bindEvents();

            console.log('🛍️ Product Screen aperta');
        });
    }

    /**
     * Carica lista prodotti
     */
    async loadProducts() {
        try {
            const storage = window.RaccoltaApp.getModel('storage');
            this.products = await storage.getProducts();

            // Filtra solo prodotti vendibili
            this.products = this.products.filter(p => p.sale_ok !== false);
            this.filteredProducts = [...this.products];

        } catch (error) {
            console.error('Errore caricamento prodotti:', error);
            this.products = [];
            this.filteredProducts = [];
        }
    }

    /**
     * Crea modal DOM
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'product-modal-overlay';
        document.body.appendChild(this.modal);
    }

    /**
     * Render interfaccia prodotti
     */
    render() {
        if (!this.modal) return;

        this.modal.innerHTML = `
            <div class="product-modal">
                <!-- Header modal -->
                <div class="modal-header">
                    <h3>🛍️ Seleziona Prodotto</h3>
                    <button class="modal-close" data-action="close">✕</button>
                </div>

                <!-- Ricerca e filtri -->
                <div class="modal-search">
                    <div class="search-row">
                        <div class="search-box">
                            <input type="text" class="search-input" placeholder="Cerca prodotto per nome o codice..."
                                   value="${this.searchQuery}" data-action="search">
                            <button class="search-clear" data-action="clear-search" ${this.searchQuery ? '' : 'style="display:none"'}>✕</button>
                        </div>

                        <div class="filter-box">
                            <select class="category-filter" data-action="filter-category">
                                <option value="">Tutte le categorie</option>
                                ${this.renderCategoryOptions()}
                            </select>
                        </div>
                    </div>

                    <div class="search-actions">
                        <button class="btn-scan-barcode" data-action="scan-barcode">
                            📱 Scansiona Codice
                        </button>
                        <button class="btn-refresh" data-action="refresh">
                            🔄 Aggiorna
                        </button>
                        <button class="btn-grid-view active" data-action="grid-view">
                            ⊞ Griglia
                        </button>
                        <button class="btn-list-view" data-action="list-view">
                            ☰ Lista
                        </button>
                    </div>
                </div>

                <!-- Lista prodotti -->
                <div class="modal-content">
                    <div class="products-container">
                        ${this.renderProductsList()}
                    </div>
                </div>

                <!-- Footer -->
                <div class="modal-footer">
                    <div class="footer-info">
                        Trovati ${this.filteredProducts.length} prodotti
                        ${this.searchQuery ? ` per "${this.searchQuery}"` : ''}
                        ${this.categoryFilter ? ` in "${this.categoryFilter}"` : ''}
                    </div>

                    <div class="footer-actions">
                        <button class="btn-cancel" data-action="cancel">
                            Annulla
                        </button>
                        <button class="btn-select" data-action="select" ${!this.selectedProduct ? 'disabled' : ''}>
                            Aggiungi Prodotto
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render opzioni categorie
     */
    renderCategoryOptions() {
        const categories = [...new Set(this.products
            .map(p => p.categ_id && p.categ_id[1])
            .filter(Boolean)
        )].sort();

        return categories.map(cat =>
            `<option value="${cat}" ${this.categoryFilter === cat ? 'selected' : ''}>${cat}</option>`
        ).join('');
    }

    /**
     * Render lista prodotti
     */
    renderProductsList() {
        if (this.filteredProducts.length === 0) {
            return this.renderEmptyState();
        }

        const viewMode = this.modal?.querySelector('.btn-grid-view.active') ? 'grid' : 'list';

        return `
            <div class="products-${viewMode}">
                ${this.filteredProducts.map(product => this.renderProductItem(product, viewMode)).join('')}
            </div>
        `;
    }

    /**
     * Render singolo prodotto
     */
    renderProductItem(product, viewMode = 'grid') {
        const isSelected = this.selectedProduct?.id === product.id;
        const hasImage = product.image_128 || product.image_medium;

        if (viewMode === 'grid') {
            return `
                <div class="product-card ${isSelected ? 'selected' : ''}" data-product-id="${product.id}">
                    <div class="product-image">
                        ${hasImage ?
                            `<img src="data:image/png;base64,${product.image_128 || product.image_medium}" alt="${product.name}">` :
                            '<div class="no-image">📦</div>'
                        }
                        ${product.default_code ? `<div class="product-code">${product.default_code}</div>` : ''}
                    </div>

                    <div class="product-info">
                        <div class="product-name" title="${product.name}">${product.name}</div>

                        ${product.list_price ? `
                            <div class="product-price">€${this.formatCurrency(product.list_price)}</div>
                        ` : ''}

                        ${product.categ_id ? `
                            <div class="product-category">${product.categ_id[1]}</div>
                        ` : ''}

                        <div class="product-stock">
                            ${this.getStockStatus(product)}
                        </div>
                    </div>

                    <div class="product-actions">
                        <button class="btn-product-select" data-action="select-product" title="Seleziona">
                            ✓
                        </button>
                        <button class="btn-product-details" data-action="product-details" title="Dettagli">
                            👁️
                        </button>
                    </div>

                    ${isSelected ? '<div class="selection-indicator">✓</div>' : ''}
                </div>
            `;
        } else {
            return `
                <div class="product-row ${isSelected ? 'selected' : ''}" data-product-id="${product.id}">
                    <div class="product-image-small">
                        ${hasImage ?
                            `<img src="data:image/png;base64,${product.image_128 || product.image_medium}" alt="${product.name}">` :
                            '<div class="no-image-small">📦</div>'
                        }
                    </div>

                    <div class="product-main-info">
                        <div class="product-name">${product.name}</div>
                        ${product.default_code ? `<div class="product-code">Cod: ${product.default_code}</div>` : ''}
                        ${product.categ_id ? `<div class="product-category">${product.categ_id[1]}</div>` : ''}
                    </div>

                    <div class="product-price-info">
                        ${product.list_price ? `€${this.formatCurrency(product.list_price)}` : 'N/A'}
                        <div class="product-uom">${product.uom_name || 'Pz'}</div>
                    </div>

                    <div class="product-stock-info">
                        ${this.getStockStatus(product)}
                    </div>

                    <div class="product-row-actions">
                        <button class="btn-product-select" data-action="select-product" title="Seleziona">
                            ✓
                        </button>
                        <button class="btn-product-details" data-action="product-details" title="Dettagli">
                            👁️
                        </button>
                    </div>

                    ${isSelected ? '<div class="selection-indicator">✓ Selezionato</div>' : ''}
                </div>
            `;
        }
    }

    /**
     * Render stato vuoto
     */
    renderEmptyState() {
        if (this.searchQuery || this.categoryFilter) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">Nessun prodotto trovato</div>
                    <div class="empty-message">
                        Nessun prodotto corrisponde ai filtri applicati
                    </div>
                    <div class="empty-actions">
                        <button class="btn-clear-filters" data-action="clear-filters">
                            Cancella filtri
                        </button>
                        <button class="btn-scan-barcode" data-action="scan-barcode">
                            Scansiona codice
                        </button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <div class="empty-title">Nessun prodotto disponibile</div>
                    <div class="empty-message">
                        Non ci sono prodotti nel catalogo locale.
                        Sincronizza con il server per scaricare i prodotti.
                    </div>
                    <div class="empty-actions">
                        <button class="btn-refresh" data-action="refresh">
                            Sincronizza prodotti
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Ottiene stato stock prodotto
     */
    getStockStatus(product) {
        const qty = product.qty_available || 0;

        if (qty > 10) {
            return '<span class="stock-available">✅ Disponibile</span>';
        } else if (qty > 0) {
            return `<span class="stock-low">⚠️ Pochi (${qty})</span>`;
        } else {
            return '<span class="stock-empty">❌ Esaurito</span>';
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
            const productId = e.target.closest('.product-card, .product-row')?.dataset.productId;

            if (action) {
                this.handleAction(action, productId, e.target);
            }
        });

        // Eventi ricerca
        this.modal.addEventListener('input', (e) => {
            if (e.target.dataset.action === 'search') {
                this.handleSearch(e.target.value);
            }
        });

        // Eventi filtro categoria
        this.modal.addEventListener('change', (e) => {
            if (e.target.dataset.action === 'filter-category') {
                this.handleCategoryFilter(e.target.value);
            }
        });

        // Eventi tastiera
        this.modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal(null);
            } else if (e.key === 'Enter') {
                if (this.selectedProduct) {
                    this.closeModal(this.selectedProduct);
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
    async handleAction(action, productId, target) {
        try {
            switch (action) {
                case 'close':
                case 'cancel':
                    this.closeModal(null);
                    break;

                case 'select':
                    this.closeModal(this.selectedProduct);
                    break;

                case 'select-product':
                    this.selectProductById(parseInt(productId));
                    break;

                case 'product-details':
                    await this.showProductDetails(parseInt(productId));
                    break;

                case 'scan-barcode':
                    await this.scanBarcode();
                    break;

                case 'refresh':
                    await this.refreshProducts();
                    break;

                case 'clear-search':
                    this.clearSearch();
                    break;

                case 'clear-filters':
                    this.clearAllFilters();
                    break;

                case 'grid-view':
                    this.switchToGridView();
                    break;

                case 'list-view':
                    this.switchToListView();
                    break;

                default:
                    console.warn('Azione product non riconosciuta:', action);
            }
        } catch (error) {
            console.error(`Errore azione product ${action}:`, error);
            window.RaccoltaApp.getModel('notification').error(`Errore: ${error.message}`);
        }
    }

    /**
     * Gestisce ricerca prodotti
     */
    handleSearch(query) {
        this.searchQuery = query.toLowerCase();
        this.applyFilters();
    }

    /**
     * Gestisce filtro categoria
     */
    handleCategoryFilter(category) {
        this.categoryFilter = category;
        this.applyFilters();
    }

    /**
     * Applica tutti i filtri
     */
    applyFilters() {
        this.filteredProducts = this.products.filter(product => {
            // Filtro ricerca
            const searchMatch = !this.searchQuery ||
                product.name.toLowerCase().includes(this.searchQuery) ||
                (product.default_code && product.default_code.toLowerCase().includes(this.searchQuery)) ||
                (product.barcode && product.barcode.includes(this.searchQuery));

            // Filtro categoria
            const categoryMatch = !this.categoryFilter ||
                (product.categ_id && product.categ_id[1] === this.categoryFilter);

            return searchMatch && categoryMatch;
        });

        // Aggiorna lista
        this.updateProductsList();

        // Reset selezione se il prodotto selezionato non è più visibile
        if (this.selectedProduct && !this.filteredProducts.find(p => p.id === this.selectedProduct.id)) {
            this.selectedProduct = null;
            this.updateFooter();
        }
    }

    /**
     * Seleziona prodotto per ID
     */
    selectProductById(productId) {
        const product = this.filteredProducts.find(p => p.id === productId);

        if (product) {
            this.selectedProduct = product;

            // Aggiorna UI
            this.updateProductSelection();
            this.updateFooter();
        }
    }

    /**
     * Mostra dettagli prodotto
     */
    async showProductDetails(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        const detailsModal = document.createElement('div');
        detailsModal.className = 'product-details-overlay';
        detailsModal.innerHTML = `
            <div class="product-details-modal">
                <div class="details-header">
                    <h3>📦 Dettagli Prodotto</h3>
                    <button class="details-close">✕</button>
                </div>

                <div class="details-content">
                    <div class="product-image-section">
                        ${product.image_128 ?
                            `<img src="data:image/png;base64,${product.image_128}" alt="${product.name}" class="product-image-large">` :
                            '<div class="no-image-large">📦</div>'
                        }
                    </div>

                    <div class="product-info-section">
                        <h4>${product.name}</h4>

                        <div class="detail-grid">
                            ${product.default_code ? `
                                <div class="detail-item">
                                    <label>Codice:</label>
                                    <span>${product.default_code}</span>
                                </div>
                            ` : ''}

                            ${product.barcode ? `
                                <div class="detail-item">
                                    <label>Barcode:</label>
                                    <span>${product.barcode}</span>
                                </div>
                            ` : ''}

                            ${product.categ_id ? `
                                <div class="detail-item">
                                    <label>Categoria:</label>
                                    <span>${product.categ_id[1]}</span>
                                </div>
                            ` : ''}

                            <div class="detail-item">
                                <label>Prezzo:</label>
                                <span>€${this.formatCurrency(product.list_price || 0)}</span>
                            </div>

                            <div class="detail-item">
                                <label>Unità di misura:</label>
                                <span>${product.uom_name || 'Pz'}</span>
                            </div>

                            <div class="detail-item">
                                <label>Disponibilità:</label>
                                <span>${this.getStockStatus(product)}</span>
                            </div>

                            <div class="detail-item">
                                <label>Vendibile:</label>
                                <span>${product.sale_ok ? '✅ Sì' : '❌ No'}</span>
                            </div>
                        </div>

                        ${product.description_sale ? `
                            <div class="product-description">
                                <h5>Descrizione:</h5>
                                <p>${product.description_sale}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="details-footer">
                    <button class="btn-details-close">Chiudi</button>
                    <button class="btn-select-this" data-product-id="${product.id}">
                        Seleziona questo prodotto
                    </button>
                </div>
            </div>
        `;

        // Bind eventi
        detailsModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('product-details-overlay') ||
                e.target.classList.contains('details-close') ||
                e.target.classList.contains('btn-details-close')) {
                detailsModal.remove();
            } else if (e.target.classList.contains('btn-select-this')) {
                const productId = parseInt(e.target.dataset.productId);
                this.selectProductById(productId);
                detailsModal.remove();
            }
        });

        document.body.appendChild(detailsModal);
    }

    /**
     * Scansiona barcode
     */
    async scanBarcode() {
        try {
            const barcodeScanner = window.RaccoltaApp.getModel('barcodeScanner');
            const barcode = await barcodeScanner.scan();

            if (barcode) {
                // Cerca prodotto per barcode
                const product = this.products.find(p => p.barcode === barcode);

                if (product) {
                    this.selectedProduct = product;
                    this.closeModal(this.selectedProduct);
                } else {
                    window.RaccoltaApp.getModel('notification').warning(
                        `Prodotto non trovato per barcode: ${barcode}`
                    );
                }
            }

        } catch (error) {
            window.RaccoltaApp.getModel('notification').error('Errore scansione barcode');
        }
    }

    /**
     * Aggiorna lista prodotti dal server
     */
    async refreshProducts() {
        try {
            window.RaccoltaApp.getModel('notification').info('Aggiornamento prodotti...');

            // Ricarica da server se online
            if (navigator.onLine) {
                const response = await window.RaccoltaApp.rpc('/raccolta/load_products');
                const storage = window.RaccoltaApp.getModel('storage');
                await storage.saveProducts(response.products);
            }

            // Ricarica lista locale
            await this.loadProducts();
            this.applyFilters();

            window.RaccoltaApp.getModel('notification').success('Prodotti aggiornati');

        } catch (error) {
            window.RaccoltaApp.getModel('notification').error('Errore aggiornamento prodotti');
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
        this.applyFilters();
    }

    /**
     * Pulisce tutti i filtri
     */
    clearAllFilters() {
        this.searchQuery = '';
        this.categoryFilter = '';

        const searchInput = this.modal?.querySelector('.search-input');
        const categorySelect = this.modal?.querySelector('.category-filter');

        if (searchInput) searchInput.value = '';
        if (categorySelect) categorySelect.value = '';

        this.applyFilters();
    }

    /**
     * Cambia a vista griglia
     */
    switchToGridView() {
        const gridBtn = this.modal?.querySelector('.btn-grid-view');
        const listBtn = this.modal?.querySelector('.btn-list-view');

        if (gridBtn && listBtn) {
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
            this.updateProductsList();
        }
    }

    /**
     * Cambia a vista lista
     */
    switchToListView() {
        const gridBtn = this.modal?.querySelector('.btn-grid-view');
        const listBtn = this.modal?.querySelector('.btn-list-view');

        if (gridBtn && listBtn) {
            gridBtn.classList.remove('active');
            listBtn.classList.add('active');
            this.updateProductsList();
        }
    }

    /**
     * Chiude modal
     */
    closeModal(selectedProduct) {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }

        if (this.resolveCallback) {
            this.resolveCallback(selectedProduct);
            this.resolveCallback = null;
        }

        console.log('🛍️ Product Screen chiusa');
    }

    // === UPDATE UI HELPERS ===

    updateProductsList() {
        const container = this.modal?.querySelector('.products-container');
        if (container) {
            container.innerHTML = this.renderProductsList();
        }
        this.updateFooter();
    }

    updateProductSelection() {
        // Rimuovi selezione precedente
        this.modal?.querySelectorAll('.product-card, .product-row').forEach(item => {
            item.classList.remove('selected');
            item.querySelector('.selection-indicator')?.remove();
        });

        // Aggiungi nuova selezione
        if (this.selectedProduct) {
            const selectedItem = this.modal?.querySelector(`[data-product-id="${this.selectedProduct.id}"]`);
            if (selectedItem) {
                selectedItem.classList.add('selected');

                const isGrid = selectedItem.classList.contains('product-card');
                const indicator = isGrid ? '<div class="selection-indicator">✓</div>' :
                                         '<div class="selection-indicator">✓ Selezionato</div>';

                selectedItem.insertAdjacentHTML('beforeend', indicator);
            }
        }
    }

    updateFooter() {
        const footerInfo = this.modal?.querySelector('.footer-info');
        const selectBtn = this.modal?.querySelector('[data-action="select"]');

        if (footerInfo) {
            let text = `Trovati ${this.filteredProducts.length} prodotti`;
            if (this.searchQuery) text += ` per "${this.searchQuery}"`;
            if (this.categoryFilter) text += ` in "${this.categoryFilter}"`;
            footerInfo.textContent = text;
        }

        if (selectBtn) {
            selectBtn.disabled = !this.selectedProduct;
        }
    }

    // === UTILITY ===

    formatCurrency(amount) {
        return new Intl.NumberFormat('it-IT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }
}

export { ProductScreen };
