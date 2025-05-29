from odoo import http, _
from odoo.http import request
import json

class InventoryAdjustmentController(http.Controller):
    @http.route('/inventory_adjustment/search_product', type='json', auth='user')
    def search_product(self, query='', **kw):
        domain = [('active', '=', True)]
        if query:
            domain += ['|', ('name', 'ilike', query), ('barcode', 'ilike', query)]
        products = request.env['product.product'].search_read(
            domain=domain,
            fields=['id', 'name', 'default_code', 'barcode', 'list_price', 'standard_price', 'qty_available', 'image_128', 'type'],
            limit=20
        )
        
        # Formattazione dei prezzi con decimali
        for product in products:
            if 'list_price' in product and product['list_price'] is not None:
                product['formatted_list_price'] = "{:,.2f}".format(product['list_price']).replace(',', '.')
            if 'standard_price' in product and product['standard_price'] is not None:
                product['formatted_standard_price'] = "{:,.2f}".format(product['standard_price']).replace(',', '.')
        
        return {
            'success': True,
            'products': products
        }

    @http.route('/inventory_adjustment/get_product_info', type='json', auth='user')
    def get_product_info(self, product_id=False, barcode=False, warehouse_id=False, **kw):
        if not product_id and not barcode:
            return {'success': False, 'error': _('Nessun prodotto o barcode specificato')}
        
        domain = []
        if product_id:
            domain.append(('id', '=', int(product_id)))
        elif barcode:
            domain.append(('barcode', '=', barcode))
        
        product = request.env['product.product'].search(domain, limit=1)
        if not product:
            return {'success': False, 'error': _('Prodotto non trovato')}
        
        # Ottieni il prezzo dal listino principale
        pricelist_id = request.env.user.property_product_pricelist.id
        if pricelist_id:
            pricelist = request.env['product.pricelist'].browse(pricelist_id)
            # Ottieni il prezzo dal listino
            price = pricelist._get_product_price(product, 1.0, False)
        else:
            # Usa il prezzo di listino standard se non c'è listino specifico
            price = product.list_price
        
        if not warehouse_id:
            warehouse_id = int(request.env['ir.config_parameter'].sudo().get_param('inventory_adjustment.warehouse_id', '0'))
            if not warehouse_id:
                warehouse = request.env['stock.warehouse'].search([('company_id', '=', request.env.company.id)], limit=1)
                warehouse_id = warehouse.id if warehouse else False
        
        location_id = False
        current_quantity = 0
        
        if warehouse_id:
            warehouse = request.env['stock.warehouse'].browse(int(warehouse_id))
            if warehouse.exists():
                location_id = warehouse.lot_stock_id.id
                quants = request.env['stock.quant'].search([
                    ('product_id', '=', product.id),
                    ('location_id', '=', location_id)
                ])
                current_quantity = sum(quants.mapped('quantity'))
        
        # Formattazione dei prezzi con decimali
        formatted_list_price = "{:,.2f}".format(price).replace(',', '.')
        formatted_standard_price = "{:,.2f}".format(product.standard_price).replace(',', '.')
        
        return {
            'success': True,
            'product': {
                'id': product.id,
                'name': product.name,
                'default_code': product.default_code or '',
                'barcode': product.barcode or '',
                'list_price': price,  # Utilizza il prezzo dal listino
                'standard_price': product.standard_price,
                'formatted_list_price': formatted_list_price,
                'formatted_standard_price': formatted_standard_price,
                'qty_available': product.qty_available,
                'current_quantity': current_quantity,
                'uom': product.uom_id.name,
                'category': product.categ_id.name,
                'type': product.type,
                'image': product.image_1920 and product.image_1920.decode('utf-8') or False,
                'location_id': location_id,
            }
        }