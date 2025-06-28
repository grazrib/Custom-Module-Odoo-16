# -*- coding: utf-8 -*-

import json
import logging
from datetime import datetime, timedelta

from odoo import http, _
from odoo.http import request
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class RaccoltaDataLoader(http.Controller):
	"""Controller per caricamento dati offline"""

	@http.route('/raccolta/load_data', type='json', auth='user')
	def load_offline_data(self, config_id=None, force_reload=False):
		"""Carica tutti i dati necessari per il funzionamento offline"""
		try:
			# Verifica autorizzazioni
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni configurazione
			if config_id:
				config = request.env['raccolta.config'].browse(config_id)
				if not config.exists():
					return {'error': _('Configurazione non trovata')}
			else:
				config = request.env['raccolta.config'].get_default_config()

			# Verifica se è necessario ricaricare i dati
			user = request.env.user
			last_sync = user.last_sync_date

			if not force_reload and last_sync:
				# Controlla se i dati sono ancora validi
				expiry_hours = config.max_offline_days * 24
				if datetime.now() - last_sync.replace(tzinfo=None) < timedelta(hours=expiry_hours):
					# Dati ancora validi, carica solo contatori aggiornati
					return {
						'success': True,
						'data_fresh': True,
						'counters': user.get_offline_counters(),
						'last_sync': last_sync.isoformat()
					}

			# Carica dati completi
			offline_data = self._load_complete_offline_data(config)

			# Aggiorna timestamp
			user.update_last_sync()

			return {
				'success': True,
				'data': offline_data,
				'loaded_at': datetime.now().isoformat(),
				'expires_at': (datetime.now() + timedelta(days=config.max_offline_days)).isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore caricamento dati offline: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/load_partners', type='json', auth='user')
	def load_partners(self, config_id=None, limit=None, search_term=None):
		"""Carica clienti per uso offline"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Costruisci dominio di ricerca
			domain = [('customer_rank', '>', 0)]

			# Filtra per categorie se configurato
			if config.limit_partner_categories and config.available_partner_categ_ids:
				domain.append(('category_id', 'in', config.available_partner_categ_ids.ids))

			# Aggiungi filtro di ricerca
			if search_term:
				domain.extend(['|', '|', '|',
							   ('name', 'ilike', search_term),
							   ('email', 'ilike', search_term),
							   ('phone', 'ilike', search_term),
							   ('vat', 'ilike', search_term)
							   ])

			# Limita risultati se richiesto
			search_params = {'domain': domain, 'order': 'name'}
			if limit:
				search_params['limit'] = limit

			partners = request.env['res.partner'].search(**search_params)

			# Prepara dati per frontend
			partners_data = []
			for partner in partners:
				partners_data.append({
					'id': partner.id,
					'name': partner.name,
					'display_name': partner.display_name,
					'street': partner.street or '',
					'street2': partner.street2 or '',
					'city': partner.city or '',
					'zip': partner.zip or '',
					'state': partner.state_id.name if partner.state_id else '',
					'country_id': partner.country_id.name if partner.country_id else '',
					'phone': partner.phone or '',
					'mobile': partner.mobile or '',
					'email': partner.email or '',
					'vat': partner.vat or '',
					'is_company': partner.is_company,
					'customer_rank': partner.customer_rank,
					'supplier_rank': partner.supplier_rank,
					'category_names': [cat.name for cat in partner.category_id],
					'active': partner.active,
				})

			return {
				'success': True,
				'partners': partners_data,
				'count': len(partners_data),
				'total_available': request.env['res.partner'].search_count([('customer_rank', '>', 0)]),
				'loaded_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore caricamento clienti: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/load_products', type='json', auth='user')
	def load_products(self, config_id=None, limit=None, search_term=None, category_id=None):
		"""Carica prodotti per uso offline"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Costruisci dominio di ricerca
			domain = [
				('sale_ok', '=', True),
				('type', 'in', ['product', 'consu']),
				'|', ('company_id', '=', config.company_id.id), ('company_id', '=', False)
			]

			# Filtra per categorie se configurato
			if config.limit_categories and config.available_categ_ids:
				domain.append(('categ_id', 'child_of', config.available_categ_ids.ids))

			# Filtra per categoria specifica
			if category_id:
				domain.append(('categ_id', '=', category_id))

			# Aggiungi filtro di ricerca
			if search_term:
				domain.extend(['|', '|', '|',
							   ('name', 'ilike', search_term),
							   ('default_code', 'ilike', search_term),
							   ('barcode', 'ilike', search_term),
							   ('description_sale', 'ilike', search_term)
							   ])

			# Limita risultati se richiesto
			search_params = {'domain': domain, 'order': 'name'}
			if limit:
				search_params['limit'] = limit

			products = request.env['product.product'].search(**search_params)

			# Prepara dati per frontend
			products_data = []
			for product in products:
				# Calcola stock disponibile
				stock_qty = 0
				if config.warehouse_id:
					stock_quant = request.env['stock.quant'].search([
						('product_id', '=', product.id),
						('location_id', 'child_of', config.warehouse_id.lot_stock_id.id)
					])
					stock_qty = sum(stock_quant.mapped('available_quantity'))

				products_data.append({
					'id': product.id,
					'name': product.name,
					'display_name': product.display_name,
					'default_code': product.default_code or '',
					'barcode': product.barcode or '',
					'list_price': product.list_price,
					'standard_price': product.standard_price,
					'uom_id': product.uom_id.id,
					'uom_name': product.uom_id.name,
					'categ_id': product.categ_id.id,
					'categ_name': product.categ_id.name,
					'categ_path': product.categ_id.complete_name,
					'taxes_id': product.taxes_id.ids,
					'type': product.type,
					'tracking': product.tracking,
					'description_sale': product.description_sale or '',
					'weight': product.weight,
					'volume': product.volume,
					'stock_qty': stock_qty,
					'active': product.active,
					'image_small': product.image_128.decode() if product.image_128 else None,
				})

			return {
				'success': True,
				'products': products_data,
				'count': len(products_data),
				'total_available': request.env['product.product'].search_count([('sale_ok', '=', True)]),
				'loaded_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore caricamento prodotti: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/load_categories', type='json', auth='user')
	def load_categories(self, config_id=None):
		"""Carica categorie prodotti"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Carica categorie
			domain = []
			if config.limit_categories and config.available_categ_ids:
				# Solo categorie configurate e loro figli
				all_ids = []
				for cat in config.available_categ_ids:
					all_ids.extend(cat.child_id.ids)
					all_ids.append(cat.id)
				domain = [('id', 'in', all_ids)]

			categories = request.env['product.category'].search(domain, order='complete_name')

			categories_data = []
			for category in categories:
				categories_data.append({
					'id': category.id,
					'name': category.name,
					'complete_name': category.complete_name,
					'parent_id': category.parent_id.id if category.parent_id else False,
					'parent_path': category.parent_path or '',
					'child_ids': category.child_id.ids,
					'product_count': request.env['product.product'].search_count([
						('categ_id', '=', category.id),
						('sale_ok', '=', True)
					])
				})

			return {
				'success': True,
				'categories': categories_data,
				'count': len(categories_data),
				'loaded_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore caricamento categorie: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/load_ddt_config', type='json', auth='user')
	def load_ddt_config(self, config_id=None):
		"""Carica configurazioni DDT per uso offline"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Carica configurazioni DDT
			ddt_config = {
				'transport_reasons': [{
					'id': r.id,
					'name': r.name,
					'code': r.code or '',
				} for r in request.env['stock.picking.transport.reason'].search([])],

				'goods_appearances': [{
					'id': a.id,
					'name': a.name,
					'code': a.code or '',
				} for a in request.env['stock.picking.goods.appearance'].search([])],

				'transport_conditions': [{
					'id': c.id,
					'name': c.name,
					'code': c.code or '',
				} for c in request.env['stock.picking.transport.condition'].search([])],

				'transport_methods': [{
					'id': m.id,
					'name': m.name,
					'code': m.code or '',
				} for m in request.env['stock.picking.transport.method'].search([])],

				'ddt_types': [{
					'id': t.id,
					'name': t.name,
					'code': t.code,
					'print_prices': t.print_prices,
				} for t in request.env['stock.delivery.note.type'].search([
					('company_id', '=', config.company_id.id)
				])],

				# Valori di default dalla configurazione
				'defaults': {
					'transport_reason_id': config.ddt_transport_reason_id.id if config.ddt_transport_reason_id else False,
					'goods_appearance_id': config.ddt_goods_appearance_id.id if config.ddt_goods_appearance_id else False,
					'transport_condition_id': config.ddt_transport_condition_id.id if config.ddt_transport_condition_id else False,
					'ddt_type_id': config.ddt_type_id.id if config.ddt_type_id else False,
				}
			}

			return {
				'success': True,
				'ddt_config': ddt_config,
				'loaded_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore caricamento config DDT: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/load_taxes', type='json', auth='user')
	def load_taxes(self, config_id=None):
		"""Carica tasse per calcoli offline"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Carica tasse di vendita
			taxes = request.env['account.tax'].search([
				('company_id', '=', config.company_id.id),
				('type_tax_use', '=', 'sale'),
				('active', '=', True)
			], order='sequence, name')

			taxes_data = []
			for tax in taxes:
				taxes_data.append({
					'id': tax.id,
					'name': tax.name,
					'amount': tax.amount,
					'amount_type': tax.amount_type,
					'include_base_amount': tax.include_base_amount,
					'sequence': tax.sequence,
					'description': tax.description or '',
					'active': tax.active,
				})

			return {
				'success': True,
				'taxes': taxes_data,
				'count': len(taxes_data),
				'loaded_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore caricamento tasse: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/load_uoms', type='json', auth='user')
	def load_uoms(self, config_id=None):
		"""Carica unità di misura"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Carica UoM attive
			uoms = request.env['uom.uom'].search([('active', '=', True)], order='category_id, name')

			uoms_data = []
			for uom in uoms:
				uoms_data.append({
					'id': uom.id,
					'name': uom.name,
					'category_id': uom.category_id.id,
					'category_name': uom.category_id.name,
					'factor': uom.factor,
					'factor_inv': uom.factor_inv,
					'rounding': uom.rounding,
					'uom_type': uom.uom_type,
				})

			return {
				'success': True,
				'uoms': uoms_data,
				'count': len(uoms_data),
				'loaded_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore caricamento UoM: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/search_products', type='json', auth='user')
	def search_products(self, search_term, config_id=None, limit=20):
		"""Ricerca veloce prodotti (per autocomplete)"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			if not search_term or len(search_term) < 2:
				return {'success': True, 'products': []}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Costruisci dominio di ricerca
			domain = [
				('sale_ok', '=', True),
				('active', '=', True),
				'|', ('company_id', '=', config.company_id.id), ('company_id', '=', False),
				'|', '|', '|',
				('name', 'ilike', search_term),
				('default_code', 'ilike', search_term),
				('barcode', '=', search_term),
				('description_sale', 'ilike', search_term)
			]

			# Filtra per categorie se configurato
			if config.limit_categories and config.available_categ_ids:
				domain.append(('categ_id', 'child_of', config.available_categ_ids.ids))

			products = request.env['product.product'].search(domain, limit=limit, order='name')

			# Risultati leggeri per autocomplete
			results = []
			for product in products:
				results.append({
					'id': product.id,
					'name': product.name,
					'default_code': product.default_code or '',
					'barcode': product.barcode or '',
					'list_price': product.list_price,
					'uom_name': product.uom_id.name,
					'categ_name': product.categ_id.name,
				})

			return {
				'success': True,
				'products': results,
				'count': len(results)
			}

		except Exception as e:
			_logger.error(f"Errore ricerca prodotti: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/search_partners', type='json', auth='user')
	def search_partners(self, search_term, config_id=None, limit=20):
		"""Ricerca veloce clienti (per autocomplete)"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			if not search_term or len(search_term) < 2:
				return {'success': True, 'partners': []}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Costruisci dominio di ricerca
			domain = [
				('customer_rank', '>', 0),
				('active', '=', True),
				'|', '|', '|',
				('name', 'ilike', search_term),
				('email', 'ilike', search_term),
				('phone', 'ilike', search_term),
				('vat', 'ilike', search_term)
			]

			# Filtra per categorie se configurato
			if config.limit_partner_categories and config.available_partner_categ_ids:
				domain.append(('category_id', 'in', config.available_partner_categ_ids.ids))

			partners = request.env['res.partner'].search(domain, limit=limit, order='name')

			# Risultati leggeri per autocomplete
			results = []
			for partner in partners:
				results.append({
					'id': partner.id,
					'name': partner.name,
					'display_name': partner.display_name,
					'email': partner.email or '',
					'phone': partner.phone or '',
					'vat': partner.vat or '',
					'city': partner.city or '',
					'is_company': partner.is_company,
				})

			return {
				'success': True,
				'partners': results,
				'count': len(results)
			}

		except Exception as e:
			_logger.error(f"Errore ricerca clienti: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/get_product_by_barcode', type='json', auth='user')
	def get_product_by_barcode(self, barcode, config_id=None):
		"""Trova prodotto tramite barcode"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			if not barcode:
				return {'error': _('Barcode non specificato')}

			# Ottieni configurazione
			config = self._get_config(config_id)

			# Cerca prodotto per barcode
			domain = [
				('barcode', '=', barcode),
				('sale_ok', '=', True),
				('active', '=', True),
				'|', ('company_id', '=', config.company_id.id), ('company_id', '=', False)
			]

			# Filtra per categorie se configurato
			if config.limit_categories and config.available_categ_ids:
				domain.append(('categ_id', 'child_of', config.available_categ_ids.ids))

			product = request.env['product.product'].search(domain, limit=1)

			if not product:
				return {
					'success': False,
					'error': _('Prodotto non trovato per il barcode: %s') % barcode
				}

			# Calcola stock disponibile
			stock_qty = 0
			if config.warehouse_id:
				stock_quant = request.env['stock.quant'].search([
					('product_id', '=', product.id),
					('location_id', 'child_of', config.warehouse_id.lot_stock_id.id)
				])
				stock_qty = sum(stock_quant.mapped('available_quantity'))

			product_data = {
				'id': product.id,
				'name': product.name,
				'default_code': product.default_code or '',
				'barcode': product.barcode,
				'list_price': product.list_price,
				'standard_price': product.standard_price,
				'uom_id': product.uom_id.id,
				'uom_name': product.uom_id.name,
				'categ_id': product.categ_id.id,
				'categ_name': product.categ_id.name,
				'taxes_id': product.taxes_id.ids,
				'description_sale': product.description_sale or '',
				'stock_qty': stock_qty,
				'type': product.type,
				'tracking': product.tracking,
			}

			return {
				'success': True,
				'product': product_data,
				'stock_available': stock_qty > 0
			}

		except Exception as e:
			_logger.error(f"Errore ricerca barcode: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/check_data_freshness', type='json', auth='user')
	def check_data_freshness(self, config_id=None):
		"""Controlla se i dati offline sono ancora freschi"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni configurazione
			config = self._get_config(config_id)
			user = request.env.user

			# Controlla ultimo sync
			last_sync = user.last_sync_date
			if not last_sync:
				return {
					'success': True,
					'fresh': False,
					'reason': 'never_synced',
					'message': _('Dati mai sincronizzati')
				}

			# Calcola scadenza
			expiry_hours = config.max_offline_days * 24
			hours_since_sync = (datetime.now() - last_sync.replace(tzinfo=None)).total_seconds() / 3600

			if hours_since_sync > expiry_hours:
				return {
					'success': True,
					'fresh': False,
					'reason': 'expired',
					'hours_since_sync': hours_since_sync,
					'max_hours': expiry_hours,
					'message': _('Dati scaduti, sincronizzazione necessaria')
				}

			return {
				'success': True,
				'fresh': True,
				'hours_since_sync': hours_since_sync,
				'hours_remaining': expiry_hours - hours_since_sync,
				'last_sync': last_sync.isoformat(),
				'message': _('Dati ancora validi')
			}

		except Exception as e:
			_logger.error(f"Errore controllo freschezza dati: {str(e)}")
			return {'error': str(e)}

	def _load_complete_offline_data(self, config):
		"""Carica set completo di dati per uso offline"""
		return {
			'config': config._get_config_data(),
			'company': config._get_company_data(),
			'partners': config._get_partners_data(),
			'products': config._get_products_data(),
			'categories': config._get_categories_data(),
			'taxes': config._get_taxes_data(),
			'uoms': config._get_uoms_data(),
			'ddt_config': config._get_ddt_config_data(),
			'counters': config._get_user_counters(),
			'loaded_at': datetime.now().isoformat(),
			'version': '1.0.0'
		}

	def _get_config(self, config_id=None):
		"""Ottiene configurazione o default"""
		if config_id:
			config = request.env['raccolta.config'].browse(config_id)
			if not config.exists():
				raise UserError(_('Configurazione non trovata'))
			return config
		else:
			return request.env['raccolta.config'].get_default_config()
