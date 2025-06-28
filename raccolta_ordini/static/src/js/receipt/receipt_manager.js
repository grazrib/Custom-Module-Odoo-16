/**
 * Receipt Manager - Gestione ricevute 48mm e 80mm con DDT
 * Interfaccia tra frontend e backend per generazione ricevute
 */

class ReceiptManager {
    constructor() {
        this.storage = null;
        this.lastReceiptData = null;
        this.printWindow = null;
        this.defaultOptions = {
            format: '48mm',
            include_signature: true,
            show_prices: true,
            show_ddt_details: true,
            debug: false
        };
    }

    /**
     * Inizializza receipt manager
     */
    initialize(storage) {
        this.storage = storage;
    }

    /**
     * Genera e stampa ricevuta completa (ordine + picking + DDT)
     */
    async generateCompleteReceipt(orderLocalId, options = {}) {
        try {
            // Carica documenti collegati
            const order = await this.storage.getOrder(orderLocalId);
            if (!order) {
                throw new Error('Ordine non trovato');
            }

            const client = await this.getClientData(order.partner_id);
            const company = await this.getCompanyData();
            const picking = await this.getPickingForOrder(orderLocalId);
            const ddt = await this.getDdtForOrder(orderLocalId);

            // Merge opzioni
            const finalOptions = { ...this.defaultOptions, ...options };

            // Determina tipo template
            const receiptType = this.determineReceiptType(finalOptions, !!ddt);

            // Genera ricevuta
            const receiptData = await this.generateReceipt(
                receiptType,
                finalOptions.format,
                order,
                client,
                company,
                { picking, ddt, options: finalOptions }
            );

            if (receiptData.success) {
                // Salva per ristampa
                this.lastReceiptData = receiptData;

                // Stampa se richiesto
                if (finalOptions.auto_print !== false) {
                    await this.printReceipt(receiptData);
                }

                return receiptData;
            } else {
                throw new Error(receiptData.error || 'Errore generazione ricevuta');
            }

        } catch (error) {
            console.error('Errore generazione ricevuta completa:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Genera ricevuta semplice (solo ordine)
     */
    async generateSimpleReceipt(orderLocalId, options = {}) {
        try {
            const order = await this.storage.getOrder(orderLocalId);
            if (!order) {
                throw new Error('Ordine non trovato');
            }

            const client = await this.getClientData(order.partner_id);
            const company = await this.getCompanyData();

            const finalOptions = { ...this.defaultOptions, ...options };

            // Usa template semplice
            const receiptType = finalOptions.format === '48mm' ? 'escpos_48mm' : 'escpos_80mm';

            const receiptData = await this.generateReceipt(
                receiptType,
                finalOptions.format,
                order,
                client,
                company,
                { options: finalOptions }
            );

            if (receiptData.success) {
                this.lastReceiptData = receiptData;

                if (finalOptions.auto_print !== false) {
                    await this.printReceipt(receiptData);
                }

                return receiptData;
            } else {
                throw new Error(receiptData.error || 'Errore generazione ricevuta');
            }

        } catch (error) {
            console.error('Errore generazione ricevuta semplice:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Genera ricevuta chiamando il backend
     */
    async generateReceipt(type, format, orderData, clientData, companyData, additionalData = {}) {
        try {
            const response = await this.rpc('/raccolta/generate_receipt', {
                type: type,
                format: format,
                order_data: orderData,
                client_data: clientData,
                company_data: companyData,
                additional_data: additionalData
            });

            return response;

        } catch (error) {
            console.error('Errore chiamata backend ricevuta:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stampa ricevuta
     */
    async printReceipt(receiptData) {
        try {
            if (receiptData.type === 'escpos') {
                // Stampa ESC/POS
                await this.printEscPos(receiptData.content);
            } else if (receiptData.type === 'html') {
                // Stampa HTML/PDF
                await this.printHtml(receiptData.content);
            } else {
                throw new Error('Tipo ricevuta non supportato: ' + receiptData.type);
            }

            console.log('✅ Ricevuta stampata con successo');
            return { success: true };

        } catch (error) {
            console.error('❌ Errore stampa ricevuta:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stampa ESC/POS (per stampanti termiche)
     */
    async printEscPos(escposContent) {
        // Verifica se è disponibile una stampante ESC/POS
        if (this.isEscPosPrinterAvailable()) {
            await this.sendToEscPosPrinter(escposContent);
        } else {
            // Fallback: mostra contenuto formattato
            await this.showEscPosPreview(escposContent);
        }
    }

    /**
     * Stampa HTML
     */
    async printHtml(htmlContent) {
        // Crea finestra di stampa
        this.printWindow = window.open('', '_blank', 'width=800,height=600');

        if (!this.printWindow) {
            throw new Error('Impossibile aprire finestra di stampa (popup bloccato?)');
        }

        // Scrive contenuto HTML
        this.printWindow.document.write(htmlContent);
        this.printWindow.document.close();

        // Aspetta caricamento e stampa
        this.printWindow.onload = () => {
            setTimeout(() => {
                this.printWindow.print();

                // Chiude finestra dopo stampa
                setTimeout(() => {
                    if (this.printWindow && !this.printWindow.closed) {
                        this.printWindow.close();
                    }
                }, 1000);
            }, 500);
        };
    }

    /**
     * Verifica disponibilità stampante ESC/POS
     */
    isEscPosPrinterAvailable() {
        // Controlla se è disponibile WebUSB, Serial API o extension
        return !!(navigator.usb || navigator.serial || window.escposPrinter);
    }

    /**
     * Invia a stampante ESC/POS
     */
    async sendToEscPosPrinter(escposContent) {
        try {
            // Converti comandi ESC/POS in bytes
            const escposBytes = this.convertEscPosToBytes(escposContent);

            if (navigator.usb && window.escposPrinter) {
                // Usa WebUSB se disponibile
                await window.escposPrinter.print(escposBytes);
            } else if (navigator.serial) {
                // Usa Serial API se disponibile
                await this.printViaSerial(escposBytes);
            } else {
                // Fallback: mostra anteprima
                throw new Error('Nessuna stampante ESC/POS disponibile');
            }

        } catch (error) {
            console.warn('Fallback da stampante ESC/POS a preview:', error);
            await this.showEscPosPreview(escposContent);
        }
    }

    /**
     * Mostra anteprima ESC/POS formattata
     */
    async showEscPosPreview(escposContent) {
        // Converte comandi ESC/POS in HTML leggibile
        const htmlContent = this.convertEscPosToHtml(escposContent);

        // Crea finestra anteprima
        this.printWindow = window.open('', '_blank', 'width=400,height=600');

        if (this.printWindow) {
            this.printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Anteprima Ricevuta</title>
                    <style>
                        body {
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                            line-height: 1.2;
                            margin: 10px;
                            background: #f0f0f0;
                        }
                        .receipt-preview {
                            background: white;
                            padding: 10px;
                            border: 1px solid #ccc;
                            border-radius: 5px;
                            width: 48mm;
                            margin: 0 auto;
                        }
                        .center { text-align: center; }
                        .bold { font-weight: bold; }
                        .small { font-size: 10px; }
                        .separator { border-top: 1px dashed #000; margin: 5px 0; }
                        button { margin: 10px; padding: 10px; }
                    </style>
                </head>
                <body>
                    <div class="receipt-preview">
                        ${htmlContent}
                    </div>
                    <div style="text-align: center; margin-top: 20px;">
                        <button onclick="window.print()">🖨️ Stampa</button>
                        <button onclick="window.close()">❌ Chiudi</button>
                    </div>
                </body>
                </html>
            `);
            this.printWindow.document.close();
        }
    }

    /**
     * Converte comandi ESC/POS in HTML
     */
    convertEscPosToHtml(escposContent) {
        let html = escposContent;

        // Converte comandi ESC/POS in HTML
        html = html.replace(/<CENTER>/g, '<div class="center">');
        html = html.replace(/<\/CENTER>/g, '</div>');
        html = html.replace(/<LEFT>/g, '<div style="text-align: left;">');
        html = html.replace(/<RIGHT>/g, '<div style="text-align: right;">');
        html = html.replace(/<BOLD>/g, '<strong>');
        html = html.replace(/<\/BOLD>/g, '</strong>');
        html = html.replace(/<NORMAL>/g, '</strong></div>');
        html = html.replace(/<SMALL>/g, '<span class="small">');
        html = html.replace(/<\/SMALL>/g, '</span>');
        html = html.replace(/<BIG>/g, '<span style="font-size: 16px; font-weight: bold;">');
        html = html.replace(/<\/BIG>/g, '</span>');
        html = html.replace(/<UNDERLINE>/g, '<u>');
        html = html.replace(/<\/UNDERLINE>/g, '</u>');
        html = html.replace(/<LINE>/g, '<div class="separator"></div>');
        html = html.replace(/<LINE0>/g, '<div style="border-top: 1px dotted #ccc; margin: 2px 0;"></div>');
        html = html.replace(/<DLINE>/g, '<div style="border-top: 2px solid #000; margin: 5px 0;"></div>');
        html = html.replace(/<BR>/g, '<br>');
        html = html.replace(/<CUT>/g, '<div style="text-align: center; margin: 10px 0;">✂️ --- TAGLIO ---</div>');

        return html;
    }

    /**
     * Converte comandi ESC/POS in bytes per stampante
     */
    convertEscPosToBytes(escposContent) {
        // Implementazione base - da estendere con libreria ESC/POS
        const bytes = [];

        // Comandi ESC/POS di base
        const commands = {
            '<CENTER>': [0x1B, 0x61, 0x01],    // Centra
            '<LEFT>': [0x1B, 0x61, 0x00],      // Allinea a sinistra
            '<RIGHT>': [0x1B, 0x61, 0x02],     // Allinea a destra
            '<BOLD>': [0x1B, 0x45, 0x01],      // Grassetto ON
            '<NORMAL>': [0x1B, 0x45, 0x00],    // Grassetto OFF
            '<SMALL>': [0x1B, 0x21, 0x01],     // Font piccolo
            '<BIG>': [0x1B, 0x21, 0x30],       // Font grande
            '<BR>': [0x0A],                     // Line feed
            '<CUT>': [0x1D, 0x56, 0x00]        // Taglio carta
        };

        // Processa il contenuto
        let content = escposContent;

        // Sostituisce comandi con bytes
        for (const [command, byteArray] of Object.entries(commands)) {
            content = content.replace(new RegExp(command, 'g'), String.fromCharCode(...byteArray));
        }

        // Rimuove comandi non gestiti
        content = content.replace(/<[^>]*>/g, '');

        // Converte in array di bytes
        for (let i = 0; i < content.length; i++) {
            bytes.push(content.charCodeAt(i));
        }

        return new Uint8Array(bytes);
    }

    /**
     * Stampa via Serial API
     */
    async printViaSerial(escposBytes) {
        try {
            // Richiede porta seriale
            const port = await navigator.serial.requestPort();

            // Apre connessione
            await port.open({ baudRate: 9600 });

            // Invia dati
            const writer = port.writable.getWriter();
            await writer.write(escposBytes);
            writer.releaseLock();

            // Chiude connessione
            await port.close();

        } catch (error) {
            throw new Error('Errore stampa seriale: ' + error.message);
        }
    }

    // === METODI HELPER DATI ===

    /**
     * Ottiene dati cliente
     */
    async getClientData(partnerId) {
        try {
            const partners = await this.storage.getPartners();
            const client = partners.find(p => p.id === partnerId);

            if (!client) {
                return {
                    id: partnerId,
                    name: 'Cliente Sconosciuto',
                    email: '',
                    phone: '',
                    street: '',
                    city: '',
                    zip: '',
                    vat: ''
                };
            }

            return client;

        } catch (error) {
            console.error('Errore caricamento dati cliente:', error);
            return { id: partnerId, name: 'Cliente Sconosciuto' };
        }
    }

    /**
     * Ottiene dati azienda
     */
    async getCompanyData() {
        try {
            const config = await this.storage.getConfig();

            if (config && config.company_data) {
                return config.company_data;
            }

            // Fallback con dati base
            return {
                name: 'La Tua Azienda',
                street: '',
                city: '',
                zip: '',
                phone: '',
                email: '',
                vat: ''
            };

        } catch (error) {
            console.error('Errore caricamento dati azienda:', error);
            return { name: 'La Tua Azienda' };
        }
    }

    /**
     * Ottiene picking per ordine
     */
    async getPickingForOrder(orderLocalId) {
        try {
            const pickings = await this.storage.getPickingsByOrder(orderLocalId);
            return pickings.length > 0 ? pickings[0] : null;
        } catch (error) {
            console.error('Errore caricamento picking:', error);
            return null;
        }
    }

    /**
     * Ottiene DDT per ordine
     */
    async getDdtForOrder(orderLocalId) {
        try {
            // Prima trova il picking
            const picking = await this.getPickingForOrder(orderLocalId);
            if (!picking) return null;

            // Poi trova il DDT collegato al picking
            const ddts = await this.storage.getDdtsByPicking(picking.local_id);
            return ddts.length > 0 ? ddts[0] : null;

        } catch (error) {
            console.error('Errore caricamento DDT:', error);
            return null;
        }
    }

    /**
     * Determina tipo di ricevuta da generare
     */
    determineReceiptType(options, hasDdt) {
        const format = options.format || '48mm';

        if (hasDdt && options.show_ddt_details) {
            // Ricevuta con DDT
            return format === '48mm' ? 'escpos_48mm_ddt' : 'pdf_ddt';
        } else {
            // Ricevuta semplice
            return format === '48mm' ? 'escpos_48mm' : 'escpos_80mm';
        }
    }

    // === METODI AZIONI ===

    /**
     * Ristampa ultima ricevuta
     */
    async reprintLastReceipt() {
        if (!this.lastReceiptData) {
            throw new Error('Nessuna ricevuta da ristampare');
        }

        return await this.printReceipt(this.lastReceiptData);
    }

    /**
     * Stampa ricevuta di test
     */
    async printTestReceipt(format = '48mm') {
        const testOrder = this.createTestOrderData();
        const testClient = this.createTestClientData();
        const testCompany = await this.getCompanyData();

        return await this.generateReceipt(
            format === '48mm' ? 'escpos_48mm' : 'escpos_80mm',
            format,
            testOrder,
            testClient,
            testCompany,
            { options: { ...this.defaultOptions, format } }
        );
    }

    /**
     * Crea dati ordine di test
     */
    createTestOrderData() {
        return {
            local_id: 'test_order_' + Date.now(),
            name: 'TEST-001',
            partner_id: 999,
            date_order: new Date().toISOString(),
            state: 'draft',
            products: [
                {
                    id: 1,
                    name: 'Prodotto di Test',
                    quantity: 2,
                    price_unit: 15.50,
                    note: 'Questa è una nota di test per il prodotto'
                }
            ],
            amount_total: 31.00,
            note: 'Questo è un ordine di test per verificare la stampa delle ricevute.',
            agent_code: 'AG001',
            agent_name: 'Agente Test'
        };
    }

    /**
     * Crea dati cliente di test
     */
    createTestClientData() {
        return {
            id: 999,
            name: 'Cliente di Test S.r.l.',
            email: 'test@cliente.it',
            phone: '+39 123 456 7890',
            street: 'Via Roma, 123',
            city: 'Milano',
            zip: '20100',
            vat: 'IT12345678901'
        };
    }

    // === CONFIGURAZIONE ===

    /**
     * Aggiorna opzioni default
     */
    updateDefaultOptions(newOptions) {
        this.defaultOptions = { ...this.defaultOptions, ...newOptions };

        // Salva in storage
        try {
            localStorage.setItem('raccolta_receipt_options', JSON.stringify(this.defaultOptions));
        } catch (error) {
            console.error('Errore salvataggio opzioni ricevuta:', error);
        }
    }

    /**
     * Carica opzioni salvate
     */
    loadSavedOptions() {
        try {
            const saved = localStorage.getItem('raccolta_receipt_options');
            if (saved) {
                this.defaultOptions = { ...this.defaultOptions, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.error('Errore caricamento opzioni ricevuta:', error);
        }
    }

    /**
     * Ottiene formati supportati
     */
    getSupportedFormats() {
        return [
            { value: '48mm', label: '48mm (Termico)', description: 'Stampanti termiche piccole' },
            { value: '80mm', label: '80mm (Termico)', description: 'Stampanti termiche standard' },
            { value: 'A4', label: 'A4 (PDF)', description: 'Stampa su carta normale' }
        ];
    }

    /**
     * Ottiene tipi ricevuta disponibili
     */
    getReceiptTypes() {
        return [
            { value: 'simple', label: 'Semplice', description: 'Solo ordine' },
            { value: 'with_ddt', label: 'Con DDT', description: 'Ordine + Picking + DDT' },
            { value: 'test', label: 'Test', description: 'Ricevuta di prova' }
        ];
    }

    /**
     * Validazione opzioni
     */
    validateOptions(options) {
        const errors = [];

        if (options.format && !['48mm', '80mm', 'A4'].includes(options.format)) {
            errors.push('Formato non valido');
        }

        if (options.show_prices !== undefined && typeof options.show_prices !== 'boolean') {
            errors.push('show_prices deve essere boolean');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // === UTILITY ===

    /**
     * RPC helper
     */
    async rpc(route, params = {}) {
        return window.RaccoltaApp.rpc(route, params);
    }

    /**
     * Ottiene stato stampante
     */
    getPrinterStatus() {
        return {
            escpos_available: this.isEscPosPrinterAvailable(),
            webusb_supported: !!navigator.usb,
            serial_supported: !!navigator.serial,
            last_print: localStorage.getItem('raccolta_last_print') || null
        };
    }

    /**
     * Salva timestamp ultima stampa
     */
    saveLastPrintTime() {
        try {
            localStorage.setItem('raccolta_last_print', new Date().toISOString());
        } catch (error) {
            console.error('Errore salvataggio last print time:', error);
        }
    }
}

export { ReceiptManager };
