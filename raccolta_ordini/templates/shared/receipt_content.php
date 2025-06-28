<?php
/**
 * Template Contenuto Condiviso BASE per ricevute standard
 * Versione semplificata senza DDT (per preventivi normali)
 *
 * Variabili disponibili:
 * - $quote: dati preventivo/ordine
 * - $client: dati cliente
 * - $companyData: dati azienda
 * - $options: opzioni formato
 */

// Prepara dati base
$orderName = $quote['name'] ?: 'PREV-' . ($quote['local_id'] ?? 'TEMP');
$products = is_string($quote['products']) ? json_decode($quote['products'], true) : ($quote['products'] ?? []);

// Processa note prodotto
foreach ($products as &$product) {
    if (!isset($product['note'])) {
        $product['note'] = '';
    }

    // Formatta prezzo se presente
    if (isset($product['price_unit'])) {
        $product['price_formatted'] = '€' . number_format(floatval($product['price_unit']), 2, ',', '.');
    }

    // Calcola subtotale riga
    if (isset($product['price_unit']) && isset($product['quantity'])) {
        $lineTotal = floatval($product['price_unit']) * floatval($product['quantity']);
        $product['subtotal_formatted'] = '€' . number_format($lineTotal, 2, ',', '.');
    }
}

// Calcola totali
$subtotal = 0;
$taxAmount = 0;
$total = 0;

foreach ($products as $product) {
    $price = floatval($product['price_unit'] ?? 0);
    $qty = floatval($product['quantity'] ?? 1);
    $lineTotal = $price * $qty;
    $subtotal += $lineTotal;
}

// IVA standard 22%
$taxRate = 0.22;
$taxAmount = $subtotal * $taxRate;
$total = $subtotal + $taxAmount;

// Determina se mostrare prezzi
$showPrices = $options['show_prices'] ?? true;

// Struttura dati BASE per il rendering
$receiptData = [
    // HEADER AZIENDA
    'company' => [
        'name' => strtoupper($companyData['name'] ?? 'AZIENDA'),
        'address' => $companyData['street'] ?? '',
        'street2' => $companyData['street2'] ?? '',
        'city_line' => trim(($companyData['zip'] ?? '') . ' ' . ($companyData['city'] ?? '')),
        'state' => $companyData['state'] ?? '',
        'phone' => $companyData['phone'] ?? '',
        'email' => $companyData['email'] ?? '',
        'vat' => $companyData['vat'] ?? '',
        'website' => $companyData['website'] ?? ''
    ],

    // DOCUMENTO BASE
    'document' => [
        'title' => 'PREVENTIVO',
        'type' => 'Preventivo di Vendita',
        'date' => date('d/m/Y', strtotime($quote['date_order'] ?? 'now')),
        'time' => date('H:i', strtotime($quote['date_order'] ?? 'now')),
        'valid_until' => date('d/m/Y', strtotime($quote['validity_date'] ?? '+30 days')),
        'fiscal_year' => date('Y')
    ],

    // ORDINE
    'order' => [
        'name' => $orderName,
        'id' => $quote['id'] ?? null,
        'local_id' => $quote['local_id'] ?? null,
        'state' => $quote['state'] ?? 'draft',
        'state_label' => [
            'draft' => 'Bozza',
            'sent' => 'Inviato',
            'sale' => 'Confermato',
            'done' => 'Completato',
            'cancel' => 'Annullato'
        ][$quote['state'] ?? 'draft'] ?? 'Sconosciuto',
        'user_code' => $quote['user_code'] ?? '',
        'agent_code' => $quote['agent_code'] ?? '',
        'agent_name' => $quote['agent_name'] ?? ''
    ],

    // CLIENTE
    'client' => [
        'name' => $quote['client_name'] ?? $client['name'] ?? '',
        'display_name' => $client['display_name'] ?? $client['name'] ?? '',
        'email' => $client['email'] ?? '',
        'phone' => $client['phone'] ?? '',
        'mobile' => $client['mobile'] ?? '',
        'vat' => $client['vat'] ?? '',
        'fiscal_code' => $client['fiscal_code'] ?? '',

        // Indirizzo completo
        'street' => $client['street'] ?? '',
        'street2' => $client['street2'] ?? '',
        'city' => $client['city'] ?? '',
        'zip' => $client['zip'] ?? '',
        'state' => $client['state'] ?? '',
        'country_id' => $client['country_id'] ?? 'Italia',

        // Indirizzo formattato
        'address_line1' => $client['street'] ?? '',
        'address_line2' => trim(($client['zip'] ?? '') . ' ' . ($client['city'] ?? '') .
                                ($client['state'] ? ' (' . $client['state'] . ')' : '')),

        // Dati business
        'is_company' => $client['is_company'] ?? false,
        'customer_rank' => $client['customer_rank'] ?? 0,
        'ref' => $client['ref'] ?? '',
        'website' => $client['website'] ?? ''
    ],

    // PRODOTTI CON NOTE
    'products' => $products,
    'product_count' => count($products),
    'has_products' => count($products) > 0,

    // NOTE ORDINE
    'order_notes' => $quote['general_notes'] ?? $quote['notes'] ?? '',
    'has_order_notes' => !empty($quote['general_notes'] ?? $quote['notes'] ?? ''),
    'internal_notes' => $quote['internal_notes'] ?? '',
    'delivery_instructions' => $quote['delivery_instructions'] ?? '',

    // TOTALI
    'totals' => [
        'show_prices' => $showPrices,
        'subtotal' => number_format($subtotal, 2, ',', '.'),
        'subtotal_raw' => $subtotal,
        'tax_rate' => $taxRate * 100,
        'tax_amount' => number_format($taxAmount, 2, ',', '.'),
        'tax_amount_raw' => $taxAmount,
        'total' => number_format($total, 2, ',', '.'),
        'total_raw' => $total,
        'currency' => '€'
    ],

    // FIRMA DIGITALE
    'signature' => [
        'enabled' => $options['include_signature'] ?? true,
        'required' => $options['signature_required'] ?? false,
        'data' => $options['signature_data'] ?? null,
        'has_signature' => !empty($options['signature_data']),
        'customer_name' => $client['name'] ?? 'Il Cliente'
    ],

    // FOOTER
    'footer' => [
        'generated_date' => date('d/m/Y H:i'),
        'operator' => $_SESSION['user']['name'] ?? $_SESSION['user']['username'] ?? 'Sistema',
        'agent_name' => $_SESSION['user']['name'] ?? '',
        'agent_code' => $quote['agent_code'] ?? '',
        'company_name' => $companyData['name'] ?? '',
        'system' => 'Raccolta Ordini Offline',
        'system_version' => '1.0.0',

        // Stato sincronizzazione
        'sync_status' => ($quote['synced'] ?? false) ? 'SINCRONIZZATO' : 'DA SINCRONIZZARE',
        'sync_detail' => ($quote['synced'] ?? false)
            ? 'Documento sincronizzato con Odoo'
            : 'Documento da sincronizzare con Odoo',

        // Disclaimer legale
        'legal_disclaimer' => 'Documento non fiscale - Non costituisce fattura',
        'privacy_note' => 'Documento riservato e confidenziale'
    ],

    // OPZIONI
    'options' => [
        'format' => $options['format'] ?? '80mm',
        'include_signature' => $options['include_signature'] ?? true,
        'signature_data' => $options['signature_data'] ?? null,
        'show_prices' => $showPrices,
        'show_barcode' => $options['show_barcode'] ?? false,
        'qr_code_data' => $options['qr_code_data'] ?? null,

        // Stile ricevuta
        'paper_width' => $options['format'] === '48mm' ? '48mm' : '80mm',
        'font_size' => $options['format'] === '48mm' ? 'small' : 'normal',
        'line_width' => $options['format'] === '48mm' ? 32 : 48,

        // Debug
        'debug_mode' => $options['debug'] ?? false,
        'show_ids' => $options['show_ids'] ?? false
    ],

    // METADATA
    'meta' => [
        'generated_at' => date('c'),
        'template_version' => '1.0.0',
        'format' => $options['format'] ?? '80mm',
        'locale' => 'it_IT',
        'timezone' => 'Europe/Rome',
        'encoding' => 'UTF-8'
    ]
];

// Return data per uso nei convertitori
return $receiptData;
?>
