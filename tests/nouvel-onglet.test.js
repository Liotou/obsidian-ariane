// « Toujours ouvrir dans un nouvel onglet » : l'enveloppe de
// WorkspaceLeaf.openFile, éprouvée sur des onglets factices (notes, bases,
// canevas : tout fichier passe par là).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { WorkspaceLeaf } = require('obsidian');

function monter(reglage) {
  const ouverts = [];
  const racine = {};
  WorkspaceLeaf.prototype.openFile = async function (file) { this.view = { file }; ouverts.push([this.nom, file.path]); };
  WorkspaceLeaf.prototype.getRoot = function () { return this.racine; };
  WorkspaceLeaf.prototype.setEphemeralState = function (e) { this.eState = e; };
  const onglet = (nom, chemin, r) => Object.assign(new WorkspaceLeaf(), { nom, racine: r || racine, view: chemin ? { file: { path: chemin } } : {} });
  const feuilles = [];
  let actif = null;
  const ws = {
    rootSplit: racine,
    iterateRootLeaves: (f) => feuilles.filter((l) => l.racine === racine).forEach(f),
    getLeaf: () => { const l = onglet('neuf' + feuilles.length); feuilles.push(l); return l; },
    setActiveLeaf: (l) => { actif = l; },
  };
  const disposes = [];
  const g = Object.create(Ariane.prototype);
  Object.assign(g, { settings: { toujoursNouvelOnglet: reglage }, app: { workspace: ws }, register: (f) => disposes.push(f) });
  g.brancherNouvelOnglet();
  return { onglet, feuilles, ouverts, actif: () => actif, defaire: () => disposes.forEach((f) => f()) };
}

test('nouvel onglet : notes, bases et canevas ne remplacent plus l’onglet courant', async () => {
  const m = monter(true);
  const base = m.onglet('base', 'Tâches.base');
  const vide = m.onglet('vide', null);
  m.feuilles.push(base, vide);
  await base.openFile({ path: 'T040.md' });
  assert.deepEqual(m.ouverts, [['neuf2', 'T040.md']], 'la base reste, la note part dans un onglet neuf');
  assert.strictEqual(m.actif(), m.feuilles[2]);
  await m.feuilles[2].openFile({ path: 'Plan.canvas' });
  assert.deepEqual(m.ouverts.at(-1), ['neuf3', 'Plan.canvas'], 'un canevas aussi');
  await vide.openFile({ path: 'Brouillon.md' });
  assert.deepEqual(m.ouverts.at(-1), ['vide', 'Brouillon.md'], 'un onglet vide se remplit');
  // Déjà ouverte : on rejoint son onglet, avec l'état porté (titre visé).
  const n = m.ouverts.length;
  await base.openFile({ path: 'T040.md' }, { eState: { subpath: '#Plan' } });
  assert.equal(m.ouverts.length, n, 'pas de doublon');
  assert.strictEqual(m.actif(), m.feuilles[2]);
  assert.deepEqual(m.feuilles[2].eState, { subpath: '#Plan' });
  // Volet latéral : intouché.
  const cote = m.onglet('cote', 'A.md', {});
  await cote.openFile({ path: 'B.md' });
  assert.deepEqual(m.ouverts.at(-1), ['cote', 'B.md']);
  m.defaire();
});

test('nouvel onglet : réglage coupé, comportement d’Obsidian', async () => {
  const m = monter(false);
  const note = m.onglet('note', 'A.md');
  m.feuilles.push(note);
  await note.openFile({ path: 'B.md' });
  assert.deepEqual(m.ouverts, [['note', 'B.md']]);
  m.defaire();
});
