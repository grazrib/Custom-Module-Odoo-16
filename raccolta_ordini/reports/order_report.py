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
                so.local_name,

                -- Agente
                so.user_id as agent_id,
                u.name as agent_name,
                u.agent_code,

                -- Cliente
                so.partner_id,
                rp.name as partner_name,
                rp.vat as partner_vat,
                rp.city as partner_city,

                -- Date
                so.date_order,
                so.create_date,
                so.sync_date,

                -- Stati
                so.state,
                so.sync_status,

                -- Importi
                so.amount_untaxed,
                so.amount_tax,
                so.amount_total,
                so.currency_id,

                -- Contatori
                (SELECT COUNT(*) FROM sale_order_line sol WHERE sol.order_id = so.id) as line_count,
                (SELECT COALESCE(SUM(sol.product_uom_qty), 0) FROM sale_order_line sol WHERE sol.order_id = so.id) as product_qty,

                -- Durate (in minuti)
                CASE 
                    WHEN rs.start_date IS NOT NULL THEN 
                        EXTRACT(EPOCH FROM (so.create_date - rs.start_date)) / 60.0
                    ELSE NULL 
                END as creation_duration,

                CASE 
                    WHEN so.sync_date IS NOT NULL THEN 
                        EXTRACT(EPOCH FROM (so.sync_date - so.create_date)) / 60.0
                    ELSE NULL 
                END as sync_duration,

                -- Classificazioni
                CASE 
                    WHEN so.note ILIKE '%urgente%' OR so.note ILIKE '%express%' THEN 'express'
                    WHEN so.note ILIKE '%campione%' OR so.note ILIKE '%sample%' THEN 'sample'
                    ELSE 'standard'
                END as order_type,

                so.is_offline_order as is_offline,

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
            LEFT JOIN res_partner rp ON rp.id = so.partner_id
            LEFT JOIN raccolta_session rs ON rs.id = (
                SELECT session_id FROM sale_order so2 
                WHERE so2.id = so.id AND so2.session_id IS NOT NULL
            )
            WHERE so.is_offline_order = true
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
