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

/* ------------------------- propagerBlocage --------------------------- */

const N = (ref, statut) => ({ ref, statut: statut || 'à faire' });
const H = (de, vers) => ({ de, vers, type: 'hier' });
const Bk = (de, vers) => ({ de, vers, type: 'bloque' });

test('blocage direct : la cible est bloquée si le bloqueur n est pas clos', () => {
  const b = Ariane.propagerBlocage([N('A'), N('B')], [Bk('A', 'B')]);
  assert.ok(b.has('B'));
  assert.ok(!b.has('A'));
});

test('un bloqueur terminé ou abandonné ne bloque plus', () => {
  assert.ok(!Ariane.propagerBlocage([N('A', 'terminée'), N('B')], [Bk('A', 'B')]).has('B'));
  assert.ok(!Ariane.propagerBlocage([N('A', 'abandonnée'), N('B')], [Bk('A', 'B')]).has('B'));
});

test('gel descendant : le sous-arbre d une tâche à blocage direct est gelé', () => {
  const b = Ariane.propagerBlocage(
    [N('X'), N('M'), N('F1'), N('F2')],
    [Bk('X', 'M'), H('M', 'F1'), H('F1', 'F2')]);
  assert.deepEqual([...b].sort(), ['F1', 'F2', 'M']);
});

test('héritage montant : la mère est bloquée, mais pas la sœur de la fille bloquée', () => {
  const b = Ariane.propagerBlocage(
    [N('X'), N('M'), N('F'), N('S')],
    [Bk('X', 'F'), H('M', 'F'), H('M', 'S')]);
  assert.ok(b.has('F'));
  assert.ok(b.has('M'));      // héritée
  assert.ok(!b.has('S'));     // sœur non gelée : le montant ne redéclenche pas le descendant
});

test('propagerBlocage : entrées vides', () => {
  assert.equal(Ariane.propagerBlocage([], []).size, 0);
  assert.equal(Ariane.propagerBlocage(null, null).size, 0);
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
