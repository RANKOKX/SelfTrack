// Service Worker pour SelfTrack PWA

const CACHE_NAME = "selftrack-v1";
const urlsToCache = [
    "/",
    "/index.html",
    "/style.css",
    "/app.js",
    "/manifest.json"
];

// Install Event
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event (Network first, fallback to cache)
self.addEventListener("fetch", event => {
    // Ignorer les URLs non-http
    if (!event.request.url.startsWith("http")) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache les réponses réussies
                if (response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback au cache
                return caches.match(event.request)
                    .then(response => response || new Response("Offline"));
            })
    );
});

// Message du Client
self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

// Firebase Messaging (Push notifications en arrière-plan)
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyDfab21yuMosZneOeg0UyWJ151E8fvMHGs",
    authDomain: "selftrack-f1a0b.firebaseapp.com",
    projectId: "selftrack-f1a0b",
    storageBucket: "selftrack-f1a0b.firebasestorage.app",
    messagingSenderId: "785827170290",
    appId: "1:785827170290:web:7015b60e2f3bf5a5ec0d6b"
});

const messaging = firebase.messaging();

// Gérer les messages en arrière-plan
messaging.onBackgroundMessage(payload => {
    console.log("Message en arrière-plan reçu", payload);
    
    const notificationTitle = payload.notification.title || "SelfTrack";
    const notificationOptions = {
        body: payload.notification.body || "Vous avez une notification",
        icon: payload.notification.icon || "/icon-192.png",
        badge: "/badge-72.png",
        tag: payload.data?.tag || "notification",
        requireInteraction: true
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Gérer les clics sur les notifications
self.addEventListener("notificationclick", event => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: "window" })
            .then(clientList => {
                // Chercher une fenêtre ouverte
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].url === "/" && "focus" in clientList[i]) {
                        return clientList[i].focus();
                    }
                }
                // Sinon ouvrir une nouvelle fenêtre
                if (clients.openWindow) {
                    return clients.openWindow("/");
                }
            })
    );
});
