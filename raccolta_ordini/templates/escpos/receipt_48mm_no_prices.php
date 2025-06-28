<?php
/**
 * Template ESC/POS per stampanti termiche 48mm con DDT integrato - SENZA PREZZI
 * Versione per DDT puri senza informazioni commerciali
 * Include: Ordine + Picking + DDT + Note prodotto + Note ordine (NO PREZZI)
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

// === TITOLO DDT (NO ORDINE COMMERCIALE) ===
$escpos .= '<CENTER><BOLD>DOCUMENTO DI TRASPORTO<BR>';
$escpos .= '<DLINE><BR>';

// === INFORMAZIONI DOCUMENTI ===
$escpos .= '<LEFT><NORMAL>';
$escpos .= '<BOLD>DOCUMENTO:<BR>';
$escpos .= '<NORMAL>';
$escpos .= 'DDT: ' . $receiptData['ddt']['name'] . '<BR>';
$escpos .= 'Picking: ' . $receiptData['picking']['name'] . '<BR>';
$escpos .= 'Data: ' . $receiptData['document']['date'] . ' ' . $receiptData['document']['time'] . '<BR>';

// Stato DDT
$escpos .= '<SMALL>';
$escpos .= 'Stato: ' . $receiptData['ddt']['state_label'] . '<BR>';
$escpos .= '<NORMAL>';

$escpos .= '<LINE><BR>';

// === DATI CLIENTE ===
$escpos .= '<LEFT><BOLD><UNDERLINE>DESTINATARIO<BR>';
$escpos .= '<BOLD>' . $receiptData['client']['name'] . '<BR>';
$escpos .= '<NORMAL>';

// Indirizzo completo per DDT
if (!empty($receiptData['client']['street'])) {
    $escpos .= $receiptData['client']['street'] . '<BR>';
}
if (!empty($receiptData['client']['street2'])) {
    $escpos .= $receiptData['client']['street2'] . '<BR>';
}
if (!empty($receiptData['client']['city'])) {
    $city = '';
    if (!empty($receiptData['client']['zip'])) {
        $city .= $receiptData['client']['zip'] . ' ';
    }
    $city .= $receiptData['client']['city'];
    if (!empty($receiptData['client']['state'])) {
        $city .= ' (' . $receiptData['client']['state'] . ')';
    }
    $escpos .= $city . '<BR>';
}

// Contatti
if (!empty($receiptData['client']['phone'])) {
    $escpos .= 'Tel: ' . $receiptData['client']['phone'] . '<BR>';
}
if (!empty($receiptData['client']['vat'])) {
    $escpos .= 'P.IVA: ' . $receiptData['client']['vat'] . '<BR>';
}

$escpos .= '<LINE><BR>';

// === PRODOTTI SENZA PREZZI ===
$escpos .= '<LEFT><BOLD><UNDERLINE>MERCE TRASPORTATA<BR>';
$escpos .= '<NORMAL>';

if (!empty($receiptData['products'])) {
    foreach ($receiptData['products'] as $index => $product) {
        $escpos .= '<BOLD>' . ($index + 1) . '. ' . $product['name'] . '<BR>';
        $escpos .= '<NORMAL>';
        
        // Solo quantità e UM (NO PREZZI)
        $escpos .= 'Qta: ' . intval($product['quantity'] ?? 1);
        if (!empty($product['uom'])) {
            $escpos .= ' ' . $product['uom'];
        }
        $escpos .= '<BR>';
        
        // Codice prodotto se presente
        if (!empty($product['code'])) {
            $escpos .= 'Cod: ' . $product['code'] . '<BR>';
        }
        
        // Note prodotto (importanti per DDT)
        if (!empty($product['note'])) {
            $noteLines = explode("\n", $product['note']);
            foreach ($noteLines as $noteLine) {
                if (trim($noteLine)) {
                    $escpos .= '<SMALL>* ' . trim($noteLine) . '<BR>';
                }
            }
        }
        
        // Spaziatura tra prodotti
        if ($index < count($receiptData['products']) - 1) {
            $escpos .= '<BR>';
        }
    }
} else {
    $escpos .= '<ITALIC>Nessun prodotto<BR>';
}

$escpos .= '<LINE><BR>';

// === DATI TRASPORTO DDT ===
$escpos .= '<LEFT><BOLD><UNDERLINE>TRASPORTO<BR>';
$escpos .= '<NORMAL>';

// Causale trasporto
if (!empty($receiptData['ddt']['transport_reason'])) {
    $escpos .= 'Causale: ' . $receiptData['ddt']['transport_reason'] . '<BR>';
}

// Metodo trasporto
if (!empty($receiptData['ddt']['transport_method'])) {
    $escpos .= 'Metodo: ' . $receiptData['ddt']['transport_method'] . '<BR>';
}

// Condizioni trasporto
if (!empty($receiptData['ddt']['transport_condition'])) {
    $escpos .= 'Condizioni: ' . $receiptData['ddt']['transport_condition'] . '<BR>';
}

// Aspetto beni
if (!empty($receiptData['ddt']['goods_appearance'])) {
    $escpos .= 'Aspetto: ' . $receiptData['ddt']['goods_appearance'] . '<BR>';
}

// Colli e peso
if (!empty($receiptData['ddt']['packages_count'])) {
    $escpos .= 'Colli: ' . $receiptData['ddt']['packages_count'] . '<BR>';
}

if (!empty($receiptData['ddt']['gross_weight']) && $receiptData['ddt']['gross_weight'] > 0) {
    $escpos .= 'Peso: ' . number_format($receiptData['ddt']['gross_weight'], 2) . ' kg<BR>';
}

$escpos .= '<LINE><BR>';

// === NOTE ORDINE ===
if (!empty($receiptData['order_notes'])) {
    $escpos .= '<LEFT><BOLD><UNDERLINE>NOTE<BR>';
    $escpos .= '<NORMAL><SMALL>';
    
    $noteLines = explode("\n", $receiptData['order_notes']);
    foreach ($noteLines as $noteLine) {
        if (trim($noteLine)) {
            $escpos .= trim($noteLine) . '<BR>';
        }
    }
    $escpos .= '<NORMAL>';
    $escpos .= '<LINE><BR>';
}

// === AGENTE ===
if (!empty($receiptData['order']['agent_name'])) {
    $escpos .= '<LEFT><SMALL>';
    $escpos .= 'Agente: ' . $receiptData['order']['agent_name'];
    if (!empty($receiptData['order']['agent_code'])) {
        $escpos .= ' (' . $receiptData['order']['agent_code'] . ')';
    }
    $escpos .= '<BR>';
    $escpos .= '<NORMAL>';
}

// === FOOTER DDT ===
$escpos .= '<DLINE><BR>';
$escpos .= '<CENTER><SMALL>';
$escpos .= 'Documento di trasporto<BR>';
$escpos .= 'Art. 8 DPR 627/1978<BR>';
$escpos .= '<BR>';

// Timestamp stampa
$escpos .= 'Stampato: ' . $receiptData['document']['print_time'] . '<BR>';
$escpos .= '<NORMAL>';

// === SPAZIO FIRME ===
$escpos .= '<BR><BR>';
$escpos .= '<LEFT><SMALL>';
$escpos .= 'Firma Mittente    Firma Vettore<BR>';
$escpos .= '<BR>';
$escpos .= '________________  ________________<BR>';
$escpos .= '<BR><BR>';
$escpos .= 'Firma Destinatario<BR>';
$escpos .= '<BR>';
$escpos .= '________________________________<BR>';
$escpos .= '<NORMAL>';

// === TAGLIO FINALE ===
$escpos .= '<BR><BR><BR>';
$escpos .= '<CUT>';

// Output del template ESC/POS
echo $escpos;
?>