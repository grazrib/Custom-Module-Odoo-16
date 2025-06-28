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
				'current_number': 1,
				'prefix': prefix_map.get(document_type, ''),
				'padding': 3,
				'active': True
			})

		return counter

	def reserve_numbers(self, count):
		"""Riserva una quantità di numeri per uso offline"""
		self.ensure_one()

		if count <= 0:
			raise UserError(_('La quantità deve essere maggiore di zero'))

		# Calcola range di prenotazione
		start = self.current_number + 1
		end = start + count - 1

		# Aggiorna contatore
		self.write({
			'current_number': end,
			'reserved_start': start,
			'reserved_end': end,
			'last_used_number': start - 1,  # Reset ultimo usato
			'last_reservation_at': fields.Datetime.now()
		})

		return {
			'start': start,
			'end': end,
			'count': count,
			'prefix': self.prefix,
			'format': f"{self.prefix}{{:{self.padding:02d}d}}"
		}

	def get_next_number_offline(self):
		"""Ottiene prossimo numero per uso offline"""
		self.ensure_one()

		if not self.reserved_start or not self.reserved_end:
			raise UserError(_('Nessun numero riservato per uso offline'))

		next_number = (self.last_used_number or self.reserved_start - 1) + 1

		if next_number > self.reserved_end:
			raise UserError(_('Numeri riservati esauriti. Sincronizza per ottenerne altri.'))

		# Aggiorna ultimo usato
		self.last_used_number = next_number

		# Formatta numero completo
		formatted_number = f"{self.prefix}{next_number:0{self.padding}d}"

		return {
			'number': next_number,
			'formatted': formatted_number,
			'remaining': self.reserved_end - next_number
		}

	def sync_used_numbers(self, used_numbers):
		"""Sincronizza numeri utilizzati offline"""
		self.ensure_one()

		if not used_numbers:
			return

		max_used = max(used_numbers)

		# Verifica che i numeri usati siano nell'intervallo riservato
		if (self.reserved_start and max_used < self.reserved_start) or \
				(self.reserved_end and max_used > self.reserved_end):
			raise UserError(_('Numeri utilizzati fuori dall\'intervallo riservato'))

		# Aggiorna ultimo numero usato
		if max_used > (self.last_used_number or 0):
			self.write({
				'last_used_number': max_used,
				'last_sync_at': fields.Datetime.now()
			})

	def reset_reservation(self):
		"""Reset prenotazione numeri"""
		self.ensure_one()

		self.write({
			'reserved_start': False,
			'reserved_end': False,
			'last_used_number': False
		})

	def get_status(self):
		"""Ottiene stato attuale del contatore"""
		self.ensure_one()

		return {
			'user_id': self.user_id.id,
			'user_name': self.user_id.name,
			'document_type': self.document_type,
			'current_number': self.current_number,
			'prefix': self.prefix,
			'reserved': {
				'start': self.reserved_start,
				'end': self.reserved_end,
				'count': self.reserved_count,
				'available': self.available_count,
				'last_used': self.last_used_number
			},
			'last_sync': self.last_sync_at.isoformat() if self.last_sync_at else None,
			'last_reservation': self.last_reservation_at.isoformat() if self.last_reservation_at else None,
			'active': self.active
		}

	@api.model
	def get_user_counters_status(self, user_id):
		"""Ottiene stato di tutti i contatori di un utente"""
		counters = self.search([('user_id', '=', user_id)])

		status = {}
		for counter in counters:
			status[counter.document_type] = counter.get_status()

		return status

	@api.model
	def cleanup_old_reservations(self, days=7):
		"""Pulisce prenotazioni vecchie non utilizzate"""
		cutoff_date = fields.Datetime.now() - timedelta(days=days)

		old_counters = self.search([
			('last_reservation_at', '<', cutoff_date),
			('last_used_number', '=', False),
			('reserved_start', '!=', False)
		])

		for counter in old_counters:
			counter.reset_reservation()

		return len(old_counters)

	def action_reserve_numbers_wizard(self):
		"""Apre wizard per prenotazione numeri"""
		self.ensure_one()

		return {
			'type': 'ir.actions.act_window',
			'name': _('Prenota Numeri'),
			'view_mode': 'form',
			'res_model': 'raccolta.counter.reserve.wizard',
			'target': 'new',
			'context': {
				'default_counter_id': self.id,
				'default_document_type': self.document_type
			}
		}
