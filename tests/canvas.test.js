const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Ariane = require('./obsidian-factice.js');

const sonde = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'sonde.canvas'), 'utf8'));

// Une tâche est une note du dossier des tâches, reconnue à son nom.
const estTache = (chemin) => {
  const m = String(chemin).match(/\/(T\d{2}-\d{3,4})\.md$/);
  return m ? m[1] : null;
};
const lire = (c) => Ariane.lireCanvasTaches(c, estTache, '6');
const deux = (couleur, libelle) => ({
  nodes: [
    { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
    { id: 'b', type: 'file', file: '8 - Tâches/T26-002.md' },
  ],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b', color: couleur, label: libelle }],
});

test('la sonde du coffre se lit sans erreur', () => {
  const r = lire(sonde);
  assert.ok(r.noeuds.length >= 2);
  assert.ok(r.liens.length >= 1);
});

test('une arête sans couleur est un blocage', () => {
  assert.deepEqual(lire(deux(undefined, undefined)).liens,
    [{ de: 'T26-001', vers: 'T26-002', relation: 'bloque', libelle: '' }]);
});

test('une arête de la couleur de composition relie un parent à son enfant', () => {
  assert.equal(lire(deux('6')).liens[0].relation, 'compose');
});

test('une arête rouge est un signalement, et reste un blocage', () => {
  assert.equal(lire(deux('1')).liens[0].relation, 'bloque');
});

test('le libellé de l arête est conservé', () => {
  assert.equal(lire(deux(undefined, 'données livrées')).liens[0].libelle, 'données livrées');
});

test('une arête touchant un nœud qui n est pas une tâche est ignorée', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'x', type: 'text', text: 'une remarque' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'x' }],
  });
  assert.deepEqual(r.liens, []);
  assert.deepEqual(r.noeuds, ['T26-001']);
});

test('une tâche présente en deux nœuds ne compte qu une fois', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-001.md' },
    ],
    edges: [],
  });
  assert.deepEqual(r.noeuds, ['T26-001']);
});

test('une arête d une tâche vers elle-même est écartée', () => {
  const r = lire({
    nodes: [
      { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md' },
      { id: 'b', type: 'file', file: '8 - Tâches/T26-001.md' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  });
  assert.deepEqual(r.liens, []);
});

test('un canvas vide ou malformé ne fait pas tomber la lecture', () => {
  assert.deepEqual(lire({}).liens, []);
  assert.deepEqual(lire(null).noeuds, []);
});
