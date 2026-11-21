// sw.js - 离线兜底 Service Worker

const CACHE_NAME = 'app-static-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// 把本地直进补丁注入页面（移除登录/激活码拦截，不改动原业务代码）
function injectBypass(html) {
    if (!html || html.indexOf('gate-bypass.js') !== -1) return html;
    html = html.replace('<div id="activation-overlay">', '<div id="activation-overlay" style="display:none">');
    html = html.replace(
        '<script src="sms.js"></script>',
        '<script src="sms.js"></script>\n    <script src="gate-bypass.js"></script>'
    );
    return html;
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    if (event.request.mode === 'navigate') {
        // 页面导航优先网络，注入补丁后回写缓存；断网时回退缓存
        event.respondWith(
            fetch(event.request)
                .then((resp) => {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    const ct = resp.headers.get('content-type') || '';
                    if (ct.indexOf('text/html') !== -1) {
                        return resp.text().then((html) => new Response(injectBypass(html), {
                            headers: { 'Content-Type': 'text/html; charset=utf-8' }
                        }));
                    }
                    return resp;
                })
                .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((resp) => {
                if (resp.ok && url.origin === self.location.origin) {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return resp;
            });
        })
    );
});

self.addEventListener('push', function(event) {
    // 准备一个绝对不会失败的兜底通知
    const fallbackNotification = self.registration.showNotification("小元机", {
        body: "你有一条新消息 (点击查看)",
        icon: "https://i.postimg.cc/yYrDHvG5/mmexport1766982633245.jpg",
        badge: "https://i.postimg.cc/yYrDHvG5/mmexport1766982633245.jpg",
        vibrate: [200, 100, 200],
        tag: 'offline-msg-fallback-' + Date.now(),
        data: { url: '/' }
    });

    const fetchPromise = caches.open('app-config-cache')
        .then(cache => cache.match('/current-device-id'))
        .then(response => {
            if (response) return response.text();
            return null;
        })
        .then(deviceId => {
            let fetchUrl = 'https://honey-offline-brain.xingyan067.workers.dev/get-latest-push';
            if (deviceId) {
                fetchUrl += `?deviceId=${deviceId}`;
            }

            return fetch(fetchUrl)
            .then(res => {
                if (!res.ok) throw new Error('Network response was not ok');
                return res.json();
            })
            .then(data => {
                const options = {
                    body: data.body || "你有一条新消息",
                    icon: data.icon || "https://i.postimg.cc/yYrDHvG5/mmexport1766982633245.jpg",
                    badge: data.icon || "https://i.postimg.cc/yYrDHvG5/mmexport1766982633245.jpg",
                    vibrate: [200, 100, 200],
                    tag: 'offline-msg-' + Date.now(),
                    data: { url: '/' }
                };
                return self.registration.showNotification(data.title || "小元机", options);
            });
        })
        .catch(err => {
            console.error("拉取最新推送内容失败，启用兜底通知", err);
            return fallbackNotification;
        });

    event.waitUntil(fetchPromise);
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
