from odoo import fields, models, api
    
class PosOrder(models.Model):
    _inherit = 'pos.order'
    
    cs_gift_card_code = fields.Char(string="Codice Carta Regalo")
    
    @api.model
    def _order_fields(self, ui_order):
        res = super(PosOrder, self)._order_fields(ui_order)
        print("\n\n\nui_order.get('gift_card_code') >>>>> ",ui_order.get('gift_card_code'))
        res['cs_gift_card_code'] = ui_order.get('gift_card_code', False)
        return res