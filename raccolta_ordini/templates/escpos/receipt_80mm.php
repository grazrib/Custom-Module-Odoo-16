<?php
/**
 * Template ESC/POS per stampanti termiche 80mm
 * Versione standard senza DDT integrato
 */

// Carica dati condivisi base
$receiptData = include __DIR__ . '/../shared/receipt_content.php';

// Inizializza stringa comandi ESC/POS
$escpos = '';

// === HEADER AZIENDA ===
$escpos .= '<CENTER>';
$escpos .= '<BIG><BOLD>' . $receiptData['company']['name'] . '<BR>';
$escpos .= '<NORMAL>';

if (!empty($receiptData['company']['address'])) {
    $escpos .= $receiptData['company']['address'] . '<BR>';
}

if (!empty($receiptData['company']['city_line'])) {
    $escpos .= $receiptData['company']['city_line'] . '<BR>';
}

// Contatti azienda
if (!empty($receiptData['company']['phone'])) {
    $escpos .= 'Tel: ' . $receiptData['company']['phone'] . '<BR>';
}
if (!empty($receiptData['company']['email'])) {
    $escpos .= 'Email: ' . $receiptData['company']['email'] . '<BR>';
}
if (!empty($receiptData['company']['vat'])) {
    $escpos .= 'P.IVA: ' . $receiptData['company']['vat'] . '<BR>';
}

$escpos .= '<DLINE><BR>';

// === TITOLO DOCUMENTO ===
$escpos .= '<CENTER><BIG><BOLD>PREVENTIVO<BR>';
$escpos .= '<NORMAL><DLINE><BR>';

// === INFORMAZIONI DOCUMENTO ===
$escpos .= '<LEFT>';
$escpos .= 'Numero: ' . $receiptData['order']['name'] . '<BR>';
$escpos .= 'Data: ' . $receiptData['document']['date'] . ' ore ' . $receiptData['document']['time'] . '<BR>';
$escpos .= 'Valido fino: ' . $receiptData['document']['valid_until'] . '<BR>';

if (!empty($receiptData['order']['agent_name'])) {
    $escpos .= 'Agente: ' . $receiptData['order']['agent_name'] . '<BR>';
}

$escpos .= '<LINE><BR>';

// === DATI CLIENTE ===
$escpos .= '<LEFT><BOLD><UNDERLINE>CLIENTE<BR>';
$escpos .= '<BOLD>' . $receiptData['client']['name'] . '<BR>';
$escpos .= '<NORMAL>';

// Indirizzo cliente
if (!empty($receiptData['client']['street'])) {
    $escpos .= $receiptData['client']['street'] . '<BR>';
}
if (!empty($receiptData['client']['street2'])) {
    $escpos .= $receiptData['client']['street2'] . '<BR>';
}
if (!empty($receiptData['client']['city'])) {
    $cityLine = '';
    if (!empty($receiptData['client']['zip'])) {
        $cityLine .= $receiptData['client']['zip'] . ' ';
    }
    $cityLine .= $receiptData['client']['city'];
    if (!empty($receiptData['client']['state'])) {
        $cityLine .= ' (' . $receiptData['client']['state'] . ')';
    }
    $escpos .= $cityLine . '<BR>';
}

// Contatti
if (!empty($receiptData['client']['phone'])) {
    $escpos .= 'Tel: ' . $receiptData['client']['phone'] . '<BR>';
}
if (!empty($receiptData['client']['mobile']) && $receiptData['client']['mobile'] !== $receiptData['client']['phone']) {
    $escpos .= 'Cell: ' . $receiptData['client']['mobile'] . '<BR>';
}
if (!empty($receiptData['client']['email'])) {
    $escpos .= 'Email: ' . $receiptData['client']['email'] . '<BR>';
}

// Dati fiscali
if (!empty($receiptData['client']['vat'])) {
    $escpos .= 'P.IVA: ' . $receiptData['client']['vat'] . '<BR>';
}
if (!empty($receiptData['client']['fiscal_code'])) {
    $escpos .= 'C.F.: ' . $receiptData['client']['fiscal_code'] . '<BR>';
}

$escpos .= '<LINE><BR>';

// === PRODOTTI ===
$escpos .= '<LEFT><BOLD><UNDERLINE>PRODOTTI<BR>';
$escpos .= '<NORMAL>';

if (!empty($receiptData['products']) && count($receiptData['products']) > 0) {

    foreach ($receiptData['products'] as $index => $product) {
        // Nome prodotto
        $escpos .= '<BOLD>' . ($index + 1) . '. ' . $product['name'] . '<BR>';
        $escpos .= '<NORMAL>';

        // Codice prodotto se presente
        if (!empty($product['default_code'])) {
            $escpos .= '    Codice: ' . $product['default_code'] . '<BR>';
        }

        // Quantità e unità di misura
        $qtyText = '    Quantita: ' . intval($product['quantity'] ?? 1);
        if (!empty($product['uom_name'])) {
            $qtyText .= ' ' . $product['uom_name'];
        }
        $escpos .= $qtyText . '<BR>';

        // Prezzo se abilitato
        if ($receiptData['totals']['show_prices'] && !empty($product['price_formatted'])) {
            $escpos .= '    Prezzo unitario: ' . $product['price_formatted'] . '<BR>';
            if (!empty($product['subtotal_formatted'])) {
                $escpos .= '    Subtotale: ' . $product['subtotal_formatted'] . '<BR>';
            }
        }

        // Note prodotto
        if (!empty($product['note'])) {
            $escpos .= '    <UNDERLINE>Note:<BR>';
            // Formatta note per 80mm (48 caratteri)
            $noteLines = explode("\n", wordwrap($product['note'], 44, "\n", true));
            foreach ($noteLines as $noteLine) {
                $escpos .= '    ' . trim($noteLine) . '<BR>';
            }
        }

        // Separatore tra prodotti
        if ($index < count($receiptData['products']) - 1) {
            $escpos .= '<LINE0><BR>';
        }
    }

    $escpos .= '<LINE><BR>';
    $escpos .= '<RIGHT><BOLD>Totale Articoli: ' . $receiptData['product_count'] . '<BR>';
    $escpos .= '<LEFT><NORMAL>';

} else {
    $escpos .= '<CENTER><SMALL>Nessun prodotto inserito<BR>';
    $escpos .= '<NORMAL><LEFT>';
}

$escpos .= '<BR>';

// === NOTE ORDINE ===
if ($receiptData['has_order_notes']) {
    $escpos .= '<LEFT><BOLD><UNDERLINE>NOTE PREVENTIVO<BR>';
    $escpos .= '<NORMAL>';

    // Formatta note per 80mm (48 caratteri)
    $noteLines = explode("\n", wordwrap($receiptData['order_notes'], 44, "\n", true));
    foreach ($noteLines as $line) {
        $escpos .= trim($line) . '<BR>';
    }
    $escpos .= '<BR>';
}

// === TOTALI SE ABILITATI ===
if ($receiptData['totals']['show_prices']) {
    $escpos .= '<RIGHT><BOLD>';

    $escpos .= 'Subtotale: ' . $receiptData['totals']['currency'] . ' ' . $receiptData['totals']['subtotal'] . '<BR>';

    if ($receiptData['totals']['tax_amount_raw'] > 0) {
        $escpos .= 'IVA (' . $receiptData['totals']['tax_rate'] . '%): ' .
                   $receiptData['totals']['currency'] . ' ' . $receiptData['totals']['tax_amount'] . '<BR>';
    }

    $escpos .= '<BIG>TOTALE GENERALE: ' . $receiptData['totals']['currency'] . ' ' . $receiptData['totals']['total'] . '<BR>';
    $escpos .= '<NORMAL><LEFT>';
    $escpos .= '<LINE><BR>';
}

// === FIRMA ===
if ($receiptData['signature']['enabled']) {
    $escpos .= '<BR><CENTER><BOLD><UNDERLINE>ACCETTAZIONE PREVENTIVO<BR>';
    $escpos .= '<LEFT><NORMAL><BR>';

    $firmaText = 'Il sottoscritto ' . $receiptData['signature']['customer_name'] .
                 ' dichiara di aver preso visione del presente preventivo e di accettarne ' .
                 'integralmente le condizioni commerciali.';

    // Formatta testo firma per 80mm (44 caratteri)
    $firmaLines = explode("\n", wordwrap($firmaText, 44, "\n", true));
    foreach ($firmaLines as $line) {
        $escpos .= trim($line) . '<BR>';
    }

    $escpos .= '<BR>';
    $escpos .= 'Data: ___/___/______     Firma Cliente:<BR>';
    $escpos .= '<BR><BR>';
    $escpos .= '                    ________________________<BR>';

    // Se c'è firma digitale
    if ($receiptData['signature']['has_signature']) {
        $escpos .= '<BR><CENTER><SMALL>*** FIRMA DIGITALE ACQUISITA ***<BR>';
        $escpos .= '<NORMAL><LEFT>';
    }
}

// === FOOTER ===
$escpos .= '<BR><CENTER><DLINE><BR>';
$escpos .= '<SMALL>';
$escpos .= '<BOLD>INFORMAZIONI DOCUMENTO<BR>';
$escpos .= '<NORMAL>';
$escpos .= 'Generato il: ' . $receiptData['footer']['generated_date'] . '<BR>';
$escpos .= 'Operatore: ' . $receiptData['footer']['operator'] . '<BR>';

if (!empty($receiptData['footer']['agent_code'])) {
    $escpos .= 'Codice Agente: ' . $receiptData['footer']['agent_code'] . '<BR>';
}

$escpos .= 'Sistema: ' . $receiptData['footer']['system'] . '<BR>';

// Stato sincronizzazione
$escpos .= '<BOLD>Stato Sync: ' . $receiptData['footer']['sync_status'] . '<BR>';
$escpos .= '<NORMAL>';

// Disclaimer legale
$escpos .= '<BR><CENTER><BOLD>' . $receiptData['footer']['legal_disclaimer'] . '<BR>';
$escpos .= '<NORMAL>';

// Note privacy se presenti
if (!empty($receiptData['footer']['privacy_note'])) {
    $escpos .= '<SMALL>' . $receiptData['footer']['privacy_note'] . '<BR>';
    $escpos .= '<NORMAL>';
}

// Debug info se abilitato
if ($receiptData['options']['debug_mode']) {
    $escpos .= '<BR><SMALL>';
    $escpos .= '--- DEBUG INFO ---<BR>';
    $escpos .= 'Template: ' . $receiptData['meta']['template_version'] . '<BR>';
    $escpos .= 'Format: 80mm<BR>';
    $escpos .= 'Generated: ' . $receiptData['meta']['generated_at'] . '<BR>';

    if ($receiptData['options']['show_ids']) {
        $escpos .= 'Order ID: ' . ($receiptData['order']['id'] ?? 'N/A') . '<BR>';
    }

    $escpos .= '<NORMAL>';
}

// Spazio finale e taglio
$escpos .= '<BR><BR>';
$escpos .= '<CUT>';

// Output finale
echo $escpos;
?>
