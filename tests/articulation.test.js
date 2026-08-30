const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const t = (ref, o) => Object.assign(
  { ref, intitule: ref, statut: 'à faire', avancement: 0, jalon: false,
    echeance: '', parent: '', bloquePar: [], famille: 'action', x: null, y: null }, o);

/* --------------------- grapheArticulation ---------------------------- */

test('les nœuds reprennent les champs de la tâche', () => {
  const g = Ariane.grapheArticulation([t('T26-001', { intitule: 'A', statut: 'en cours', famille: 'lecture' })]);
  assert.equal(g.noeuds.length, 1);
  assert.deepEqual(
    { ref: g.noeuds[0].ref, intitule: g.noeuds[0].intitule, statut: g.noeuds[0].statut, famille: g.noeuds[0].famille },
    { ref: 'T26-001', intitule: 'A', statut: 'en cours', famille: 'lecture' });
});

test('un parent connu donne une arête hiérarchie parent -> enfant', () => {
  const g = Ariane.grapheArticulation([
    t('T26-001'), t('T26-002', { parent: '[[T26-001]]' })]);
  assert.deepEqual(g.aretes, [{ de: 'T26-001', vers: 'T26-002', type: 'hier', libelle: '' }]);
});

test('bloque-par donne une arête blocage, alias -> libellé', () => {
  const g = Ariane.grapheArticulation([
    t('T26-001'), t('T26-002', { bloquePar: ['[[T26-001|amont]]'] })]);
  assert.deepEqual(g.aretes, [{ de: 'T26-001', vers: 'T26-002', type: 'bloque', libelle: 'amont' }]);
});

test('une arête vers une tâche absente du jeu est ignorée', () => {
  const g = Ariane.grapheArticulation([t('T26-002', { parent: '[[T26-999]]', bloquePar: ['[[T26-998]]'] })]);
  assert.deepEqual(g.aretes, []);
});

test('un lien vers soi-même est ignoré', () => {
  const g = Ariane.grapheArticulation([t('T26-001', { bloquePar: ['[[T26-001]]'] })]);
  assert.deepEqual(g.aretes, []);
});

/* ------------------------- placerGraphe ----------------------------- */

const N = (ref, o) => Object.assign({ ref, echeance: '', x: null, y: null }, o);

test('sans arête, tous les nœuds sur une colonne', () => {
  const pos = Ariane.placerGraphe([N('A'), N('B'), N('C')], [], { dx: 200, dy: 100 });
  assert.deepEqual([...pos.values()].map((p) => p.x), [0, 0, 0]);
  assert.deepEqual([...pos.values()].map((p) => p.y), [0, 100, 200]);
});

test('une chaîne A->B->C occupe trois rangs', () => {
  const pos = Ariane.placerGraphe(
    [N('A'), N('B'), N('C')],
    [{ de: 'A', vers: 'B', type: 'bloque' }, { de: 'B', vers: 'C', type: 'bloque' }],
    { dx: 200, dy: 100 });
  assert.equal(pos.get('A').x, 0);
  assert.equal(pos.get('B').x, 200);
  assert.equal(pos.get('C').x, 400);
});

test('un nœud avec x/y fixés n est pas déplacé', () => {
  const pos = Ariane.placerGraphe(
    [N('A', { x: 42, y: 7 }), N('B')],
    [{ de: 'A', vers: 'B', type: 'hier' }], { dx: 200, dy: 100 });
  assert.deepEqual(pos.get('A'), { x: 42, y: 7 });
});

test('deux nœuds du même rang ne se superposent pas', () => {
  const pos = Ariane.placerGraphe([N('A'), N('B')], [], { dx: 200, dy: 100 });
  assert.notEqual(pos.get('A').y, pos.get('B').y);
});

test('un cycle ne fait pas boucler placerGraphe', () => {
  const pos = Ariane.placerGraphe(
    [N('A'), N('B')],
    [{ de: 'A', vers: 'B', type: 'bloque' }, { de: 'B', vers: 'A', type: 'bloque' }],
    { dx: 200, dy: 100 });
  assert.equal(pos.size, 2);
});

/* -------------------------- lienValide ------------------------------ */

const D = (obj) => new Map(Object.entries(obj));

test('un lien qui referme un cycle est refusé', () => {
  const aretes = [{ de: 'A', vers: 'B', type: 'bloque' }, { de: 'B', vers: 'C', type: 'bloque' }];
  const r = Ariane.lienValide(aretes, D({}), { de: 'C', vers: 'A', type: 'bloque' });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'cycle');
});

test('un blocage dont l amont finit après le début de l aval est refusé', () => {
  const r = Ariane.lienValide([], D({
    A: { debut: '2026-09-01', echeance: '2026-09-20' },
    B: { debut: '2026-09-10', echeance: '2026-09-30' },
  }), { de: 'A', vers: 'B', type: 'bloque' });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'dates');
});

test('une hiérarchie dont la mère finit avant la fille est refusée', () => {
  const r = Ariane.lienValide([], D({
    M: { debut: '', echeance: '2026-09-10' },
    F: { debut: '', echeance: '2026-09-25' },
  }), { de: 'M', vers: 'F', type: 'hier' });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'dates-hier');
});

test('des dates absentes d un côté n empêchent pas le lien', () => {
  const r = Ariane.lienValide([], D({ A: { debut: '', echeance: '' }, B: { debut: '2026-09-10', echeance: '' } }),
    { de: 'A', vers: 'B', type: 'bloque' });
  assert.equal(r.ok, true);
});

test('un lien sain est autorisé', () => {
  const r = Ariane.lienValide(
    [{ de: 'A', vers: 'B', type: 'bloque' }],
    D({ A: { debut: '2026-09-01', echeance: '2026-09-10' }, C: { debut: '2026-09-15', echeance: '2026-09-20' } }),
    { de: 'A', vers: 'C', type: 'bloque' });
  assert.equal(r.ok, true);
});
