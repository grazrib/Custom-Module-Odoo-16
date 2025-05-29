odoo.define('inventory_adjustment.barcode_scanner', function (require) {
    "use strict";

    var AbstractAction = require('web.AbstractAction');
    var core = require('web.core');
    var _t = core._t;
    var beep = new Audio('/inventory_adjustment/static/src/audio/beep_scan.mp3');

    // Barcode Scanner Action
    var BarcodeScanner = AbstractAction.extend({
        events: {
            'click .o_barcode_scanner_cancel': '_onCancel',
            'click .o_barcode_scanner_start': '_onStartScan',
        },
        
        init: function (parent, action) {
            this._super.apply(this, arguments);
            this.model = action.params.model;
            this.field = action.params.field;
            this.callback = action.params.callback;
            this.wizard_id = action.params.wizard_id;
            this.stream = null;
            this.videoElement = null;
            this.canvasElement = null;
            this.scanning = false;
        },

        // Costruisci l'UI senza usare il template QWeb
        renderElement: function () {
            var self = this;
            this._super();
            
            // Crea l'interfaccia scanner manualmente
            var $scannerUI = $('<div class="o_barcode_scanner_main p-3">');
            
            // Header
            $scannerUI.append($('<div class="o_barcode_scanner_header mb-3">').append(
                $('<h3>').text(_t('Scanner Codice a Barre'))
            ));
            
            // Notification area
            var $notification = $('<div class="o_barcode_scanner_notification alert alert-info mb-3">').text(
                _t('Inizializzazione scanner...')
            );
            $scannerUI.append($notification);
            
            // Container for camera
            var $container = $('<div class="o_barcode_scanner_container mb-3">').css({
                width: '100%',
                height: '300px',
                backgroundColor: '#000',
                position: 'relative'
            });
            
            // Target overlay
            $container.append($('<div class="barcode_scanner_target">').css({
                width: '70%',
                height: '40%',
                border: '2px solid #fff',
                borderRadius: '10px',
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 0 3px rgba(40, 167, 69, 0.3)'
            }));
            
            $scannerUI.append($container);
            
            // Controls
            var $controls = $('<div class="o_barcode_scanner_controls d-flex justify-content-between">');
            $controls.append($('<button class="o_barcode_scanner_start btn btn-primary">').append(
                $('<i class="fa fa-camera mr-2">'),
                _t('Inizia Scansione')
            ));
            $controls.append($('<button class="o_barcode_scanner_cancel btn btn-secondary">').append(
                $('<i class="fa fa-times mr-2">'),
                _t('Annulla')
            ));
            $scannerUI.append($controls);
            
            // Sostituisci il contenuto
            this.$el.html($scannerUI);
            
            // Salva riferimenti per uso successivo
            this.$notification = $notification;
            this.$container = $container;
        },
        
        start: function() {
            var self = this;
            return this._super().then(function() {
                // Crea elemento video
                self.videoElement = document.createElement('video');
                self.videoElement.style.width = '100%';
                self.videoElement.style.height = '100%';
                self.videoElement.style.objectFit = 'cover';
                self.$container.append(self.videoElement);
                
                // Verifica supporto fotocamera
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    self.$notification.text(_t('Premi "Inizia Scansione" per attivare la fotocamera.'));
                    
                    // Verifica se Quagga è disponibile
                    if (typeof Quagga !== 'undefined') {
                        console.log("Quagga è disponibile e verrà utilizzato per la scansione");
                    } else {
                        console.error("Quagga non è disponibile. Assicurati di averlo incluso correttamente");
                        self.$notification.text(_t('Errore: libreria Quagga non trovata. Contatta l\'amministratore.'));
                        self.$('.o_barcode_scanner_start').prop('disabled', true);
                    }
                } else {
                    self.$notification.text(_t('Il tuo browser non supporta l\'accesso alla fotocamera.'));
                    self.$('.o_barcode_scanner_start').prop('disabled', true);
                }
            });
        },
        
        destroy: function() {
            this._stopScanner();
            this._super.apply(this, arguments);
        },
        
        _onStartScan: function() {
            var self = this;
            this.$('.o_barcode_scanner_start').prop('disabled', true);
            
            // Configura la fotocamera
            var constraints = {
                video: {
                    facingMode: "environment",
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 }
                }
            };
            
            // Avvia la fotocamera
            navigator.mediaDevices.getUserMedia(constraints)
                .then(function(stream) {
                    self.stream = stream;
                    self.videoElement.srcObject = stream;
                    self.videoElement.play();
                    self.$notification.text(_t("Scansione in corso... Punta la fotocamera verso il codice a barre."));
                    
                    // Utilizzo di Quagga per la scansione
                    self._startQuaggaScanner();
                })
                .catch(function(err) {
                    console.error("Errore accesso fotocamera:", err);
                    self.$notification.text(_t("Errore nell'accesso alla fotocamera: ") + err.message);
                    self.$('.o_barcode_scanner_start').prop('disabled', false);
                });
        },
        
        _startQuaggaScanner: function() {
            var self = this;
            self.scanning = true;
            
            // Aggiungi animazione di scansione
            var $scanLine = $('<div class="scanning-line"></div>').css({
                position: 'absolute',
                height: '2px',
                width: '100%',
                backgroundColor: 'rgba(76, 175, 80, 0.8)',
                top: '0',
                left: '0',
                animation: 'scan 2s infinite'
            });
            self.$container.find('.barcode_scanner_target').append($scanLine);

            // Configura Quagga
            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: self.videoElement,
                    constraints: {
                        width: { min: 640 },
                        height: { min: 480 },
                        facingMode: "environment",
                        aspectRatio: { min: 1, max: 2 }
                    },
                    area: { // Definisci un'area più piccola per migliorare performance e precisione
                        top: "30%",    
                        right: "10%",  
                        left: "10%",   
                        bottom: "30%"  
                    },
                },
                decoder: {
                    readers: [
                        'ean_reader',
                        'ean_8_reader',
                        'code_128_reader',
                        'code_39_reader',
                        'code_93_reader',
                        'upc_reader',
                        'upc_e_reader'
                    ],
                    multiple: false,
                    debug: {
                        drawBoundingBox: true,
                        showFrequency: true,
                        drawScanline: true,
                        showPattern: true
                    }
                },
                locator: {
                    halfSample: true,
                    patchSize: "medium",
                }
            }, function(err) {
                if (err) {
                    console.error("Errore inizializzazione Quagga:", err);
                    self.$notification.text(_t("Errore nell'inizializzazione dello scanner. Riprova."));
                    self.$('.o_barcode_scanner_start').prop('disabled', false);
                    return;
                }
                
                Quagga.start();
            });
            
            // Aggiungi event listener per rilevamento barcode
            Quagga.onDetected(function(result) {
                if (!self.scanning) return;
                
                var code = result.codeResult.code;
                console.log("Barcode rilevato (Quagga):", code);
                
                // Riproduci suono di conferma
                beep.play();
                
                // Ferma la scansione
                self.scanning = false;
                Quagga.stop();
                
                // Gestisci il codice a barre rilevato
                self._setBarcodeValue(code);
            });
        },
        
        _stopScanner: function() {
            this.scanning = false;
            
            // Ferma Quagga se attivo
            if (typeof Quagga !== 'undefined') {
                try {
                    Quagga.stop();
                } catch (e) {
                    console.error("Errore arresto Quagga:", e);
                }
            }
            
            // Ferma stream video
            if (this.stream) {
                this.stream.getTracks().forEach(function(track) {
                    track.stop();
                });
                this.stream = null;
            }
        },
        
        _setBarcodeValue: function(code) {
            var self = this;
            this.$notification.text(_t("Codice a barre rilevato: ") + code);
            
            // Se è stato fornito un callback, usalo
            if (this.callback) {
                this._stopScanner();
                
                if (this.wizard_id) {
                    // Usa il metodo pubblico onchange_barcode invece del metodo privato _onchange_barcode
                    return this._rpc({
                        model: this.model,
                        method: this.callback,
                        args: [code, this.wizard_id],
                    }).then(function() {
                        self.do_action({type: 'ir.actions.act_window_close'});
                        self.do_action({type: 'ir.actions.client', tag: 'reload'});
                    }).guardedCatch(function(error) {
                        console.error("Error in barcode processing:", error);
                        self.$notification.text(_t("Errore: ") + error.message);
                        self.$('.o_barcode_scanner_start').prop('disabled', false);
                    });
                } else if (typeof this.callback === 'function') {
                    // Se il callback è una funzione JavaScript
                    this.callback(code);
                    this.do_action({type: 'ir.actions.act_window_close'});
                    return;
                }
            }
            
            // Semplicemente chiudi il popup
            this._stopScanner();
            this.do_action({type: 'ir.actions.act_window_close'});
        },
        
        _onCancel: function() {
            this._stopScanner();
            this.do_action({type: 'ir.actions.act_window_close'});
        }
    });

    // Registra l'azione nel client
    core.action_registry.add('inventory_adjustment.barcode_scanner', BarcodeScanner);

    return BarcodeScanner;
});