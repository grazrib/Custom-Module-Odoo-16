<?php
/**
 * Template ESC/POS per stampanti termiche 80mm con DDT integrato - SENZA PREZZI
 * Versione per DDT puri senza informazioni commerciali
 * Include: Ordine + Picking + DDT + Note prodotto + Note ordine (NO PREZZI)
 * Larghezza: ~48 caratteri
 */

// Carica dati condivisi estesi con DDT
$receiptData = include __DIR__ . '/../shared/receipt_content_with_ddt.php';

// Inizializza stringa comandi ESC/POS
$escpos = '';

// Funzione helper per formattare testo a larghezza fissa 80mm
function formatText($text, $width = 48) {
    return wordwrap($text, $width, "\n", true);
}

// Funzione per centrare testo 80mm
function centerText($text, $width = 48) {
    $len = strlen($text);
    if ($len >= $width) return $text;
    $spaces = floor(($width - $len) / 2);
    return str_repeat(' ', $spaces) . $text;
}

// === HEADER AZIENDA ESTESO ===
$escpos .= '<CENTER>';
$escpos .= '<BIG><BOLD>' . $receiptData['company']['name'] . '<BR>';
$escpos .= '<NORMAL>';

// Indirizzo completo
if (!empty($receiptData['company']['address'])) {
    $escpos .= $receiptData['company']['address'] . '<BR>';
}
if (!empty($receiptData['company']['street2'])) {
    $escpos .= $receiptData['company']['street2'] . '<BR>';
}

if (!empty($receiptData['company']['city_line'])) {
    $cityLine = '';
    if (!empty($receiptData['company']['zip'])) {
        $cityLine .= $receiptData['company']['zip'] . ' ';
    }
    $cityLine .= $receiptData['company']['city_line'];
    if (!empty($receiptData['company']['state'])) {
        $cityLine .= ' (' . $receiptData['company']['state'] . ')';
    }
    $escpos .= $cityLine . '<BR>';
}

// Contatti azienda
if (!empty($receiptData['company']['phone'])) {
    $escpos .= 'Tel: ' . $receiptData['company']['phone'];
    if (!empty($receiptData['company']['fax'])) {
        $escpos .= ' - Fax: ' . $receiptData['company']['fax'];
    }
    $escpos .= '<BR>';
}

if (!empty($receiptData['company']['email'])) {
    $escpos .= 'Email: ' . $receiptData['company']['email'] . '<BR>';
}

if (!empty($receiptData['company']['website'])) {
    $escpos .= 'Web: ' . $receiptData['company']['website'] . '<BR>';
}

// Dati fiscali
if (!empty($receiptData['company']['vat'])) {
    $escpos .= 'P.IVA: ' . $receiptData['company']['vat'];
}
if (!empty($receiptData['company']['fiscal_code']) && 
    $receiptData['company']['fiscal_code'] !== $receiptData['company']['vat']) {
    $escpos .= ' - C.F.: ' . $receiptData['company']['fiscal_code'];
}
if (!empty($receiptData['company']['vat']) || !empty($receiptData['company']['fiscal_code'])) {
    $escpos .= '<BR>';
}

$escpos .= '<DLINE><BR>';

// === TITOLO DDT CENTRATO ===
$escpos .= '<CENTER><BIG><BOLD>DOCUMENTO DI TRASPORTO<BR>';
$escpos .= '<NORMAL><DLINE><BR>';

// === INFORMAZIONI DOCUMENTI IN TABELLA ===
$escpos .= '<LEFT><NORMAL>';
$escpos .= '<BOLD>RIFERIMENTI DOCUMENTO:<BR>';
$escpos .= '<NORMAL>';

// Layout tabellare per 80mm
$escpos .= 'DDT N.:      ' . str_pad($receiptData['ddt']['name'], 25, ' ', STR_PAD_RIGHT) . '<BR>';
$escpos .= 'Picking N.:  ' . str_pad($receiptData['picking']['name'], 25, ' ', STR_PAD_RIGHT) . '<BR>';
$escpos .= 'Data:        ' . $receiptData['document']['date'] . ' ' . $receiptData['document']['time'] . '<BR>';

// Stati
$escpos .= '<SMALL>';
$escpos .= 'Stato DDT:   ' . $receiptData['ddt']['state_label'] . '<BR>';
$escpos .= '<NORMAL>';

$escpos .= '<LINE><BR>';

// === MITTENTE ===
$escpos .= '<LEFT><BOLD><UNDERLINE>MITTENTE<BR>';
$escpos .= '<BOLD>' . $receiptData['company']['name'] . '<BR>';
$escpos .= '<NORMAL>';
if (!empty($receiptData['company']['address'])) {
    $escpos .= $receiptData['company']['address'] . '<BR>';
}
$cityLine = '';
if (!empty($receiptData['company']['zip'])) {
    $cityLine .= $receiptData['company']['zip'] . ' ';
}
if (!empty($receiptData['company']['city'])) {
    $cityLine .= $receiptData['company']['city'];
}
if (!empty($receiptData['company']['state'])) {
    $cityLine .= ' (' . $receiptData['company']['state'] . ')';
}
if ($cityLine) {
    $escpos .= $cityLine . '<BR>';
}
if (!empty($receiptData['company']['vat'])) {
    $escpos .= 'P.IVA: ' . $receiptData['company']['vat'] . '<BR>';
}

$escpos .= '<LINE><BR>';

// === DESTINATARIO ===
$escpos .= '<LEFT><BOLD><UNDERLINE>DESTINATARIO<BR>';
$escpos .= '<BOLD>' . $receiptData['client']['name'] . '<BR>';
$escpos .= '<NORMAL>';

// Indirizzo completo destinatario
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

// Contatti destinatario
$contacts = [];
if (!empty($receiptData['client']['phone'])) {
    $contacts[] = 'Tel: ' . $receiptData['client']['phone'];
}
if (!empty($receiptData['client']['mobile']) && 
    $receiptData['client']['mobile'] !== $receiptData['client']['phone']) {
    $contacts[] = 'Cell: ' . $receiptData['client']['mobile'];
}
if (!empty($contacts)) {
    $escpos .= implode(' - ', $contacts) . '<BR>';
}

if (!empty($receiptData['client']['email'])) {
    $escpos .= 'Email: ' . $receiptData['client']['email'] . '<BR>';
}

// Dati fiscali destinatario
if (!empty($receiptData['client']['vat'])) {
    $escpos .= 'P.IVA: ' . $receiptData['client']['vat'] . '<BR>';
}

$escpos .= '<LINE><BR>';

// === TABELLA PRODOTTI SENZA PREZZI ===
$escpos .= '<LEFT><BOLD><UNDERLINE>DESCRIZIONE MERCE TRASPORTATA<BR>';
$escpos .= '<NORMAL>';

// Header tabella (senza colonne prezzo)
$escpos .= '<SMALL>';
$escpos .= str_pad('N.', 3, ' ') . 
           str_pad('DESCRIZIONE', 28, ' ') . 
           str_pad('QTA', 8, ' ') . 
           str_pad('UM', 7, ' ') . '<BR>';
$escpos .= str_repeat('-', 46) . '<BR>';
$escpos .= '<NORMAL>';

if (!empty($receiptData['products'])) {
    foreach ($receiptData['products'] as $index => $product) {
        // Riga principale prodotto
        $num = str_pad(($index + 1) . '.', 3, ' ');
        $name = str_pad(substr($product['name'], 0, 28), 28, ' ');
        $qty = str_pad(number_format($product['quantity'] ?? 1, 0), 8, ' ', STR_PAD_LEFT);
        $uom = str_pad(substr($product['uom'] ?? 'pz', 0, 7), 7, ' ');
        
        $escpos .= $num . $name . $qty . $uom . '<BR>';
        
        // Codice prodotto
        if (!empty($product['code'])) {
            $escpos .= '<SMALL>   Cod: ' . $product['code'] . '<BR>';
        }
        
        // Note prodotto su righe separate
        if (!empty($product['note'])) {
            $noteLines = explode("\n", $product['note']);
            foreach ($noteLines as $noteLine) {
                if (trim($noteLine)) {
                    $wrappedNote = wordwrap('   * ' . trim($noteLine), 46, "\n   ", true);
                    $escpos .= '<SMALL>' . $wrappedNote . '<BR>';
                }
            }
            $escpos .= '<NORMAL>';
        }
    }
} else {
    $escpos .= '<CENTER><ITALIC>Nessuna merce da trasportare<BR>';
}

$escpos .= '<SMALL>' . str_repeat('-', 46) . '<BR>';
$escpos .= '<NORMAL>';

$escpos .= '<LINE><BR>';

// === DATI TRASPORTO ESTESI ===
$escpos .= '<LEFT><BOLD><UNDERLINE>INFORMAZIONI TRASPORTO<BR>';
$escpos .= '<NORMAL>';

$transportInfo = [];

// Causale trasporto
if (!empty($receiptData['ddt']['transport_reason'])) {
    $transportInfo[] = ['Causale trasporto:', $receiptData['ddt']['transport_reason']];
}

// Metodo trasporto  
if (!empty($receiptData['ddt']['transport_method'])) {
    $transportInfo[] = ['Trasporto a mezzo:', $receiptData['ddt']['transport_method']];
}

// Condizioni trasporto
if (!empty($receiptData['ddt']['transport_condition'])) {
    $transportInfo[] = ['Condizioni:', $receiptData['ddt']['transport_condition']];
}

// Aspetto beni
if (!empty($receiptData['ddt']['goods_appearance'])) {
    $transportInfo[] = ['Aspetto esteriore:', $receiptData['ddt']['goods_appearance']];
}

// Numero colli
if (!empty($receiptData['ddt']['packages_count'])) {
    $transportInfo[] = ['Numero colli:', $receiptData['ddt']['packages_count']];
}

// Peso lordo
if (!empty($receiptData['ddt']['gross_weight']) && $receiptData['ddt']['gross_weight'] > 0) {
    $transportInfo[] = ['Peso lordo:', number_format($receiptData['ddt']['gross_weight'], 2) . ' kg'];
}

// Stampa info trasporto in formato tabellare
foreach ($transportInfo as $info) {
    $label = str_pad($info[0], 20, ' ');
    $value = $info[1];
    $escpos .= $label . ' ' . $value . '<BR>';
}

$escpos .= '<LINE><BR>';

// === NOTE ORDINE ESTESE ===
if (!empty($receiptData['order_notes'])) {
    $escpos .= '<LEFT><BOLD><UNDERLINE>NOTE<BR>';
    $escpos .= '<NORMAL>';
    
    $noteLines = explode("\n", $receiptData['order_notes']);
    foreach ($noteLines as $noteLine) {
        if (trim($noteLine)) {
            $wrappedNote = wordwrap(trim($noteLine), 46, "\n", true);
            $escpos .= $wrappedNote . '<BR>';
        }
    }
    $escpos .= '<LINE><BR>';
}

// === AGENTE E RIFERIMENTI ===
$escpos .= '<LEFT><SMALL>';
if (!empty($receiptData['order']['agent_name'])) {
    $escpos .= 'Agente: ' . $receiptData['order']['agent_name'];
    if (!empty($receiptData['order']['agent_code'])) {
        $escpos .= ' (Cod. ' . $receiptData['order']['agent_code'] . ')';
    }
    $escpos .= '<BR>';
}

// Riferimenti ordine (senza importi)
if (!empty($receiptData['order']['name'])) {
    $escpos .= 'Rif. Ordine: ' . $receiptData['order']['name'] . '<BR>';
}

$escpos .= '<NORMAL>';

// === FOOTER DDT ESTESO ===
$escpos .= '<DLINE><BR>';
$escpos .= '<CENTER><SMALL>';
$escpos .= 'DOCUMENTO DI TRASPORTO<BR>';
$escpos .= 'ai sensi dell\'art. 8 del DPR 14 agosto 1996, n. 472<BR>';
$escpos .= 'e successive modificazioni<BR>';
$escpos .= '<BR>';

// Timestamp stampa
$escpos .= 'Documento stampato il: ' . $receiptData['document']['print_time'] . '<BR>';
$escpos .= '<NORMAL>';

// === SPAZIO FIRME ESTESO ===
$escpos .= '<BR><BR>';
$escpos .= '<LEFT><NORMAL>';

// Tabella firme
$escpos .= 'Dichiarazione del conducente:<BR>';
$escpos .= 'Il sottoscritto dichiara di aver ricevuto<BR>';
$escpos .= 'l\'incarico del trasporto dal mittente<BR>';
$escpos .= '<BR>';
$escpos .= 'Data partenza: _______________<BR>';
$escpos .= '<BR>';
$escpos .= 'Firma Mittente           Firma Conducente<BR>';
$escpos .= '<BR>';
$escpos .= '__________________    __________________<BR>';
$escpos .= '<BR><BR>';

$escpos .= 'Dichiarazione del destinatario:<BR>';
$escpos .= 'Il sottoscritto dichiara di aver ricevuto<BR>';
$escpos .= 'la merce in buono stato e nelle quantita<BR>';
$escpos .= 'sopra indicate<BR>';
$escpos .= '<BR>';
$escpos .= 'Data arrivo: _______________<BR>';
$escpos .= '<BR>';
$escpos .= 'Firma Destinatario<BR>';
$escpos .= '<BR>';
$escpos .= '________________________________________<BR>';

// === TAGLIO FINALE ===
$escpos .= '<BR><BR><BR>';
$escpos .= '<CUT>';

// Output del template ESC/POS
echo $escpos;
?>