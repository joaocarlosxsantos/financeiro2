/**
 * Testes unitários para a lógica do PwaInstallBanner (F16 PWA).
 *
 * Testa:
 * - Persistência e leitura do dismiss em localStorage com try/catch
 * - Lógica de snooze (14 dias)
 * - Detecção de iOS via userAgent
 * - Resiliência a localStorage quebrado
 */

import { describe, it, expect, beforeEach } from "vitest";

// ---- helpers extraídos para teste direto (mesma lógica do componente) ----

const LS_KEY = "mutano-pwa-banner-dismissed";
const SNOOZE_DAYS = 14;

function getDismissedAt(storage: Storage | null): number {
  try {
    return Number(storage?.getItem(LS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setDismissedAt(storage: Storage | null): void {
  try {
    storage?.setItem(LS_KEY, String(Date.now()));
  } catch {
    // falha silenciosa
  }
}

function isSnoozed(storage: Storage | null, now = Date.now()): boolean {
  const dismissedAt = getDismissedAt(storage);
  const snoozeMs = SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  return dismissedAt > 0 && now - dismissedAt < snoozeMs;
}

function isIOS(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua);
}

// ---- testes ----

describe("PWA Install Banner — lógica de dismiss", () => {
  let store: Record<string, string> = {};
  const mockStorage: Storage = {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    length: 0,
    key: () => null,
  };

  beforeEach(() => { store = {}; });

  it("retorna 0 quando não há chave no storage", () => {
    expect(getDismissedAt(mockStorage)).toBe(0);
  });

  it("persiste e lê o timestamp de dismiss", () => {
    setDismissedAt(mockStorage);
    const val = getDismissedAt(mockStorage);
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThanOrEqual(Date.now());
  });

  it("considera em snooze dentro de 14 dias", () => {
    setDismissedAt(mockStorage);
    expect(isSnoozed(mockStorage)).toBe(true);
  });

  it("não considera em snooze após 14+ dias", () => {
    const thirteenDaysAgo = Date.now() - (SNOOZE_DAYS + 1) * 24 * 60 * 60 * 1000;
    store[LS_KEY] = String(thirteenDaysAgo);
    expect(isSnoozed(mockStorage)).toBe(false);
  });

  it("retorna 0 e não lança quando storage está quebrado (getItem lança)", () => {
    const brokenStorage = {
      ...mockStorage,
      getItem: () => { throw new Error("SecurityError"); },
    } as unknown as Storage;
    expect(() => getDismissedAt(brokenStorage)).not.toThrow();
    expect(getDismissedAt(brokenStorage)).toBe(0);
  });

  it("não lança quando storage está quebrado (setItem lança)", () => {
    const brokenStorage = {
      ...mockStorage,
      setItem: () => { throw new Error("QuotaExceededError"); },
    } as unknown as Storage;
    expect(() => setDismissedAt(brokenStorage)).not.toThrow();
  });

  it("retorna 0 quando storage é null", () => {
    expect(getDismissedAt(null)).toBe(0);
  });

  it("não lança quando storage é null no setItem", () => {
    expect(() => setDismissedAt(null)).not.toThrow();
  });
});

describe("PWA Install Banner — detecção iOS", () => {
  it("detecta iPhone", () => {
    expect(isIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
  });

  it("detecta iPad", () => {
    expect(isIOS("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
  });

  it("não detecta Chrome Android", () => {
    expect(isIOS("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120")).toBe(false);
  });

  it("não detecta Desktop Chrome", () => {
    expect(isIOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe(false);
  });
});

describe("PWA Install Banner — snooze edge cases", () => {
  let store: Record<string, string> = {};
  const mockStorage: Storage = {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    length: 0,
    key: () => null,
  };

  beforeEach(() => { store = {}; });

  it("não está em snooze quando nunca dispensado", () => {
    expect(isSnoozed(mockStorage)).toBe(false);
  });

  it("está em snooze exatamente no limite de 14 dias - 1ms", () => {
    const justBefore = Date.now() - (SNOOZE_DAYS * 24 * 60 * 60 * 1000 - 1);
    store[LS_KEY] = String(justBefore);
    expect(isSnoozed(mockStorage)).toBe(true);
  });

  it("não está em snooze exatamente no limite de 14 dias", () => {
    const exactly = Date.now() - SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    store[LS_KEY] = String(exactly);
    expect(isSnoozed(mockStorage)).toBe(false);
  });
});
