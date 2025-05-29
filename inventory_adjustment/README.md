# Rettifica Inventario Rapida per Odoo 16
Questo modulo implementa un'interfaccia intuitiva e user-friendly per le rettifiche di inventario in Odoo 16, progettata per essere utilizzata su dispositivi mobili e desktop.

## Caratteristiche
- **Interfaccia intuitiva**: Design moderno e orientato al mobile
- **Ricerca prodotti flessibile**: Cerca per codice a barre, nome o categoria
- **Scansione codici a barre avanzata**: Utilizza l'API nativa BarcodeDetector con fallback a Html5-QRCode
- **Aggiustamento rapido**: Pulsanti +/- per modificare le quantità con click diretto sul valore
- **Configurazione magazzino**: Impostazioni per definire il magazzino predefinito
- **Elenco prodotti recenti**: Visualizza i prodotti utilizzati di recente con giacenza
- **Aggiornamento prodotti**: Possibilità di aggiornare le immagini e i codici a barre direttamente dall'interfaccia

## Scansione Codici a Barre
Questo modulo utilizza un approccio all'avanguardia per la scansione dei codici a barre:
1. **API BarcodeDetector nativa**: Utilizza l'API integrata nei browser moderni per prestazioni ottimali
2. **Fallback a Html5-QRCode**: Per i browser che non supportano l'API nativa
3. **Supporto per tutti i principali formati**: EAN-13, EAN-8, Code 128, QR Code, Data Matrix e altri

## Struttura del modulo
```
inventory_adjustment/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── inventory_adjustment.py
│   └── res_config_settings.py
├── wizards/
│   ├── __init__.py
│   └── product_search_wizard.py
├── security/
│   └── ir.model.access.csv
├── views/
│   ├── inventory_adjustment_views.xml
│   ├── inventory_adjustment_mobile_view.xml
│   ├── res_config_settings_views.xml
│   └── menu.xml
├── static/
│   ├── src/
│   │   ├── css/
│   │   │   ├── style.scss
│   │   │   └── barcode_scanner.css
│   │   ├── js/
│   │   │   ├── inventory_adjustment_mobile.js
│   │   │   └── barcode_scanner.js
│   │   └── xml/
│   │       └── barcode_scanner.xml
│   ├── lib/
│   │   └── html5-qrcode.min.js
│   └── description/
│       └── icon.png
└── README.md
```

## Installazione
1. Scarica il modulo e posizionalo nella directory degli addons di Odoo (`/addons` o `/custom_addons`)
2. Scarica la libreria Html5-QRCode e posizionala in `static/lib/html5-qrcode.min.js`
   - Puoi ottenerla da: https://github.com/mebjas/html5-qrcode/releases/latest
3. Riavvia il server Odoo
4. Aggiorna l'elenco delle applicazioni dalle impostazioni di Odoo
5. Cerca e installa il modulo "Rettifica Inventario Rapida"

## Requisiti browser
- Per prestazioni ottimali, si raccomanda un browser recente che supporti l'API BarcodeDetector nativa
- Tutti i browser moderni (Chrome, Edge, Firefox, Safari) sono supportati grazie al sistema di fallback

## Configurazione
1. Vai a **Rettifica Inventario → Impostazioni**
2. Seleziona il magazzino predefinito da utilizzare per le rettifiche
3. Salva le impostazioni

## Utilizzo
### Vista desktop
1. Vai a **Rettifica Inventario → Rettifiche**
2. Crea una nuova rettifica
3. Seleziona un prodotto utilizzando il pulsante "Cerca Prodotto" o inserendo direttamente il codice a barre
4. Utilizza i pulsanti +/- per regolare la quantità
5. Clicca sul pulsante di conferma per salvare la rettifica

### Vista mobile
1. Vai a **Rettifica Inventario → Rettifica Mobile**
2. Seleziona un prodotto dall'elenco recenti, cercandolo o scansionando il codice a barre
3. Regola la quantità cliccando sul valore o usando i pulsanti + e -
4. Clicca su "AGGIORNA INVENTARIO" per confermare la rettifica
5. Aggiorna l'immagine prodotto o il barcode cliccando sui relativi pulsanti

## Funzionamento tecnico
Il modulo utilizza direttamente il modello `stock.quant` di Odoo 16 per aggiornare l'inventario. Quando si conferma una rettifica:
1. Cerca un quant esistente per il prodotto e la location specificati
2. Se esiste, aggiorna la sua quantità attraverso il campo `inventory_quantity`
3. Se non esiste, crea un nuovo quant con la quantità specificata
4. Applica la rettifica di inventario attraverso il metodo `action_apply_inventory`

Questo approccio è completamente compatibile con Odoo 16 dove il modello `stock.inventory` è stato deprecato a favore della rettifica diretta sui quant.

## Requisiti tecnici
- Odoo 16
- Accesso alla fotocamera del dispositivo per la scansione dei codici a barre
- Browser moderno con supporto a JavaScript e WebRTC
- Per prestazioni ottimali, browser con supporto all'API BarcodeDetector