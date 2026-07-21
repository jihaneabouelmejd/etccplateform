/**
 * Client HTTP partagé pour tous les extracteurs. Centralise timeout,
 * user-agent et gestion d'erreur afin qu'une source lente/indisponible ne
 * bloque jamais le reste du pipeline de scraping (exigence: le système doit
 * continuer à fonctionner même si une ou plusieurs sources sont
 * indisponibles).
 */

const DEFAULT_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; ETCC-VeilleBot/1.0; +https://etcc-platform.example/veille-bot)';

export async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/json;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} pour ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function resolveUrl(base: string, href?: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
