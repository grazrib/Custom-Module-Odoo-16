/**
 * Sistema Notifiche per Raccolta Ordini
 * Toast, modali, badge e notifiche push
 */
class NotificationSystem {
    constructor(options = {}) {
        this.options = {
            position: options.position || 'top-right',
            duration: options.duration || 5000,
            maxNotifications: options.maxNotifications || 5,
            enableSound: options.enableSound !== false,
            enablePush: options.enablePush !== false,
            ...options
        };

        this.notifications = [];
        this.container = null;
        this.soundEnabled = this.options.enableSound;
        this.pushEnabled = false;

        this.init();
    }

    /**
     * Inizializza sistema notifiche
     */
    init() {
        this.createContainer();
        this.requestPushPermission();
        this.setupServiceWorker();
    }

    /**
     * Crea container notifiche
     */
    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.className = 'notification-container';

        // Stili CSS
        this.container.style.cssText = `
            position: fixed;
            z-index: 10000;
            pointer-events: none;
            ${this.getPositionStyles()}
        `;

        document.body.appendChild(this.container);
    }

    /**
     * Ottieni stili posizione
     */
    getPositionStyles() {
        const positions = {
            'top-right': 'top: 20px; right: 20px;',
            'top-left': 'top: 20px; left: 20px;',
            'top-center': 'top: 20px; left: 50%; transform: translateX(-50%);',
            'bottom-right': 'bottom: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'bottom-center': 'bottom: 20px; left: 50%; transform: translateX(-50%);'
        };

        return positions[this.options.position] || positions['top-right'];
    }

    /**
     * Mostra notifica toast
     */
    show(message, type = 'info', options = {}) {
        const notification = this.createNotification(message, type, options);

        // Limita numero notifiche
        if (this.notifications.length >= this.options.maxNotifications) {
            this.remove(this.notifications[0].id);
        }

        this.notifications.push(notification);
        this.container.appendChild(notification.element);

        // Animazione entrata
        requestAnimationFrame(() => {
            notification.element.classList.add('notification-show');
        });

        // Auto-rimozione
        if (options.duration !== 0) {
            const duration = options.duration || this.options.duration;
            notification.timeoutId = setTimeout(() => {
                this.remove(notification.id);
            }, duration);
        }

        // Suono
        if (this.soundEnabled && type !== 'info') {
            this.playSound(type);
        }

        return notification.id;
    }

    /**
     * Crea elemento notifica
     */
    createNotification(message, type, options) {
        const id = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const element = document.createElement('div');
        element.className = `notification notification-${type}`;
        element.style.cssText = `
            pointer-events: auto;
            margin-bottom: 10px;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: 400px;
            word-wrap: break-word;
            ${this.getTypeStyles(type)}
        `;

        element.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0">
                    <i class="fas ${this.getTypeIcon(type)}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="notification-message">${this.escapeHtml(message)}</div>
                    ${options.subtitle ? `<div class="notification-subtitle text-sm opacity-75 mt-1">${this.escapeHtml(options.subtitle)}</div>` : ''}
                </div>
                <div class="flex-shrink-0">
                    <button class="notification-close text-current opacity-60 hover:opacity-100 ml-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            ${options.actions ? this.createActionButtons(options.actions) : ''}
        `;

        // Event listener chiusura
        element.querySelector('.notification-close').addEventListener('click', () => {
            this.remove(id);
        });

        // Event listener azioni
        if (options.actions) {
            options.actions.forEach((action, index) => {
                const btn = element.querySelector(`[data-action="${index}"]`);
                if (btn) {
                    btn.addEventListener('click', () => {
                        action.callback();
                        if (action.closeOnClick !== false) {
                            this.remove(id);
                        }
                    });
                }
            });
        }

        // Click per chiudere (se abilitato)
        if (options.clickToClose !== false) {
            element.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.remove(id);
                }
            });
        }

        return {
            id,
            element,
            type,
            message,
            timeoutId: null
        };
    }

    /**
     * Stili per tipo notifica
     */
    getTypeStyles(type) {
        const styles = {
            success: 'background: #10b981; color: white;',
            error: 'background: #ef4444; color: white;',
            warning: 'background: #f59e0b; color: white;',
            info: 'background: #3b82f6; color: white;',
            light: 'background: white; color: #374151; border: 1px solid #d1d5db;'
        };

        return styles[type] || styles.info;
    }

    /**
     * Icona per tipo notifica
     */
    getTypeIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle',
            light: 'fa-bell'
        };

        return icons[type] || icons.info;
    }

    /**
     * Crea pulsanti azione
     */
    createActionButtons(actions) {
        return `
            <div class="notification-actions mt-3 flex gap-2">
                ${actions.map((action, index) => `
                    <button class="px-3 py-1 text-sm rounded border border-current opacity-75 hover:opacity-100"
                            data-action="${index}">
                        ${this.escapeHtml(action.text)}
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Rimuovi notifica
     */
    remove(id) {
        const notification = this.notifications.find(n => n.id === id);
        if (!notification) return;

        // Cancella timeout
        if (notification.timeoutId) {
            clearTimeout(notification.timeoutId);
        }

        // Animazione uscita
        notification.element.classList.add('notification-hide');

        setTimeout(() => {
            if (notification.element.parentNode) {
                notification.element.remove();
            }

            this.notifications = this.notifications.filter(n => n.id !== id);
        }, 300);
    }

    /**
     * Rimuovi tutte le notifiche
     */
    clear() {
        this.notifications.forEach(notification => {
            this.remove(notification.id);
        });
    }

    /**
     * Metodi scorciatoia
     */
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    /**
     * Mostra notifica di conferma
     */
    confirm(message, options = {}) {
        return new Promise((resolve) => {
            const actions = [
                {
                    text: options.confirmText || 'Conferma',
                    callback: () => resolve(true)
                },
                {
                    text: options.cancelText || 'Annulla',
                    callback: () => resolve(false)
                }
            ];

            this.show(message, 'warning', {
                ...options,
                actions,
                duration: 0, // Non auto-chiudere
                clickToClose: false
            });
        });
    }

    /**
     * Mostra progress notification
     */
    progress(message, options = {}) {
        const progressElement = document.createElement('div');
        progressElement.innerHTML = `
            <div class="notification-progress mt-2">
                <div class="w-full bg-black bg-opacity-20 rounded-full h-2">
                    <div class="progress-bar bg-white h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
                <div class="progress-text text-sm mt-1 opacity-75">0%</div>
            </div>
        `;

        const notificationId = this.show(message, 'info', {
            ...options,
            duration: 0,
            clickToClose: false
        });

        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.element.appendChild(progressElement);
        }

        return {
            id: notificationId,
            update: (percentage, text) => {
                const progressBar = progressElement.querySelector('.progress-bar');
                const progressText = progressElement.querySelector('.progress-text');

                if (progressBar) {
                    progressBar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
                }

                if (progressText) {
                    progressText.textContent = text || `${Math.round(percentage)}%`;
                }
            },
            finish: (message) => {
                if (message) {
                    const notification = this.notifications.find(n => n.id === notificationId);
                    if (notification) {
                        notification.element.querySelector('.notification-message').textContent = message;
                    }
                }

                setTimeout(() => this.remove(notificationId), 2000);
            }
        };
    }

    /**
     * Suona notifica
     */
    playSound(type) {
        if (!this.soundEnabled) return;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Frequenze diverse per tipo
            const frequencies = {
                success: [523, 659, 784], // Do-Mi-Sol
                error: [415, 311], // Ab-Eb (suono di errore)
                warning: [523, 415], // Do-Ab
                info: [523] // Do semplice
            };

            const freq = frequencies[type] || frequencies.info;

            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

            freq.forEach((f, i) => {
                oscillator.frequency.setValueAtTime(f, audioContext.currentTime + i * 0.1);
            });

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + freq.length * 0.1);

        } catch (error) {
            console.warn('Impossibile riprodurre suono notifica:', error);
        }
    }

    /**
     * Richiedi permesso notifiche push
     */
    async requestPushPermission() {
        if (!this.options.enablePush || !('Notification' in window)) {
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            this.pushEnabled = permission === 'granted';
            return this.pushEnabled;
        } catch (error) {
            console.warn('Errore richiesta permesso notifiche:', error);
            return false;
        }
    }

    /**
     * Mostra notifica push
     */
    showPush(title, options = {}) {
        if (!this.pushEnabled) return null;

        return new Notification(title, {
            body: options.body || '',
            icon: options.icon || '/static/src/img/icon-192.png',
            badge: options.badge || '/static/src/img/badge-72.png',
            tag: options.tag || 'raccolta-ordini',
            requireInteraction: options.requireInteraction || false,
            ...options
        });
    }

    /**
     * Setup service worker per notifiche
     */
    async setupServiceWorker() {
        if (!('serviceWorker' in navigator) || !this.options.enablePush) {
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            console.log('Service Worker pronto per notifiche push');
        } catch (error) {
            console.warn('Errore setup service worker:', error);
        }
    }

    /**
     * Badge contatore
     */
    setBadge(count) {
        if ('setAppBadge' in navigator) {
            navigator.setAppBadge(count);
        }
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Toggle suoni
     */
    toggleSound(enabled) {
        this.soundEnabled = enabled;
    }

    /**
     * Imposta posizione
     */
    setPosition(position) {
        this.options.position = position;
        if (this.container) {
            this.container.style.cssText = `
                position: fixed;
                z-index: 10000;
                pointer-events: none;
                ${this.getPositionStyles()}
            `;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.clear();
        if (this.container) {
            this.container.remove();
        }
    }
}

// Aggiungi stili CSS per animazioni
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification-show {
        transform: translateX(0) !important;
    }

    .notification-hide {
        transform: translateX(100%) !important;
        opacity: 0 !important;
    }

    @media (max-width: 640px) {
        .notification-container {
            left: 10px !important;
            right: 10px !important;
            transform: none !important;
        }

        .notification {
            max-width: none !important;
        }
    }
`;
document.head.appendChild(notificationStyles);

// Export per uso globale
window.NotificationSystem = NotificationSystem;

export { NotificationSystem };
