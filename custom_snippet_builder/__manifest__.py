{
    'name': 'Custom Snippet Builder',
    'version': '1.0',
    'category': 'Website',
    'summary': 'Create and insert custom HTML/CSS/JS snippets',
    'depends': ['website'],
    'data': [
        'security/ir.model.access.csv',
        'views/custom_snippet_views.xml',
        'templates/snippet_templates.xml',
        'data/snippet_template_data.xml'
    ],
    'assets': {
        'web.assets_frontend': [
            'custom_snippet_builder/static/src/js/frontend_snippet_loader.js',
        ],
    },
    'installable': True,
    'application': False,
}