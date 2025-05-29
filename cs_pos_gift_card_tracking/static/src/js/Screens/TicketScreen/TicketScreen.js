odoo.define("cs_pos_order_return_reason.TicketScreen", function (require) {
    "use strict";
    
    const Registries = require("point_of_sale.Registries");
    const TicketScreen = require("point_of_sale.TicketScreen");
    
    const CsOrderReturnTicketScreen = (TicketScreen) =>
    class extends TicketScreen {
    	async _onDoRefund() {
            this.env.pos.get_order().is_refund_order = true;
            await super._onDoRefund();
        }
    };
    Registries.Component.extend(TicketScreen, CsOrderReturnTicketScreen);
    
    return CsOrderReturnTicketScreen
});
