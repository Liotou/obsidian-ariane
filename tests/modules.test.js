// Les modules d'Ariane : registre, dépendances, état.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { MODULES_ARIANE, PROFILS_ARIANE } = Ariane._test;

test('registre : seize modules, ids uniques, dépendances connues, cœur en tête', () => {
  const ids = MODULES_ARIANE.map((m) => m.id);
  assert.equal(ids.length, 16);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of MODULES_ARIANE) for (const d of m.dependances) assert.ok(ids.includes(d), m.id + ' -> ' + d);
  assert.deepEqual(MODULES_ARIANE.filter((m) => m.coeur).map((m) => m.id), ['annotations', 'citations']);
  for (const p of Object.values(PROFILS_ARIANE)) for (const id of p) assert.ok(ids.includes(id), id);
  assert.equal(PROFILS_ARIANE.tout.length, 16);
});

test('dépendances : le cœur et les dépendances s’ajoutent, l’ordre suit le registre', () => {
  assert.deepEqual(Ariane.modulesAvecDependances(['rappels']), ['annotations', 'citations', 'taches', 'rappels']);
  assert.deepEqual(Ariane.modulesAvecDependances([]), ['annotations', 'citations']);
  assert.deepEqual(Ariane.modulesAvecDependances(['inconnu', 'export']), ['annotations', 'citations', 'export']);
  assert.deepEqual(Ariane.modulesDependants('taches', ['taches', 'rappels', 'temps']), ['rappels']);
  assert.deepEqual(Ariane.modulesDependants('temps', ['taches', 'rappels', 'temps']), []);
});

test('état : cœur toujours, Mac seul, réglage absent vaut tout', () => {
  assert.equal(Ariane.moduleActif('citations', [], false), true);
  assert.equal(Ariane.moduleActif('taches', ['export'], true), false);
  assert.equal(Ariane.moduleActif('taches', ['taches'], false), true);
  assert.equal(Ariane.moduleActif('correcteur', ['correcteur'], false), false);
  assert.equal(Ariane.moduleActif('correcteur', ['correcteur'], true), true);
  assert.equal(Ariane.moduleActif('taches', null, false), true);
  assert.equal(Ariane.moduleActif('inconnu', null, true), false);
  const g = Object.assign(Object.create(Ariane.prototype), { settings: { modules: ['canevas'] } });
  assert.equal(g.module('canevas'), true);
  assert.equal(g.module(['canevas', 'taches']), false);
  assert.equal(g.module(['annotations', 'canevas']), true);
});

test('migration : une installation existante passe au profil « Tout », une nouvelle au profil Zotero avec présentation', async () => {
  const ancienne = Object.assign(Object.create(Ariane.prototype), { loadData: async () => ({ langue: 'fr' }), saveData: async () => {} });
  await ancienne.loadSettings();
  assert.deepEqual(ancienne.settings.modules, PROFILS_ARIANE.tout);
  assert.ok(!ancienne._accueilAOuvrir, 'pas de présentation chez qui a déjà des réglages');
  const neuve = Object.assign(Object.create(Ariane.prototype), { loadData: async () => null, saveData: async () => {} });
  await neuve.loadSettings();
  assert.deepEqual(neuve.settings.modules, PROFILS_ARIANE.zotero);
  assert.equal(neuve._accueilAOuvrir, true);
  const g = Object.assign(Object.create(Ariane.prototype), { loadData: async () => ({ modules: ['export'] }), saveData: async () => {} });
  await g.loadSettings();
  assert.deepEqual(g.settings.modules, ['export']);
});

test('un module nouveau s’ajoute chez qui avait tous les autres, et seulement là', async () => {
  const { MODULES_ARIANE_3_0 } = Ariane._test;
  const tout30 = MODULES_ARIANE_3_0.slice();
  assert.deepEqual(Ariane.modulesAvecNouveaux(tout30, undefined), PROFILS_ARIANE.tout);
  assert.deepEqual(Ariane.modulesAvecNouveaux(['export'], undefined), ['export']);
  assert.deepEqual(Ariane.modulesAvecNouveaux(tout30.filter((m) => m !== 'temps'), undefined),
    tout30.filter((m) => m !== 'temps'));
  // Une fois noté, le module ne revient pas chez qui l'a coupé.
  const sans = PROFILS_ARIANE.tout.filter((m) => m !== 'commentaires');
  assert.deepEqual(Ariane.modulesAvecNouveaux(sans, PROFILS_ARIANE.tout), sans);
  const g = Object.assign(Object.create(Ariane.prototype), { loadData: async () => ({ modules: tout30 }), saveData: async () => {} });
  await g.loadSettings();
  assert.ok(g.settings.modules.includes('commentaires'));
  assert.deepEqual(g.settings.modulesConnus, PROFILS_ARIANE.tout);
});

test('commandes : chacune porte un module connu', () => {
  const fs = require('fs');
  const path = require('path');
  const ids = new Set(MODULES_ARIANE.map((m) => m.id));
  const dossier = path.join(__dirname, '..', 'src');
  let n = 0;
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.js'))) {
    const t = fs.readFileSync(path.join(dossier, f), 'utf8');
    for (const m of t.matchAll(/this\.addCommand\(\{([\s\S]*?)\n\s*\}\);/g)) {
      n += 1;
      const mm = m[1].match(/module: (\[[^\]]*\]|'[^']*')/);
      assert.ok(mm, f + ' : commande sans module :' + m[1].slice(0, 80));
      for (const id of mm[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1))) assert.ok(ids.has(id), f + ' : module inconnu ' + id);
    }
  }
  assert.ok(n >= 78, 'commandes relevées : ' + n);
});

test('commandes : celle d’un module coupé n’est pas enregistrée, la propriété ne passe pas', () => {
  // La surcharge vit dans le socle ; au-dessus, la classe de base d'Obsidian.
  let socle = Ariane.prototype;
  while (socle && !Object.prototype.hasOwnProperty.call(socle, 'loadSettings')) socle = Object.getPrototypeOf(socle);
  const base = Object.getPrototypeOf(socle);
  const recues = [];
  const orig = base.addCommand;
  base.addCommand = function (c) { recues.push(c); return c; };
  try {
    const g = Object.assign(Object.create(Ariane.prototype), { settings: { modules: ['annotations', 'citations'] } });
    assert.equal(g.addCommand({ id: 'a', module: 'taches', name: 'A' }), null);
    g.addCommand({ id: 'b', module: 'citations', name: 'B' });
    g.addCommand({ id: 'c', module: ['canevas', 'taches'], name: 'C' });
    assert.deepEqual(recues, [{ id: 'b', name: 'B' }]);
  } finally { base.addCommand = orig; }
});

test('réglages : chaque rubrique existante a sa place dans un onglet', () => {
  const fs = require('fs');
  const path = require('path');
  const { ArianeSettingTab } = Ariane._test;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '12-reglages.js'), 'utf8');
  const places = new Set();
  const entieres = new Set();
  for (const d of ArianeSettingTab.COMPOSITION) {
    for (const [meth, titre] of (d.rubriques || []).concat(d.avance || [])) {
      if (titre === '*') entieres.add(meth); else places.add(meth + ' :: ' + titre);
    }
  }
  places.add('ongletGeneral :: Langue');   // dans l'Accueil
  const ids = new Set(MODULES_ARIANE.map((m) => m.id));
  for (const d of ArianeSettingTab.COMPOSITION) if (d.module) assert.ok(ids.has(d.module), d.module);
  // Les rubriques des anciennes méthodes d'onglet, par leur titre.
  const orphelines = [];
  let vues = 0;
  const re = /^  (onglet[A-Z]\w*)\(c, s, maj\) \{([\s\S]*?)^  \}/gm;
  for (const m of src.matchAll(re)) {
    if (m[1] === 'ongletAccueil' || m[1] === 'ongletModules' || entieres.has(m[1])) continue;
    for (const t of m[2].matchAll(/_section\(c, tr\((['"])((?:\\.|(?!\1).)*)\1\)/g)) {
      const titre = t[2].replace(/\\'/g, "'");
      vues += 1;
      if (!places.has(m[1] + ' :: ' + titre)) orphelines.push(m[1] + ' :: ' + titre);
    }
  }
  assert.deepEqual(orphelines, []);
  assert.ok(vues >= 40, 'rubriques relevées : ' + vues);
});
