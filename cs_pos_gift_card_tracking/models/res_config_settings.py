from odoo import fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'
    
    pos_enable_gift_card_tracking = fields.Boolean(
        related="pos_config_id.enable_gift_card_tracking", 
        string="Abilita Tracciamento Carta Regalo", 
        readonly=False)
    
    pos_display_gift_card_in_receipt = fields.Boolean(
        related="pos_config_id.display_gift_card_in_receipt",
        string="Mostra Codice nella Ricevuta", 
        readonly=False)