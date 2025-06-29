/**
 * RACCOLTA ORDINI - BACKEND INTEGRATION
 * Integrazione con il backend Odoo per miglioramenti UI/UX
 */

odoo.define('raccolta_ordini.backend_integration', function (require) {
    'use strict';

    var core = require('web.core');
    var Dialog = require('web.Dialog');
    var FormController = require('web.FormController');
    var KanbanController = require('web.KanbanController');
    var ListController = require('web.ListController');
    var _t = core._t;

    console.log('Raccolta Ordini Backend Integration caricato');

    /**
     * Estensione FormController per modelli raccolta
     */
    var RaccoltaFormController = FormController.extend({
        custom_events: _.extend({}, FormController.prototype.custom_events, {
            'raccolta_action': '_onRaccoltaAction',
        }),

        /**
         * Gestisce azioni specifiche raccolta
         */
        _onRaccoltaAction: function (event) {
            var self = this;
            var action = event.data.action;
            var context = event.data.context || {};

            switch (action) {
                case 'open_raccolta_app':
                    this._openRaccoltaApp(context);
                    break;
                case 'sync_order':
                    this._syncOrder(context);
                    break;
                case 'print_receipt':
                    this._printReceipt(context);
                    break;
                default:
                    console.warn('Azione raccolta non supportata:', action);
            }
        },

        /**
         * Apre app raccolta in nuova finestra
         */
        _openRaccoltaApp: function (context) {
            var url = '/raccolta/ui';
            if (context.agent_id) {
                url += '?agent=' + context.agent_id;
            }
            window.open(url, '_blank', 'width=1200,height=800');
        },

        /**
         * Forza sincronizzazione ordine
         */
        _syncOrder: function (context) {
            var self = this;
            var orderId = context.order_id || this.model.get(this.handle).res_id;

            Dialog.confirm(this, _t('Forzare la sincronizzazione di questo ordine?'), {
                confirm_callback: function () {
                    self._rpc({
                        model: 'sale.order',
                        method: 'action_sync_order',
                        args: [orderId],
                    }).then(function (result) {
                        if (result.success) {
                            self.displayNotification({
                                type: 'success',
                                message: _t('Ordine sincronizzato con successo'),
                            });
                            self.reload();
                        } else {
                            self.displayNotification({
                                type: 'danger',
                                message: _t('Errore sincronizzazione: ') + result.error,
                            });
                        }
                    });
                },
            });
        },

        /**
         * Stampa ricevuta ordine
         */
        _printReceipt: function (context) {
            var self = this;
            var orderId = context.order_id || this.model.get(this.handle).res_id;

            this._rpc({
                model: 'sale.order',
                method: 'action_print_receipt',
                args: [orderId],
            }).then(function (result) {
                if (result.type === 'ir.actions.report') {
                    self.do_action(result);
                } else {
                    self.displayNotification({
                        type: 'success',
                        message: _t('Ricevuta stampata'),
                    });
                }
            });
        },
    });

    /**
     * Estensione KanbanController per viste raccolta
     */
    var RaccoltaKanbanController = KanbanController.extend({
        /**
         * Override per aggiungere funzionalità raccolta
         */
        _onRecordSelected: function (event) {
            this._super.apply(this, arguments);

            // Aggiungi indicatori visivi per stati raccolta
            this._updateRaccoltaIndicators();
        },

        /**
         * Aggiorna indicatori visivi raccolta
         */
        _updateRaccoltaIndicators: function () {
            var self = this;

            this.$('.o_kanban_record').each(function () {
                var $record = $(this);
                var recordData = $record.data();

                // Aggiungi classe per ordini raccolta
                if (recordData.is_raccolta_order) {
                    $record.addClass('raccolta_kanban_card');
                }

                // Aggiungi indicatori stato sync
                if (recordData.sync_status) {
                    $record.attr('data-sync-status', recordData.sync_status);
                }

                // Aggiungi indicatori stato sessione
                if (recordData.state) {
                    $record.addClass('session_' + recordData.state);
                }
            });
        },

        /**
         * Override rendering per stili raccolta
         */
        _render: function () {
            var result = this._super.apply(this, arguments);
            this._updateRaccoltaIndicators();
            return result;
        },
    });

    /**
     * Estensione ListController per liste raccolta
     */
    var RaccoltaListController = ListController.extend({
        /**
         * Override per aggiungere azioni bulk raccolta
         */
        init: function () {
            this._super.apply(this, arguments);

            // Aggiungi azioni bulk per ordini raccolta
            if (this.modelName === 'sale.order') {
                this._addRaccoltaBulkActions();
            }
        },

        /**
         * Aggiunge azioni bulk per raccolta
         */
        _addRaccoltaBulkActions: function () {
            var self = this;

            // Azione sincronizzazione massiva
            this.toolbarActions = this.toolbarActions || {};
            this.toolbarActions['sync_selected_orders'] = {
                name: _t('Sincronizza Selezionati'),
                type: 'object',
                method: 'action_bulk_sync',
                icon: 'fa-refresh',
                callback: function (records) {
                    self._bulkSyncOrders(records);
                }
            };

            // Azione stampa ricevute massive
            this.toolbarActions['print_receipts'] = {
                name: _t('Stampa Ricevute'),
                type: 'object',
                method: 'action_bulk_print_receipts',
                icon: 'fa-print',
                callback: function (records) {
                    self._bulkPrintReceipts(records);
                }
            };
        },

        /**
         * Sincronizzazione massiva ordini
         */
        _bulkSyncOrders: function (records) {
            var self = this;
            var orderIds = records.map(function (r) { return r.res_id; });

            Dialog.confirm(this, _t('Sincronizzare ') + orderIds.length + _t(' ordini selezionati?'), {
                confirm_callback: function () {
                    self._rpc({
                        model: 'sale.order',
                        method: 'action_bulk_sync',
                        args: [orderIds],
                    }).then(function (result) {
                        self.displayNotification({
                            type: 'success',
                            message: _t('Sincronizzazione completata: ') + result.synced + _t(' ordini'),
                        });
                        self.reload();
                    });
                },
            });
        },

        /**
         * Stampa ricevute massive
         */
        _bulkPrintReceipts: function (records) {
            var self = this;
            var orderIds = records.map(function (r) { return r.res_id; });

            this._rpc({
                model: 'sale.order',
                method: 'action_bulk_print_receipts',
                args: [orderIds],
            }).then(function (result) {
                if (result.type === 'ir.actions.report') {
                    self.do_action(result);
                }
            });
        },

        /**
         * Override rendering per stili raccolta
         */
        _renderView: function () {
            var result = this._super.apply(this, arguments);
            this._applyRaccoltaStyles();
            return result;
        },

        /**
         * Applica stili specifici raccolta
         */
        _applyRaccoltaStyles: function () {
            var self = this;

            // Evidenzia ordini raccolta
            this.$('.o_data_row').each(function () {
                var $row = $(this);
                var recordData = $row.data();

                if (recordData.is_raccolta_order) {
                    $row.addClass('raccolta_order_row');
                }

                if (recordData.sync_status === 'pending') {
                    $row.addClass('pending_sync');
                } else if (recordData.sync_status === 'error') {
                    $row.addClass('sync_error');
                }
            });
        },
    });

    /**
     * Widget per statistiche raccolta in tempo reale
     */
    var RaccoltaStatsWidget = core.Class.extend({
        init: function (parent, options) {
            this.parent = parent;
            this.options = options || {};
            this.refreshInterval = this.options.refreshInterval || 30000; // 30 secondi
            this.autoRefresh = this.options.autoRefresh !== false;

            this._startAutoRefresh();
        },

        /**
         * Avvia refresh automatico
         */
        _startAutoRefresh: function () {
            var self = this;

            if (this.autoRefresh) {
                this.refreshTimer = setInterval(function () {
                    self.refresh();
                }, this.refreshInterval);
            }
        },

        /**
         * Ferma refresh automatico
         */
        _stopAutoRefresh: function () {
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
        },

        /**
         * Refresh statistiche
         */
        refresh: function () {
            var self = this;

            return this.parent._rpc({
                model: 'raccolta.session',
                method: 'get_live_stats',
                args: [],
            }).then(function (stats) {
                self._updateDisplay(stats);
            });
        },

        /**
         * Aggiorna display statistiche
         */
        _updateDisplay: function (stats) {
            // Aggiorna contatori nel DOM
            $('.raccolta_stat_active_sessions').text(stats.active_sessions || 0);
            $('.raccolta_stat_pending_orders').text(stats.pending_orders || 0);
            $('.raccolta_stat_sync_errors').text(stats.sync_errors || 0);

            // Aggiorna progress bar
            if (stats.sync_progress !== undefined) {
                $('.raccolta_progress_bar').css('width', stats.sync_progress + '%');
            }

            // Aggiorna timestamp ultimo refresh
            $('.raccolta_last_update').text(
                _t('Aggiornato: ') + moment().format('HH:mm:ss')
            );
        },

        /**
         * Destroy widget
         */
        destroy: function () {
            this._stopAutoRefresh();
        },
    });

    /**
     * Notifiche sistema raccolta
     */
    var RaccoltaNotificationManager = core.Class.extend({
        init: function () {
            this.notifications = [];
            this.maxNotifications = 5;
            this._setupEventHandlers();
        },

        /**
         * Setup event handlers
         */
        _setupEventHandlers: function () {
            var self = this;

            // Ascolta eventi dal bus Odoo
            core.bus.on('raccolta_notification', this, this._onRaccoltaNotification);
            core.bus.on('sync_status_change', this, this._onSyncStatusChange);
        },

        /**
         * Gestisce notifiche raccolta
         */
        _onRaccoltaNotification: function (notification) {
            this.show(notification.message, notification.type, notification.options);
        },

        /**
         * Gestisce cambio stato sync
         */
        _onSyncStatusChange: function (data) {
            var message = _t('Sincronizzazione ') + data.status;
            var type = data.status === 'completed' ? 'success' : 'info';

            this.show(message, type, {
                duration: 3000,
                icon: 'fa-refresh'
            });
        },

        /**
         * Mostra notifica
         */
        show: function (message, type, options) {
            options = options || {};
            type = type || 'info';

            var notification = {
                id: _.uniqueId('raccolta_notification_'),
                message: message,
                type: type,
                timestamp: Date.now(),
                duration: options.duration || 5000,
                icon: options.icon || this._getDefaultIcon(type)
            };

            this.notifications.push(notification);
            this._renderNotification(notification);

            // Rimuovi dopo durata specificata
            setTimeout(() => {
                this._removeNotification(notification.id);
            }, notification.duration);

            // Mantieni solo max notifiche
            if (this.notifications.length > this.maxNotifications) {
                var toRemove = this.notifications.shift();
                this._removeNotification(toRemove.id);
            }
        },

        /**
         * Render notifica
         */
        _renderNotification: function (notification) {
            var $notification = $(`
                <div class="raccolta_notification ${notification.type}" id="${notification.id}">
                    <div class="raccolta_notification_header">
                        <i class="fa ${notification.icon}"></i>
                        <span>Raccolta Ordini</span>
                        <button class="close" data-id="${notification.id}">&times;</button>
                    </div>
                    <div class="raccolta_notification_body">
                        ${notification.message}
                    </div>
                </div>
            `);

            // Aggiungi al DOM
            if (!$('#raccolta_notifications_container').length) {
                $('body').append('<div id="raccolta_notifications_container"></div>');
            }

            $('#raccolta_notifications_container').append($notification);

            // Bind close button
            $notification.find('.close').on('click', (e) => {
                this._removeNotification($(e.target).data('id'));
            });

            // Animazione entrata
            $notification.hide().slideDown(300);
        },

        /**
         * Rimuovi notifica
         */
        _removeNotification: function (id) {
            var $notification = $('#' + id);
            if ($notification.length) {
                $notification.slideUp(300, function () {
                    $(this).remove();
                });
            }

            // Rimuovi da array
            this.notifications = this.notifications.filter(n => n.id !== id);
        },

        /**
         * Icona default per tipo
         */
        _getDefaultIcon: function (type) {
            var icons = {
                success: 'fa-check-circle',
                error: 'fa-exclamation-triangle',
                warning: 'fa-exclamation-circle',
                info: 'fa-info-circle'
            };
            return icons[type] || 'fa-bell';
        },
    });

    /**
     * Inizializzazione componenti quando DOM è pronto
     */
    $(document).ready(function () {
        // Inizializza manager notifiche
        window.raccoltaNotificationManager = new RaccoltaNotificationManager();

        // Inizializza widget statistiche se presente
        if ($('.raccolta_stats_widget').length) {
            window.raccoltaStatsWidget = new RaccoltaStatsWidget(null, {
                refreshInterval: 15000,
                autoRefresh: true
            });
        }

        // Bind azioni globali raccolta
        $(document).on('click', '[data-raccolta-action]', function (e) {
            e.preventDefault();
            var action = $(this).data('raccolta-action');
            var context = $(this).data('context') || {};

            core.bus.trigger('raccolta_action', {
                action: action,
                context: context
            });
        });

        // Migliora UX form raccolta
        $('.o_form_view').on('change', '[name="is_raccolta_agent"]', function () {
            var isAgent = $(this).is(':checked');
            $('.raccolta_agent_fields').toggle(isAgent);

            if (isAgent) {
                $('.raccolta_agent_setup').removeClass('d-none');
            }
        });

        console.log('Raccolta Backend Integration inizializzato');
    });

    // Export componenti
    return {
        FormController: RaccoltaFormController,
        KanbanController: RaccoltaKanbanController,
        ListController: RaccoltaListController,
        StatsWidget: RaccoltaStatsWidget,
        NotificationManager: RaccoltaNotificationManager,
    };
});

/**
 * CSS dinamico per miglioramenti runtime
 */
(function() {
    var style = document.createElement('style');
    style.textContent = `
        /* Animazioni per sync status */
        .o_field_badge.sync_status[data-value="syncing"] {
            animation: raccolta-pulse 1.5s infinite;
        }

        @keyframes raccolta-pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
        }

        /* Transizioni smooth per kanban cards */
        .o_kanban_record.raccolta_kanban_card {
            transition: all 0.3s ease;
        }

        .o_kanban_record.raccolta_kanban_card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0, 123, 255, 0.2);
        }

        /* Indicatori visivi per righe table */
        .o_list_view .o_data_row.raccolta_order_row {
            position: relative;
        }

        .o_list_view .o_data_row.raccolta_order_row::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: linear-gradient(to bottom, #007bff, #0056b3);
        }

        /* Notifiche container */
        #raccolta_notifications_container {
            position: fixed;
            top: 70px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
        }
    `;
    document.head.appendChild(style);
})();