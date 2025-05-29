# -*- coding: utf-8 -*-
{
    'name': 'Fatturazione Carta Docente e CarteCultura',
    'version': '1.0',
    'category': 'Accounting/Invoicing',
    'summary': 'Fatturazione elettronica per Carta Docente e CarteCultura (18App)',
    'description': """
Modulo per la generazione di fatture elettroniche in formato XML compatibile con i sistemi di Carta Docente e CarteCultura (18App).

Caratteristiche:
- Creazione di fatture elettroniche in formato XML valido per l'invio al SdI
- Gestione dei codici buono Carta Docente e CarteCultura (18App)
- Integrazione con i partner esistenti in Odoo
- Download del file XML pronto per l'invio
""",
    'author': 'Graziano Ribichesu',
    'website': 'https://www.grazrib.it',
    'depends': ['base', 'mail', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'views/fattura_carta_buono_views.xml',
    ],
    'demo': [],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}