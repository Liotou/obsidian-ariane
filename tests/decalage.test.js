const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const lignes = [
  { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
  { ref: 'B', niveau: 1, propre: { debut: '2026-09-02', echeance: '2026-09-06' } },
  { ref: 'C', niveau: 1, propre: { debut: '', echeance: '' } },
  { ref: 'D', niveau: 0, propre: { debut: '2026-10-01', echeance: '2026-10-05' } },
];

test('décaler une méta-tâche emporte son sous-arbre', () => {
  const r = Ariane.decalerSousArbre(lignes, 'A', 3);
  assert.deepEqual(r.map((x) => x.ref).sort(), ['A', 'B']);
  assert.equal(r.find((x) => x.ref === 'A').debut, '2026-09-04');
  assert.equal(r.find((x) => x.ref === 'B').echeance, '2026-09-09');
});

test('une tâche du sous-arbre sans dates n est pas planifiée par ricochet', () => {
  assert.ok(!Ariane.decalerSousArbre(lignes, 'A', 3).some((x) => x.ref === 'C'));
});

test('décaler une feuille ne touche qu elle', () => {
  assert.deepEqual(Ariane.decalerSousArbre(lignes, 'B', 1).map((x) => x.ref), ['B']);
});

test('une tâche voisine de même niveau n est pas emportée', () => {
  assert.ok(!Ariane.decalerSousArbre(lignes, 'A', 3).some((x) => x.ref === 'D'));
});

test('décaler de zéro ne rend rien à écrire', () => {
  assert.deepEqual(Ariane.decalerSousArbre(lignes, 'A', 0), []);
});

test('décaler une tâche inconnue ne rend rien', () => {
  assert.deepEqual(Ariane.decalerSousArbre(lignes, 'Z', 3), []);
});

test('la cascade suit les blocages, transitivement', () => {
  const l = [
    { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
    { ref: 'B', niveau: 0, propre: { debut: '2026-09-11', echeance: '2026-09-20' } },
    { ref: 'C', niveau: 0, propre: { debut: '2026-09-21', echeance: '2026-09-30' } },
  ];
  const r = Ariane.cascadeAval(l, [{ de: 'A', vers: 'B' }, { de: 'B', vers: 'C' }], 'A', 5);
  assert.deepEqual(r.map((x) => x.ref).sort(), ['A', 'B', 'C']);
  assert.equal(r.find((x) => x.ref === 'C').debut, '2026-09-26');
});

test('la cascade ne boucle pas sur un cycle de blocage', () => {
  const l = [
    { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
    { ref: 'B', niveau: 0, propre: { debut: '2026-09-11', echeance: '2026-09-20' } },
  ];
  const r = Ariane.cascadeAval(l, [{ de: 'A', vers: 'B' }, { de: 'B', vers: 'A' }], 'A', 5);
  assert.equal(r.length, 2);
});

test('une branche aval déjà à l écart n est pas oubliée pour autant', () => {
  const l = [
    { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
    { ref: 'B', niveau: 0, propre: { debut: '2027-01-01', echeance: '2027-01-05' } },
  ];
  const r = Ariane.cascadeAval(l, [{ de: 'A', vers: 'B' }], 'A', 5);
  assert.equal(r.find((x) => x.ref === 'B').debut, '2027-01-06');
});

test('la cascade emporte aussi la descendance de ce qu elle décale', () => {
  const l = [
    { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
    { ref: 'B', niveau: 0, propre: { debut: '2026-09-11', echeance: '2026-09-20' } },
    { ref: 'B1', niveau: 1, propre: { debut: '2026-09-12', echeance: '2026-09-15' } },
  ];
  const r = Ariane.cascadeAval(l, [{ de: 'A', vers: 'B' }], 'A', 5);
  assert.equal(r.find((x) => x.ref === 'B1').debut, '2026-09-17');
});
