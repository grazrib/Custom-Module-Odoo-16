{
    "name": "Point Of Sale Gift Card Tracking",
    "author": "Graziano Ribichesu",
    "support": "info@grazrib.it",
    "category": "Point of Sale",
    "summary": "POS Gift Card, Gift Card Code, Gift Card Tracking, POS Gift Card Code, POS Gift Card Tracking, Gift Card Receipt",
    "description": """This module helps you to enter gift card code for tracking purposes. You can print gift card code in receipt.""",
    "version": "16.0.1",
    "depends": ["point_of_sale"],
    "application": True,
    "data": [
        'views/pos_config_views.xml',
        'views/pos_order_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale.assets': [
            'cs_pos_gift_card_tracking/static/src/css/pos.css',
            'cs_pos_gift_card_tracking/static/src/js/**/*.js',
            'cs_pos_gift_card_tracking/static/src/xml/**/*.xml',
        ],
    },
    "auto_install": False,
    "installable": True,
    "images": ["static/description/background.png", ],
    "price": 00,
    "currency": "EUR",
    "license": "OPL-1",
}