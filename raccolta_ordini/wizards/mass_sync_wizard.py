# -*- coding: utf-8 -*-

import logging
from datetime import datetime, timedelta
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class MassSyncWizard(models.TransientModel):
	_name = 'raccolta.mass.sync.wizard'
	_description = 'Wizard Sincronizzazione Massiva'

	# Filtri selezione
	agent_ids = fields.Many2many(
		'res.users',
		string='Agenti',
		domain=[('is_raccolta_agent', '=', True)],
		help='Lasciare vuoto per tutti gli agenti'
	)

	date_from = fields.Datetime(
		string='Data Da',
		default=lambda self: fields.Datetime.now() - timedelta(days=7),
		required=True
	)

	date_to = fields.Datetime(
		string='Data A',
		default=fields.Datetime.now,
		required=True
	)

	# Tipi di sincronizzazione
	sync_orders = fields.Boolean(
		string='Sincronizza Ordini',
		default=True,
		help='Sincronizza ordini di vendita'
	)

	sync_pickings = fields.Boolean(
		string='Sincronizza Picking',
		default=True,
		help='Sincronizza documenti di trasporto'
	)

	sync_counters = fields.Boolean(
		string='Aggiorna Contatori',
		default=True,
		help='Aggiorna contatori numerazione'
	)

	# Opzioni avanzate
	force_sync = fields.Boolean(
		string='Forza Sincronizzazione',
		default=False,
		help='Forza sincronizzazione anche se già sincronizzato'
	)

	validate_documents = fields.Boolean(
		string='Valida Documenti',
		default=True,
		help='Valida automaticamente i documenti sincronizzati'
	)

	# Risultati
	result_summary = fields.Text(
		string='Risultato',
		readonly=True
	)

	@api.constrains('date_from', 'date_to')
	def _check_dates(self):
		"""Valida date"""
		for wizard in self:
			if wizard.date_from >= wizard.date_to:
				raise ValidationError(_('La data di inizio deve essere precedente alla data di fine'))

	def action_sync(self):
		"""Esegue sincronizzazione massiva"""
		self.ensure_one()

		if not any([self.sync_orders, self.sync_pickings, self.sync_counters]):
			raise UserError(_('Selezionare almeno un tipo di sincronizzazione'))

		# Agenti da sincronizzare
		agents = self.agent_ids
		if not agents:
			agents = self.env['res.users'].search([('is_raccolta_agent', '=', True)])

		if not agents:
			raise UserError(_('Nessun agente trovato'))

		results = {
			'agents_processed': 0,
			'orders_synced': 0,
			'pickings_synced': 0,
			'counters_updated': 0,
			'errors': []
		}

		for agent in agents:
			try:
				agent_results = self._sync_agent(agent)
				results['agents_processed'] += 1
				results['orders_synced'] += agent_results.get('orders', 0)
				results['pickings_synced'] += agent_results.get('pickings', 0)
				results['counters_updated'] += agent_results.get('counters', 0)

			except Exception as e:
				error_msg = f"Errore agente {agent.name}: {str(e)}"
				results['errors'].append(error_msg)
				_logger.error(error_msg)

		# Aggiorna risultati
		self._update_results(results)

		return {
			'type': 'ir.actions.act_window',
			'name': _('Risultati Sincronizzazione'),
			'res_model': 'raccolta.mass.sync.wizard',
			'res_id': self.id,
			'view_mode': 'form',
			'target': 'new',
			'context': {'show_results': True}
		}

	def _sync_agent(self, agent):
		"""Sincronizza singolo agente"""
		results = {'orders': 0, 'pickings': 0, 'counters': 0}

		# Sincronizza ordini
		if self.sync_orders:
			orders = self._get_agent_orders(agent)
			for order in orders:
				if self._should_sync_order(order):
					self._sync_order(order)
					results['orders'] += 1

		# Sincronizza picking
		if self.sync_pickings:
			pickings = self._get_agent_pickings(agent)
			for picking in pickings:
				if self._should_sync_picking(picking):
					self._sync_picking(picking)
					results['pickings'] += 1

		# Aggiorna contatori
		if self.sync_counters:
			if self._update_agent_counters(agent):
				results['counters'] += 1

		return results

	def _get_agent_orders(self, agent):
		"""Recupera ordini agente nel periodo"""
		domain = [
			('user_id', '=', agent.id),
			('create_date', '>=', self.date_from),
			('create_date', '<=', self.date_to),
			('is_offline_order', '=', True)
		]

		if not self.force_sync:
			domain.append(('sync_status', '!=', 'synced'))

		return self.env['sale.order'].search(domain)

	def _get_agent_pickings(self, agent):
		"""Recupera picking agente nel periodo"""
		domain = [
			('user_id', '=', agent.id),
			('create_date', '>=', self.date_from),
			('create_date', '<=', self.date_to),
			('is_offline_picking', '=', True)
		]

		if not self.force_sync:
			domain.append(('sync_status', '!=', 'synced'))

		return self.env['stock.picking'].search(domain)

	def _should_sync_order(self, order):
		"""Verifica se ordine deve essere sincronizzato"""
		if self.force_sync:
			return True

		return order.sync_status in ['pending', 'failed']

	def _should_sync_picking(self, picking):
		"""Verifica se picking deve essere sincronizzato"""
		if self.force_sync:
			return True

		return picking.sync_status in ['pending', 'failed']

	def _sync_order(self, order):
		"""Sincronizza singolo ordine"""
		try:
			# Valida ordine
			if self.validate_documents:
				order.action_confirm()

			# Aggiorna stato sincronizzazione
			order.write({
				'sync_status': 'synced',
				'sync_date': fields.Datetime.now()
			})

		except Exception as e:
			order.write({
				'sync_status': 'failed',
				'sync_error': str(e)
			})
			raise

	def _sync_picking(self, picking):
		"""Sincronizza singolo picking"""
		try:
			# Valida picking se richiesto
			if self.validate_documents and picking.state == 'draft':
				picking.action_confirm()

				# Assegna quantità se disponibili
				for move in picking.move_lines:
					if move.product_uom_qty > 0:
						move.quantity_done = move.product_uom_qty

				# Valida trasferimento
				picking.button_validate()

			# Aggiorna stato sincronizzazione
			picking.write({
				'sync_status': 'synced',
				'sync_date': fields.Datetime.now()
			})

		except Exception as e:
			picking.write({
				'sync_status': 'failed',
				'sync_error': str(e)
			})
			raise

	def _update_agent_counters(self, agent):
		"""Aggiorna contatori agente"""
		try:
			counters = self.env['raccolta.counter'].search([
				('user_id', '=', agent.id)
			])

			for counter in counters:
				counter._sync_with_sequence()

			return True

		except Exception as e:
			_logger.error(f"Errore aggiornamento contatori agente {agent.name}: {str(e)}")
			return False

	def _update_results(self, results):
		"""Aggiorna risultati wizard"""
		summary = []
		summary.append(f"Agenti processati: {results['agents_processed']}")
		summary.append(f"Ordini sincronizzati: {results['orders_synced']}")
		summary.append(f"Picking sincronizzati: {results['pickings_synced']}")
		summary.append(f"Contatori aggiornati: {results['counters_updated']}")

		if results['errors']:
			summary.append("\nErrori:")
			for error in results['errors']:
				summary.append(f"- {error}")

		self.result_summary = '\n'.join(summary)

	def action_view_sync_status(self):
		"""Mostra stato sincronizzazione"""
		return {
			'type': 'ir.actions.act_window',
			'name': _('Stato Sincronizzazione'),
			'res_model': 'raccolta.sync.status',
			'view_mode': 'tree,form',
			'domain': [
				('agent_id', 'in', self.agent_ids.ids if self.agent_ids else []),
				('sync_date', '>=', self.date_from),
				('sync_date', '<=', self.date_to)
			],
			'target': 'current'
		}
