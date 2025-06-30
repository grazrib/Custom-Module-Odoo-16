# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from datetime import datetime, timedelta


class RaccoltaSession(models.Model):
	"""Sessioni di raccolta ordini (simile a pos.session)"""
	_name = 'raccolta.session'
	_description = 'Sessione Raccolta Ordini'
	_order = 'start_at desc'
	_rec_name = 'display_name'

	# === INFORMAZIONI BASE ===
	name = fields.Char(
		string='Nome Sessione',
		required=True,
		default=lambda self: self._get_default_name(),
		help='Nome identificativo della sessione'
	)

	display_name = fields.Char(
		string='Nome Display',
		compute='_compute_display_name',
		store=True
	)

	config_id = fields.Many2one(
		'raccolta.config',
		string='Configurazione',
		required=True,
		help='Configurazione utilizzata per questa sessione'
	)

	user_id = fields.Many2one(
		'res.users',
		string='Utente',
		required=True,
		default=lambda self: self.env.user,
		help='Utente che ha aperto la sessione'
	)

	company_id = fields.Many2one(
		'res.company',
		string='Azienda',
		related='config_id.company_id',
		store=True
	)

	# === TIMESTAMP ===
	start_at = fields.Datetime(
		string='Inizio Sessione',
		required=True,
		default=fields.Datetime.now,
		help='Data e ora di inizio sessione'
	)

	stop_at = fields.Datetime(
		string='Fine Sessione',
		help='Data e ora di chiusura sessione'
	)

	duration = fields.Float(
		string='Durata (ore)',
		compute='_compute_duration',
		help='Durata della sessione in ore'
	)

	# === STATO ===
	state = fields.Selection([
		('opening_control', 'Controllo Apertura'),
		('opened', 'Aperta'),
		('closing_control', 'Controllo Chiusura'),
		('closed', 'Chiusa'),
		('rescue', 'Recupero'),
	], string='Stato', default='opening_control', required=True,
		help='Stato attuale della sessione')

	# === CONTATORI ORDINI ===
	order_count = fields.Integer(
		string='Numero Ordini',
		compute='_compute_order_stats',
		help='Numero totale di ordini creati in questa sessione'
	)

	order_ids = fields.One2many(
		'sale.order',
		'raccolta_session_id',
		string='Ordini',
		help='Ordini creati in questa sessione'
	)

	synced_order_count = fields.Integer(
		string='Ordini Sincronizzati',
		compute='_compute_order_stats',
		help='Numero di ordini sincronizzati'
	)

	pending_order_count = fields.Integer(
		string='Ordini Pendenti',
		compute='_compute_order_stats',
		help='Numero di ordini non ancora sincronizzati'
	)

	# === TOTALI VENDITE ===
	total_amount = fields.Monetary(
		string='Totale Vendite',
		compute='_compute_order_stats',
		currency_field='currency_id',
		help='Totale delle vendite in questa sessione'
	)

	currency_id = fields.Many2one(
		string='Valuta',
		related='company_id.currency_id',
		readonly=True
	)

	# === STATO CONNESSIONE ===
	is_online = fields.Boolean(
		string='Online',
		default=True,
		help='Indica se la sessione è attualmente online'
	)

	last_online = fields.Datetime(
		string='Ultima Connessione',
		default=fields.Datetime.now,
		help='Ultima volta che la sessione è stata online'
	)

	sync_status = fields.Selection([
		('synced', 'Sincronizzato'),
		('pending', 'In Attesa'),
		('error', 'Errore'),
	], string='Stato Sincronizzazione',
	   compute='_compute_sync_status',
	   help='Stato di sincronizzazione della sessione')

	# === COMPUTED FIELDS ===
	@api.depends('name', 'user_id.name', 'start_at')
	def _compute_display_name(self):
		"""Calcola nome di visualizzazione"""
		for session in self:
			if session.start_at:
				date_str = session.start_at.strftime('%d/%m/%Y %H:%M')
				session.display_name = f"{session.user_id.name} - {date_str}"
			else:
				session.display_name = f"{session.user_id.name} - {session.name}"

	@api.depends('start_at', 'stop_at')
	def _compute_duration(self):
		"""Calcola durata della sessione"""
		for session in self:
			if session.start_at:
				end_time = session.stop_at or fields.Datetime.now()
				duration = end_time - session.start_at
				session.duration = duration.total_seconds() / 3600.0
			else:
				session.duration = 0.0

	@api.depends('order_ids.synced_to_odoo', 'order_ids.amount_total')
	def _compute_order_stats(self):
		"""Calcola statistiche ordini"""
		for session in self:
			orders = session.order_ids
			session.order_count = len(orders)
			session.synced_order_count = len(orders.filtered('synced_to_odoo'))
			session.pending_order_count = len(orders.filtered(lambda o: not o.synced_to_odoo))
			session.total_amount = sum(orders.mapped('amount_total'))

	@api.depends('pending_order_count', 'is_online')
	def _compute_sync_status(self):
		"""Calcola stato di sincronizzazione"""
		for session in self:
			if session.pending_order_count == 0:
				session.sync_status = 'synced'
			elif session.is_online:
				session.sync_status = 'pending'
			else:
				session.sync_status = 'error'

	# === CONSTRAINTS ===
	@api.constrains('config_id', 'state')
	def _check_unique_opened_session(self):
		"""Verifica che ci sia una sola sessione aperta per configurazione"""
		for session in self:
			if session.state == 'opened':
				existing = self.search([
					('config_id', '=', session.config_id.id),
					('state', '=', 'opened'),
					('id', '!=', session.id)
				])
				if existing:
					raise ValidationError(_('Esiste già una sessione aperta per questa configurazione'))

	# === DEFAULTS ===
	def _get_default_name(self):
		"""Genera nome di default per la sessione"""
		now = fields.Datetime.now()
		return f"Sessione {now.strftime('%d/%m/%Y %H:%M')}"

	# === LIFECYCLE METHODS ===
	@api.model
	def create(self, vals):
		"""Inizializza sessione alla creazione"""
		session = super(RaccoltaSession, self).create(vals)

		# Aggiorna configurazione per puntare a questa sessione
		if session.state == 'opened':
			session.config_id.current_session_id = session

		return session

	def write(self, vals):
		"""Gestisce cambio stato"""
		result = super(RaccoltaSession, self).write(vals)

		# Aggiorna configurazione quando la sessione viene aperta/chiusa
		for session in self:
			if vals.get('state') == 'opened':
				session.config_id.current_session_id = session
			elif vals.get('state') == 'closed':
				if session.config_id.current_session_id == session:
					session.config_id.current_session_id = False

		return result

	# === BUSINESS METHODS ===
	def action_open(self):
		"""Apre la sessione"""
		self.ensure_one()

		if self.state != 'opening_control':
			raise UserError(_('La sessione non può essere aperta nel suo stato attuale'))

		# Verifica che l'utente sia abilitato
		if not self.user_id.is_raccolta_agent:
			raise UserError(_('L\'utente deve essere un agente raccolta ordini'))

		# Verifica che non ci siano altre sessioni aperte per questa configurazione
		existing = self.search([
			('config_id', '=', self.config_id.id),
			('state', '=', 'opened'),
			('id', '!=', self.id)
		])
		if existing:
			raise UserError(_('Esiste già una sessione aperta per questa configurazione'))

		# Apri la sessione
		self.write({
			'state': 'opened',
			'start_at': fields.Datetime.now(),
			'last_online': fields.Datetime.now()
		})

		return True

	def action_close(self):
		"""Chiude la sessione"""
		self.ensure_one()

		if self.state not in ['opened', 'closing_control']:
			raise UserError(_('La sessione non può essere chiusa nel suo stato attuale'))

		# Verifica sincronizzazione ordini pending
		if self.pending_order_count > 0:
			# Mostra warning ma permetti chiusura
			message = _('Attenzione: ci sono %d ordini non sincronizzati. '
						'Ricorda di sincronizzare prima di disconnetterti.') % self.pending_order_count
			
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Ordini Non Sincronizzati'),
					'message': message,
					'type': 'warning',
					'sticky': True,
				}
			}

		# Chiudi la sessione
		self.write({
			'state': 'closed',
			'stop_at': fields.Datetime.now()
		})

		return True

	def action_force_close(self):
		"""Forza la chiusura della sessione"""
		self.ensure_one()
		
		self.write({
			'state': 'closed',
			'stop_at': fields.Datetime.now()
		})
		
		return True

	def action_rescue(self):
		"""Recupera sessione in errore"""
		self.ensure_one()
		
		self.write({
			'state': 'rescue',
			'last_online': fields.Datetime.now()
		})
		
		return True

	def sync_all_orders(self):
		"""Sincronizza tutti gli ordini pendenti"""
		self.ensure_one()
		
		pending_orders = self.order_ids.filtered(lambda o: not o.synced_to_odoo)
		
		if not pending_orders:
			return {
				'type': 'ir.actions.client',
				'tag': 'display_notification',
				'params': {
					'title': _('Sincronizzazione'),
					'message': _('Tutti gli ordini sono già sincronizzati'),
					'type': 'info',
				}
			}
		
		# Esegui sincronizzazione
		synced_count = 0
		error_count = 0
		
		for order in pending_orders:
			try:
				order.sync_to_odoo()
				synced_count += 1
			except Exception as e:
				error_count += 1
				# Log dell'errore
				import logging
				_logger = logging.getLogger(__name__)
				_logger.error(f"Errore sincronizzazione ordine {order.name}: {e}")
		
		# Aggiorna stato connessione
		self.write({
			'is_online': True,
			'last_online': fields.Datetime.now()
		})
		
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

	def get_session_data(self):
		"""Ottiene dati completi per uso offline"""
		self.ensure_one()
		
		return {
			'session': {
				'id': self.id,
				'name': self.name,
				'state': self.state,
				'start_at': self.start_at.isoformat() if self.start_at else None,
				'user_id': self.user_id.id,
				'agent_code': self.user_id.agent_code,
				'config_id': self.config_id.id,
			},
			'config_data': self.config_id.get_offline_data(),
			'counters': self.user_id.get_offline_counters() if self.user_id.is_raccolta_agent else {},
		}

	def update_online_status(self, is_online=True):
		"""Aggiorna stato di connessione"""
		self.ensure_one()
		
		vals = {
			'is_online': is_online,
		}
		
		if is_online:
			vals['last_online'] = fields.Datetime.now()
		
		self.write(vals)
		
		return True

	@api.model
	def get_current_session(self, config_id=None):
		"""Ottiene la sessione corrente per la configurazione"""
		if not config_id:
			# Usa configurazione di default dell'utente
			config = self.env['raccolta.config'].get_default_config()
			config_id = config.id
		
		session = self.search([
			('config_id', '=', config_id),
			('state', '=', 'opened'),
			('user_id', '=', self.env.user.id)
		], limit=1)
		
		return session

	def action_view_orders(self):
		"""Visualizza ordini della sessione"""
		self.ensure_one()
		
		action = self.env.ref('sale.action_orders').read()[0]
		action['domain'] = [('raccolta_session_id', '=', self.id)]
		action['context'] = {'default_raccolta_session_id': self.id}
		
		return action