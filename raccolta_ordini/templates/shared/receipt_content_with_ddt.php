<?php
/**
 * Template Contenuto Condiviso ESTESO con DDT e Note
 * Per Raccolta Ordini Offline con integrazione completa DDT
 *
 * Variabili disponibili:
 * - $quote: dati preventivo/ordine
 * - $client: dati cliente
 * - $companyData: dati azienda
 * - $picking: dati prelievo
 * - $ddt: dati DDT
 * - $options: opzioni formato
 */

// Prepara dati base
$orderName = $quote['name'] ?: 'RO-' . ($quote['local_id'] ?? 'TEMP');
$products = is_string($quote['products']) ? json_decode($quote['products'], true) : ($quote['products'] ?? []);

// Processa note prodotto
foreach ($products as &$product) {
    // Assicura che ogni prodotto abbia una chiave 'note'
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

// IVA standard 22% (da configurazione Odoo)
$taxRate = 0.22;
$taxAmount = $subtotal * $taxRate;
$total = $subtotal + $taxAmount;

// Determina se mostrare prezzi
$showPrices = $options['show_prices'] ?? true;

// Struttura dati ESTESA per il rendering
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
        'title' => 'ORDINE + DDT',
        'type' => 'Documento di Vendita',
        'date' => date('d/m/Y', strtotime($quote['date_order'] ?? 'now')),
        'time' => date('H:i', strtotime($quote['date_order'] ?? 'now')),
        'valid_until' => date('d/m/Y', strtotime('+30 days')),
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
        'agent_code' => $quote['agent_code'] ?? ''
    ],

    // PICKING
    'picking' => [
        'name' => $picking['name'] ?? 'PICK-' . ($quote['local_id'] ?? 'TEMP'),
        'id' => $picking['id'] ?? null,
        'state' => $picking['state'] ?? 'draft',
        'state_label' => [
            'draft' => 'Bozza',
            'waiting' => 'In Attesa',
            'confirmed' => 'Confermato',
            'assigned' => 'Assegnato',
            'done' => 'Completato',
            'cancel' => 'Annullato'
        ][$picking['state'] ?? 'draft'] ?? 'Sconosciuto',
        'scheduled_date' => isset($picking['scheduled_date']) ?
                           date('d/m/Y H:i', strtotime($picking['scheduled_date'])) :
                           date('d/m/Y H:i'),
        'location_dest_name' => $picking['location_dest_name'] ?? 'Cliente',
        'tracking_ref' => $picking['tracking_ref'] ?? ''
    ],

    // DDT - DATI COMPLETI ITALIANI
    'ddt' => [
        'name' => $ddt['name'] ?? 'DDT-' . ($quote['local_id'] ?? 'TEMP'),
        'id' => $ddt['id'] ?? null,
        'state' => $ddt['state'] ?? 'draft',
        'state_label' => [
            'draft' => 'Bozza',
            'confirm' => 'Confermato',
            'done' => 'Validato',
            'cancel' => 'Annullato'
        ][$ddt['state'] ?? 'draft'] ?? 'Sconosciuto',
        'date' => isset($ddt['date']) ? date('d/m/Y', strtotime($ddt['date'])) : date('d/m/Y'),

        // Dati trasporto italiani
        'transport_reason' => $ddt['transport_reason'] ?? 'Vendita',
        'transport_reason_code' => $ddt['transport_reason_code'] ?? 'V',
        'goods_appearance' => $ddt['goods_appearance'] ?? 'Colli N.1',
        'goods_appearance_code' => $ddt['goods_appearance_code'] ?? 'C',
        'transport_condition' => $ddt['transport_condition'] ?? 'Porto Assegnato',
        'transport_condition_code' => $ddt['transport_condition_code'] ?? 'A',
        'transport_method' => $ddt['transport_method'] ?? 'Destinatario',
        'transport_method_code' => $ddt['transport_method_code'] ?? 'D',

        // Dati vettore e trasporto
        'carrier_name' => $ddt['carrier_name'] ?? '',
        'carrier_vat' => $ddt['carrier_vat'] ?? '',
        'packages' => strval($ddt['packages'] ?? '1'),
        'gross_weight' => $ddt['gross_weight'] ?? '',
        'net_weight' => $ddt['net_weight'] ?? '',
        'volume' => $ddt['volume'] ?? '',

        // Timestamp trasporto
        'transport_start_date' => $ddt['transport_start_date'] ?? date('d/m/Y'),
        'transport_start_time' => $ddt['transport_start_time'] ?? date('H:i'),

        // Riferimenti
        'customer_order_ref' => $ddt['customer_order_ref'] ?? '',
        'delivery_note_ref' => $ddt['delivery_note_ref'] ?? '',

        // Firme
        'driver_signature' => $ddt['driver_signature'] ?? '',
        'recipient_signature' => $ddt['recipient_signature'] ?? '',

        'synced' => $ddt['synced'] ?? false
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

    // NOTE ORDINE - NUOVA SEZIONE
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
        'all_synced' => ($quote['synced'] ?? false) &&
                       ($picking['synced'] ?? false) &&
                       ($ddt['synced'] ?? false),
        'sync_status' => (($quote['synced'] ?? false) &&
                         ($picking['synced'] ?? false) &&
                         ($ddt['synced'] ?? false))
            ? 'SINCRONIZZATO' : 'DA SINCRONIZZARE',
        'sync_detail' => (($quote['synced'] ?? false) &&
                         ($picking['synced'] ?? false) &&
                         ($ddt['synced'] ?? false))
            ? 'Tutti i documenti sono stati sincronizzati con Odoo'
            : 'Alcuni documenti necessitano di sincronizzazione',

        // Disclaimer legale
        'legal_disclaimer' => 'Documento non fiscale - Non costituisce fattura',
        'privacy_note' => 'Documento riservato e confidenziale'
    ],

    // OPZIONI
    'options' => [
        'format' => $options['format'] ?? '48mm',
        'include_signature' => $options['include_signature'] ?? true,
        'signature_data' => $options['signature_data'] ?? null,
        'show_prices' => $showPrices,
        'show_ddt_details' => $options['show_ddt_details'] ?? true,
        'show_transport_info' => $options['show_transport_info'] ?? true,
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
        'format' => $options['format'] ?? '48mm',
        'locale' => 'it_IT',
        'timezone' => 'Europe/Rome',
        'encoding' => 'UTF-8'
    ]
];

// Return data per uso nei convertitori
return $receiptData;
?>
