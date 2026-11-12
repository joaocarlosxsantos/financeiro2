/**
 * Service Worker — Mutano Contas (F16 PWA)
 *
 * Estratégia de segurança:
 * - NUNCA cacheia páginas autenticadas (/, /painel, /lancamentos, etc.)
 * - NUNCA cacheia respostas de API (/api/*)
 * - Só cacheia assets estáticos com hashing do Next.js (_next/static/*) e
 *   arquivos públicos como ícones, manifesto e fontes.
 * - Em modo offline, responde com /offline.html para navegações a documentos.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `mutano-static-${CACHE_VERSION}`;

/** Assets estáticos permitidos no cache (padrões de URL). */
const STATIC_PATTERNS = [
  /^\/_next\/static\//,   // JS/CSS com content-hash do Next.js
  /\/icon-192\.png$/,
  /\/icon-512\.png$/,
  /\/maskable-512\.png$/,
  /\/offline\.html$/,
];

/** Rotas que NUNCA devem ser servidas do cache. */
const NEVER_CACHE_PATTERNS = [
  /^\/api\//,              // Rotas de API / dados financeiros
  /^\/(_next\/data|_next\/image)/, // RSC payload e image optimizer
];

/**
 * Retorna true se a URL for de um asset estático seguro para cachear.
 */
function isStaticAsset(url) {
  const path = new URL(url).pathname;
  if (NEVER_CACHE_PATTERNS.some((re) => re.test(path))) return false;
  return STATIC_PATTERNS.some((re) => re.test(path));
}

/**
 * Retorna true se a request é uma navegação a um documento HTML
 * (candidata a receber a página offline em caso de falha).
 */
function isDocumentNavigation(request) {
  return request.mode === "navigate" && request.destination === "document";
}

// ----- Ciclo de vida -----

self.addEventListener("install", (event) => {
  // Pré-cache a página offline para disponibilidade imediata.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.add("/offline.html"))
  );
  // Ativa imediatamente sem aguardar reload de abas antigas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove caches de versões antigas.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("mutano-") && key !== STATIC_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ----- Interceptação de fetch -----

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Apenas GET; deixa POST/PUT/DELETE passar diretamente.
  if (request.method !== "GET") return;

  const url = request.url;

  // Ignora requests cross-origin (ex.: fontes CDN; aqui não há, mas por segurança).
  if (!url.startsWith(self.location.origin)) return;

  if (isStaticAsset(url)) {
    // Cache-first para assets estáticos imutáveis.
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  if (isDocumentNavigation(request)) {
    // Network-first para documentos; fallback para /offline.html.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then(
          (page) =>
            page ??
            new Response("<h1>Offline</h1>", {
              headers: { "Content-Type": "text/html" },
            })
        )
      )
    );
    return;
  }

  // Tudo mais (API, dados financeiros, etc.) vai direto para a rede.
  // Sem fallback: se falhar, o app trata o erro normalmente.
});

// ----- Notificações Push Web (PWA) -----

self.addEventListener("push", (event) => {
  let data = {
    title: "Mutano Contas",
    body: "Notificação de teste recebida!",
    icon: "/icon.svg",
    badge: "/icon.svg",
    url: "/configuracoes/teste-push",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    data: { url: data.url },
    tag: "mutano-test-push",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/configuracoes/teste-push";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url && client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

