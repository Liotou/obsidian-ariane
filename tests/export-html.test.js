const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Ariane = require('./obsidian-factice.js');

const pageFriseHtml = Ariane._test.pageFriseHtml;

const FIXTURE = {
  langue: 'fr',
  textes: {},
  defauts: { zoom: 'mois' },
  typeVue: 'ariane-frise',
  nomVue: 'Test <frise>',
  jour: '2026-09-04',
  moteur: 'class MoteurFrise {}',
  ariane: { fns: {}, data: {} },
  icones: {},
  css: '.x { color: red; }',
  vars: { '--text-normal': '#222222' },
  taches: [{ ref: 'A', statut: 'à faire', debut: '2026-09-01', echeance: '2026-09-05', parent: '', bloquePar: [] }],
  colonnes: [],
  valeurs: {},
  renoms: {},
  pos: null,
  triNatif: null,
  groupes: null,
  grp: { actuel: null, nom: '', sens: 1 },
  cleT: {},
  familles: {},
  chemins: { A: 'A.md' },
  coffre: 'Coffre',
  barreCouleur: 'famille',
  lignageSurvol: true,
  entete: 'Frise exportée le 2026-09-04',
};

// Source du moteur + de la vue (superset assumé) : du début de MoteurFrise au
// socle de la page exportée.
function sourceMoteur() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const debut = source.indexOf('class MoteurFrise {');
  const fin = source.indexOf('// ── Page HTML autonome');
  assert.ok(debut > 0 && fin > debut, 'main.js doit contenir MoteurFrise puis le socle');
  return source.slice(debut, fin);
}

function payload(page) {
  const ligne = page.split('\n').find((l) => l.startsWith('const D = '));
  assert.ok(ligne, 'ligne « const D = … » absente de la page');
  return JSON.parse(ligne.slice('const D = '.length).replace(/;$/, ''));
}

test('pageFriseHtml : page complète, payload JSON valide, une seule fermeture de script', () => {
  const page = pageFriseHtml(FIXTURE);
  assert.ok(page.startsWith('<!doctype html>'));
  assert.ok(page.includes('<title>Frise — Test &lt;frise&gt;</title>'));
  assert.ok(!page.includes('<title>Frise — Test <frise>'));
  assert.equal((page.match(/<\/script/g) || []).length, 1);
  const d = payload(page);
  assert.equal(d.nomVue, 'Test <frise>');
  assert.equal(d.taches[0].ref, 'A');
  assert.equal(d.vars['--text-normal'], '#222222');
});

test('pageFriseHtml : données hostiles restent inertes', () => {
  const hostile = Object.assign({}, FIXTURE, {
    nomVue: '</script><script>alert(1)</script>',
    taches: [{ ref: '</style>', statut: 'à faire', debut: '', echeance: '', parent: '', bloquePar: [] }],
  });
  const page = pageFriseHtml(hostile);
  assert.equal((page.match(/<\/script/g) || []).length, 1);
  assert.ok(page.includes('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
});

// Garde : tout identifiant externe que le moteur mentionne doit être défini
// dans le socle de la page — un renommage dans le moteur casse sinon l'export
// en silence. On scanne donc le VRAI source de MoteurFrise (commentaires,
// chaînes et regex retirés) et on compare aux identifiants attendus.
const IDENTIFIANTS_DU_MOTEUR = [
  'svgEl', 'tr', 'Ariane', 'obsidian',
  'ModaleDaterTache', 'ModaleTache', 'TYPE_VUE_BASE_FRISE',
  'DEFAUTS_FRISE', 'JOURS_MINIMUM_GANTT', 'MOIS_COURTS', 'MOIS_LETTRES',
  'LANGUE', 'TEXTES',
  '_toucheAnnuler', '_toucheRetablir', 'annulerDernier', 'refaireDernier',
  'poserAnnulation',
];

// Noms que le scan ne distingue pas du code (clés d'objets littéraux,
// déstructurations et paramètres rattrapés de justesse par l'heuristique),
// plus pageFriseHtml : référencé par exporterHtml, dont le bouton est retiré
// dans la page exportée — la référence reste donc dormante.
const FAUX_POSITIFS = new Set([
  'aa', 'aliases', 'align', 'apres', 'attr', 'barreCouleur', 'behavior', 'blur',
  'checkbox', 'cls', 'coffre', 'color', 'court', 'd1', 'd2', 'date', 'datetime',
  'defauts', 'degage', 'event', 'fmt', 'gcle', 'hoverParent', 'href', 'jj',
  'kidsRefs', 'langue', 'lib', 'lignageSurvol', 'linktext', 'medium', 'moteur',
  'multitext', 'number', 'onChange', 'pageFriseHtml', 'patternTransform',
  'patternUnits', 'periodes', 'pr', 'preventScroll', 'role', 'rx', 'ry',
  'semaine', 'short', 'source', 'sourcePath', 'surRail', 'tags', 'targetEl',
  'text', 'threshold', 'trimestre', 'tall', 'typeVue', 'va', 'vb',
]);

const GLOBAUX_JS = new Set(['window', 'document', 'Math', 'Date', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Symbol', 'Intl', 'console', 'parseFloat',
  'parseInt', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'Uint8Array',
  'ArrayBuffer', 'DataView', 'Blob', 'Element', 'HTMLElement', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'DragEvent', 'CustomEvent', 'requestAnimationFrame',
  'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'getComputedStyle',
  'matchMedia', 'location', 'navigator', 'history', 'localStorage', 'sessionStorage',
  'confirm', 'fetch', 'URL', 'URLSearchParams', 'structuredClone', 'queueMicrotask',
  'globalThis', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'performance']);

function identifiantsLibresDuMoteur(src) {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/\/(?![/*])(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '/r/');
  const mots = new Set();
  for (const m of code.matchAll(/[A-Za-z_$][\w$]*/g)) mots.add(m[0]);
  const declares = new Set(['MoteurFrise', 'VueFriseBase', 'this', 'super', 'constructor',
    'static', 'get', 'set', 'async', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'default', 'try', 'catch', 'finally', 'return', 'break', 'continue', 'new', 'typeof',
    'instanceof', 'in', 'of', 'var', 'let', 'const', 'function', 'class', 'extends', 'delete',
    'void', 'throw', 'await', 'yield', 'true', 'false', 'null', 'undefined', 'arguments',
    'NaN', 'Infinity']);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declares.add(m[1]);
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) declares.add(m[1]);
  for (const m of code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) declares.add(m[1]);
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\{/g)) {
    declares.add(m[1]);
    for (const p of m[2].split(',')) {
      const nom = p.trim().replace(/^\{|\}$/g, '').split(/[:=\s]/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nom)) declares.add(nom);
    }
  }
  for (const m of code.matchAll(/\(([A-Za-z_$][\w$]*|[,{][^()]*)\)\s*=>/g)) {
    for (const p of m[1].replace(/[(){}]/g, ' ').split(/[,]/)) {
      const nom = p.trim().split(/[:=\s]/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nom)) declares.add(nom);
    }
  }
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declares.add(m[1]);
  for (const m of code.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) declares.add(m[1]);
  for (const m of code.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declares.add(m[1]);
  const proprietes = new Set();
  for (const m of code.matchAll(/\.([A-Za-z_$][\w$]*)/g)) proprietes.add(m[1]);
  return [...mots].filter((id) =>
    !declares.has(id) && !proprietes.has(id) && !GLOBAUX_JS.has(id)).sort();
}

test('export HTML : identifiants externes du moteur définis dans le socle', () => {
  const src = sourceMoteur();
  const page = pageFriseHtml(FIXTURE);
  const libres = identifiantsLibresDuMoteur(src);
  const inconnus = libres.filter((id) =>
    !IDENTIFIANTS_DU_MOTEUR.includes(id) && !FAUX_POSITIFS.has(id));
  assert.deepEqual(inconnus, [],
    'identifiants libres inattendus dans MoteurFrise : les définir dans le socle'
    + ' de la page exportée (pageFriseHtml) et les cuire dans exporterHtml');
  for (const id of IDENTIFIANTS_DU_MOTEUR) {
    assert.ok(new RegExp('\\b' + id + '\\b').test(src),
      id + ' n est plus utilisé par le moteur : mettre à jour la liste de garde');
    const def = new RegExp('(const|let|var|function|class)\\s+' + id + '\\b');
    assert.ok(def.test(page), id + ' doit être défini dans le socle de la page exportée');
  }
  for (const id of ['TEXTES', 'LANGUE']) {
    assert.ok(new RegExp('const\\s+' + id + '\\b').test(page),
      id + ' doit être défini dans le socle (requis par tr)');
  }
});

test('export HTML : le socle embarque et évalue le vrai moteur', () => {
  const page = pageFriseHtml(Object.assign({}, FIXTURE, { moteur: sourceMoteur() }));
  assert.ok(page.includes("Function('return (' + D.moteur + ')')"));
  assert.ok(page.includes('new MoteurFrise(greffon, racine, ctx)'));
  assert.ok(page.includes('class GreffonFactice'));
  assert.ok(page.includes('class CtxFactice'));
  // Les boutons d'export sont retirés au démarrage de la page.
  assert.ok(page.includes('.zfa-gantt-bv-export, .zfa-gantt-bv-export-html'));
  // Les écritures passent par le message lecture seule.
  assert.ok(page.includes('MSG_LECTURE'));
  assert.ok(page.includes('Ariane.refDeLien(v) !== deRef'));
  // Régression : createEl doit ATTACHER l'élément à son parent (Obsidian le
  // fait) — sinon la page se dessine sans la moindre erreur et reste vide.
  assert.ok(page.includes('this.appendChild(el)'));
  // La colonne de gauche reprend le balisage Bases : le gabarit de mise en
  // page (normalement fourni par le coeur d'Obsidian) doit rester dans la
  // coquille, sinon les en-têtes s'empilent verticalement.
  assert.ok(page.includes('#frise .bases-td'));
});

test('export HTML : tâches vivantes figées en données pures', () => {
  const { tachesPourExport, multiPourExport } = Ariane._test;
  // Le TFile du coffre : circulaire (parent → children → le fichier).
  const f = { basename: 'A' };
  f.parent = { children: [f] };
  f.file = f;
  const taches = [{
    ref: 'A', intitule: 'A', parent: '', bloquePar: ['[[B]]'], debut: '2026-09-01',
    echeance: '', heure: '', creneaux: [], statut: 'à faire', priorite: '',
    avancement: 0, jalon: false, famille: '', x: null, y: null,
    fichier: f, _cle: '9', _multi: [{ v: 'x', s: 1 }],
  }];
  const figees = tachesPourExport(taches);
  const tour = JSON.parse(JSON.stringify(figees)); // ne doit pas lancer
  assert.equal(tour[0].ref, 'A');
  assert.equal(tour[0].bloquePar[0], '[[B]]');
  assert.equal(tour[0].avancement, 0);
  assert.equal('fichier' in tour[0], false);
  assert.equal('_cle' in tour[0], false);
  assert.equal('_multi' in tour[0], false);
  // Valeurs du tri natif : objet Bases figé en texte, liste absente → null.
  const multi = multiPourExport({
    A: [{ v: { toString() { return '9'; } }, s: -1 }],
    B: null,
  });
  assert.equal(multi.A[0].v, '9');
  assert.equal(multi.A[0].s, -1);
  assert.equal(multi.B, null);
  assert.deepEqual(JSON.parse(JSON.stringify(multi)), multi);
});
