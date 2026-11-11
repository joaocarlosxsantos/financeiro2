"use client";

import { useEffect } from "react";

/**
 * Registra o Service Worker em background após a hidratação.
 * Componente client-only sem renderização visual.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => {
        // Falha silenciosa; o app funciona normalmente sem o SW.
        console.warn("[SW] Registro falhou:", err);
      });
  }, []);

  return null;
}
