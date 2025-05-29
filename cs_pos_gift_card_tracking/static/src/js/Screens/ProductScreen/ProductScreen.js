odoo.define("cs_pos_order_return_reason.ProductScreen", function (require) {
    "use strict";
    
    const Registries = require("point_of_sale.Registries");
    const ProductScreen = require("point_of_sale.ProductScreen");
    
    const PosProductScreen = (ProductScreen) =>
    class extends ProductScreen {
        _onClickPay() {
        	if(this && this.env && this.env.pos && this.env.pos.config && this.env.pos.config.enable_order_return_reason && this.env.pos.config.is_reason_compulsory && this.env.pos.get_order() && this.env.pos.get_order().is_refund_order){
        		if(this.env.pos.get_order() && this.env.pos.get_order().get_order_return_reason()){
        			super._onClickPay()
        		}else{
        			alert("Please enter reason for return.")
        		}
        	}else{
        		super._onClickPay()
        	}
        }
    };
	Registries.Component.extend(ProductScreen, PosProductScreen);
    return PosProductScreen
    
});
