/**
 * Widget Firma Digitale per Raccolta Ordini
 * Supporta touch, mouse e salvataggio base64
 */
class SignaturePad {
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');

        this.options = {
            penColor: options.penColor || '#000000',
            lineWidth: options.lineWidth || 2,
            backgroundColor: options.backgroundColor || '#ffffff',
            onSign: options.onSign || (() => {}),
            onClear: options.onClear || (() => {}),
            ...options
        };

        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.isEmpty = true;

        this.init();
    }

    /**
     * Inizializza signature pad
     */
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.clear();
    }

    /**
     * Configura canvas
     */
    setupCanvas() {
        // Imposta dimensioni responsive
        this.resizeCanvas();

        // Configura contesto disegno
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = this.options.penColor;
        this.ctx.lineWidth = this.options.lineWidth;

        // Previeni scroll su mobile
        this.canvas.style.touchAction = 'none';
    }

    /**
     * Ridimensiona canvas mantenendo le proporzioni
     */
    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * ratio;
        this.canvas.height = rect.height * ratio;

        this.ctx.scale(ratio, ratio);

        // Imposta stile CSS
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

        // Resize window
        window.addEventListener('resize', () => {
            setTimeout(() => this.resizeCanvas(), 100);
        });
    }

    /**
     * Gestisce eventi touch
     */
    handleTouch(event) {
        event.preventDefault();

        if (event.touches.length > 1) return; // Ignora multi-touch

        const touch = event.touches[0];
        const mouseEvent = new MouseEvent(
            event.type === 'touchstart' ? 'mousedown' :
            event.type === 'touchmove' ? 'mousemove' : 'mouseup',
            {
                clientX: touch.clientX,
                clientY: touch.clientY
            }
        );

        this.canvas.dispatchEvent(mouseEvent);
    }

    /**
     * Inizia disegno
     */
    startDrawing(event) {
        this.isDrawing = true;
        const pos = this.getMousePos(event);
        this.lastX = pos.x;
        this.lastY = pos.y;

        // Disegna punto iniziale
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
    }

    /**
     * Disegna linea
     */
    draw(event) {
        if (!this.isDrawing) return;

        const pos = this.getMousePos(event);

        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();

        this.lastX = pos.x;
        this.lastY = pos.y;

        this.isEmpty = false;
    }

    /**
     * Termina disegno
     */
    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.options.onSign();
        }
    }

    /**
     * Ottiene posizione mouse relativa al canvas
     */
    getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    /**
     * Cancella firma
     */
    clear() {
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.isEmpty = true;
        this.options.onClear();
    }

    /**
     * Verifica se la firma è vuota
     */
    isSignatureEmpty() {
        return this.isEmpty;
    }

    /**
     * Esporta firma come base64
     */
    toDataURL(type = 'image/png', quality = 0.8) {
        if (this.isEmpty) {
            return null;
        }

        return this.canvas.toDataURL(type, quality);
    }

    /**
     * Esporta firma come blob
     */
    toBlob(callback, type = 'image/png', quality = 0.8) {
        if (this.isEmpty) {
            callback(null);
            return;
        }

        this.canvas.toBlob(callback, type, quality);
    }

    /**
     * Carica firma da base64
     */
    fromDataURL(dataURL) {
        const img = new Image();
        img.onload = () => {
            this.clear();
            this.ctx.drawImage(img, 0, 0);
            this.isEmpty = false;
        };
        img.src = dataURL;
    }

    /**
     * Imposta colore penna
     */
    setPenColor(color) {
        this.options.penColor = color;
        this.ctx.strokeStyle = color;
    }

    /**
     * Imposta spessore linea
     */
    setLineWidth(width) {
        this.options.lineWidth = width;
        this.ctx.lineWidth = width;
    }

    /**
     * Imposta colore sfondo
     */
    setBackgroundColor(color) {
        this.options.backgroundColor = color;
        this.clear();
    }

    /**
     * Annulla ultimo tratto (limitato)
     */
    undo() {
        // Implementazione semplificata - salva stato prima di ogni tratto
        if (this.undoStack && this.undoStack.length > 0) {
            const imageData = this.undoStack.pop();
            this.ctx.putImageData(imageData, 0, 0);
            this.isEmpty = this.undoStack.length === 0;
        }
    }

    /**
     * Salva stato per undo
     */
    saveState() {
        if (!this.undoStack) {
            this.undoStack = [];
        }

        // Mantieni solo ultimi 10 stati
        if (this.undoStack.length >= 10) {
            this.undoStack.shift();
        }

        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.undoStack.push(imageData);
    }

    /**
     * Ottieni dati firma per salvataggio
     */
    getSignatureData() {
        if (this.isEmpty) {
            return null;
        }

        return {
            dataURL: this.toDataURL(),
            timestamp: new Date().toISOString(),
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    /**
     * Cleanup del widget
     */
    destroy() {
        this.canvas.removeEventListener('mousedown', this.startDrawing);
        this.canvas.removeEventListener('mousemove', this.draw);
        this.canvas.removeEventListener('mouseup', this.stopDrawing);
        this.canvas.removeEventListener('mouseout', this.stopDrawing);
        this.canvas.removeEventListener('touchstart', this.handleTouch);
        this.canvas.removeEventListener('touchmove', this.handleTouch);
        this.canvas.removeEventListener('touchend', this.stopDrawing);

        window.removeEventListener('resize', this.resizeCanvas);
    }
}

/**
 * Factory per creare signature pad con controlli
 */
class SignaturePadWidget {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container ${containerId} non trovato`);
        }

        this.options = {
            width: options.width || '100%',
            height: options.height || '200px',
            showControls: options.showControls !== false,
            ...options
        };

        this.signaturePad = null;
        this.init();
    }

    /**
     * Inizializza widget completo
     */
    init() {
        this.createHTML();
        this.createSignaturePad();
        this.setupControls();
    }

    /**
     * Crea HTML del widget
     */
    createHTML() {
        this.container.innerHTML = `
            <div class="signature-widget">
                <canvas id="signature-canvas"
                        class="border border-gray-300 rounded cursor-crosshair"
                        style="width: ${this.options.width}; height: ${this.options.height};">
                </canvas>
                ${this.options.showControls ? `
                <div class="signature-controls mt-3 flex gap-2">
                    <button id="clear-signature" class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600">
                        <i class="fas fa-eraser mr-1"></i>Cancella
                    </button>
                    <button id="undo-signature" class="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">
                        <i class="fas fa-undo mr-1"></i>Annulla
                    </button>
                    <span class="signature-status text-sm text-gray-500 flex items-center">
                        <i class="fas fa-info-circle mr-1"></i>Firma qui sopra
                    </span>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Crea signature pad
     */
    createSignaturePad() {
        const canvas = this.container.querySelector('#signature-canvas');

        this.signaturePad = new SignaturePad(canvas, {
            ...this.options,
            onSign: () => this.updateStatus('Firma acquisita'),
            onClear: () => this.updateStatus('Firma qui sopra')
        });
    }

    /**
     * Setup controlli
     */
    setupControls() {
        if (!this.options.showControls) return;

        const clearBtn = this.container.querySelector('#clear-signature');
        const undoBtn = this.container.querySelector('#undo-signature');

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.signaturePad.clear();
            });
        }

        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                this.signaturePad.undo();
            });
        }
    }

    /**
     * Aggiorna status
     */
    updateStatus(message) {
        const status = this.container.querySelector('.signature-status');
        if (status) {
            const icon = this.signaturePad.isSignatureEmpty() ?
                'fa-info-circle' : 'fa-check-circle';
            status.innerHTML = `<i class="fas ${icon} mr-1"></i>${message}`;
        }
    }

    /**
     * Ottieni signature pad
     */
    getSignaturePad() {
        return this.signaturePad;
    }

    /**
     * Ottieni dati firma
     */
    getSignature() {
        return this.signaturePad.getSignatureData();
    }

    /**
     * Verifica se firmato
     */
    isSigned() {
        return !this.signaturePad.isSignatureEmpty();
    }
}

// Export per uso globale
window.SignaturePad = SignaturePad;
window.SignaturePadWidget = SignaturePadWidget;

export { SignaturePad, SignaturePadWidget };
