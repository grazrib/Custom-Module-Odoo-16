# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError


class StockDeliveryNote(models.Model):
	"""Estensione DDT per raccolta ordini"""
	_inherit = 'stock.delivery.note'

	# === CAMPI RACCOLTA ORDINI ===
	agent_code = fields.Char(
		string='Codice Agente',
		help='Codice dell\'agente che ha creato il DDT'
	)

	is_offline_ddt = fields.Boolean(
		string='DDT Offline',
		default=False,
		help='Indica se il DDT è stato creato offline'
	)

	synced_to_odoo = fields.Boolean(
		string='Sincronizzato',
		default=True,
		help='Indica se il DDT è stato sincronizzato con Odoo'
	)

	offline_created_at = fields.Datetime(
		string='Creato Offline Il',
		help='Data e ora di creazione offline'
	)

	sync_at = fields.Datetime(
		string='Sincronizzato Il',
		help='Data e ora di sincronizzazione'
	)

	raccolta_session_id = fields.Many2one(
		'raccolta.session',
		string='Sessione Raccolta',
		help='Sessione di raccolta che ha generato questo DDT'
	)

	# === CAMPI AGGIUNTIVI ===
	general_notes = fields.Text(
		string='Note Generali',
		help='Note generali per il DDT'
	)

	internal_notes = fields.Text(
		string='Note Interne',
		help='Note interne non visibili al cliente'
	)

	signature_data = fields.Text(
		string='Dati Firma',
		help='Dati della firma digitale del cliente in formato base64'
	)

	# === BUSINESS METHODS ===
	@api.model
	def create_offline_ddt(self, ddt_data):
		"""Crea DDT da dati offline"""
		validated_data = self._validate_offline_ddt_data(ddt_data)
		
		ddt = self.create(validated_data)
		
		# Marca come sincronizzato
		ddt.write({
			'synced_to_odoo': True,
			'sync_at': fields.Datetime.now()
		})
		
		return ddt

	def _validate_offline_ddt_data(self, data):
		"""Valida e converte dati DDT offline"""
		if 'partner_id' not in data:
			raise UserError(_('Cliente mancante nei dati DDT offline'))

		if 'partner_sender_id' not in data:
			raise UserError(_('Mittente mancante nei dati DDT offline'))

		return {
			'partner_id': data['partner_id'],
			'partner_sender_id': data['partner_sender_id'],
			'date': data.get('date', fields.Date.today()),
			'is_offline_ddt': True,
			'offline_created_at': data.get('created_at'),
			'agent_code': data.get('agent_code', ''),
			'general_notes': data.get('general_notes', ''),
			'internal_notes': data.get('internal_notes', ''),
			'signature_data': data.get('signature_data', ''),
		}

	def sync_to_odoo(self):
		"""Sincronizza DDT offline con Odoo"""
		self.ensure_one()

		if self.synced_to_odoo:
			return True

		try:
			# Aggiorna stato
			self.write({
				'synced_to_odoo': True,
				'sync_at': fields.Datetime.now()
			})

			return True
		except Exception as e:
			raise UserError(_('Errore durante la sincronizzazione DDT: %s') % str(e))

	def get_ddt_data_for_receipt(self):
		"""Ottiene dati DDT per ricevuta"""
		self.ensure_one()
		
		return {
			'name': self.name,
			'id': self.id,
			'date': self.date,
			'state': self.state,
			'partner': {
				'name': self.partner_id.name,
				'street': self.partner_id.street or '',
				'city': self.partner_id.city or '',
				'zip': self.partner_id.zip or '',
				'vat': self.partner_id.vat or '',
			},
			'sender': {
				'name': self.partner_sender_id.name,
				'street': self.partner_sender_id.street or '',
				'city': self.partner_sender_id.city or '',
				'zip': self.partner_sender_id.zip or '',
				'vat': self.partner_sender_id.vat or '',
			},
			'transport_reason': self.transport_reason_id.name if self.transport_reason_id else '',
			'goods_appearance': self.goods_appearance_id.name if self.goods_appearance_id else '',
			'agent_code': self.agent_code or '',
			'general_notes': self.general_notes or '',
			'synced': self.synced_to_odoo,
		}

	def action_view_sale_orders(self):
		"""Visualizza ordini di vendita collegati"""
		self.ensure_one()

		# Trova ordini collegati tramite picking
		orders = self.env['sale.order']
		for picking in self.picking_ids:
			if picking.sale_id:
				orders |= picking.sale_id

		if not orders:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Nessun Ordine'),
					'message': _('Nessun ordine di vendita collegato a questo DDT'),
					'type': 'info',
				}
			}

		action = self.env.ref('sale.action_orders').read()[0]

		if len(orders) > 1:
			action['domain'] = [('id', 'in', orders.ids)]
		elif len(orders) == 1:
			action['views'] = [(self.env.ref('sale.view_order_form').id, 'form')]
			action['res_id'] = orders.id

		return action

	def action_print_receipt(self):
		"""Stampa ricevuta con dati DDT"""
		self.ensure_one()

		# Trova ordine collegato per generare ricevuta completa
		order = False
		for picking in self.picking_ids:
			if picking.sale_id and picking.sale_id.raccolta_session_id:
				order = picking.sale_id
				break

		if not order:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Impossibile Stampare'),
					'message': _('Nessun ordine raccolta collegato a questo DDT'),
					'type': 'warning',
				}
			}

		# Usa il sistema di stampa dell'ordine
		return order.print_receipt(format='48mm', include_signature=True)


class StockDeliveryNoteLine(models.Model):
	"""Estensione righe DDT per raccolta ordini"""
	_inherit = 'stock.delivery.note.line'

	# === CAMPI AGGIUNTIVI ===
	product_note = fields.Text(
		string='Note Prodotto',
		help='Note specifiche per questo prodotto nel DDT'
	)

	barcode_scanned = fields.Boolean(
		string='Scansionato da Barcode',
		default=False,
		help='Indica se il prodotto è stato aggiunto tramite scanner'
	)Datetime(
		string='Sincronizzato Il',
		help='Data e ora di sincronizzazione'
	)

	raccolta_session_id = fields.Many2one(
		'raccolta.session',
		string='Sessione Raccolta',
		help='Sessione di raccolta che ha generato questo DDT'
	)

	# === CAMPI AGGIUNTIVI ===
	general_notes = fields.Text(
		string='Note Generali',
		help='Note generali per il DDT'
	)

	internal_notes = fields.Text(
		string='Note Interne',
		help='Note interne non visibili al cliente'
	)

	signature_data = fields.Text(
		string='Dati Firma',
		help='Dati della firma digitale del cliente in formato base64'
	)

	# === BUSINESS METHODS ===
	@api.model
	def create_offline_ddt(self, ddt_data):
		"""Crea DDT da dati offline"""
		validated_data = self._validate_offline_ddt_data(ddt_data)
		
		ddt = self.create(validated_data)
		
		# Marca come sincronizzato
		ddt.write({
			'synced_to_odoo': True,
			'sync_at': fields.Datetime.now()
		})
		
		return ddt

	def _validate_offline_ddt_data(self, data):
		"""Valida e converte dati DDT offline"""
		if 'partner_id' not in data:
			raise UserError(_('Cliente mancante nei dati DDT offline'))

		if 'partner_sender_id' not in data:
			raise UserError(_('Mittente mancante nei dati DDT offline'))

		return {
			'partner_id': data['partner_id'],
			'partner_sender_id': data['partner_sender_id'],
			'date': data.get('date', fields.Date.today()),
			'is_offline_ddt': True,
			'offline_created_at': data.get('created_at'),
			'agent_code': data.get('agent_code', ''),
			'general_notes': data.get('general_notes', ''),
			'internal_notes': data.get('internal_notes', ''),
			'signature_data': data.get('signature_data', ''),
		}

	def sync_to_odoo(self):
		"""Sincronizza DDT offline con Odoo"""
		self.ensure_one()

		if self.synced_to_odoo:
			return True

		try:
			# Aggiorna stato
			self.write({
				'synced_to_odoo': True,
				'sync_at': fields.Datetime.now()
			})

			return True
		except Exception as e:
			raise UserError(_('Errore durante la sincronizzazione DDT: %s') % str(e))

	def get_ddt_data_for_receipt(self):
		"""Ottiene dati DDT per ricevuta"""
		self.ensure_one()
		
		return {
			'name': self.name,
			'id': self.id,
			'date': self.date,
			'state': self.state,
			'partner': {
				'name': self.partner_id.name,
				'street': self.partner_id.street or '',
				'city': self.partner_id.city or '',
				'zip': self.partner_id.zip or '',
				'vat': self.partner_id.vat or '',
			},
			'sender': {
				'name': self.partner_sender_id.name,
				'street': self.partner_sender_id.street or '',
				'city': self.partner_sender_id.city or '',
				'zip': self.partner_sender_id.zip or '',
				'vat': self.partner_sender_id.vat or '',
			},
			'transport_reason': self.transport_reason_id.name if self.transport_reason_id else '',
			'goods_appearance': self.goods_appearance_id.name if self.goods_appearance_id else '',
			'agent_code': self.agent_code or '',
			'general_notes': self.general_notes or '',
			'volume': str(self.volume or ''),
			'synced': self.synced_to_odoo,
		}

	def action_view_sale_orders(self):
		"""Visualizza ordini di vendita collegati"""
		self.ensure_one()

		# Trova ordini collegati tramite picking
		orders = self.env['sale.order']
		for picking in self.picking_ids:
			if picking.sale_id:
				orders |= picking.sale_id

		if not orders:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Nessun Ordine'),
					'message': _('Nessun ordine di vendita collegato a questo DDT'),
					'type': 'info',
				}
			}

		action = self.env.ref('sale.action_orders').read()[0]

		if len(orders) > 1:
			action['domain'] = [('id', 'in', orders.ids)]
		elif len(orders) == 1:
			action['views'] = [(self.env.ref('sale.view_order_form').id, 'form')]
			action['res_id'] = orders.id

		return action

	def action_print_receipt(self):
		"""Stampa ricevuta con dati DDT"""
		self.ensure_one()

		# Trova ordine collegato per generare ricevuta completa
		order = False
		for picking in self.picking_ids:
			if picking.sale_id and picking.sale_id.raccolta_session_id:
				order = picking.sale_id
				break

		if not order:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Impossibile Stampare'),
					'message': _('Nessun ordine raccolta collegato a questo DDT'),
					'type': 'warning',
				}
			}

		# Usa il sistema di stampa dell'ordine
		return order.print_receipt(format='48mm', include_signature=True)


class StockDeliveryNoteLine(models.Model):
	"""Estensione righe DDT per raccolta ordini"""
	_inherit = 'stock.delivery.note.line'

	# === CAMPI AGGIUNTIVI ===
	product_note = fields.Text(
		string='Note Prodotto',
		help='Note specifiche per questo prodotto nel DDT'
	)

	barcode_scanned = fields.Boolean(
		string='Scansionato da Barcode',
		default=False,
		help='Indica se il prodotto è stato aggiunto tramite scanner'
	)