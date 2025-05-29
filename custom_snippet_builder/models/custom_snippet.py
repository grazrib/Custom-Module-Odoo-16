from odoo import models, fields

class CustomSnippet(models.Model):
    _name = 'custom.snippet'
    _description = 'Custom Snippet'

    name = fields.Char(required=True)
    html_code = fields.Text(string="HTML Code")
    css_code = fields.Text(string="CSS Code")
    js_code = fields.Text(string="JS Code")
    active = fields.Boolean(default=True)
