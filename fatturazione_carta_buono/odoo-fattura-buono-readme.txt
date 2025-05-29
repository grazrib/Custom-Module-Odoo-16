# Modulo Fatturazione Carta Docente e CarteCultura per Odoo

Questo modulo permette la generazione di fatture elettroniche in formato XML compatibile con i sistemi di Carta Docente e CarteCultura (18App) direttamente da Odoo.

## Caratteristiche

- Creazione di fatture elettroniche in formato XML valido per l'invio al Sistema di Interscambio (SdI)
- Gestione dei codici buono Carta Docente e CarteCultura (18App) 
- Integrazione con i partner e i dati aziendali esistenti in Odoo
- Download del file XML pronto per l'invio

## Installazione

1. Copiare la cartella del modulo `fatturazione_carta_buono` nella directory `addons` di Odoo
2. Aggiornare la lista dei moduli in Odoo
3. Installare il modulo "Fatturazione Carta Docente e CarteCultura"

## Configurazione

Dopo l'installazione, verificare:

1. I dati dell'azienda siano completi (Impostazioni → Aziende → La tua azienda)
   - Partita IVA
   - Indirizzo completo
   - Dati bancari

2. Che i partner per Carta Docente e CarteCultura siano configurati correttamente (vengono creati automaticamente all'installazione)

## Utilizzo

1. Accedere al menu "Fatturazione Buoni" → "Fatture Buoni"
2. Creare una nuova fattura selezionando:
   - Tipologia (Carta Docente o CarteCultura)
   - Codice del buono
   - Importo
   - Numero fattura
   - Data fattura
3. Cliccare su "Genera Fattura XML"
4. Scaricare il file XML generato cliccando su "Download Fattura XML"

## Struttura dei file

- `models/fattura_carta_buono.py`: Definizione del modello principale
- `views/fattura_carta_buono_views.xml`: Viste del modulo
- `security/ir.model.access.csv`: Regole di accesso
- `__init__.py` e `models/__init__.py`: File di inizializzazione
- `__manifest__.py`: Descrizione e configurazione del modulo

## Compatibilità

- Odoo 15.0 e versioni successive
- Richiede il modulo di localizzazione italiana (l10n_it_edi)

## Licenza

LGPL-3