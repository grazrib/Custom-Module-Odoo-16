# -*- coding: utf-8 -*-

import json
import logging
from datetime import datetime

from odoo import http, _
from odoo.http import request
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class RaccoltaSyncController(http.Controller):
	"""Controller per sincronizzazione documenti offline"""

	@http.route('/raccolta/sync', type='json', auth='user')
	def sync_offline_data(self, session_id, orders=None, pickings=None, ddts=None, **kwargs):
		"""Sincronizza documenti creati offline"""
		try:
			# Verifica autorizzazioni
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Ottieni sessione
			session = request.env['raccolta.session'].browse(session_id)
			if not session.exists() or session.user_id != request.env.user:
				return {'error': _('Sessione non valida')}

			_logger.info(f"Inizio sincronizzazione sessione {session.name} - "
						 f"Ordini: {len(orders or [])}, "
						 f"Picking: {len(pickings or [])}, "
						 f"DDT: {len(ddts or [])}")

			# Esegui sincronizzazione
			sync_data = {
				'orders': orders or [],
				'pickings': pickings or [],
				'ddts': ddts or []
			}

			results = session.sync_session_data(sync_data)

			# Aggiorna contatori utente se necessario
			self._update_user_counters(session.user_id, results)

			_logger.info(f"Sincronizzazione completata - "
						 f"Ordini: {results['orders_synced']}, "
						 f"Picking: {results['pickings_synced']}, "
						 f"DDT: {results['ddts_synced']}, "
						 f"Errori: {len(results['errors'])}")

			return {
				'success': True,
				'results': results,
				'session_summary': session.get_session_summary(),
				'synced_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore sincronizzazione: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/sync/orders', type='json', auth='user')
	def sync_orders_only(self, session_id, orders):
		"""Sincronizza solo ordini"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			session = request.env['raccolta.session'].browse(session_id)
			if not session.exists() or session.user_id != request.env.user:
				return {'error': _('Sessione non valida')}

			results = {'synced': 0, 'errors': [], 'order_ids': []}

			for order_data in orders:
				try:
					order = self._sync_single_order(order_data, session)
					if order:
						results['synced'] += 1
						results['order_ids'].append(order.id)

				except Exception as e:
					error_msg = f"Errore ordine {order_data.get('name', 'Unknown')}: {str(e)}"
					results['errors'].append(error_msg)
					_logger.error(error_msg)

			return {
				'success': True,
				'results': results,
				'synced_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore sincronizzazione ordini: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/sync/check_conflicts', type='json', auth='user')
	def check_sync_conflicts(self, orders=None, pickings=None, ddts=None):
		"""Controlla conflitti prima della sincronizzazione"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			conflicts = {
				'orders': [],
				'pickings': [],
				'ddts': [],
				'has_conflicts': False
			}

			# Controlla conflitti ordini
			if orders:
				for order_data in orders:
					existing = request.env['sale.order'].search([
						('name', '=', order_data.get('name'))
					], limit=1)

					if existing:
						conflicts['orders'].append({
							'name': order_data.get('name'),
							'existing_id': existing.id,
							'conflict_type': 'duplicate_name',
							'message': _('Ordine con questo nome già esistente')
						})
						conflicts['has_conflicts'] = True

			# Controlla conflitti picking
			if pickings:
				for picking_data in pickings:
					existing = request.env['stock.picking'].search([
						('name', '=', picking_data.get('name'))
					], limit=1)

					if existing:
						conflicts['pickings'].append({
							'name': picking_data.get('name'),
							'existing_id': existing.id,
							'conflict_type': 'duplicate_name',
							'message': _('Picking con questo nome già esistente')
						})
						conflicts['has_conflicts'] = True

			# Controlla conflitti DDT
			if ddts:
				for ddt_data in ddts:
					existing = request.env['stock.delivery.note'].search([
						('name', '=', ddt_data.get('name'))
					], limit=1)

					if existing:
						conflicts['ddts'].append({
							'name': ddt_data.get('name'),
							'existing_id': existing.id,
							'conflict_type': 'duplicate_name',
							'message': _('DDT con questo nome già esistente')
						})
						conflicts['has_conflicts'] = True

			return {
				'success': True,
				'conflicts': conflicts,
				'checked_at': datetime.now().isoformat()
			}

		except Exception as e:
			_logger.error(f"Errore controllo conflitti: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/sync/status', type='json', auth='user')
	def get_sync_status(self, session_id):
		"""Ottiene stato sincronizzazione sessione"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			session = request.env['raccolta.session'].browse(session_id)
			if not session.exists():
				return {'error': _('Sessione non trovata')}

			# Calcola statistiche sincronizzazione
			orders = session.order_ids
			total_orders = len(orders)
			synced_orders = len(orders.filtered('synced_to_odoo'))
			pending_orders = total_orders - synced_orders

			# Statistiche picking e DDT
			pickings = request.env['stock.picking'].search([
				('sale_id', 'in', orders.ids)
			])
			ddts = request.env['stock.delivery.note'].search([
				('picking_ids', 'in', pickings.ids)
			])

			status = {
				'session_id': session.id,
				'session_name': session.display_name,
				'last_sync': session.last_sync_at.isoformat() if session.last_sync_at else None,
				'sync_count': session.sync_count,
				'sync_errors': session.sync_error_count,
				'last_error': session.last_sync_error,

				'orders': {
					'total': total_orders,
					'synced': synced_orders,
					'pending': pending_orders,
					'sync_percentage': (synced_orders / total_orders * 100) if total_orders > 0 else 0
				},

				'pickings': {
					'total': len(pickings),
					'synced': len(pickings.filtered(lambda p: getattr(p, 'synced_to_odoo', True))),
				},

				'ddts': {
					'total': len(ddts),
					'synced': len(ddts.filtered(lambda d: getattr(d, 'synced_to_odoo', True))),
				},

				'last_check': datetime.now().isoformat()
			}

			return {
				'success': True,
				'status': status
			}

		except Exception as e:
			_logger.error(f"Errore stato sincronizzazione: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/sync/retry_failed', type='json', auth='user')
	def retry_failed_sync(self, session_id):
		"""Riprova sincronizzazione documenti falliti"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			session = request.env['raccolta.session'].browse(session_id)
			if not session.exists() or session.user_id != request.env.user:
				return {'error': _('Sessione non valida')}

			# Trova documenti non sincronizzati
			failed_orders = session.order_ids.filtered(lambda o: not o.synced_to_odoo)

			retry_results = {'synced': 0, 'failed': 0, 'errors': []}

			for order in failed_orders:
				try:
					# Riprova sincronizzazione ordine
					self._retry_order_sync(order)
					retry_results['synced'] += 1

				except Exception as e:
					retry_results['failed'] += 1
					retry_results['errors'].append(f"Ordine {order.name}: {str(e)}")

			# Aggiorna statistiche sessione
			if retry_results['synced'] > 0:
				session.write({
					'last_sync_at': datetime.now(),
					'sync_count': session.sync_count + 1
				})

			return {
				'success': True,
				'retry_results': retry_results,
				'remaining_failed': len(session.order_ids.filtered(lambda o: not o.synced_to_odoo))
			}

		except Exception as e:
			_logger.error(f"Errore retry sincronizzazione: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/sync/upload_receipt', type='http', auth='user', methods=['POST'], csrf=False)
	def upload_receipt_data(self, **kwargs):
		"""Upload dati ricevuta (immagini, firme, ecc.)"""
		try:
			if not request.env.user.is_raccolta_agent:
				return json.dumps({'error': _('Utente non autorizzato')})

			order_id = kwargs.get('order_id')
			signature_data = kwargs.get('signature_data')
			receipt_image = request.httprequest.files.get('receipt_image')

			if not order_id:
				return json.dumps({'error': _('ID ordine mancante')})

			order = request.env['sale.order'].browse(int(order_id))
			if not order.exists():
				return json.dumps({'error': _('Ordine non trovato')})

			# Verifica autorizzazioni
			if order.raccolta_session_id.user_id != request.env.user:
				return json.dumps({'error': _('Non autorizzato per questo ordine')})

			# Aggiorna dati ricevuta
			update_vals = {}

			if signature_data:
				update_vals['signature_data'] = signature_data

			if receipt_image:
				# Salva immagine ricevuta come attachment
				attachment = request.env['ir.attachment'].create({
					'name': f'Ricevuta_{order.name}.png',
					'type': 'binary',
					'datas': receipt_image.read(),
					'res_model': 'sale.order',
					'res_id': order.id,
					'mimetype': 'image/png'
				})
				update_vals['receipt_printed'] = True

			if update_vals:
				order.write(update_vals)

			return json.dumps({
				'success': True,
				'message': _('Dati ricevuta aggiornati'),
				'order_id': order.id
			})

		except Exception as e:
			_logger.error(f"Errore upload ricevuta: {str(e)}")
			return json.dumps({'error': str(e)})

	def _sync_single_order(self, order_data, session):
		"""Sincronizza un singolo ordine"""
		# Cerca ordine esistente
		existing_order = request.env['sale.order'].search([
			('name', '=', order_data.get('name')),
			('raccolta_session_id', '=', session.id)
		], limit=1)

		if existing_order:
			# Aggiorna ordine esistente
			order_vals = self._prepare_order_values(order_data, session)
			existing_order.write(order_vals)
			self._sync_order_lines(existing_order, order_data.get('order_lines', []))
			return existing_order
		else:
			# Crea nuovo ordine
			order_vals = self._prepare_order_values(order_data, session)
			order = request.env['sale.order'].create(order_vals)
			self._sync_order_lines(order, order_data.get('order_lines', []))

			# Marca come sincronizzato
			order.write({
				'synced_to_odoo': True,
				'sync_date': datetime.now()
			})

			return order

	def _prepare_order_values(self, order_data, session):
		"""Prepara valori ordine per creazione/aggiornamento"""
		partner_id = order_data.get('partner_id')
		if isinstance(partner_id, list):
			partner_id = partner_id[0]

		return {
			'partner_id': partner_id,
			'date_order': order_data.get('date_order', datetime.now()),
			'note': order_data.get('note', ''),
			'client_order_ref': order_data.get('client_order_ref', ''),
			'raccolta_session_id': session.id,
			'user_id': session.user_id.id,
			'company_id': session.company_id.id,
			'warehouse_id': session.warehouse_id.id if session.warehouse_id else False,
			'pricelist_id': order_data.get('pricelist_id', session.company_id.property_product_pricelist.id),
			'payment_term_id': order_data.get('payment_term_id', False),
			'state': 'draft',
			'offline_order': True,
			'offline_created_at': order_data.get('created_at'),
			'offline_local_id': order_data.get('local_id'),
		}

	def _sync_order_lines(self, order, order_lines_data):
		"""Sincronizza righe ordine"""
		# Rimuovi righe esistenti se aggiornamento
		order.order_line.unlink()

		for line_data in order_lines_data:
			product_id = line_data.get('product_id')
			if isinstance(product_id, list):
				product_id = product_id[0]

			product = request.env['product.product'].browse(product_id)
			if not product.exists():
				continue

			# Calcola prezzo
			price_unit = line_data.get('price_unit', 0.0)
			if not price_unit:
				price_unit = product.list_price

			line_vals = {
				'order_id': order.id,
				'product_id': product.id,
				'name': line_data.get('name', product.name),
				'product_uom_qty': line_data.get('product_uom_qty', 1.0),
				'price_unit': price_unit,
				'product_uom': product.uom_id.id,
				'discount': line_data.get('discount', 0.0),
				'sequence': line_data.get('sequence', 10),
			}

			request.env['sale.order.line'].create(line_vals)

	def _retry_order_sync(self, order):
		"""Riprova sincronizzazione ordine fallito"""
		try:
			# Verifica se ordine è ancora valido
			if not order.partner_id:
				raise ValidationError("Partner mancante")

			if not order.order_line:
				raise ValidationError("Nessuna riga ordine")

			# Conferma ordine se necessario
			if order.state == 'draft':
				order.action_confirm()

			# Genera picking se configurato
			if hasattr(order, '_create_delivery') and order.picking_ids:
				for picking in order.picking_ids.filtered(lambda p: p.state == 'draft'):
					picking.action_confirm()
					picking.action_assign()

			# Marca come sincronizzato
			order.write({
				'synced_to_odoo': True,
				'sync_date': datetime.now()
			})

		except Exception as e:
			_logger.error(f"Errore retry ordine {order.name}: {str(e)}")
			raise

	def _update_user_counters(self, user, sync_results):
		"""Aggiorna contatori utente dopo sincronizzazione"""
		try:
			counters = request.env['raccolta.counter'].search([
				('user_id', '=', user.id)
			])

			for counter in counters:
				if counter.counter_type == 'order':
					# Aggiorna contatore ordini
					synced_count = sync_results.get('orders_synced', 0)
					if synced_count > 0:
						counter.write({
							'current_number': counter.current_number + synced_count,
							'last_sync_at': datetime.now()
						})

				elif counter.counter_type == 'picking':
					# Aggiorna contatore picking
					synced_count = sync_results.get('pickings_synced', 0)
					if synced_count > 0:
						counter.write({
							'current_number': counter.current_number + synced_count,
							'last_sync_at': datetime.now()
						})

				elif counter.counter_type == 'ddt':
					# Aggiorna contatore DDT
					synced_count = sync_results.get('ddts_synced', 0)
					if synced_count > 0:
						counter.write({
							'current_number': counter.current_number + synced_count,
							'last_sync_at': datetime.now()
						})

		except Exception as e:
			_logger.warning(f"Errore aggiornamento contatori utente {user.name}: {str(e)}")

	@http.route('/raccolta/sync/validate_data', type='json', auth='user')
	def validate_sync_data(self, orders=None, pickings=None, ddts=None):
		"""Valida dati prima della sincronizzazione"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			validation_results = {
				'valid': True,
				'errors': [],
				'warnings': [],
				'orders_valid': 0,
				'orders_invalid': 0
			}

			# Valida ordini
			if orders:
				for i, order_data in enumerate(orders):
					order_errors = []

					# Controlla partner
					partner_id = order_data.get('partner_id')
					if not partner_id:
						order_errors.append("Partner mancante")
					else:
						if isinstance(partner_id, list):
							partner_id = partner_id[0]
						partner = request.env['res.partner'].browse(partner_id)
						if not partner.exists():
							order_errors.append(f"Partner {partner_id} non esistente")

					# Controlla righe ordine
					order_lines = order_data.get('order_lines', [])
					if not order_lines:
						order_errors.append("Nessuna riga ordine")
					else:
						for line in order_lines:
							product_id = line.get('product_id')
							if not product_id:
								order_errors.append("Prodotto mancante in riga ordine")
							else:
								if isinstance(product_id, list):
									product_id = product_id[0]
								product = request.env['product.product'].browse(product_id)
								if not product.exists():
									order_errors.append(f"Prodotto {product_id} non esistente")

					if order_errors:
						validation_results['orders_invalid'] += 1
						validation_results['errors'].append({
							'order_index': i,
							'order_name': order_data.get('name', 'Unknown'),
							'errors': order_errors
						})
						validation_results['valid'] = False
					else:
						validation_results['orders_valid'] += 1

			return {
				'success': True,
				'validation': validation_results
			}

		except Exception as e:
			_logger.error(f"Errore validazione dati: {str(e)}")
			return {'error': str(e)}