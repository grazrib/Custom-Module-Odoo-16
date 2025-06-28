<?php
/**
 * Template PDF per DDT senza prezzi
 * Versione pura per documenti di trasporto
 * Supporta sia formato 48mm che 80mm (NO PREZZI)
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
    <title>DDT <?php echo htmlspecialchars($receiptData['ddt']['name']); ?></title>
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

        /* Products table */
        .products-table {
            width: 100%;
            border-collapse: collapse;
            margin: 2mm 0;
        }
        .products-table th,
        .products-table td {
            border: 1px solid #000;
            padding: 1mm;
            text-align: left;
            font-size: <?php echo $format === '48mm' ? '6pt' : '8pt'; ?>;
        }
        .products-table th {
            background-color: #f0f0f0;
            font-weight: bold;
        }
        .products-table .qty {
            text-align: right;
            width: 15%;
        }
        .products-table .code {
            width: 20%;
            font-size: <?php echo $format === '48mm' ? '5pt' : '7pt'; ?>;
        }

        /* Signature areas */
        .signature-area {
            margin-top: 5mm;
            padding: 2mm;
            border: 1px solid #000;
        }
        .signature-line {
            border-bottom: 1px solid #000;
            height: 8mm;
            margin: 2mm 0;
        }

        /* Footer */
        .footer {
            margin-top: 5mm;
            text-align: center;
            font-size: <?php echo $format === '48mm' ? '5pt' : '7pt'; ?>;
        }
    </style>
</head>
<body>
    <!-- HEADER AZIENDA -->
    <div class="center">
        <div class="big bold"><?php echo htmlspecialchars($receiptData['company']['name']); ?></div>
        
        <?php if (!empty($receiptData['company']['address'])): ?>
            <div><?php echo htmlspecialchars($receiptData['company']['address']); ?></div>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['company']['city_line'])): ?>
            <div>
                <?php if (!empty($receiptData['company']['zip'])): ?>
                    <?php echo htmlspecialchars($receiptData['company']['zip']); ?> 
                <?php endif; ?>
                <?php echo htmlspecialchars($receiptData['company']['city_line']); ?>
                <?php if (!empty($receiptData['company']['state'])): ?>
                    (<?php echo htmlspecialchars($receiptData['company']['state']); ?>)
                <?php endif; ?>
            </div>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['company']['phone'])): ?>
            <div>Tel: <?php echo htmlspecialchars($receiptData['company']['phone']); ?></div>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['company']['vat'])): ?>
            <div>P.IVA: <?php echo htmlspecialchars($receiptData['company']['vat']); ?></div>
        <?php endif; ?>
    </div>

    <div class="separator-double"></div>

    <!-- TITOLO DOCUMENTO -->
    <div class="center">
        <div class="big bold">DOCUMENTO DI TRASPORTO</div>
        <div class="small">Art. 8 DPR 627/1978</div>
    </div>

    <div class="separator"></div>

    <!-- INFORMAZIONI DOCUMENTO -->
    <table class="info-table">
        <tr>
            <td class="label">DDT N.:</td>
            <td class="bold"><?php echo htmlspecialchars($receiptData['ddt']['name']); ?></td>
        </tr>
        <tr>
            <td class="label">Picking N.:</td>
            <td><?php echo htmlspecialchars($receiptData['picking']['name']); ?></td>
        </tr>
        <tr>
            <td class="label">Data:</td>
            <td><?php echo $receiptData['document']['date']; ?> <?php echo $receiptData['document']['time']; ?></td>
        </tr>
        <tr>
            <td class="label">Stato:</td>
            <td><?php echo htmlspecialchars($receiptData['ddt']['state_label']); ?></td>
        </tr>
    </table>

    <div class="separator"></div>

    <!-- MITTENTE -->
    <div class="bold underline">MITTENTE</div>
    <div class="bold"><?php echo htmlspecialchars($receiptData['company']['name']); ?></div>
    
    <?php if (!empty($receiptData['company']['address'])): ?>
        <div><?php echo htmlspecialchars($receiptData['company']['address']); ?></div>
    <?php endif; ?>
    
    <div>
        <?php if (!empty($receiptData['company']['zip'])): ?>
            <?php echo htmlspecialchars($receiptData['company']['zip']); ?> 
        <?php endif; ?>
        <?php echo htmlspecialchars($receiptData['company']['city']); ?>
        <?php if (!empty($receiptData['company']['state'])): ?>
            (<?php echo htmlspecialchars($receiptData['company']['state']); ?>)
        <?php endif; ?>
    </div>
    
    <?php if (!empty($receiptData['company']['vat'])): ?>
        <div>P.IVA: <?php echo htmlspecialchars($receiptData['company']['vat']); ?></div>
    <?php endif; ?>

    <div class="separator"></div>

    <!-- DESTINATARIO -->
    <div class="bold underline">DESTINATARIO</div>
    <div class="bold"><?php echo htmlspecialchars($receiptData['client']['name']); ?></div>
    
    <?php if (!empty($receiptData['client']['street'])): ?>
        <div><?php echo htmlspecialchars($receiptData['client']['street']); ?></div>
    <?php endif; ?>
    
    <?php if (!empty($receiptData['client']['street2'])): ?>
        <div><?php echo htmlspecialchars($receiptData['client']['street2']); ?></div>
    <?php endif; ?>
    
    <?php if (!empty($receiptData['client']['city'])): ?>
        <div>
            <?php if (!empty($receiptData['client']['zip'])): ?>
                <?php echo htmlspecialchars($receiptData['client']['zip']); ?> 
            <?php endif; ?>
            <?php echo htmlspecialchars($receiptData['client']['city']); ?>
            <?php if (!empty($receiptData['client']['state'])): ?>
                (<?php echo htmlspecialchars($receiptData['client']['state']); ?>)
            <?php endif; ?>
        </div>
    <?php endif; ?>
    
    <?php if (!empty($receiptData['client']['phone'])): ?>
        <div>Tel: <?php echo htmlspecialchars($receiptData['client']['phone']); ?></div>
    <?php endif; ?>
    
    <?php if (!empty($receiptData['client']['vat'])): ?>
        <div>P.IVA: <?php echo htmlspecialchars($receiptData['client']['vat']); ?></div>
    <?php endif; ?>

    <div class="separator"></div>

    <!-- TABELLA PRODOTTI SENZA PREZZI -->
    <div class="bold underline">DESCRIZIONE MERCE TRASPORTATA</div>
    
    <table class="products-table">
        <thead>
            <tr>
                <th>N.</th>
                <th>Descrizione</th>
                <th>Codice</th>
                <th class="qty">Quantità</th>
                <th>UM</th>
            </tr>
        </thead>
        <tbody>
            <?php if (!empty($receiptData['products'])): ?>
                <?php foreach ($receiptData['products'] as $index => $product): ?>
                    <tr>
                        <td><?php echo $index + 1; ?></td>
                        <td>
                            <div class="bold"><?php echo htmlspecialchars($product['name']); ?></div>
                            <?php if (!empty($product['note'])): ?>
                                <div class="small">
                                    <?php 
                                    $notes = explode("\n", $product['note']);
                                    foreach ($notes as $note):
                                        if (trim($note)):
                                    ?>
                                        <div>• <?php echo htmlspecialchars(trim($note)); ?></div>
                                    <?php 
                                        endif;
                                    endforeach; 
                                    ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td class="code"><?php echo htmlspecialchars($product['code'] ?? ''); ?></td>
                        <td class="qty"><?php echo number_format($product['quantity'] ?? 1, 0); ?></td>
                        <td><?php echo htmlspecialchars($product['uom'] ?? 'pz'); ?></td>
                    </tr>
                <?php endforeach; ?>
            <?php else: ?>
                <tr>
                    <td colspan="5" class="center">Nessuna merce da trasportare</td>
                </tr>
            <?php endif; ?>
        </tbody>
    </table>

    <div class="separator"></div>

    <!-- DATI TRASPORTO -->
    <div class="bold underline">INFORMAZIONI TRASPORTO</div>
    
    <table class="info-table">
        <?php if (!empty($receiptData['ddt']['transport_reason'])): ?>
            <tr>
                <td class="label">Causale trasporto:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['transport_reason']); ?></td>
            </tr>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['ddt']['transport_method'])): ?>
            <tr>
                <td class="label">Trasporto a mezzo:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['transport_method']); ?></td>
            </tr>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['ddt']['transport_condition'])): ?>
            <tr>
                <td class="label">Condizioni:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['transport_condition']); ?></td>
            </tr>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['ddt']['goods_appearance'])): ?>
            <tr>
                <td class="label">Aspetto esteriore:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['goods_appearance']); ?></td>
            </tr>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['ddt']['packages_count'])): ?>
            <tr>
                <td class="label">Numero colli:</td>
                <td><?php echo htmlspecialchars($receiptData['ddt']['packages_count']); ?></td>
            </tr>
        <?php endif; ?>
        
        <?php if (!empty($receiptData['ddt']['gross_weight']) && $receiptData['ddt']['gross_weight'] > 0): ?>
            <tr>
                <td class="label">Peso lordo:</td>
                <td><?php echo number_format($receiptData['ddt']['gross_weight'], 2); ?> kg</td>
            </tr>
        <?php endif; ?>
    </table>

    <!-- NOTE -->
    <?php if (!empty($receiptData['order_notes'])): ?>
        <div class="separator"></div>
        <div class="bold underline">NOTE</div>
        <div>
            <?php 
            $noteLines = explode("\n", $receiptData['order_notes']);
            foreach ($noteLines as $noteLine):
                if (trim($noteLine)):
            ?>
                <div><?php echo htmlspecialchars(trim($noteLine)); ?></div>
            <?php 
                endif;
            endforeach; 
            ?>
        </div>
    <?php endif; ?>

    <!-- AGENTE -->
    <?php if (!empty($receiptData['order']['agent_name'])): ?>
        <div class="separator-dashed"></div>
        <div class="small">
            Agente: <?php echo htmlspecialchars($receiptData['order']['agent_name']); ?>
            <?php if (!empty($receiptData['order']['agent_code'])): ?>
                (Cod. <?php echo htmlspecialchars($receiptData['order']['agent_code']); ?>)
            <?php endif; ?>
        </div>
    <?php endif; ?>

    <!-- RIFERIMENTI -->
    <?php if (!empty($receiptData['order']['name'])): ?>
        <div class="small">
            Rif. Ordine: <?php echo htmlspecialchars($receiptData['order']['name']); ?>
        </div>
    <?php endif; ?>

    <div class="separator-double"></div>

    <!-- DICHIARAZIONI E FIRME -->
    <div class="signature-area">
        <div class="bold">Dichiarazione del conducente:</div>
        <div class="small">
            Il sottoscritto dichiara di aver ricevuto l'incarico del trasporto dal mittente
        </div>
        <div class="mt-2">Data partenza: _________________</div>
        
        <table style="width: 100%; margin-top: 3mm;">
            <tr>
                <td style="width: 50%; text-align: center;">
                    <div>Firma Mittente</div>
                    <div class="signature-line"></div>
                </td>
                <td style="width: 50%; text-align: center;">
                    <div>Firma Conducente</div>
                    <div class="signature-line"></div>
                </td>
            </tr>
        </table>
    </div>

    <div class="signature-area mt-2">
        <div class="bold">Dichiarazione del destinatario:</div>
        <div class="small">
            Il sottoscritto dichiara di aver ricevuto la merce in buono stato 
            e nelle quantità sopra indicate
        </div>
        <div class="mt-2">Data arrivo: _________________</div>
        
        <div style="text-align: center; margin-top: 3mm;">
            <div>Firma Destinatario</div>
            <div class="signature-line"></div>
        </div>
    </div>

    <!-- FOOTER -->
    <div class="footer mt-2">
        <div class="separator-dashed"></div>
        <div>Documento di trasporto ai sensi dell'art. 8 del DPR 14 agosto 1996, n. 472</div>
        <div>Stampato il: <?php echo $receiptData['document']['print_time']; ?></div>
    </div>
</body>
</html>