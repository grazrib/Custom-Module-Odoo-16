/**
 * Document Creator - Gestione creazione documenti offline
 * Crea Ordini -> Picking -> DDT con numerazione corretta
 */

class DocumentCreator {
    constructor() {
        this.storage = null;
        this.counter = null;
        this.session = null;
    }

    /**
     * Inizializza con modelli necessari
     */
    initialize(storage, counter, session) {
        this.storage = storage;
        this.counter = counter;
        this.session = session;
    }

    /**
     * Crea ordine completo con picking e DDT
     */
    async createCompleteOrder(orderData) {
        try {
            // 1. Crea ordine di vendita
            const order = await this.createSaleOrder(orderData);

            // 2. Crea picking automatico
            const picking = await this.createPickingFromOrder(order);

            // 3. Crea DDT automatico
            const ddt = await this.createDdtFromPicking(picking, orderData.ddt_data || {});

            // 4. Collega tutti i documenti
            order.picking_ids = [picking.local_id];
            order.ddt_ids = [ddt.local_id];
            picking.ddt_ids = [ddt.local_id];

            // 5. Salva tutto
            await this.storage.saveOrder(order);
            await this.storage.savePicking(picking);
            await this.storage.saveDdt(ddt);

            return {
                success: true,
                order: order,
                picking: picking,
                ddt: ddt,
                message: 'Documenti creati con successo'
            };

        } catch (error) {
            console.error('Errore creazione documenti:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Crea ordine di vendita
     */
    async createSaleOrder(orderData) {
        // Genera numero ordine
        const numberInfo = await this.counter.getNextNumber('sale_order');

        // Genera ID locale unico
        const localId = this.generateLocalId('order');

        // Prepara dati ordine
        const order = {
            // Identificatori
            local_id: localId,
            name: numberInfo.formatted,
            number: numberInfo.number,

            // Stato e date
            state: 'draft',
            date_order: new Date().toISOString(),
            validity_date: this.calculateValidityDate(orderData.validity_days || 30),

            // Cliente
            partner_id: orderData.partner_id,
            partner_name: orderData.partner_name || '',
            partner_email: orderData.partner_email || '',
            partner_phone: orderData.partner_phone || '',

            // Indirizzo consegna
            partner_shipping_id: orderData.partner_shipping_id || orderData.partner_id,

            // Prodotti
            order_lines: this.prepareOrderLines(orderData.products || []),
            products: orderData.products || [], // Mantieni formato originale per compatibilità

            // Totali
            amount_untaxed: this.calculateUntaxed(orderData.products || []),
            amount_tax: this.calculateTax(orderData.products || []),
            amount_total: this.calculateTotal(orderData.products || []),

            // Note
            note: orderData.note || '',
            general_notes: orderData.general_notes || '',
            internal_notes: orderData.internal_notes || '',
            delivery_instructions: orderData.delivery_instructions || '',

            // Sessione e agente
            raccolta_session_id: this.session.id,
            user_id: this.session.user_id,
            agent_id: this.session.user_id,
            agent_code: this.counter.agentCode,
            agent_name: this.session.user_name || '',

            // Metadata offline
            created_offline: true,
            sync_status: 'pending',
            created_at: new Date().toISOString(),
            last_update: new Date().toISOString(),

            // Collegamenti
            picking_ids: [],
            ddt_ids: [],

            // Opzioni
            require_signature: orderData.require_signature || false,
            print_receipt: orderData.print_receipt !== false
        };

        return order;
    }

    /**
     * Crea picking da ordine
     */
    async createPickingFromOrder(order) {
        // Genera numero picking
        const numberInfo = await this.counter.getNextNumber('stock_picking');
        const localId = this.generateLocalId('picking');

        const picking = {
            // Identificatori
            local_id: localId,
            name: numberInfo.formatted,
            number: numberInfo.number,

            // Stato e date
            state: 'draft',
            scheduled_date: new Date().toISOString(),

            // Collegamenti
            origin: order.name,
            order_local_id: order.local_id,
            sale_id: order.local_id, // Per compatibilità

            // Partner
            partner_id: order.partner_id,
            partner_name: order.partner_name,

            // Movimenti stock
            move_lines: this.createMoveLines(order.order_lines, localId),

            // Ubicazioni (da configurazione)
            location_id: this.getSourceLocation(),
            location_dest_id: this.getDestLocation(),
            location_dest_name: 'Cliente',

            // Sessione
            raccolta_session_id: this.session.id,
            agent_id: this.session.user_id,

            // Metadata offline
            created_offline: true,
            sync_status: 'pending',
            created_at: new Date().toISOString(),
            last_update: new Date().toISOString(),

            // DDT
            ddt_ids: []
        };

        return picking;
    }

    /**
     * Crea DDT da picking
     */
    async createDdtFromPicking(picking, ddtData = {}) {
        // Genera numero DDT
        const numberInfo = await this.counter.getNextNumber('stock_delivery_note');
        const localId = this.generateLocalId('ddt');

        // Carica configurazioni DDT
        const ddtConfig = await this.storage.getDdtConfig() || {};

        const ddt = {
            // Identificatori
            local_id: localId,
            name: numberInfo.formatted,
            number: numberInfo.number,

            // Stato e date
            state: 'draft',
            date: new Date().toISOString().split('T')[0], // Solo data
            delivery_date: ddtData.delivery_date || new Date().toISOString().split('T')[0],

            // Collegamenti
            picking_local_id: picking.local_id,
            picking_ids: [picking.local_id],
            origin: picking.origin,

            // Partner
            partner_id: picking.partner_id,
            partner_name: picking.partner_name,
            partner_sender_id: this.getCompanyPartnerId(),

            // Dati trasporto italiani
            transport_reason_id: this.getDefaultTransportReason(ddtConfig),
            transport_reason: ddtData.transport_reason || 'Vendita',

            goods_appearance_id: this.getDefaultGoodsAppearance(ddtConfig),
            goods_appearance: ddtData.goods_appearance || 'Colli N.1',

            transport_condition_id: this.getDefaultTransportCondition(ddtConfig),
            transport_condition: ddtData.transport_condition || 'Porto Assegnato',

            transport_method_id: this.getDefaultTransportMethod(ddtConfig),
            transport_method: ddtData.transport_method || 'Destinatario',

            // Dettagli spedizione
            packages: ddtData.packages || '1',
            gross_weight: ddtData.gross_weight || '',
            net_weight: ddtData.net_weight || '',
            volume: ddtData.volume || '',

            // Vettore
            carrier_id: ddtData.carrier_id || null,
            carrier_name: ddtData.carrier_name || '',
            carrier_vat: ddtData.carrier_vat || '',

            // Timing trasporto
            transport_start_date: ddtData.transport_start_date || new Date().toISOString().split('T')[0],
            transport_start_time: ddtData.transport_start_time || new Date().toTimeString().split(' ')[0].substring(0,5),

            // Note
            note: ddtData.note || '',

            // Sessione
            raccolta_session_id: this.session.id,
            agent_id: this.session.user_id,

            // Metadata offline
            created_offline: true,
            sync_status: 'pending',
            created_at: new Date().toISOString(),
            last_update: new Date().toISOString()
        };

        return ddt;
    }

    /**
     * Prepara righe ordine da prodotti
     */
    prepareOrderLines(products) {
        return products.map((product, index) => ({
            local_id: this.generateLocalId('line'),
            sequence: index + 1,
            product_id: product.id,
            name: product.name,
            product_uom_qty: parseFloat(product.quantity) || 1,
            qty_delivered: 0,
            qty_invoiced: 0,
            price_unit: parseFloat(product.price_unit) || 0,
            discount: parseFloat(product.discount) || 0,
            tax_id: product.tax_id || null,
            note: product.note || '',
            product_code: product.default_code || '',
            created_at: new Date().toISOString()
        }));
    }

    /**
     * Crea movimenti di stock per picking
     */
    createMoveLines(orderLines, pickingLocalId) {
        return orderLines.map((line, index) => ({
            local_id: this.generateLocalId('move'),
            sequence: index + 1,
            picking_local_id: pickingLocalId,
            product_id: line.product_id,
            name: line.name,
            product_uom_qty: line.product_uom_qty,
            quantity_done: 0,
            state: 'draft',
            location_id: this.getSourceLocation(),
            location_dest_id: this.getDestLocation(),
            created_at: new Date().toISOString()
        }));
    }

    /**
     * Calcola subtotale senza tasse
     */
    calculateUntaxed(products) {
        return products.reduce((total, product) => {
            const qty = parseFloat(product.quantity) || 1;
            const price = parseFloat(product.price_unit) || 0;
            const discount = parseFloat(product.discount) || 0;
            const lineTotal = qty * price * (1 - discount / 100);
            return total + lineTotal;
        }, 0);
    }

    /**
     * Calcola tasse
     */
    calculateTax(products) {
        const untaxed = this.calculateUntaxed(products);
        return untaxed * 0.22; // IVA 22% standard
    }

    /**
     * Calcola totale
     */
    calculateTotal(products) {
        return this.calculateUntaxed(products) + this.calculateTax(products);
    }

    /**
     * Calcola data validità
     */
    calculateValidityDate(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
    }

    /**
     * Genera ID locale unico
     */
    generateLocalId(type) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `${type}_${timestamp}_${random}`;
    }

    /**
     * Ottiene ubicazione sorgente predefinita
     */
    getSourceLocation() {
        // Da configurazione o default
        return 'stock'; // WH/Stock
    }

    /**
     * Ottiene ubicazione destinazione predefinita
     */
    getDestLocation() {
        // Da configurazione o default
        return 'customer'; // Partners/Customers
    }

    /**
     * Ottiene ID partner azienda
     */
    getCompanyPartnerId() {
        // Da configurazione
        return 1; // Base partner
    }

    // === METODI DDT CONFIGURAZIONE ===

    getDefaultTransportReason(ddtConfig) {
        return ddtConfig.transport_reasons?.[0]?.id || null;
    }

    getDefaultGoodsAppearance(ddtConfig) {
        return ddtConfig.goods_appearances?.[0]?.id || null;
    }

    getDefaultTransportCondition(ddtConfig) {
        return ddtConfig.transport_conditions?.[0]?.id || null;
    }

    getDefaultTransportMethod(ddtConfig) {
        return ddtConfig.transport_methods?.[0]?.id || null;
    }

    // === METODI EDITING ===

    /**
     * Aggiorna ordine esistente
     */
    async updateOrder(localId, updates) {
        const order = await this.storage.getOrder(localId);
        if (!order) {
            throw new Error('Ordine non trovato');
        }

        // Applica aggiornamenti
        Object.assign(order, updates);
        order.last_update = new Date().toISOString();

        // Ricalcola totali se i prodotti sono cambiati
        if (updates.products || updates.order_lines) {
            const products = updates.products || order.products || [];
            order.amount_untaxed = this.calculateUntaxed(products);
            order.amount_tax = this.calculateTax(products);
            order.amount_total = this.calculateTotal(products);

            if (updates.products) {
                order.order_lines = this.prepareOrderLines(products);
            }
        }

        await this.storage.saveOrder(order);
        return order;
    }

    /**
     * Aggiorna picking esistente
     */
    async updatePicking(localId, updates) {
        const picking = await this.storage.getPicking(localId);
        if (!picking) {
            throw new Error('Picking non trovato');
        }

        Object.assign(picking, updates);
        picking.last_update = new Date().toISOString();

        await this.storage.savePicking(picking);
        return picking;
    }

    /**
     * Aggiorna DDT esistente
     */
    async updateDdt(localId, updates) {
        const ddt = await this.storage.getDdt(localId);
        if (!ddt) {
            throw new Error('DDT non trovato');
        }

        Object.assign(ddt, updates);
        ddt.last_update = new Date().toISOString();

        await this.storage.saveDdt(ddt);
        return ddt;
    }

    // === METODI STATO ===

    /**
     * Conferma ordine
     */
    async confirmOrder(localId) {
        return this.updateOrder(localId, {
            state: 'sale',
            confirmation_date: new Date().toISOString()
        });
    }

    /**
     * Conferma picking
     */
    async confirmPicking(localId) {
        const picking = await this.updatePicking(localId, {
            state: 'confirmed'
        });

        // Aggiorna quantità done = quantità pianificata
        if (picking.move_lines) {
            picking.move_lines.forEach(move => {
                move.quantity_done = move.product_uom_qty;
                move.state = 'done';
            });

            await this.storage.savePicking(picking);
        }

        return picking;
    }

    /**
     * Valida DDT
     */
    async validateDdt(localId) {
        return this.updateDdt(localId, {
            state: 'done',
            validation_date: new Date().toISOString()
        });
    }

    // === METODI UTILITY ===

    /**
     * Elimina documenti collegati
     */
    async deleteCompleteOrder(orderLocalId) {
        const order = await this.storage.getOrder(orderLocalId);
        if (!order) return false;

        // Elimina DDT collegati
        if (order.ddt_ids) {
            for (const ddtId of order.ddt_ids) {
                // TODO: Implementa eliminazione DDT
            }
        }

        // Elimina picking collegati
        if (order.picking_ids) {
            for (const pickingId of order.picking_ids) {
                // TODO: Implementa eliminazione picking
            }
        }

        // Elimina ordine
        // TODO: Implementa eliminazione ordine

        return true;
    }

    /**
     * Duplica ordine esistente
     */
    async duplicateOrder(originalLocalId) {
        const originalOrder = await this.storage.getOrder(originalLocalId);
        if (!originalOrder) {
            throw new Error('Ordine originale non trovato');
        }

        // Prepara dati per nuovo ordine
        const newOrderData = {
            partner_id: originalOrder.partner_id,
            partner_name: originalOrder.partner_name,
            products: originalOrder.products || [],
            note: originalOrder.note || '',
            general_notes: originalOrder.general_notes || '',
            delivery_instructions: originalOrder.delivery_instructions || ''
        };

        return this.createCompleteOrder(newOrderData);
    }

    /**
     * Validazione dati ordine
     */
    validateOrderData(orderData) {
        const errors = [];

        if (!orderData.partner_id) {
            errors.push('Cliente obbligatorio');
        }

        if (!orderData.products || orderData.products.length === 0) {
            errors.push('Almeno un prodotto obbligatorio');
        }

        // Valida prodotti
        if (orderData.products) {
            orderData.products.forEach((product, index) => {
                if (!product.id) {
                    errors.push(`Prodotto ${index + 1}: ID mancante`);
                }
                if (!product.quantity || product.quantity <= 0) {
                    errors.push(`Prodotto ${index + 1}: Quantità non valida`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

export { DocumentCreator };
