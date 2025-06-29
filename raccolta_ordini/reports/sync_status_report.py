# -*- coding: utf-8 -*-

from odoo import models, fields, api, tools
from datetime import datetime, timedelta


class SyncStatusReport(models.Model):
	_name = 'raccolta.sync.status.report'
	_description = 'Report Stato Sincronizzazione'
	_auto = False
	_rec_name = 'document_name'

	# Documento
	document_type = fields.Selection([
		('order', 'Ordine'),
		('picking', 'Picking/DDT')
	], string='Tipo Documento', readonly=True)

	document_id = fields.Integer(string='ID Documento', readonly=True)
	document_name = fields.Char(string='Nome Documento', readonly=True)
	local_name = fields.Char(string='Nome Locale', readonly=True)

	# Agente
	agent_id = fields.Many2one('res.users', string='Agente', readonly=True)
	agent_name = fields.Char(string='Nome Agente', readonly=True)
	agent_code = fields.Char(string='Codice Agente', readonly=True)

	# Cliente
	partner_id = fields.Many2one('res.partner', string='Cliente', readonly=True)
	partner_name = fields.Char(string='Nome Cliente', readonly=True)

	# Date e tempi
	create_date = fields.Datetime(string='Data Creazione', readonly=True)
	sync_date = fields.Datetime(string='Data Sincronizzazione', readonly=True)
	last_sync_attempt = fields.Datetime(string='Ultimo Tentativo', readonly=True)

	# Stati sincronizzazione
	sync_status = fields.Selection([
		('pending', 'In Attesa'),
		('syncing', 'Sincronizzazione'),
		('synced', 'Sincronizzato'),
		('failed', 'Errore')
	], string='Stato Sync', readonly=True)

	sync_attempts = fields.Integer(string='Tentativi', readonly=True)
	sync_error = fields.Text(string='Errore Sync', readonly=True)

	# Metriche temporali
	sync_duration = fields.Float(string='Durata Sync (min)', readonly=True,
								 help='Tempo dalla creazione alla sincronizzazione')
	pending_duration = fields.Float(string='In Attesa Da (ore)', readonly=True,
									help='Ore dalla creazione se non ancora sincronizzato')

	# Priorità e urgenza
	sync_priority = fields.Selection([
		('low', 'Bassa'),
		('normal', 'Normale'),
		('high', 'Alta'),
		('urgent', 'Urgente')
	], string='Priorità', readonly=True)

	is_urgent = fields.Boolean(string='Urgente', readonly=True)
	is_old_pending = fields.Boolean(string='In Attesa da Tempo', readonly=True,
									help='In attesa da più di 24 ore')

	# Dettagli documento
	document_state = fields.Char(string='Stato Documento', readonly=True)
	document_amount = fields.Float(string='Importo', readonly=True)

	# Raggruppamenti
	sync_date_day = fields.Date(string='Giorno Sync', readonly=True)
	create_date_day = fields.Date(string='Giorno Creazione', readonly=True)
	hour_created = fields.Integer(string='Ora Creazione', readonly=True)

	def _query(self):
		"""Query SQL per report stato sincronizzazione"""
		return """
            -- Ordini di vendita
            SELECT 
                'order_' || so.id as id,
                'order' as document_type,
                so.id as document_id,
                so.name as document_name,
                COALESCE(so.client_order_ref, '') as local_name,

                -- Agente
                so.user_id as agent_id,
                COALESCE(up.name, 'N/A') as agent_name,
                COALESCE(u.agent_code, '') as agent_code,

                -- Cliente
                so.partner_id,
                COALESCE(rp.name, 'N/A') as partner_name,

                -- Date
                so.create_date,
                COALESCE(so.sync_at, so.write_date) as sync_date,
                so.write_date as last_sync_attempt,

                -- Stato sync (calcolato da campi esistenti)
                CASE 
                    WHEN COALESCE(so.synced_to_odoo, true) = true THEN 'synced'
                    WHEN COALESCE(so.is_offline_order, false) = true AND COALESCE(so.synced_to_odoo, true) = false THEN 'pending'
                    ELSE 'synced'
                END as sync_status,

                0 as sync_attempts,
                '' as sync_error,

                -- Metriche temporali
                CASE 
                    WHEN so.sync_at IS NOT NULL THEN
                        EXTRACT(EPOCH FROM (so.sync_at - so.create_date)) / 60.0
                    ELSE NULL
                END as sync_duration,

                CASE 
                    WHEN COALESCE(so.synced_to_odoo, true) = false THEN
                        EXTRACT(EPOCH FROM (NOW() - so.create_date)) / 3600.0
                    ELSE NULL
                END as pending_duration,

                -- Priorità
                CASE 
                    WHEN so.amount_total > 10000 THEN 'urgent'
                    WHEN so.amount_total > 5000 THEN 'high'
                    WHEN so.amount_total > 1000 THEN 'normal'
                    ELSE 'low'
                END as sync_priority,

                CASE 
                    WHEN COALESCE(so.note, '') ILIKE '%urgente%' OR COALESCE(so.note, '') ILIKE '%express%' OR so.amount_total > 10000
                    THEN true ELSE false 
                END as is_urgent,

                CASE 
                    WHEN COALESCE(so.synced_to_odoo, true) = false AND 
                         EXTRACT(EPOCH FROM (NOW() - so.create_date)) > 86400
                    THEN true ELSE false 
                END as is_old_pending,

                -- Dettagli documento
                so.state as document_state,
                so.amount_total as document_amount,

                -- Raggruppamenti
                COALESCE(so.sync_at, so.write_date)::date as sync_date_day,
                so.create_date::date as create_date_day,
                EXTRACT(HOUR FROM so.create_date) as hour_created

            FROM sale_order so
            LEFT JOIN res_users u ON u.id = so.user_id
            LEFT JOIN res_partner up ON up.id = u.partner_id
            LEFT JOIN res_partner rp ON rp.id = so.partner_id
            WHERE COALESCE(so.is_offline_order, false) = true

            UNION ALL

            -- Picking/DDT (solo se esistono campi supportati)
            SELECT 
                'picking_' || sp.id as id,
                'picking' as document_type,
                sp.id as document_id,
                sp.name as document_name,
                COALESCE(sp.origin, '') as local_name,

                -- Agente  
                sp.user_id as agent_id,
                COALESCE(up.name, 'N/A') as agent_name,
                COALESCE(u.agent_code, '') as agent_code,

                -- Cliente
                sp.partner_id,
                COALESCE(rp.name, 'N/A') as partner_name,

                -- Date
                sp.create_date,
                sp.write_date as sync_date,
                sp.write_date as last_sync_attempt,

                -- Stato sync (basato su stato picking)
                CASE 
                    WHEN sp.state = 'done' THEN 'synced'
                    WHEN sp.state = 'cancel' THEN 'failed'
                    WHEN sp.state IN ('waiting', 'confirmed', 'assigned') THEN 'pending'
                    ELSE 'pending'
                END as sync_status,

                0 as sync_attempts,
                '' as sync_error,

                -- Metriche temporali
                CASE 
                    WHEN sp.state = 'done' AND sp.date_done IS NOT NULL THEN
                        EXTRACT(EPOCH FROM (sp.date_done - sp.create_date)) / 60.0
                    ELSE NULL
                END as sync_duration,

                CASE 
                    WHEN sp.state != 'done' THEN
                        EXTRACT(EPOCH FROM (NOW() - sp.create_date)) / 3600.0
                    ELSE NULL
                END as pending_duration,

                -- Priorità
                CASE 
                    WHEN sp.priority = '2' THEN 'urgent'
                    WHEN sp.priority = '1' THEN 'high'
                    ELSE 'normal'
                END as sync_priority,

                CASE 
                    WHEN sp.priority IN ('1', '2') 
                    THEN true ELSE false 
                END as is_urgent,

                CASE 
                    WHEN sp.state != 'done' AND 
                         EXTRACT(EPOCH FROM (NOW() - sp.create_date)) > 86400
                    THEN true ELSE false 
                END as is_old_pending,

                -- Dettagli documento
                sp.state as document_state,
                0.0 as document_amount,

                -- Raggruppamenti
                sp.write_date::date as sync_date_day,
                sp.create_date::date as create_date_day,
                EXTRACT(HOUR FROM sp.create_date) as hour_created

            FROM stock_picking sp
            LEFT JOIN res_users u ON u.id = sp.user_id
            LEFT JOIN res_partner up ON up.id = u.partner_id
            LEFT JOIN res_partner rp ON rp.id = sp.partner_id
            WHERE sp.origin LIKE 'SO%' OR sp.origin LIKE 'RO%'
        """

	def init(self):
		"""Inizializza vista SQL"""
		tools.drop_view_if_exists(self.env.cr, self._table)
		self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
                {self._query()}
            )
        """)

	@api.model
	def get_sync_summary(self):
		"""Restituisce riepilogo stato sincronizzazione"""
		# Conta documenti per stato
		status_counts = {}
		for status in ['pending', 'syncing', 'synced', 'failed']:
			count = self.search_count([('sync_status', '=', status)])
			status_counts[status] = count

		# Documenti urgenti in errore
		urgent_failed = self.search_count([
			('sync_status', '=', 'failed'),
			('is_urgent', '=', True)
		])

		# Documenti vecchi in attesa
		old_pending = self.search_count([('is_old_pending', '=', True)])

		# Tempo medio sincronizzazione
		synced_docs = self.search([('sync_status', '=', 'synced')])
		avg_sync_time = sum(synced_docs.mapped('sync_duration')) / len(synced_docs) if synced_docs else 0

		# Tasso successo ultimo giorno
		yesterday = datetime.now() - timedelta(days=1)
		recent_docs = self.search([('create_date', '>=', yesterday)])
		success_rate = 0
		if recent_docs:
			synced_recent = recent_docs.filtered(lambda r: r.sync_status == 'synced')
			success_rate = len(synced_recent) / len(recent_docs) * 100

		return {
			'status_counts': status_counts,
			'total_documents': sum(status_counts.values()),
			'urgent_failed': urgent_failed,
			'old_pending': old_pending,
			'avg_sync_time_minutes': round(avg_sync_time, 2),
			'success_rate_24h': round(success_rate, 2),
			'needs_attention': urgent_failed + old_pending
		}

	@api.model
	def get_agent_sync_stats(self, agent_id=None, days=7):
		"""Statistiche sincronizzazione per agente"""
		domain = []
		if agent_id:
			domain.append(('agent_id', '=', agent_id))

		# Ultimi N giorni
		start_date = datetime.now() - timedelta(days=days)
		domain.append(('create_date', '>=', start_date))

		records = self.search(domain)

		if not records:
			return {}

		# Raggruppa per agente
		agent_stats = {}
		for record in records:
			agent_key = record.agent_id.id
			if agent_key not in agent_stats:
				agent_stats[agent_key] = {
					'agent_name': record.agent_name,
					'agent_code': record.agent_code,
					'total': 0,
					'synced': 0,
					'failed': 0,
					'pending': 0,
					'avg_sync_time': 0,
					'urgent_failed': 0
				}

			stats = agent_stats[agent_key]
			stats['total'] += 1

			if record.sync_status == 'synced':
				stats['synced'] += 1
				if record.sync_duration:
					stats['avg_sync_time'] += record.sync_duration
			elif record.sync_status == 'failed':
				stats['failed'] += 1
				if record.is_urgent:
					stats['urgent_failed'] += 1
			elif record.sync_status in ['pending', 'syncing']:
				stats['pending'] += 1

		# Calcola medie
		for stats in agent_stats.values():
			if stats['synced'] > 0:
				stats['avg_sync_time'] = round(stats['avg_sync_time'] / stats['synced'], 2)
			stats['success_rate'] = round(stats['synced'] / stats['total'] * 100, 2) if stats['total'] > 0 else 0

		return agent_stats

	def action_retry_sync(self):
		"""Azione per ritentare sincronizzazione"""
		failed_records = self.filtered(lambda r: r.sync_status == 'failed')

		if not failed_records:
			return {'type': 'ir.actions.act_window_close'}

		# Raggruppa per tipo documento
		orders_to_retry = []
		pickings_to_retry = []

		for record in failed_records:
			if record.document_type == 'order':
				orders_to_retry.append(record.document_id)
			elif record.document_type == 'picking':
				pickings_to_retry.append(record.document_id)

		# Ritenta sincronizzazione
		retry_count = 0

		if orders_to_retry:
			orders = self.env['sale.order'].browse(orders_to_retry)
			for order in orders.exists():
				try:
					order.write({
						'synced_to_odoo': False,
						'sync_at': None
					})
					retry_count += 1
				except Exception:
					continue

		if pickings_to_retry:
			pickings = self.env['stock.picking'].browse(pickings_to_retry)
			for picking in pickings.exists():
				try:
					picking.action_assign()
					retry_count += 1
				except Exception:
					continue

		return {
			'type': 'ir.actions.client',
			'tag': 'display_notification',
			'params': {
				'title': 'Sincronizzazione',
				'message': f'{retry_count} documenti rimessi in coda per sincronizzazione',
				'type': 'success',
			}
		}

	def action_view_document(self):
		"""Azione per visualizzare documento"""
		self.ensure_one()

		if self.document_type == 'order':
			return {
				'type': 'ir.actions.act_window',
				'name': 'Ordine',
				'res_model': 'sale.order',
				'res_id': self.document_id,
				'view_mode': 'form',
				'target': 'current'
			}
		elif self.document_type == 'picking':
			return {
				'type': 'ir.actions.act_window',
				'name': 'Picking/DDT',
				'res_model': 'stock.picking',
				'res_id': self.document_id,
				'view_mode': 'form',
				'target': 'current'
			}