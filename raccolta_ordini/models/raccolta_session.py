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
		help='Numero di ordini già sincronizzati'
	)

	pending_order_count = fields.Integer(
		string='Ordini da Sincronizzare',
		compute='_compute_order_stats',
		help='Numero di ordini in attesa di sincronizzazione'
	)

	# === CONTATORI DOCUMENTI ===
	picking_count = fields.Integer(
		string='Numero Picking',
		compute='_compute_document_stats',
		help='Numero di picking generati'
	)

	ddt_count = fields.Integer(
		string='Numero DDT',
		compute='_compute_document_stats',
		help='Numero di DDT generati'
	)

	# === INFORMAZIONI OFFLINE ===
	offline_mode = fields.Boolean(
		string='Modalità Offline',
		default=False,
		help='Indica se la sessione è stata utilizzata offline'
	)

	last_online = fields.Datetime(
		string='Ultima Connessione',
		help='Ultima volta che la sessione era online'
	)

	offline_duration = fields.Float(
		string='Tempo Offline (ore)',
		compute='_compute_offline_duration',
		help='Tempo totale trascorso offline'
	)

	# === SINCRONIZZAZIONE ===
	last_sync_at = fields.Datetime(
		string='Ultima Sincronizzazione',
		help='Data e ora dell\'ultima sincronizzazione'
	)

	sync_count = fields.Integer(
		string='Numero Sincronizzazioni',
		default=0,
		help='Numero totale di sincronizzazioni effettuate'
	)

	sync_error_count = fields.Integer(
		string='Errori Sincronizzazione',
		default=0,
		help='Numero di errori durante la sincronizzazione'
	)

	last_sync_error = fields.Text(
		string='Ultimo Errore Sync',
		help='Descrizione dell\'ultimo errore di sincronizzazione'
	)

	# === NOTE E DETTAGLI ===
	notes = fields.Text(
		string='Note Sessione',
		help='Note e commenti sulla sessione'
	)

	rescue = fields.Boolean(
		string='Sessione di Recupero',
		default=False,
		help='Sessione creata per recuperare dati perduti'
	)

	# === COMPUTED FIELDS ===
	@api.depends('name', 'user_id.name', 'start_at')
	def _compute_display_name(self):
		for session in self:
			start_str = session.start_at.strftime('%d/%m/%Y %H:%M') if session.start_at else ''
			session.display_name = f"{session.name} - {session.user_id.name} ({start_str})"

	@api.depends('start_at', 'stop_at')
	def _compute_duration(self):
		for session in self:
			if session.start_at:
				end_time = session.stop_at or fields.Datetime.now()
				delta = end_time - session.start_at
				session.duration = delta.total_seconds() / 3600.0
			else:
				session.duration = 0.0

	@api.depends('start_at', 'last_online', 'stop_at')
	def _compute_offline_duration(self):
		for session in self:
			if session.offline_mode and session.last_online and session.start_at:
				if session.stop_at:
					# Sessione chiusa: calcola tempo offline fino alla chiusura
					offline_time = session.stop_at - session.last_online
				else:
					# Sessione aperta: calcola tempo offline fino ad ora
					offline_time = fields.Datetime.now() - session.last_online

				session.offline_duration = max(0, offline_time.total_seconds() / 3600.0)
			else:
				session.offline_duration = 0.0

	@api.depends('order_ids')
	def _compute_order_stats(self):
		for session in self:
			orders = session.order_ids
			session.order_count = len(orders)

			# Conta ordini sincronizzati (assumendo campo synced_to_odoo)
			synced_orders = orders.filtered(lambda o: getattr(o, 'synced_to_odoo', True))
			session.synced_order_count = len(synced_orders)
			session.pending_order_count = session.order_count - session.synced_order_count

	def _compute_document_stats(self):
		for session in self:
			# Conta picking collegati agli ordini della sessione
			pickings = self.env['stock.picking'].search([
				('sale_id', 'in', session.order_ids.ids)
			])
			session.picking_count = len(pickings)

			# Conta DDT collegati ai picking
			ddts = self.env['stock.delivery.note'].search([
				('picking_ids', 'in', pickings.ids)
			])
			session.ddt_count = len(ddts)

	# === CONSTRAINTS ===
	@api.constrains('start_at', 'stop_at')
	def _check_dates(self):
		for session in self:
			if session.stop_at and session.start_at and session.stop_at < session.start_at:
				raise ValidationError(_('La data di fine non può essere precedente a quella di inizio'))

	@api.constrains('config_id', 'state', 'user_id')
	def _check_unique_opened_session(self):
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
					'title': _('Ordini non sincronizzati'),
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

	def action_rescue(self):
		"""Imposta la sessione in modalità recupero"""
		self.ensure_one()

		self.write({
			'state': 'rescue',
			'rescue': True,
			'notes': (self.notes or '') + f'\n[{fields.Datetime.now()}] Sessione impostata in modalità recupero'
		})

	def open_ui(self):
		"""Apre l'interfaccia della raccolta ordini per questa sessione"""
		self.ensure_one()

		if self.state not in ['opened', 'rescue']:
			raise UserError(_('La sessione deve essere aperta per accedere all\'interfaccia'))

		return {
			'type': 'ir.actions.act_url',
			'url': f'/raccolta/ui?session_id={self.id}',
			'target': 'self',
		}

	def set_offline_mode(self, offline=True):
		"""Imposta modalità offline"""
		self.ensure_one()

		values = {'offline_mode': offline}

		if not offline:
			# Torna online
			values['last_online'] = fields.Datetime.now()

		self.write(values)

	def sync_session_data(self, sync_data=None):
		"""Sincronizza i dati della sessione"""
		self.ensure_one()

		try:
			sync_results = {
				'orders_synced': 0,
				'pickings_synced': 0,
				'ddts_synced': 0,
				'errors': []
			}

			if sync_data:
				# Sincronizza ordini
				if 'orders' in sync_data:
					orders_result = self._sync_orders(sync_data['orders'])
					sync_results['orders_synced'] = orders_result.get('synced', 0)
					sync_results['errors'].extend(orders_result.get('errors', []))

				# Sincronizza picking
				if 'pickings' in sync_data:
					pickings_result = self._sync_pickings(sync_data['pickings'])
					sync_results['pickings_synced'] = pickings_result.get('synced', 0)
					sync_results['errors'].extend(pickings_result.get('errors', []))

				# Sincronizza DDT
				if 'ddts' in sync_data:
					ddts_result = self._sync_ddts(sync_data['ddts'])
					sync_results['ddts_synced'] = ddts_result.get('synced', 0)
					sync_results['errors'].extend(ddts_result.get('errors', []))

			# Aggiorna statistiche sincronizzazione
			self.write({
				'last_sync_at': fields.Datetime.now(),
				'sync_count': self.sync_count + 1,
				'sync_error_count': self.sync_error_count + len(sync_results['errors']),
				'last_sync_error': '\n'.join(sync_results['errors']) if sync_results['errors'] else False
			})

			# Aggiorna timestamp utente
			self.user_id.update_last_sync()

			return sync_results

		except Exception as e:
			# Log errore
			error_msg = f"Errore sincronizzazione sessione {self.name}: {str(e)}"
			self.write({
				'last_sync_error': error_msg,
				'sync_error_count': self.sync_error_count + 1
			})
			raise UserError(error_msg)

	def _sync_orders(self, orders_data):
		"""Sincronizza ordini offline"""
		results = {'synced': 0, 'errors': []}

		for order_data in orders_data:
			try:
				# Crea o aggiorna ordine
				order = self._create_or_update_order(order_data)
				if order:
					results['synced'] += 1

			except Exception as e:
				error_msg = f"Errore ordine {order_data.get('name', 'Unknown')}: {str(e)}"
				results['errors'].append(error_msg)

		return results

	def _sync_pickings(self, pickings_data):
		"""Sincronizza picking offline"""
		results = {'synced': 0, 'errors': []}

		for picking_data in pickings_data:
			try:
				# Crea o aggiorna picking
				picking = self._create_or_update_picking(picking_data)
				if picking:
					results['synced'] += 1

			except Exception as e:
				error_msg = f"Errore picking {picking_data.get('name', 'Unknown')}: {str(e)}"
				results['errors'].append(error_msg)

		return results

	def _sync_ddts(self, ddts_data):
		"""Sincronizza DDT offline"""
		results = {'synced': 0, 'errors': []}

		for ddt_data in ddts_data:
			try:
				# Crea o aggiorna DDT
				ddt = self._create_or_update_ddt(ddt_data)
				if ddt:
					results['synced'] += 1

			except Exception as e:
				error_msg = f"Errore DDT {ddt_data.get('name', 'Unknown')}: {str(e)}"
				results['errors'].append(error_msg)

		return results

	def _create_or_update_order(self, order_data):
		"""Crea o aggiorna un ordine da dati offline"""
		# Cerca ordine esistente by name
		existing_order = self.env['sale.order'].search([
			('name', '=', order_data.get('name')),
			('raccolta_session_id', '=', self.id)
		], limit=1)

		if existing_order:
			# Aggiorna ordine esistente
			existing_order.write(self._prepare_order_values(order_data))
			return existing_order
		else:
			# Crea nuovo ordine
			order_vals = self._prepare_order_values(order_data)
			order_vals['raccolta_session_id'] = self.id
			return self.env['sale.order'].create(order_vals)

	def _create_or_update_picking(self, picking_data):
		"""Crea o aggiorna un picking da dati offline"""
		# Cerca picking esistente by name
		existing_picking = self.env['stock.picking'].search([
			('name', '=', picking_data.get('name'))
		], limit=1)

		if existing_picking:
			# Aggiorna picking esistente
			existing_picking.write(self._prepare_picking_values(picking_data))
			return existing_picking
		else:
			# Crea nuovo picking
			picking_vals = self._prepare_picking_values(picking_data)
			return self.env['stock.picking'].create(picking_vals)

	def _create_or_update_ddt(self, ddt_data):
		"""Crea o aggiorna un DDT da dati offline"""
		# Cerca DDT esistente by name
		existing_ddt = self.env['stock.delivery.note'].search([
			('name', '=', ddt_data.get('name'))
		], limit=1)

		if existing_ddt:
			# Aggiorna DDT esistente
			existing_ddt.write(self._prepare_ddt_values(ddt_data))
			return existing_ddt
		else:
			# Crea nuovo DDT
			ddt_vals = self._prepare_ddt_values(ddt_data)
			return self.env['stock.delivery.note'].create(ddt_vals)

	def _prepare_order_values(self, order_data):
		"""Prepara valori per creazione/aggiornamento ordine"""
		return {
			'name': order_data.get('name'),
			'partner_id': order_data.get('partner_id'),
			'date_order': order_data.get('date_order'),
			'state': order_data.get('state', 'draft'),
			'note': order_data.get('notes', ''),
			'warehouse_id': self.config_id.warehouse_id.id,
			'company_id': self.company_id.id,
			'user_id': self.user_id.id,
			# Aggiungi altre mappature necessarie
		}

	def _prepare_picking_values(self, picking_data):
		"""Prepara valori per creazione/aggiornamento picking"""
		return {
			'name': picking_data.get('name'),
			'partner_id': picking_data.get('partner_id'),
			'location_id': self.config_id.location_id.id,
			'location_dest_id': self.config_id.location_dest_id.id,
			'picking_type_id': self.config_id.warehouse_id.out_type_id.id,
			'state': picking_data.get('state', 'draft'),
			'scheduled_date': picking_data.get('scheduled_date'),
			# Aggiungi altre mappature necessarie
		}

	def _prepare_ddt_values(self, ddt_data):
		"""Prepara valori per creazione/aggiornamento DDT"""
		return {
			'name': ddt_data.get('name'),
			'partner_id': ddt_data.get('partner_id'),
			'partner_shipping_id': ddt_data.get('partner_shipping_id'),
			'type_id': self.config_id.ddt_type_id.id,
			'transport_reason_id': ddt_data.get('transport_reason_id') or self.config_id.ddt_transport_reason_id.id,
			'goods_appearance_id': ddt_data.get('goods_appearance_id') or self.config_id.ddt_goods_appearance_id.id,
			'transport_condition_id': ddt_data.get(
				'transport_condition_id') or self.config_id.ddt_transport_condition_id.id,
			'date': ddt_data.get('date'),
			'state': ddt_data.get('state', 'draft'),
			# Aggiungi altre mappature necessarie
		}

	# === REPORT METHODS ===
	def get_session_summary(self):
		"""Restituisce riassunto della sessione"""
		self.ensure_one()

		return {
			'session_name': self.display_name,
			'duration_hours': round(self.duration, 2),
			'offline_hours': round(self.offline_duration, 2),
			'orders_total': self.order_count,
			'orders_synced': self.synced_order_count,
			'orders_pending': self.pending_order_count,
			'pickings_count': self.picking_count,
			'ddts_count': self.ddt_count,
			'sync_count': self.sync_count,
			'sync_errors': self.sync_error_count,
			'last_sync': self.last_sync_at.isoformat() if self.last_sync_at else None,
			'state': self.state,
			'offline_mode': self.offline_mode,
		}

	# === SEARCH METHODS ===
	@api.model
	def get_active_sessions(self):
		"""Restituisce sessioni attive"""
		return self.search([('state', 'in', ['opened', 'rescue'])])

	@api.model
	def get_user_sessions(self, user_id=None):
		"""Restituisce sessioni dell'utente"""
		user_id = user_id or self.env.user.id
		return self.search([('user_id', '=', user_id)])

	@api.model
	def cleanup_old_sessions(self, days=30):
		"""Pulisce sessioni vecchie"""
		cutoff_date = fields.Datetime.now() - timedelta(days=days)
		old_sessions = self.search([
			('state', '=', 'closed'),
			('stop_at', '<', cutoff_date)
		])

		# Non cancellare, ma archiviare
		old_sessions.write({'active': False})

		return len(old_sessions)