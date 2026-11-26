// ===== Tastenkürzel: Übersicht als Fenster (Taste „?“) =====
// Die kleinen Tastenmarken an den Knöpfen kommen allein aus dem CSS (Attribut data-kbd), nur bei Maus und Tastatur.
import { esc } from './format.js';

const k = (...keys) => keys;
// Gruppen der Spielansicht je Modus: { title, items: [[Tasten, Beschreibung]] }
export function gameShortcuts(mode, catalog = []) {
  const groups = [{
    title: 'Video', items: [
      [k('K', 'Leertaste'), 'Play / Pause'],
      [k('J', 'L'), '5 s zurück / vor'],
      [k('H', 'Ö'), '30 s zurück / vor'],
      [k(',', '.'), '1 s zurück / vor'],
      [k('−', '+'), 'langsamer / schneller'],
      [k('N'), 'nächstes Ereignis auswählen']
    ]
  }];
  if (mode !== 'view') groups.push({ title: 'Sync', items: [[k('Enter'), 'gewähltes Ereignis auf die aktuelle Videozeit setzen']] });
  if (mode === 'analysis') groups.push({
    title: 'Tags', items: [
      ...catalog.slice(0, 9).map((c, i) => [k(String(i + 1)), c.label]),
      [k('Q', 'W', 'E'), 'Ergebnis des gewählten Tags, z. B. aufs Tor / daneben / geblockt'],
      [k('T'), 'Team wechseln'],
      [k('V', 'X'), 'im Penaltyschießen: Tor / kein Tor'],
      [k('Entf'), 'gewählten Tag löschen'],
      [k('Esc'), 'Nachtrag schließen']
    ]
  });
  groups.push({ title: 'Allgemein', items: [[k('?'), 'diese Übersicht']] });
  return groups;
}

export const SCENES_SHORTCUTS = [
  { title: 'Szenen', items: [
    [k('K', 'Leertaste'), 'Play / Pause'],
    [k('J', 'L'), '5 s zurück / vor'],
    [k('−', '+'), 'langsamer / schneller'],
    [k('N', 'P'), 'nächste / vorherige Szene'],
    [k('F'), 'Präsentieren']
  ] },
  { title: 'Beim Präsentieren (auch Präsenter-Fernbedienung)', items: [
    [k('→', 'Bild ab', 'N'), 'nächste Szene'],
    [k('←', 'Bild auf', 'P'), 'vorherige Szene'],
    [k('Leertaste', 'K'), 'Pause / weiter'],
    [k('R'), 'Szene noch einmal'],
    [k('B', '.'), 'Bild schwarz'],
    [k('E'), 'Einblendung noch einmal zeigen, zweimal: aus'],
    [k('Y'), 'YouTube-Bedienung freigeben'],
    [k('Esc'), 'Präsentation beenden']
  ] },
  { title: 'Allgemein', items: [[k('?'), 'diese Übersicht']] }
];

let dialog = null;
export function openShortcuts(groups) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'help kb-dialog';
    dialog.setAttribute('aria-labelledby', 'kbTitle');
    dialog.addEventListener('click', e => { if (e.target === dialog || e.target.closest('[data-kb-close]')) dialog.close(); });
    document.body.append(dialog);
  }
  dialog.innerHTML = `<div class="help-head"><h2 id="kbTitle">Tastenkürzel</h2><button class="help-close" data-kb-close aria-label="Tastenkürzel schließen">✕</button></div>
    ${groups.map(g => `<h3>${esc(g.title)}</h3><dl class="kb-list">${g.items.map(([keys, text]) =>
      `<dt>${keys.map(x => `<kbd>${esc(x)}</kbd>`).join('<span class="kb-or">/</span>')}</dt><dd>${esc(text)}</dd>`).join('')}</dl>`).join('')}
    <p class="note">Die kleinen Buchstaben an den Knöpfen zeigen dieselben Tasten.</p>`;
  if (!dialog.open) dialog.showModal();
}

// „?“ öffnet die Übersicht, Knöpfe mit data-kb-open ebenso; getGroups liefert die Gruppen für die aktuelle Ansicht
export function installShortcuts(getGroups) {
  document.addEventListener('keydown', e => {
    if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
    e.preventDefault(); openShortcuts(getGroups());
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-kb-open]')) openShortcuts(getGroups()); });
}
