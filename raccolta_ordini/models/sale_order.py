# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError
import json
import base64


class SaleOrder(models.Model):
    """Estensione ordini di vendita per raccolta offline"""
    _inherit = 'sale.order'

    # === CAMPI RACCOLTA ORDINI ===
    raccolta_session_id = fields.Many2one(
        'raccolta.session',
        string='Sessione Raccolta',
        help='Sessione di raccolta in cui è stato creato l\'ordine'
    )

    agent_code = fields.Char(
        string='Codice Agente',
        related='raccolta_session_id.user_id.agent_code',
        store=True,
        help='Codice dell\'agente che ha creato l\'ordine'
    )

    is_offline_order = fields.Boolean(
        string='Ordine Offline',
        default=False,
        help='Indica se l\'ordine è stato creato offline'
    )

    synced_to_odoo = fields.Boolean(
        string='Sincronizzato',
        default=True,
        help='Indica se l\'ordine è stato sincronizzato con Odoo'
    )

    offline_created_at = fields.Datetime(
        string='Creato Offline Il',
        help='Data e ora di creazione offline'
    )

    sync_at = fields.Datetime(
        string='Sincronizzato Il',
        help='Data e ora di sincronizzazione'
    )

    # === CAMPI DDT E PICKING ===
    auto_create_picking = fields.Boolean(
        string='Crea Picking Automatico',
        default=True,
        help='Crea automaticamente il picking alla conferma'
    )

    auto_create_ddt = fields.Boolean(
        string='Crea DDT Automatico',
        default=True,
        help='Crea automaticamente il DDT alla validazione picking'
    )

    # ✅ CORRETTO: DDT tramite picking utilizzando campi standard
    @api.depends('picking_ids.delivery_note_id')
    def _compute_ddt_count(self):
        """Calcola DDT collegati tramite picking - usa campi standard"""
        for order in self:
            # Trova DDT tramite picking usando il campo standard delivery_note_id
            ddt_ids = order.picking_ids.mapped('delivery_note_id').ids
            order.ddt_count = len([x for x in ddt_ids if x])  # Rimuovi valori False

    ddt_count = fields.Integer(
        string='Numero DDT',
        compute='_compute_ddt_count',
        help='Numero di DDT collegati tramite picking'
    )

    # === CAMPI RICEVUTE ===
    receipt_printed = fields.Boolean(
        string='Ricevuta Stampata',
        default=False,
        help='Indica se la ricevuta è stata stampata'
    )

    receipt_format = fields.Selection([
        ('48mm', 'Formato 48mm'),
        ('80mm', 'Formato 80mm'),
        ('pdf', 'PDF Standard'),
    ], string='Formato Ricevuta', default='48mm')

    # === CAMPI FIRMA DIGITALE ===
    signature_data = fields.Text(
        string='Dati Firma',
        help='Dati della firma digitale del cliente in formato base64'
    )

    customer_signed = fields.Boolean(
        string='Cliente ha Firmato',
        default=False,
        help='Indica se il cliente ha firmato l\'ordine'
    )

    signature_timestamp = fields.Datetime(
        string='Data Firma',
        help='Data e ora della firma del cliente'
    )

    # === OVERRIDE METODI ===
    def action_confirm(self):
        """Override conferma per gestire picking automatico"""
        result = super(SaleOrder, self).action_confirm()

        # Configura picking per DDT automatico se necessario
        for order in self:
            if order.auto_create_ddt and order.picking_ids:
                order.picking_ids.write({'auto_create_ddt': True})

        return result

    def action_view_ddt(self):
        """Visualizza DDT collegati tramite picking"""
        self.ensure_one()
        
        # ✅ CORRETTO: Trova DDT tramite picking usando campo standard
        ddt_ids = self.picking_ids.mapped('delivery_note_id').ids
        ddt_ids = [x for x in ddt_ids if x]  # Rimuovi valori False
        
        if not ddt_ids:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Nessun DDT'),
                    'message': _('Nessun DDT trovato per questo ordine'),
                    'type': 'info',
                }
            }
        
        try:
            action = self.env.ref('l10n_it_delivery_note.action_stock_delivery_note_out').read()[0]
        except:
            # Fallback se riferimento non trovato
            action = {
                'type': 'ir.actions.act_window',
                'name': _('DDT'),
                'res_model': 'stock.delivery.note',
                'view_mode': 'tree,form',
            }
        
        if len(ddt_ids) > 1:
            action['domain'] = [('id', 'in', ddt_ids)]
        else:
            action['views'] = [(False, 'form')]
            action['res_id'] = ddt_ids[0]
        
        return action

    def print_receipt(self, format='48mm', include_signature=False):
        """Stampa ricevuta ordine"""
        self.ensure_one()

        # Prepara dati per report
        report_data = self._prepare_receipt_data(format, include_signature)

        # Seleziona report in base al formato
        if format == '48mm':
            report_name = 'raccolta_ordini.report_order_receipt_48mm'
        elif format == '80mm':
            report_name = 'raccolta_ordini.report_order_receipt_80mm'
        else:
            report_name = 'raccolta_ordini.report_order_pdf'

        # Marca ricevuta come stampata
        self.write({
            'receipt_printed': True,
            'receipt_format': format
        })

        return self.env.ref(report_name).report_action(self, data=report_data)

    def _prepare_receipt_data(self, format='48mm', include_signature=False):
        """Prepara dati per ricevuta"""
        self.ensure_one()

        # Dati azienda
        company_data = {
            'name': self.company_id.name,
            'vat': self.company_id.vat or '',
            'street': self.company_id.street or '',
            'city': self.company_id.city or '',
            'zip': self.company_id.zip or '',
            'phone': self.company_id.phone or '',
            'email': self.company_id.email or '',
        }

        # Dati cliente
        client_data = {
            'name': self.partner_id.name,
            'street': self.partner_id.street or '',
            'city': self.partner_id.city or '',
            'zip': self.partner_id.zip or '',
            'vat': self.partner_id.vat or '',
            'phone': self.partner_id.phone or '',
        }

        # Dati ordine
        order_data = {
            'name': self.name,
            'date_order': self.date_order,
            'state': self.state,
            'amount_total': self.amount_total,
            'amount_tax': self.amount_tax,
            'amount_untaxed': self.amount_untaxed,
            'lines': [
                {
                    'product_name': line.product_id.name,
                    'product_code': line.product_id.default_code or '',
                    'product_uom_qty': line.product_uom_qty,
                    'product_uom': line.product_uom.name,
                    'price_unit': line.price_unit,
                    'price_subtotal': line.price_subtotal,
                    'note': getattr(line, 'note', '') or '',
                }
                for line in self.order_line
            ]
        }

        # Dati firma se inclusa
        signature_data = {}
        if include_signature and self.signature_data:
            try:
                signature_data = {
                    'has_signature': True,
                    'signature_image': self.signature_data,
                    'signature_timestamp': self.signature_timestamp,
                }
            except:
                signature_data = {'has_signature': False}

        return {
            'company': company_data,
            'client': client_data,
            'order': order_data,
            'signature': signature_data,
            'format': format,
            'print_datetime': fields.Datetime.now(),
        }

    def sync_to_odoo(self):
        """Sincronizza ordine offline con Odoo"""
        self.ensure_one()
        
        if self.synced_to_odoo:
            return True
        
        # Logica di sincronizzazione
        try:
            # Aggiorna stato
            self.write({
                'synced_to_odoo': True,
                'sync_at': fields.Datetime.now()
            })
            
            return True
        except Exception as e:
            raise UserError(_('Errore durante la sincronizzazione: %s') % str(e))

    # === BUSINESS METHODS ===
    @api.model
    def create_offline_order(self, order_data):
        """Crea ordine da dati offline"""
        try:
            # Marca come ordine offline
            order_data.update({
                'is_offline_order': True,
                'synced_to_odoo': False,
                'offline_created_at': fields.Datetime.now()
            })

            order = self.create(order_data)
            
            return {
                'id': order.id,
                'name': order.name,
                'success': True
            }

        except Exception as e:
            _logger.error(f"Errore creazione ordine offline: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }