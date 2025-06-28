{
    'name': 'Rettifica Inventario Rapida',
    'version': '1.1',
    'summary': 'Modulo per la rettifica rapida dell\'inventario',
    'description': """
    Questo modulo permette di effettuare rettifiche di inventario rapide
    con un'interfaccia semplice e intuitiva, adatta per dispositivi mobili.
    Include funzionalità avanzate di ricerca prodotti e scansione dei codici a barre.
    """,
    'category': 'Inventory',
    'author': 'Graziano R.',
    'website': 'https://www.grazrib.it',
    'license': 'LGPL-3',
    'depends': ['base', 'stock', 'product', 'web'],
    'data': [
        'security/ir.model.access.csv',
        'views/inventory_adjustment_mobile_view.xml',
        'views/res_config_settings_views.xml',
        'views/menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
			'inventory_adjustment/static/src/js/inventory_adjustment_mobile_focus.js',
            'inventory_adjustment/static/src/js/inventory_adjustment_mobile.js',
            'inventory_adjustment/static/src/js/barcode_scanner.js',
            'inventory_adjustment/static/src/js/quagga.js',
            'inventory_adjustment/static/src/css/style.css',
            'inventory_adjustment/static/src/css/barcode_scanner.css',
        ],
    },
    'images': [
        'static/description/icon.png',
    ],
    'installable': True,
    'application': True,
}