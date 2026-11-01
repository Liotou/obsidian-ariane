// Les appels tenus par Ariane en propriétés : ce que Base.base comptait par
// file.backlinks, au prix d'un gel à chaque frappe.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { compterAppels } = Ariane._test;

const resolved = {
  'Thèse.md': { 'A/K1.md': 1, 'A/K2.md': 3, 'Refs/@adner.md': 1 },
  'Brouillon.md': { 'A/K1.md': 2 },
  'A/K1.md': { 'Refs/@adner.md': 1, 'A/K1.md': 1 },
  'A/K2.md': { 'Refs/@adner.md': 2 },
  'A/K3.md': { 'Refs/@adner.md': 1 },
};
const estAnnotation = (c) => c.startsWith('A/');

test('compterAppels : notes distinctes qui citent, annotations par source', () => {
  const { appels, annotations } = compterAppels(resolved, estAnnotation);
  assert.equal(appels.get('A/K1.md'), 2, 'deux notes, quel que soit le nombre de liens, sans compter le lien vers soi');
  assert.equal(appels.get('A/K2.md'), 1);
  assert.equal(appels.get('A/K3.md'), undefined, 'jamais citée');
  assert.equal(appels.get('Refs/@adner.md'), 4);
  assert.equal(annotations.get('Refs/@adner.md'), 3, 'les seules annotations');
  assert.deepEqual([...compterAppels(null, estAnnotation).appels], []);
});

const greffonDe = (reglages) => {
  const g = Object.create(Ariane.prototype);
  g.settings = Object.assign({ dossierAnnotations: 'A', marquerOrphelines: true, tagOrpheline: 'orphelin' }, reglages);
  Object.defineProperty(g, 'dossierA', { value: 'A' });
  return g;
};

test('_appelsVoulus : seules changent les notes dont un chiffre a bougé', () => {
  const comptes = compterAppels(resolved, estAnnotation);
  const g = greffonDe({});
  assert.equal(g._appelsVoulus({ path: 'A/K1.md' }, { 'zotflow-anno-key': 'K1', appels: 2 }, comptes), null, 'déjà juste');
  assert.deepEqual(g._appelsVoulus({ path: 'A/K1.md' }, { 'zotflow-anno-key': 'K1', appels: 1 }, comptes), { appels: 2 });
  assert.deepEqual(g._appelsVoulus({ path: 'A/K1.md' }, { 'zotflow-anno-key': 'K1', tags: ['orphelin'] }, comptes),
    { orpheline: false, appels: 2 }, 'citée : l’étiquette part, le compte vient, en une écriture');
  assert.deepEqual(g._appelsVoulus({ path: 'A/K3.md' }, { 'zotflow-anno-key': 'K3', appels: 1 }, comptes),
    { orpheline: true, appels: 0 }, 'plus citée : le compte part');
  assert.equal(g._appelsVoulus({ path: 'A/K3.md' }, { 'zotflow-anno-key': 'K3', tags: 'orphelin' }, comptes), null);
  assert.deepEqual(g._appelsVoulus({ path: 'Refs/@adner.md' }, { 'zotero-key': 'X', citationKey: 'adner' }, comptes), { annotations: 3 });
  assert.equal(g._appelsVoulus({ path: 'Thèse.md' }, { title: 'Thèse' }, comptes), null, 'ni annotation ni fiche source');
});

test('_appelsVoulus : un réglage coupé retire ce qu’il avait posé', () => {
  const comptes = compterAppels(resolved, estAnnotation);
  const g = greffonDe({ compterAppels: false, marquerOrphelines: false });
  assert.deepEqual(g._appelsVoulus({ path: 'A/K1.md' }, { 'zotflow-anno-key': 'K1', appels: 2 }, comptes), { appels: 0 });
  assert.deepEqual(g._appelsVoulus({ path: 'A/K3.md' }, { 'zotflow-anno-key': 'K3', tags: ['orphelin'] }, comptes), { orpheline: false });
  assert.deepEqual(g._appelsVoulus({ path: 'Refs/@adner.md' }, { 'zotero-key': 'X', citationKey: 'adner', 'nb-annotations': 3 }, comptes), { annotations: 0 });
});
