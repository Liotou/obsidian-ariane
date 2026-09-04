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
  const { bloquee: b } = Ariane.propagerBlocage([N('A'), N('B')], [Bk('A', 'B')]);
  assert.ok(b.has('B'));
  assert.ok(!b.has('A'));
});

test('un bloqueur terminé ou abandonné ne bloque plus', () => {
  assert.ok(!Ariane.propagerBlocage([N('A', 'terminée'), N('B')], [Bk('A', 'B')]).bloquee.has('B'));
  assert.ok(!Ariane.propagerBlocage([N('A', 'abandonnée'), N('B')], [Bk('A', 'B')]).bloquee.has('B'));
});

test('gel descendant : le sous-arbre d une tâche à blocage direct est gelé', () => {
  const { bloquee: b } = Ariane.propagerBlocage(
    [N('X'), N('M'), N('F1'), N('F2')],
    [Bk('X', 'M'), H('M', 'F1'), H('F1', 'F2')]);
  assert.deepEqual([...b].sort(), ['F1', 'F2', 'M']);
});

test('impactée : les ascendants d une bloquée sont impactés, pas bloqués', () => {
  const r = Ariane.propagerBlocage(
    [N('X'), N('M'), N('F'), N('S')],
    [Bk('X', 'F'), H('M', 'F'), H('M', 'S')]);
  assert.ok(r.bloquee.has('F'));
  assert.ok(r.impactee.has('M'));   // remontée d information vers la mère
  assert.ok(!r.bloquee.has('M'));   // la mère n est pas gelée
  assert.ok(!r.impactee.has('S'));  // la sœur ne reçoit rien
  assert.ok(!r.bloquee.has('S'));
});

test('impactée : transitive jusqu à la racine, disjointe de bloquée', () => {
  const r = Ariane.propagerBlocage(
    [N('X'), N('G'), N('M'), N('F'), N('S')],
    [Bk('X', 'F'), H('M', 'F'), H('G', 'M'), H('G', 'S')]);
  assert.deepEqual([...r.impactee].sort(), ['G', 'M']);
  for (const ref of r.impactee) assert.ok(!r.bloquee.has(ref));
});

test('impactée : un bloqueur clos ne laisse ni bloquée ni impactée', () => {
  const r = Ariane.propagerBlocage(
    [N('A', 'terminée'), N('M'), N('F')],
    [Bk('A', 'F'), H('M', 'F')]);
  assert.equal(r.bloquee.size, 0);
  assert.equal(r.impactee.size, 0);
});

test('propagerBlocage : entrées vides', () => {
  assert.equal(Ariane.propagerBlocage([], []).bloquee.size, 0);
  assert.equal(Ariane.propagerBlocage([], []).impactee.size, 0);
  assert.equal(Ariane.propagerBlocage(null, null).bloquee.size, 0);
});

/* ------------------------ avancementsDerives ------------------------- */

const T = (o) => Object.assign(
  { parent: '', statut: 'à faire', avancement: 0, debut: '', echeance: '' }, o);

test('feuille : avancement propre ; terminée = 100 ; abandonnée = 0', () => {
  const m = Ariane.avancementsDerives([
    T({ ref: 'A', avancement: 42 }),
    T({ ref: 'B', statut: 'terminée', avancement: 10 }),
    T({ ref: 'C', statut: 'abandonnée', avancement: 90 }),
  ]);
  assert.equal(m.get('A'), 42);
  assert.equal(m.get('B'), 100);
  assert.equal(m.get('C'), 0);
});

test('mère : moyenne des filles pondérée par la durée', () => {
  const m = Ariane.avancementsDerives([
    T({ ref: 'M' }),
    // 2 jours, 100 %  +  8 jours, 0 %  ->  (2*100 + 8*0) / 10 = 20
    T({ ref: 'F1', parent: '[[M]]', avancement: 100, debut: '2026-09-01', echeance: '2026-09-02' }),
    T({ ref: 'F2', parent: '[[M]]', avancement: 0, debut: '2026-09-03', echeance: '2026-09-10' }),
  ]);
  assert.equal(m.get('M'), 20);
});

test('mère : filles non datées -> moyenne simple ; fille abandonnée exclue', () => {
  const m = Ariane.avancementsDerives([
    T({ ref: 'M' }),
    T({ ref: 'F1', parent: '[[M]]', avancement: 30 }),
    T({ ref: 'F2', parent: '[[M]]', avancement: 70 }),
    T({ ref: 'F3', parent: '[[M]]', statut: 'abandonnée', avancement: 0 }),
  ]);
  assert.equal(m.get('M'), 50);
});

test('avancement dérivé récursif : grand-mère agrège des mères', () => {
  const m = Ariane.avancementsDerives([
    T({ ref: 'GM' }),
    T({ ref: 'M1', parent: '[[GM]]', debut: '2026-09-01', echeance: '2026-09-10' }),
    T({ ref: 'M2', parent: '[[GM]]', debut: '2026-09-01', echeance: '2026-09-10' }),
    T({ ref: 'a', parent: '[[M1]]', statut: 'terminée' }),
    T({ ref: 'b', parent: '[[M1]]', avancement: 0 }),   // M1 -> 50
    T({ ref: 'c', parent: '[[M2]]', avancement: 0 }),   // M2 -> 0
  ]);
  assert.equal(m.get('M1'), 50);
  assert.equal(m.get('M2'), 0);
  assert.equal(m.get('GM'), 25);   // durées M1 = M2 -> moyenne simple de 50 et 0
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
