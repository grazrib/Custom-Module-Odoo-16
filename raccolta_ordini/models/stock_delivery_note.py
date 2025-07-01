# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError


class StockDeliveryNote(models.Model):
    """Estensione DDT per raccolta ordini - SOLO CAMPI AGGIUNTIVI"""
    _inherit = 'stock.delivery.note'

    # ✅ SICURI: Solo campi aggiuntivi, nessuna modifica ai campi esistenti
    agent_code = fields.Char(
        string='Codice Agente',
        help='Codice dell\'agente che ha creato il DDT'
    )

    is_offline_ddt = fields.Boolean(
        string='DDT Offline',
        default=False,
        help='Indica se il DDT è stato creato offline'
    )

    synced_to_odoo = fields.Boolean(
        string='Sincronizzato',
        default=True,
        help='Indica se il DDT è stato sincronizzato con Odoo'
    )

    offline_created_at = fields.Datetime(
        string='Creato Offline Il',
        help='Data e ora di creazione offline'
    )

    sync_at = fields.Datetime(
        string='Sincronizzato Il',
        help='Data e ora di sincronizzazione'
    )

    raccolta_session_id = fields.Many2one(
        'raccolta.session',
        string='Sessione Raccolta',
        help='Sessione di raccolta che ha generato questo DDT'
    )

    # === CAMPI AGGIUNTIVI SICURI ===
    general_notes = fields.Text(
        string='Note Generali Raccolta',
        help='Note generali per la raccolta ordini'
    )

    internal_notes = fields.Text(
        string='Note Interne Raccolta',
        help='Note interne raccolta ordini'
    )

    signature_data = fields.Text(
        string='Dati Firma Cliente',
        help='Dati della firma digitale del cliente in formato base64'
    )

    # === BUSINESS METHODS ===
    @api.model
    def create_offline_ddt(self, ddt_data):
        """Crea DDT da dati offline"""
        try:
            validated_data = self._validate_offline_ddt_data(ddt_data)
            
            ddt = self.create(validated_data)
            
            # Marca come sincronizzato
            ddt.write({
                'synced_to_odoo': True,
                'sync_at': fields.Datetime.now()
            })
            
            return {
                'success': True,
                'ddt_id': ddt.id,
                'ddt_name': ddt.name,
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def _validate_offline_ddt_data(self, data):
        """Valida e converte dati DDT offline"""
        if 'partner_id' not in data:
            raise UserError(_('Cliente mancante nei dati DDT offline'))

        if 'partner_sender_id' not in data:
            raise UserError(_('Mittente mancante nei dati DDT offline'))

        return {
            'partner_id': data['partner_id'],
            'partner_sender_id': data['partner_sender_id'],
            'partner_shipping_id': data.get('partner_shipping_id', data['partner_id']),
            'date': data.get('date', fields.Date.today()),
            'type_id': data.get('type_id', False),
            'transport_reason_id': data.get('transport_reason_id', False),
            'goods_appearance_id': data.get('goods_appearance_id', False),
            'transport_condition_id': data.get('transport_condition_id', False),
            'carrier_id': data.get('carrier_id', False),
            'note': data.get('note', ''),
            # Campi raccolta ordini
            'is_offline_ddt': True,
            'offline_created_at': data.get('created_at', fields.Datetime.now()),
            'agent_code': data.get('agent_code', ''),
            'general_notes': data.get('general_notes', ''),
            'internal_notes': data.get('internal_notes', ''),
            'signature_data': data.get('signature_data', ''),
            'raccolta_session_id': data.get('raccolta_session_id', False),
        }

    def sync_to_odoo(self):
        """Sincronizza DDT offline con Odoo"""
        self.ensure_one()

        if self.synced_to_odoo:
            return True

        try:
            # Aggiorna stato
            self.write({
                'synced_to_odoo': True,
                'sync_at': fields.Datetime.now()
            })

            return True
        except Exception as e:
            raise UserError(_('Errore durante la sincronizzazione DDT: %s') % str(e))

    def get_ddt_data_for_receipt(self):
        """Ottiene dati DDT per ricevuta - VERSIONE COMPLETA"""
        self.ensure_one()
        
        return {
            'name': self.name,
            'id': self.id,
            'date': self.date,
            'state': self.state,
            'partner': {
                'name': self.partner_id.name,
                'street': self.partner_id.street or '',
                'city': self.partner_id.city or '',
                'zip': self.partner_id.zip or '',
                'vat': self.partner_id.vat or '',
            },
            'sender': {
                'name': self.partner_sender_id.name,
                'street': self.partner_sender_id.street or '',
                'city': self.partner_sender_id.city or '',
                'zip': self.partner_sender_id.zip or '',
                'vat': self.partner_sender_id.vat or '',
            },
            'transport_reason': self.transport_reason_id.name if self.transport_reason_id else '',
            'goods_appearance': self.goods_appearance_id.name if self.goods_appearance_id else '',
            'transport_condition': self.transport_condition_id.name if self.transport_condition_id else '',
            'carrier': self.carrier_id.name if self.carrier_id else '',
            'agent_code': self.agent_code or '',
            'general_notes': self.general_notes or '',
            'internal_notes': self.internal_notes or '',
            'volume': str(self.volume or 0),
            'gross_weight': str(self.gross_weight or 0),
            'net_weight': str(self.net_weight or 0),
            'packages': str(self.packages or 0),
            'synced': self.synced_to_odoo,
            'line_count': len(self.line_ids),
            'lines': [
                {
                    'product_name': line.product_id.name if line.product_id else '',
                    'product_code': line.product_id.default_code or '',
                    'quantity': line.product_uom_qty,
                    'uom': line.product_uom_id.name if line.product_uom_id else '',
                    'description': line.name or '',
                    'product_note': getattr(line, 'product_note', '') or '',
                }
                for line in self.line_ids
            ]
        }

    def action_view_sale_orders(self):
        """Visualizza ordini di vendita collegati tramite picking"""
        self.ensure_one()

        # ✅ USA CAMPO STANDARD picking_ids
        orders = self.env['sale.order']
        for picking in self.picking_ids:
            if picking.sale_id:
                orders |= picking.sale_id

        if not orders:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Nessun Ordine'),
                    'message': _('Nessun ordine di vendita collegato a questo DDT'),
                    'type': 'info',
                }
            }

        action = self.env.ref('sale.action_orders').read()[0]

        if len(orders) > 1:
            action['domain'] = [('id', 'in', orders.ids)]
        elif len(orders) == 1:
            action['views'] = [(self.env.ref('sale.view_order_form').id, 'form')]
            action['res_id'] = orders.id

        return action

    def action_print_receipt(self):
        """Stampa ricevuta con dati DDT"""
        self.ensure_one()

        # Trova ordine collegato per generare ricevuta completa
        order = False
        for picking in self.picking_ids:
            if picking.sale_id and picking.sale_id.raccolta_session_id:
                order = picking.sale_id
                break

        if not order:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Impossibile Stampare'),
                    'message': _('Nessun ordine raccolta collegato a questo DDT'),
                    'type': 'warning',
                }
            }

        # Usa il sistema di stampa dell'ordine
        return order.print_receipt(format='48mm', include_signature=True)


class StockDeliveryNoteLine(models.Model):
    """Estensione righe DDT per raccolta ordini - SOLO CAMPI AGGIUNTIVI"""
    _inherit = 'stock.delivery.note.line'

    # === CAMPI AGGIUNTIVI SICURI ===
    product_note = fields.Text(
        string='Note Prodotto Raccolta',
        help='Note specifiche per questo prodotto nella raccolta'
    )

    barcode_scanned = fields.Boolean(
        string='Scansionato da Barcode',
        default=False,
        help='Indica se il prodotto è stato aggiunto tramite scanner'
    )