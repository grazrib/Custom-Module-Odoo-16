# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError


class SaleOrder(models.Model):
	"""Estensione ordini di vendita per raccolta offline"""
	_inherit = 'sale.order'

	# === CAMPI RACCOLTA ORDINI ===
	raccolta_session_id = fields.Many2one(
		'raccolta.session',
		string='Sessione Raccolta',
		help='Sessione di raccolta in cui è stato creato l\'ordine'
	)

	agent_code = fields.Char(
		string='Codice Agente',
		related='raccolta_session_id.user_id.agent_code',
		store=True,
		help='Codice dell\'agente che ha creato l\'ordine'
	)

	is_offline_order = fields.Boolean(
		string='Ordine Offline',
		default=False,
		help='Indica se l\'ordine è stato creato offline'
	)

	synced_to_odoo = fields.Boolean(
		string='Sincronizzato',
		default=True,
		help='Indica se l\'ordine è stato sincronizzato con Odoo'
	)

	offline_created_at = fields.Datetime(
		string='Creato Offline Il',
		help='Data e ora di creazione offline'
	)

	sync_at = fields.Datetime(
		string='Sincronizzato Il',
		help='Data e ora di sincronizzazione'
	)

	# === CAMPI DDT E PICKING ===
	auto_create_picking = fields.Boolean(
		string='Crea Picking Automatico',
		default=True,
		help='Crea automaticamente il picking alla conferma'
	)

	auto_create_ddt = fields.Boolean(
		string='Crea DDT Automatico',
		default=True,
		help='Crea automaticamente il DDT alla validazione picking'
	)

	# Alias per compatibilità - usa i campi del modulo DDT esistente
	ddt_ids = fields.Many2many(
		'stock.delivery.note',
		string='DDT Collegati',
		related='delivery_note_ids',
		help='DDT generati per questo ordine'
	)

	ddt_count = fields.Integer(
		string='Numero DDT',
		related='delivery_note_count',
		help='Numero di DDT collegati'
	)

	# === CAMPI RICEVUTE ===
	receipt_printed = fields.Boolean(
		string='Ricevuta Stampata',
		default=False,
		help='Indica se la ricevuta è stata stampata'
	)

	receipt_format = fields.Selection([
		('48mm', 'Formato 48mm'),
		('80mm', 'Formato 80mm'),
		('pdf', 'PDF Standard'),
	], string='Formato Ricevuta',
		help='Formato utilizzato per la ricevuta')

	signature_data = fields.Text(
		string='Firma Digitale',
		help='Dati della firma digitale del cliente'
	)

	has_signature = fields.Boolean(
		string='Ha Firma',
		compute='_compute_has_signature',
		help='Indica se l\'ordine ha una firma digitale'
	)

	# === CAMPI NOTE ESTESE ===
	general_notes = fields.Text(
		string='Note Generali',
		help='Note generali visibili al cliente'
	)

	internal_notes = fields.Text(
		string='Note Interne',
		help='Note interne non visibili al cliente'
	)

	delivery_instructions = fields.Text(
		string='Istruzioni Consegna',
		help='Istruzioni specifiche per la consegna'
	)

	# === COMPUTED FIELDS ===
	@api.depends('signature_data')
	def _compute_has_signature(self):
		"""Calcola se l'ordine ha una firma"""
		for order in self:
			order.has_signature = bool(order.signature_data and order.signature_data.strip())

	# === METODI BUSINESS ===
	@api.model
	def create(self, vals):
		"""Override create per gestire numerazione agente"""
		# Se l'ordine viene creato tramite raccolta e l'utente ha numerazione personalizzata
		if (vals.get('raccolta_session_id') and 
			self.env.user.is_raccolta_agent and 
			self.env.user.order_sequence_id and 
			not vals.get('name')):
			
			vals['name'] = self.env.user.get_next_order_number()

		# Imposta flag offline se creato tramite sessione raccolta
		if vals.get('raccolta_session_id'):
			vals['is_offline_order'] = True
			vals['offline_created_at'] = fields.Datetime.now()

		return super().create(vals)

	def action_confirm(self):
		"""Override conferma per gestire picking e DDT automatici"""
		result = super().action_confirm()

		for order in self:
			if order.raccolta_session_id and order.auto_create_picking:
				order._create_picking_for_raccolta()

		return result

	def _create_picking_for_raccolta(self):
		"""Crea picking specifico per raccolta ordini"""
		self.ensure_one()

		if not self.raccolta_session_id:
			return

		# Usa il metodo standard di Odoo per creare picking
		picking = self.picking_ids.filtered(lambda p: p.state not in ('done', 'cancel'))

		if picking and self.auto_create_ddt:
			# Imposta flag per creazione DDT automatica
			picking.write({'auto_create_ddt': True})

	def create_receipt_data(self, format='48mm', include_signature=True):
		"""Crea dati per generazione ricevuta"""
		self.ensure_one()

		# Dati azienda
		company = self.company_id
		company_data = {
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

		# Dati cliente
		client_data = {
			'name': self.partner_id.name,
			'display_name': self.partner_id.display_name,
			'street': self.partner_id.street or '',
			'street2': self.partner_id.street2 or '',
			'city': self.partner_id.city or '',
			'zip': self.partner_id.zip or '',
			'state': self.partner_id.state_id.name if self.partner_id.state_id else '',
			'country_id': self.partner_id.country_id.name if self.partner_id.country_id else '',
			'phone': self.partner_id.phone or '',
			'mobile': self.partner_id.mobile or '',
			'email': self.partner_id.email or '',
			'vat': self.partner_id.vat or '',
			'is_company': self.partner_id.is_company,
		}

		# Dati ordine
		order_data = {
			'name': self.name,
			'id': self.id,
			'state': self.state,
			'date_order': self.date_order,
			'amount_untaxed': self.amount_untaxed,
			'amount_tax': self.amount_tax,
			'amount_total': self.amount_total,
			'currency_name': self.currency_id.name,
			'general_notes': self.general_notes or '',
			'internal_notes': self.internal_notes or '',
			'delivery_instructions': self.delivery_instructions or '',
			'agent_code': self.agent_code or '',
			'order_lines': [
				{
					'product_name': line.product_id.name,
					'product_code': line.product_id.default_code or '',
					'quantity': line.product_uom_qty,
					'uom_name': line.product_uom.name,
					'price_unit': line.price_unit,
					'price_subtotal': line.price_subtotal,
					'note': getattr(line, 'note', '') or '',
				}
				for line in self.order_line
			]
		}

		# Dati picking collegati
		picking_data = {}
		if self.picking_ids:
			picking = self.picking_ids[0]  # Primo picking
			picking_data = {
				'id': picking.id,
				'name': picking.name,
				'state': picking.state,
				'scheduled_date': picking.scheduled_date,
				'location_dest_name': picking.location_dest_id.name,
				'synced': getattr(picking, 'synced_to_odoo', True),
			}

		# Dati DDT collegati
		ddt_data = {}
		if self.ddt_ids:
			ddt = self.ddt_ids[0]  # Primo DDT
			ddt_data = {
				'id': ddt.id,
				'name': ddt.name,
				'state': ddt.state,
				'date': ddt.date,
				'transport_reason': ddt.transport_reason_id.name if ddt.transport_reason_id else 'Vendita',
				'goods_appearance': ddt.goods_appearance_id.name if ddt.goods_appearance_id else 'Colli N.1',
				'transport_condition': ddt.transport_condition_id.name if ddt.transport_condition_id else 'Porto Assegnato',
				'transport_method': ddt.transport_method_id.name if ddt.transport_method_id else 'Destinatario',
				'carrier_name': ddt.carrier_id.name if ddt.carrier_id else '',
				'packages': str(ddt.packages or 1),
				'gross_weight': ddt.gross_weight or '',
				'net_weight': ddt.net_weight or '',
				'synced': getattr(ddt, 'synced_to_odoo', True),
			}

		# Opzioni ricevuta
		options = {
			'format': format,
			'include_signature': include_signature and self.has_signature,
			'signature_data': self.signature_data if include_signature else None,
			'show_prices': True,  # Configurabile
			'show_ddt_details': bool(ddt_data),
		}

		return {
			'quote': order_data,
			'client': client_data,
			'companyData': company_data,
			'picking': picking_data,
			'ddt': ddt_data,
			'options': options
		}

	def print_receipt(self, format='48mm', include_signature=True):
		"""Stampa ricevuta ordine"""
		self.ensure_one()

		receipt_data = self.create_receipt_data(format, include_signature)

		# Aggiorna flag stampa
		self.write({
			'receipt_printed': True,
			'receipt_format': format
		})

		# Restituisce action per generazione ricevuta
		return {
			'type': 'ir.actions.report',
			'report_name': 'raccolta_ordini.receipt_report',
			'report_type': 'qweb-pdf',
			'context': {
				'receipt_data': receipt_data,
				'format': format
			}
		}

	def action_view_ddts(self):
		"""Visualizza DDT collegati"""
		self.ensure_one()

		action = self.env.ref('l10n_it_delivery_note.action_delivery_note_out').read()[0]

		if len(self.ddt_ids) > 1:
			action['domain'] = [('id', 'in', self.ddt_ids.ids)]
		elif len(self.ddt_ids) == 1:
			action['views'] = [(self.env.ref('l10n_it_delivery_note.view_delivery_note_form').id, 'form')]
			action['res_id'] = self.ddt_ids.id
		else:
			action = {'type': 'ir.actions.act_window_close'}

		return action

	def mark_as_synced(self):
		"""Marca ordine come sincronizzato"""
		self.ensure_one()

		self.write({
			'synced_to_odoo': True,
			'sync_at': fields.Datetime.now()
		})

	def create_offline_copy(self):
		"""Crea copia dell'ordine per uso offline"""
		self.ensure_one()

		offline_data = {
			'id': f'offline_{self.id}_{fields.Datetime.now().timestamp()}',
			'name': self.name,
			'partner_id': self.partner_id.id,
			'partner_name': self.partner_id.name,
			'date_order': self.date_order.isoformat(),
			'state': self.state,
			'amount_total': self.amount_total,
			'general_notes': self.general_notes or '',
			'signature_data': self.signature_data or '',
			'products': [
				{
					'product_id': line.product_id.id,
					'name': line.product_id.name,
					'quantity': line.product_uom_qty,
					'price_unit': line.price_unit,
					'note': getattr(line, 'note', '') or '',
				}
				for line in self.order_line
			],
			'is_offline_order': True,
			'synced_to_odoo': True,
			'original_order_id': self.id,
		}

		return offline_data


class SaleOrderLine(models.Model):
	"""Estensione righe ordine per note prodotto"""
	_inherit = 'sale.order.line'

	# === CAMPI SPECIFICI RACCOLTA ===
	note = fields.Text(
		string='Note Prodotto',
		help='Note specifiche per questo prodotto'
	)

	barcode_scanned = fields.Boolean(
		string='Scansionato da Barcode',
		default=False,
		help='Indica se il prodotto è stato aggiunto tramite scanner'
	)

	offline_line_id = fields.Char(
		string='ID Riga Offline',
		help='ID della riga quando creata offline'
	)