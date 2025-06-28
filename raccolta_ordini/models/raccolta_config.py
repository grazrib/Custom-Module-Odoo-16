# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError, UserError


class RaccoltaConfig(models.Model):
	"""Configurazione per la raccolta ordini offline (simile a pos.config)"""
	_name = 'raccolta.config'
	_description = 'Configurazione Raccolta Ordini'
	_order = 'name'

	# === INFORMAZIONI BASE ===
	name = fields.Char(
		string='Nome Configurazione',
		required=True,
		help='Nome identificativo della configurazione'
	)
	active = fields.Boolean(
		string='Attiva',
		default=True,
		help='Disattiva per nascondere la configurazione'
	)
	company_id = fields.Many2one(
		'res.company',
		string='Azienda',
		required=True,
		default=lambda self: self.env.company,
		help='Azienda per cui vale questa configurazione'
	)

	# === CONFIGURAZIONE OPERATIVA ===
	warehouse_id = fields.Many2one(
		'stock.warehouse',
		string='Magazzino',
		required=True,
		help='Magazzino di riferimento per i prelievi'
	)
	location_id = fields.Many2one(
		'stock.location',
		string='Ubicazione Origine',
		help='Ubicazione di origine per i picking (se diversa dal magazzino)'
	)
	location_dest_id = fields.Many2one(
		'stock.location',
		string='Ubicazione Destinazione',
		help='Ubicazione di destinazione per i picking'
	)

	# === CONFIGURAZIONE DDT ===
	ddt_type_id = fields.Many2one(
		'stock.delivery.note.type',
		string='Tipo DDT Default',
		help='Tipo di DDT da utilizzare di default'
	)
	auto_create_ddt = fields.Boolean(
		string='Crea DDT Automaticamente',
		default=True,
		help='Crea automaticamente il DDT alla conferma del picking'
	)
	ddt_transport_reason_id = fields.Many2one(
		'stock.picking.transport.reason',
		string='Causale Trasporto Default',
		help='Causale di trasporto di default per i DDT'
	)
	ddt_goods_appearance_id = fields.Many2one(
		'stock.picking.goods.appearance',
		string='Aspetto Merci Default',
		help='Aspetto delle merci di default per i DDT'
	)
	ddt_transport_condition_id = fields.Many2one(
		'stock.picking.transport.condition',
		string='Condizione Trasporto Default',
		help='Condizione di trasporto di default per i DDT'
	)

	# === CONFIGURAZIONE NUMERAZIONE ===
	use_agent_numbering = fields.Boolean(
		string='Numerazione per Agente',
		default=True,
		help='Utilizza numerazione personalizzata per ogni agente'
	)
	global_sequence_id = fields.Many2one(
		'ir.sequence',
		string='Sequenza Globale Ordini',
		help='Sequenza da utilizzare se non si usa la numerazione per agente'
	)

	# === CONFIGURAZIONE RICEVUTE ===
	receipt_format = fields.Selection([
		('48mm', 'Formato 48mm'),
		('80mm', 'Formato 80mm'),
		('pdf', 'PDF Standard'),
	], string='Formato Ricevute', default='48mm', required=True,
		help='Formato di default per le ricevute')

	auto_print_receipt = fields.Boolean(
		string='Stampa Ricevuta Automatica',
		default=True,
		help='Stampa automaticamente la ricevuta dopo la creazione ordine'
	)

	receipt_header = fields.Text(
		string='Intestazione Ricevute',
		help='Testo personalizzato per l\'intestazione delle ricevute'
	)
	receipt_footer = fields.Text(
		string='Piè di pagina Ricevute',
		help='Testo personalizzato per il piè di pagina delle ricevute'
	)

	# === CONFIGURAZIONE OFFLINE ===
	max_offline_days = fields.Integer(
		string='Giorni Massimi Offline',
		default=7,
		help='Numero massimo di giorni di funzionamento offline'
	)
	sync_batch_size = fields.Integer(
		string='Dimensione Batch Sincronizzazione',
		default=50,
		help='Numero massimo di documenti da sincronizzare per volta'
	)
	auto_sync_interval = fields.Integer(
		string='Intervallo Auto-Sync (minuti)',
		default=15,
		help='Intervallo in minuti per la sincronizzazione automatica (0 = disabilitato)'
	)

	# === CONFIGURAZIONE CLIENTI E PRODOTTI ===
	limit_categories = fields.Boolean(
		string='Limita Categorie Prodotti',
		default=False,
		help='Limita i prodotti caricabili offline a categorie specifiche'
	)
	available_categ_ids = fields.Many2many(
		'product.category',
		string='Categorie Disponibili',
		help='Categorie di prodotti disponibili offline'
	)

	limit_partner_categories = fields.Boolean(
		string='Limita Categorie Clienti',
		default=False,
		help='Limita i clienti caricabili offline a categorie specifiche'
	)
	available_partner_categ_ids = fields.Many2many(
		'res.partner.category',
		string='Categorie Clienti Disponibili',
		help='Categorie di clienti disponibili offline'
	)

	# === CONFIGURAZIONE SCANNER ===
	barcode_scanner = fields.Boolean(
		string='Scanner Barcode Attivo',
		default=True,
		help='Abilita l\'uso dello scanner barcode'
	)
	camera_scanner = fields.Boolean(
		string='Scanner Fotocamera',
		default=True,
		help='Abilita l\'uso della fotocamera come scanner'
	)

	# === CONFIGURAZIONE FIRMA DIGITALE ===
	signature_enabled = fields.Boolean(
		string='Firma Digitale Abilitata',
		default=True,
		help='Abilita la raccolta della firma digitale'
	)
	signature_required = fields.Boolean(
		string='Firma Obbligatoria',
		default=False,
		help='Rende obbligatoria la firma per completare l\'ordine'
	)

	# === SESSIONI ATTIVE ===
	current_session_id = fields.Many2one(
		'raccolta.session',
		string='Sessione Corrente',
		help='Sessione attualmente aperta per questa configurazione'
	)
	session_ids = fields.One2many(
		'raccolta.session',
		'config_id',
		string='Tutte le Sessioni'
	)

	# === CONSTRAINTS ===
	@api.constrains('max_offline_days')
	def _check_max_offline_days(self):
		for record in self:
			if record.max_offline_days <= 0:
				raise ValidationError(_('I giorni massimi offline devono essere maggiori di zero'))

	@api.constrains('sync_batch_size')
	def _check_sync_batch_size(self):
		for record in self:
			if record.sync_batch_size <= 0:
				raise ValidationError(_('La dimensione del batch deve essere maggiore di zero'))

	@api.constrains('limit_categories', 'available_categ_ids')
	def _check_categories_consistency(self):
		for record in self:
			if record.limit_categories and not record.available_categ_ids:
				raise ValidationError(_('Se si limitano le categorie, è necessario selezionarne almeno una'))

	# === ONCHANGE ===
	@api.onchange('warehouse_id')
	def _onchange_warehouse_id(self):
		if self.warehouse_id:
			self.location_id = self.warehouse_id.lot_stock_id
			# Imposta ubicazione destinazione di default (clienti)
			customer_location = self.env.ref('stock.stock_location_customers', raise_if_not_found=False)
			if customer_location:
				self.location_dest_id = customer_location

	@api.onchange('company_id')
	def _onchange_company_id(self):
		if self.company_id:
			# Reset warehouse se non appartiene alla nuova azienda
			if self.warehouse_id.company_id != self.company_id:
				self.warehouse_id = False

			# Cerca DDT type per l'azienda
			ddt_type = self.env['stock.delivery.note.type'].search([
				('company_id', '=', self.company_id.id),
				('code', '=', 'outgoing')
			], limit=1)
			if ddt_type:
				self.ddt_type_id = ddt_type

	# === METODI BUSINESS ===
	def open_ui(self):
		"""Apre l'interfaccia della raccolta ordini"""
		self.ensure_one()

		if not self.current_session_id:
			# Crea una nuova sessione
			session = self.env['raccolta.session'].create({
				'config_id': self.id,
				'user_id': self.env.user.id,
				'start_at': fields.Datetime.now(),
				'state': 'opened'
			})
			self.current_session_id = session

		return {
			'type': 'ir.actions.act_url',
			'url': f'/raccolta/ui?config_id={self.id}',
			'target': 'self',
		}

	def open_session(self):
		"""Apre una nuova sessione"""
		self.ensure_one()

		if self.current_session_id and self.current_session_id.state == 'opened':
			raise UserError(_('Esiste già una sessione aperta per questa configurazione'))

		session = self.env['raccolta.session'].create({
			'config_id': self.id,
			'user_id': self.env.user.id,
			'start_at': fields.Datetime.now(),
			'state': 'opened'
		})

		self.current_session_id = session
		return session.open_ui()

	def close_session(self):
		"""Chiude la sessione corrente"""
		self.ensure_one()

		if not self.current_session_id:
			raise UserError(_('Nessuna sessione aperta per questa configurazione'))

		self.current_session_id.action_close()
		self.current_session_id = False

	def get_offline_data(self):
		"""Restituisce tutti i dati necessari per il funzionamento offline"""
		self.ensure_one()

		data = {
			'config': self._get_config_data(),
			'company': self._get_company_data(),
			'partners': self._get_partners_data(),
			'products': self._get_products_data(),
			'categories': self._get_categories_data(),
			'taxes': self._get_taxes_data(),
			'uoms': self._get_uoms_data(),
			'ddt_config': self._get_ddt_config_data(),
			'counters': self._get_user_counters(),
		}

		return data

	def _get_config_data(self):
		"""Dati della configurazione per offline"""
		return {
			'id': self.id,
			'name': self.name,
			'warehouse_id': self.warehouse_id.id,
			'warehouse_name': self.warehouse_id.name,
			'receipt_format': self.receipt_format,
			'auto_create_ddt': self.auto_create_ddt,
			'use_agent_numbering': self.use_agent_numbering,
			'auto_print_receipt': self.auto_print_receipt,
			'barcode_scanner': self.barcode_scanner,
			'signature_enabled': self.signature_enabled,
			'signature_required': self.signature_required,
			'receipt_header': self.receipt_header or '',
			'receipt_footer': self.receipt_footer or '',
		}

	def _get_company_data(self):
		"""Dati dell'azienda per le ricevute"""
		company = self.company_id
		return {
			'id': company.id,
			'name': company.name,
			'street': company.street or '',
			'street2': company.street2 or '',
			'city': company.city or '',
			'zip': company.zip or '',
			'state': company.state_id.name if company.state_id else '',
			'country': company.country_id.name if company.country_id else '',
			'phone': company.phone or '',
			'email': company.email or '',
			'vat': company.vat or '',
			'website': company.website or '',
		}

	def _get_partners_data(self):
		"""Carica clienti per uso offline"""
		domain = [('customer_rank', '>', 0)]

		# Filtra per categorie se configurato
		if self.limit_partner_categories and self.available_partner_categ_ids:
			domain.append(('category_id', 'in', self.available_partner_categ_ids.ids))

		partners = self.env['res.partner'].search(domain)

		return [{
			'id': p.id,
			'name': p.name,
			'street': p.street or '',
			'street2': p.street2 or '',
			'city': p.city or '',
			'zip': p.zip or '',
			'state': p.state_id.name if p.state_id else '',
			'country_id': p.country_id.name if p.country_id else '',
			'phone': p.phone or '',
			'mobile': p.mobile or '',
			'email': p.email or '',
			'vat': p.vat or '',
			'is_company': p.is_company,
			'customer_rank': p.customer_rank,
			'supplier_rank': p.supplier_rank,
		} for p in partners]

	def _get_products_data(self):
		"""Carica prodotti per uso offline"""
		domain = [
			('sale_ok', '=', True),
			('type', 'in', ['product', 'consu']),
			'|', ('company_id', '=', self.company_id.id), ('company_id', '=', False)
		]

		# Filtra per categorie se configurato
		if self.limit_categories and self.available_categ_ids:
			domain.append(('categ_id', 'child_of', self.available_categ_ids.ids))

		products = self.env['product.product'].search(domain)

		return [{
			'id': p.id,
			'name': p.name,
			'default_code': p.default_code or '',
			'barcode': p.barcode or '',
			'list_price': p.list_price,
			'standard_price': p.standard_price,
			'uom_id': p.uom_id.id,
			'uom_name': p.uom_id.name,
			'categ_id': p.categ_id.id,
			'categ_name': p.categ_id.name,
			'taxes_id': p.taxes_id.ids,
			'type': p.type,
			'tracking': p.tracking,
		} for p in products]

	def _get_categories_data(self):
		"""Carica categorie prodotti"""
		categories = self.env['product.category'].search([])
		return [{
			'id': c.id,
			'name': c.name,
			'parent_id': c.parent_id.id if c.parent_id else False,
			'parent_path': c.parent_path or '',
		} for c in categories]

	def _get_taxes_data(self):
		"""Carica tasse per calcoli"""
		taxes = self.env['account.tax'].search([
			('company_id', '=', self.company_id.id),
			('type_tax_use', '=', 'sale')
		])
		return [{
			'id': t.id,
			'name': t.name,
			'amount': t.amount,
			'amount_type': t.amount_type,
			'include_base_amount': t.include_base_amount,
			'sequence': t.sequence,
		} for t in taxes]

	def _get_uoms_data(self):
		"""Carica unità di misura"""
		uoms = self.env['uom.uom'].search([])
		return [{
			'id': u.id,
			'name': u.name,
			'category_id': u.category_id.id,
			'factor': u.factor,
			'rounding': u.rounding,
		} for u in uoms]

	def _get_ddt_config_data(self):
		"""Carica configurazioni DDT"""
		return {
			'transport_reasons': [{
				'id': r.id,
				'name': r.name,
				'code': r.code or '',
			} for r in self.env['stock.picking.transport.reason'].search([])],

			'goods_appearances': [{
				'id': a.id,
				'name': a.name,
				'code': a.code or '',
			} for a in self.env['stock.picking.goods.appearance'].search([])],

			'transport_conditions': [{
				'id': c.id,
				'name': c.name,
				'code': c.code or '',
			} for c in self.env['stock.picking.transport.condition'].search([])],

			'transport_methods': [{
				'id': m.id,
				'name': m.name,
				'code': m.code or '',
			} for m in self.env['stock.picking.transport.method'].search([])],

			'ddt_types': [{
				'id': t.id,
				'name': t.name,
				'code': t.code,
				'print_prices': t.print_prices,
			} for t in self.env['stock.delivery.note.type'].search([
				('company_id', '=', self.company_id.id)
			])],

			'default_transport_reason_id': self.ddt_transport_reason_id.id if self.ddt_transport_reason_id else False,
			'default_goods_appearance_id': self.ddt_goods_appearance_id.id if self.ddt_goods_appearance_id else False,
			'default_transport_condition_id': self.ddt_transport_condition_id.id if self.ddt_transport_condition_id else False,
		}

	def _get_user_counters(self):
		"""Ottiene contatori per l'utente corrente"""
		user = self.env.user
		if not user.is_raccolta_agent:
			return {}

		return user.get_offline_counters()

	@api.model
	def get_default_config(self):
		"""Restituisce la configurazione di default per l'azienda corrente"""
		config = self.search([
			('company_id', '=', self.env.company.id),
			('active', '=', True)
		], limit=1)

		if not config:
			raise UserError(_('Nessuna configurazione raccolta ordini trovata per questa azienda'))

		return config