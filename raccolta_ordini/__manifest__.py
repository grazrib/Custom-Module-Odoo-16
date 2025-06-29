# -*- coding: utf-8 -*-
{
	'name': 'Raccolta Ordini Offline',
	'version': '16.0.1.0.0',
	'category': 'Sales',
	'sequence': 95,
	'summary': 'Sistema raccolta ordini offline con DDT e numerazione agente',
	'description': '''
Raccolta Ordini Offline
=======================

Sistema completo per la raccolta ordini offline con:

Funzionalità Principali:
------------------------
* Numerazione personalizzata per agente
* Integrazione automatica DDT italiani
* Sincronizzazione intelligente offline/online
* Ricevute termiche 48mm immediate
* Gestione clienti e prodotti offline
* Scanner barcode integrato
* Firma digitale su tablet

Flusso Operativo:
-----------------
1. Download dati offline (clienti, prodotti, contatori)
2. Creazione ordini con numerazione agente
3. Generazione automatica picking e DDT
4. Stampa ricevute 48mm immediate
5. Sincronizzazione batch quando online

Caratteristiche Tecniche:
-------------------------
* Pattern Point of Sale per affidabilità
* IndexedDB per storage browser
* Architettura offline-first
* Integrazione l10n_it_delivery_note_base
* Template ESC/POS termici
* Sistema notifiche avanzato

Requisiti:
----------
* Odoo 16.0+
* Modulo l10n_it_delivery_note_base installato
* Browser moderno con supporto IndexedDB
* Stampante termica 48mm (opzionale)
    ''',
	'author': 'Your Company',
	'website': 'https://www.yourcompany.com',
	'license': 'LGPL-3',
	'depends': [
		'base',
		'sale',
		'stock',
		'account',
		'l10n_it_delivery_note',  # Modulo DDT completo (corretto)
		'web',
		'portal',
		'barcodes'
	],
	'external_dependencies': {
		'python': ['qrcode', 'Pillow'],
	},
	'data': [
		# Security files - order matters!
		'security/raccolta_security.xml',
		'security/ir.model.access.csv',

		# Data files (solo esistenti)
		'data/raccolta_config_data.xml',
		'data/sequence_data.xml',

		# Views (solo esistenti)
		'views/raccolta_assets.xml',
		'views/raccolta_index.xml',
		'views/raccolta_config_view.xml',
		'views/raccolta_session_view.xml',
		'views/res_users_view.xml',
		'views/sale_order_view.xml',
		'views/stock_picking_view.xml',
		'views/raccolta_menus.xml',

		# Wizards (solo se esistenti)
		# 'wizards/mass_sync_wizard_view.xml',
		# 'wizards/setup_agent_wizard_view.xml',
		# 'wizards/export_data_wizard_view.xml',

		# Reports (solo se esistenti)
		# 'reports/order_report_template.xml',
		# 'reports/agent_performance_template.xml',
	],
	'assets': {
		# Asset bundle minimale per funzionamento base
		'web.assets_backend': [
			'raccolta_ordini/static/src/css/raccolta_backend.css',
			'raccolta_ordini/static/src/js/backend_integration.js',
		],
		'web.assets_frontend': [
			'raccolta_ordini/static/src/css/raccolta_frontend.css',
			'raccolta_ordini/static/src/js/frontend_app.js',
		],
	},
	'demo': [
		# Solo se esistenti
		# 'demo/raccolta_demo_data.xml',
	],
	'images': [
		'static/description/icon.png',
	],
	'installable': True,
	'application': True,
	'auto_install': False,
	'post_init_hook': 'post_init_hook',
	'uninstall_hook': 'uninstall_hook',

	# Configurazione price_depend per DDT
# 	'price_depend': ['l10n_it_delivery_note_base'],
}