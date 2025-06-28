 /**
 * Generatore ESC/POS per Ricevute Termiche 48mm/80mm
 * Supporta stampa diretta e preview HTML
 */
class ESCPOSGenerator {
    constructor(options = {}) {
        this.options = {
            paperWidth: options.paperWidth || 48, // 48mm o 80mm
            encoding: options.encoding || 'cp437',
            language: options.language || 'it',
            ...options
        };

        // Caratteri per riga in base alla larghezza
        this.charsPerLine = this.options.paperWidth === 48 ? 32 : 48;

        // Comandi ESC/POS
        this.commands = {
            INIT: '\x1B\x40',           // Inizializza stampante
            LF: '\x0A',                 // Line Feed
            CR: '\x0D',                 // Carriage Return
            ESC: '\x1B',                // Escape
            GS: '\x1D',                 // Group Separator

            // Font e stile
            FONT_A: '\x1B\x4D\x00',    // Font A (normale)
            FONT_B: '\x1B\x4D\x01',    // Font B (piccolo)
            BOLD_ON: '\x1B\x45\x01',   // Grassetto ON
            BOLD_OFF: '\x1B\x45\x00',  // Grassetto OFF
            UNDERLINE_ON: '\x1B\x2D\x01', // Sottolineato ON
            UNDERLINE_OFF: '\x1B\x2D\x00', // Sottolineato OFF

            // Allineamento
            ALIGN_LEFT: '\x1B\x61\x00',
            ALIGN_CENTER: '\x1B\x61\x01',
            ALIGN_RIGHT: '\x1B\x61\x02',

            // Dimensioni carattere
            SIZE_NORMAL: '\x1D\x21\x00',
            SIZE_DOUBLE_HEIGHT: '\x1D\x21\x01',
            SIZE_DOUBLE_WIDTH: '\x1D\x21\x10',
            SIZE_DOUBLE: '\x1D\x21\x11',

            // Taglio carta
            CUT_FULL: '\x1D\x56\x00',
            CUT_PARTIAL: '\x1D\x56\x01',

            // Cassetto
            DRAWER_KICK: '\x1B\x70\x00\x19\x19'
        };
    }

    /**
     * Genera ricevuta completa
     */
    generateReceipt(orderData, options = {}) {
        let receipt = '';

        // Inizializza
        receipt += this.commands.INIT;
        receipt += this.commands.FONT_A;
        receipt += this.commands.SIZE_NORMAL;

        // Header azienda
        receipt += this.generateHeader(orderData.company || {});

        // Separatore
        receipt += this.generateSeparator();

        // Info ordine
        receipt += this.generateOrderInfo(orderData);

        // Cliente
        if (orderData.customer) {
            receipt += this.generateCustomerInfo(orderData.customer);
        }

        // Separatore
        receipt += this.generateSeparator();

        // Prodotti
        receipt += this.generateProductList(orderData.products || []);

        // Totali
        receipt += this.generateTotals(orderData);

        // DDT se presente
        if (orderData.ddt) {
            receipt += this.generateDDTInfo(orderData.ddt);
        }

        // Footer
        receipt += this.generateFooter(orderData, options);

        // Taglio carta
        if (options.autoCut !== false) {
            receipt += this.commands.LF + this.commands.LF;
            receipt += this.commands.CUT_PARTIAL;
        }

        // Apri cassetto se richiesto
        if (options.openDrawer) {
            receipt += this.commands.DRAWER_KICK;
        }

        return receipt;
    }

    /**
     * Header azienda
     */
    generateHeader(company) {
        let header = '';

        // Nome azienda centrato e grande
        header += this.commands.ALIGN_CENTER;
        header += this.commands.BOLD_ON;
        header += this.commands.SIZE_DOUBLE_HEIGHT;
        header += this.centerText(company.name || 'AZIENDA', this.charsPerLine / 2);
        header += this.commands.LF;
        header += this.commands.SIZE_NORMAL;
        header += this.commands.BOLD_OFF;

        // Indirizzo
        if (company.street) {
            header += this.centerText(company.street, this.charsPerLine);
            header += this.commands.LF;
        }

        if (company.city || company.zip) {
            const cityLine = `${company.zip || ''} ${company.city || ''}`.trim();
            header += this.centerText(cityLine, this.charsPerLine);
            header += this.commands.LF;
        }

        // P.IVA
        if (company.vat) {
            header += this.centerText(`P.IVA: ${company.vat}`, this.charsPerLine);
            header += this.commands.LF;
        }

        // Telefono/Email
        if (company.phone) {
            header += this.centerText(`Tel: ${company.phone}`, this.charsPerLine);
            header += this.commands.LF;
        }

        if (company.email) {
            header += this.centerText(company.email, this.charsPerLine);
            header += this.commands.LF;
        }

        header += this.commands.LF;
        return header;
    }

    /**
     * Info ordine
     */
    generateOrderInfo(orderData) {
        let info = '';

        info += this.commands.ALIGN_LEFT;
        info += this.commands.BOLD_ON;
        info += this.commands.SIZE_DOUBLE_WIDTH;
        info += `ORDINE: ${orderData.name || 'N/A'}`;
        info += this.commands.LF;
        info += this.commands.SIZE_NORMAL;
        info += this.commands.BOLD_OFF;

        // Data e ora
        const date = orderData.date_order ? new Date(orderData.date_order) : new Date();
        info += `Data: ${this.formatDate(date)}`;
        info += this.commands.LF;
        info += `Ora: ${this.formatTime(date)}`;
        info += this.commands.LF;

        // Agente
        if (orderData.user_id) {
            info += `Agente: ${orderData.user_id[1] || orderData.user_id}`;
            info += this.commands.LF;
        }

        info += this.commands.LF;
        return info;
    }

    /**
     * Info cliente
     */
    generateCustomerInfo(customer) {
        let info = '';

        info += this.commands.BOLD_ON;
        info += 'CLIENTE:';
        info += this.commands.BOLD_OFF;
        info += this.commands.LF;

        info += this.wrapText(customer.name || 'N/A', this.charsPerLine);

        if (customer.street) {
            info += this.wrapText(customer.street, this.charsPerLine);
        }

        if (customer.city || customer.zip) {
            const cityLine = `${customer.zip || ''} ${customer.city || ''}`.trim();
            info += this.wrapText(cityLine, this.charsPerLine);
        }

        if (customer.vat) {
            info += `P.IVA: ${customer.vat}`;
            info += this.commands.LF;
        }

        if (customer.phone) {
            info += `Tel: ${customer.phone}`;
            info += this.commands.LF;
        }

        info += this.commands.LF;
        return info;
    }

    /**
     * Lista prodotti
     */
    generateProductList(products) {
        let list = '';

        // Header tabella
        list += this.commands.BOLD_ON;
        list += this.commands.FONT_B; // Font piccolo per più spazio

        if (this.charsPerLine >= 42) {
            // Formato 80mm: più dettagliato
            list += this.padText('DESCRIZIONE', 20);
            list += this.padText('QTA', 5);
            list += this.padText('PREZZO', 8);
            list += this.padText('TOTALE', 8, 'right');
        } else {
            // Formato 48mm: compatto
            list += this.padText('DESCRIZIONE', 16);
            list += this.padText('QTA', 4);
            list += this.padText('TOT', 6, 'right');
        }

        list += this.commands.LF;
        list += this.commands.BOLD_OFF;
        list += this.generateSeparator('-');

        // Prodotti
        products.forEach(product => {
            list += this.commands.FONT_B;

            const name = this.truncateText(product.name || '', this.charsPerLine >= 42 ? 20 : 16);
            const qty = product.quantity?.toString() || '1';
            const price = this.formatPrice(product.price_unit || 0);
            const subtotal = this.formatPrice((product.price_unit || 0) * (product.quantity || 1));

            if (this.charsPerLine >= 42) {
                list += this.padText(name, 20);
                list += this.padText(qty, 5);
                list += this.padText(price, 8);
                list += this.padText(subtotal, 8, 'right');
            } else {
                list += this.padText(name, 16);
                list += this.padText(qty, 4);
                list += this.padText(subtotal, 6, 'right');
            }

            list += this.commands.LF;

            // Codice prodotto se presente
            if (product.default_code && this.charsPerLine >= 42) {
                list += `  Cod: ${product.default_code}`;
                list += this.commands.LF;
            }
        });

        list += this.commands.FONT_A;
        return list;
    }

    /**
     * Totali ordine
     */
    generateTotals(orderData) {
        let totals = '';

        totals += this.generateSeparator();
        totals += this.commands.ALIGN_RIGHT;
        totals += this.commands.BOLD_ON;

        // Subtotale
        if (orderData.amount_untaxed) {
            totals += `Subtotale: ${this.formatPrice(orderData.amount_untaxed)}`;
            totals += this.commands.LF;
        }

        // IVA
        if (orderData.amount_tax) {
            totals += `IVA: ${this.formatPrice(orderData.amount_tax)}`;
            totals += this.commands.LF;
        }

        // Totale
        totals += this.commands.SIZE_DOUBLE_WIDTH;
        totals += `TOTALE: ${this.formatPrice(orderData.amount_total || 0)}`;
        totals += this.commands.LF;
        totals += this.commands.SIZE_NORMAL;
        totals += this.commands.BOLD_OFF;
        totals += this.commands.ALIGN_LEFT;

        return totals;
    }

    /**
     * Info DDT
     */
    generateDDTInfo(ddt) {
        let info = '';

        info += this.commands.LF;
        info += this.generateSeparator();
        info += this.commands.BOLD_ON;
        info += `DDT: ${ddt.name || 'N/A'}`;
        info += this.commands.LF;
        info += this.commands.BOLD_OFF;

        if (ddt.date) {
            info += `Data DDT: ${this.formatDate(new Date(ddt.date))}`;
            info += this.commands.LF;
        }

        if (ddt.transport_condition) {
            info += `Trasporto: ${ddt.transport_condition}`;
            info += this.commands.LF;
        }

        if (ddt.goods_appearance) {
            info += `Aspetto: ${ddt.goods_appearance}`;
            info += this.commands.LF;
        }

        return info;
    }

    /**
     * Footer ricevuta
     */
    generateFooter(orderData, options) {
        let footer = '';

        footer += this.commands.LF;
        footer += this.generateSeparator();
        footer += this.commands.ALIGN_CENTER;
        footer += this.commands.FONT_B;

        // Note
        if (orderData.note) {
            footer += this.wrapText(orderData.note, this.charsPerLine);
            footer += this.commands.LF;
        }

        // Messaggio personalizzato
        if (options.footerMessage) {
            footer += this.wrapText(options.footerMessage, this.charsPerLine);
            footer += this.commands.LF;
        }

        // Messaggio standard
        footer += 'Grazie per la fiducia!';
        footer += this.commands.LF;
        footer += this.commands.LF;

        // Timestamp generazione
        footer += `Stampato: ${this.formatDateTime(new Date())}`;
        footer += this.commands.LF;

        footer += this.commands.FONT_A;
        footer += this.commands.ALIGN_LEFT;

        return footer;
    }

    /**
     * Separatore
     */
    generateSeparator(char = '=') {
        return char.repeat(this.charsPerLine) + this.commands.LF;
    }

    /**
     * Centra testo
     */
    centerText(text, maxWidth) {
        const spaces = Math.max(0, Math.floor((maxWidth - text.length) / 2));
        return ' '.repeat(spaces) + text;
    }

    /**
     * Pad testo con allineamento
     */
    padText(text, width, align = 'left') {
        const truncated = this.truncateText(text, width);

        if (align === 'right') {
            return truncated.padStart(width);
        } else if (align === 'center') {
            const spaces = Math.max(0, Math.floor((width - truncated.length) / 2));
            return ' '.repeat(spaces) + truncated + ' '.repeat(width - truncated.length - spaces);
        } else {
            return truncated.padEnd(width);
        }
    }

    /**
     * Tronca testo
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength - 1) + '.' : text;
    }

    /**
     * Wrap testo su più righe
     */
    wrapText(text, maxWidth) {
        if (!text) return '';

    /**
     * Wrap testo su più righe
     */
    wrapText(text, maxWidth) {
        if (!text) return '';

        const words = text.split(' ');
        let lines = [];
        let currentLine = '';

        words.forEach(word => {
            if ((currentLine + word).length <= maxWidth) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.join(this.commands.LF) + this.commands.LF;
    }

    /**
     * Formatta prezzo
     */
    formatPrice(amount) {
        if (isNaN(amount)) return '€0,00';

        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2
        }).format(amount).replace('EUR', '€');
    }

    /**
     * Formatta data
     */
    formatDate(date) {
        return date.toLocaleDateString('it-IT');
    }

    /**
     * Formatta ora
     */
    formatTime(date) {
        return date.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Formatta data e ora
     */
    formatDateTime(date) {
        return date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Genera QR Code (se supportato dalla stampante)
     */
    generateQRCode(data, size = 3) {
        let qr = '';

        // Store QR code data
        qr += this.commands.GS + 'k' + String.fromCharCode(81, 2, 0); // QR Code type
        qr += String.fromCharCode(data.length) + data;

        // Print QR code
        qr += this.commands.GS + '(' + String.fromCharCode(107, 3, 0, 49, 67, size); // Size
        qr += this.commands.GS + '(' + String.fromCharCode(107, 3, 0, 49, 69, 48); // Error correction
        qr += this.commands.GS + '(' + String.fromCharCode(107, 3, 0, 49, 81, 48); // Print

        return qr;
    }

    /**
     * Genera codice a barre (se supportato)
     */
    generateBarcode(data, type = 'CODE128') {
        let barcode = '';

        // Barcode types
        const types = {
            'CODE128': 73,
            'EAN13': 67,
            'EAN8': 68
        };

        const barcodeType = types[type] || types.CODE128;

        barcode += this.commands.GS + 'h' + String.fromCharCode(50); // Height
        barcode += this.commands.GS + 'w' + String.fromCharCode(2); // Width
        barcode += this.commands.GS + 'H' + String.fromCharCode(2); // HRI position (below)
        barcode += this.commands.GS + 'k' + String.fromCharCode(barcodeType) + data + '\0';

        return barcode;
    }

    /**
     * Genera anteprima HTML della ricevuta
     */
    generateHTMLPreview(orderData, options = {}) {
        const previewData = this.preparePreviewData(orderData);

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Anteprima Ricevuta</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            font-size: ${this.options.paperWidth === 48 ? '11px' : '12px'};
            line-height: 1.2;
            margin: 0;
            padding: 20px;
            background: #f0f0f0;
        }

        .receipt {
            background: white;
            width: ${this.options.paperWidth === 48 ? '180px' : '280px'};
            margin: 0 auto;
            padding: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            border: 1px solid #ddd;
        }

        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .large { font-size: 1.2em; }
        .small { font-size: 0.9em; }
        .underline { text-decoration: underline; }

        .separator {
            border-bottom: 1px solid #000;
            margin: 5px 0;
        }

        .product-table {
            width: 100%;
            border-collapse: collapse;
            font-size: ${this.options.paperWidth === 48 ? '9px' : '10px'};
        }

        .product-table th,
        .product-table td {
            padding: 1px 2px;
            text-align: left;
        }

        .product-table th {
            border-bottom: 1px solid #000;
            font-weight: bold;
        }

        .product-table .qty,
        .product-table .price,
        .product-table .total {
            text-align: right;
        }

        .totals {
            margin-top: 10px;
            text-align: right;
        }

        .totals .grand-total {
            font-size: 1.1em;
            font-weight: bold;
            border-top: 1px solid #000;
            padding-top: 2px;
        }

        @media print {
            body { background: white; padding: 0; }
            .receipt { box-shadow: none; border: none; }
        }
    </style>
</head>
<body>
    <div class="receipt">
        <!-- Header -->
        <div class="center bold large">
            ${this.escapeHtml(previewData.company.name || 'AZIENDA')}
        </div>
        ${previewData.company.street ? `<div class="center">${this.escapeHtml(previewData.company.street)}</div>` : ''}
        ${previewData.company.city ? `<div class="center">${this.escapeHtml(previewData.company.city)}</div>` : ''}
        ${previewData.company.vat ? `<div class="center">P.IVA: ${this.escapeHtml(previewData.company.vat)}</div>` : ''}
        ${previewData.company.phone ? `<div class="center">Tel: ${this.escapeHtml(previewData.company.phone)}</div>` : ''}

        <div class="separator"></div>

        <!-- Order Info -->
        <div class="bold">ORDINE: ${this.escapeHtml(previewData.orderName)}</div>
        <div>Data: ${previewData.orderDate}</div>
        <div>Ora: ${previewData.orderTime}</div>
        ${previewData.agent ? `<div>Agente: ${this.escapeHtml(previewData.agent)}</div>` : ''}

        <!-- Customer -->
        ${previewData.customer ? `
        <div class="separator"></div>
        <div class="bold">CLIENTE:</div>
        <div>${this.escapeHtml(previewData.customer.name)}</div>
        ${previewData.customer.street ? `<div>${this.escapeHtml(previewData.customer.street)}</div>` : ''}
        ${previewData.customer.city ? `<div>${this.escapeHtml(previewData.customer.city)}</div>` : ''}
        ${previewData.customer.vat ? `<div>P.IVA: ${this.escapeHtml(previewData.customer.vat)}</div>` : ''}
        ` : ''}

        <div class="separator"></div>

        <!-- Products -->
        <table class="product-table">
            <thead>
                <tr>
                    <th style="width: 50%">DESCRIZIONE</th>
                    <th style="width: 15%" class="qty">QTA</th>
                    ${this.options.paperWidth >= 80 ? '<th style="width: 20%" class="price">PREZZO</th>' : ''}
                    <th style="width: 25%" class="total">TOTALE</th>
                </tr>
            </thead>
            <tbody>
                ${previewData.products.map(product => `
                <tr>
                    <td>${this.escapeHtml(this.truncateText(product.name, this.options.paperWidth === 48 ? 16 : 20))}</td>
                    <td class="qty">${product.quantity}</td>
                    ${this.options.paperWidth >= 80 ? `<td class="price">${this.formatPrice(product.price_unit || 0)}</td>` : ''}
                    <td class="total">${this.formatPrice((product.price_unit || 0) * (product.quantity || 1))}</td>
                </tr>
                ${product.default_code && this.options.paperWidth >= 80 ? `
                <tr>
                    <td colspan="${this.options.paperWidth >= 80 ? '4' : '3'}" class="small">
                        &nbsp;&nbsp;Cod: ${this.escapeHtml(product.default_code)}
                    </td>
                </tr>
                ` : ''}
                `).join('')}
            </tbody>
        </table>

        <!-- Totals -->
        <div class="totals">
            ${previewData.amount_untaxed ? `<div>Subtotale: ${this.formatPrice(previewData.amount_untaxed)}</div>` : ''}
            ${previewData.amount_tax ? `<div>IVA: ${this.formatPrice(previewData.amount_tax)}</div>` : ''}
            <div class="grand-total">TOTALE: ${this.formatPrice(previewData.amount_total)}</div>
        </div>

        <!-- DDT -->
        ${previewData.ddt ? `
        <div class="separator"></div>
        <div class="bold">DDT: ${this.escapeHtml(previewData.ddt.name)}</div>
        ${previewData.ddt.date ? `<div>Data DDT: ${this.formatDate(new Date(previewData.ddt.date))}</div>` : ''}
        ${previewData.ddt.transport_condition ? `<div>Trasporto: ${this.escapeHtml(previewData.ddt.transport_condition)}</div>` : ''}
        ` : ''}

        <!-- Footer -->
        <div class="separator"></div>
        <div class="center small">
            ${previewData.note ? `<div>${this.escapeHtml(previewData.note)}</div>` : ''}
            <div>Grazie per la fiducia!</div>
            <br>
            <div>Stampato: ${this.formatDateTime(new Date())}</div>
        </div>
    </div>

    <script>
        // Auto-print se richiesto
        if (window.location.search.includes('print=true')) {
            window.print();
        }
    </script>
</body>
</html>
        `;
    }

    /**
     * Prepara dati per anteprima
     */
    preparePreviewData(orderData) {
        const date = orderData.date_order ? new Date(orderData.date_order) : new Date();

        return {
            company: orderData.company || {},
            orderName: orderData.name || 'N/A',
            orderDate: this.formatDate(date),
            orderTime: this.formatTime(date),
            agent: orderData.user_id ? (orderData.user_id[1] || orderData.user_id) : null,
            customer: orderData.customer || null,
            products: orderData.products || [],
            amount_untaxed: orderData.amount_untaxed || 0,
            amount_tax: orderData.amount_tax || 0,
            amount_total: orderData.amount_total || 0,
            ddt: orderData.ddt || null,
            note: orderData.note || ''
        };
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Invia ricevuta a stampante
     */
    async sendToPrinter(receiptData, printerOptions = {}) {
        const options = {
            deviceName: printerOptions.deviceName || 'default',
            encoding: printerOptions.encoding || this.options.encoding,
            ...printerOptions
        };

        if ('serial' in navigator) {
            // USB Serial (Chrome)
            return await this.printViaSerial(receiptData, options);
        } else if ('bluetooth' in navigator) {
            // Bluetooth
            return await this.printViaBluetooth(receiptData, options);
        } else {
            // Fallback: download come file
            this.downloadAsFile(receiptData, 'ricevuta.txt');
            return true;
        }
    }

    /**
     * Stampa via USB Serial
     */
    async printViaSerial(data, options) {
        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 9600 });

            const writer = port.writable.getWriter();
            const encoder = new TextEncoder();

            await writer.write(encoder.encode(data));

            writer.releaseLock();
            await port.close();

            return true;
        } catch (error) {
            console.error('Errore stampa USB:', error);
            throw error;
        }
    }

    /**
     * Stampa via Bluetooth
     */
    async printViaBluetooth(data, options) {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }]
            });

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

            const encoder = new TextEncoder();
            await characteristic.writeValue(encoder.encode(data));

            return true;
        } catch (error) {
            console.error('Errore stampa Bluetooth:', error);
            throw error;
        }
    }

    /**
     * Download come file
     */
    downloadAsFile(data, filename) {
        const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }
}

// Export per uso globale
window.ESCPOSGenerator = ESCPOSGenerator;

export { ESCPOSGenerator };
