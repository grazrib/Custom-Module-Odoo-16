/**
 * Widget Lista Prodotti per Raccolta Ordini
 * Ricerca, selezione, gestione quantità e scanner barcode
 */
class ProductList {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container ${containerId} non trovato`);
        }

        this.options = {
            selectionMode: options.selectionMode || 'multiple', // 'single' | 'multiple'
            showQuantity: options.showQuantity !== false,
            showBarcode: options.showBarcode !== false,
            showPrice: options.showPrice !== false,
            minSearchLength: options.minSearchLength || 2,
            maxResults: options.maxResults || 50,
            onSelect: options.onSelect || (() => {}),
            onQuantityChange: options.onQuantityChange || (() => {}),
            onBarcodeScanned: options.onBarcodeScanned || (() => {}),
            ...options
        };

        this.products = [];
        this.filteredProducts = [];
        this.selectedProducts = [];
        this.searchTimeout = null;
        this.barcodeScanner = null;

        this.init();
    }

    /**
     * Inizializza widget
     */
    init() {
        this.createHTML();
        this.setupEventListeners();
        this.loadProducts();
        this.setupBarcodeScanner();
    }

    /**
     * Crea HTML del widget
     */
    createHTML() {
        this.container.innerHTML = `
            <div class="product-list-widget">
                <!-- Header con ricerca e controlli -->
                <div class="product-header mb-4">
                    <div class="flex gap-2 mb-3">
                        <div class="flex-1 relative">
                            <input type="text"
                                   id="product-search"
                                   class="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                   placeholder="Cerca prodotti...">
                            <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                        </div>
                        ${this.options.showBarcode ? `
                        <button id="barcode-scan-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            <i class="fas fa-camera mr-2"></i>Scan
                        </button>
                        ` : ''}
                        <button id="clear-filters" class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">
                            <i class="fas fa-filter mr-2"></i>Reset
                        </button>
                    </div>

                    <!-- Filtri categoria -->
                    <div class="flex gap-2 flex-wrap" id="category-filters">
                        <!-- Popolati dinamicamente -->
                    </div>

                    <!-- Camera barcode -->
                    <div id="barcode-camera" class="hidden mt-3 relative bg-black rounded-lg overflow-hidden">
                        <!-- Camera container -->
                    </div>
                </div>

                <!-- Lista prodotti -->
                <div id="products-container" class="space-y-2 max-h-96 overflow-y-auto">
                    <div id="products-loading" class="text-center py-8 text-gray-500">
                        <i class="fas fa-spinner fa-spin mr-2"></i>Caricamento prodotti...
                    </div>
                </div>

                <!-- Prodotti selezionati -->
                ${this.options.selectionMode === 'multiple' ? `
                <div id="selected-products" class="mt-6 border-t pt-4 hidden">
                    <h4 class="font-medium text-gray-900 mb-3">Prodotti Selezionati</h4>
                    <div id="selected-products-list" class="space-y-2">
                        <!-- Lista prodotti selezionati -->
                    </div>
                    <div class="mt-3 flex justify-between items-center text-sm">
                        <span class="text-gray-600">Totale articoli: <span id="total-items">0</span></span>
                        <span class="font-medium">Totale: €<span id="total-amount">0.00</span></span>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const searchInput = this.container.querySelector('#product-search');
        const barcodeBtn = this.container.querySelector('#barcode-scan-btn');
        const clearBtn = this.container.querySelector('#clear-filters');

        // Ricerca prodotti
        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Scanner barcode
        if (barcodeBtn) {
            barcodeBtn.addEventListener('click', () => {
                this.toggleBarcodeScanner();
            });
        }

        // Reset filtri
        clearBtn.addEventListener('click', () => {
            this.clearFilters();
        });
    }

    /**
     * Carica prodotti da storage offline
     */
    async loadProducts() {
        try {
            if (window.app && window.app.offlineStorage) {
                this.products = await window.app.offlineStorage.getProducts();
            } else {
                this.products = [];
            }

            this.filteredProducts = [...this.products];
            this.updateProductList();
            this.createCategoryFilters();
            this.hideLoading();

        } catch (error) {
            console.error('Errore caricamento prodotti:', error);
            this.products = [];
            this.filteredProducts = [];
            this.showError('Errore caricamento prodotti');
        }
    }

    /**
     * Gestisce ricerca prodotti
     */
    handleSearch(query) {
        clearTimeout(this.searchTimeout);

        this.searchTimeout = setTimeout(() => {
            this.filterProducts(query);
        }, 300);
    }

    /**
     * Filtra prodotti
     */
    filterProducts(query = '', category = '') {
        let filtered = [...this.products];

        // Filtro per testo
        if (query && query.length >= this.options.minSearchLength) {
            const searchTerm = query.toLowerCase();
            filtered = filtered.filter(product =>
                product.name.toLowerCase().includes(searchTerm) ||
                (product.default_code && product.default_code.toLowerCase().includes(searchTerm)) ||
                (product.barcode && product.barcode.includes(searchTerm)) ||
                (product.description && product.description.toLowerCase().includes(searchTerm))
            );
        }

        // Filtro per categoria
        if (category) {
            filtered = filtered.filter(product =>
                product.categ_id && product.categ_id[1] === category
            );
        }

        // Limita risultati
        if (filtered.length > this.options.maxResults) {
            filtered = filtered.slice(0, this.options.maxResults);
        }

        this.filteredProducts = filtered;
        this.updateProductList();
    }

    /**
     * Aggiorna lista prodotti
     */
    updateProductList() {
        const container = this.container.querySelector('#products-container');

        if (this.filteredProducts.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-box-open text-4xl mb-2"></i>
                    <p>Nessun prodotto trovato</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.filteredProducts.map(product => this.createProductCard(product)).join('');

        // Aggiungi event listeners
        this.setupProductEvents();
    }

    /**
     * Crea card prodotto
     */
    createProductCard(product) {
        const isSelected = this.selectedProducts.find(p => p.id === product.id);
        const selectedQuantity = isSelected ? isSelected.quantity : 0;

        return `
            <div class="product-card border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}"
                 data-product-id="${product.id}">
                <div class="flex items-start gap-3">
                    <!-- Immagine prodotto -->
                    <div class="flex-shrink-0">
                        ${product.image_1920 ? `
                        <img src="data:image/png;base64,${product.image_1920}"
                             alt="${this.escapeHtml(product.name)}"
                             class="w-12 h-12 rounded object-cover">
                        ` : `
                        <div class="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                            <i class="fas fa-box text-gray-400"></i>
                        </div>
                        `}
                    </div>

                    <!-- Info prodotto -->
                    <div class="flex-1 min-w-0">
                        <h4 class="font-medium text-gray-900 truncate">${this.escapeHtml(product.name)}</h4>

                        <div class="mt-1 text-sm text-gray-600 space-y-1">
                            ${product.default_code ? `<div><span class="font-medium">Codice:</span> ${this.escapeHtml(product.default_code)}</div>` : ''}
                            ${product.barcode ? `<div><span class="font-medium">Barcode:</span> ${this.escapeHtml(product.barcode)}</div>` : ''}
                            ${product.categ_id ? `<div><span class="font-medium">Categoria:</span> ${this.escapeHtml(product.categ_id[1])}</div>` : ''}
                        </div>

                        ${this.options.showPrice && product.list_price ? `
                        <div class="mt-2 text-lg font-bold text-green-600">
                            €${product.list_price.toFixed(2)}
                        </div>
                        ` : ''}
                    </div>

                    <!-- Controlli selezione -->
                    <div class="flex-shrink-0 flex flex-col items-end gap-2">
                        ${this.options.showQuantity ? `
                        <div class="flex items-center gap-2">
                            <button class="quantity-btn minus w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center"
                                    data-product-id="${product.id}" data-action="minus" ${selectedQuantity <= 0 ? 'disabled' : ''}>
                                <i class="fas fa-minus text-xs"></i>
                            </button>
                            <input type="number"
                                   class="quantity-input w-16 text-center border border-gray-300 rounded"
                                   value="${selectedQuantity}"
                                   min="0"
                                   data-product-id="${product.id}">
                            <button class="quantity-btn plus w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center"
                                    data-product-id="${product.id}" data-action="plus">
                                <i class="fas fa-plus text-xs"></i>
                            </button>
                        </div>
                        ` : `
                        <button class="select-btn px-3 py-1 ${isSelected ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded text-sm"
                                data-product-id="${product.id}">
                            ${isSelected ? 'Rimuovi' : 'Seleziona'}
                        </button>
                        `}

                        ${isSelected ? `
                        <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            <i class="fas fa-check mr-1"></i>Selezionato
                        </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Setup eventi prodotti
     */
    setupProductEvents() {
        const container = this.container.querySelector('#products-container');

        // Pulsanti quantità
        container.querySelectorAll('.quantity-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = parseInt(btn.dataset.productId);
                const action = btn.dataset.action;
                const product = this.products.find(p => p.id === productId);

                if (product) {
                    this.handleQuantityChange(product, action);
                }
            });
        });

        // Input quantità
        container.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const productId = parseInt(input.dataset.productId);
                const quantity = parseInt(e.target.value) || 0;
                const product = this.products.find(p => p.id === productId);

                if (product) {
                    this.setProductQuantity(product, quantity);
                }
            });
        });

        // Pulsanti selezione
        container.querySelectorAll('.select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = parseInt(btn.dataset.productId);
                const product = this.products.find(p => p.id === productId);

                if (product) {
                    this.toggleProductSelection(product);
                }
            });
        });

        // Click su card prodotto
        container.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => {
                const productId = parseInt(card.dataset.productId);
                const product = this.products.find(p => p.id === productId);

                if (product && this.options.selectionMode === 'single') {
                    this.selectProduct(product);
                }
            });
        });
    }

    /**
     * Gestisce cambio quantità
     */
    handleQuantityChange(product, action) {
        const currentSelection = this.selectedProducts.find(p => p.id === product.id);
        let newQuantity = 0;

        if (currentSelection) {
            newQuantity = action === 'plus' ? currentSelection.quantity + 1 : currentSelection.quantity - 1;
        } else {
            newQuantity = action === 'plus' ? 1 : 0;
        }

        this.setProductQuantity(product, Math.max(0, newQuantity));
    }

    /**
     * Imposta quantità prodotto
     */
    setProductQuantity(product, quantity) {
        const existingIndex = this.selectedProducts.findIndex(p => p.id === product.id);

        if (quantity <= 0) {
            // Rimuovi prodotto se quantità 0
            if (existingIndex >= 0) {
                this.selectedProducts.splice(existingIndex, 1);
            }
        } else {
            // Aggiungi o aggiorna prodotto
            const productData = {
                ...product,
                quantity: quantity,
                subtotal: product.list_price ? product.list_price * quantity : 0
            };

            if (existingIndex >= 0) {
                this.selectedProducts[existingIndex] = productData;
            } else {
                this.selectedProducts.push(productData);
            }
        }

        this.updateProductList();
        this.updateSelectedProducts();
        this.options.onQuantityChange(product, quantity);
    }

    /**
     * Toggle selezione prodotto (senza quantità)
     */
    toggleProductSelection(product) {
        const existingIndex = this.selectedProducts.findIndex(p => p.id === product.id);

        if (existingIndex >= 0) {
            this.selectedProducts.splice(existingIndex, 1);
        } else {
            this.selectedProducts.push({
                ...product,
                quantity: 1,
                subtotal: product.list_price || 0
            });
        }

        this.updateProductList();
        this.updateSelectedProducts();
        this.options.onSelect(product, existingIndex < 0);
    }

    /**
     * Seleziona prodotto singolo
     */
    selectProduct(product) {
        this.selectedProducts = [{
            ...product,
            quantity: 1,
            subtotal: product.list_price || 0
        }];

        this.updateProductList();
        this.updateSelectedProducts();
        this.options.onSelect(product, true);
    }

    /**
     * Aggiorna lista prodotti selezionati
     */
    updateSelectedProducts() {
        const container = this.container.querySelector('#selected-products');
        const listContainer = this.container.querySelector('#selected-products-list');

        if (!container || !listContainer) return;

        if (this.selectedProducts.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        listContainer.innerHTML = this.selectedProducts.map(product => `
            <div class="selected-product flex items-center gap-3 p-3 bg-gray-50 rounded border">
                <div class="flex-1">
                    <h5 class="font-medium text-gray-900">${this.escapeHtml(product.name)}</h5>
                    <div class="text-sm text-gray-600">
                        ${product.default_code ? `Codice: ${this.escapeHtml(product.default_code)} • ` : ''}
                        Qtà: ${product.quantity}
                        ${this.options.showPrice ? ` • €${product.list_price?.toFixed(2) || '0.00'} cad.` : ''}
                    </div>
                </div>
                <div class="text-right">
                    ${this.options.showPrice ? `
                    <div class="font-medium text-green-600">€${product.subtotal?.toFixed(2) || '0.00'}</div>
                    ` : ''}
                    <button class="remove-selected text-red-500 hover:text-red-700 ml-2"
                            data-product-id="${product.id}">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Event listeners rimozione
        listContainer.querySelectorAll('.remove-selected').forEach(btn => {
            btn.addEventListener('click', () => {
                const productId = parseInt(btn.dataset.productId);
                this.removeSelectedProduct(productId);
            });
        });

        // Aggiorna totali
        this.updateTotals();
    }

    /**
     * Rimuovi prodotto selezionato
     */
    removeSelectedProduct(productId) {
        const index = this.selectedProducts.findIndex(p => p.id === productId);
        if (index >= 0) {
            this.selectedProducts.splice(index, 1);
            this.updateProductList();
            this.updateSelectedProducts();
        }
    }

    /**
     * Aggiorna totali
     */
    updateTotals() {
        const totalItems = this.selectedProducts.reduce((sum, p) => sum + p.quantity, 0);
        const totalAmount = this.selectedProducts.reduce((sum, p) => sum + (p.subtotal || 0), 0);

        const itemsSpan = this.container.querySelector('#total-items');
        const amountSpan = this.container.querySelector('#total-amount');

        if (itemsSpan) itemsSpan.textContent = totalItems;
        if (amountSpan) amountSpan.textContent = totalAmount.toFixed(2);
    }

    /**
     * Crea filtri categoria
     */
    createCategoryFilters() {
        const container = this.container.querySelector('#category-filters');
        if (!container) return;

        // Estrai categorie uniche
        const categories = [...new Set(
            this.products
                .filter(p => p.categ_id)
                .map(p => p.categ_id[1])
        )].sort();

        if (categories.length === 0) return;

        container.innerHTML = categories.map(category => `
            <button class="category-filter px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-full"
                    data-category="${this.escapeHtml(category)}">
                ${this.escapeHtml(category)}
            </button>
        `).join('');

        // Event listeners
        container.querySelectorAll('.category-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                this.filterByCategory(category);

                // Evidenzia filtro attivo
                container.querySelectorAll('.category-filter').forEach(b =>
                    b.classList.remove('bg-blue-500', 'text-white'));
                btn.classList.add('bg-blue-500', 'text-white');
            });
        });
    }

    /**
     * Filtra per categoria
     */
    filterByCategory(category) {
        const searchInput = this.container.querySelector('#product-search');
        this.filterProducts(searchInput.value, category);
    }

    /**
     * Reset filtri
     */
    clearFilters() {
        const searchInput = this.container.querySelector('#product-search');
        const categoryFilters = this.container.querySelectorAll('.category-filter');

        searchInput.value = '';
        categoryFilters.forEach(btn =>
            btn.classList.remove('bg-blue-500', 'text-white'));

        this.filteredProducts = [...this.products];
        this.updateProductList();
    }

    /**
     * Setup scanner barcode
     */
    setupBarcodeScanner() {
        if (!this.options.showBarcode) return;

        this.barcodeScanner = new window.BarcodeScanner({
            cameraSelector: '#barcode-camera',
            onScan: (barcode) => this.handleBarcodeScanned(barcode),
            onError: (error) => this.showError(error)
        });
    }

    /**
     * Toggle scanner barcode
     */
    toggleBarcodeScanner() {
        if (this.barcodeScanner) {
            const cameraContainer = this.container.querySelector('#barcode-camera');

            if (cameraContainer.classList.contains('hidden')) {
                cameraContainer.classList.remove('hidden');
                this.barcodeScanner.startCamera();
            } else {
                cameraContainer.classList.add('hidden');
                this.barcodeScanner.stopCamera();
            }
        }
    }

    /**
     * Gestisce barcode scansionato
     */
    handleBarcodeScanned(barcode) {
        // Cerca prodotto per barcode
        const product = this.products.find(p =>
            p.barcode === barcode ||
            p.default_code === barcode
        );

        if (product) {
            // Aggiungi quantità se già selezionato
            const existingSelection = this.selectedProducts.find(p => p.id === product.id);
            const newQuantity = existingSelection ? existingSelection.quantity + 1 : 1;

            this.setProductQuantity(product, newQuantity);

            // Mostra notifica
            this.showNotification(`Prodotto aggiunto: ${product.name}`, 'success');

            // Callback
            this.options.onBarcodeScanned(barcode, product);
        } else {
            this.showNotification(`Prodotto non trovato: ${barcode}`, 'warning');
        }

        // Nascondi camera
        const cameraContainer = this.container.querySelector('#barcode-camera');
        cameraContainer.classList.add('hidden');
        this.barcodeScanner.stopCamera();
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
     * Mostra errore
     */
    showError(message) {
        const container = this.container.querySelector('#products-container');
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
    }

    /**
     * Nascondi loading
     */
    hideLoading() {
        const loading = this.container.querySelector('#products-loading');
        if (loading) {
            loading.remove();
        }
    }

    /**
     * Ottieni prodotti selezionati
     */
    getSelectedProducts() {
        return [...this.selectedProducts];
    }

    /**
     * Imposta prodotti selezionati
     */
    setSelectedProducts(products) {
        this.selectedProducts = products.map(p => ({
            ...p,
            subtotal: p.list_price ? p.list_price * p.quantity : 0
        }));

        this.updateProductList();
        this.updateSelectedProducts();
    }

    /**
     * Cancella selezione
     */
    clearSelection() {
        this.selectedProducts = [];
        this.updateProductList();
        this.updateSelectedProducts();
    }

    /**
     * Ricarica prodotti
     */
    async refresh() {
        await this.loadProducts();
    }

    /**
     * Cerca prodotto per ID
     */
    findProductById(id) {
        return this.products.find(p => p.id === id);
    }

    /**
     * Cerca prodotto per barcode
     */
    findProductByBarcode(barcode) {
        return this.products.find(p => p.barcode === barcode || p.default_code === barcode);
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
        if (this.barcodeScanner) {
            this.barcodeScanner.destroy();
        }
    }
}

// Export per uso globale
window.ProductList = ProductList;

export { ProductList };
