odoo.define("cs_pos_gift_card_tracking.models", function (require) {
    "use strict";
    
    const {Order} = require('point_of_sale.models');
    const Registries = require("point_of_sale.Registries");

    const CsGiftCardTrackingOrder = (Order) => class CsGiftCardTrackingOrder extends Order {
        constructor() {
            super(...arguments);
            this.gift_card_code = false;
        }
        set_gift_card_code(gift_card_code){
            this.gift_card_code = gift_card_code
        }
        get_gift_card_code(){
            return this.gift_card_code;
        }
        export_as_JSON() {
            var json = super.export_as_JSON()
            json.gift_card_code = this.get_gift_card_code() || null;
            
            return json;
        }
        export_for_printing() {
            var self = this;
            var orders = super.export_for_printing()
            var new_val = {
                gift_card_code: this.get_gift_card_code() || false,
            };
            $.extend(orders, new_val);
            return orders;
        }
    };
    Registries.Model.extend(Order, CsGiftCardTrackingOrder);
    
});