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
* Integrazione l10n_it_delivery_note
* Template ESC/POS termici
* Sistema notifiche avanzato

Requisiti:
----------
* Odoo 16.0+
* Modulo l10n_it_delivery_note installato
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
		'l10n_it_delivery_note',
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

		# Data files
		'data/raccolta_config_data.xml',
		'data/sequence_data.xml',
		'data/ddt_types_data.xml',
		'data/transport_data.xml',

		# Views
		'views/raccolta_assets.xml',
		'views/raccolta_index.xml',
		'views/raccolta_config_view.xml',
		'views/raccolta_session_view.xml',
		'views/res_users_view.xml',
		'views/sale_order_view.xml',
		'views/stock_picking_view.xml',
		'views/raccolta_menus.xml',
		'views/raccolta_reports.xml',

		# Wizards
		'wizards/mass_sync_wizard_view.xml',
		'wizards/setup_agent_wizard_view.xml',
		'wizards/export_data_wizard_view.xml',

		# Reports
		'reports/order_report_template.xml',
		'reports/agent_performance_template.xml',
	],
	'assets': {
		# Main application assets
		'raccolta_ordini.assets': [
			# External libraries
			'web/static/lib/jquery/jquery.js',
			'web/static/src/legacy/js/core/utils.js',
			'web/static/lib/bootstrap/js/bootstrap.bundle.min.js',

			# CSS files
			'raccolta_ordini/static/src/css/raccolta.css',
			'raccolta_ordini/static/src/css/receipt.css',
			'raccolta_ordini/static/src/css/mobile.css',

			# JS Core
			'raccolta_ordini/static/src/js/main.js',

			# JS Models
			'raccolta_ordini/static/src/js/models/offline_storage.js',
			'raccolta_ordini/static/src/js/models/counter_manager.js',
			'raccolta_ordini/static/src/js/models/sync_manager.js',
			'raccolta_ordini/static/src/js/models/document_creator.js',

			# JS Screens
			'raccolta_ordini/static/src/js/screens/dashboard.js',
			'raccolta_ordini/static/src/js/screens/order_screen.js',
			'raccolta_ordini/static/src/js/screens/client_screen.js',
			'raccolta_ordini/static/src/js/screens/product_screen.js',
			'raccolta_ordini/static/src/js/screens/sync_screen.js',

			# JS Receipt System
			'raccolta_ordini/static/src/js/receipt/receipt_manager.js',
			'raccolta_ordini/static/src/js/receipt/escpos_generator.js',
			'raccolta_ordini/static/src/js/receipt/pdf_generator.js',

			# JS Widgets
			'raccolta_ordini/static/src/js/widgets/barcode_scanner.js',
			'raccolta_ordini/static/src/js/widgets/signature_pad.js',
			'raccolta_ordini/static/src/js/widgets/client_selector.js',
			'raccolta_ordini/static/src/js/widgets/product_list.js',

			# JS Utils
			'raccolta_ordini/static/src/js/utils/network_detector.js',
			'raccolta_ordini/static/src/js/utils/notification.js',
			'raccolta_ordini/static/src/js/utils/helpers.js',

			# XML Templates
			'raccolta_ordini/static/src/xml/dashboard.xml',
			'raccolta_ordini/static/src/xml/order_form.xml',
			'raccolta_ordini/static/src/xml/client_list.xml',
			'raccolta_ordini/static/src/xml/product_list.xml',
			'raccolta_ordini/static/src/xml/sync_status.xml',
			'raccolta_ordini/static/src/xml/receipt_preview.xml',
		],

		# Backend integration assets
		'raccolta_ordini.assets_backend': [
			'raccolta_ordini/static/src/js/backend/raccolta_integration.js',
			'raccolta_ordini/static/src/js/backend/sync_monitor.js',
		],

		# Mobile specific assets
		'raccolta_ordini.assets_mobile': [
			'raccolta_ordini/static/src/css/mobile_enhanced.css',
			'raccolta_ordini/static/src/js/mobile/touch_handler.js',
			'raccolta_ordini/static/src/js/mobile/camera_scanner.js',
		]
	},
	'demo': [
		'demo/raccolta_demo_data.xml',
		'demo/demo_orders.xml',
		'demo/demo_agents.xml',
	],
	'images': [
		'static/description/icon.png',
		'static/description/banner.png',
		'static/description/screenshot1.png',
		'static/description/screenshot2.png',
	],
	'installable': True,
	'application': True,
	'auto_install': False,
	'post_init_hook': 'post_init_hook',
	'uninstall_hook': 'uninstall_hook',
}
