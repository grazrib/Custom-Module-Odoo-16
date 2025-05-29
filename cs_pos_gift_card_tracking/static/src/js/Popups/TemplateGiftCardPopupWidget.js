odoo.define("cs_pos_gift_card_tracking.TemplateGiftCardPopupWidget", function (require) {
    "use strict";
    
    const Registries = require("point_of_sale.Registries");
    const AbstractAwaitablePopup = require("point_of_sale.AbstractAwaitablePopup");
    
    class TemplateGiftCardPopupWidget extends AbstractAwaitablePopup {
        async confirm() {
            var self = this;
            this.props.resolve({ confirmed: true, payload: await this.getPayload() });
            this.cancel()
            var value = $("#textarea_gift_card").val();
            this.env.pos.get_order().set_gift_card_code(value);
        }
    }

    TemplateGiftCardPopupWidget.template = "TemplateGiftCardPopupWidget";
    Registries.Component.add(TemplateGiftCardPopupWidget);
    
    return TemplateGiftCardPopupWidget
});