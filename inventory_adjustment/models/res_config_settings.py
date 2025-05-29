from odoo import models, fields, api

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    inventory_warehouse_id = fields.Many2one(
        'stock.warehouse',
        string='Magazzino Predefinito',
        config_parameter='inventory_adjustment.warehouse_id',
        help="Magazzino utilizzato di default per le rettifiche di inventario"
    )
