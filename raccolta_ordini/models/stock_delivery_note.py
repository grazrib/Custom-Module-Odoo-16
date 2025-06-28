# -*- coding: utf-8 -*-

from odoo import models, fields, api, _


class StockDeliveryNote(models.Model):
	"""Estensione DDT per raccolta ordini"""
	_inherit = 'stock.delivery.note'

	# === CAMPI RACCOLTA ORDINI ===
	raccolta_session_id = fields.Many2one(
		'raccolta.session',
		string='Sessione Raccolta',
		compute='_compute_raccolta_session',
		store=True,
		help='Sessione di raccolta dell\'ordine collegato'
	)

	agent_code = fields.Char(
		string='Codice Agente',
		related='raccolta_session_id.user_id.agent_code',
		store=True,
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

	# === COMPUTED FIELDS ===
	@api.depends('picking_ids', 'picking_ids.sale_id', 'picking_ids.sale_id.raccolta_session_id')
	def _compute_raccolta_session(self):
		for ddt in self:
			session = False
			if ddt.picking_ids:
				# Prende la sessione dal primo picking che ne ha una
				for picking in ddt.picking_ids:
					if picking.sale_id and picking.sale_id.raccolta_session_id:
						session = picking.sale_id.raccolta_session_id
						break
			ddt.raccolta_session_id = session

	# === BUSINESS METHODS ===
	def mark_as_synced(self):
		"""Marca DDT come sincronizzato"""
		self.ensure_one()

		self.write({
			'synced_to_odoo': True,
			'sync_at': fields.Datetime.now()
		})

	def create_offline_copy(self):
		"""Crea copia del DDT per uso offline"""
		self.ensure_one()

		offline_data = {
			'id': f'offline_ddt_{self.id}_{fields.Datetime.now().timestamp()}',
			'name': self.name,
			'partner_id': self.partner_id.id,
			'partner_shipping_id': self.partner_shipping_id.id,
			'partner_sender_id': self.partner_sender_id.id,
			'type_id': self.type_id.id,
			'date': self.date.isoformat() if self.date else None,
			'transport_reason_id': self.transport_reason_id.id if self.transport_reason_id else False,
			'goods_appearance_id': self.goods_appearance_id.id if self.goods_appearance_id else False,
			'transport_condition_id': self.transport_condition_id.id if self.transport_condition_id else False,
			'transport_method_id': self.transport_method_id.id if self.transport_method_id else False,
			'carrier_id': self.carrier_id.id if self.carrier_id else False,
			'delivery_method_id': self.delivery_method_id.id if self.delivery_method_id else False,
			'packages': self.packages,
			'gross_weight': self.gross_weight,
			'net_weight': self.net_weight,
			'volume': self.volume,
			'state': self.state,
			'picking_ids': [p.id for p in self.picking_ids],
			'is_offline_ddt': True,
			'synced_to_odoo': True,
			'original_ddt_id': self.id,
		}

		return offline_data

	def get_receipt_data(self):
		"""Ottiene dati DDT per ricevute"""
		self.ensure_one()

		return {
			'id': self.id,
			'name': self.name,
			'date': self.date.strftime('%d/%m/%Y') if self.date else '',
			'state': self.state,
			'transport_reason': self.transport_reason_id.name if self.transport_reason_id else 'Vendita',
			'goods_appearance': self.goods_appearance_id.name if self.goods_appearance_id else 'Colli N.1',
			'transport_condition': self.transport_condition_id.name if self.transport_condition_id else 'Porto Assegnato',
			'transport_method': self.transport_method_id.name if self.transport_method_id else 'Destinatario',
			'carrier_name': self.carrier_id.name if self.carrier_id else '',
			'packages': str(self.packages or 1),
			'gross_weight': str(self.gross_weight or ''),
			'net_weight': str(self.net_weight or ''),
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