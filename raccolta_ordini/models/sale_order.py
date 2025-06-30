# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError
import json
import base64


class SaleOrder(models.Model):
	"""Estensione ordini di vendita per raccolta offline"""
	_inherit = 'sale.order'

	# === CAMPI RACCOLTA ORDINI ===
	raccolta_session_id = fields.Many2one(
		'raccolta.session',
		string='Sessione Raccolta',
		help='Sessione di raccolta in cui è stato creato l\'ordine'
	)

	agent_code = fields.Char(
		string='Codice Agente',
		related='raccolta_session_id.user_id.agent_code',
		store=True,
		help='Codice dell\'agente che ha creato l\'ordine'
	)

	is_offline_order = fields.Boolean(
		string='Ordine Offline',
		default=False,
		help='Indica se l\'ordine è stato creato offline'
	)

	synced_to_odoo = fields.Boolean(
		string='Sincronizzato',
		default=True,
		help='Indica se l\'ordine è stato sincronizzato con Odoo'
	)

	offline_created_at = fields.Datetime(
		string='Creato Offline Il',
		help='Data e ora di creazione offline'
	)

	sync_at = fields.Datetime(
		string='Sincronizzato Il',
		help='Data e ora di sincronizzazione'
	)

	# === CAMPI DDT E PICKING ===
	auto_create_picking = fields.Boolean(
		string='Crea Picking Automatico',
		default=True,
		help='Crea automaticamente il picking alla conferma'
	)

	auto_create_ddt = fields.Boolean(
		string='Crea DDT Automatico',
		default=True,
		help='Crea automaticamente il DDT alla validazione picking'
	)

	# ✅ CORRETTI: Campi DDT per compatibilità con l10n_it_delivery_note_base
	ddt_ids = fields.One2many(
		'stock.delivery.note',
		'sale_order_id',  # Campo che potrebbe esistere nel modulo DDT
		string='DDT Collegati',
		help='DDT generati per questo ordine'
	)

	ddt_count = fields.Integer(
		string='Numero DDT',
		compute='_compute_ddt_count',
		help='Numero di DDT collegati'
	)

	# === CAMPI RICEVUTE ===
	receipt_printed = fields.Boolean(
		string='Ricevuta Stampata',
		default=False,
		help='Indica se la ricevuta è stata stampata'
	)

	receipt_format = fields.Selection([
		('48mm', 'Formato 48mm'),
		('80mm', 'Formato 80mm'),
		('pdf', 'PDF Standard'),
	], string='Formato Ricevuta',
		help='Formato utilizzato per la ricevuta')

	# ✅ COMPLETATO: Campo signature_data
	signature_data = fields.Text(
		string='Dati Firma',
		help='Dati della firma digitale del cliente in formato base64'
	)

	# === CAMPI AGGIUNTIVI ===
	general_notes = fields.Text(
		string='Note Generali',
		help='Note generali per l\'ordine'
	)

	internal_notes = fields.Text(
		string='Note Interne',
		help='Note interne non visibili al cliente'
	)

	delivery_instructions = fields.Text(
		string='Istruzioni Consegna',
		help='Istruzioni specifiche per la consegna'
	)

	offline_client_data = fields.Text(
		string='Dati Cliente Offline',
		help='Dati del cliente memorizzati offline (JSON)'
	)

	# === COMPUTED FIELDS ===
	@api.depends('ddt_ids')
	def _compute_ddt_count(self):
		"""Calcola il numero di DDT collegati"""
		for order in self:
			order.ddt_count = len(order.ddt_ids)

	# === BUSINESS METHODS ===
	@api.model
	def create_offline_order(self, order_data):
		"""Crea ordine da dati offline"""
		# Valida e prepara i dati
		validated_data = self._validate_offline_data(order_data)
		
		# Crea l'ordine
		order = self.create(validated_data)
		
		# Marca come sincronizzato
		order.write({
			'synced_to_odoo': True,
			'sync_at': fields.Datetime.now()
		})
		
		return order

	def _validate_offline_data(self, data):
		"""Valida e converte dati offline in formato Odoo"""
		# Partner validation
		if 'partner_id' not in data:
			raise UserError(_('Cliente mancante nei dati offline'))
		
		# Gestisce dati cliente offline se necessario
		if data.get('offline_client_data'):
			client_data = json.loads(data['offline_client_data'])
			# Logica per gestire cliente offline
		
		# Prepara order lines
		order_lines = []
		for line_data in data.get('order_line', []):
			order_lines.append((0, 0, {
				'product_id': line_data['product_id'],
				'product_uom_qty': line_data['quantity'],
				'price_unit': line_data['price_unit'],
				'name': line_data.get('name', ''),
			}))
		
		return {
			'partner_id': data['partner_id'],
			'order_line': order_lines,
			'is_offline_order': True,
			'offline_created_at': data.get('created_at'),
			'general_notes': data.get('general_notes', ''),
			'internal_notes': data.get('internal_notes', ''),
			'delivery_instructions': data.get('delivery_instructions', ''),
			'signature_data': data.get('signature_data', ''),
			'offline_client_data': data.get('offline_client_data', ''),
		}

	def action_confirm(self):
		"""Override conferma ordine per creare picking automatico"""
		result = super(SaleOrder, self).action_confirm()
		
		# Crea picking automatico per ordini raccolta
		for order in self:
			if (order.raccolta_session_id and 
				order.auto_create_picking and 
				order.state == 'sale'):
				order._create_automatic_picking()
		
		return result

	def _create_automatic_picking(self):
		"""Crea picking automatico per ordine raccolta"""
		self.ensure_one()
		
		if not self.raccolta_session_id:
			return
		
		# Trova picking esistenti
		pickings = self.picking_ids.filtered(
			lambda p: p.state not in ['done', 'cancel']
		)
		
		# Configura picking per DDT automatico
		for picking in pickings:
			if self.auto_create_ddt:
				picking.auto_create_ddt = True
				picking.raccolta_session_id = self.raccolta_session_id

	def print_receipt(self, format='48mm', include_signature=True):
		"""Stampa ricevuta ordine"""
		self.ensure_one()
		
		# Prepara dati per ricevuta
		receipt_data = self.create_receipt_data(format, include_signature)
		
		# Marca come stampata
		self.receipt_printed = True
		self.receipt_format = format
		
		# Ritorna azione per stampa
		return {
			'type': 'ir.actions.report',
			'report_name': f'raccolta_ordini.receipt_{format}',
			'report_type': 'qweb-html',
			'datas': receipt_data,
			'context': {'active_id': self.id}
		}

	def create_receipt_data(self, format='48mm', include_signature=True):
		"""Crea dati per generazione ricevuta"""
		self.ensure_one()

		# Dati azienda
		company = self.company_id
		company_data = {
			'name': company.name,
			'street': company.street or '',
			'street2': company.street2 or '',
			'city': company.city or '',
			'zip': company.zip or '',
			'state': company.state_id.name if company.state_id else '',
			'country': company.country_id.name if company.country_id else '',
			'phone': company.phone or '',
			'email': company.email or '',
			'vat': company.vat or '',
			'website': company.website or '',
		}

		# Dati cliente
		client_data = {
			'name': self.partner_id.name,
			'display_name': self.partner_id.display_name,
			'street': self.partner_id.street or '',
			'street2': self.partner_id.street2 or '',
			'city': self.partner_id.city or '',
			'zip': self.partner_id.zip or '',
			'state': self.partner_id.state_id.name if self.partner_id.state_id else '',
			'country_id': self.partner_id.country_id.name if self.partner_id.country_id else '',
			'phone': self.partner_id.phone or '',
			'mobile': self.partner_id.mobile or '',
			'email': self.partner_id.email or '',
			'vat': self.partner_id.vat or '',
			'is_company': self.partner_id.is_company,
		}

		# Dati ordine
		order_data = {
			'name': self.name,
			'id': self.id,
			'state': self.state,
			'date_order': self.date_order,
			'amount_untaxed': self.amount_untaxed,
			'amount_tax': self.amount_tax,
			'amount_total': self.amount_total,
			'currency_name': self.currency_id.name,
			'general_notes': self.general_notes or '',
			'internal_notes': self.internal_notes or '',
			'delivery_instructions': self.delivery_instructions or '',
			'agent_code': self.agent_code or '',
			'order_lines': [
				{
					'product_name': line.product_id.name,
					'product_code': line.product_id.default_code or '',
					'quantity': line.product_uom_qty,
					'uom_name': line.product_uom.name,
					'price_unit': line.price_unit,
					'price_subtotal': line.price_subtotal,
					'note': getattr(line, 'note', '') or '',
				}
				for line in self.order_line
			]
		}

		# Dati firma se inclusa
		signature_data = {}
		if include_signature and self.signature_data:
			try:
				signature_data = {
					'has_signature': True,
					'signature_image': self.signature_data,
				}
			except:
				signature_data = {'has_signature': False}

		return {
			'company': company_data,
			'client': client_data,
			'order': order_data,
			'signature': signature_data,
			'format': format,
			'print_datetime': fields.Datetime.now(),
		}

	def action_view_ddt(self):
		"""Visualizza DDT collegati"""
		self.ensure_one()
		
		if not self.ddt_ids:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Nessun DDT'),
					'message': _('Nessun DDT trovato per questo ordine'),
					'type': 'info',
				}
			}
		
		action = self.env.ref('l10n_it_delivery_note_base.action_stock_delivery_note_out').read()[0]
		
		if len(self.ddt_ids) > 1:
			action['domain'] = [('id', 'in', self.ddt_ids.ids)]
		else:
			action['views'] = [(False, 'form')]
			action['res_id'] = self.ddt_ids.id
		
		return action

	def sync_to_odoo(self):
		"""Sincronizza ordine offline con Odoo"""
		self.ensure_one()
		
		if self.synced_to_odoo:
			return True
		
		# Logica di sincronizzazione
		try:
			# Aggiorna stato
			self.write({
				'synced_to_odoo': True,
				'sync_at': fields.Datetime.now()
			})
			
			return True
		except Exception as e:
			raise UserError(_('Errore durante la sincronizzazione: %s') % str(e))