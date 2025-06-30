# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError


class ResUsers(models.Model):
	"""Estensione utenti per gestire numerazione personalizzata offline"""
	_inherit = 'res.users'

	# === CAMPI RACCOLTA ORDINI ===
	is_raccolta_agent = fields.Boolean(
		string='Agente Raccolta Ordini',
		default=False,
		help='Utente abilitato alla raccolta ordini offline'
	)

	agent_code = fields.Char(
		string='Codice Agente',
		size=10,
		help='Codice identificativo per numerazione documenti (es: AG001)'
	)

	# === SEQUENZE PERSONALIZZATE ===
	order_sequence_id = fields.Many2one(
		'ir.sequence',
		string='Sequenza Ordini',
		help='Sequenza per numerazione ordini offline',
		ondelete='set null'
	)

	ddt_sequence_id = fields.Many2one(
		'ir.sequence',
		string='Sequenza DDT',
		help='Sequenza per numerazione DDT offline',
		ondelete='set null'
	)

	picking_sequence_id = fields.Many2one(
		'ir.sequence',
		string='Sequenza Picking',
		help='Sequenza per numerazione picking offline',
		ondelete='set null'
	)

	# === CONFIGURAZIONE OFFLINE ===
	max_offline_orders = fields.Integer(
		string='Max Ordini Offline',
		default=100,
		help='Numero massimo di ordini che l\'agente può creare offline'
	)

	offline_data_expiry_days = fields.Integer(
		string='Scadenza Dati Offline (giorni)',
		default=7,
		help='Giorni dopo i quali i dati offline devono essere aggiornati'
	)

	auto_sync_enabled = fields.Boolean(
		string='Auto-Sync Abilitato',
		default=True,
		help='Abilita la sincronizzazione automatica quando online'
	)

	# === STATISTICHE ===
	total_offline_orders = fields.Integer(
		string='Totale Ordini Offline',
		compute='_compute_offline_stats',
		help='Numero totale di ordini creati offline da questo agente'
	)

	pending_sync_count = fields.Integer(
		string='Ordini da Sincronizzare',
		compute='_compute_offline_stats',
		help='Numero di ordini non ancora sincronizzati'
	)

	last_sync_date = fields.Datetime(
		string='Ultima Sincronizzazione',
		help='Data e ora dell\'ultima sincronizzazione riuscita'
	)

	last_activity_date = fields.Datetime(
		string='Ultima Attività',
		help='Data e ora dell\'ultima attività offline'
	)

	# === CONSTRAINTS ===
	@api.constrains('agent_code')
	def _check_agent_code_unique(self):
		"""Verifica unicità codice agente"""
		for user in self:
			if user.agent_code:
				existing = self.search([
					('agent_code', '=', user.agent_code),
					('id', '!=', user.id)
				])
				if existing:
					raise ValidationError(_('Codice agente "%s" già esistente') % user.agent_code)

	@api.constrains('is_raccolta_agent', 'agent_code')
	def _check_agent_requirements(self):
		"""Verifica requisiti per agenti"""
		for user in self:
			if user.is_raccolta_agent and not user.agent_code:
				# Genera automaticamente se mancante
				user.agent_code = user._generate_agent_code()

	# === COMPUTED FIELDS ===
	@api.depends('is_raccolta_agent')
	def _compute_offline_stats(self):
		"""Calcola statistiche ordini offline"""
		for user in self:
			if user.is_raccolta_agent:
				orders = self.env['sale.order'].search([
					('create_uid', '=', user.id),
					('is_offline_order', '=', True)
				])
				user.total_offline_orders = len(orders)
				user.pending_sync_count = len(orders.filtered(lambda o: not o.synced_to_odoo))
			else:
				user.total_offline_orders = 0
				user.pending_sync_count = 0

	# === LIFECYCLE METHODS ===
	@api.model
	def create(self, vals):
		"""Crea sequenze automaticamente per nuovi agenti"""
		user = super(ResUsers, self).create(vals)

		if vals.get('is_raccolta_agent'):
			user._create_user_sequences()

		return user

	def write(self, vals):
		"""Gestisce cambiamenti nello stato di agente"""
		result = super(ResUsers, self).write(vals)

		# Crea sequenze quando utente diventa agente
		if vals.get('is_raccolta_agent'):
			for user in self:
				if not user.order_sequence_id:
					user._create_user_sequences()

		# Cleanup quando utente non è più agente
		elif vals.get('is_raccolta_agent') is False:
			for user in self:
				user._cleanup_user_sequences()

		# Aggiorna codice agente se cambiato
		if vals.get('agent_code'):
			for user in self:
				if user.is_raccolta_agent and user.order_sequence_id:
					user._update_sequence_prefixes()

		return result

	def unlink(self):
		"""Cleanup sequenze prima della cancellazione"""
		for user in self:
			if user.is_raccolta_agent:
				user._cleanup_user_sequences()
		return super(ResUsers, self).unlink()

	# === BUSINESS METHODS ===
	def _create_user_sequences(self):
		"""Crea sequenze personalizzate per l'utente"""
		self.ensure_one()

		if not self.is_raccolta_agent:
			return

		# Genera codice agente se non presente
		if not self.agent_code:
			self.agent_code = self._generate_agent_code()

		agent_code = self.agent_code
		company_id = self.company_id.id or self.env.company.id

		# Sequenza Ordini: RO/AG001/001
		order_seq = self.env['ir.sequence'].create({
			'name': f'Ordini {self.name} ({agent_code})',
			'code': f'raccolta.order.{self.id}',
			'prefix': f'RO/{agent_code}/',
			'suffix': '',
			'padding': 3,
			'number_next_actual': 1,
			'number_increment': 1,
			'company_id': company_id,
			'active': True
		})

		# Sequenza DDT: DDT/AG001/001
		ddt_seq = self.env['ir.sequence'].create({
			'name': f'DDT {self.name} ({agent_code})',
			'code': f'raccolta.ddt.{self.id}',
			'prefix': f'DDT/{agent_code}/',
			'suffix': '',
			'padding': 3,
			'number_next_actual': 1,
			'number_increment': 1,
			'company_id': company_id,
			'active': True
		})

		# Sequenza Picking: PICK/AG001/001
		picking_seq = self.env['ir.sequence'].create({
			'name': f'Picking {self.name} ({agent_code})',
			'code': f'raccolta.picking.{self.id}',
			'prefix': f'PICK/{agent_code}/',
			'suffix': '',
			'padding': 3,
			'number_next_actual': 1,
			'number_increment': 1,
			'company_id': company_id,
			'active': True
		})

		# Aggiorna campi utente
		self.write({
			'order_sequence_id': order_seq.id,
			'ddt_sequence_id': ddt_seq.id,
			'picking_sequence_id': picking_seq.id
		})

	def _cleanup_user_sequences(self):
		"""Rimuove le sequenze dell'utente"""
		self.ensure_one()

		sequences_to_remove = self.env['ir.sequence']

		if self.order_sequence_id:
			sequences_to_remove |= self.order_sequence_id
		if self.ddt_sequence_id:
			sequences_to_remove |= self.ddt_sequence_id
		if self.picking_sequence_id:
			sequences_to_remove |= self.picking_sequence_id

		# Reset campi prima di cancellare
		self.write({
			'order_sequence_id': False,
			'ddt_sequence_id': False,
			'picking_sequence_id': False,
			'agent_code': False
		})

		# Cancella sequenze
		sequences_to_remove.unlink()

	def _update_sequence_prefixes(self):
		"""Aggiorna i prefissi delle sequenze quando cambia il codice agente"""
		self.ensure_one()

		if not self.agent_code:
			return

		agent_code = self.agent_code

		if self.order_sequence_id:
			self.order_sequence_id.write({'prefix': f'RO/{agent_code}/'})

		if self.ddt_sequence_id:
			self.ddt_sequence_id.write({'prefix': f'DDT/{agent_code}/'})

		if self.picking_sequence_id:
			self.picking_sequence_id.write({'prefix': f'PICK/{agent_code}/'})

	def _generate_agent_code(self):
		"""Genera un codice agente univoco"""
		# Cerca ultimo codice esistente
		last_agent = self.search([
			('is_raccolta_agent', '=', True),
			('agent_code', '!=', False)
		], order='agent_code desc', limit=1)

		if last_agent and last_agent.agent_code:
			try:
				# Estrae numero dal codice (es: AG001 -> 1)
				last_num = int(last_agent.agent_code[2:])
				new_num = last_num + 1
			except (ValueError, IndexError):
				new_num = 1
		else:
			new_num = 1

		return f'AG{new_num:03d}'

	def get_offline_counters(self):
		"""Restituisce contatori attuali per download offline"""
		self.ensure_one()

		if not self.is_raccolta_agent:
			raise UserError(_('Utente non abilitato alla raccolta ordini'))

		if not self.order_sequence_id:
			self._create_user_sequences()

		return {
			'agent_code': self.agent_code,
			'user_id': self.id,
			'user_name': self.name,

			# Contatori attuali
			'order_next': self.order_sequence_id.number_next_actual,
			'ddt_next': self.ddt_sequence_id.number_next_actual,
			'picking_next': self.picking_sequence_id.number_next_actual,

			# Prefissi per generazione nomi
			'order_prefix': self.order_sequence_id.prefix,
			'ddt_prefix': self.ddt_sequence_id.prefix,
			'picking_prefix': self.picking_sequence_id.prefix,

			# Configurazioni
			'max_offline_orders': self.max_offline_orders,
			'auto_sync_enabled': self.auto_sync_enabled,
			'last_sync_date': self.last_sync_date.isoformat() if self.last_sync_date else None,
		}

	def reserve_offline_numbers(self, order_count=0, ddt_count=0, picking_count=0):
		"""Riserva numeri per uso offline e restituisce range"""
		self.ensure_one()

		if not self.is_raccolta_agent:
			raise UserError(_('Utente non abilitato alla raccolta ordini'))

		result = {}

		# Riserva numeri ordini
		if order_count > 0:
			start = self.order_sequence_id.number_next_actual
			self.order_sequence_id.write({
				'number_next_actual': start + order_count
			})
			result['orders'] = {
				'start': start,
				'end': start + order_count - 1,
				'prefix': self.order_sequence_id.prefix
			}

		# Riserva numeri DDT
		if ddt_count > 0:
			start = self.ddt_sequence_id.number_next_actual
			self.ddt_sequence_id.write({
				'number_next_actual': start + ddt_count
			})
			result['ddt'] = {
				'start': start,
				'end': start + ddt_count - 1,
				'prefix': self.ddt_sequence_id.prefix
			}

		# Riserva numeri picking
		if picking_count > 0:
			start = self.picking_sequence_id.number_next_actual
			self.picking_sequence_id.write({
				'number_next_actual': start + picking_count
			})
			result['picking'] = {
				'start': start,
				'end': start + picking_count - 1,
				'prefix': self.picking_sequence_id.prefix
			}

		return result

	def get_next_order_number(self):
		"""Genera il prossimo numero ordine per uso offline"""
		self.ensure_one()

		if not self.order_sequence_id:
			raise UserError(_('Sequenza ordini non configurata per questo agente'))

		return self.order_sequence_id._next()

	def get_next_ddt_number(self):
		"""Genera il prossimo numero DDT per uso offline"""
		self.ensure_one()

		if not self.ddt_sequence_id:
			raise UserError(_('Sequenza DDT non configurata per questo agente'))

		return self.ddt_sequence_id._next()

	def get_next_picking_number(self):
		"""Genera il prossimo numero picking per uso offline"""
		self.ensure_one()

		if not self.picking_sequence_id:
			raise UserError(_('Sequenza picking non configurata per questo agente'))

		return self.picking_sequence_id._next()

	def reset_sequences(self):
		"""Reset delle sequenze (utile per test o reset)"""
		self.ensure_one()

		if not self.is_raccolta_agent:
			return

		sequences = [self.order_sequence_id, self.ddt_sequence_id, self.picking_sequence_id]

		for seq in sequences:
			if seq:
				seq.write({'number_next_actual': 1})

	@api.model
	def get_active_agents(self):
		"""Restituisce lista agenti attivi"""
		return self.search([
			('is_raccolta_agent', '=', True),
			('active', '=', True)
		])

	def action_setup_sequences(self):
		"""Action per setup manuale sequenze"""
		self.ensure_one()

		if not self.is_raccolta_agent:
			raise UserError(_('L\'utente deve essere un agente raccolta ordini'))

		self._create_user_sequences()

		return {
			'type': 'ir.actions.client',
			'tag': 'display_notification',
			'params': {
				'title': _('Sequenze Create'),
				'message': _('Le sequenze per l\'agente sono state create con successo'),
				'type': 'success',
			}
		}

	def action_view_orders(self):
		"""Visualizza ordini dell'agente"""
		self.ensure_one()

		action = self.env.ref('sale.action_orders').read()[0]
		action['domain'] = [('create_uid', '=', self.id), ('is_offline_order', '=', True)]
		action['context'] = {'default_create_uid': self.id}

		return action

	def sync_offline_orders(self):
		"""Sincronizza tutti gli ordini offline dell'agente"""
		self.ensure_one()

		pending_orders = self.env['sale.order'].search([
			('create_uid', '=', self.id),
			('is_offline_order', '=', True),
			('synced_to_odoo', '=', False)
		])

		if not pending_orders:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Sincronizzazione'),
					'message': _('Nessun ordine da sincronizzare'),
					'type': 'info',
				}
			}

		synced_count = 0
		error_count = 0

		for order in pending_orders:
			try:
				order.sync_to_odoo()
				synced_count += 1
			except Exception as e:
				error_count += 1

		# Aggiorna data ultima sincronizzazione
		self.last_sync_date = fields.Datetime.now()

		message = _('Sincronizzati %d ordini') % synced_count
		if error_count > 0:
			message += _(', %d errori') % error_count

		return {
			'type': 'ir.actions.client',
			'tag': 'display_notification',
			'params': {
				'title': _('Sincronizzazione Completata'),
				'message': message,
				'type': 'success' if error_count == 0 else 'warning',
			}
		}