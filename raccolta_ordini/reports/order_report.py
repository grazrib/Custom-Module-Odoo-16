# -*- coding: utf-8 -*-

from odoo import models, fields, api, tools


class OrderReport(models.Model):
	_name = 'raccolta.order.report'
	_description = 'Report Ordini Raccolta'
	_auto = False
	_rec_name = 'order_name'

	# Campi ordine
	order_id = fields.Many2one('sale.order', string='Ordine', readonly=True)
	order_name = fields.Char(string='Numero Ordine', readonly=True)
	local_name = fields.Char(string='Nome Locale', readonly=True)

	# Agente
	agent_id = fields.Many2one('res.users', string='Agente', readonly=True)
	agent_name = fields.Char(string='Nome Agente', readonly=True)
	agent_code = fields.Char(string='Codice Agente', readonly=True)

	# Cliente
	partner_id = fields.Many2one('res.partner', string='Cliente', readonly=True)
	partner_name = fields.Char(string='Nome Cliente', readonly=True)
	partner_vat = fields.Char(string='P.IVA Cliente', readonly=True)
	partner_city = fields.Char(string='Città Cliente', readonly=True)

	# Date
	date_order = fields.Datetime(string='Data Ordine', readonly=True)
	create_date = fields.Datetime(string='Data Creazione', readonly=True)
	sync_date = fields.Datetime(string='Data Sincronizzazione', readonly=True)

	# Stati
	state = fields.Selection([
		('draft', 'Bozza'),
		('sent', 'Inviato'),
		('sale', 'Confermato'),
		('done', 'Completato'),
		('cancel', 'Annullato')
	], string='Stato Ordine', readonly=True)

	sync_status = fields.Selection([
		('pending', 'In Attesa'),
		('syncing', 'Sincronizzazione'),
		('synced', 'Sincronizzato'),
		('failed', 'Errore')
	], string='Stato Sincronizzazione', readonly=True)

	# Importi
	amount_untaxed = fields.Float(string='Imponibile', readonly=True)
	amount_tax = fields.Float(string='Imposte', readonly=True)
	amount_total = fields.Float(string='Totale', readonly=True)
	currency_id = fields.Many2one('res.currency', string='Valuta', readonly=True)

	# Contatori
	line_count = fields.Integer(string='Righe Ordine', readonly=True)
	product_qty = fields.Float(string='Quantità Totale', readonly=True)

	# Tempo di elaborazione
	creation_duration = fields.Float(string='Durata Creazione (min)', readonly=True,
									 help='Tempo dall\'inizio sessione alla creazione ordine')
	sync_duration = fields.Float(string='Durata Sync (min)', readonly=True,
								 help='Tempo dalla creazione alla sincronizzazione')

	# Classificazioni
	order_type = fields.Selection([
		('standard', 'Standard'),
		('express', 'Urgente'),
		('sample', 'Campione')
	], string='Tipo Ordine', readonly=True)

	is_offline = fields.Boolean(string='Creato Offline', readonly=True)
	has_discount = fields.Boolean(string='Con Sconti', readonly=True)

	# Raggruppamenti temporali
	year = fields.Char(string='Anno', readonly=True)
	month = fields.Char(string='Mese', readonly=True)
	week = fields.Char(string='Settimana', readonly=True)
	day = fields.Char(string='Giorno', readonly=True)
	hour = fields.Integer(string='Ora', readonly=True)

	def _query(self):
		"""Query SQL per vista report"""
		return """
            SELECT
                so.id,
                so.id as order_id,
                so.name as order_name,
                COALESCE(so.client_order_ref, '') as local_name,

                -- Agente (usando partner_id dal res_users)
                so.user_id as agent_id,
                COALESCE(up.name, 'N/A') as agent_name,
                COALESCE(u.agent_code, '') as agent_code,

                -- Cliente
                so.partner_id,
                COALESCE(rp.name, 'N/A') as partner_name,
                COALESCE(rp.vat, '') as partner_vat,
                COALESCE(rp.city, '') as partner_city,

                -- Date
                so.date_order,
                so.create_date,
                COALESCE(so.sync_at, so.write_date) as sync_date,

                -- Stati
                so.state,
                CASE 
                    WHEN COALESCE(so.synced_to_odoo, true) = true THEN 'synced'
                    WHEN COALESCE(so.is_offline_order, false) = true AND COALESCE(so.synced_to_odoo, true) = false THEN 'pending'
                    ELSE 'synced'
                END as sync_status,

                -- Importi
                so.amount_untaxed,
                so.amount_tax,
                so.amount_total,
                so.currency_id,

                -- Contatori
                (SELECT COUNT(*) FROM sale_order_line sol WHERE sol.order_id = so.id) as line_count,
                (SELECT COALESCE(SUM(sol.product_uom_qty), 0) FROM sale_order_line sol WHERE sol.order_id = so.id) as product_qty,

                -- Durate (in minuti) - usando campi disponibili
                CASE 
                    WHEN rs.start_at IS NOT NULL THEN 
                        EXTRACT(EPOCH FROM (so.create_date - rs.start_at)) / 60.0
                    ELSE 0.0
                END as creation_duration,

                CASE 
                    WHEN so.sync_at IS NOT NULL THEN 
                        EXTRACT(EPOCH FROM (so.sync_at - so.create_date)) / 60.0
                    ELSE 0.0
                END as sync_duration,

                -- Classificazioni
                CASE 
                    WHEN COALESCE(so.note, '') ILIKE '%urgente%' OR COALESCE(so.note, '') ILIKE '%express%' THEN 'express'
                    WHEN COALESCE(so.note, '') ILIKE '%campione%' OR COALESCE(so.note, '') ILIKE '%sample%' THEN 'sample'
                    ELSE 'standard'
                END as order_type,

                COALESCE(so.is_offline_order, false) as is_offline,

                CASE 
                    WHEN EXISTS(SELECT 1 FROM sale_order_line sol WHERE sol.order_id = so.id AND sol.discount > 0) 
                    THEN true ELSE false 
                END as has_discount,

                -- Raggruppamenti temporali
                EXTRACT(YEAR FROM so.create_date)::text as year,
                TO_CHAR(so.create_date, 'YYYY-MM') as month,
                TO_CHAR(so.create_date, 'YYYY-WW') as week,
                TO_CHAR(so.create_date, 'YYYY-MM-DD') as day,
                EXTRACT(HOUR FROM so.create_date) as hour

            FROM sale_order so
            LEFT JOIN res_users u ON u.id = so.user_id
            LEFT JOIN res_partner up ON up.id = u.partner_id
            LEFT JOIN res_partner rp ON rp.id = so.partner_id
            LEFT JOIN raccolta_session rs ON rs.id = so.raccolta_session_id
            WHERE COALESCE(so.is_offline_order, false) = true OR so.raccolta_session_id IS NOT NULL
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
	def read_group(self, domain, fields, groupby, offset=0, limit=None, orderby=False, lazy=True):
		"""Override per calcoli aggregati personalizzati"""
		# Aggiungi calcoli per medie e percentuali
		res = super().read_group(domain, fields, groupby, offset, limit, orderby, lazy)

		for group in res:
			if '__count' in group:
				# Calcola statistiche aggiuntive
				count = group['__count']

				# Tempo medio elaborazione
				if 'creation_duration' in fields:
					avg_creation = self._calculate_avg_duration(domain, groupby, group, 'creation_duration')
					group['avg_creation_duration'] = avg_creation

				# Valore medio ordine
				if 'amount_total' in fields and count > 0:
					total = group.get('amount_total', 0)
					group['avg_order_value'] = total / count if count else 0

		return res

	def _calculate_avg_duration(self, domain, groupby, group, duration_field):
		"""Calcola durata media per gruppo"""
		# Costruisce dominio specifico per il gruppo
		group_domain = domain[:]
		for field in groupby:
			if field in group and group[field]:
				if isinstance(group[field], tuple):
					group_domain.append((field, '=', group[field][0]))
				else:
					group_domain.append((field, '=', group[field]))

		records = self.search(group_domain)
		durations = [r[duration_field] for r in records if r[duration_field]]

		return sum(durations) / len(durations) if durations else 0.0