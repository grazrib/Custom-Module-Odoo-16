/**
 * Service Worker per App PWA Raccolta Ordini
 * Gestisce cache offline e sincronizzazione background
 */

const CACHE_NAME = 'raccolta-ordini-v1.0.0';
const DB_NAME = 'raccolta_offline_db';
const SYNC_TAG = 'background-sync-raccolta';

// Risorse da cacheare per funzionamento offline
const STATIC_CACHE_URLS = [
    '/raccolta/ui',
    '/raccolta/static/src/css/raccolta.css',
    '/raccolta/static/src/js/main.js',
    '/raccolta/static/src/js/models/offline_storage.js',
    '/raccolta/static/src/js/models/document_creator.js',
    '/raccolta/static/src/js/models/sync_manager.js',
    '/raccolta/static/manifest.json',
    '/web/static/lib/bootstrap/css/bootstrap.css',
    '/web/static/src/css/framework.css'
];

// API endpoints da cacheare
const API_CACHE_URLS = [
    '/raccolta/api/config',
    '/raccolta/api/counters'
];

/**
 * Event: Install
 * Cache risorse statiche
 */
self.addEventListener('install', event => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static resources');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Installation failed:', error);
            })
    );
});

/**
 * Event: Activate
 * Pulisce cache vecchie
 */
self.addEventListener('activate', event => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

/**
 * Event: Fetch
 * Intercetta richieste e serve da cache se offline
 */
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Solo per richieste GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Strategia cache-first per risorse statiche
    if (isStaticResource(url.pathname)) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // Strategia network-first per API
    if (isAPIRequest(url.pathname)) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Strategia network-first per tutto il resto
    event.respondWith(networkFirst(event.request));
});

/**
 * Event: Sync
 * Sincronizzazione background quando torna connessione
 */
self.addEventListener('sync', event => {
    console.log('[SW] Background sync triggered:', event.tag);

    if (event.tag === SYNC_TAG) {
        event.waitUntil(
            performBackgroundSync()
                .then(() => {
                    console.log('[SW] Background sync completed');
                    return sendSyncNotification(true);
                })
                .catch(error => {
                    console.error('[SW] Background sync failed:', error);
                    return sendSyncNotification(false, error.message);
                })
        );
    }
});

/**
 * Event: Push
 * Gestisce notifiche push
 */
self.addEventListener('push', event => {
    console.log('[SW] Push notification received');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'Raccolta Ordini', body: event.data.text() };
        }
    }

    const options = {
        body: data.body || 'Nuova notifica',
        icon: '/raccolta/static/src/img/icon-192.png',
        badge: '/raccolta/static/src/img/badge-72.png',
        vibrate: [200, 100, 200],
        data: data.data || {},
        actions: [
            {
                action: 'open',
                title: 'Apri App',
                icon: '/raccolta/static/src/img/action-open.png'
            },
            {
                action: 'dismiss',
                title: 'Ignora',
                icon: '/raccolta/static/src/img/action-dismiss.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Raccolta Ordini', options)
    );
});

/**
 * Event: Notification Click
 * Gestisce click su notifiche
 */
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification clicked:', event.action);

    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.openWindow('/raccolta/ui')
        );
    }
});

/**
 * Event: Message
 * Comunicazione con main thread
 */
self.addEventListener('message', event => {
    console.log('[SW] Message received:', event.data);

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'REQUEST_SYNC') {
        // Richiesta sincronizzazione manuale
        performBackgroundSync()
            .then(() => {
                event.ports[0].postMessage({ success: true });
            })
            .catch(error => {
                event.ports[0].postMessage({ success: false, error: error.message });
            });
    } else if (event.data.type === 'CACHE_DATA') {
        // Cache dati dinamici
        cacheData(event.data.key, event.data.data)
            .then(() => {
                event.ports[0].postMessage({ success: true });
            });
    }
});

/**
 * Strategia Cache-First
 */
async function cacheFirst(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            return cachedResponse;
        }

        console.log('[SW] Cache miss, fetching:', request.url);
        const response = await fetch(request);

        if (response.ok) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.error('[SW] Cache-first failed:', error);
        return new Response('Offline - Resource not available', { status: 503 });
    }
}

/**
 * Strategia Network-First
 */
async function networkFirst(request) {
    try {
        console.log('[SW] Fetching from network:', request.url);
        const response = await fetch(request);

        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);

        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Fallback per pagine HTML
        if (request.headers.get('accept').includes('text/html')) {
            return new Response(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Offline - Raccolta Ordini</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .offline { color: #666; }
                        .retry { margin-top: 20px; }
                        button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; }
                    </style>
                </head>
                <body>
                    <div class="offline">
                        <h1>🔌 Offline</h1>
                        <p>Non sei connesso a Internet.</p>
                        <p>L'app continuerà a funzionare offline con i dati già scaricati.</p>
                        <div class="retry">
                            <button onclick="window.location.reload()">Riprova</button>
                        </div>
                    </div>
                </body>
                </html>
            `, {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            });
        }

        return new Response('Offline', { status: 503 });
    }
}

/**
 * Sincronizzazione background
 */
async function performBackgroundSync() {
    console.log('[SW] Starting background sync...');

    try {
        // Apri database IndexedDB
        const db = await openDB();

        // Sincronizza ordini pendenti
        await syncPendingOrders(db);

        // Sincronizza picking pendenti
        await syncPendingPickings(db);

        // Aggiorna contatori
        await syncCounters(db);

        console.log('[SW] Background sync completed successfully');
    } catch (error) {
        console.error('[SW] Background sync failed:', error);
        throw error;
    }
}

/**
 * Sincronizza ordini pendenti
 */
async function syncPendingOrders(db) {
    const transaction = db.transaction(['pending_orders'], 'readonly');
    const store = transaction.objectStore('pending_orders');
    const orders = await store.getAll();

    for (const order of orders) {
        try {
            const response = await fetch('/raccolta/api/sync/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(order)
            });

            if (response.ok) {
                // Rimuovi ordine sincronizzato
                const deleteTransaction = db.transaction(['pending_orders'], 'readwrite');
                const deleteStore = deleteTransaction.objectStore('pending_orders');
                await deleteStore.delete(order.local_id);
                console.log('[SW] Order synced:', order.local_id);
            }
        } catch (error) {
            console.error('[SW] Failed to sync order:', order.local_id, error);
        }
    }
}

/**
 * Sincronizza picking pendenti
 */
async function syncPendingPickings(db) {
    const transaction = db.transaction(['pending_pickings'], 'readonly');
    const store = transaction.objectStore('pending_pickings');
    const pickings = await store.getAll();

    for (const picking of pickings) {
        try {
            const response = await fetch('/raccolta/api/sync/picking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(picking)
            });

            if (response.ok) {
                // Rimuovi picking sincronizzato
                const deleteTransaction = db.transaction(['pending_pickings'], 'readwrite');
                const deleteStore = deleteTransaction.objectStore('pending_pickings');
                await deleteStore.delete(picking.local_id);
                console.log('[SW] Picking synced:', picking.local_id);
            }
        } catch (error) {
            console.error('[SW] Failed to sync picking:', picking.local_id, error);
        }
    }
}

/**
 * Sincronizza contatori
 */
async function syncCounters(db) {
    try {
        const response = await fetch('/raccolta/api/sync/counters', {
            method: 'POST'
        });

        if (response.ok) {
            console.log('[SW] Counters synced');
        }
    } catch (error) {
        console.error('[SW] Failed to sync counters:', error);
    }
}

/**
 * Invia notifica di sincronizzazione
 */
async function sendSyncNotification(success, error = null) {
    if (!self.registration.showNotification) {
        return;
    }

    const title = success ? 'Sincronizzazione Completata' : 'Errore Sincronizzazione';
    const body = success
        ? 'I tuoi dati sono stati sincronizzati con successo'
        : `Errore durante la sincronizzazione: ${error}`;

    const options = {
        body: body,
        icon: '/raccolta/static/src/img/icon-192.png',
        badge: '/raccolta/static/src/img/badge-72.png',
        tag: 'sync-notification',
        silent: true
    };

    await self.registration.showNotification(title, options);
}

/**
 * Cache dati dinamici
 */
async function cacheData(key, data) {
    const cache = await caches.open(CACHE_NAME + '-data');
    const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
    });

    await cache.put(key, response);
}

/**
 * Apri database IndexedDB
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = event => {
            const db = event.target.result;

            // Object stores per dati offline
            if (!db.objectStoreNames.contains('pending_orders')) {
                db.createObjectStore('pending_orders', { keyPath: 'local_id' });
            }

            if (!db.objectStoreNames.contains('pending_pickings')) {
                db.createObjectStore('pending_pickings', { keyPath: 'local_id' });
            }

            if (!db.objectStoreNames.contains('clients')) {
                db.createObjectStore('clients', { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains('products')) {
                db.createObjectStore('products', { keyPath: 'id' });
            }
        };
    });
}

/**
 * Verifica se è risorsa statica
 */
function isStaticResource(pathname) {
    return pathname.includes('/static/') ||
           pathname.includes('/web/static/') ||
           pathname.endsWith('.css') ||
           pathname.endsWith('.js') ||
           pathname.endsWith('.png') ||
           pathname.endsWith('.jpg') ||
           pathname.endsWith('.gif') ||
           pathname.endsWith('.ico');
}

/**
 * Verifica se è richiesta API
 */
function isAPIRequest(pathname) {
    return pathname.startsWith('/raccolta/api/') ||
           pathname.startsWith('/raccolta/data/');
}

/**
 * Registra sync background
 */
function registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        navigator.serviceWorker.ready.then(registration => {
            return registration.sync.register(SYNC_TAG);
        });
    }
}

// Auto-registra sync quando SW viene installato
self.addEventListener('install', () => {
    console.log('[SW] Service Worker installed, background sync will be available');
});
