odoo.define("cs_pos_gift_card_tracking.csGiftCardButton", function (require) {
    "use strict";
    
    const PosComponent = require("point_of_sale.PosComponent");
    const { useListener } = require("@web/core/utils/hooks");
    const Registries = require("point_of_sale.Registries");
    const ProductScreen = require("point_of_sale.ProductScreen");
    
    class csGiftCardButton extends PosComponent {
        setup() {
            super.setup();
            useListener('click', this.onClick);
        }
        onClick() {
            let { confirmed, payload } = this.showPopup("TemplateGiftCardPopupWidget");
            if (confirmed) {
            } else {
                return;
            }
        }
    }
    csGiftCardButton.template = "csGiftCardButton";
    ProductScreen.addControlButton({
        component: csGiftCardButton,
        condition: function () {
            return false;
        },
    });
    Registries.Component.add(csGiftCardButton);
    return csGiftCardButton
});