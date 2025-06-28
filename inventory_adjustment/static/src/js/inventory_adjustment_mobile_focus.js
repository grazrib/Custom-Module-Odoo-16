odoo.define('inventory_adjustment.mobile_focus', function(require) {
    'use strict';
    const FormController = require('web.FormController');

    FormController.include({
        _onFieldChanged: function (event) {
            this._super.apply(this, arguments);
            // Quando cambia il campo barcode e il prodotto è selezionato, dai focus al campo quantità
            if (event.data.changes.barcode && this.modelName === 'inventory.adjustment') {
                const record = this.model.get(this.handle, {raw: true});
                if (record && record.data && record.data.product_id) {
                    setTimeout(() => {
                        // Cerca il campo quantità in modo compatibile con la tua view
                        const qtyInput = document.querySelector('.quantity-editable input, .quantity-editable [name="quantity"]');
                        if (qtyInput) {
                            qtyInput.focus();
                            qtyInput.select();
                        }
                    }, 100);
                }
            }
        }
    });
});