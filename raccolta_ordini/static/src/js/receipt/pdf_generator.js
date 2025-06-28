/**
 * Generatore PDF per Ricevute e DDT
 * Supporta layout A4 e formato ricevuta
 */
class PDFGenerator {
    constructor(options = {}) {
        this.options = {
            format: options.format || 'receipt', // 'receipt' | 'a4'
            orientation: options.orientation || 'portrait',
            language: options.language || 'it',
            ...options
        };

        // Verifica disponibilità libreria PDF
        this.pdfLibAvailable = typeof window.jsPDF !== 'undefined';

        if (!this.pdfLibAvailable) {
            console.warn('jsPDF non disponibile. PDF generati come HTML.');
        }
    }

    /**
     * Genera PDF ricevuta/DDT
     */
    async generatePDF(orderData, options = {}) {
        const pdfOptions = {
            type: options.type || 'receipt', // 'receipt' | 'ddt' | 'order'
            filename: options.filename || this.generateFilename(orderData, options.type),
            download: options.download !== false,
            ...options
        };

        if (this.pdfLibAvailable) {
            return await this.generateWithJsPDF(orderData, pdfOptions);
        } else {
            return await this.generateAsHTML(orderData, pdfOptions);
        }
    }

    /**
     * Genera PDF con jsPDF
     */
    async generateWithJsPDF(orderData, options) {
        const doc = new window.jsPDF({
            orientation: this.options.orientation,
            unit: 'mm',
            format: this.options.format === 'receipt' ? [80, 200] : 'a4'
        });

        // Configurazione font
        doc.setFont('helvetica');
        doc.setFontSize(10);

        let yPos = 10;
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 5;
        const contentWidth = pageWidth - (margin * 2);

        // Header azienda
        yPos = this.addCompanyHeader(doc, orderData.company || {}, yPos, pageWidth, margin);

        // Separatore
        yPos = this.addSeparator(doc, yPos, margin, contentWidth);

        // Info documento
        yPos = this.addDocumentInfo(doc, orderData, options.type, yPos, margin);

        // Cliente
        if (orderData.customer) {
            yPos = this.addCustomerInfo(doc, orderData.customer, yPos, margin);
        }

        // Separatore
        yPos = this.addSeparator(doc, yPos, margin, contentWidth);

        // Prodotti
        yPos = this.addProductTable(doc, orderData.products || [], yPos, margin, contentWidth);

        // Totali
        yPos = this.addTotals(doc, orderData, yPos, margin, contentWidth);

        // DDT info se richiesto
        if (options.type === 'ddt' && orderData.ddt) {
            yPos = this.addDDTInfo(doc, orderData.ddt, yPos, margin);
        }

        // Footer
        this.addFooter(doc, orderData, options, yPos, margin, contentWidth);

        // Download o return
        if (options.download) {
            doc.save(options.filename);
            return null;
        } else {
            return doc.output('blob');
        }
    }

    /**
     * Header azienda nel PDF
     */
    addCompanyHeader(doc, company, yPos, pageWidth, margin) {
        const centerX = pageWidth / 2;

        // Nome azienda
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(company.name || 'AZIENDA', centerX, yPos, { align: 'center' });
        yPos += 8;

        // Indirizzo
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        if (company.street) {
            doc.text(company.street, centerX, yPos, { align: 'center' });
            yPos += 5;
        }

        if (company.city || company.zip) {
            const cityLine = `${company.zip || ''} ${company.city || ''}`.trim();
            doc.text(cityLine, centerX, yPos, { align: 'center' });
            yPos += 5;
        }

        if (company.vat) {
            doc.text(`P.IVA: ${company.vat}`, centerX, yPos, { align: 'center' });
            yPos += 5;
        }

        if (company.phone) {
            doc.text(`Tel: ${company.phone}`, centerX, yPos, { align: 'center' });
            yPos += 5;
        }

        if (company.email) {
            doc.text(company.email, centerX, yPos, { align: 'center' });
            yPos += 5;
        }

        return yPos + 5;
    }

    /**
     * Info documento
     */
    addDocumentInfo(doc, orderData, type, yPos, margin) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');

        const titles = {
            receipt: 'RICEVUTA',
            ddt: 'DOCUMENTO DI TRASPORTO',
            order: 'ORDINE'
        };

        doc.text(titles[type] || 'DOCUMENTO', margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        // Numero documento
        doc.text(`Numero: ${orderData.name || 'N/A'}`, margin, yPos);
        yPos += 5;

        // Data
        const date = orderData.date_order ? new Date(orderData.date_order) : new Date();
        doc.text(`Data: ${this.formatDate(date)}`, margin, yPos);
        yPos += 5;

        // Agente
        if (orderData.user_id) {
            doc.text(`Agente: ${orderData.user_id[1] || orderData.user_id}`, margin, yPos);
            yPos += 5;
        }

        return yPos + 3;
    }

    /**
     * Info cliente
     */
    addCustomerInfo(doc, customer, yPos, margin) {
        doc.setFont('helvetica', 'bold');
        doc.text('CLIENTE:', margin, yPos);
        yPos += 5;

        doc.setFont('helvetica', 'normal');
        doc.text(customer.name || 'N/A', margin, yPos);
        yPos += 4;

        if (customer.street) {
            doc.text(customer.street, margin, yPos);
            yPos += 4;
        }

        if (customer.city || customer.zip) {
            const cityLine = `${customer.zip || ''} ${customer.city || ''}`.trim();
            doc.text(cityLine, margin, yPos);
            yPos += 4;
        }

        if (customer.vat) {
            doc.text(`P.IVA: ${customer.vat}`, margin, yPos);
            yPos += 4;
        }

        if (customer.phone) {
            doc.text(`Tel: ${customer.phone}`, margin, yPos);
            yPos += 4;
        }

        return yPos + 3;
    }

    /**
     * Tabella prodotti
     */
    addProductTable(doc, products, yPos, margin, contentWidth) {
        // Header tabella
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);

        const colWidths = this.getColumnWidths(contentWidth);
        let xPos = margin;

        // Header
        doc.text('DESCRIZIONE', xPos, yPos);
        xPos += colWidths.description;
        doc.text('QTÀ', xPos, yPos, { align: 'center' });
        xPos += colWidths.quantity;
        doc.text('PREZZO', xPos, yPos, { align: 'center' });
        xPos += colWidths.price;
        doc.text('TOTALE', xPos, yPos, { align: 'right' });

        yPos += 3;

        // Linea separatrice
        doc.line(margin, yPos, margin + contentWidth, yPos);
        yPos += 5;

        // Prodotti
        doc.setFont('helvetica', 'normal');

        products.forEach(product => {
            xPos = margin;

            // Nome prodotto (con wrap se necessario)
            const nameLines = this.wrapText(doc, product.name || '', colWidths.description - 2);
            nameLines.forEach((line, index) => {
                doc.text(line, xPos, yPos + (index * 4));
            });

            // Quantità
            xPos += colWidths.description;
            doc.text((product.quantity || 1).toString(), xPos, yPos, { align: 'center' });

            // Prezzo unitario
            xPos += colWidths.quantity;
            doc.text(this.formatPrice(product.price_unit || 0), xPos, yPos, { align: 'center' });

            // Totale riga
            xPos += colWidths.price;
            const subtotal = (product.price_unit || 0) * (product.quantity || 1);
            doc.text(this.formatPrice(subtotal), xPos, yPos, { align: 'right' });

            yPos += Math.max(4, nameLines.length * 4);

            // Codice prodotto se presente
            if (product.default_code) {
                doc.setFontSize(8);
                doc.text(`Cod: ${product.default_code}`, margin + 2, yPos);
                doc.setFontSize(9);
                yPos += 4;
            }

            yPos += 1; // Spaziatura tra righe
        });

        return yPos + 3;
    }

    /**
     * Totali
     */
    addTotals(doc, orderData, yPos, margin, contentWidth) {
        const rightAlign = margin + contentWidth;

        yPos = this.addSeparator(doc, yPos, margin, contentWidth);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        // Subtotale
        if (orderData.amount_untaxed) {
            doc.text(`Subtotale: ${this.formatPrice(orderData.amount_untaxed)}`, rightAlign, yPos, { align: 'right' });
            yPos += 5;
        }

        // IVA
        if (orderData.amount_tax) {
            doc.text(`IVA: ${this.formatPrice(orderData.amount_tax)}`, rightAlign, yPos, { align: 'right' });
            yPos += 5;
        }

        // Totale
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`TOTALE: ${this.formatPrice(orderData.amount_total || 0)}`, rightAlign, yPos, { align: 'right' });

        return yPos + 8;
    }

    /**
     * Info DDT
     */
    addDDTInfo(doc, ddt, yPos, margin) {
        yPos = this.addSeparator(doc, yPos, margin, contentWidth);

        doc.setFont('helvetica', 'bold');
        doc.text(`DDT: ${ddt.name || 'N/A'}`, margin, yPos);
        yPos += 5;

        doc.setFont('helvetica', 'normal');

        if (ddt.date) {
            doc.text(`Data DDT: ${this.formatDate(new Date(ddt.date))}`, margin, yPos);
            yPos += 4;
        }

        if (ddt.transport_condition) {
            doc.text(`Condizioni trasporto: ${ddt.transport_condition}`, margin, yPos);
            yPos += 4;
        }

        if (ddt.goods_appearance) {
            doc.text(`Aspetto beni: ${ddt.goods_appearance}`, margin, yPos);
            yPos += 4;
        }

        if (ddt.transport_reason) {
            doc.text(`Causale trasporto: ${ddt.transport_reason}`, margin, yPos);
            yPos += 4;
        }

        return yPos + 3;
    }

    /**
     * Footer documento
     */
    addFooter(doc, orderData, options, yPos, margin, contentWidth) {
        const pageHeight = doc.internal.pageSize.getHeight();
        const footerY = pageHeight - 20;

        // Note se presenti
        if (orderData.note) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            const noteLines = this.wrapText(doc, orderData.note, contentWidth);
            noteLines.forEach((line, index) => {
                doc.text(line, margin, footerY - (noteLines.length - index) * 4);
            });
        }

        // Timestamp generazione
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generato: ${this.formatDateTime(new Date())}`, margin, pageHeight - 5);
    }

    /**
     * Separatore
     */
    addSeparator(doc, yPos, margin, contentWidth) {
        doc.line(margin, yPos, margin + contentWidth, yPos);
        return yPos + 3;
    }

    /**
     * Larghezze colonne tabella
     */
    getColumnWidths(contentWidth) {
        if (this.options.format === 'receipt') {
            // Formato ricevuta: spazio limitato
            return {
                description: contentWidth * 0.45,
                quantity: contentWidth * 0.15,
                price: contentWidth * 0.20,
                total: contentWidth * 0.20
            };
        } else {
            // Formato A4: più spazio
            return {
                description: contentWidth * 0.50,
                quantity: contentWidth * 0.15,
                price: contentWidth * 0.175,
                total: contentWidth * 0.175
            };
        }
    }

    /**
     * Wrap testo per PDF
     */
    wrapText(doc, text, maxWidth) {
        if (!text) return [''];

        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const testWidth = doc.getTextWidth(testLine);

            if (testWidth <= maxWidth) {
                currentLine = testLine;
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

        return lines.length > 0 ? lines : [''];
    }

    /**
     * Genera come HTML se PDF non disponibile
     */
    async generateAsHTML(orderData, options) {
        const html = this.generateHTMLDocument(orderData, options);

        if (options.download) {
            this.downloadHTML(html, options.filename.replace('.pdf', '.html'));
            return null;
        } else {
            return new Blob([html], { type: 'text/html' });
        }
    }

    /**
     * Genera documento HTML completo
     */
    generateHTMLDocument(orderData, options) {
        const isReceipt = this.options.format === 'receipt';

        return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.getDocumentTitle(options.type)} - ${orderData.name || 'N/A'}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            font-size: ${isReceipt ? '12px' : '14px'};
            line-height: 1.4;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }

        .document {
            background: white;
            max-width: ${isReceipt ? '300px' : '800px'};
            margin: 0 auto;
            padding: ${isReceipt ? '15px' : '30px'};
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            border-radius: 8px;
        }

        .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #333;
        }

        .company-name {
            font-size: ${isReceipt ? '18px' : '24px'};
            font-weight: bold;
            margin-bottom: 8px;
            color: #2c3e50;
        }

        .company-info {
            font-size: ${isReceipt ? '11px' : '12px'};
            color: #666;
            line-height: 1.3;
        }

        .document-info {
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 5px;
        }

        .document-title {
            font-size: ${isReceipt ? '16px' : '20px'};
            font-weight: bold;
            margin-bottom: 10px;
            color: #2c3e50;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }

        .customer-info {
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            background: #fafafa;
        }

        .section-title {
            font-weight: bold;
            font-size: ${isReceipt ? '13px' : '16px'};
            margin-bottom: 10px;
            color: #2c3e50;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }

        .products-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: ${isReceipt ? '10px' : '12px'};
        }

        .products-table th,
        .products-table td {
            padding: ${isReceipt ? '6px 4px' : '10px 8px'};
            text-align: left;
            border-bottom: 1px solid #ddd;
        }

        .products-table th {
            background: #f8f9fa;
            font-weight: bold;
            border-bottom: 2px solid #333;
        }

        .products-table .qty,
        .products-table .price,
        .products-table .total {
            text-align: right;
        }

        .product-code {
            font-size: ${isReceipt ? '9px' : '11px'};
            color: #666;
            font-style: italic;
        }

        .totals {
            margin-top: 20px;
            text-align: right;
            border-top: 2px solid #333;
            padding-top: 15px;
        }

        .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 0 20px;
        }

        .grand-total {
            font-size: ${isReceipt ? '16px' : '18px'};
            font-weight: bold;
            color: #2c3e50;
            border-top: 1px solid #333;
            padding-top: 10px;
            margin-top: 10px;
        }

        .ddt-info {
            margin: 20px 0;
            padding: 15px;
            background: #e8f4f8;
            border-left: 4px solid #3498db;
            border-radius: 0 5px 5px 0;
        }

        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: ${isReceipt ? '10px' : '12px'};
            color: #666;
        }

        .notes {
            margin: 20px 0;
            padding: 15px;
            background: #fff9e6;
            border-left: 4px solid #f39c12;
            border-radius: 0 5px 5px 0;
            font-style: italic;
        }

        @media print {
            body {
                background: white;
                padding: 0;
            }

            .document {
                box-shadow: none;
                border-radius: 0;
                max-width: none;
                padding: 20px;
            }

            .no-print {
                display: none;
            }
        }

        @media screen and (max-width: 600px) {
            .document {
                margin: 10px;
                padding: 15px;
            }

            .products-table {
                font-size: 10px;
            }

            .products-table th,
            .products-table td {
                padding: 4px 2px;
            }
        }
    </style>
</head>
<body>
    <div class="document">
        <!-- Header -->
        <div class="header">
            <div class="company-name">${this.escapeHtml(orderData.company?.name || 'AZIENDA')}</div>
            <div class="company-info">
                ${orderData.company?.street ? `${this.escapeHtml(orderData.company.street)}<br>` : ''}
                ${orderData.company?.zip || orderData.company?.city ? `${orderData.company.zip || ''} ${orderData.company.city || ''}<br>` : ''}
                ${orderData.company?.vat ? `P.IVA: ${this.escapeHtml(orderData.company.vat)}<br>` : ''}
                ${orderData.company?.phone ? `Tel: ${this.escapeHtml(orderData.company.phone)}<br>` : ''}
                ${orderData.company?.email ? this.escapeHtml(orderData.company.email) : ''}
            </div>
        </div>

        <!-- Document Info -->
        <div class="document-info">
            <div class="document-title">${this.getDocumentTitle(options.type)}</div>
            <div class="info-row">
                <span><strong>Numero:</strong></span>
                <span>${this.escapeHtml(orderData.name || 'N/A')}</span>
            </div>
            <div class="info-row">
                <span><strong>Data:</strong></span>
                <span>${this.formatDate(orderData.date_order ? new Date(orderData.date_order) : new Date())}</span>
            </div>
            ${orderData.user_id ? `
            <div class="info-row">
                <span><strong>Agente:</strong></span>
                <span>${this.escapeHtml(orderData.user_id[1] || orderData.user_id)}</span>
            </div>
            ` : ''}
        </div>

        <!-- Customer -->
        ${orderData.customer ? `
        <div class="customer-info">
            <div class="section-title">CLIENTE</div>
            <div><strong>${this.escapeHtml(orderData.customer.name || 'N/A')}</strong></div>
            ${orderData.customer.street ? `<div>${this.escapeHtml(orderData.customer.street)}</div>` : ''}
            ${orderData.customer.zip || orderData.customer.city ? `<div>${orderData.customer.zip || ''} ${orderData.customer.city || ''}</div>` : ''}
            ${orderData.customer.vat ? `<div>P.IVA: ${this.escapeHtml(orderData.customer.vat)}</div>` : ''}
            ${orderData.customer.phone ? `<div>Tel: ${this.escapeHtml(orderData.customer.phone)}</div>` : ''}
        </div>
        ` : ''}

        <!-- Products -->
        <table class="products-table">
            <thead>
                <tr>
                    <th style="width: 50%">DESCRIZIONE</th>
                    <th style="width: 15%" class="qty">QTÀ</th>
                    <th style="width: 17.5%" class="price">PREZZO</th>
                    <th style="width: 17.5%" class="total">TOTALE</th>
                </tr>
            </thead>
            <tbody>
                ${(orderData.products || []).map(product => `
                <tr>
                    <td>
                        ${this.escapeHtml(product.name || '')}
                        ${product.default_code ? `<br><span class="product-code">Cod: ${this.escapeHtml(product.default_code)}</span>` : ''}
                    </td>
                    <td class="qty">${product.quantity || 1}</td>
                    <td class="price">${this.formatPrice(product.price_unit || 0)}</td>
                    <td class="total">${this.formatPrice((product.price_unit || 0) * (product.quantity || 1))}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        <!-- Totals -->
        <div class="totals">
            ${orderData.amount_untaxed ? `
            <div class="total-row">
                <span>Subtotale:</span>
                <span>${this.formatPrice(orderData.amount_untaxed)}</span>
            </div>
            ` : ''}
            ${orderData.amount_tax ? `
            <div class="total-row">
                <span>IVA:</span>
                <span>${this.formatPrice(orderData.amount_tax)}</span>
            </div>
            ` : ''}
            <div class="total-row grand-total">
                <span>TOTALE:</span>
                <span>${this.formatPrice(orderData.amount_total || 0)}</span>
            </div>
        </div>

        <!-- DDT Info -->
        ${options.type === 'ddt' && orderData.ddt ? `
        <div class="ddt-info">
            <div class="section-title">INFORMAZIONI DDT</div>
            <div><strong>DDT:</strong> ${this.escapeHtml(orderData.ddt.name || 'N/A')}</div>
            ${orderData.ddt.date ? `<div><strong>Data DDT:</strong> ${this.formatDate(new Date(orderData.ddt.date))}</div>` : ''}
            ${orderData.ddt.transport_condition ? `<div><strong>Condizioni trasporto:</strong> ${this.escapeHtml(orderData.ddt.transport_condition)}</div>` : ''}
            ${orderData.ddt.goods_appearance ? `<div><strong>Aspetto beni:</strong> ${this.escapeHtml(orderData.ddt.goods_appearance)}</div>` : ''}
            ${orderData.ddt.transport_reason ? `<div><strong>Causale trasporto:</strong> ${this.escapeHtml(orderData.ddt.transport_reason)}</div>` : ''}
        </div>
        ` : ''}

        <!-- Notes -->
        ${orderData.note ? `
        <div class="notes">
            <div class="section-title">NOTE</div>
            <div>${this.escapeHtml(orderData.note)}</div>
        </div>
        ` : ''}

        <!-- Footer -->
        <div class="footer">
            <div>Grazie per la fiducia!</div>
            <div style="margin-top: 10px;">
                <small>Documento generato il ${this.formatDateTime(new Date())}</small>
            </div>
        </div>

        <!-- Print Button -->
        <div class="no-print" style="text-align: center; margin-top: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                Stampa Documento
            </button>
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
     * Download HTML
     */
    downloadHTML(html, filename) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    /**
     * Genera nome file
     */
    generateFilename(orderData, type) {
        const prefix = {
            receipt: 'Ricevuta',
            ddt: 'DDT',
            order: 'Ordine'
        }[type] || 'Documento';

        const orderName = orderData.name ? orderData.name.replace(/[^a-zA-Z0-9]/g, '_') : 'N_A';
        const date = new Date().toISOString().split('T')[0];

        return `${prefix}_${orderName}_${date}.pdf`;
    }

    /**
     * Titolo documento
     */
    getDocumentTitle(type) {
        const titles = {
            receipt: 'RICEVUTA',
            ddt: 'DOCUMENTO DI TRASPORTO',
            order: 'ORDINE'
        };

        return titles[type] || 'DOCUMENTO';
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
        }).format(amount);
    }

    /**
     * Formatta data
     */
    formatDate(date) {
        if (!date) return '';
        return date.toLocaleDateString('it-IT');
    }

    /**
     * Formatta data e ora
     */
    formatDateTime(date) {
        if (!date) return '';
        return date.toLocaleString('it-IT');
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
     * Genera anteprima in nuova finestra
     */
    previewInNewWindow(orderData, options = {}) {
        const html = this.generateHTMLDocument(orderData, options);
        const newWindow = window.open('', '_blank', 'width=800,height=1000');

        if (newWindow) {
            newWindow.document.write(html);
            newWindow.document.close();
        } else {
            alert('Impossibile aprire nuova finestra. Controlla le impostazioni popup del browser.');
        }

        return newWindow;
    }

    /**
     * Converti HTML in PDF (richiede html2pdf o simili)
     */
    async convertHTMLToPDF(html, options = {}) {
        if (typeof window.html2pdf !== 'undefined') {
            const element = document.createElement('div');
            element.innerHTML = html;

            const opt = {
                margin: 10,
                filename: options.filename || 'documento.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                ...options.html2pdfOptions
            };

            return await window.html2pdf().set(opt).from(element).save();
        } else {
            throw new Error('html2pdf non disponibile');
        }
    }
}

// Export per uso globale
window.PDFGenerator = PDFGenerator;

export { PDFGenerator };
