<?php
/**
 * Controller per generazione ricevute con DDT
 * Gestisce chiamate da Odoo e frontend JavaScript
 */

class ReceiptController {

    /**
     * Genera ricevuta ESC/POS 48mm con DDT
     */
    public function generateEscPos48mm($orderData, $clientData, $companyData, $pickingData = [], $ddtData = [], $options = []) {
        // Prepara dati per template
        $quote = $this->prepareOrderData($orderData);
        $client = $this->prepareClientData($clientData);
        $companyData = $this->prepareCompanyData($companyData);
        $picking = $this->preparePickingData($pickingData);
        $ddt = $this->prepareDdtData($ddtData);
        $options = array_merge([
            'format' => '48mm',
            'include_signature' => true,
            'show_prices' => true,
            'show_ddt_details' => true,
            'debug' => false
        ], $options);

        // Genera content usando template
        ob_start();
        include __DIR__ . '/escpos/receipt_48mm_ddt.php';
        $content = ob_get_clean();

        return [
            'success' => true,
            'content' => $content,
            'format' => '48mm',
            'type' => 'escpos'
        ];
    }

    /**
     * Genera ricevuta ESC/POS 80mm standard
     */
    public function generateEscPos80mm($orderData, $clientData, $companyData, $options = []) {
        $quote = $this->prepareOrderData($orderData);
        $client = $this->prepareClientData($clientData);
        $companyData = $this->prepareCompanyData($companyData);
        $options = array_merge([
            'format' => '80mm',
            'include_signature' => true,
            'show_prices' => true
        ], $options);

        ob_start();
        include __DIR__ . '/escpos/receipt_80mm.php';
        $content = ob_get_clean();

        return [
            'success' => true,
            'content' => $content,
            'format' => '80mm',
            'type' => 'escpos'
        ];
    }

    /**
     * Genera ricevuta PDF con DDT
     */
    public function generatePdfWithDdt($orderData, $clientData, $companyData, $pickingData = [], $ddtData = [], $options = []) {
        $quote = $this->prepareOrderData($orderData);
        $client = $this->prepareClientData($clientData);
        $companyData = $this->prepareCompanyData($companyData);
        $picking = $this->preparePickingData($pickingData);
        $ddt = $this->prepareDdtData($ddtData);
        $options = array_merge([
            'format' => 'A4',
            'include_signature' => true,
            'show_prices' => true,
            'show_ddt_details' => true
        ], $options);

        ob_start();
        include __DIR__ . '/pdf/receipt_pdf_ddt.php';
        $content = ob_get_clean();

        return [
            'success' => true,
            'content' => $content,
            'format' => 'pdf',
            'type' => 'html'
        ];
    }

    /**
     * Entry point principale
     */
    public function generateReceipt($type, $format, $orderData, $clientData, $companyData, $additionalData = []) {
        try {
            switch ($type) {
                case 'escpos_48mm_ddt':
                    return $this->generateEscPos48mm(
                        $orderData, $clientData, $companyData,
                        $additionalData['picking'] ?? [],
                        $additionalData['ddt'] ?? [],
                        $additionalData['options'] ?? []
                    );

                case 'escpos_80mm':
                    return $this->generateEscPos80mm(
                        $orderData, $clientData, $companyData,
                        $additionalData['options'] ?? []
                    );

                case 'pdf_ddt':
                    return $this->generatePdfWithDdt(
                        $orderData, $clientData, $companyData,
                        $additionalData['picking'] ?? [],
                        $additionalData['ddt'] ?? [],
                        $additionalData['options'] ?? []
                    );

                default:
                    throw new Exception("Tipo ricevuta non supportato: $type");
            }
        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'type' => $type,
                'format' => $format
            ];
        }
    }

    // === METODI HELPER PREPARAZIONE DATI ===

    private function prepareOrderData($orderData) {
        $products = [];
        if (isset($orderData['products'])) {
            $products = is_string($orderData['products']) ?
                json_decode($orderData['products'], true) :
                $orderData['products'];
        }

        return [
            'id' => $orderData['id'] ?? null,
            'name' => $orderData['name'] ?? 'TEMP-' . date('YmdHis'),
            'local_id' => $orderData['local_id'] ?? null,
            'products' => $products,
            'state' => $orderData['state'] ?? 'draft',
            'date_order' => $orderData['date_order'] ?? date('Y-m-d H:i:s'),
            'validity_date' => $orderData['validity_date'] ?? date('Y-m-d', strtotime('+30 days')),
            'note' => $orderData['note'] ?? '',
            'general_notes' => $orderData['general_notes'] ?? '',
            'amount_total' => $orderData['amount_total'] ?? 0,
            'sync_status' => $orderData['sync_status'] ?? 'pending',
            'agent_id' => $orderData['agent_id'] ?? null,
            'agent_name' => $orderData['agent_name'] ?? 'Agente',
            'created_offline' => $orderData['created_offline'] ?? true,
            'synced' => $orderData['synced'] ?? false
        ];
    }

    private function prepareClientData($clientData) {
        return [
            'id' => $clientData['id'] ?? null,
            'name' => $clientData['name'] ?? 'Cliente',
            'display_name' => $clientData['display_name'] ?? $clientData['name'] ?? 'Cliente',
            'email' => $clientData['email'] ?? '',
            'phone' => $clientData['phone'] ?? '',
            'mobile' => $clientData['mobile'] ?? '',
            'street' => $clientData['street'] ?? '',
            'street2' => $clientData['street2'] ?? '',
            'city' => $clientData['city'] ?? '',
            'zip' => $clientData['zip'] ?? '',
            'state' => isset($clientData['state_id']) && is_array($clientData['state_id']) ? $clientData['state_id'][1] : '',
            'country' => isset($clientData['country_id']) && is_array($clientData['country_id']) ? $clientData['country_id'][1] : '',
            'vat' => $clientData['vat'] ?? '',
            'fiscal_code' => $clientData['codice_fiscale'] ?? '',
            'is_company' => $clientData['is_company'] ?? false
        ];
    }

    private function prepareCompanyData($companyData) {
        return [
            'id' => $companyData['id'] ?? null,
            'name' => $companyData['name'] ?? 'Azienda',
            'email' => $companyData['email'] ?? '',
            'phone' => $companyData['phone'] ?? '',
            'website' => $companyData['website'] ?? '',
            'street' => $companyData['street'] ?? '',
            'street2' => $companyData['street2'] ?? '',
            'city' => $companyData['city'] ?? '',
            'zip' => $companyData['zip'] ?? '',
            'state' => isset($companyData['state_id']) && is_array($companyData['state_id']) ? $companyData['state_id'][1] : '',
            'country' => isset($companyData['country_id']) && is_array($companyData['country_id']) ? $companyData['country_id'][1] : '',
            'vat' => $companyData['vat'] ?? '',
            'fiscal_code' => $companyData['codice_fiscale'] ?? ''
        ];
    }

    private function preparePickingData($pickingData) {
        if (empty($pickingData)) {
            return [
                'id' => null,
                'name' => 'PICK-AUTO-' . date('YmdHis'),
                'state' => 'draft',
                'scheduled_date' => date('Y-m-d H:i:s'),
                'location_dest_name' => 'Cliente',
                'tracking_ref' => '',
                'synced' => false
            ];
        }

        return [
            'id' => $pickingData['id'] ?? null,
            'name' => $pickingData['name'] ?? 'PICK-' . date('YmdHis'),
            'state' => $pickingData['state'] ?? 'draft',
            'scheduled_date' => $pickingData['scheduled_date'] ?? date('Y-m-d H:i:s'),
            'location_dest_name' => isset($pickingData['location_dest_id']) && is_array($pickingData['location_dest_id']) ? $pickingData['location_dest_id'][1] : 'Cliente',
            'tracking_ref' => $pickingData['carrier_tracking_ref'] ?? '',
            'synced' => $pickingData['synced'] ?? false
        ];
    }

    private function prepareDdtData($ddtData) {
        if (empty($ddtData)) {
            return [
                'id' => null,
                'name' => 'DDT-AUTO-' . date('YmdHis'),
                'state' => 'draft',
                'date' => date('Y-m-d'),
                'transport_reason' => 'Vendita',
                'goods_appearance' => 'Colli N.1',
                'transport_condition' => 'Porto Assegnato',
                'transport_method' => 'Destinatario',
                'carrier_name' => '',
                'carrier_vat' => '',
                'packages' => '1',
                'gross_weight' => '',
                'net_weight' => '',
                'transport_start_date' => date('Y-m-d'),
                'transport_start_time' => date('H:i'),
                'synced' => false
            ];
        }

        return [
            'id' => $ddtData['id'] ?? null,
            'name' => $ddtData['name'] ?? 'DDT-' . date('YmdHis'),
            'state' => $ddtData['state'] ?? 'draft',
            'date' => $ddtData['date'] ?? date('Y-m-d'),
            'transport_reason' => isset($ddtData['transport_reason_id']) && is_array($ddtData['transport_reason_id']) ? $ddtData['transport_reason_id'][1] : 'Vendita',
            'goods_appearance' => isset($ddtData['goods_appearance_id']) && is_array($ddtData['goods_appearance_id']) ? $ddtData['goods_appearance_id'][1] : 'Colli N.1',
            'transport_condition' => isset($ddtData['transport_condition_id']) && is_array($ddtData['transport_condition_id']) ? $ddtData['transport_condition_id'][1] : 'Porto Assegnato',
            'transport_method' => isset($ddtData['transport_method_id']) && is_array($ddtData['transport_method_id']) ? $ddtData['transport_method_id'][1] : 'Destinatario',
            'carrier_name' => $ddtData['carrier_name'] ?? '',
            'carrier_vat' => $ddtData['carrier_vat'] ?? '',
            'packages' => $ddtData['packages'] ?? '1',
            'gross_weight' => $ddtData['gross_weight'] ?? '',
            'net_weight' => $ddtData['net_weight'] ?? '',
            'transport_start_date' => $ddtData['transport_start_date'] ?? date('Y-m-d'),
            'transport_start_time' => $ddtData['transport_start_time'] ?? date('H:i'),
            'synced' => $ddtData['synced'] ?? false
        ];
    }
}
