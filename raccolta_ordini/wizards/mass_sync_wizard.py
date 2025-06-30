# -*- coding: utf-8 -*-

import logging
import base64
from datetime import datetime, timedelta
from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class MassSyncWizard(models.TransientModel):
    """Wizard per sincronizzazione batch ordini offline"""
    _name = 'raccolta.mass.sync.wizard'
    _description = 'Sincronizzazione Batch Ordini Raccolta'

    # === CONFIGURAZIONE SYNC ===
    sync_mode = fields.Selection([
        ('all_pending', 'Tutti gli ordini pendenti'),
        ('by_agent', 'Per agente specifico'),
        ('by_session', 'Per sessione specifica'),
        ('by_date_range', 'Per intervallo date'),
        ('manual_selection', 'Selezione manuale'),
    ], string='Modalità Sincronizzazione',
       default='all_pending',
       required=True,
       help='Modalità di selezione ordini da sincronizzare')

    # === FILTRI ===
    agent_id = fields.Many2one(
        'res.users',
        string='Agente',
        domain=[('is_raccolta_agent', '=', True)],
        help='Agente per cui sincronizzare gli ordini'
    )

    session_id = fields.Many2one(
        'raccolta.session',
        string='Sessione',
        help='Sessione specifica da sincronizzare'
    )

    date_from = fields.Datetime(
        string='Data da',
        help='Data inizio per filtro per date'
    )

    date_to = fields.Datetime(
        string='Data a',
        default=fields.Datetime.now,
        help='Data fine per filtro per date'
    )

    order_ids = fields.Many2many(
        'sale.order',
        string='Ordini Selezionati',
        domain=[('is_offline_order', '=', True), ('synced_to_odoo', '=', False)],
        help='Ordini selezionati manualmente per sincronizzazione'
    )

    # === OPZIONI ===
    sync_pickings = fields.Boolean(
        string='Sincronizza Picking',
        default=True,
        help='Sincronizza anche i picking collegati'
    )

    sync_ddts = fields.Boolean(
        string='Sincronizza DDT',
        default=True,
        help='Sincronizza anche i DDT collegati'
    )

    auto_confirm_orders = fields.Boolean(
        string='Conferma Ordini Automaticamente',
        default=False,
        help='Conferma automaticamente gli ordini dopo la sincronizzazione'
    )

    auto_validate_pickings = fields.Boolean(
        string='Valida Picking Automaticamente',
        default=False,
        help='Valida automaticamente i picking dopo la sincronizzazione'
    )

    ignore_errors = fields.Boolean(
        string='Ignora Errori',
        default=False,
        help='Continua la sincronizzazione anche in caso di errori'
    )

    # === RISULTATI ===
    state = fields.Selection([
        ('draft', 'Bozza'),
        ('running', 'In Esecuzione'),
        ('done', 'Completato'),
        ('error', 'Errore'),
    ], string='Stato', default='draft')

    result_log = fields.Text(
        string='Log Risultati',
        readonly=True,
        help='Log dettagliato dell\'operazione di sincronizzazione'
    )

    orders_to_sync_count = fields.Integer(
        string='Ordini da Sincronizzare',
        compute='_compute_orders_to_sync',
        help='Numero di ordini che verranno sincronizzati'
    )

    orders_synced_count = fields.Integer(
        string='Ordini Sincronizzati',
        readonly=True,
        help='Numero di ordini sincronizzati con successo'
    )

    orders_error_count = fields.Integer(
        string='Ordini con Errori',
        readonly=True,
        help='Numero di ordini con errori di sincronizzazione'
    )

    # === COMPUTED FIELDS ===
    @api.depends('sync_mode', 'agent_id', 'session_id', 'date_from', 'date_to', 'order_ids')
    def _compute_orders_to_sync(self):
        """Calcola ordini da sincronizzare in base ai filtri"""
        for wizard in self:
            orders = wizard._get_orders_to_sync()
            wizard.orders_to_sync_count = len(orders)

    # === ONCHANGE ===
    @api.onchange('sync_mode')
    def _onchange_sync_mode(self):
        """Reset campi quando cambia modalità"""
        if self.sync_mode != 'by_agent':
            self.agent_id = False
        if self.sync_mode != 'by_session':
            self.session_id = False
        if self.sync_mode != 'by_date_range':
            self.date_from = False
            self.date_to = fields.Datetime.now()
        if self.sync_mode != 'manual_selection':
            self.order_ids = False

    @api.onchange('agent_id')
    def _onchange_agent_id(self):
        """Aggiorna dominio sessioni quando cambia agente"""
        if self.agent_id:
            return {
                'domain': {
                    'session_id': [('user_id', '=', self.agent_id.id)]
                }
            }
        else:
            return {
                'domain': {
                    'session_id': []
                }
            }

    # === BUSINESS METHODS ===
    def _get_orders_to_sync(self):
        """Ottiene ordini da sincronizzare in base ai filtri"""
        self.ensure_one()

        base_domain = [
            ('is_offline_order', '=', True),
            ('synced_to_odoo', '=', False)
        ]

        if self.sync_mode == 'all_pending':
            # Tutti gli ordini pendenti
            domain = base_domain
            
        elif self.sync_mode == 'by_agent':
            # Per agente specifico
            if not self.agent_id:
                return self.env['sale.order']
            domain = base_domain + [
                ('raccolta_session_id.user_id', '=', self.agent_id.id)
            ]
            
        elif self.sync_mode == 'by_session':
            # Per sessione specifica
            if not self.session_id:
                return self.env['sale.order']
            domain = base_domain + [
                ('raccolta_session_id', '=', self.session_id.id)
            ]
            
        elif self.sync_mode == 'by_date_range':
            # Per intervallo date
            if not self.date_from or not self.date_to:
                return self.env['sale.order']
            domain = base_domain + [
                ('offline_created_at', '>=', self.date_from),
                ('offline_created_at', '<=', self.date_to)
            ]
            
        elif self.sync_mode == 'manual_selection':
            # Selezione manuale
            return self.order_ids
            
        else:
            return self.env['sale.order']

        return self.env['sale.order'].search(domain)

    def action_preview_orders(self):
        """Anteprima ordini che verranno sincronizzati"""
        self.ensure_one()
        
        orders = self._get_orders_to_sync()
        
        if not orders:
            raise UserError(_('Nessun ordine trovato con i filtri specificati'))
        
        return {
            'type': 'ir.actions.act_window',
            'name': _('Ordini da Sincronizzare'),
            'res_model': 'sale.order',
            'view_mode': 'tree,form',
            'domain': [('id', 'in', orders.ids)],
            'context': {'search_default_group_by_agent': 1},
            'target': 'new',
        }

    def action_start_sync(self):
        """Avvia sincronizzazione batch"""
        self.ensure_one()
        
        orders = self._get_orders_to_sync()
        
        if not orders:
            raise UserError(_('Nessun ordine da sincronizzare trovato'))
        
        # Cambia stato
        self.write({
            'state': 'running',
            'result_log': f'Avvio sincronizzazione di {len(orders)} ordini...\n'
        })
        
        # Avvia sincronizzazione
        try:
            results = self._execute_mass_sync(orders)
            
            # Aggiorna risultati
            self.write({
                'state': 'done',
                'orders_synced_count': results['synced_count'],
                'orders_error_count': results['error_count'],
                'result_log': self.result_log + '\n' + results['log']
            })
            
            # Mostra risultati
            return self._show_sync_results(results)
            
        except Exception as e:
            error_msg = f'Errore durante sincronizzazione: {str(e)}'
            _logger.error(error_msg)
            
            self.write({
                'state': 'error',
                'result_log': self.result_log + '\n' + error_msg
            })
            
            raise UserError(error_msg)

    def _execute_mass_sync(self, orders):
        """Esegue sincronizzazione batch"""
        self.ensure_one()
        
        synced_count = 0
        error_count = 0
        log_lines = []
        
        total_orders = len(orders)
        log_lines.append(f'=== SINCRONIZZAZIONE BATCH ===')
        log_lines.append(f'Totale ordini da sincronizzare: {total_orders}')
        log_lines.append(f'Inizio: {datetime.now().strftime("%d/%m/%Y %H:%M:%S")}')
        log_lines.append('')
        
        for i, order in enumerate(orders, 1):
            try:
                log_lines.append(f'[{i}/{total_orders}] Sincronizzazione ordine {order.name}...')
                
                # Sincronizza ordine
                order.sync_to_odoo()
                
                # Conferma ordine se richiesto
                if self.auto_confirm_orders and order.state == 'draft':
                    order.action_confirm()
                    log_lines.append(f'  ✓ Ordine confermato')
                
                # Sincronizza picking se richiesto
                if self.sync_pickings and order.picking_ids:
                    for picking in order.picking_ids:
                        if not picking.synced_to_odoo:
                            picking.sync_to_odoo()
                            log_lines.append(f'  ✓ Picking {picking.name} sincronizzato')
                        
                        # Valida picking se richiesto
                        if self.auto_validate_pickings and picking.state in ['confirmed', 'assigned']:
                            picking.button_validate()
                            log_lines.append(f'  ✓ Picking {picking.name} validato')
                
                # Sincronizza DDT se richiesto
                if self.sync_ddts and order.ddt_ids:
                    for ddt in order.ddt_ids:
                        if not ddt.synced_to_odoo:
                            ddt.sync_to_odoo()
                            log_lines.append(f'  ✓ DDT {ddt.name} sincronizzato')
                
                synced_count += 1
                log_lines.append(f'  ✓ Ordine {order.name} sincronizzato con successo')
                
            except Exception as e:
                error_count += 1
                error_msg = f'  ✗ Errore ordine {order.name}: {str(e)}'
                log_lines.append(error_msg)
                _logger.error(f'Errore sincronizzazione ordine {order.name}: {str(e)}')
                
                if not self.ignore_errors:
                    # Interrompi se non si devono ignorare gli errori
                    log_lines.append('Sincronizzazione interrotta a causa di errori')
                    break
            
            # Aggiorna log ogni 10 ordini
            if i % 10 == 0:
                current_log = '\n'.join(log_lines)
                self.write({'result_log': self.result_log + current_log + '\n'})
                log_lines = []
        
        # Log finale
        log_lines.append('')
        log_lines.append(f'=== RISULTATI FINALI ===')
        log_lines.append(f'Ordini sincronizzati: {synced_count}/{total_orders}')
        log_lines.append(f'Errori: {error_count}')
        log_lines.append(f'Fine: {datetime.now().strftime("%d/%m/%Y %H:%M:%S")}')
        
        return {
            'synced_count': synced_count,
            'error_count': error_count,
            'total_count': total_orders,
            'log': '\n'.join(log_lines)
        }

    def _show_sync_results(self, results):
        """Mostra risultati sincronizzazione"""
        self.ensure_one()
        
        message_type = 'success'
        if results['error_count'] > 0:
            message_type = 'warning' if results['synced_count'] > 0 else 'danger'
        
        title = _('Sincronizzazione Completata')
        message = _(
            'Sincronizzati %(synced)d ordini su %(total)d\n'
            'Errori: %(errors)d'
        ) % {
            'synced': results['synced_count'],
            'total': results['total_count'],
            'errors': results['error_count']
        }
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': title,
                'message': message,
                'type': message_type,
                'sticky': True,
            }
        }

    def action_export_log(self):
        """Esporta log risultati"""
        self.ensure_one()
        
        if not self.result_log:
            raise UserError(_('Nessun log da esportare'))
        
        # Crea attachment con log
        attachment = self.env['ir.attachment'].create({
            'name': f'sync_log_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt',
            'type': 'binary',
            'datas': base64.b64encode(self.result_log.encode('utf-8')),
            'res_model': self._name,
            'res_id': self.id,
            'mimetype': 'text/plain'
        })
        
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'new',
        }

    @api.model
    def auto_sync_pending_orders(self):
        """Metodo per sincronizzazione automatica via cron"""
        # Trova ordini pendenti più vecchi di 1 ora
        cutoff_time = datetime.now() - timedelta(hours=1)
        
        pending_orders = self.env['sale.order'].search([
            ('is_offline_order', '=', True),
            ('synced_to_odoo', '=', False),
            ('offline_created_at', '<=', cutoff_time)
        ])
        
        if not pending_orders:
            _logger.info('Nessun ordine pendente da sincronizzare automaticamente')
            return
        
        _logger.info(f'Sincronizzazione automatica di {len(pending_orders)} ordini pendenti')
        
        # Crea wizard per sync automatica
        wizard = self.create({
            'sync_mode': 'manual_selection',
            'order_ids': [(6, 0, pending_orders.ids)],
            'ignore_errors': True,
            'auto_confirm_orders': True,
        })
        
        # Esegui sincronizzazione
        wizard.action_start_sync()
        
        return True