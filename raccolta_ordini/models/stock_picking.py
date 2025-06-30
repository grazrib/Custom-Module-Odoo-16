# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


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

	# Campi DDT collegati - usando relazione standard del modulo DDT
	ddt_count = fields.Integer(
		string='Numero DDT',
		compute='_compute_ddt_count',
		help='Numero di DDT collegati'
	)

	# === COMPUTED FIELDS ===
	@api.depends('delivery_note_ids')
	def _compute_ddt_count(self):
		"""Calcola numero DDT collegati"""
		for picking in self:
			# Usa il campo standard delivery_note_ids se esiste
			if hasattr(picking, 'delivery_note_ids'):
				picking.ddt_count = len(picking.delivery_note_ids)
			else:
				picking.ddt_count = 0

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
		if not self.env['ir.module.module'].search([
			('name', '=', 'l10n_it_delivery_note_base'),
			('state', '=', 'installed')
		]):
			_logger.warning("Modulo l10n_it_delivery_note_base non installato - skip DDT automatico")
			return

		try:
			# Prepara dati DDT
			ddt_data = self._prepare_ddt_data(config, user)
			
			# Crea DDT
			ddt = self.env['stock.delivery.note'].create(ddt_data)
			
			# Marca DDT come creato
			self.write({
				'ddt_created': True,
				'ddt_ids': [(4, ddt.id)]
			})

			_logger.info(f"DDT automatico creato: {ddt.name} per picking {self.name}")

		except Exception as e:
			_logger.error(f"Errore creazione DDT automatico per picking {self.name}: {str(e)}")
			# Non bloccare il flusso, solo log dell'errore

	def _prepare_ddt_data(self, config, user):
		"""Prepara dati per creazione DDT"""
		self.ensure_one()

		# Dati base DDT
		ddt_data = {
			'partner_sender_id': self.company_id.partner_id.id,
			'partner_id': self.partner_id.id,
			'picking_ids': [(4, self.id)],
			'date': fields.Date.today(),
			'type_id': config.ddt_type_id.id if config.ddt_type_id else False,
		}

		# Configurazioni trasporto da config se disponibili
		if config.ddt_transport_reason_id:
			ddt_data['transport_reason_id'] = config.ddt_transport_reason_id.id

		if config.ddt_goods_appearance_id:
			ddt_data['goods_appearance_id'] = config.ddt_goods_appearance_id.id

		if config.ddt_transport_condition_id:
			ddt_data['transport_condition_id'] = config.ddt_transport_condition_id.id

		# Dati agente
		ddt_data.update({
			'note': f'DDT generato automaticamente da sessione raccolta {self.raccolta_session_id.name}',
			'agent_code': user.agent_code,
		})

		return ddt_data

	# === BUSINESS METHODS ===
	@api.model
	def create_offline_picking(self, picking_data):
		"""Crea picking da dati offline"""
		validated_data = self._validate_offline_picking_data(picking_data)
		
		picking = self.create(validated_data)
		
		# Marca come sincronizzato
		picking.write({
			'synced_to_odoo': True,
			'sync_at': fields.Datetime.now()
		})
		
		return picking

	def _validate_offline_picking_data(self, data):
		"""Valida e converte dati picking offline"""
		if 'partner_id' not in data:
			raise UserError(_('Cliente mancante nei dati picking offline'))

		if 'location_id' not in data:
			raise UserError(_('Ubicazione origine mancante'))

		if 'location_dest_id' not in data:
			raise UserError(_('Ubicazione destinazione mancante'))

		# Prepara move lines
		move_lines = []
		for move_data in data.get('move_lines', []):
			move_lines.append((0, 0, {
				'product_id': move_data['product_id'],
				'product_uom_qty': move_data['quantity'],
				'product_uom': move_data.get('product_uom', False),
				'name': move_data.get('name', ''),
				'location_id': data['location_id'],
				'location_dest_id': data['location_dest_id'],
			}))

		return {
			'partner_id': data['partner_id'],
			'location_id': data['location_id'],
			'location_dest_id': data['location_dest_id'],
			'picking_type_id': data.get('picking_type_id'),
			'move_lines': move_lines,
			'is_offline_picking': True,
			'offline_created_at': data.get('created_at'),
			'auto_create_ddt': data.get('auto_create_ddt', False),
		}

	def sync_to_odoo(self):
		"""Sincronizza picking offline con Odoo"""
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
			raise UserError(_('Errore durante la sincronizzazione picking: %s') % str(e))

	def action_view_ddt(self):
		"""Visualizza DDT collegati"""
		self.ensure_one()

		# Usa il campo standard se esiste
		ddt_ids = []
		if hasattr(self, 'delivery_note_ids'):
			ddt_ids = self.delivery_note_ids.ids

		if not ddt_ids:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Nessun DDT'),
					'message': _('Nessun DDT trovato per questo picking'),
					'type': 'info',
				}
			}

		# Cerca action DDT appropriata
		try:
			action = self.env.ref('l10n_it_delivery_note.action_stock_delivery_note_out').read()[0]
		except:
			# Fallback se ref non trovata
			action = {
				'type': 'ir.actions.act_window',
				'name': _('DDT'),
				'res_model': 'stock.delivery.note',
				'view_mode': 'tree,form',
			}

		if len(ddt_ids) > 1:
			action['domain'] = [('id', 'in', ddt_ids)]
		else:
			action['views'] = [(False, 'form')]
			action['res_id'] = ddt_ids[0]

		return action

	def action_create_ddt_manual(self):
		"""Crea DDT manualmente"""
		self.ensure_one()

		if self.ddt_created:
			raise UserError(_('DDT già creato per questo picking'))

		if self.state != 'done':
			raise UserError(_('Il picking deve essere validato prima di creare il DDT'))

		# Cerca configurazione
		config = None
		if self.raccolta_session_id:
			config = self.raccolta_session_id.config_id
		else:
			# Usa configurazione default
			config = self.env['raccolta.config'].search([
				('company_id', '=', self.company_id.id),
				('active', '=', True)
			], limit=1)

		if not config:
			raise UserError(_('Nessuna configurazione raccolta ordini trovata'))

		# Forza creazione DDT
		self.auto_create_ddt = True
		self._create_automatic_ddt()

		return {
			'type': 'ir.actions.client',
			'tag': 'display_notification',
			'params': {
				'title': _('DDT Creato'),
				'message': _('DDT creato con successo'),
				'type': 'success',
			}
		}

	def get_picking_data_for_receipt(self):
		"""Ottiene dati picking per ricevuta"""
		self.ensure_one()
		
		return {
			'name': self.name,
			'id': self.id,
			'state': self.state,
			'scheduled_date': self.scheduled_date,
			'date_done': self.date_done,
			'partner': {
				'name': self.partner_id.name,
				'street': self.partner_id.street or '',
				'city': self.partner_id.city or '',
				'zip': self.partner_id.zip or '',
			},
			'move_lines': [
				{
					'product_name': move.product_id.name,
					'product_code': move.product_id.default_code or '',
					'quantity_done': move.quantity_done,
					'product_uom': move.product_uom.name,
				}
				for move in self.move_lines
			],
			'agent_code': self.agent_code or '',
			'ddt_count': self.ddt_count,
		}