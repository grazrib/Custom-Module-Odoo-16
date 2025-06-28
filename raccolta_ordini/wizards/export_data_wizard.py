# -*- coding: utf-8 -*-

import json
import base64
import logging
from datetime import datetime, timedelta
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ExportDataWizard(models.TransientModel):
	_name = 'raccolta.export.data.wizard'
	_description = 'Wizard Export Dati Raccolta'

	# Filtri export
	agent_ids = fields.Many2many(
		'res.users',
		string='Agenti',
		domain=[('is_raccolta_agent', '=', True)],
		help='Lasciare vuoto per tutti gli agenti'
	)

	date_from = fields.Datetime(
		string='Data Da',
		default=lambda self: fields.Datetime.now() - timedelta(days=30),
		required=True
	)

	date_to = fields.Datetime(
		string='Data A',
		default=fields.Datetime.now,
		required=True
	)

	# Tipi di dati da esportare
	export_orders = fields.Boolean(
		string='Esporta Ordini',
		default=True
	)

	export_pickings = fields.Boolean(
		string='Esporta Picking/DDT',
		default=True
	)

	export_clients = fields.Boolean(
		string='Esporta Clienti',
		default=False
	)

	export_products = fields.Boolean(
		string='Esporta Prodotti',
		default=False
	)

	export_sessions = fields.Boolean(
		string='Esporta Sessioni',
		default=True
	)

	# Formato export
	export_format = fields.Selection([
		('json', 'JSON'),
		('csv', 'CSV'),
		('excel', 'Excel')
	], string='Formato', default='json', required=True)

	# Opzioni avanzate
	include_attachments = fields.Boolean(
		string='Includi Allegati',
		default=False,
		help='Includi allegati e immagini'
	)

	compress_export = fields.Boolean(
		string='Comprimi File',
		default=True,
		help='Crea archivio ZIP'
	)

	# Risultati export
	export_file = fields.Binary(
		string='File Esportato',
		readonly=True
	)

	export_filename = fields.Char(
		string='Nome File',
		readonly=True
	)

	export_summary = fields.Text(
		string='Riepilogo Export',
		readonly=True
	)

	def action_export_data(self):
		"""Esegue export dati"""
		self.ensure_one()

		if not any([self.export_orders, self.export_pickings, self.export_clients,
					self.export_products, self.export_sessions]):
			raise UserError(_('Selezionare almeno un tipo di dato da esportare'))

		# Agenti da esportare
		agents = self.agent_ids
		if not agents:
			agents = self.env['res.users'].search([('is_raccolta_agent', '=', True)])

		export_data = {}
		summary = []

		try:
			# Export ordini
			if self.export_orders:
				orders_data = self._export_orders(agents)
				export_data['orders'] = orders_data
				summary.append(f"Ordini: {len(orders_data)}")

			# Export picking
			if self.export_pickings:
				pickings_data = self._export_pickings(agents)
				export_data['pickings'] = pickings_data
				summary.append(f"Picking/DDT: {len(pickings_data)}")

			# Export clienti
			if self.export_clients:
				clients_data = self._export_clients(agents)
				export_data['clients'] = clients_data
				summary.append(f"Clienti: {len(clients_data)}")

			# Export prodotti
			if self.export_products:
				products_data = self._export_products(agents)
				export_data['products'] = products_data
				summary.append(f"Prodotti: {len(products_data)}")

			# Export sessioni
			if self.export_sessions:
				sessions_data = self._export_sessions(agents)
				export_data['sessions'] = sessions_data
				summary.append(f"Sessioni: {len(sessions_data)}")

			# Genera file
			file_data, filename = self._generate_export_file(export_data)

			self.write({
				'export_file': file_data,
				'export_filename': filename,
				'export_summary': f"Export completato:\n" + "\n".join(summary)
			})

		except Exception as e:
			_logger.error(f"Errore export dati: {str(e)}")
			raise UserError(_('Errore durante export: %s') % str(e))

		return {
			'type': 'ir.actions.act_window',
			'name': _('Export Completato'),
			'res_model': 'raccolta.export.data.wizard',
			'res_id': self.id,
			'view_mode': 'form',
			'target': 'new',
			'context': {'show_results': True}
		}

	def _export_orders(self, agents):
		"""Esporta ordini di vendita"""
		domain = [
			('user_id', 'in', agents.ids),
			('create_date', '>=', self.date_from),
			('create_date', '<=', self.date_to),
			('is_offline_order', '=', True)
		]

		orders = self.env['sale.order'].search(domain)
		orders_data = []

		for order in orders:
			order_data = {
				'id': order.id,
				'name': order.name,
				'local_name': order.local_name,
				'agent_code': order.user_id.agent_code,
				'agent_name': order.user_id.name,
				'client_name': order.partner_id.name,
				'client_vat': order.partner_id.vat,
				'date_order': order.date_order.isoformat() if order.date_order else None,
				'create_date': order.create_date.isoformat(),
				'state': order.state,
				'sync_status': order.sync_status,
				'amount_untaxed': float(order.amount_untaxed),
				'amount_tax': float(order.amount_tax),
				'amount_total': float(order.amount_total),
				'currency': order.currency_id.name,
				'note': order.note or '',
				'lines': []
			}

			# Righe ordine
			for line in order.order_line:
				line_data = {
					'product_code': line.product_id.default_code or '',
					'product_name': line.product_id.name,
					'quantity': float(line.product_uom_qty),
					'price_unit': float(line.price_unit),
					'discount': float(line.discount),
					'subtotal': float(line.price_subtotal),
					'uom': line.product_uom.name
				}
				order_data['lines'].append(line_data)

			orders_data.append(order_data)

		return orders_data

	def _export_pickings(self, agents):
		"""Esporta picking e DDT"""
		domain = [
			('user_id', 'in', agents.ids),
			('create_date', '>=', self.date_from),
			('create_date', '<=', self.date_to),
			('is_offline_picking', '=', True)
		]

		pickings = self.env['stock.picking'].search(domain)
		pickings_data = []

		for picking in pickings:
			picking_data = {
				'id': picking.id,
				'name': picking.name,
				'local_name': picking.local_name,
				'ddt_number': picking.ddt_number,
				'agent_code': picking.user_id.agent_code,
				'agent_name': picking.user_id.name,
				'client_name': picking.partner_id.name,
				'client_vat': picking.partner_id.vat,
				'scheduled_date': picking.scheduled_date.isoformat() if picking.scheduled_date else None,
				'create_date': picking.create_date.isoformat(),
				'state': picking.state,
				'sync_status': picking.sync_status,
				'picking_type': picking.picking_type_id.name,
				'transport_method': picking.transport_method_id.name if picking.transport_method_id else '',
				'transport_condition': picking.transport_condition_id.name if picking.transport_condition_id else '',
				'moves': []
			}

			# Movimenti stock
			for move in picking.move_lines:
				move_data = {
					'product_code': move.product_id.default_code or '',
					'product_name': move.product_id.name,
					'quantity_demand': float(move.product_uom_qty),
					'quantity_done': float(move.quantity_done),
					'uom': move.product_uom.name,
					'location_src': move.location_id.complete_name,
					'location_dest': move.location_dest_id.complete_name
				}
				picking_data['moves'].append(move_data)

			pickings_data.append(picking_data)

		return pickings_data

	def _export_clients(self, agents):
		"""Esporta clienti utilizzati dagli agenti"""
		# Trova clienti usati negli ordini del periodo
		orders = self.env['sale.order'].search([
			('user_id', 'in', agents.ids),
			('create_date', '>=', self.date_from),
			('create_date', '<=', self.date_to),
			('is_offline_order', '=', True)
		])

		client_ids = orders.mapped('partner_id.id')
		clients = self.env['res.partner'].browse(client_ids)
		clients_data = []

		for client in clients:
			client_data = {
				'id': client.id,
				'name': client.name,
				'display_name': client.display_name,
				'vat': client.vat or '',
				'email': client.email or '',
				'phone': client.phone or '',
				'mobile': client.mobile or '',
				'street': client.street or '',
				'street2': client.street2 or '',
				'city': client.city or '',
				'zip': client.zip or '',
				'state': client.state_id.name if client.state_id else '',
				'country': client.country_id.name if client.country_id else '',
				'is_company': client.is_company,
				'customer_rank': client.customer_rank,
				'supplier_rank': client.supplier_rank,
				'category_names': [cat.name for cat in client.category_id],
				'create_date': client.create_date.isoformat()
			}
			clients_data.append(client_data)

		return clients_data

	def _export_products(self, agents):
		"""Esporta prodotti utilizzati dagli agenti"""
		# Trova prodotti usati negli ordini del periodo
		order_lines = self.env['sale.order.line'].search([
			('order_id.user_id', 'in', agents.ids),
			('order_id.create_date', '>=', self.date_from),
			('order_id.create_date', '<=', self.date_to),
			('order_id.is_offline_order', '=', True)
		])

		product_ids = order_lines.mapped('product_id.id')
		products = self.env['product.product'].browse(product_ids)
		products_data = []

		for product in products:
			product_data = {
				'id': product.id,
				'default_code': product.default_code or '',
				'name': product.name,
				'display_name': product.display_name,
				'barcode': product.barcode or '',
				'list_price': float(product.list_price),
				'standard_price': float(product.standard_price),
				'uom_name': product.uom_id.name,
				'uom_po_name': product.uom_po_id.name,
				'type': product.type,
				'categ_name': product.categ_id.name,
				'active': product.active,
				'sale_ok': product.sale_ok,
				'purchase_ok': product.purchase_ok,
				'weight': float(product.weight),
				'volume': float(product.volume),
				'create_date': product.create_date.isoformat()
			}
			products_data.append(product_data)

		return products_data

	def _export_sessions(self, agents):
		"""Esporta sessioni raccolta"""
		domain = [
			('user_id', 'in', agents.ids),
			('create_date', '>=', self.date_from),
			('create_date', '<=', self.date_to)
		]

		sessions = self.env['raccolta.session'].search(domain)
		sessions_data = []

		for session in sessions:
			session_data = {
				'id': session.id,
				'name': session.name,
				'agent_code': session.user_id.agent_code,
				'agent_name': session.user_id.name,
				'start_date': session.start_date.isoformat() if session.start_date else None,
				'end_date': session.end_date.isoformat() if session.end_date else None,
				'create_date': session.create_date.isoformat(),
				'state': session.state,
				'orders_count': session.orders_count,
				'pickings_count': session.pickings_count,
				'total_amount': float(session.total_amount),
				'notes': session.notes or ''
			}
			sessions_data.append(session_data)

		return sessions_data

	def _generate_export_file(self, export_data):
		"""Genera file di export nel formato richiesto"""
		timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

		if self.export_format == 'json':
			return self._generate_json_file(export_data, timestamp)
		elif self.export_format == 'csv':
			return self._generate_csv_file(export_data, timestamp)
		elif self.export_format == 'excel':
			return self._generate_excel_file(export_data, timestamp)
		else:
			raise UserError(_('Formato non supportato'))

	def _generate_json_file(self, export_data, timestamp):
		"""Genera file JSON"""
		# Aggiungi metadati
		export_data['metadata'] = {
			'export_date': datetime.now().isoformat(),
			'export_user': self.env.user.name,
			'date_from': self.date_from.isoformat(),
			'date_to': self.date_to.isoformat(),
			'agents': [{'id': a.id, 'name': a.name, 'code': a.agent_code}
					   for a in (self.agent_ids or self.env['res.users'].search([('is_raccolta_agent', '=', True)]))]
		}

		json_content = json.dumps(export_data, indent=2, ensure_ascii=False)
		json_bytes = json_content.encode('utf-8')

		filename = f'raccolta_export_{timestamp}.json'

		if self.compress_export:
			import zipfile
			import io

			zip_buffer = io.BytesIO()
			with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
				zip_file.writestr(filename, json_bytes)

			zip_buffer.seek(0)
			file_data = base64.b64encode(zip_buffer.read())
			filename = f'raccolta_export_{timestamp}.zip'
		else:
			file_data = base64.b64encode(json_bytes)

		return file_data, filename

	def _generate_csv_file(self, export_data, timestamp):
		"""Genera file CSV (multipli)"""
		import csv
		import io
		import zipfile

		zip_buffer = io.BytesIO()

		with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:

			# Export ordini
			if 'orders' in export_data:
				csv_buffer = io.StringIO()
				writer = csv.writer(csv_buffer)

				# Header
				writer.writerow([
					'ID', 'Nome', 'Nome Locale', 'Codice Agente', 'Nome Agente',
					'Cliente', 'P.IVA Cliente', 'Data Ordine', 'Data Creazione',
					'Stato', 'Stato Sync', 'Imponibile', 'Imposte', 'Totale', 'Valuta', 'Note'
				])

				# Dati
				for order in export_data['orders']:
					writer.writerow([
						order['id'], order['name'], order.get('local_name', ''),
						order['agent_code'], order['agent_name'],
						order['client_name'], order.get('client_vat', ''),
						order.get('date_order', ''), order['create_date'],
						order['state'], order.get('sync_status', ''),
						order['amount_untaxed'], order['amount_tax'],
						order['amount_total'], order['currency'], order.get('note', '')
					])

				zip_file.writestr(f'ordini_{timestamp}.csv', csv_buffer.getvalue().encode('utf-8-sig'))

			# Export picking
			if 'pickings' in export_data:
				csv_buffer = io.StringIO()
				writer = csv.writer(csv_buffer)

				# Header
				writer.writerow([
					'ID', 'Nome', 'Nome Locale', 'Numero DDT', 'Codice Agente', 'Nome Agente',
					'Cliente', 'P.IVA Cliente', 'Data Prevista', 'Data Creazione',
					'Stato', 'Stato Sync', 'Tipo', 'Metodo Trasporto', 'Condizione Trasporto'
				])

				# Dati
				for picking in export_data['pickings']:
					writer.writerow([
						picking['id'], picking['name'], picking.get('local_name', ''),
						picking.get('ddt_number', ''), picking['agent_code'], picking['agent_name'],
						picking['client_name'], picking.get('client_vat', ''),
						picking.get('scheduled_date', ''), picking['create_date'],
						picking['state'], picking.get('sync_status', ''),
						picking['picking_type'], picking.get('transport_method', ''),
						picking.get('transport_condition', '')
					])

				zip_file.writestr(f'picking_{timestamp}.csv', csv_buffer.getvalue().encode('utf-8-sig'))

			# Altri dati...
			for data_type in ['clients', 'products', 'sessions']:
				if data_type in export_data:
					self._add_csv_data_to_zip(zip_file, data_type, export_data[data_type], timestamp)

		zip_buffer.seek(0)
		file_data = base64.b64encode(zip_buffer.read())
		filename = f'raccolta_export_csv_{timestamp}.zip'

		return file_data, filename

	def _add_csv_data_to_zip(self, zip_file, data_type, data, timestamp):
		"""Aggiunge dati CSV al file ZIP"""
		import csv
		import io

		if not data:
			return

		csv_buffer = io.StringIO()
		writer = csv.writer(csv_buffer)

		# Usa le chiavi del primo record come header
		if data:
			writer.writerow(data[0].keys())
			for record in data:
				writer.writerow(record.values())

		zip_file.writestr(f'{data_type}_{timestamp}.csv', csv_buffer.getvalue().encode('utf-8-sig'))

	def _generate_excel_file(self, export_data, timestamp):
		"""Genera file Excel"""
		try:
			import xlsxwriter
			import io

			excel_buffer = io.BytesIO()
			workbook = xlsxwriter.Workbook(excel_buffer, {'in_memory': True})

			# Formati
			header_format = workbook.add_format({'bold': True, 'bg_color': '#D7E4BC'})
			date_format = workbook.add_format({'num_format': 'dd/mm/yyyy hh:mm'})

			# Sheet ordini
			if 'orders' in export_data:
				worksheet = workbook.add_worksheet('Ordini')
				self._write_orders_excel(worksheet, export_data['orders'], header_format, date_format)

			# Sheet picking
			if 'pickings' in export_data:
				worksheet = workbook.add_worksheet('Picking')
				self._write_pickings_excel(worksheet, export_data['pickings'], header_format, date_format)

			# Altri sheet...
			for data_type in ['clients', 'products', 'sessions']:
				if data_type in export_data:
					worksheet = workbook.add_worksheet(data_type.capitalize())
					self._write_generic_excel(worksheet, export_data[data_type], header_format)

			workbook.close()
			excel_buffer.seek(0)

			file_data = base64.b64encode(excel_buffer.read())
			filename = f'raccolta_export_{timestamp}.xlsx'

			return file_data, filename

		except ImportError:
			raise UserError(_('Modulo xlsxwriter non installato. Usare formato JSON o CSV.'))

	def _write_orders_excel(self, worksheet, orders, header_format, date_format):
		"""Scrive ordini in Excel"""
		headers = [
			'ID', 'Nome', 'Nome Locale', 'Codice Agente', 'Nome Agente',
			'Cliente', 'P.IVA Cliente', 'Data Ordine', 'Data Creazione',
			'Stato', 'Stato Sync', 'Imponibile', 'Imposte', 'Totale', 'Valuta', 'Note'
		]

		# Header
		for col, header in enumerate(headers):
			worksheet.write(0, col, header, header_format)

		# Dati
		for row, order in enumerate(orders, 1):
			worksheet.write(row, 0, order['id'])
			worksheet.write(row, 1, order['name'])
			worksheet.write(row, 2, order.get('local_name', ''))
			worksheet.write(row, 3, order['agent_code'])
			worksheet.write(row, 4, order['agent_name'])
			worksheet.write(row, 5, order['client_name'])
			worksheet.write(row, 6, order.get('client_vat', ''))
			worksheet.write(row, 7, order.get('date_order', ''))
			worksheet.write(row, 8, order['create_date'])
			worksheet.write(row, 9, order['state'])
			worksheet.write(row, 10, order.get('sync_status', ''))
			worksheet.write(row, 11, order['amount_untaxed'])
			worksheet.write(row, 12, order['amount_tax'])
			worksheet.write(row, 13, order['amount_total'])
			worksheet.write(row, 14, order['currency'])
			worksheet.write(row, 15, order.get('note', ''))

	def _write_pickings_excel(self, worksheet, pickings, header_format, date_format):
		"""Scrive picking in Excel"""
		headers = [
			'ID', 'Nome', 'Nome Locale', 'Numero DDT', 'Codice Agente', 'Nome Agente',
			'Cliente', 'P.IVA Cliente', 'Data Prevista', 'Data Creazione',
			'Stato', 'Stato Sync', 'Tipo', 'Metodo Trasporto', 'Condizione Trasporto'
		]

		# Header
		for col, header in enumerate(headers):
			worksheet.write(0, col, header, header_format)

		# Dati
		for row, picking in enumerate(pickings, 1):
			worksheet.write(row, 0, picking['id'])
			worksheet.write(row, 1, picking['name'])
			worksheet.write(row, 2, picking.get('local_name', ''))
			worksheet.write(row, 3, picking.get('ddt_number', ''))
			worksheet.write(row, 4, picking['agent_code'])
			worksheet.write(row, 5, picking['agent_name'])
			worksheet.write(row, 6, picking['client_name'])
			worksheet.write(row, 7, picking.get('client_vat', ''))
			worksheet.write(row, 8, picking.get('scheduled_date', ''))
			worksheet.write(row, 9, picking['create_date'])
			worksheet.write(row, 10, picking['state'])
			worksheet.write(row, 11, picking.get('sync_status', ''))
			worksheet.write(row, 12, picking['picking_type'])
			worksheet.write(row, 13, picking.get('transport_method', ''))
			worksheet.write(row, 14, picking.get('transport_condition', ''))

	def _write_generic_excel(self, worksheet, data, header_format):
		"""Scrive dati generici in Excel"""
		if not data:
			return

		# Header
		headers = list(data[0].keys())
		for col, header in enumerate(headers):
			worksheet.write(0, col, header, header_format)

		# Dati
		for row, record in enumerate(data, 1):
			for col, value in enumerate(record.values()):
				worksheet.write(row, col, value)
