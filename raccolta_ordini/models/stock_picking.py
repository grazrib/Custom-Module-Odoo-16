# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class StockPicking(models.Model):
    """Estensione picking per raccolta ordini"""
    _inherit = 'stock.picking'

    # === CAMPI RACCOLTA ORDINI ===
    raccolta_session_id = fields.Many2one(
        'raccolta.session',
        string='Sessione Raccolta',
        related='sale_id.raccolta_session_id',
        store=True,
        help='Sessione di raccolta dell\'ordine collegato'
    )

    agent_code = fields.Char(
        string='Codice Agente',
        related='raccolta_session_id.user_id.agent_code',
        store=True,
        help='Codice dell\'agente che ha creato il picking'
    )

    is_offline_picking = fields.Boolean(
        string='Picking Offline',
        default=False,
        help='Indica se il picking è stato creato offline'
    )

    synced_to_odoo = fields.Boolean(
        string='Sincronizzato',
        default=True,
        help='Indica se il picking è stato sincronizzato con Odoo'
    )

    offline_created_at = fields.Datetime(
        string='Creato Offline Il',
        help='Data e ora di creazione offline'
    )

    sync_at = fields.Datetime(
        string='Sincronizzato Il',
        help='Data e ora di sincronizzazione'
    )

    # === CAMPI DDT AUTOMATICO ===
    auto_create_ddt = fields.Boolean(
        string='Crea DDT Automatico',
        default=False,
        help='Crea automaticamente il DDT alla validazione'
    )

    ddt_created = fields.Boolean(
        string='DDT Creato',
        default=False,
        help='Indica se il DDT è stato creato per questo picking'
    )

    # ✅ CORRETTO: Usa il campo standard delivery_note_id del modulo DDT
    # Non creare campi personalizzati che creano conflitti
    
    # === COMPUTED FIELDS ===
    @api.depends('delivery_note_id')
    def _compute_ddt_count(self):
        """Calcola numero DDT collegati - usa campo standard"""
        for picking in self:
            picking.ddt_count = 1 if picking.delivery_note_id else 0

    ddt_count = fields.Integer(
        string='Numero DDT',
        compute='_compute_ddt_count',
        help='Numero di DDT collegati'
    )

    # === OVERRIDE METODI ===
    def button_validate(self):
        """Override validazione per creare DDT automatico"""
        result = super(StockPicking, self).button_validate()

        # Crea DDT automatico per picking raccolta ordini
        for picking in self:
            if (picking.auto_create_ddt and
                    picking.raccolta_session_id and
                    not picking.ddt_created and
                    picking.state == 'done'):
                picking._create_automatic_ddt()

        return result

    def _create_automatic_ddt(self):
        """Crea DDT automatico per il picking"""
        self.ensure_one()

        if not self.raccolta_session_id:
            return

        # Verifica che il modulo DDT sia installato
        if not self.env['ir.module.module'].search([
            ('name', '=', 'l10n_it_delivery_note'),
            ('state', '=', 'installed')
        ]):
            _logger.warning("Modulo l10n_it_delivery_note non installato - skip DDT automatico")
            return

        config = self.raccolta_session_id.config_id
        user = self.raccolta_session_id.user_id

        try:
            # Prepara dati DDT
            ddt_data = self._prepare_ddt_data(config, user)
            
            # Crea DDT utilizzando il campo standard
            ddt = self.env['stock.delivery.note'].create(ddt_data)
            
            # ✅ CORRETTO: Usa il campo standard delivery_note_id invece di ddt_ids
            self.write({
                'ddt_created': True,
                'delivery_note_id': ddt.id  # Campo standard del modulo DDT
            })

            _logger.info(f"DDT automatico creato: {ddt.name} per picking {self.name}")

        except Exception as e:
            _logger.error(f"Errore creazione DDT automatico per picking {self.name}: {str(e)}")
            # Non bloccare il flusso, solo log dell'errore

    def _prepare_ddt_data(self, config, user):
        """Prepara dati per creazione DDT"""
        self.ensure_one()

        # ✅ CORRETTO: Usa i campi standard del modulo DDT
        ddt_data = {
            'partner_sender_id': self.company_id.partner_id.id,
            'partner_id': self.partner_id.id,
            'partner_shipping_id': self.partner_id.id,  # Campo obbligatorio
            'date': fields.Date.today(),
            'type_id': config.ddt_type_id.id if config.ddt_type_id else False,
            # ✅ RIMUOVI: Non usare picking_ids nel create, il picking si collegherà automaticamente
        }

        # Configurazioni trasporto da config se disponibili
        if config.ddt_transport_reason_id:
            ddt_data['transport_reason_id'] = config.ddt_transport_reason_id.id

        if config.ddt_goods_appearance_id:
            ddt_data['goods_appearance_id'] = config.ddt_goods_appearance_id.id

        if config.ddt_transport_condition_id:
            ddt_data['transport_condition_id'] = config.ddt_transport_condition_id.id

        # Note con informazioni agente
        ddt_data['note'] = f'DDT generato automaticamente da sessione raccolta {self.raccolta_session_id.name} - Agente: {user.agent_code or user.name}'

        return ddt_data

    def action_view_ddt(self):
        """Visualizza DDT collegato"""
        self.ensure_one()
        
        if not self.delivery_note_id:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Nessun DDT'),
                    'message': _('Nessun DDT collegato a questo picking'),
                    'type': 'info',
                }
            }

        # Cerca action DDT appropriata
        try:
            action = self.env.ref('l10n_it_delivery_note.action_stock_delivery_note_out').read()[0]
        except:
            # Fallback se ref non trovata
            action = {
                'type': 'ir.actions.act_window',
                'name': _('DDT'),
                'res_model': 'stock.delivery.note',
                'view_mode': 'form',
            }

        action['views'] = [(False, 'form')]
        action['res_id'] = self.delivery_note_id.id

        return action

    def action_create_ddt_manual(self):
        """Crea DDT manualmente"""
        self.ensure_one()

        if self.delivery_note_id:
            raise UserError(_('DDT già collegato a questo picking'))

        if self.state != 'done':
            raise UserError(_('Il picking deve essere validato prima di creare il DDT'))

        # Cerca configurazione
        config = None
        if self.raccolta_session_id:
            config = self.raccolta_session_id.config_id
        else:
            # Usa configurazione default
            config = self.env['raccolta.config'].search([
                ('company_id', '=', self.company_id.id),
                ('active', '=', True)
            ], limit=1)

        if not config:
            raise UserError(_('Nessuna configurazione raccolta ordini trovata'))

        # Forza creazione DDT
        self.auto_create_ddt = True
        self._create_automatic_ddt()

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('DDT Creato'),
                'message': _('DDT creato con successo'),
                'type': 'success',
            }
        }

    # === BUSINESS METHODS ===
    @api.model
    def create_offline_picking(self, picking_data):
        """Crea picking da dati offline"""
        try:
            # Marca come picking offline
            picking_data.update({
                'is_offline_picking': True,
                'synced_to_odoo': False,
                'offline_created_at': fields.Datetime.now()
            })

            picking = self.create(picking_data)
            
            return {
                'id': picking.id,
                'name': picking.name,
                'success': True
            }

        except Exception as e:
            _logger.error(f"Errore creazione picking offline: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def get_picking_data_for_receipt(self):
        """Ottiene dati picking per ricevuta"""
        self.ensure_one()
        
        return {
            'name': self.name,
            'id': self.id,
            'state': self.state,
            'scheduled_date': self.scheduled_date,
            'date_done': self.date_done,
            'partner': {
                'name': self.partner_id.name,
                'street': self.partner_id.street or '',
                'city': self.partner_id.city or '',
                'zip': self.partner_id.zip or '',
            },
            'move_lines': [
                {
                    'product_name': move.product_id.name,
                    'product_code': move.product_id.default_code or '',
                    'quantity_done': move.quantity_done,
                    'product_uom': move.product_uom.name,
                }
                for move in self.move_lines
            ],
            'agent_code': self.agent_code or '',
            'ddt_count': self.ddt_count,
            'ddt_name': self.delivery_note_id.name if self.delivery_note_id else '',
        }