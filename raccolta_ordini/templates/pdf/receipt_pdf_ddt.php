<?php
/**
 * Template PDF per ricevute con DDT integrato
 * Basato sui template ESC/POS ma ottimizzato per PDF
 * Supporta sia formato 48mm che 80mm
 */

// Carica dati condivisi con DDT
$receiptData = include __DIR__ . '/../shared/receipt_content_with_ddt.php';

// Determina larghezza in base al formato
$format = $receiptData['options']['format'] ?? '48mm';
$paperWidth = $format === '48mm' ? '48mm' : '80mm';
$contentWidth = $format === '48mm' ? '44mm' : '76mm';
$fontSize = $format === '48mm' ? '8pt' : '10pt';
$lineHeight = $format === '48mm' ? '1.1' : '1.2';

?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ricevuta <?php echo htmlspecialchars($receiptData['order']['name']); ?></title>
    <style>
        @page {
            size: <?php echo $paperWidth; ?> auto;
            margin: 2mm;
        }

        body {
            font-family: 'Courier New', 'Liberation Mono', monospace;
            font-size: <?php echo $fontSize; ?>;
            line-height: <?php echo $lineHeight; ?>;
            margin: 0;
            padding: 1mm;
            color: #000;
            width: <?php echo $contentWidth; ?>;
            background: white;
        }

        /* Layout Classes */
        .center { text-align: center; }
        .left { text-align: left; }
        .right { text-align: right; }
        .justify { text-align: justify; }

        /* Typography */
        .bold { font-weight: bold; }
        .normal { font-weight: normal; }
        .underline { text-decoration: underline; }
        .big {
            font-size: <?php echo $format === '48mm' ? '12pt' : '14pt'; ?>;
            font-weight: bold;
        }
        .small {
            font-size: <?php echo $format === '48mm' ? '6pt' : '8pt'; ?>;
        }

        /* Separators */
        .separator {
            border-top: 1px solid #000;
            margin: 2mm 0;
            height: 0;
        }
        .separator-double {
            border-top: 2px solid #000;
            margin: 2mm 0;
            height: 0;
        }
        .separator-dashed {
            border-top: 1px dashed #000;
            margin: 1mm 0;
            height: 0;
        }

        /* Spacing */
        .mb-1 { margin-bottom: 1mm; }
        .mb-2 { margin-bottom: 2mm; }
        .mt-1 { margin-top: 1mm; }
        .mt-2 { margin-top: 2mm; }
        .p-1 { padding: 1mm; }

        /* Tables */
        .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1mm 0;
        }
        .info-table td {
            padding: 0.5mm 1mm;
            vertical-align: top;
            font-size: <?php echo $format === '48mm' ? '7pt' : '9pt'; ?>;
        }
        .info-table .label {
            font-weight: bold;
            width: 30%;
        }

        /* Products */
        .product-item {
            margin: 1mm 0;
            padding: 0.5mm 0;
        }
        .product-item:not(:last-child) {
            border-bottom: 1px dotted #666;
        }

        /* Signature Area */
        .signature-area {
            margin: 3mm 0;
            min-height: 12mm;
            position: relative;
        }
        .signature-line {
            border-bottom: 1px solid #000;
            display: inline-block;
            width: 20mm;
            margin: 0 1mm;
        }

        /* Footer */
        .footer {
            margin-top: 3mm;
            font-size: <?php echo $format === '48mm' ? '6pt' : '7pt'; ?>;
        }

        /* No page break inside important sections */
        .no-break {
            page-break-inside: avoid;
        }

        /* Print specific */
        @media print {
            .no-print { display: none; }
        }

        /* Status indicators */
        .status-ok { color: #28a745; }
        .status-pending { color: #ffc107; }
        .status-error { color: #dc3545; }

        /* DDT specific styles */
        .ddt-section {
            background: #f8f9fa;
            padding: 1mm;
            margin: 1mm 0;
            border: 1px solid #dee2e6;
        }

        .transport-info {
            font-size: <?php echo $format === '48mm' ? '6pt' : '8pt'; ?>;
        }
    </style>
</head>
<body>

    <!-- Header Azienda -->
    <div class="center mb-2">
        <div class="big"><?php echo htmlspecialchars($receiptData['company']['name']); ?></div>

        <?php if (!empty($receiptData['company']['address'])): ?>
            <div><?php echo htmlspecialchars($receiptData['company']['address']); ?></div>
        <?php endif; ?>

        <?php if (!empty($receiptData['company']['city_line'])): ?>
            <div>
                <?php echo htmlspecialchars($receiptData['company']['city_line']); ?>
                <?php if (!empty($receiptData['company']['state'])): ?>
                    (<?php echo htmlspecialchars($receiptData['company']['state']); ?>)
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <div class="small mt-1">
            <?php if (!empty($receiptData['company']['phone'])): ?>
                Tel: <?php echo htmlspecialchars($receiptData['company']['phone']); ?><br>
            <?php endif; ?>

            <?php if (!empty($receiptData['company']['email'])): ?>
                <?php echo htmlspecialchars($receiptData['company']['email']); ?><br>
            <?php endif; ?>

            <?php if (!empty($receiptData['company']['vat'])): ?>
                P.IVA: <?php echo htmlspecialchars($receiptData['company']['vat']); ?>
            <?php endif; ?>
        </div>
    </div>

    <div class="separator-double"></div>

    <!-- Titolo Documenti -->
    <div class="center bold mb-2">
        <?php echo htmlspecialchars($receiptData['document']['title']); ?>
    </div>

    <div class="separator"></div>

    <!-- Informazioni Documenti -->
    <div class="mb-2 no-break">
        <div class="bold underline">DOCUMENTI:</div>
        <table class="info-table">
            <tr>
                <td class="label">Ordine:</td>
                <td><?php echo htmlspecialchars($receiptData['order']['name']); ?></td>
            </tr>
            <tr>
                <td class="label">DDT:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['name']); ?></td>
            </tr>
            <tr>
                <td class="label">Picking:</td>
                <td><?php echo htmlspecialchars($receiptData['picking']['name']); ?></td>
            </tr>
            <tr>
                <td class="label">Data/Ora:</td>
                <td><?php echo htmlspecialchars($receiptData['document']['date'] . ' ' . $receiptData['document']['time']); ?></td>
            </tr>
        </table>
    </div>

    <div class="separator"></div>

    <!-- Dati Cliente -->
    <div class="mb-2 no-break">
        <div class="bold underline">CLIENTE:</div>
        <div class="bold"><?php echo htmlspecialchars($receiptData['client']['name']); ?></div>

        <table class="info-table">
            <?php if (!empty($receiptData['client']['phone'])): ?>
            <tr>
                <td class="label">Telefono:</td>
                <td><?php echo htmlspecialchars($receiptData['client']['phone']); ?></td>
            </tr>
            <?php endif; ?>

            <?php if (!empty($receiptData['client']['email'])): ?>
            <tr>
                <td class="label">Email:</td>
                <td><?php echo htmlspecialchars($receiptData['client']['email']); ?></td>
            </tr>
            <?php endif; ?>

            <?php if (!empty($receiptData['client']['vat'])): ?>
            <tr>
                <td class="label">P.IVA:</td>
                <td><?php echo htmlspecialchars($receiptData['client']['vat']); ?></td>
            </tr>
            <?php endif; ?>

            <?php if (!empty($receiptData['client']['address_line1'])): ?>
            <tr>
                <td class="label">Indirizzo:</td>
                <td>
                    <?php echo htmlspecialchars($receiptData['client']['address_line1']); ?><br>
                    <?php if (!empty($receiptData['client']['address_line2'])): ?>
                        <?php echo htmlspecialchars($receiptData['client']['address_line2']); ?>
                    <?php endif; ?>
                </td>
            </tr>
            <?php endif; ?>
        </table>
    </div>

    <div class="separator"></div>

    <!-- Prodotti -->
    <div class="mb-2 no-break">
        <div class="bold underline">PRODOTTI:</div>

        <?php if ($receiptData['has_products']): ?>
            <?php foreach ($receiptData['products'] as $index => $product): ?>
                <div class="product-item">
                    <div class="bold">
                        <?php echo ($index + 1); ?>. <?php echo htmlspecialchars($product['name']); ?>
                    </div>

                    <table class="info-table">
                        <tr>
                            <td class="label">Quantità:</td>
                            <td>
                                <?php echo intval($product['quantity'] ?? 1); ?>
                                <?php if (!empty($product['uom_name'])): ?>
                                    <?php echo htmlspecialchars($product['uom_name']); ?>
                                <?php endif; ?>
                            </td>
                        </tr>

                        <?php if ($receiptData['totals']['show_prices'] && !empty($product['price_formatted'])): ?>
                        <tr>
                            <td class="label">Prezzo:</td>
                            <td>
                                <?php echo htmlspecialchars($product['price_formatted']); ?>
                                <?php if (!empty($product['subtotal_formatted'])): ?>
                                    (Tot: <?php echo htmlspecialchars($product['subtotal_formatted']); ?>)
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endif; ?>

                        <?php if (!empty($product['default_code'])): ?>
                        <tr>
                            <td class="label">Codice:</td>
                            <td><?php echo htmlspecialchars($product['default_code']); ?></td>
                        </tr>
                        <?php endif; ?>

                        <?php if (!empty($product['note'])): ?>
                        <tr>
                            <td class="label">Note:</td>
                            <td class="small"><?php echo nl2br(htmlspecialchars($product['note'])); ?></td>
                        </tr>
                        <?php endif; ?>
                    </table>
                </div>
            <?php endforeach; ?>

            <div class="separator-dashed"></div>
            <div class="right bold">
                Totale Articoli: <?php echo $receiptData['product_count']; ?>
            </div>

        <?php else: ?>
            <div class="center small">Nessun prodotto inserito</div>
        <?php endif; ?>
    </div>

    <!-- Note Ordine -->
    <?php if ($receiptData['has_order_notes']): ?>
        <div class="separator"></div>
        <div class="mb-2 no-break">
            <div class="bold underline">NOTE ORDINE:</div>
            <div class="small">
                <?php echo nl2br(htmlspecialchars($receiptData['order_notes'])); ?>
            </div>
        </div>
    <?php endif; ?>

    <!-- Istruzioni Consegna -->
    <?php if (!empty($receiptData['delivery_instructions'])): ?>
        <div class="separator"></div>
        <div class="mb-2 no-break">
            <div class="bold underline">ISTRUZIONI CONSEGNA:</div>
            <div class="small">
                <?php echo nl2br(htmlspecialchars($receiptData['delivery_instructions'])); ?>
            </div>
        </div>
    <?php endif; ?>

    <div class="separator"></div>

    <!-- Dati DDT -->
    <div class="mb-2 no-break ddt-section">
        <div class="bold underline">DATI DDT:</div>

        <table class="info-table transport-info">
            <tr>
                <td class="label">Numero DDT:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['name']); ?></td>
            </tr>
            <tr>
                <td class="label">Data DDT:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['date']); ?></td>
            </tr>
            <tr>
                <td class="label">Causale:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['transport_reason']); ?></td>
            </tr>
            <tr>
                <td class="label">Aspetto:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['goods_appearance']); ?></td>
            </tr>
            <tr>
                <td class="label">Condizioni:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['transport_condition']); ?></td>
            </tr>
            <tr>
                <td class="label">Modalità:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['transport_method']); ?></td>
            </tr>

            <?php if (!empty($receiptData['ddt']['packages'])): ?>
            <tr>
                <td class="label">Colli:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['packages']); ?></td>
            </tr>
            <?php endif; ?>

            <?php if (!empty($receiptData['ddt']['gross_weight'])): ?>
            <tr>
                <td class="label">Peso Lordo:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['gross_weight']); ?> Kg</td>
            </tr>
            <?php endif; ?>

            <?php if (!empty($receiptData['ddt']['carrier_name'])): ?>
            <tr>
                <td class="label">Vettore:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['carrier_name']); ?></td>
            </tr>
            <?php endif; ?>

            <tr>
                <td class="label">Trasporto iniziato:</td>
                <td>
                    <?php echo htmlspecialchars($receiptData['ddt']['transport_start_date']); ?>
                    ore <?php echo htmlspecialchars($receiptData['ddt']['transport_start_time']); ?>
                </td>
            </tr>
        </table>
    </div>

    <!-- Totali -->
    <?php if ($receiptData['totals']['show_prices']): ?>
        <div class="separator"></div>
        <div class="mb-2 no-break">
            <div class="right">
                <div>Subtotale: <?php echo $receiptData['totals']['currency'] . $receiptData['totals']['subtotal']; ?></div>

                <?php if ($receiptData['totals']['tax_amount_raw'] > 0): ?>
                    <div>IVA (<?php echo $receiptData['totals']['tax_rate']; ?>%):
                        <?php echo $receiptData['totals']['currency'] . $receiptData['totals']['tax_amount']; ?>
                    </div>
                <?php endif; ?>

                <div class="bold big">
                    TOTALE: <?php echo $receiptData['totals']['currency'] . $receiptData['totals']['total']; ?>
                </div>
            </div>
        </div>
    <?php endif; ?>

    <!-- Firma Cliente -->
    <?php if ($receiptData['signature']['enabled']): ?>
        <div class="separator"></div>
        <div class="mb-2 no-break">
            <div class="center bold underline">FIRMA ACCETTAZIONE</div>
            <div class="small justify mt-1">
                Il sottoscritto <?php echo htmlspecialchars($receiptData['signature']['customer_name']); ?>
                dichiara di aver ricevuto la merce indicata nel presente documento
                e di accettare tutte le condizioni.
            </div>

            <div class="signature-area">
                <div class="left">Data: ___/___/______</div>
                <div class="right">Firma Cliente: <span class="signature-line"></span></div>
            </div>

            <?php if ($receiptData['signature']['has_signature']): ?>
                <div class="center small">*** FIRMA DIGITALE ACQUISITA ***</div>
            <?php endif; ?>
        </div>
    <?php endif; ?>

    <!-- Spazio Firme DDT -->
    <div class="separator"></div>
    <div class="mb-2 no-break">
        <div class="center bold underline">FIRME DDT</div>

        <div class="signature-area">
            <table style="width: 100%;">
                <tr>
                    <td style="width: 50%; text-align: center;">
                        <div class="small">Firma Vettore</div>
                        <div style="margin-top: 8mm; border-bottom: 1px solid #000; height: 1px;"></div>
                    </td>
                    <td style="width: 50%; text-align: center;">
                        <div class="small">Firma Destinatario</div>
                        <div style="margin-top: 8mm; border-bottom: 1px solid #000; height: 1px;"></div>
                    </td>
                </tr>
            </table>
        </div>
    </div>

    <!-- Footer -->
    <div class="separator-double"></div>
    <div class="footer center">
        <div class="bold">RIEPILOGO DOCUMENTI</div>
        <div class="small">
            Generato: <?php echo htmlspecialchars($receiptData['footer']['generated_date']); ?><br>
            Operatore: <?php echo htmlspecialchars($receiptData['footer']['operator']); ?><br>

            <?php if (!empty($receiptData['footer']['agent_code'])): ?>
                Agente: <?php echo htmlspecialchars($receiptData['footer']['agent_code']); ?><br>
            <?php endif; ?>

            Sistema: <?php echo htmlspecialchars($receiptData['footer']['system']); ?><br>

            <span class="bold
                <?php echo $receiptData['footer']['all_synced'] ? 'status-ok' : 'status-pending'; ?>">
                Sync: <?php echo htmlspecialchars($receiptData['footer']['sync_status']); ?>
            </span><br>

            <div class="mt-1 bold">
                <?php echo htmlspecialchars($receiptData['footer']['legal_disclaimer']); ?>
            </div>

            <?php if (!empty($receiptData['footer']['privacy_note'])): ?>
                <div class="small">
                    <?php echo htmlspecialchars($receiptData['footer']['privacy_note']); ?>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- Debug Info -->
    <?php if ($receiptData['options']['debug_mode']): ?>
        <div class="separator"></div>
        <div class="small">
            <div class="bold">DEBUG INFO:</div>
            Template: <?php echo htmlspecialchars($receiptData['meta']['template_version']); ?><br>
            Format: <?php echo htmlspecialchars($receiptData['meta']['format']); ?><br>
            Generated: <?php echo htmlspecialchars($receiptData['meta']['generated_at']); ?><br>

            <?php if ($receiptData['options']['show_ids']): ?>
                Order ID: <?php echo htmlspecialchars($receiptData['order']['id'] ?? 'N/A'); ?><br>
                DDT ID: <?php echo htmlspecialchars($receiptData['ddt']['id'] ?? 'N/A'); ?><br>
                Picking ID: <?php echo htmlspecialchars($receiptData['picking']['id'] ?? 'N/A'); ?><br>
            <?php endif; ?>
        </div>
    <?php endif; ?>

</body>
</html>
