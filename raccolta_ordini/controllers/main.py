# -*- coding: utf-8 -*-

import json
import logging
from datetime import datetime

from odoo import http, _
from odoo.http import request
from odoo.exceptions import UserError, AccessError
from odoo.addons.web.controllers.main import ensure_db

_logger = logging.getLogger(__name__)


class RaccoltaController(http.Controller):
	"""Controller principale per raccolta ordini (stile POS)"""

	@http.route(['/raccolta', '/raccolta/ui'], type='http', auth='user')
	def raccolta_ui(self, config_id=None, session_id=None, **k):
		"""Interfaccia principale raccolta ordini"""
		ensure_db()

		try:
			# Verifica che l'utente sia un agente
			if not request.env.user.is_raccolta_agent:
				return request.render('raccolta_ordini.access_denied', {
					'message': _('Accesso negato: utente non abilitato alla raccolta ordini')
				})

			# Ottieni configurazione
			config = None
			session = None

			if session_id:
				# Apri da sessione specifica
				session = request.env['raccolta.session'].browse(int(session_id))
				if session.exists() and session.user_id == request.env.user:
					config = session.config_id
				else:
					raise UserError(_('Sessione non valida o non autorizzata'))

			elif config_id:
				# Apri da configurazione
				config = request.env['raccolta.config'].browse(int(config_id))
				if not config.exists():
					raise UserError(_('Configurazione non trovata'))

			else:
				# Usa configurazione di default
				config = request.env['raccolta.config'].get_default_config()

			# Crea o ottieni sessione attiva
			if not session:
				existing_session = request.env['raccolta.session'].search([
					('config_id', '=', config.id),
					('user_id', '=', request.env.user.id),
					('state', '=', 'opened')
				], limit=1)

				if existing_session:
					session = existing_session
				else:
					# Crea nuova sessione
					session = request.env['raccolta.session'].create({
						'config_id': config.id,
						'user_id': request.env.user.id,
						'state': 'opened'
					})

			# Prepara dati per frontend
			session_info = self._prepare_session_info(session)

			# Carica dati offline iniziali
			offline_data = config.get_offline_data()

			return request.render('raccolta_ordini.index', {
				'session_info': json.dumps(session_info),
				'offline_data': json.dumps(offline_data),
				'config_id': config.id,
				'session_id': session.id,
				'debug': request.session.debug,
			})

		except Exception as e:
			_logger.error(f"Errore apertura raccolta UI: {str(e)}")
			return request.render('raccolta_ordini.error_page', {
				'error_message': str(e)
			})

	@http.route('/raccolta/session/open', type='json', auth='user')
	def open_session(self, config_id):
		"""Apre una nuova sessione"""
		try:
			config = request.env['raccolta.config'].browse(config_id)

			if not config.exists():
				return {'error': _('Configurazione non trovata')}

			# Verifica autorizzazioni
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			# Crea sessione
			session = request.env['raccolta.session'].create({
				'config_id': config.id,
				'user_id': request.env.user.id,
				'state': 'opened'
			})

			return {
				'success': True,
				'session_id': session.id,
				'session_info': self._prepare_session_info(session)
			}

		except Exception as e:
			_logger.error(f"Errore apertura sessione: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/session/close', type='json', auth='user')
	def close_session(self, session_id):
		"""Chiude una sessione"""
		try:
			session = request.env['raccolta.session'].browse(session_id)

			if not session.exists() or session.user_id != request.env.user:
				return {'error': _('Sessione non valida')}

			session.action_close()

			return {
				'success': True,
				'message': _('Sessione chiusa con successo')
			}

		except Exception as e:
			_logger.error(f"Errore chiusura sessione: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/session/status', type='json', auth='user')
	def session_status(self, session_id):
		"""Ottiene stato della sessione"""
		try:
			session = request.env['raccolta.session'].browse(session_id)

			if not session.exists():
				return {'error': _('Sessione non trovata')}

			return {
				'success': True,
				'session': self._prepare_session_info(session),
				'summary': session.get_session_summary()
			}

		except Exception as e:
			_logger.error(f"Errore stato sessione: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/print_receipt', type='http', auth='user')
	def print_receipt(self, order_id, format='48mm', **kwargs):
		"""Genera ricevuta per stampa"""
		try:
			order = request.env['sale.order'].browse(int(order_id))

			if not order.exists():
				return request.not_found()

			# Verifica autorizzazioni
			if order.raccolta_session_id.user_id != request.env.user:
				return request.render('web.access_denied')

			# Genera dati ricevuta
			receipt_data = order.create_receipt_data(format)

			# Determina template da utilizzare
			if format == 'pdf':
				template = 'raccolta_ordini.receipt_pdf_template'
				content_type = 'application/pdf'
			else:
				template = 'raccolta_ordini.receipt_escpos_template'
				content_type = 'text/plain'

			response = request.render(template, {
				'receipt_data': receipt_data,
				'format': format
			})

			response.headers['Content-Type'] = content_type

			if format != 'pdf':
				# Per ESC/POS, suggerisci download
				filename = f"ricevuta_{order.name.replace('/', '_')}.txt"
				response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'

			return response

		except Exception as e:
			_logger.error(f"Errore generazione ricevuta: {str(e)}")
			return request.render('raccolta_ordini.error_page', {
				'error_message': str(e)
			})

	@http.route('/raccolta/config/list', type='json', auth='user')
	def list_configs(self):
		"""Lista configurazioni disponibili per l'utente"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			configs = request.env['raccolta.config'].search([
				('company_id', '=', request.env.company.id),
				('active', '=', True)
			])

			config_list = []
			for config in configs:
				config_list.append({
					'id': config.id,
					'name': config.name,
					'warehouse_name': config.warehouse_id.name,
					'receipt_format': config.receipt_format,
					'has_active_session': bool(config.current_session_id),
					'session_user': config.current_session_id.user_id.name if config.current_session_id else None
				})

			return {
				'success': True,
				'configs': config_list
			}

		except Exception as e:
			_logger.error(f"Errore lista configurazioni: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/user/counters', type='json', auth='user')
	def get_user_counters(self):
		"""Ottiene contatori utente corrente"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			counters = request.env.user.get_offline_counters()

			return {
				'success': True,
				'counters': counters
			}

		except Exception as e:
			_logger.error(f"Errore contatori utente: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/user/reserve_numbers', type='json', auth='user')
	def reserve_numbers(self, order_count=0, ddt_count=0, picking_count=0):
		"""Riserva numeri per uso offline"""
		try:
			if not request.env.user.is_raccolta_agent:
				return {'error': _('Utente non autorizzato')}

			reserved = request.env.user.reserve_offline_numbers(
				order_count=order_count,
				ddt_count=ddt_count,
				picking_count=picking_count
			)

			return {
				'success': True,
				'reserved': reserved
			}

		except Exception as e:
			_logger.error(f"Errore prenotazione numeri: {str(e)}")
			return {'error': str(e)}

	@http.route('/raccolta/health', type='json', auth='user')
	def health_check(self):
		"""Health check per verificare stato sistema"""
		try:
			# Verifica database
			request.env.cr.execute("SELECT 1")

			# Verifica utente
			user_ok = request.env.user.is_raccolta_agent

			# Verifica configurazioni
			configs = request.env['raccolta.config'].search([
				('company_id', '=', request.env.company.id),
				('active', '=', True)
			])

			return {
				'success': True,
				'status': 'healthy',
				'checks': {
					'database': True,
					'user_agent': user_ok,
					'configs_available': len(configs) > 0,
					'l10n_it_delivery_note': 'l10n_it_delivery_note' in request.env.registry._init_modules
				},
				'timestamp': datetime.now().isoformat(),
				'user': request.env.user.name,
				'company': request.env.company.name
			}

		except Exception as e:
			_logger.error(f"Health check failed: {str(e)}")
			return {
				'success': False,
				'status': 'unhealthy',
				'error': str(e)
			}

	def _prepare_session_info(self, session):
		"""Prepara informazioni sessione per frontend"""
		return {
			'session_id': session.id,
			'session_name': session.name,
			'user_id': session.user_id.id,
			'user_name': session.user_id.name,
			'agent_code': session.user_id.agent_code,
			'config_id': session.config_id.id,
			'config_name': session.config_id.name,
			'company_id': session.company_id.id,
			'company_name': session.company_id.name,
			'warehouse_id': session.config_id.warehouse_id.id,
			'warehouse_name': session.config_id.warehouse_id.name,
			'start_at': session.start_at.isoformat() if session.start_at else None,
			'state': session.state,
			'order_count': session.order_count,
			'pending_order_count': session.pending_order_count,
			'receipt_format': session.config_id.receipt_format,
			'auto_print_receipt': session.config_id.auto_print_receipt,
			'barcode_scanner': session.config_id.barcode_scanner,
			'signature_enabled': session.config_id.signature_enabled,
			'use_agent_numbering': session.config_id.use_agent_numbering,
		}


class RaccoltaPortalController(http.Controller):
	"""Controller per accesso portal (clienti)"""

	@http.route('/my/raccolta/orders', type='http', auth='public', website=True)
	def portal_my_orders(self, **kwargs):
		"""Visualizza ordini raccolta per clienti portal"""
		if not request.env.user._is_portal():
			return request.redirect('/web/login')

		partner = request.env.user.partner_id

		# Cerca ordini dell'utente portal
		orders = request.env['sale.order'].search([
			('partner_id', '=', partner.id),
			('raccolta_session_id', '!=', False)
		])

		return request.render('raccolta_ordini.portal_orders', {
			'orders': orders,
			'page_name': 'raccolta_orders'
		})

	@http.route('/my/raccolta/order/<int:order_id>', type='http', auth='public', website=True)
	def portal_order_detail(self, order_id, **kwargs):
		"""Dettaglio ordine per cliente portal"""
		try:
			order = request.env['sale.order'].browse(order_id)

			# Verifica accesso
			if not order.exists() or order.partner_id != request.env.user.partner_id:
				return request.not_found()

			return request.render('raccolta_ordini.portal_order_detail', {
				'order': order,
				'page_name': 'raccolta_order'
			})

		except Exception:
			return request.not_found()

	@http.route('/my/raccolta/receipt/<int:order_id>', type='http', auth='public', website=True)
	def portal_receipt_download(self, order_id, format='pdf', **kwargs):
		"""Download ricevuta per cliente portal"""
		try:
			order = request.env['sale.order'].browse(order_id)

			# Verifica accesso
			if not order.exists() or order.partner_id != request.env.user.partner_id:
				return request.not_found()

			# Genera ricevuta
			receipt_data = order.create_receipt_data(format, include_signature=False)

			if format == 'pdf':
				response = request.render('raccolta_ordini.receipt_pdf_template', {
					'receipt_data': receipt_data,
					'format': format
				})
				response.headers['Content-Type'] = 'application/pdf'
				filename = f"ricevuta_{order.name.replace('/', '_')}.pdf"
				response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
			else:
				response = request.render('raccolta_ordini.receipt_escpos_template', {
					'receipt_data': receipt_data,
					'format': format
				})
				response.headers['Content-Type'] = 'text/plain'
				filename = f"ricevuta_{order.name.replace('/', '_')}.txt"
				response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'

			return response

		except Exception:
			return request.not_found()


class RaccoltaReportController(http.Controller):
	"""Controller per report e analytics"""

	@http.route('/raccolta/report/agent_performance', type='json', auth='user')
	def agent_performance_report(self, date_from=None, date_to=None):
		"""Report performance agenti"""
		try:
			if not request.env.user.has_group('raccolta_ordini.group_raccolta_manager'):
				return {'error': _('Accesso negato')}

			domain = [('raccolta_session_id', '!=', False)]

			if date_from:
				domain.append(('date_order', '>=', date_from))
			if date_to:
				domain.append(('date_order', '<=', date_to))

			orders = request.env['sale.order'].search(domain)

			# Raggruppa per agente
			agent_stats = {}
			for order in orders:
				agent = order.raccolta_session_id.user_id
				if agent.id not in agent_stats:
					agent_stats[agent.id] = {
						'agent_name': agent.name,
						'agent_code': agent.agent_code,
						'order_count': 0,
						'total_amount': 0,
						'avg_order_value': 0,
						'synced_count': 0,
						'pending_count': 0
					}

				stats = agent_stats[agent.id]
				stats['order_count'] += 1
				stats['total_amount'] += order.amount_total

				if order.synced_to_odoo:
					stats['synced_count'] += 1
				else:
					stats['pending_count'] += 1

			# Calcola medie
			for stats in agent_stats.values():
				if stats['order_count'] > 0:
					stats['avg_order_value'] = stats['total_amount'] / stats['order_count']

			return {
				'success': True,
				'agent_stats': list(agent_stats.values()),
				'period': {
					'date_from': date_from,
					'date_to': date_to
				}
			}

		except Exception as e:
			_logger.error(f"Errore report performance: {str(e)}")
			return {'error': str(e)}
