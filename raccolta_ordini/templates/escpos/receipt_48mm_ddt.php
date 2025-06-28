<?php
/**
 * Template ESC/POS per stampanti termiche 48mm con DDT integrato
 * Ottimizzato per larghezza ridotta (32 caratteri circa)
 * Include: Ordine + Picking + DDT + Note prodotto + Note ordine
 */

// Carica dati condivisi estesi con DDT
$receiptData = include __DIR__ . '/../shared/receipt_content_with_ddt.php';

// Inizializza stringa comandi ESC/POS
$escpos = '';

// Funzione helper per formattare testo a larghezza fissa
function formatText($text, $width = 32) {
    return wordwrap($text, $width, "\n", true);
}

// Funzione per centrare testo
function centerText($text, $width = 32) {
    $len = strlen($text);
    if ($len >= $width) return $text;
    $spaces = floor(($width - $len) / 2);
    return str_repeat(' ', $spaces) . $text;
}

// === HEADER AZIENDA ===
$escpos .= '<CENTER>';
$escpos .= '<BIG><BOLD>' . $receiptData['company']['name'] . '<BR>';
$escpos .= '<NORMAL>';

if (!empty($receiptData['company']['address'])) {
    $escpos .= $receiptData['company']['address'] . '<BR>';
}

if (!empty($receiptData['company']['city_line'])) {
    $cityLine = $receiptData['company']['city_line'];
    if (!empty($receiptData['company']['state'])) {
        $cityLine .= ' (' . $receiptData['company']['state'] . ')';
    }
    $escpos .= $cityLine . '<BR>';
}

// Contatti azienda centrati
if (!empty($receiptData['company']['phone'])) {
    $escpos .= 'Tel: ' . $receiptData['company']['phone'] . '<BR>';
}
if (!empty($receiptData['company']['email'])) {
    $escpos .= $receiptData['company']['email'] . '<BR>';
}
if (!empty($receiptData['company']['vat'])) {
    $escpos .= 'P.IVA: ' . $receiptData['company']['vat'] . '<BR>';
}

$escpos .= '<DLINE><BR>';

// === TITOLI DOCUMENTI INTEGRATI ===
$escpos .= '<CENTER><BOLD>ORDINE + DDT<BR>';
$escpos .= '<DLINE><BR>';

// === INFORMAZIONI DOCUMENTI ===
$escpos .= '<LEFT><NORMAL>';
$escpos .= '<BOLD>DOCUMENTI:<BR>';
$escpos .= '<NORMAL>';
$escpos .= 'Ordine: ' . $receiptData['order']['name'] . '<BR>';
$escpos .= 'DDT: ' . $receiptData['ddt']['name'] . '<BR>';
$escpos .= 'Picking: ' . $receiptData['picking']['name'] . '<BR>';
$escpos .= 'Data: ' . $receiptData['document']['date'] . ' ' . $receiptData['document']['time'] . '<BR>';

// Stato documenti
$escpos .= '<SMALL>';
$escpos .= 'Stato Ordine: ' . $receiptData['order']['state_label'] . '<BR>';
$escpos .= 'Stato DDT: ' . $receiptData['ddt']['state_label'] . '<BR>';
$escpos .= '<NORMAL>';

$escpos .= '<LINE><BR>';

// === DATI CLIENTE ===
$escpos .= '<LEFT><BOLD><UNDERLINE>CLIENTE<BR>';
$escpos .= '<BOLD>' . $receiptData['client']['name'] . '<BR>';
$escpos .= '<NORMAL>';

// Contatti essenziali
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
if (!empty($receiptData['client']['fiscal_code']) && $receiptData['client']['fiscal_code'] !== $receiptData['client']['vat']) {
    $escpos .= 'C.F.: ' . $receiptData['client']['fiscal_code'] . '<BR>';
}

// Indirizzo sintetico
if (!empty($receiptData['client']['address_line1'])) {
    $escpos .= $receiptData['client']['address_line1'] . '<BR>';
}
if (!empty($receiptData['client']['address_line2'])) {
    $escpos .= $receiptData['client']['address_line2'] . '<BR>';
}

$escpos .= '<LINE><BR>';

// === PRODOTTI CON NOTE ===
$escpos .= '<LEFT><BOLD><UNDERLINE>PRODOTTI<BR>';
$escpos .= '<NORMAL>';

if ($receiptData['has_products']) {

    foreach ($receiptData['products'] as $index => $product) {
        $escpos .= '<BOLD>' . ($index + 1) . '. ' . $product['name'] . '<BR>';
        $escpos .= '<NORMAL>';

        // Quantità e unità di misura
        $qtyText = 'Qta: ' . intval($product['quantity'] ?? 1);
        if (!empty($product['uom_name'])) {
            $qtyText .= ' ' . $product['uom_name'];
        }
        $escpos .= $qtyText . '<BR>';

        // Prezzo se abilitato
        if ($receiptData['totals']['show_prices'] && !empty($product['price_formatted'])) {
            $escpos .= 'Prezzo: ' . $product['price_formatted'];
            if (!empty($product['subtotal_formatted'])) {
                $escpos .= ' (Tot: ' . $product['subtotal_formatted'] . ')';
            }
            $escpos .= '<BR>';
        }

        // Codice prodotto se presente
        if (!empty($product['default_code'])) {
            $escpos .= '<SMALL>Cod: ' . $product['default_code'] . '<BR>';
            $escpos .= '<NORMAL>';
        }

        // NOTE PRODOTTO - CARATTERISTICA RICHIESTA!
        if (!empty($product['note'])) {
            $escpos .= '<SMALL>Note: ';
            // Formatta note per 48mm (30 caratteri per note)
            $noteLines = explode("\n", formatText($product['note'], 30));
            foreach ($noteLines as $noteLine) {
                $escpos .= trim($noteLine) . '<BR>';
            }
            $escpos .= '<NORMAL>';
        }

        // Separatore tra prodotti
        if ($index < count($receiptData['products']) - 1) {
            $escpos .= '<LINE0><BR>';
        }
    }

    $escpos .= '<LINE><BR>';
    $escpos .= '<RIGHT><BOLD>Tot. Articoli: ' . $receiptData['product_count'] . '<BR>';
    $escpos .= '<LEFT><NORMAL>';

} else {
    $escpos .= '<CENTER><SMALL>Nessun prodotto<BR>';
    $escpos .= '<NORMAL><LEFT>';
}

// === NOTE ORDINE - CARATTERISTICA RICHIESTA! ===
if ($receiptData['has_order_notes']) {
    $escpos .= '<BR><LEFT><BOLD><UNDERLINE>NOTE ORDINE<BR>';
    $escpos .= '<NORMAL>';

    // Formatta note ordine per 48mm (30 caratteri)
    $noteLines = explode("\n", formatText($receiptData['order_notes'], 30));
    foreach ($noteLines as $line) {
        $escpos .= trim($line) . '<BR>';
    }
    $escpos .= '<BR>';
}

// === ISTRUZIONI CONSEGNA ===
if (!empty($receiptData['delivery_instructions'])) {
    $escpos .= '<LEFT><BOLD><UNDERLINE>ISTRUZIONI CONSEGNA<BR>';
    $escpos .= '<NORMAL>';

    $instrLines = explode("\n", formatText($receiptData['delivery_instructions'], 30));
    foreach ($instrLines as $line) {
        $escpos .= trim($line) . '<BR>';
    }
    $escpos .= '<BR>';
}

// === DATI DDT ITALIANI - CARATTERISTICA PRINCIPALE! ===
$escpos .= '<LEFT><BOLD><UNDERLINE>DATI DDT<BR>';
$escpos .= '<NORMAL>';

// Informazioni DDT principali
$escpos .= 'Numero: ' . $receiptData['ddt']['name'] . '<BR>';
$escpos .= 'Data: ' . $receiptData['ddt']['date'] . '<BR>';

// Causali e modalità trasporto
$escpos .= '<BR><BOLD>TRASPORTO:<BR>';
$escpos .= '<NORMAL>';
$escpos .= 'Causale: ' . $receiptData['ddt']['transport_reason'] . '<BR>';
$escpos .= 'Aspetto: ' . $receiptData['ddt']['goods_appearance'] . '<BR>';
$escpos .= 'Condizioni: ' . $receiptData['ddt']['transport_condition'] . '<BR>';
$escpos .= 'Modalita: ' . $receiptData['ddt']['transport_method'] . '<BR>';

// Dati colli e peso
if (!empty($receiptData['ddt']['packages'])) {
    $escpos .= 'Colli: ' . $receiptData['ddt']['packages'] . '<BR>';
}

if (!empty($receiptData['ddt']['gross_weight'])) {
    $escpos .= 'Peso Lordo: ' . $receiptData['ddt']['gross_weight'] . ' Kg<BR>';
}

if (!empty($receiptData['ddt']['net_weight'])) {
    $escpos .= 'Peso Netto: ' . $receiptData['ddt']['net_weight'] . ' Kg<BR>';
}

// Vettore se presente
if (!empty($receiptData['ddt']['carrier_name'])) {
    $escpos .= '<BR><BOLD>VETTORE:<BR>';
    $escpos .= '<NORMAL>';
    $escpos .= $receiptData['ddt']['carrier_name'] . '<BR>';

    if (!empty($receiptData['ddt']['carrier_vat'])) {
        $escpos .= 'P.IVA: ' . $receiptData['ddt']['carrier_vat'] . '<BR>';
    }
}

// Orario trasporto
$escpos .= '<BR><BOLD>TRASPORTO INIZIATO:<BR>';
$escpos .= '<NORMAL>';
$escpos .= 'Data: ' . $receiptData['ddt']['transport_start_date'] . '<BR>';
$escpos .= 'Ora: ' . $receiptData['ddt']['transport_start_time'] . '<BR>';

$escpos .= '<LINE><BR>';

// === TOTALI SE ABILITATI ===
if ($receiptData['totals']['show_prices']) {
    $escpos .= '<RIGHT><BOLD>';
    $escpos .= 'Subtotale: ' . $receiptData['totals']['currency'] . $receiptData['totals']['subtotal'] . '<BR>';

    if ($receiptData['totals']['tax_amount_raw'] > 0) {
        $escpos .= 'IVA (' . $receiptData['totals']['tax_rate'] . '%): ' .
                   $receiptData['totals']['currency'] . $receiptData['totals']['tax_amount'] . '<BR>';
    }

    $escpos .= '<BIG>TOTALE: ' . $receiptData['totals']['currency'] . $receiptData['totals']['total'] . '<BR>';
    $escpos .= '<NORMAL><LEFT>';
    $escpos .= '<LINE><BR>';
}

// === FIRMA DIGITALE ===
if ($receiptData['signature']['enabled']) {
    $escpos .= '<BR><CENTER><BOLD><UNDERLINE>FIRMA ACCETTAZIONE<BR>';
    $escpos .= '<LEFT><NORMAL><BR>';

    $firmaText = 'Il sottoscritto ' . $receiptData['signature']['customer_name'] .
                 ' dichiara di aver ricevuto la merce indicata e di accettare le condizioni.';
    $firmaLines = explode("\n", formatText($firmaText, 30));
    foreach ($firmaLines as $line) {
        $escpos .= trim($line) . '<BR>';
    }

    $escpos .= '<BR>Data: ___/___/______<BR>';
    $escpos .= '<BR>Firma Cliente:<BR>';
    $escpos .= '<BR><BR>';
    $escpos .= '________________________<BR>';

    // Se c'è firma digitale, mostra conferma
    if ($receiptData['signature']['has_signature']) {
        $escpos .= '<BR><CENTER><SMALL>*** FIRMA DIGITALE ACQUISITA ***<BR>';
        $escpos .= '<NORMAL><LEFT>';
    }
}

// === SPAZIO FIRME DDT ===
$escpos .= '<BR><CENTER><BOLD><UNDERLINE>FIRME DDT<BR>';
$escpos .= '<LEFT><NORMAL><BR>';

$escpos .= 'Firma Vettore:<BR>';
$escpos .= '<BR>';
$escpos .= '___________________<BR>';
$escpos .= '<BR>';

$escpos .= 'Firma Destinatario:<BR>';
$escpos .= '<BR>';
$escpos .= '___________________<BR>';

// === FOOTER INFORMATIVO ===
$escpos .= '<BR><CENTER><DLINE><BR>';
$escpos .= '<SMALL>';
$escpos .= '<BOLD>RIEPILOGO DOCUMENTI<BR>';
$escpos .= '<NORMAL>';
$escpos .= 'Generato: ' . $receiptData['footer']['generated_date'] . '<BR>';
$escpos .= 'Operatore: ' . $receiptData['footer']['operator'] . '<BR>';

if (!empty($receiptData['footer']['agent_code'])) {
    $escpos .= 'Agente: ' . $receiptData['footer']['agent_code'] . '<BR>';
}

$escpos .= 'Sistema: ' . $receiptData['footer']['system'] . '<BR>';

// Stato sincronizzazione
$escpos .= '<BOLD>Sync: ' . $receiptData['footer']['sync_status'] . '<BR>';
$escpos .= '<NORMAL>';

// Disclaimer legale
$escpos .= '<BR><CENTER><BOLD>' . $receiptData['footer']['legal_disclaimer'] . '<BR>';
$escpos .= '<NORMAL>';

// Note privacy
if (!empty($receiptData['footer']['privacy_note'])) {
    $escpos .= '<SMALL>' . $receiptData['footer']['privacy_note'] . '<BR>';
    $escpos .= '<NORMAL>';
}

// Interlinea finale
$escpos .= '<BR>';

// === QR CODE O BARCODE (OPZIONALE) ===
if ($receiptData['options']['show_barcode'] && !empty($receiptData['options']['qr_code_data'])) {
    $escpos .= '<CENTER><BOLD>CODICE QR:<BR>';
    $escpos .= '<NORMAL>';
    // Placeholder per QR code - da implementare con libreria specifica
    $escpos .= '[QR: ' . substr($receiptData['options']['qr_code_data'], 0, 20) . '...]<BR>';
    $escpos .= '<BR>';
}

// === DEBUG INFO (SE ABILITATO) ===
if ($receiptData['options']['debug_mode']) {
    $escpos .= '<LEFT><SMALL>';
    $escpos .= '--- DEBUG INFO ---<BR>';
    $escpos .= 'Template: ' . $receiptData['meta']['template_version'] . '<BR>';
    $escpos .= 'Format: ' . $receiptData['meta']['format'] . '<BR>';
    $escpos .= 'Generated: ' . $receiptData['meta']['generated_at'] . '<BR>';

    if ($receiptData['options']['show_ids']) {
        $escpos .= 'Order ID: ' . ($receiptData['order']['id'] ?? 'N/A') . '<BR>';
        $escpos .= 'DDT ID: ' . ($receiptData['ddt']['id'] ?? 'N/A') . '<BR>';
        $escpos .= 'Picking ID: ' . ($receiptData['picking']['id'] ?? 'N/A') . '<BR>';
    }

    $escpos .= '<NORMAL>';
    $escpos .= '<BR>';
}

// === TAGLIO CARTA ===
$escpos .= '<CUT>';

// Output finale
echo $escpos;
?>
