const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const l = (de, vers, relation, libelle) => ({ de, vers, relation, libelle: libelle || '' });

test('un blocage devient une entrée de bloque-par sur la tâche bloquée', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'bloque')] }]);
  assert.deepEqual(u.get('T26-002').bloquePar, ['[[T26-001]]']);
  assert.equal(u.get('T26-001').bloquePar.length, 0);
});

test('une composition devient le parent de l enfant', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'compose')] }]);
  assert.equal(u.get('T26-002').parent, '[[T26-001]]');
});

test('le libellé passe en alias du lien', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'bloque', 'données livrées')] }]);
  assert.deepEqual(u.get('T26-002').bloquePar, ['[[T26-001|données livrées]]']);
});

test('deux canvas qui portent la même arête ne la comptent qu une fois', () => {
  const u = Ariane.unionLiens([
    { liens: [l('T26-001', 'T26-002', 'bloque')] },
    { liens: [l('T26-001', 'T26-002', 'bloque')] },
  ]);
  assert.deepEqual(u.get('T26-002').bloquePar, ['[[T26-001]]']);
});

test('un libellé posé dans un canvas survit à une arête nue dans un autre', () => {
  const u = Ariane.unionLiens([
    { liens: [l('T26-001', 'T26-002', 'bloque', 'données livrées')] },
    { liens: [l('T26-001', 'T26-002', 'bloque')] },
  ]);
  assert.deepEqual(u.get('T26-002').bloquePar, ['[[T26-001|données livrées]]']);
});

test('les arêtes de canvas différents s additionnent', () => {
  const u = Ariane.unionLiens([
    { liens: [l('T26-001', 'T26-003', 'bloque')] },
    { liens: [l('T26-002', 'T26-003', 'bloque')] },
  ]);
  assert.deepEqual(u.get('T26-003').bloquePar, ['[[T26-001]]', '[[T26-002]]']);
});

test('deux parents concurrents sont signalés, et le tri décide', () => {
  const u = Ariane.unionLiens([
    { liens: [l('T26-009', 'T26-003', 'compose')] },
    { liens: [l('T26-002', 'T26-003', 'compose')] },
  ]);
  assert.equal(u.get('T26-003').parent, '[[T26-002]]');
  assert.deepEqual(u.get('T26-003').conflits, ['T26-002', 'T26-009']);
});

test('l ordre de lecture des canvas ne change pas le résultat', () => {
  const a = Ariane.unionLiens([
    { liens: [l('T26-009', 'T26-003', 'compose')] },
    { liens: [l('T26-002', 'T26-003', 'compose')] },
  ]).get('T26-003').parent;
  const b = Ariane.unionLiens([
    { liens: [l('T26-002', 'T26-003', 'compose')] },
    { liens: [l('T26-009', 'T26-003', 'compose')] },
  ]).get('T26-003').parent;
  assert.equal(a, b);
});

test('sans conflit la liste des conflits est vide', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'compose')] }]);
  assert.deepEqual(u.get('T26-002').conflits, []);
});

test('une tâche qui ne fait que bloquer figure tout de même dans la table', () => {
  const u = Ariane.unionLiens([{ liens: [l('T26-001', 'T26-002', 'bloque')] }]);
  assert.ok(u.has('T26-001'));
  assert.equal(u.get('T26-001').parent, '');
});
