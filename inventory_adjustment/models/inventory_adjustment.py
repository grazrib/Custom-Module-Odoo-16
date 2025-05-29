from odoo import models, fields, api, _
from odoo.exceptions import UserError
import logging
import base64

_logger = logging.getLogger(__name__)

class InventoryAdjustment(models.Model):
    _name = 'inventory.adjustment'
    _description = 'Rettifica Inventario Rapida'

    name = fields.Char('Nome', default="Nuova Rettifica")
    product_id = fields.Many2one('product.product', string='Prodotto')
    product_name = fields.Char(related='product_id.name', string='Nome Prodotto')
    barcode = fields.Char(string='Codice a Barre')
    description = fields.Text(string='Descrizione')
    quantity = fields.Float(string='Quantità', default=0.0)
    purchase_price = fields.Float(string='Prezzo di Acquisto', digits='Product Price')
    sale_price = fields.Float(string='Prezzo di Vendita', digits='Product Price')
    warehouse_id = fields.Many2one('stock.warehouse', string='Magazzino')
    location_id = fields.Many2one('stock.location', string='Ubicazione')
    company_id = fields.Many2one('res.company', string='Azienda', default=lambda self: self.env.company)
    product_image = fields.Binary(related='product_id.image_1920', string='Immagine Prodotto')

    @api.model
    def create(self, vals):
        if not vals.get('warehouse_id'):
            params = self.env['ir.config_parameter'].sudo()
            warehouse_id = params.get_param('inventory_adjustment.warehouse_id', False)
            if warehouse_id:
                vals['warehouse_id'] = int(warehouse_id)
                warehouse = self.env['stock.warehouse'].browse(int(warehouse_id))
                if warehouse and warehouse.exists():
                    vals['location_id'] = warehouse.lot_stock_id.id
        return super(InventoryAdjustment, self).create(vals)

    @api.onchange('barcode')
    def _onchange_barcode(self):
        if self.barcode:
            product = self.env['product.product'].search([('barcode', '=', self.barcode)], limit=1)
            if product:
                self.product_id = product.id
                self.purchase_price = product.standard_price  # Prezzo di acquisto
                # Usa il listino dell'utente corrente
                pricelist = self.env.user.property_product_pricelist
                if pricelist:
                    self.sale_price = pricelist._get_product_price(product, 1.0, False)  # Prezzo di vendita
                else:
                    self.sale_price = product.list_price  # Prezzo di vendita predefinito
                
                params = self.env['ir.config_parameter'].sudo()
                warehouse_id = int(params.get_param('inventory_adjustment.warehouse_id', '0'))
                if warehouse_id:
                    warehouse = self.env['stock.warehouse'].browse(warehouse_id)
                    if warehouse:
                        self.warehouse_id = warehouse.id
                        location = warehouse.lot_stock_id
                        self.location_id = location.id
                
                self._update_quantity_from_stock()
            else:
                return {'warning': {'title': _('Attenzione'), 'message': _('Nessun prodotto trovato con questo codice a barre.')}}

    # Metodo pubblico per chiamare _onchange_barcode da RPC
    @api.model
    def onchange_barcode(self, barcode, record_id=None):
        if record_id:
            record = self.browse(record_id)
            record.barcode = barcode
            result = record._onchange_barcode()
            return result
        else:
            record = self.new({'barcode': barcode})
            result = record._onchange_barcode()
            return result

    def _update_quantity_from_stock(self):
        if self.product_id and self.location_id:
            quants = self.env['stock.quant'].search([
                ('product_id', '=', self.product_id.id),
                ('location_id', '=', self.location_id.id)
            ])
            quantity = sum(quant.quantity for quant in quants)
            self.quantity = quantity
            _logger.info(f"Aggiornata quantità a {quantity} per prodotto {self.product_id.name} in ubicazione {self.location_id.name}")
        else:
            _logger.warning("Impossibile aggiornare quantità: prodotto o ubicazione mancanti")

    def refresh_quantity(self):
        self._update_quantity_from_stock()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Quantità aggiornata'),
                'message': _('La quantità è stata aggiornata in base allo stock attuale.'),
                'type': 'info',
                'sticky': False,
            }
        }

    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            self.barcode = self.product_id.barcode
            self.purchase_price = self.product_id.standard_price  # Prezzo di acquisto
            # Usa il listino dell'utente corrente
            pricelist = self.env.user.property_product_pricelist
            if pricelist:
                self.sale_price = pricelist._get_product_price(self.product_id, 1.0, False)  # Prezzo di vendita
            else:
                self.sale_price = self.product_id.list_price  # Prezzo di vendita predefinito
            self._update_quantity_from_stock()

    def increase_quantity(self):
        self.quantity += 1

    def decrease_quantity(self):
        if self.quantity > 0:
            self.quantity -= 1

    def action_scan_barcode(self):
        return {
            'type': 'ir.actions.client',
            'tag': 'inventory_adjustment.barcode_scanner',
            'target': 'new',
            'params': {
                'model': 'inventory.adjustment',
                'field': 'barcode',
                'callback': 'onchange_barcode',  # Usa il metodo pubblico
                'wizard_id': self.id,
            }
        }

    def confirm_adjustment(self):
        if not self.product_id:
            raise UserError(_('Seleziona un prodotto prima di confermare.'))
        if not self.location_id:
            raise UserError(_('Nessuna ubicazione selezionata. Configura un magazzino predefinito nelle impostazioni.'))
        if self.product_id.type != 'product':
            raise UserError(_('Non è possibile creare quantitativi per prodotti di tipo consumabile o servizio.'))

        quant = self.env['stock.quant'].search([
            ('product_id', '=', self.product_id.id),
            ('location_id', '=', self.location_id.id)
        ], limit=1)

        try:
            if quant:
                quant.inventory_quantity = self.quantity
                quant.inventory_diff_quantity = self.quantity - quant.quantity
                quant.inventory_date = fields.Date.today()
                quant.user_id = self.env.user.id
                quant.with_context(inventory_mode=True).action_apply_inventory()
            else:
                vals = {
                    'product_id': self.product_id.id,
                    'location_id': self.location_id.id,
                    'inventory_quantity': self.quantity,
                    'inventory_date': fields.Date.today(),
                    'user_id': self.env.user.id,
                }
                quant = self.env['stock.quant'].create(vals)
                quant.with_context(inventory_mode=True).action_apply_inventory()

            self.product_id = False
            self.barcode = False
            self.quantity = 0.0

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Successo'),
                    'message': _('Rettifica di inventario confermata con successo!'),
                    'type': 'success',
                    'sticky': False,
                }
            }
        except Exception as e:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Errore'),
                    'message': str(e),
                    'type': 'danger',
                    'sticky': True,
                }
            }

    @api.model
    def get_product_quantity(self, product_id, warehouse_id):
        if not product_id or not warehouse_id:
            return 0.0
        warehouse = self.env['stock.warehouse'].browse(warehouse_id)
        if not warehouse or not warehouse.exists():
            return 0.0
        location_id = warehouse.lot_stock_id.id
        quants = self.env['stock.quant'].search([
            ('product_id', '=', product_id),
            ('location_id', '=', location_id)
        ])
        quantity = sum(quant.quantity for quant in quants)
        return quantity

    def action_update_image(self):
        return True

    def action_update_barcode(self):
        return True

    @api.model
    def action_update_product_image(self, product_id, image_data):
        if not product_id:
            return False
        product = self.env['product.product'].browse(product_id)
        if not product.exists():
            return False
        try:
            product.write({
                'image_1920': image_data
            })
            return True
        except Exception as e:
            _logger.error("Errore nell'aggiornamento dell'immagine prodotto: %s", str(e))
            return False

    @api.model
    def action_update_product_barcode(self, product_id, barcode):
        if not product_id or not barcode:
            return {'success': False, 'message': _('Dati mancanti')}
        product = self.env['product.product'].browse(product_id)
        if not product.exists():
            return {'success': False, 'message': _('Prodotto non trovato')}
        duplicate = self.env['product.product'].search([
            ('barcode', '=', barcode),
            ('id', '!=', product_id)
        ], limit=1)
        if duplicate:
            return {
                'success': False,
                'message': _('Barcode già utilizzato per il prodotto: %s') % duplicate.name
            }
        try:
            product.write({
                'barcode': barcode
            })
            return {'success': True, 'message': _('Barcode aggiornato con successo')}
        except Exception as e:
            _logger.error("Errore nell'aggiornamento del barcode: %s", str(e))
            return {'success': False, 'message': str(e)}