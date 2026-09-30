/* Appels réseau : délai maximal, annulation, repli JSONP.
   Les erreurs sont typées pour que l'interface choisisse le bon message. */
import { API_TIMEOUT } from '../config.js';

export class ApiError extends Error {
  constructor(kind, status = 0) {
    super(kind);
    this.kind = kind;       // 'offline' | 'timeout' | 'http' | 'auth' | 'network' | 'abort'
    this.status = status;
  }
}

export const isAbort = (err) => err && (err.kind === 'abort' || err.name === 'AbortError');

export async function fetchJSON(url, { timeout = API_TIMEOUT, signal, headers } = {}) {
  if (!navigator.onLine) throw new ApiError('offline');
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
  const relay = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', relay, { once: true });
  }
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers, credentials: 'omit' });
    if (res.status === 401) throw new ApiError('auth', 401);
    if (!res.ok) throw new ApiError('http', res.status);
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (timedOut) throw new ApiError('timeout');
    if (signal?.aborted) throw new ApiError('abort');
    throw new ApiError(navigator.onLine ? 'network' : 'offline');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

/* JSONP : pour les API qui refusent le CORS (iTunes, selon les navigateurs). */
let seq = 0;
export function jsonp(url, { timeout = API_TIMEOUT, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.onLine) { reject(new ApiError('offline')); return; }
    const cb = `__aTesterJsonp${Date.now().toString(36)}${seq++}`;
    const script = document.createElement('script');
    let done = false;
    const finish = () => {
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      script.remove();
      // Garde une fonction vide : une réponse tardive ne doit pas lever d'erreur.
      window[cb] = () => { delete window[cb]; };
    };
    const onAbort = () => { if (!done) { finish(); reject(new ApiError('abort')); } };
    const timer = setTimeout(() => { if (!done) { finish(); reject(new ApiError('timeout')); } }, timeout);
    signal?.addEventListener('abort', onAbort, { once: true });
    window[cb] = (data) => { if (!done) { finish(); resolve(data); } };
    script.onerror = () => { if (!done) { finish(); reject(new ApiError('network')); } };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(script);
  });
}

export function errorMessage(err) {
  if (!err) return '';
  if (err.kind === 'offline') return 'Hors ligne';
  if (err.kind === 'auth') return 'Clé refusée';
  return 'Recherche indisponible';
}
