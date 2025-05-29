from odoo import fields, models, api

class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_gift_card_tracking = fields.Boolean(
        "Abilita Tracciamento Carta Regalo")
    
    display_gift_card_in_receipt = fields.Boolean(
        "Mostra Codice Carta Regalo nella Ricevuta")