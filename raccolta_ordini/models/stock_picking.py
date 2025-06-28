# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError


class StockPicking(models.Model):
	"""Estensione picking per raccolta ordini"""
	_inherit = 'stock.picking'

	# === CAMPI RACCOLTA ORDINI ===
	raccolta_session_id = fields.Many2one(
		'raccolta.session',
		string='Sessione Raccolta',
		related='sale_id.raccolta_session_id',
		store=True,
		help='Sessione di raccolta dell\'ordine collegato'
	)

	agent_code = fields.Char(
		string='Codice Agente',
		related='raccolta_session_id.user_id.agent_code',
		store=True,
		help='Codice dell\'agente che ha creato il picking'
	)

	is_offline_picking = fields.Boolean(
		string='Picking Offline',
		default=False,
		help='Indica se il picking è stato creato offline'
	)

	synced_to_odoo = fields.Boolean(
		string='Sincronizzato',
		default=True,
		help='Indica se il picking è stato sincronizzato con Odoo'
	)

	offline_created_at = fields.Datetime(
		string='Creato Offline Il',
		help='Data e ora di creazione offline'
	)

	sync_at = fields.Datetime(
		string='Sincronizzato Il',
		help='Data e ora di sincronizzazione'
	)

	# === CAMPI DDT AUTOMATICO ===
	auto_create_ddt = fields.Boolean(
		string='Crea DDT Automatico',
		default=False,
		help='Crea automaticamente il DDT alla validazione'
	)

	ddt_created = fields.Boolean(
		string='DDT Creato',
		default=False,
		help='Indica se il DDT è stato creato per questo picking'
	)

	# === OVERRIDE METODI ===
	def button_validate(self):
		"""Override validazione per creare DDT automatico"""
		result = super(StockPicking, self).button_validate()

		# Crea DDT automatico per picking raccolta ordini
		for picking in self:
			if (picking.auto_create_ddt and
					picking.raccolta_session_id and
					not picking.ddt_created and
					picking.state == 'done'):
				picking._create_automatic_ddt()

		return result

	def _create_automatic_ddt(self):
		"""Crea DDT automatico per il picking"""
		self.ensure_one()

		if not self.raccolta_session_id:
			return

		config = self.raccolta_session_id.config_id
		user = self.raccolta_session_id.user_id

		# Verifica che il modulo DDT sia installato
		if 'stock.delivery.note' not in self.env:
			return

		try:
			# Prepara valori per DDT
			ddt_vals = self._prepare_ddt_values()

			# Se l'utente ha numerazione personalizzata, genera nome personalizzato
			if (user.is_raccolta_agent and
					user.ddt_sequence_id and
					config.use_agent_numbering):
				ddt_vals['name'] = user.get_next_ddt_number()

			# Crea DDT
			ddt = self.env['stock.delivery.note'].create(ddt_vals)

			# Collega picking al DDT
			ddt.write({'picking_ids': [(4, self.id)]})

			# Marca picking come avente DDT
			self.ddt_created = True

			# Log creazione
			self.message_post(
				body=_('DDT automatico creato: %s') % ddt.name,
				message_type='notification'
			)

		except Exception as e:
			# Log errore ma non bloccare il processo
			self.message_post(
				body=_('Errore creazione DDT automatico: %s') % str(e),
				message_type='notification'
			)

	def _prepare_ddt_values(self):
		"""Prepara valori per creazione DDT"""
		config = self.raccolta_session_id.config_id

		# Determina partner mittente e destinatario
		partners = self._get_ddt_partners()

		return {
			'company_id': self.company_id.id,
			'partner_sender_id': partners['sender'].id,
			'partner_id': partners['recipient'].id,
			'partner_shipping_id': partners['shipping'].id,
			'type_id': config.ddt_type_id.id if config.ddt_type_id else False,
			'date': self.date_done or fields.Datetime.now(),
			'transport_reason_id': (
				config.ddt_transport_reason_id.id if config.ddt_transport_reason_id
				else self._get_default_transport_reason()
			),
			'goods_appearance_id': (
				config.ddt_goods_appearance_id.id if config.ddt_goods_appearance_id
				else self._get_default_goods_appearance()
			),
			'transport_condition_id': (
				config.ddt_transport_condition_id.id if config.ddt_transport_condition_id
				else self._get_default_transport_condition()
			),
			'transport_method_id': self._get_default_transport_method(),
			'carrier_id': self.carrier_id.partner_id.id if self.carrier_id else False,
			'delivery_method_id': self.carrier_id.id if self.carrier_id else False,
		}

	def _get_ddt_partners(self):
		"""Determina partner per DDT"""
		# Partner mittente (di solito l'azienda)
		sender = self.company_id.partner_id

		# Partner destinatario (cliente dell'ordine)
		recipient = self.partner_id
		if self.sale_id and self.sale_id.partner_id:
			recipient = self.sale_id.partner_id

		# Partner spedizione (indirizzo di consegna)
		shipping = recipient
		if self.sale_id and self.sale_id.partner_shipping_id:
			shipping = self.sale_id.partner_shipping_id

		return {
			'sender': sender,
			'recipient': recipient,
			'shipping': shipping
		}

	def _get_default_transport_reason(self):
		"""Ottiene causale trasporto di default"""
		reason = self.env['stock.picking.transport.reason'].search([
			('code', '=', 'sale')
		], limit=1)

		if not reason:
			reason = self.env['stock.picking.transport.reason'].search([], limit=1)

		return reason.id if reason else False

	def _get_default_goods_appearance(self):
		"""Ottiene aspetto merci di default"""
		appearance = self.env['stock.picking.goods.appearance'].search([
			('code', '=', 'package')
		], limit=1)

		if not appearance:
			appearance = self.env['stock.picking.goods.appearance'].search([], limit=1)

		return appearance.id if appearance else False

	def _get_default_transport_condition(self):
		"""Ottiene condizione trasporto di default"""
		condition = self.env['stock.picking.transport.condition'].search([
			('code', '=', 'assigned')
		], limit=1)

		if not condition:
			condition = self.env['stock.picking.transport.condition'].search([], limit=1)

		return condition.id if condition else False

	def _get_default_transport_method(self):
		"""Ottiene metodo trasporto di default"""
		method = self.env['stock.picking.transport.method'].search([
			('code', '=', 'recipient')
		], limit=1)

		if not method:
			method = self.env['stock.picking.transport.method'].search([], limit=1)

		return method.id if method else False

	def mark_as_synced(self):
		"""Marca picking come sincronizzato"""
		self.ensure_one()

		self.write({
			'synced_to_odoo': True,
			'sync_at': fields.Datetime.now()
		})

	def create_offline_copy(self):
		"""Crea copia del picking per uso offline"""
		self.ensure_one()

		offline_data = {
			'id': f'offline_picking_{self.id}_{fields.Datetime.now().timestamp()}',
			'name': self.name,
			'partner_id': self.partner_id.id,
			'sale_id': self.sale_id.id if self.sale_id else False,
			'location_id': self.location_id.id,
			'location_dest_id': self.location_dest_id.id,
			'picking_type_id': self.picking_type_id.id,
			'state': self.state,
			'scheduled_date': self.scheduled_date.isoformat() if self.scheduled_date else None,
			'date_done': self.date_done.isoformat() if self.date_done else None,
			'auto_create_ddt': self.auto_create_ddt,
			'move_lines': [
				{
					'product_id': move.product_id.id,
					'name': move.name,
					'product_uom_qty': move.product_uom_qty,
					'product_uom': move.product_uom.id,
					'location_id': move.location_id.id,
					'location_dest_id': move.location_dest_id.id,
				}
				for move in self.move_lines
			],
			'is_offline_picking': True,
			'synced_to_odoo': True,
			'original_picking_id': self.id,
		}

		return offline_data

	def action_view_ddt(self):
		"""Visualizza DDT collegati al picking"""
		self.ensure_one()

		# Cerca DDT collegati
		ddts = self.env['stock.delivery.note'].search([
			('picking_ids', 'in', self.id)
		])

		if not ddts:
			raise UserError(_('Nessun DDT trovato per questo picking'))

		action = self.env.ref('l10n_it_delivery_note.action_delivery_note_out').read()[0]

		if len(ddts) > 1:
			action['domain'] = [('id', 'in', ddts.ids)]
		elif len(ddts) == 1:
			action['views'] = [(self.env.ref('l10n_it_delivery_note.view_delivery_note_form').id, 'form')]
			action['res_id'] = ddts.id

		return action

	def action_create_ddt_manual(self):
		"""Crea DDT manualmente"""
		self.ensure_one()

		if self.ddt_created:
			raise UserError(_('DDT già creato per questo picking'))

		if self.state != 'done':
			raise UserError(_('Il picking deve essere validato per creare il DDT'))

		self._create_automatic_ddt()

		return {
			'type': 'ir.actions.client',
			'tag': 'display_notification',
			'params': {
				'title': _('DDT Creato'),
				'message': _('DDT creato con successo per il picking %s') % self.name,
				'type': 'success',
			}
		}
