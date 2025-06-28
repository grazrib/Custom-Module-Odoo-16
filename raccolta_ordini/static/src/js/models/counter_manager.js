/**
 * Gestione Contatori Offline per Numerazione Documenti
 * Replica la logica di models/raccolta_counter.py lato client
 */

class CounterManager {
    constructor() {
        this.storage = null;
        this.agentId = null;
        this.agentCode = null;
        this.counters = new Map();
        this.reserved = new Map(); // Numeri prenotati per uso offline
    }

    /**
     * Inizializza il manager con storage e agente
     */
    async initialize(agentId, storage = null) {
        this.agentId = agentId;
        this.storage = storage || window.RaccoltaApp.getModel('storage');

        // Carica contatori esistenti
        await this.loadCounters();

        // Determina codice agente
        await this.determineAgentCode();

        console.log(`CounterManager inizializzato per agente ${this.agentCode} (ID: ${this.agentId})`);
    }

    /**
     * Carica contatori da storage
     */
    async loadCounters() {
        try {
            const savedCounters = await this.storage.getAllCounters(this.agentId);

            for (const counter of savedCounters) {
                this.counters.set(counter.key, {
                    value: counter.value,
                    reserved_until: counter.reserved_until || 0,
                    last_update: counter.updated_at
                });
            }

        } catch (error) {
            console.error('Errore caricamento contatori:', error);
        }
    }

    /**
     * Determina codice agente per numerazione
     */
    async determineAgentCode() {
        try {
            // Prova a ottenere da sessione corrente
            const session = await this.storage.getSession();
            if (session && session.agent_code) {
                this.agentCode = session.agent_code;
                return;
            }

            // Prova a ottenere da configurazione
            const config = await this.storage.getConfig();
            if (config && config.agent_code) {
                this.agentCode = config.agent_code;
                return;
            }

            // Fallback: genera codice basato su agent ID
            this.agentCode = this.generateAgentCode(this.agentId);

        } catch (error) {
            console.error('Errore determinazione codice agente:', error);
            this.agentCode = this.generateAgentCode(this.agentId);
        }
    }

    /**
     * Genera codice agente da ID
     */
    generateAgentCode(agentId) {
        const paddedId = String(agentId).padStart(3, '0');
        return `AG${paddedId}`;
    }

    /**
     * Ottiene prossimo numero per un tipo di documento
     */
    async getNextNumber(docType) {
        const counterKey = `${docType}_${this.agentId}`;

        // Verifica se abbiamo già un contatore
        if (!this.counters.has(counterKey)) {
            await this.initializeCounter(docType);
        }

        const counter = this.counters.get(counterKey);
        const nextValue = counter.value + 1;

        // Aggiorna contatore
        counter.value = nextValue;
        counter.last_update = new Date().toISOString();

        // Salva in storage
        await this.saveCounter(counterKey, counter);

        // Genera nome documento formattato
        const documentName = this.formatDocumentName(docType, nextValue);

        console.log(`Generato numero ${documentName} per ${docType}`);

        return {
            number: nextValue,
            formatted: documentName,
            counter_key: counterKey
        };
    }

    /**
     * Inizializza contatore per tipo documento
     */
    async initializeCounter(docType) {
        const counterKey = `${docType}_${this.agentId}`;

        const counter = {
            value: 0,
            reserved_until: 0,
            last_update: new Date().toISOString()
        };

        this.counters.set(counterKey, counter);
        await this.saveCounter(counterKey, counter);

        console.log(`Inizializzato contatore ${counterKey}`);
    }

    /**
     * Formatta nome documento secondo schema RO/AG001/001
     */
    formatDocumentName(docType, number) {
        const prefix = this.getDocumentPrefix(docType);
        const paddedNumber = String(number).padStart(3, '0');

        return `${prefix}/${this.agentCode}/${paddedNumber}`;
    }

    /**
     * Ottiene prefisso per tipo documento
     */
    getDocumentPrefix(docType) {
        const prefixes = {
            'sale_order': 'RO',
            'stock_picking': 'PICK',
            'stock_delivery_note': 'DDT',
            'purchase_order': 'PO',
            'account_move': 'INV'
        };

        return prefixes[docType] || docType.toUpperCase();
    }

    /**
     * Prenota range di numeri per uso offline
     */
    async reserveNumbers(docType, count = 10) {
        const counterKey = `${docType}_${this.agentId}`;

        if (!this.counters.has(counterKey)) {
            await this.initializeCounter(docType);
        }

        const counter = this.counters.get(counterKey);
        const startNumber = counter.value + 1;
        const endNumber = counter.value + count;

        // Aggiorna contatore
        counter.value = endNumber;
        counter.reserved_until = endNumber;
        counter.last_update = new Date().toISOString();

        // Salva range prenotato
        const reservedKey = `reserved_${docType}_${this.agentId}`;
        this.reserved.set(reservedKey, {
            start: startNumber,
            end: endNumber,
            current: startNumber,
            doc_type: docType
        });

        await this.saveCounter(counterKey, counter);

        console.log(`Prenotati numeri ${startNumber}-${endNumber} per ${docType}`);

        return {
            start: startNumber,
            end: endNumber,
            count: count
        };
    }

    /**
     * Ottiene prossimo numero da range prenotato
     */
    getNextReservedNumber(docType) {
        const reservedKey = `reserved_${docType}_${this.agentId}`;
        const reserved = this.reserved.get(reservedKey);

        if (!reserved || reserved.current > reserved.end) {
            return null; // Range esaurito
        }

        const number = reserved.current;
        reserved.current++;

        const documentName = this.formatDocumentName(docType, number);

        return {
            number: number,
            formatted: documentName,
            counter_key: `${docType}_${this.agentId}`
        };
    }

    /**
     * Verifica se abbiamo numeri prenotati disponibili
     */
    hasReservedNumbers(docType) {
        const reservedKey = `reserved_${docType}_${this.agentId}`;
        const reserved = this.reserved.get(reservedKey);

        return reserved && reserved.current <= reserved.end;
    }

    /**
     * Ottiene statistiche contatori
     */
    getCounterStats() {
        const stats = {};

        for (const [key, counter] of this.counters) {
            const parts = key.split('_');
            const docType = parts.slice(0, -1).join('_');

            stats[docType] = {
                current_value: counter.value,
                reserved_until: counter.reserved_until,
                last_update: counter.last_update,
                has_reserved: this.hasReservedNumbers(docType)
            };
        }

        return stats;
    }

    /**
     * Sincronizza contatori con server
     */
    async syncWithServer() {
        try {
            // Invia contatori locali al server
            const localCounters = {};

            for (const [key, counter] of this.counters) {
                localCounters[key] = {
                    value: counter.value,
                    agent_id: this.agentId,
                    last_update: counter.last_update
                };
            }

            const response = await this.rpc('/raccolta/sync_counters', {
                counters: localCounters,
                agent_id: this.agentId
            });

            if (response.success) {
                // Aggiorna con valori dal server
                await this.updateFromServer(response.server_counters);
                console.log('Contatori sincronizzati con successo');
                return true;
            }

        } catch (error) {
            console.error('Errore sincronizzazione contatori:', error);
            return false;
        }
    }

    /**
     * Aggiorna contatori da dati server
     */
    async updateFromServer(serverCounters) {
        for (const [key, serverCounter] of Object.entries(serverCounters)) {
            const localCounter = this.counters.get(key);

            // Usa il valore più alto tra locale e server
            const maxValue = Math.max(
                localCounter ? localCounter.value : 0,
                serverCounter.value || 0
            );

            const updatedCounter = {
                value: maxValue,
                reserved_until: serverCounter.reserved_until || 0,
                last_update: new Date().toISOString()
            };

            this.counters.set(key, updatedCounter);
            await this.saveCounter(key, updatedCounter);
        }
    }

    /**
     * Salva contatore in storage
     */
    async saveCounter(key, counter) {
        await this.storage.saveCounter(key, counter.value, this.agentId);
    }

    /**
     * Reset contatore (solo per debug)
     */
    async resetCounter(docType) {
        const counterKey = `${docType}_${this.agentId}`;

        const counter = {
            value: 0,
            reserved_until: 0,
            last_update: new Date().toISOString()
        };

        this.counters.set(counterKey, counter);
        await this.saveCounter(counterKey, counter);

        // Rimuovi prenotazioni
        const reservedKey = `reserved_${docType}_${this.agentId}`;
        this.reserved.delete(reservedKey);

        console.log(`Reset contatore ${counterKey}`);
    }

    /**
     * Validazione numero documento
     */
    validateDocumentNumber(docType, number) {
        const counterKey = `${docType}_${this.agentId}`;
        const counter = this.counters.get(counterKey);

        if (!counter) {
            return { valid: false, reason: 'Contatore non inizializzato' };
        }

        if (number <= 0) {
            return { valid: false, reason: 'Numero deve essere positivo' };
        }

        if (number > counter.value + 100) {
            return { valid: false, reason: 'Numero troppo avanti rispetto al contatore' };
        }

        return { valid: true };
    }

    /**
     * Backup contatori
     */
    async exportCounters() {
        const exportData = {
            agent_id: this.agentId,
            agent_code: this.agentCode,
            timestamp: new Date().toISOString(),
            counters: {},
            reserved: {}
        };

        // Esporta contatori
        for (const [key, counter] of this.counters) {
            exportData.counters[key] = counter;
        }

        // Esporta prenotazioni
        for (const [key, reserved] of this.reserved) {
            exportData.reserved[key] = reserved;
        }

        return exportData;
    }

    /**
     * Ripristina contatori da backup
     */
    async importCounters(backupData) {
        if (backupData.agent_id !== this.agentId) {
            throw new Error('Backup per agente diverso');
        }

        // Ripristina contatori
        for (const [key, counter] of Object.entries(backupData.counters)) {
            this.counters.set(key, counter);
            await this.saveCounter(key, counter);
        }

        // Ripristina prenotazioni
        for (const [key, reserved] of Object.entries(backupData.reserved)) {
            this.reserved.set(key, reserved);
        }

        console.log('Contatori ripristinati da backup');
    }

    /**
     * Chiamata RPC helper
     */
    async rpc(route, params = {}) {
        return window.RaccoltaApp.rpc(route, params);
    }
}

export { CounterManager };
