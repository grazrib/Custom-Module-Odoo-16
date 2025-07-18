# -*- coding: utf-8 -*-

from . import models
from . import controllers  # ✅ RIATTIVATO: necessario per API offline!
from . import wizards      # ✅ RIATTIVATO: mass_sync_wizard necessario
from . import reports      # ✅ RIATTIVATO: ricevute termiche necessarie


def post_init_hook(cr, registry):
	"""Hook eseguito dopo l'installazione del modulo"""
	from odoo import api, SUPERUSER_ID

	env = api.Environment(cr, SUPERUSER_ID, {})

	# Crea configurazione di default
	_create_default_config(env)

	# Setup sequenze base per agenti esistenti
	_setup_existing_agents(env)

	# Crea tipi DDT se non esistono
	_ensure_ddt_types(env)


def uninstall_hook(cr, registry):
	"""Hook eseguito prima della disinstallazione"""
	from odoo import api, SUPERUSER_ID

	env = api.Environment(cr, SUPERUSER_ID, {})

	# Cleanup sequenze create dal modulo
	_cleanup_sequences(env)

	# Reset flag agenti
	_reset_agent_flags(env)


def _create_default_config(env):
	"""Crea configurazione di default se non esiste"""
	config_model = env['raccolta.config']

	if not config_model.search([]):
		company = env.company
		warehouse = env['stock.warehouse'].search([('company_id', '=', company.id)], limit=1)

		if warehouse:
			config_model.create({
				'name': 'Configurazione Default',
				'company_id': company.id,
				'warehouse_id': warehouse.id,
				'receipt_format': '48mm',
				'auto_create_ddt': True,
				'use_agent_numbering': True,
				'active': True
			})


def _setup_existing_agents(env):
	"""Setup sequenze per agenti già esistenti"""
	users = env['res.users'].search([('is_raccolta_agent', '=', True)])

	for user in users:
		if not user.order_sequence_id:
			user._create_user_sequences()


def _ensure_ddt_types(env):
	"""Assicura che esistano i tipi DDT necessari"""
	try:
		ddt_type_model = env['stock.delivery.note.type']
		
		# Tipo DDT per vendite
		if not ddt_type_model.search([('code', '=', 'outgoing'), ('name', 'ilike', 'Raccolta')]):
			# ✅ Usa sequenza più sicura
			sequence_ref = env.ref('l10n_it_delivery_note_base.sequence_stock_delivery_note_out', raise_if_not_found=False)
			if not sequence_ref:
				# Crea sequenza se non esiste
				sequence_ref = env['ir.sequence'].create({
					'name': 'DDT Raccolta Ordini',
					'code': 'stock.delivery.note.out',
					'prefix': 'DDT/%(year)s/',
					'suffix': '',
					'padding': 5,
					'company_id': env.company.id,
				})
			
			ddt_type_model.create({
				'name': 'DDT Raccolta Ordini - Vendita',
				'code': 'outgoing',
				'sequence_id': sequence_ref.id,
				'company_id': env.company.id,
				'print_prices': True,
				'note': 'Tipo DDT per raccolta ordini - vendite'
			})
	except Exception as e:
		# Log dell'errore ma non bloccare l'installazione
		import logging
		_logger = logging.getLogger(__name__)
		_logger.warning(f"Errore creazione tipo DDT: {e}")


def _cleanup_sequences(env):
	"""Rimuove sequenze create dal modulo"""
	sequences = env['ir.sequence'].search([
		'|', '|',
		('code', 'like', 'raccolta.order.%'),
		('code', 'like', 'raccolta.ddt.%'),
		('code', 'like', 'raccolta.picking.%')
	])
	sequences.unlink()


def _reset_agent_flags(env):
	"""Reset flag agenti"""
	users = env['res.users'].search([('is_raccolta_agent', '=', True)])
	users.write({
		'is_raccolta_agent': False,
		'agent_code': False,
		'order_sequence_id': False,
		'ddt_sequence_id': False,
		'picking_sequence_id': False
	})