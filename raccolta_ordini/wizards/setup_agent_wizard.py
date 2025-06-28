# -*- coding: utf-8 -*-

import logging
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class SetupAgentWizard(models.TransientModel):
	_name = 'raccolta.setup.agent.wizard'
	_description = 'Wizard Setup Agente Raccolta'

	# Selezione agente
	user_id = fields.Many2one(
		'res.users',
		string='Utente',
		required=True,
		domain=[('share', '=', False)],
		help='Utente da configurare come agente raccolta ordini'
	)

	# Configurazione agente
	agent_code = fields.Char(
		string='Codice Agente',
		required=True,
		size=10,
		help='Codice univoco agente per numerazione'
	)

	# Configurazione numerazione
	setup_sequences = fields.Boolean(
		string='Configura Numerazione',
		default=True,
		help='Crea sequenze personalizzate per agente'
	)

	order_prefix = fields.Char(
		string='Prefisso Ordini',
		default='ORD',
		help='Prefisso per numerazione ordini'
	)

	ddt_prefix = fields.Char(
		string='Prefisso DDT',
		default='DDT',
		help='Prefisso per numerazione DDT'
	)

	order_start_number = fields.Integer(
		string='Numero Iniziale Ordini',
		default=1,
		help='Numero di partenza per ordini'
	)

	ddt_start_number = fields.Integer(
		string='Numero Iniziale DDT',
		default=1,
		help='Numero di partenza per DDT'
	)

	# Configurazione contatori
	setup_counters = fields.Boolean(
		string='Inizializza Contatori',
		default=True,
		help='Crea contatori offline per agente'
	)

	# Configurazione stampa
	setup_printer = fields.Boolean(
		string='Configura Stampante',
		default=False,
		help='Configura stampante termica'
	)

	printer_name = fields.Char(
		string='Nome Stampante',
		help='Nome stampante termica 48mm'
	)

	receipt_width = fields.Selection([
		('48', '48mm'),
		('58', '58mm'),
		('80', '80mm')
	], string='Larghezza Ricevuta', default='48')

	# Configurazione trasporto
	setup_transport = fields.Boolean(
		string='Configura Trasporto',
		default=True,
		help='Configura dati trasporto di default'
	)

	transport_method_id = fields.Many2one(
		'stock.picking.transport.method',
		string='Metodo Trasporto Default'
	)

	transport_condition_id = fields.Many2one(
		'stock.picking.transport.condition',
		string='Condizione Trasporto Default'
	)

	# Configurazione accessi
	setup_permissions = fields.Boolean(
		string='Configura Permessi',
		default=True,
		help='Assegna permessi raccolta ordini'
	)

	# Risultati setup
	setup_log = fields.Text(
		string='Log Setup',
		readonly=True
	)

	@api.onchange('user_id')
	def _onchange_user_id(self):
		"""Propone codice agente basato su utente"""
		if self.user_id:
			# Genera codice agente dalla login o nome
			login = self.user_id.login
			if '@' in login:
				base_code = login.split('@')[0].upper()
			else:
				base_code = login.upper()

			# Verifica unicità
			counter = 1
			agent_code = base_code[:3]
			while self._check_agent_code_exists(agent_code):
				agent_code = f"{base_code[:2]}{counter}"
				counter += 1
				if counter > 99:
					agent_code = base_code[:3]
					break

			self.agent_code = agent_code

	@api.constrains('agent_code')
	def _check_agent_code(self):
		"""Valida codice agente"""
		for wizard in self:
			if wizard.agent_code:
				if len(wizard.agent_code) > 10:
					raise ValidationError(_('Codice agente troppo lungo (max 10 caratteri)'))

				if not wizard.agent_code.isalnum():
					raise ValidationError(_('Codice agente deve contenere solo lettere e numeri'))

	def _check_agent_code_exists(self, code):
		"""Verifica se codice agente esiste già"""
		return bool(self.env['res.users'].search([
			('agent_code', '=', code),
			('id', '!=', self.user_id.id if self.user_id else False)
		], limit=1))

	def action_setup_agent(self):
		"""Esegue setup completo agente"""
		self.ensure_one()

		if not self.user_id:
			raise UserError(_('Selezionare un utente'))

		if self._check_agent_code_exists(self.agent_code):
			raise UserError(_('Codice agente già esistente'))

		setup_log = []

		try:
			# Configura utente come agente
			self._setup_user_agent(setup_log)

			# Configura numerazione
			if self.setup_sequences:
				self._setup_sequences(setup_log)

			# Inizializza contatori
			if self.setup_counters:
				self._setup_counters(setup_log)

			# Configura stampante
			if self.setup_printer:
				self._setup_printer(setup_log)

			# Configura trasporto
			if self.setup_transport:
				self._setup_transport(setup_log)

			# Configura permessi
			if self.setup_permissions:
				self._setup_permissions(setup_log)

			setup_log.append("✅ Setup agente completato con successo!")

		except Exception as e:
			setup_log.append(f"❌ Errore durante setup: {str(e)}")
			_logger.error(f"Errore setup agente {self.user_id.name}: {str(e)}")
			raise

		self.setup_log = '\n'.join(setup_log)

		return {
			'type': 'ir.actions.act_window',
			'name': _('Risultati Setup Agente'),
			'res_model': 'raccolta.setup.agent.wizard',
			'res_id': self.id,
			'view_mode': 'form',
			'target': 'new',
			'context': {'show_results': True}
		}

	def _setup_user_agent(self, setup_log):
		"""Configura utente come agente raccolta"""
		self.user_id.write({
			'is_raccolta_agent': True,
			'agent_code': self.agent_code,
			'raccolta_config_id': self._get_or_create_config().id
		})
		setup_log.append(f"✅ Utente {self.user_id.name} configurato come agente")

	def _setup_sequences(self, setup_log):
		"""Crea sequenze personalizzate per agente"""
		sequence_obj = self.env['ir.sequence']

		# Sequenza ordini
		order_seq = sequence_obj.create({
			'name': f'Ordini Agente {self.agent_code}',
			'code': f'sale.order.agent.{self.agent_code.lower()}',
			'prefix': f'{self.order_prefix}{self.agent_code}',
			'padding': 6,
			'number_next': self.order_start_number,
			'number_increment': 1,
			'implementation': 'standard',
			'active': True
		})

		# Sequenza DDT
		ddt_seq = sequence_obj.create({
			'name': f'DDT Agente {self.agent_code}',
			'code': f'stock.picking.ddt.agent.{self.agent_code.lower()}',
			'prefix': f'{self.ddt_prefix}{self.agent_code}',
			'padding': 6,
			'number_next': self.ddt_start_number,
			'number_increment': 1,
			'implementation': 'standard',
			'active': True
		})

		# Aggiorna configurazione agente
		config = self.user_id.raccolta_config_id
		config.write({
			'order_sequence_id': order_seq.id,
			'ddt_sequence_id': ddt_seq.id
		})

		setup_log.append(f"✅ Sequenze create: {order_seq.name}, {ddt_seq.name}")

	def _setup_counters(self, setup_log):
		"""Inizializza contatori offline"""
		counter_obj = self.env['raccolta.counter']

		# Contatore ordini
		order_counter = counter_obj.create({
			'name': f'Contatore Ordini {self.agent_code}',
			'user_id': self.user_id.id,
			'counter_type': 'order',
			'current_value': self.order_start_number,
			'prefix': f'{self.order_prefix}{self.agent_code}',
			'padding': 6
		})

		# Contatore DDT
		ddt_counter = counter_obj.create({
			'name': f'Contatore DDT {self.agent_code}',
			'user_id': self.user_id.id,
			'counter_type': 'ddt',
			'current_value': self.ddt_start_number,
			'prefix': f'{self.ddt_prefix}{self.agent_code}',
			'padding': 6
		})

		setup_log.append(f"✅ Contatori inizializzati: ordini={self.order_start_number}, DDT={self.ddt_start_number}")

	def _setup_printer(self, setup_log):
		"""Configura stampante termica"""
		config = self.user_id.raccolta_config_id
		config.write({
			'printer_name': self.printer_name,
			'receipt_width': self.receipt_width,
			'auto_print': True
		})
		setup_log.append(f"✅ Stampante configurata: {self.printer_name} ({self.receipt_width}mm)")

	def _setup_transport(self, setup_log):
		"""Configura dati trasporto default"""
		config = self.user_id.raccolta_config_id
		config.write({
			'default_transport_method_id': self.transport_method_id.id,
			'default_transport_condition_id': self.transport_condition_id.id
		})
		setup_log.append("✅ Dati trasporto configurati")

	def _setup_permissions(self, setup_log):
		"""Assegna permessi raccolta ordini"""
		group_agent = self.env.ref('raccolta_ordini.group_raccolta_agent')
		group_user = self.env.ref('base.group_user')

		self.user_id.write({
			'groups_id': [(4, group_agent.id), (4, group_user.id)]
		})
		setup_log.append("✅ Permessi assegnati")

	def _get_or_create_config(self):
		"""Recupera o crea configurazione raccolta per agente"""
		config = self.env['raccolta.config'].search([
			('user_id', '=', self.user_id.id)
		], limit=1)

		if not config:
			config = self.env['raccolta.config'].create({
				'name': f'Config {self.user_id.name}',
				'user_id': self.user_id.id,
				'active': True
			})

		return config
