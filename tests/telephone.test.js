// Ariane sur téléphone : ni Node ni Electron. Le démarrage aboutit sans
// toucher à un module de Node, les modules de l'ordinateur s'effacent, les
// commandes « bureau » n'existent pas, et rien ne réagit aux notes qu'iCloud
// apporte de l'ordinateur.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const TELEPHONE = { isMacOS: false, isIosApp: true, isMobileApp: true, isMobile: true, isPhone: true, isDesktopApp: false };
const ORDINATEUR = { isMacOS: true, isDesktopApp: true };

// Les modules de Node, interdits le temps d'un essai « téléphone ».
const interdits = new Set(Module.builtinModules.concat(['electron']));
let sansNode = false;
const demandes = [];
const charger = Module._load;
Module._load = function (demande) {
  const nom = String(demande).replace(/^node:/, '');
  if (sansNode && interdits.has(nom)) {
    demandes.push(nom);
    throw new Error("Cannot find module '" + nom + "'");
  }
  return charger.apply(this, arguments);
};

const Ariane = require('./obsidian-factice.js');
const { PROFILS_ARIANE, MODULES_ARIANE } = Ariane._test;
const { demarrer } = require('./demarrage-factice.js');

async function surTelephone(fn) {
  global.__arianePlateforme = TELEPHONE;
  sansNode = true;
  demandes.length = 0;
  try { return await fn(); } finally {
    sansNode = false;
    global.__arianePlateforme = ORDINATEUR;
  }
}

test('téléphone : le démarrage avec tous les modules aboutit, sans aucun module de Node', async () => {
  const releve = await surTelephone(() => demarrer(PROFILS_ARIANE.tout));
  assert.deepEqual(demandes, [], 'modules de Node demandés : ' + demandes.join(', '));
  const commandes = releve.filter((x) => x.startsWith('commande ')).map((x) => x.slice(9));
  assert.ok(commandes.length >= 60, 'commandes : ' + commandes.length);
  // La nouveauté du téléphone : citer sans glisser-déposer.
  assert.ok(commandes.includes('citer-annotation'));
  // Les commandes qui ont besoin de l'ordinateur n'y sont pas.
  for (const id of ['atomise-active', 'atomise-tout', 'rattacher-toutes-references', 'organisation-repartir',
    'exporter-word-zotero', 'publier-site', 'claude-installer', 'rappels-pousser', 'suggestions-ouvrir',
    'journee-resumer', 'schema-synchroniser-tout', 'correcteur-relire']) {
    assert.ok(!commandes.includes(id), id + ' ne devrait pas exister sur téléphone');
  }
  // Ce qui sert à écrire et à tenir ses tâches, si.
  for (const id of ['creer-tache', 'ajouter-tache-langage-naturel', 'citations-basculer', 'biblio-note',
    'commentaire-ajouter', 'paragraphe-monter', 'assistant-outils', 'barre-basculer', 'sommaire-lecture']) {
    assert.ok(commandes.includes(id), id + ' manque sur téléphone');
  }
});

test('ordinateur : les commandes « bureau » existent toujours', async () => {
  global.__arianePlateforme = ORDINATEUR;
  const releve = await demarrer(PROFILS_ARIANE.tout);
  for (const id of ['atomise-active', 'rattacher-toutes-references', 'organisation-repartir', 'citer-annotation']) {
    assert.ok(releve.includes('commande ' + id), id);
  }
});

test('téléphone : chaque module se charge seul, sans module de Node', async () => {
  for (const m of MODULES_ARIANE) {
    const mods = m.coeur ? ['annotations', 'citations'] : ['annotations', 'citations', m.id];
    await surTelephone(() => demarrer(mods));
    assert.deepEqual(demandes, [], m.id + ' : ' + demandes.join(', '));
  }
});

test('moduleActif : les modules « bureauSeul » n’existent pas sur téléphone', () => {
  const tout = MODULES_ARIANE.map((m) => m.id);
  const bureau = MODULES_ARIANE.filter((m) => m.bureauSeul).map((m) => m.id);
  assert.deepEqual(bureau.sort(), ['claude', 'correcteur', 'export', 'publication', 'rappels', 'schemas', 'suggestions', 'temps']);
  for (const id of bureau) {
    assert.equal(Ariane.moduleActif(id, tout, false, false), false, id);
    if (id !== 'correcteur') assert.equal(Ariane.moduleActif(id, tout, false, true), true, id);
  }
  for (const id of ['taches', 'commentaires', 'barre', 'assistant', 'familles']) {
    assert.equal(Ariane.moduleActif(id, tout, false, false), true, id);
  }
});

test('IA : sur téléphone, seul Mistral répond, quel que soit le réglage', () => {
  for (const f of ['claude', 'ollama', 'lmstudio', 'apple', 'mistral']) {
    assert.equal(Ariane.fournisseurSurCeSysteme(f, {}, false, true, true), 'mistral', f);
  }
  // Sur ordinateur, rien ne change.
  assert.equal(Ariane.fournisseurSurCeSysteme('claude', {}, true, true, false), 'claude');
});

test('citer une annotation : la citation se pose avant la ponctuation de la phrase du curseur', () => {
  const p = Ariane.positionCitationAuCurseur;
  const t = 'Le risque est systémique. Il déborde les sites.';
  // Curseur au milieu de la première phrase : avant son point.
  assert.equal(p(t, 5, 0), t.indexOf('.'));
  // Curseur juste après le point (avec ou sans espace) : la phrase qui précède.
  assert.equal(p(t, t.indexOf('.') + 1, 0), t.indexOf('.'));
  assert.equal(p(t, t.indexOf('.') + 2, 0), t.indexOf('.'));
  // Dans la seconde phrase : avant son point final, décalé du début de ligne.
  assert.equal(p(t, t.length - 3, 100), 100 + t.length - 1);
  // Ponctuation française : l'espace avant « ? » reste hors de la citation.
  assert.equal(p('Est-ce systémique ?', 3, 0), 'Est-ce systémique'.length);
  // Ligne vide : pas de position, la citation va en fin de ligne.
  assert.equal(p('   ', 1, 0), undefined);
});

// Un greffon minimal, pour les écoutes et l'enregistrement des réglages.
function greffon(actif) {
  const g = Object.create(Ariane.prototype);
  g.ecrituresRecentes = new Map();
  g.antirebonds = new Map();
  g.app = { workspace: { getActiveFile: () => (actif ? { path: actif } : null) } };
  return g;
}

test('changementLocal : sur téléphone, seule la note ouverte ou écrite par Ariane compte', async () => {
  const g = greffon('03 - Notes/ouverte.md');
  await surTelephone(() => {
    assert.equal(g.changementLocal({ path: '03 - Notes/ouverte.md' }), true);
    assert.equal(g.changementLocal({ path: '08 - Tâches/T26-001.md' }), false, 'apportée par iCloud');
    g.marquerEcriture('08 - Tâches/T26-001.md');
    assert.equal(g.changementLocal({ path: '08 - Tâches/T26-001.md' }), true, 'écrite par Ariane');
  });
  assert.equal(g.changementLocal({ path: 'ailleurs.md' }), true, 'sur ordinateur, toujours');
});

test('téléphone : une note créée ou supprimée par iCloud ne déclenche rien', async () => {
  const g = greffon(null);
  g.settings = { regenerationAuto: true, rattachementZotero: true, propagerSuppressions: true };
  const TFile = require('obsidian').TFile;
  const f = Object.assign(Object.create(TFile.prototype), { path: '98 - Bibliographie/@source.md', extension: 'md' });
  await surTelephone(() => {
    g.surCreation(f);
    g.surSuppression(f);
    g.surModification(f);
  });
  assert.equal(g.antirebonds.size, 0, [...g.antirebonds.keys()].join(', '));
});

test('téléphone : les réglages partagés ne se réécrivent que s’ils changent', async () => {
  const g = greffon(null);
  let ecritures = 0;
  g.loadData = async () => ({ modules: ['annotations', 'citations'], modulesConnus: MODULES_ARIANE.map((m) => m.id), donneesJourVersion: 2 });
  g.saveData = async () => { ecritures += 1; };
  g._invaliderIndexTaches = () => {};
  g.migrerFamilles = () => 0;
  await surTelephone(async () => {
    await g.loadSettings();
    await g.saveSettings();
    assert.equal(ecritures, 0, 'rien de changé : pas d’écriture');
    g.settings.citationsRepliees = !g.settings.citationsRepliees;
    await g.saveSettings();
    assert.equal(ecritures, 1, 'un changement : une écriture');
    await g.saveSettings();
    assert.equal(ecritures, 1);
  });
});
