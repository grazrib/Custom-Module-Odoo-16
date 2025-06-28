@echo off
echo ==============================================
echo CREAZIONE STRUTTURA COMPLETA MODULO ODOO (01-75)
echo ==============================================

:: Crea tutte le directory principali
echo Creazione directory...
if not exist "models" mkdir models
if not exist "controllers" mkdir controllers
if not exist "views" mkdir views
if not exist "security" mkdir security
if not exist "static\src\js\models" mkdir static\src\js\models
if not exist "static\src\js\screens" mkdir static\src\js\screens
if not exist "static\src\js\widgets" mkdir static\src\js\widgets
if not exist "static\src\js\utils" mkdir static\src\js\utils
if not exist "static\src\js\receipt" mkdir static\src\js\receipt
if not exist "static\src\css" mkdir static\src\css
if not exist "static\src\xml" mkdir static\src\xml
if not exist "data" mkdir data
if not exist "wizards" mkdir wizards
if not exist "reports" mkdir reports
if not exist "templates\shared" mkdir templates\shared
if not exist "templates\escpos" mkdir templates\escpos
if not exist "templates\pdf" mkdir templates\pdf

echo.
echo ==============================================
echo CREAZIONE FILE STRUTTURA BASE (01-16)
echo ==============================================

:: File base modulo
echo. > __manifest__.py
echo. > __init__.py

:: Models
echo. > models\__init__.py
echo. > models\raccolta_config.py
echo. > models\res_users.py
echo. > models\raccolta_session.py
echo. > models\sale_order.py
echo. > models\stock_picking.py
echo. > models\stock_delivery_note.py
echo. > models\raccolta_counter.py

:: Controllers
echo. > controllers\__init__.py
echo. > controllers\main.py
echo. > controllers\data_loader.py
echo. > controllers\sync_controller.py

:: Security
echo. > security\raccolta_security.xml
echo. > security\ir.model.access.csv

echo.
echo ==============================================
echo CREAZIONE VIEWS (17-34)
echo ==============================================

:: Views base
echo. > views\raccolta_assets.xml
echo. > views\raccolta_index.xml
echo. > views\raccolta_config_view.xml
echo. > views\res_users_view.xml
echo. > views\sale_order_view.xml
echo. > views\stock_picking_view.xml
echo. > views\raccolta_session_view.xml
echo. > views\raccolta_menus.xml

:: Templates ricevute
echo. > templates\receipt_controller.php
echo. > templates\shared\receipt_content_with_ddt.php
echo. > templates\escpos\receipt_48mm_ddt.php
echo. > templates\pdf\receipt_pdf_ddt.php
echo. > templates\escpos\receipt_80mm.php
echo. > templates\shared\receipt_content.php

echo.
echo ==============================================
echo CREAZIONE JAVASCRIPT CORE (27-41)
echo ==============================================

:: JavaScript core
echo. > static\src\js\main.js
echo. > static\src\js\models\offline_storage.js
echo. > static\src\js\models\counter_manager.js
echo. > static\src\js\models\document_creator.js
echo. > static\src\js\models\sync_manager.js
echo. > static\src\js\receipt\receipt_manager.js

:: Screens
echo. > static\src\js\screens\dashboard.js
echo. > static\src\js\screens\order_screen.js
echo. > static\src\js\screens\client_screen.js
echo. > static\src\js\screens\product_screen.js
echo. > static\src\js\screens\sync_screen.js

echo.
echo ==============================================
echo CREAZIONE JAVASCRIPT WIDGETS (42-48)
echo ==============================================

:: Widgets
echo. > static\src\js\widgets\barcode_scanner.js
echo. > static\src\js\widgets\signature_pad.js
echo. > static\src\js\widgets\client_selector.js
echo. > static\src\js\widgets\product_list.js

:: Utils
echo. > static\src\js\utils\network_detector.js
echo. > static\src\js\utils\notification.js
echo. > static\src\js\utils\helpers.js

echo.
echo ==============================================
echo CREAZIONE RECEIPT & CSS (49-53)
echo ==============================================

:: Receipt generators
echo. > static\src\js\receipt\escpos_generator.js
echo. > static\src\js\receipt\pdf_generator.js

:: CSS
echo. > static\src\css\raccolta.css
echo. > static\src\css\receipt.css
echo. > static\src\css\mobile.css

echo.
echo ==============================================
echo CREAZIONE XML TEMPLATES (54-59)
echo ==============================================

:: XML Templates
echo. > static\src\xml\dashboard.xml
echo. > static\src\xml\order_form.xml
echo. > static\src\xml\client_list.xml
echo. > static\src\xml\product_list.xml
echo. > static\src\xml\sync_status.xml
echo. > static\src\xml\receipt_preview.xml

echo.
echo ==============================================
echo CREAZIONE DATA (60-63)
echo ==============================================

:: Data files
echo. > data\raccolta_config_data.xml
echo. > data\sequence_data.xml
echo. > data\ddt_types_data.xml
echo. > data\transport_data.xml

echo.
echo ==============================================
echo CREAZIONE WIZARDS (64-69)
echo ==============================================

:: Wizards
echo. > wizards\__init__.py
echo. > wizards\mass_sync_wizard.py
echo. > wizards\mass_sync_wizard_view.xml
echo. > wizards\setup_agent_wizard.py
echo. > wizards\setup_agent_wizard_view.xml
echo. > wizards\export_data_wizard.py

echo.
echo ==============================================
echo CREAZIONE REPORTS (70-73)
echo ==============================================

:: Reports
echo. > reports\__init__.py
echo. > reports\order_report.py
echo. > reports\agent_performance.py
echo. > reports\sync_status_report.py

echo.
echo ==============================================
echo CREAZIONE PWA (74-75)
echo ==============================================

:: PWA
echo. > static\src\js\sw.js
echo. > static\manifest.json

echo.
echo ==============================================
echo ✅ STRUTTURA COMPLETA CREATA! (75 FILE)
echo ==============================================
echo.
echo File creati:
echo - Struttura base: 16 file
echo - Views: 18 file  
echo - JavaScript: 15 file
echo - Widgets/Utils: 7 file
echo - CSS/Templates: 6 file
echo - Data: 4 file
echo - Wizards: 6 file
echo - Reports: 4 file
echo - PWA: 2 file
echo.
echo TOTALE: 75 file
echo.
echo Ora puoi modificare i singoli file vuoti!
echo ==============================================
pause