# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError


class RaccoltaCounter(models.Model):
	"""Gestione contatori offline per sincronizzazione"""
	_name = 'raccolta.counter'
	_description = 'Contatori Raccolta Ordini'
	_order = 'user_id, document_type'

	# === INFORMAZIONI BASE ===
	user_id = fields.Many2one(
		'res.users',
		string='Utente',
		required=True,
		help='Utente proprietario del contatore'
	)

	document_type = fields.Selection([
		('order', 'Ordini'),
		('picking', 'Picking'),
		('ddt', 'DDT'),
	], string='Tipo Documento', required=True,
		help='Tipo di documento per cui è il contatore')

	# === CONTATORI ===
	current_number = fields.Integer(
		string='Numero Corrente',
		default=1,
		help='Ultimo numero utilizzato'
	)

	reserved_start = fields.Integer(
		string='Inizio Prenotazione',
		help='Primo numero riservato per uso offline'
	)

	reserved_end = fields.Integer(
		string='Fine Prenotazione',
		help='Ultimo numero riservato per uso offline'
	)

	reserved_count = fields.Integer(
		string='Numeri Riservati',
		compute='_compute_reserved_count',
		help='Quantità di numeri riservati'
	)

	available_count = fields.Integer(
		string='Numeri Disponibili',
		compute='_compute_available_count',
		help='Quantità di numeri disponibili offline'
	)

	# === STATO ===
	last_used_number = fields.Integer(
		string='Ultimo Usato Offline',
		help='Ultimo numero utilizzato offline'
	)

	last_sync_at = fields.Datetime(
		string='Ultima Sincronizzazione',
		help='Data ultima sincronizzazione'
	)

	last_reservation_at = fields.Datetime(
		string='Ultima Prenotazione',
		help='Data ultima prenotazione numeri'
	)

	# === CONFIGURAZIONE ===
	prefix = fields.Char(
		string='Prefisso',
		help='Prefisso per la numerazione (es: RO/AG001/)'
	)

	padding = fields.Integer(
		string='Padding',
		default=3,
		help='Numero di cifre per il padding (es: 001, 002, ecc.)'
	)

	active = fields.Boolean(
		string='Attivo',
		default=True,
		help='Contatore attivo'
	)

	# === COMPUTED FIELDS ===
	@api.depends('reserved_start', 'reserved_end')
	def _compute_reserved_count(self):
		for counter in self:
			if counter.reserved_start and counter.reserved_end:
				counter.reserved_count = counter.reserved_end - counter.reserved_start + 1
			else:
				counter.reserved_count = 0

	@api.depends('reserved_end', 'last_used_number')
	def _compute_available_count(self):
		for counter in self:
			if counter.reserved_end and counter.last_used_number:
				counter.available_count = max(0, counter.reserved_end - counter.last_used_number)
			elif counter.reserved_count:
				counter.available_count = counter.reserved_count
			else:
				counter.available_count = 0

	# === CONSTRAINTS ===
	@api.constrains('user_id', 'document_type')
	def _check_unique_user_document_type(self):
		for counter in self:
			existing = self.search([
				('user_id', '=', counter.user_id.id),
				('document_type', '=', counter.document_type),
				('id', '!=', counter.id)
			])
			if existing:
				raise ValidationError(_('Esiste già un contatore %s per l\'utente %s') % (
					counter.document_type, counter.user_id.name
				))

	@api.constrains('current_number', 'reserved_start', 'reserved_end', 'last_used_number')
	def _check_number_consistency(self):
		for counter in self:
			if counter.current_number < 0:
				raise ValidationError(_('Il numero corrente non può essere negativo'))

			if counter.reserved_start and counter.reserved_end:
				if counter.reserved_start > counter.reserved_end:
					raise ValidationError(_('L\'inizio prenotazione non può essere maggiore della fine'))

				if counter.reserved_start <= counter.current_number:
					raise ValidationError(_('I numeri riservati devono essere successivi al numero corrente'))

			if counter.last_used_number and counter.reserved_start:
				if counter.last_used_number < counter.reserved_start:
					raise ValidationError(_('L\'ultimo numero usato non può essere precedente alla prenotazione'))

	# === BUSINESS METHODS ===
	@api.model
	def get_or_create_counter(self, user_id, document_type):
		"""Ottiene o crea contatore per utente e tipo documento"""
		counter = self.search([
			('user_id', '=', user_id),
			('document_type', '=', document_type)
		], limit=1)

		if not counter:
			user = self.env['res.users'].browse(user_id)

			# Determina prefisso in base al tipo e all'agente
			prefix_map = {
				'order': f'RO/{user.agent_code or "TEMP"}/',
				'picking': f'PICK/{user.agent_code or "TEMP"}/',
				'ddt': f'DDT/{user.agent_code or "TEMP"}/',
			}

			counter = self.create({
				'user_id': user_id,
				'document_type': document_type,
				'prefix': prefix_map.get(document_type, 'DOC/'),
				'current_number': 1,
			})

		return counter

	def reserve_numbers(self, count):
		"""Riserva numeri per uso offline"""
		self.ensure_one()

		if count <= 0:
			raise UserError(_('La quantità deve essere maggiore di zero'))

		# Calcola range di prenotazione
		start = self.current_number
		end = start + count - 1

		# Aggiorna contatore
		self.write({
			'current_number': end + 1,
			'reserved_start': start,
			'reserved_end': end,
			'last_used_number': start - 1,  # Ultimo usato prima della prenotazione
			'last_reservation_at': fields.Datetime.now(),
		})

		return {
			'start': start,
			'end': end,
			'count': count,
			'prefix': self.prefix,
		}

	def get_next_number(self):
		"""Ottiene il prossimo numero disponibile"""
		self.ensure_one()

		# Se abbiamo numeri riservati disponibili
		if self.available_count > 0:
			next_number = self.last_used_number + 1
			self.write({
				'last_used_number': next_number,
				'last_sync_at': fields.Datetime.now(),
			})
			return self._format_number(next_number)

		# Altrimenti usa numerazione normale
		next_number = self.current_number
		self.write({
			'current_number': next_number + 1,
			'last_sync_at': fields.Datetime.now(),
		})
		return self._format_number(next_number)

	def _format_number(self, number):
		"""Formatta numero con prefisso e padding"""
		formatted = str(number).zfill(self.padding)
		return f"{self.prefix}{formatted}"

	def sync_used_numbers(self, used_numbers):
		"""Sincronizza numeri utilizzati offline"""
		self.ensure_one()

		if not used_numbers:
			return

		# Aggiorna ultimo numero usato
		max_used = max(used_numbers)
		if max_used > self.last_used_number:
			self.write({
				'last_used_number': max_used,
				'last_sync_at': fields.Datetime.now(),
			})

	def reset_counter(self):
		"""Reset contatore (utile per test)"""
		self.ensure_one()

		self.write({
			'current_number': 1,
			'reserved_start': False,
			'reserved_end': False,
			'last_used_number': 0,
		})

	@api.model
	def cleanup_expired_reservations(self):
		"""Pulisce prenotazioni scadute (da eseguire con cron)"""
		# Trova prenotazioni più vecchie di 24 ore
		expired_date = fields.Datetime.now() - timedelta(hours=24)
		
		expired_counters = self.search([
			('reserved_start', '!=', False),
			('last_reservation_at', '<', expired_date),
		])

		for counter in expired_counters:
			# Se non sono stati usati numeri, libera la prenotazione
			if counter.last_used_number < counter.reserved_start:
				counter.write({
					'current_number': counter.reserved_start,
					'reserved_start': False,
					'reserved_end': False,
				})

	def get_counter_status(self):
		"""Ottiene stato completo del contatore"""
		self.ensure_one()

		return {
			'user_id': self.user_id.id,
			'user_name': self.user_id.name,
			'document_type': self.document_type,
			'current_number': self.current_number,
			'reserved_count': self.reserved_count,
			'available_count': self.available_count,
			'prefix': self.prefix,
			'last_sync_at': self.last_sync_at.isoformat() if self.last_sync_at else None,
			'active': self.active,
		}