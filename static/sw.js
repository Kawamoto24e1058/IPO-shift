// static/sw.js
// Service Worker handling for offline caching and network request safety

const CACHE_NAME = 'ipo-shift-cache-v1';

self.addEventListener('install', (event) => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
	// 【重要】Cache.put() は GET リクエストのみサポートされています。
	// POST / PUT / DELETE などの非GETリクエストはキャッシュ操作を行わずスルーします。
	if (event.request.method !== 'GET') {
		return;
	}

	const url = new URL(event.request.url);
	if (!url.protocol.startsWith('http')) {
		return;
	}

	// ネットワーク優先、失敗時にキャッシュを利用
	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (response.status === 200 && event.request.method === 'GET') {
					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseToCache).catch((err) => {
							console.warn('[SW] Cache.put skipped or failed:', err);
						});
					}).catch(() => {});
				}
				return response;
			})
			.catch(async () => {
				const cache = await caches.open(CACHE_NAME);
				const cachedResponse = await cache.match(event.request);
				if (cachedResponse) {
					return cachedResponse;
				}
				throw new Error('Network error and no cache available');
			})
	);
});
