const CACHE_NAME = 'work-daily-report-v130';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS).catch(function() {
        // Ignore individual asset failures
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.map(function(name) {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  // 页面导航请求：网络优先（在线时永远拿最新版本，杜绝缓存滞留旧版导致升级不生效）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          // 用一份克隆检测返回体是否为平台错误页（如 CloudStudio 冷启动 ECONNREFUSED），
          // 避免把错误页面写进缓存污染后续离线兜底
          var probe = response.clone();
          return probe.text().then(function(body) {
            var isErrorPage = body && /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|502\s*Bad\s*Gateway|503\s*Service|504\s*Gateway|Service\s*Unavailable|connect\s+\w+\s+127\.0\.0\.1/i.test(body);
            if (isErrorPage) {
              // 错误页：不缓存，回退到上一版正常缓存（无则退回本次响应，避免白屏）
              return caches.match(event.request).then(function(cached) {
                return cached || response;
              });
            }
            // 正常页：写入缓存并返回
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
            return response;
          }).catch(function() {
            // 检测读取失败：保守缓存并返回
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
            return response;
          });
        }
        return response;
      }).catch(function() {
        // 离线兜底：返回缓存的页面
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // 其他静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Return cached and update in background
        fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(function() {});
        return cached;
      }
      
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var responseToCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
