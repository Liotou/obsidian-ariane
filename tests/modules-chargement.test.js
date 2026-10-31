// Le démarrage réel d'Ariane, module par module : un module coupé
// n'enregistre rien (commandes, vues, ruban, écoutes, extensions…).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { MODULES_ARIANE, PROFILS_ARIANE } = Ariane._test;

// CodeMirror, que l'éditeur d'Obsidian fournit : juste ce que les extensions
// d'Ariane appellent pour se construire.
{
  const Module = require('module');
  const rien = () => ({});
  const cm = {
    ViewPlugin: { fromClass: rien }, WidgetType: class {}, RangeSetBuilder: class { add() {} finish() { return {}; } },
    Decoration: { mark: rien, replace: rien, widget: rien, none: {}, set: rien },
    EditorView: { decorations: { from: rien }, atomicRanges: { of: rien } },
    StateField: { define: rien }, StateEffect: { define: () => ({ of: rien }) },
    EditorState: { transactionFilter: { of: rien } },
    hoverTooltip: rien, keymap: { of: rien },
  };
  const charger = Module._load;
  Module._load = function (demande) {
    return /^@codemirror\//.test(demande) ? cm : charger.apply(this, arguments);
  };
}

if (typeof global.window === 'undefined') global.window = { setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {}, clearInterval: () => {} };
if (typeof global.document === 'undefined') global.document = {};

// La classe de base d'Obsidian (vide dans le factice) reçoit de quoi compter.
let socle = Ariane.prototype;
while (socle && !Object.prototype.hasOwnProperty.call(socle, 'loadSettings')) socle = Object.getPrototypeOf(socle);
const base = Object.getPrototypeOf(socle);

async function demarrer(modules) {
  const releve = [];
  const noter = (genre, quoi) => { releve.push(genre + ' ' + quoi); return { genre }; };
  const methodes = {
    addCommand: (c) => noter('commande', c.id),
    registerView: (t) => noter('vue', t),
    addRibbonIcon: (i) => noter('ruban', i),
    registerEvent: () => noter('écoute', ''),
    registerDomEvent: (_c, ev) => noter('dom', ev),
    registerInterval: () => noter('minuterie', ''),
    registerMarkdownPostProcessor: () => noter('rendu', ''),
    registerMarkdownCodeBlockProcessor: (n) => noter('bloc', n),
    registerEditorExtension: () => noter('extension', ''),
    registerHoverLinkSource: (n) => noter('survol', n),
    registerBasesView: (n) => noter('base', n),
    addChild: (c) => noter('composant', c && c.constructor && c.constructor.name),
    addSettingTab: () => {}, register: () => {},
  };
  const avant = {};
  for (const [k, f] of Object.entries(methodes)) { avant[k] = base[k]; base[k] = f; }
  try {
    const app = {
      workspace: { on: () => ({}), onLayoutReady: () => {}, getLeavesOfType: () => [], detachLeavesOfType: () => {},
        iterateAllLeaves: () => {}, trigger: () => {} },
      vault: { on: () => ({}), getName: () => 'Coffre', getMarkdownFiles: () => [], adapter: {} },
      metadataCache: { on: () => ({}), getFileCache: () => null },
      plugins: {},
    };
    const g = Object.create(Ariane.prototype);
    Object.assign(g, { app, manifest: { id: 'obsidian-ariane', dir: '.obsidian/plugins/obsidian-ariane' },
      loadData: async () => ({ modules, modulesConnus: MODULES_ARIANE.map((m) => m.id) }), saveData: async () => {},
      // Ce qui touche au DOM d'Obsidian avant les enregistrements.
      appliquerStyleAparte() {}, installerVerrouLecture() {}, installerAffichageTaches() {}, appliquerCssPersonnalise() {} });
    await g.onload();
    return releve;
  } finally {
    for (const [k, f] of Object.entries(avant)) { if (f === undefined) delete base[k]; else base[k] = f; }
  }
}

test('démarrage : chaque module coupé retire ses enregistrements, et rien d’autre', async () => {
  const tout = await demarrer(PROFILS_ARIANE.tout);
  assert.ok(tout.filter((x) => x.startsWith('commande')).length >= 78, 'commandes : ' + tout.length);
  for (const m of MODULES_ARIANE) {
    if (m.coeur) continue;
    const coupes = [m.id].concat(Ariane.modulesDependants(m.id, PROFILS_ARIANE.tout));
    const sans = await demarrer(PROFILS_ARIANE.tout.filter((id) => !coupes.includes(id)));
    assert.ok(sans.length < tout.length, m.id + ' coupé : rien de moins (' + sans.length + ')');
    // Ce qui reste est un sous-ensemble de ce qu'enregistre le profil « Tout ».
    const reste = tout.slice();
    for (const x of sans) {
      const i = reste.indexOf(x);
      assert.ok(i >= 0, m.id + ' coupé : enregistrement inattendu ' + x);
      reste.splice(i, 1);
    }
  }
});

test('démarrage : le cœur seul n’enregistre ni tâches, ni temps, ni suggestions', async () => {
  const coeur = await demarrer(['annotations', 'citations']);
  for (const interdit of ['vue zfa-suggestions', 'ruban history', 'ruban sparkles', 'bloc ariane-organisation',
    'commande creer-tache', 'commande rappels-pousser', 'commande ouvrir-chronologie', 'composant IntegrationCanevas',
    'composant BarreEdition', 'composant PontClaude', 'composant CorrecteurApple']) {
    assert.ok(!coeur.includes(interdit), 'présent avec le cœur seul : ' + interdit);
  }
  assert.ok(coeur.includes('commande atomise-tout'));
  assert.ok(coeur.includes('commande citations-basculer'));
});
