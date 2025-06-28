# -*- coding: utf-8 -*-

from odoo import models, fields, api, tools
from datetime import datetime, timedelta


class AgentPerformance(models.Model):
	_name = 'raccolta.agent.performance'
	_description = 'Performance Agenti Raccolta'
	_auto = False
	_rec_name = 'agent_name'

	# Agente
	agent_id = fields.Many2one('res.users', string='Agente', readonly=True)
	agent_name = fields.Char(string='Nome Agente', readonly=True)
	agent_code = fields.Char(string='Codice Agente', readonly=True)

	# Periodo
	period_start = fields.Date(string='Inizio Periodo', readonly=True)
	period_end = fields.Date(string='Fine Periodo', readonly=True)
	period_type = fields.Selection([
		('day', 'Giornaliero'),
		('week', 'Settimanale'),
		('month', 'Mensile'),
		('year', 'Annuale')
	], string='Tipo Periodo', readonly=True)

	# Contatori ordini
	orders_count = fields.Integer(string='Ordini Totali', readonly=True)
	orders_confirmed = fields.Integer(string='Ordini Confermati', readonly=True)
	orders_cancelled = fields.Integer(string='Ordini Annullati', readonly=True)
	orders_draft = fields.Integer(string='Ordini Bozza', readonly=True)

	# Statistiche temporali
	avg_orders_per_day = fields.Float(string='Ordini/Giorno', readonly=True)
	avg_order_creation_time = fields.Float(string='Tempo Medio Creazione (min)', readonly=True)
	total_work_hours = fields.Float(string='Ore Lavorate', readonly=True)

	# Importi
	total_amount = fields.Float(string='Fatturato Totale', readonly=True)
	avg_order_amount = fields.Float(string='Valore Medio Ordine', readonly=True)
	max_order_amount = fields.Float(string='Ordine Massimo', readonly=True)
	min_order_amount = fields.Float(string='Ordine Minimo', readonly=True)

	# Clienti
	clients_count = fields.Integer(string='Clienti Unici', readonly=True)
	new_clients_count = fields.Integer(string='Nuovi Clienti', readonly=True)
	avg_orders_per_client = fields.Float(string='Ordini/Cliente', readonly=True)

	# Prodotti
	products_count = fields.Integer(string='Prodotti Venduti', readonly=True)
	total_quantity = fields.Float(string='Quantità Totale', readonly=True)
	avg_quantity_per_order = fields.Float(string='Quantità Media/Ordine', readonly=True)

	# Sincronizzazione
	sync_success_rate = fields.Float(string='% Sync Riuscita', readonly=True)
	sync_errors_count = fields.Integer(string='Errori Sync', readonly=True)
	avg_sync_time = fields.Float(string='Tempo Medio Sync (min)', readonly=True)

	# Qualità
	error_rate = fields.Float(string='% Errori', readonly=True)
	discount_rate = fields.Float(string='% Ordini con Sconto', readonly=True)
	return_rate = fields.Float(string='% Resi', readonly=True)

	# Efficienza
	efficiency_score = fields.Float(string='Punteggio Efficienza', readonly=True,
									help='Punteggio calcolato: ordini/ora * valore medio * qualità')
	productivity_rank = fields.Integer(string='Ranking Produttività', readonly=True)

	# Raggruppamenti temporali
	year = fields.Integer(string='Anno', readonly=True)
	month = fields.Integer(string='Mese', readonly=True)
	week = fields.Integer(string='Settimana', readonly=True)
	quarter = fields.Integer(string='Trimestre', readonly=True)

	def _query(self):
		"""Query SQL per report performance agenti"""
		return """
            WITH agent_stats AS (
                SELECT 
                    u.id as agent_id,
                    u.name as agent_name,
                    u.agent_code,

                    -- Periodo (mensile di default)
                    DATE_TRUNC('month', so.create_date)::date as period_start,
                    (DATE_TRUNC('month', so.create_date) + INTERVAL '1 month - 1 day')::date as period_end,
                    'month' as period_type,

                    -- Contatori ordini
                    COUNT(*) as orders_count,
                    COUNT(CASE WHEN so.state IN ('sale', 'done') THEN 1 END) as orders_confirmed,
                    COUNT(CASE WHEN so.state = 'cancel' THEN 1 END) as orders_cancelled,
                    COUNT(CASE WHEN so.state = 'draft' THEN 1 END) as orders_draft,

                    -- Importi
                    SUM(so.amount_total) as total_amount,
                    AVG(so.amount_total) as avg_order_amount,
                    MAX(so.amount_total) as max_order_amount,
                    MIN(so.amount_total) as min_order_amount,

                    -- Clienti
                    COUNT(DISTINCT so.partner_id) as clients_count,
                    COUNT(DISTINCT CASE 
                        WHEN rp.create_date >= DATE_TRUNC('month', so.create_date) 
                        THEN so.partner_id 
                    END) as new_clients_count,

                    -- Prodotti e quantità
                    COUNT(DISTINCT sol.product_id) as products_count,
                    SUM(sol.product_uom_qty) as total_quantity,

                    -- Sincronizzazione
                    COUNT(CASE WHEN so.sync_status = 'synced' THEN 1 END)::float / 
                    NULLIF(COUNT(*), 0) * 100 as sync_success_rate,
                    COUNT(CASE WHEN so.sync_status = 'failed' THEN 1 END) as sync_errors_count,

                    -- Tempi
                    AVG(EXTRACT(EPOCH FROM (
                        COALESCE(so.sync_date, NOW()) - so.create_date
                    )) / 60.0) as avg_sync_time,

                    AVG(EXTRACT(EPOCH FROM (
                        so.create_date - COALESCE(rs.start_date, so.create_date)
                    )) / 60.0) as avg_order_creation_time,

                    -- Sessioni e ore lavorate
                    SUM(EXTRACT(EPOCH FROM (
                        COALESCE(rs.end_date, rs.start_date + INTERVAL '8 hours') - rs.start_date
                    )) / 3600.0) as total_work_hours,

                    -- Qualità
                    COUNT(CASE WHEN sol.discount > 0 THEN so.id END)::float / 
                    NULLIF(COUNT(DISTINCT so.id), 0) * 100 as discount_rate,

                    -- Raggruppamenti temporali
                    EXTRACT(YEAR FROM so.create_date) as year,
                    EXTRACT(MONTH FROM so.create_date) as month,
                    EXTRACT(WEEK FROM so.create_date) as week,
                    EXTRACT(QUARTER FROM so.create_date) as quarter

                FROM res_users u
                LEFT JOIN sale_order so ON so.user_id = u.id AND so.is_offline_order = true
                LEFT JOIN sale_order_line sol ON sol.order_id = so.id
                LEFT JOIN res_partner rp ON rp.id = so.partner_id
                LEFT JOIN raccolta_session rs ON rs.user_id = u.id 
                    AND rs.start_date::date = so.create_date::date

                WHERE u.is_raccolta_agent = true
                    AND so.id IS NOT NULL

                GROUP BY 
                    u.id, u.name, u.agent_code,
                    DATE_TRUNC('month', so.create_date),
                    EXTRACT(YEAR FROM so.create_date),
                    EXTRACT(MONTH FROM so.create_date),
                    EXTRACT(WEEK FROM so.create_date),
                    EXTRACT(QUARTER FROM so.create_date)
            ),

            performance_calc AS (
                SELECT *,
                    -- Calcoli derivati
                    CASE 
                        WHEN total_work_hours > 0 THEN orders_count / total_work_hours
                        ELSE 0 
                    END as orders_per_hour,

                    CASE 
                        WHEN clients_count > 0 THEN orders_count::float / clients_count
                        ELSE 0 
                    END as avg_orders_per_client,

                    CASE 
                        WHEN orders_count > 0 THEN total_quantity / orders_count
                        ELSE 0 
                    END as avg_quantity_per_order,

                    -- Calcola giorni lavorativi nel periodo
                    EXTRACT(DAYS FROM (period_end - period_start + 1)) as period_days

                FROM agent_stats
            ),

            final_calc AS (
                SELECT *,
                    -- Ordini per giorno
                    CASE 
                        WHEN period_days > 0 THEN orders_count::float / period_days
                        ELSE 0 
                    END as avg_orders_per_day,

                    -- Tasso errori (ordini annullati / totali)
                    CASE 
                        WHEN orders_count > 0 THEN orders_cancelled::float / orders_count * 100
                        ELSE 0 
                    END as error_rate,

                    -- Punteggio efficienza (formula personalizzabile)
                    CASE 
                        WHEN total_work_hours > 0 AND orders_count > 0 THEN
                            (orders_count / total_work_hours) * 
                            (avg_order_amount / 100) * 
                            (1 - LEAST(orders_cancelled::float / orders_count, 0.5))
                        ELSE 0 
                    END as efficiency_score

                FROM performance_calc
            )

            SELECT 
                ROW_NUMBER() OVER (ORDER BY agent_id, period_start) as id,
                agent_id,
                agent_name,
                agent_code,
                period_start,
                period_end,
                period_type,
                orders_count,
                orders_confirmed,
                orders_cancelled,
                orders_draft,
                avg_orders_per_day,
                avg_order_creation_time,
                total_work_hours,
                total_amount,
                avg_order_amount,
                max_order_amount,
                min_order_amount,
                clients_count,
                new_clients_count,
                avg_orders_per_client,
                products_count,
                total_quantity,
                avg_quantity_per_order,
                sync_success_rate,
                sync_errors_count,
                avg_sync_time,
                error_rate,
                discount_rate,
                0.0 as return_rate,  -- Placeholder per futuri calcoli resi
                efficiency_score,
                ROW_NUMBER() OVER (
                    PARTITION BY period_start 
                    ORDER BY efficiency_score DESC
                ) as productivity_rank,
                year,
                month,
                week,
                quarter

            FROM final_calc
            ORDER BY period_start DESC, efficiency_score DESC
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
	def get_top_performers(self, period='month', limit=10):
		"""Restituisce top performers per periodo"""
		domain = []
		if period:
			domain.append(('period_type', '=', period))

		# Prendi ultimo periodo disponibile
		latest_period = self.search(domain, order='period_start desc', limit=1)
		if latest_period:
			domain.append(('period_start', '=', latest_period.period_start))

		return self.search(domain, order='efficiency_score desc', limit=limit)

	@api.model
	def get_agent_trend(self, agent_id, months=6):
		"""Restituisce trend performance agente"""
		start_date = datetime.now() - timedelta(days=months * 30)

		return self.search([
			('agent_id', '=', agent_id),
			('period_start', '>=', start_date.date()),
			('period_type', '=', 'month')
		], order='period_start')

	@api.model
	def calculate_team_stats(self, period_start=None, period_end=None):
		"""Calcola statistiche team"""
		domain = []
		if period_start:
			domain.append(('period_start', '>=', period_start))
		if period_end:
			domain.append(('period_end', '<=', period_end))

		records = self.search(domain)

		if not records:
			return {}

		return {
			'total_agents': len(records.mapped('agent_id')),
			'total_orders': sum(records.mapped('orders_count')),
			'total_amount': sum(records.mapped('total_amount')),
			'avg_efficiency': sum(records.mapped('efficiency_score')) / len(records),
			'avg_sync_rate': sum(records.mapped('sync_success_rate')) / len(records),
			'top_performer': records.sorted('efficiency_score', reverse=True)[0] if records else None
		}

	def action_view_agent_details(self):
		"""Azione per vedere dettagli agente"""
		self.ensure_one()

		return {
			'type': 'ir.actions.act_window',
			'name': f'Dettagli {self.agent_name}',
			'res_model': 'sale.order',
			'view_mode': 'tree,form',
			'domain': [
				('user_id', '=', self.agent_id.id),
				('create_date', '>=', self.period_start),
				('create_date', '<=', self.period_end),
				('is_offline_order', '=', True)
			],
			'context': {'search_default_group_by_state': 1}
		}

	def action_view_agent_trend(self):
		"""Azione per vedere trend agente"""
		self.ensure_one()

		return {
			'type': 'ir.actions.act_window',
			'name': f'Trend {self.agent_name}',
			'res_model': 'raccolta.agent.performance',
			'view_mode': 'graph,tree',
			'domain': [('agent_id', '=', self.agent_id.id)],
			'context': {
				'search_default_group_by_month': 1,
				'graph_measure': 'efficiency_score'
			}
		}
