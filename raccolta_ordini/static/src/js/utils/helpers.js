/**
 * Funzioni Helper Utility per Raccolta Ordini
 * Raccolta di utility comuni per formatazione, validazione e manipolazione dati
 */

/**
 * Formattazione numeri e valute
 */
const NumberUtils = {
    /**
     * Formatta prezzo in euro
     */
    formatPrice(amount, decimals = 2) {
        if (isNaN(amount)) return '€0,00';

        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(amount);
    },

    /**
     * Formatta numero con separatori
     */
    formatNumber(number, decimals = 0) {
        if (isNaN(number)) return '0';

        return new Intl.NumberFormat('it-IT', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    },

    /**
     * Parse prezzo da stringa
     */
    parsePrice(priceString) {
        if (!priceString) return 0;

        // Rimuovi simboli valuta e spazi
        const cleaned = priceString.toString()
            .replace(/[€$£¥]/g, '')
            .replace(/\s/g, '')
            .replace(/,/g, '.');

        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    },

    /**
     * Arrotonda a decimali specificati
     */
    round(number, decimals = 2) {
        const multiplier = Math.pow(10, decimals);
        return Math.round(number * multiplier) / multiplier;
    },

    /**
     * Calcola percentuale
     */
    percentage(value, total) {
        if (total === 0) return 0;
        return (value / total) * 100;
    }
};

/**
 * Formattazione date e tempo
 */
const DateUtils = {
    /**
     * Formatta data in italiano
     */
    formatDate(date, options = {}) {
        if (!date) return '';

        const d = new Date(date);
        if (isNaN(d.getTime())) return '';

        const defaultOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };

        return d.toLocaleDateString('it-IT', { ...defaultOptions, ...options });
    },

    /**
     * Formatta data e ora
     */
    formatDateTime(date, options = {}) {
        if (!date) return '';

        const d = new Date(date);
        if (isNaN(d.getTime())) return '';

        const defaultOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };

        return d.toLocaleString('it-IT', { ...defaultOptions, ...options });
    },

    /**
     * Formatta durata relativa (es. "2 ore fa")
     */
    formatRelative(date) {
        if (!date) return '';

        const d = new Date(date);
        if (isNaN(d.getTime())) return '';

        const now = new Date();
        const diff = now - d;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'Adesso';
        if (minutes < 60) return `${minutes} min fa`;
        if (hours < 24) return `${hours} ore fa`;
        if (days < 7) return `${days} giorni fa`;

        return this.formatDate(d);
    },

    /**
     * Ottieni inizio giornata
     */
    startOfDay(date = new Date()) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    },

    /**
     * Ottieni fine giornata
     */
    endOfDay(date = new Date()) {
        const d = new Date(date);
        d.setHours(23, 59, 59, 999);
        return d;
    },

    /**
     * Aggiungi giorni a data
     */
    addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    },

    /**
     * Data in formato ISO per input
     */
    toInputDate(date = new Date()) {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    }
};

/**
 * Validazione dati
 */
const ValidationUtils = {
    /**
     * Valida email
     */
    isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    /**
     * Valida P.IVA italiana
     */
    isValidVAT(vat) {
        if (!vat) return false;

        // Rimuovi spazi e caratteri non numerici
        const cleanVat = vat.replace(/\D/g, '');

        // P.IVA italiana: 11 cifre
        if (cleanVat.length !== 11) return false;

        // Algoritmo controllo P.IVA
        let sum = 0;
        for (let i = 0; i < 10; i++) {
            let digit = parseInt(cleanVat[i]);
            if (i % 2 === 1) {
                digit *= 2;
                if (digit > 9) digit = digit - 9;
            }
            sum += digit;
        }

        const checkDigit = (10 - (sum % 10)) % 10;
        return checkDigit === parseInt(cleanVat[10]);
    },

    /**
     * Valida codice fiscale italiano
     */
    isValidCF(cf) {
        if (!cf) return false;

        const cleanCF = cf.toUpperCase().replace(/\s/g, '');

        // Lunghezza 16 caratteri
        if (cleanCF.length !== 16) return false;

        // Pattern: 6 lettere + 2 numeri + 1 lettera + 2 numeri + 1 lettera + 3 caratteri + 1 lettera
        const regex = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/;
        return regex.test(cleanCF);
    },

    /**
     * Valida numero telefono
     */
    isValidPhone(phone) {
        if (!phone) return false;

        const cleanPhone = phone.replace(/\D/g, '');

        // Accetta numeri da 8 a 15 cifre
        return cleanPhone.length >= 8 && cleanPhone.length <= 15;
    },

    /**
     * Valida CAP italiano
     */
    isValidPostalCode(code) {
        if (!code) return false;

        const cleanCode = code.replace(/\D/g, '');
        return cleanCode.length === 5;
    },

    /**
     * Valida stringa non vuota
     */
    isNotEmpty(value) {
        return value && value.toString().trim().length > 0;
    },

    /**
     * Valida numero positivo
     */
    isPositiveNumber(value) {
        const num = parseFloat(value);
        return !isNaN(num) && num > 0;
    }
};

/**
 * Manipolazione stringhe
 */
const StringUtils = {
    /**
     * Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Capitalizza prima lettera
     */
    capitalize(text) {
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    },

    /**
     * Tronca testo con ellipsis
     */
    truncate(text, maxLength, suffix = '...') {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - suffix.length) + suffix;
    },

    /**
     * Slug da stringa
     */
    slugify(text) {
        if (!text) return '';

        return text
            .toLowerCase()
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
    /**
     * Slug da stringa
     */
    slugify(text) {
        if (!text) return '';

        return text
            .toLowerCase()
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ñ]/g, 'n')
            .replace(/[ç]/g, 'c')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-');
    },

    /**
     * Genera ID casuale
     */
    generateId(prefix = '', length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return prefix + result;
    },

    /**
     * Formatta numero telefono
     */
    formatPhone(phone) {
        if (!phone) return '';

        const cleaned = phone.replace(/\D/g, '');

        // Formato italiano mobile: 3XX XXX XXXX
        if (cleaned.length === 10 && cleaned.startsWith('3')) {
            return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
        }

        // Formato internazionale
        if (cleaned.length > 10) {
            return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
        }

        return phone;
    },

    /**
     * Formatta P.IVA
     */
    formatVAT(vat) {
        if (!vat) return '';

        const cleaned = vat.replace(/\D/g, '');

        // P.IVA italiana: 11 cifre
        if (cleaned.length === 11) {
            return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}.${cleaned.slice(8)}`;
        }

        return vat;
    }
};

/**
 * Utility DOM
 */
const DOMUtils = {
    /**
     * Selettore sicuro
     */
    $(selector, context = document) {
        return context.querySelector(selector);
    },

    /**
     * Selettori multipli
     */
    $(selector, context = document) {
        return Array.from(context.querySelectorAll(selector));
    },

    /**
     * Crea elemento con attributi
     */
    createElement(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else {
                element.setAttribute(key, value);
            }
        });

        if (content) {
            element.innerHTML = content;
        }

        return element;
    },

    /**
     * Mostra/nascondi elemento
     */
    toggle(element, show) {
        if (!element) return;

        if (show === undefined) {
            show = element.classList.contains('hidden');
        }

        element.classList.toggle('hidden', !show);
    },

    /**
     * Attende elemento nel DOM
     */
    waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Elemento ${selector} non trovato entro ${timeout}ms`));
            }, timeout);
        });
    },

    /**
     * Anima elemento
     */
    animate(element, keyframes, options = {}) {
        if (!element || !element.animate) return Promise.resolve();

        const defaultOptions = {
            duration: 300,
            easing: 'ease',
            fill: 'forwards'
        };

        return element.animate(keyframes, { ...defaultOptions, ...options }).finished;
    },

    /**
     * Scroll smooth a elemento
     */
    scrollTo(element, options = {}) {
        if (!element) return;

        const defaultOptions = {
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        };

        element.scrollIntoView({ ...defaultOptions, ...options });
    }
};

/**
 * Utility localStorage/sessionStorage
 */
const StorageUtils = {
    /**
     * Salva in localStorage con serializzazione
     */
    setLocal(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('Errore salvataggio localStorage:', error);
            return false;
        }
    },

    /**
     * Leggi da localStorage con parsing
     */
    getLocal(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.warn('Errore lettura localStorage:', error);
            return defaultValue;
        }
    },

    /**
     * Rimuovi da localStorage
     */
    removeLocal(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn('Errore rimozione localStorage:', error);
            return false;
        }
    },

    /**
     * Salva in sessionStorage
     */
    setSession(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('Errore salvataggio sessionStorage:', error);
            return false;
        }
    },

    /**
     * Leggi da sessionStorage
     */
    getSession(key, defaultValue = null) {
        try {
            const value = sessionStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.warn('Errore lettura sessionStorage:', error);
            return defaultValue;
        }
    }
};

/**
 * Utility file e blob
 */
const FileUtils = {
    /**
     * Leggi file come testo
     */
    readAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    /**
     * Leggi file come DataURL
     */
    readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    /**
     * Download blob come file
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Converti DataURL a Blob
     */
    dataURLToBlob(dataURL) {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);

        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }

        return new Blob([u8arr], { type: mime });
    },

    /**
     * Formatta dimensione file
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

/**
 * Utility per gestione errori
 */
const ErrorUtils = {
    /**
     * Gestisce errore con logging
     */
    handle(error, context = '') {
        const errorMessage = error?.message || error?.toString() || 'Errore sconosciuto';
        const errorInfo = {
            message: errorMessage,
            context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        console.error('Errore gestito:', errorInfo);

        // Invia a sistema di logging se disponibile
        if (window.app && window.app.logError) {
            window.app.logError(errorInfo);
        }

        return errorMessage;
    },

    /**
     * Wrapper per funzioni async con gestione errori
     */
    async safe(asyncFn, context = '') {
        try {
            return await asyncFn();
        } catch (error) {
            const message = this.handle(error, context);
            throw new Error(message);
        }
    },

    /**
     * Retry con backoff esponenziale
     */
    async retry(asyncFn, maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await asyncFn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;

                const waitTime = delay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
};

/**
 * Utility performance
 */
const PerformanceUtils = {
    /**
     * Debounce function
     */
    debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    },

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Misura tempo esecuzione
     */
    time(label) {
        const start = performance.now();
        return {
            end: () => {
                const duration = performance.now() - start;
                console.log(`${label}: ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }
};

/**
 * Utility URL e query string
 */
const URLUtils = {
    /**
     * Parse query string
     */
    parseQuery(search = window.location.search) {
        const params = new URLSearchParams(search);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },

    /**
     * Costruisci query string
     */
    buildQuery(params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                searchParams.append(key, value);
            }
        });
        return searchParams.toString();
    },

    /**
     * Aggiorna URL senza reload
     */
    updateURL(params, replace = false) {
        const url = new URL(window.location);
        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, value);
            }
        });

        const method = replace ? 'replaceState' : 'pushState';
        history[method](null, '', url);
    }
};

// Esporta tutto come oggetto globale
const RaccoltaUtils = {
    Number: NumberUtils,
    Date: DateUtils,
    Validation: ValidationUtils,
    String: StringUtils,
    DOM: DOMUtils,
    Storage: StorageUtils,
    File: FileUtils,
    Error: ErrorUtils,
    Performance: PerformanceUtils,
    URL: URLUtils
};

// Export per uso globale
window.RaccoltaUtils = RaccoltaUtils;

// Export singoli per import ES6
export {
    NumberUtils,
    DateUtils,
    ValidationUtils,
    StringUtils,
    DOMUtils,
    StorageUtils,
    FileUtils,
    ErrorUtils,
    PerformanceUtils,
    URLUtils,
    RaccoltaUtils
};
