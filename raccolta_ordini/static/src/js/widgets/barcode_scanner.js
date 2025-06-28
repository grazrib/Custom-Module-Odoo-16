/**
 * Scanner Barcode per Raccolta Ordini
 * Supporta webcam, lettori USB e input manuale
 */
class BarcodeScanner {
    constructor(options = {}) {
        this.options = {
            onScan: options.onScan || (() => {}),
            onError: options.onError || (() => {}),
            timeout: options.timeout || 5000,
            inputSelector: options.inputSelector || '.barcode-input',
            buttonSelector: options.buttonSelector || '.barcode-scan-btn',
            cameraSelector: options.cameraSelector || '.barcode-camera',
            ...options
        };

        this.isScanning = false;
        this.stream = null;
        this.scanTimeout = null;
        this.lastScan = '';
        this.scanBuffer = '';

        this.init();
    }

    /**
     * Inizializza scanner
     */
    init() {
        this.setupKeyboardListener();
        this.setupButtons();
        this.checkCameraSupport();
    }

    /**
     * Setup listener tastiera per scanner USB
     */
    setupKeyboardListener() {
        let scanBuffer = '';
        let scanTimeout = null;

        document.addEventListener('keydown', (event) => {
            // Ignora se stiamo scrivendo in un input
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // Reset buffer se troppo tempo tra caratteri
            if (scanTimeout) {
                clearTimeout(scanTimeout);
            }

            // Enter = fine scansione
            if (event.key === 'Enter' && scanBuffer.length > 0) {
                this.processScan(scanBuffer.trim());
                scanBuffer = '';
                event.preventDefault();
                return;
            }

            // Accumula caratteri (solo alfanumerici e alcuni simboli)
            if (/^[a-zA-Z0-9\-_]$/.test(event.key)) {
                scanBuffer += event.key;

                // Timeout per reset buffer
                scanTimeout = setTimeout(() => {
                    scanBuffer = '';
                }, 100);
            }
        });
    }

    /**
     * Setup pulsanti scanner
     */
    setupButtons() {
        // Pulsante avvia camera
        document.addEventListener('click', (event) => {
            if (event.target.matches(this.options.buttonSelector)) {
                event.preventDefault();
                this.toggleCamera();
            }
        });

        // Input manuale
        document.addEventListener('change', (event) => {
            if (event.target.matches(this.options.inputSelector)) {
                const barcode = event.target.value.trim();
                if (barcode) {
                    this.processScan(barcode);
                    event.target.value = '';
                }
            }
        });

        // Enter su input manuale
        document.addEventListener('keypress', (event) => {
            if (event.target.matches(this.options.inputSelector) && event.key === 'Enter') {
                const barcode = event.target.value.trim();
                if (barcode) {
                    this.processScan(barcode);
                    event.target.value = '';
                }
                event.preventDefault();
            }
        });
    }

    /**
     * Verifica supporto camera
     */
    async checkCameraSupport() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(device => device.kind === 'videoinput');

            // Mostra/nascondi pulsante camera
            const cameraButtons = document.querySelectorAll(this.options.buttonSelector);
            cameraButtons.forEach(btn => {
                btn.style.display = hasCamera ? 'inline-block' : 'none';
            });

            return hasCamera;
        } catch (error) {
            console.warn('Impossibile verificare dispositivi:', error);
            return false;
        }
    }

    /**
     * Attiva/disattiva camera
     */
    async toggleCamera() {
        if (this.isScanning) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    /**
     * Avvia camera per scansione
     */
    async startCamera() {
        try {
            // Richiedi permessi camera
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Camera posteriore preferita
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            // Mostra video
            const videoElement = this.createVideoElement();
            videoElement.srcObject = this.stream;
            await videoElement.play();

            this.isScanning = true;
            this.updateScanButton(true);

            // Avvia rilevamento (simulato - richiede libreria come QuaggaJS)
            this.startBarcodeDetection(videoElement);

        } catch (error) {
            console.error('Errore avvio camera:', error);
            this.options.onError('Impossibile accedere alla camera');
        }
    }

    /**
     * Ferma camera
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Rimuovi video element
        const videoContainer = document.querySelector(this.options.cameraSelector);
        if (videoContainer) {
            videoContainer.innerHTML = '';
        }

        this.isScanning = false;
        this.updateScanButton(false);

        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
        }
    }

    /**
     * Crea elemento video per camera
     */
    createVideoElement() {
        const container = document.querySelector(this.options.cameraSelector);
        if (!container) {
            throw new Error('Container camera non trovato');
        }

        container.innerHTML = `
            <div class="barcode-video-container">
                <video id="barcode-video" autoplay playsinline class="w-full h-64 bg-black rounded"></video>
                <div class="barcode-overlay">
                    <div class="barcode-scan-line"></div>
                    <p class="text-white text-center mt-2">Inquadra il codice a barre</p>
                </div>
                <button onclick="window.barcodeScanner.stopCamera()"
                        class="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded">
                    Stop
                </button>
            </div>
        `;

        return document.getElementById('barcode-video');
    }

    /**
     * Avvia rilevamento barcode (placeholder)
     * In produzione usare QuaggaJS o ZXing
     */
    startBarcodeDetection(videoElement) {
        // Placeholder - implementare con libreria barcode
        console.log('Scanner camera attivo - implementare libreria barcode detection');

        // Timeout automatico
        this.scanTimeout = setTimeout(() => {
            this.stopCamera();
            this.options.onError('Timeout scansione camera');
        }, this.options.timeout);
    }

    /**
     * Elabora barcode scansionato
     */
    processScan(barcode) {
        // Evita scansioni duplicate rapide
        if (this.lastScan === barcode && Date.now() - this.lastScanTime < 1000) {
            return;
        }

        this.lastScan = barcode;
        this.lastScanTime = Date.now();

        // Feedback audio
        this.playBeep();

        // Feedback visivo
        this.showScanFeedback(barcode);

        // Callback
        this.options.onScan(barcode);

        // Ferma camera se attiva
        if (this.isScanning) {
            setTimeout(() => this.stopCamera(), 500);
        }
    }

    /**
     * Suono feedback scansione
     */
    playBeep() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'square';

            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            // Fallback senza audio
            console.log('Beep!');
        }
    }

    /**
     * Feedback visivo scansione
     */
    showScanFeedback(barcode) {
        // Crea notifica temporanea
        const notification = document.createElement('div');
        notification.className = 'barcode-scan-feedback';
        notification.innerHTML = `
            <div class="bg-green-500 text-white px-4 py-2 rounded shadow-lg">
                <i class="fas fa-check mr-2"></i>
                Scansionato: ${barcode}
            </div>
        `;

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            animation: slideInRight 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // Rimuovi dopo 2 secondi
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    /**
     * Aggiorna stato pulsante scan
     */
    updateScanButton(isScanning) {
        const buttons = document.querySelectorAll(this.options.buttonSelector);
        buttons.forEach(btn => {
            if (isScanning) {
                btn.innerHTML = '<i class="fas fa-stop mr-2"></i>Stop Scan';
                btn.classList.add('bg-red-500', 'hover:bg-red-600');
                btn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            } else {
                btn.innerHTML = '<i class="fas fa-camera mr-2"></i>Scan Camera';
                btn.classList.add('bg-blue-500', 'hover:bg-blue-600');
                btn.classList.remove('bg-red-500', 'hover:bg-red-600');
            }
        });
    }

    /**
     * Cleanup scanner
     */
    destroy() {
        this.stopCamera();
        document.removeEventListener('keydown', this.setupKeyboardListener);
    }
}

// Export per uso globale
window.BarcodeScanner = BarcodeScanner;

export { BarcodeScanner };
