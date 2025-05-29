odoo.define('inventory_adjustment.mobile_form', function (require) {
    "use strict";

    var FormController = require('web.FormController');
    var FormView = require('web.FormView');
    var FormRenderer = require('web.FormRenderer');
    var viewRegistry = require('web.view_registry');
    var core = require('web.core');
    var _t = core._t;
    var rpc = require('web.rpc');

    var InventoryAdjustmentMobileController = FormController.extend({
        events: _.extend({}, FormController.prototype.events, {
            'click .btn-scan-barcode': '_onScanBarcode',
            'keyup #search_input': '_onSearchInputKeyup',
            'click .quantity-editable': '_onQuantityClick',
            'click .search-result-item': '_onSearchResultItemClick',
        }),

        /**
         * Nasconde i pulsanti di salvataggio e abbandono
         * e il paginatore nel renderizzatore
         */
        _updateButtons: function () {
            this._super.apply(this, arguments);
            if (this.$buttons) {
                this.$buttons.find('.o_form_button_save').hide();
                this.$buttons.find('.o_form_button_cancel').hide();
            }
        },

        _onSearchInputKeyup: function(ev) {
            if (ev.keyCode === 13) {
                this._searchProduct($(ev.currentTarget).val());
            }
        },

        _onQuantityClick: function(ev) {
            var self = this;
            var currentValue = this.renderer.state.data.quantity || 0;
            var $dialog = $('<div class="modal" role="dialog">')
                .append($('<div class="modal-dialog">')
                    .append($('<div class="modal-content">')
                        .append($('<div class="modal-header">')
                            .append($('<h5 class="modal-title">').text(_t('Modifica Quantità')))
                            .append($('<button type="button" class="close" data-dismiss="modal">&times;</button>')))
                        .append($('<div class="modal-body">')
                            .append($('<input type="number" class="form-control" id="quantityInput">').val(currentValue)))
                        .append($('<div class="modal-footer">')
                            .append($('<button type="button" class="btn btn-secondary" data-dismiss="modal">').text(_t('Annulla')))
                            .append($('<button type="button" class="btn btn-primary" id="saveQuantity">').text(_t('Salva'))))));
            $dialog.appendTo('body');
            $dialog.modal('show');
            $dialog.find('#saveQuantity').on('click', function() {
                var newValue = parseFloat($dialog.find('#quantityInput').val()) || 0;
                self.trigger_up('field_changed', {
                    dataPointID: self.renderer.state.id,
                    changes: {
                        quantity: newValue,
                    },
                });
                $dialog.modal('hide');
            });
            $dialog.on('hidden.bs.modal', function() {
                $dialog.remove();
            });
        },

        _loadProduct: function(productId) {
            var self = this;
            return this._rpc({
                model: 'product.product',
                method: 'read',
                args: [[productId], ['name', 'barcode', 'list_price', 'standard_price', 'image_1920', 'type']],
            }).then(function(products) {
                if (!products || !products.length) return;
                var product = products[0];
                self.trigger_up('field_changed', {
                    dataPointID: self.renderer.state.id,
                    changes: {
                        product_id: {id: product.id, display_name: product.name},
                        barcode: product.barcode || '',
                        product_name: product.name,
                        purchase_price: product.standard_price,
                        sale_price: product.list_price,
                    },
                });
                self._getProductQuantity(product.id);
            }).guardedCatch(function(error) {
                console.error("Error loading product:", error);
            });
        },

        _onScanBarcode: function (ev) {
            ev.preventDefault();
            var self = this;

            this.do_action({
                type: 'ir.actions.client',
                tag: 'inventory_adjustment.barcode_scanner',
                target: 'new',
                params: {
                    model: 'inventory.adjustment',
                    field: 'barcode',
                    callback: function(barcode) {
                        self._rpc({
                            route: '/inventory_adjustment/search_product',
                            params: {
                                query: barcode
                            }
                        }).then(function(result) {
                            if (result.success && result.products.length > 0) {
                                var exactMatch = _.find(result.products, function(prod) {
                                    return prod.barcode === barcode;
                                });
                                if (exactMatch) {
                                    self._loadProduct(exactMatch.id);
                                } else if (result.products.length === 1) {
                                    self._loadProduct(result.products[0].id);
                                } else {
                                    self._showProductSearchResults(result.products);
                                }
                            } else {
                                self.displayNotification({
                                    title: _t('Prodotto non trovato'),
                                    message: _t('Nessun prodotto trovato con questo codice a barre.'),
                                    type: 'warning'
                                });
                            }
                        });
                    }
                }
            });
        },

        _updateQuantity: function (action) {
            var record = this.renderer.state.data;
            var quantity = record.quantity || 0;
            if (action === 'add') {
                quantity += 1;
            } else if (action === 'subtract' && quantity > 0) {
                quantity -= 1;
            }
            this.trigger_up('field_changed', {
                dataPointID: this.renderer.state.id,
                changes: {
                    quantity: quantity,
                },
            });
        },

        _onButtonClicked: function (event) {
            var name = event.data.attrs.name;
            if (name === 'increase_quantity') {
                this._updateQuantity('add');
                event.stopPropagation();
                return;
            } else if (name === 'decrease_quantity') {
                this._updateQuantity('subtract');
                event.stopPropagation();
                return;
            } else if (name === 'action_search_product') {
                var searchInput = this.$('#search_input').val();
                if (searchInput) {
                    this._searchProduct(searchInput);
                    event.stopPropagation();
                    return;
                }
            } else if (name === 'action_update_image') {
                this._updateProductImage();
                event.stopPropagation();
                return;
            } else if (name === 'action_update_barcode') {
                this._updateProductBarcode();
                event.stopPropagation();
                return;
            } else {
                this._super.apply(this, arguments);
            }
        },

        _updateProductImage: function() {
            var self = this;
            var productId = this.renderer.state.data.product_id.data.id;

            if (!productId) {
                this.displayNotification({
                    title: _t('Errore'),
                    message: _t('Nessun prodotto selezionato'),
                    type: 'warning'
                });
                return;
            }
            var $fileInput = $('<input type="file" accept="image/*">').hide();
            $fileInput.appendTo('body');
            $fileInput.trigger('click');
            $fileInput.on('change', function(e) {
                var file = e.target.files[0];
                if (!file) {
                    $fileInput.remove();
                    return;
                }
                var reader = new FileReader();
                reader.onload = function(event) {
                    var base64 = event.target.result.split(',')[1];
                    self._rpc({
                        model: 'inventory.adjustment',
                        method: 'action_update_product_image',
                        args: [productId, base64]
                    }).then(function(result) {
                        if (result) {
                            self.trigger_up('reload');
                            self.displayNotification({
                                title: _t('Successo'),
                                message: _t('Immagine prodotto aggiornata'),
                                type: 'success'
                            });
                        } else {
                            self.displayNotification({
                                title: _t('Errore'),
                                message: _t('Impossibile aggiornare l\'immagine'),
                                type: 'danger'
                            });
                        }
                    });
                };
                reader.readAsDataURL(file);
                $fileInput.remove();
            });
        },

        _updateProductBarcode: function() {
            var self = this;
            var productId = this.renderer.state.data.product_id.data.id;
            if (!productId) {
                this.displayNotification({
                    title: _t('Errore'),
                    message: _t('Nessun prodotto selezionato'),
                    type: 'warning'
                });
                return;
            }
            var $dialog = $('<div class="modal" role="dialog">')
                .append($('<div class="modal-dialog">')
                    .append($('<div class="modal-content">')
                        .append($('<div class="modal-header">')
                            .append($('<h5 class="modal-title">').text(_t('Aggiorna Barcode')))
                            .append($('<button type="button" class="close" data-dismiss="modal">&times;</button>')))
                        .append($('<div class="modal-body">')
                            .append($('<div class="form-group">')
                                .append($('<label>').text(_t('Nuovo Barcode')))
                                .append($('<input type="text" class="form-control" id="newBarcode">').val(this.renderer.state.data.barcode || '')))
                            .append($('<div class="text-center mt-3">')
                                .append($('<button class="btn btn-info" id="scanBarcodeBtn">').text(_t('Scansiona')))))
                        .append($('<div class="modal-footer">')
                            .append($('<button type="button" class="btn btn-secondary" data-dismiss="modal">').text(_t('Annulla')))
                            .append($('<button type="button" class="btn btn-primary" id="saveBarcodeBtn">').text(_t('Salva'))))));
            $dialog.appendTo('body');
            $dialog.modal('show');
            $dialog.find('#scanBarcodeBtn').on('click', function() {
                $dialog.modal('hide');
                self.do_action({
                    type: 'ir.actions.client',
                    tag: 'inventory_adjustment.barcode_scanner',
                    target: 'new',
                    params: {
                        callback: function(barcode) {
                            $dialog.find('#newBarcode').val(barcode);
                            $dialog.modal('show');
                        }
                    }
                });
            });
            $dialog.find('#saveBarcodeBtn').on('click', function() {
                var newBarcode = $dialog.find('#newBarcode').val();
                self._rpc({
                    model: 'inventory.adjustment',
                    method: 'action_update_product_barcode',
                    args: [productId, newBarcode]
                }).then(function(result) {
                    if (result.success) {
                        self.trigger_up('field_changed', {
                            dataPointID: self.renderer.state.id,
                            changes: {
                                barcode: newBarcode,
                            },
                        });
                        $dialog.modal('hide');
                        self.displayNotification({
                            title: _t('Successo'),
                            message: result.message,
                            type: 'success'
                        });
                    } else {
                        self.displayNotification({
                            title: _t('Errore'),
                            message: result.message,
                            type: 'warning'
                        });
                    }
                });
            });
            $dialog.on('hidden.bs.modal', function() {
                $dialog.remove();
            });
        },

        _searchProduct: function(term) {
            var self = this;
            if (!term || term.length < 1) return;
            return this._rpc({
                route: '/inventory_adjustment/search_product',
                params: {
                    query: term
                }
            }).then(function(result) {
                if (result.success && result.products.length > 0) {
                    if (result.products.length === 1) {
                        self._loadProduct(result.products[0].id);
                    } else {
                        self._showProductSearchResults(result.products);
                    }
                } else {
                    self.displayNotification({
                        title: _t('Prodotto non trovato'),
                        message: _t('Nessun prodotto trovato con questo nome o codice a barre.'),
                        type: 'warning'
                    });
                }
            });
        },

        _onSearchResultItemClick: function(ev) {
            ev.preventDefault();
            var productId = $(ev.currentTarget).data('id');
            if (productId) {
                this._loadProduct(productId);
                // Chiudi il modal dei risultati di ricerca
                $(ev.currentTarget).closest('.modal').modal('hide');
            }
        },

        _showProductSearchResults: function(products) {
            var self = this;
            var $dialog = $('<div class="modal" role="dialog">')
                .append($('<div class="modal-dialog modal-lg">')
                    .append($('<div class="modal-content">')
                        .append($('<div class="modal-header">')
                            .append($('<h5 class="modal-title">').text(_t('Risultati Ricerca')))
                            .append($('<button type="button" class="close" data-dismiss="modal">&times;</button>')))
                        .append($('<div class="modal-body">')
                            .append($('<div class="list-group search-results"></div>')))
                        .append($('<div class="modal-footer">')
                            .append($('<button type="button" class="btn btn-secondary" data-dismiss="modal">').text(_t('Chiudi'))))));
            
            var $results = $dialog.find('.search-results');
            var storeableProducts = _.filter(products, function(product) { return product.type === 'product'; });
            var otherProducts = _.filter(products, function(product) { return product.type !== 'product'; });

            storeableProducts = _.sortBy(storeableProducts, 'name');
            otherProducts = _.sortBy(otherProducts, 'name');
            var sortedProducts = storeableProducts.concat(otherProducts);
            
            _.each(sortedProducts, function(product) {
                var $item = $('<a href="#" class="list-group-item list-group-item-action search-result-item d-flex align-items-center">')
                    .data('id', product.id);
                
                var imgSrc = product.image_128 ? 'data:image/png;base64,' + product.image_128 : '/web/static/src/img/placeholder.png';
                $item.append($('<div class="mr-3">')
                    .append($('<img>').attr('src', imgSrc).addClass('img-thumbnail').css({
                        'width': '50px',
                        'height': '50px',
                        'object-fit': 'cover'
                    })));
                
                // Utilizziamo i prezzi formattati se disponibili
                var priceDisplay = product.formatted_list_price || (product.list_price ? product.list_price.toFixed(2).replace('.', ',') : '0,00');
                
                $item.append($('<div class="flex-grow-1">')
                    .append($('<h6 class="mb-0">').text(product.name))
                    .append($('<div class="small text-muted">').text('Barcode: ' + (product.barcode || 'N/A')))
                    .append($('<div class="d-flex justify-content-between">')
                        .append($('<span class="badge badge-' + (product.type === 'product' ? 'info' : 'warning') + '">').text(
                            product.type === 'product' ? 'Stock: ' + (product.qty_available || 0) : 'Non stoccabile'
                        ))
                        .append($('<span class="text-primary">').text('Prezzo: ' + priceDisplay))));
                
                $results.append($item);
            });
            
            $dialog.appendTo('body');
            $dialog.modal('show');
            
            $dialog.find('.search-result-item').on('click', function(e) {
                e.preventDefault();
                var productId = $(this).data('id');
                self._loadProduct(productId);
                $dialog.modal('hide');
            });
            
            $dialog.on('hidden.bs.modal', function() {
                $dialog.remove();
            });
        },

        _getProductQuantity: function(product_id) {
            var self = this;
            var warehouse_id = this.renderer.state.data.warehouse_id &&
                              this.renderer.state.data.warehouse_id.data &&
                              this.renderer.state.data.warehouse_id.data.id;
            if (!warehouse_id || !product_id) {
                return Promise.resolve(0);
            }
            
            return this._rpc({
                model: 'inventory.adjustment',
                method: 'get_product_quantity',
                args: [product_id, warehouse_id],
            }).then(function(quantity) {
                self.trigger_up('field_changed', {
                    dataPointID: self.renderer.state.id,
                    changes: {
                        quantity: quantity,
                    },
                });
                return quantity;
            }).guardedCatch(function(error) {
                console.error("Error retrieving quantity:", error);
                return 0;
            });
        }
    });

    var InventoryAdjustmentMobileRenderer = FormRenderer.extend({
        _renderTagForm: function (node) {
            var $form = this._super.apply(this, arguments);
            $form.addClass('inventory-adjustment-mobile');
            return $form;
        },
    });

    var InventoryAdjustmentMobileFormView = FormView.extend({
        config: _.extend({}, FormView.prototype.config, {
            Controller: InventoryAdjustmentMobileController,
            Renderer: InventoryAdjustmentMobileRenderer,
        }),
    });

    viewRegistry.add('inventory_adjustment_mobile_form', InventoryAdjustmentMobileFormView);

    return {
        InventoryAdjustmentMobileController: InventoryAdjustmentMobileController,
        InventoryAdjustmentMobileRenderer: InventoryAdjustmentMobileRenderer,
        InventoryAdjustmentMobileFormView: InventoryAdjustmentMobileFormView,
    };
});