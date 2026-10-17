// ===== Zwei-Klick-Lösung für YouTube =====
// Ohne Zustimmung wird nichts von YouTube geladen (keine API, kein Vorschaubild).
// Gemerkt wird nur auf Wunsch und nur diese eine Entscheidung im Browser.

const KEY = 'floortag:youtube-consent';
let sessionConsent = false;

export function isRemembered() {
  try { return localStorage.getItem(KEY) === 'ja'; } catch (e) { return false; }
}
export function hasConsent() {
  return sessionConsent || isRemembered();
}
export function giveConsent(remember) {
  sessionConsent = true;
  if (remember) { try { localStorage.setItem(KEY, 'ja'); } catch (e) { /* Speicher nicht verfügbar */ } }
}
export function revokeConsent() {
  sessionConsent = false;
  try { localStorage.removeItem(KEY); } catch (e) { /* ignorieren */ }
}
