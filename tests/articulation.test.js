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

test('placerGraphe : opts.ordre impose l ordre des nœuds d un rang, les placés ne bougent pas', () => {
  const pos = Ariane.placerGraphe(
    [N('B', { x: 999, y: 999 }), N('A'), N('C')],
    [],
    { dx: 200, dy: 100, ordre: ['C', 'A', 'B'] });
  assert.deepEqual(pos.get('B'), { x: 999, y: 999 });   // placé : intact
  assert.ok(pos.get('C').y < pos.get('A').y);            // ordre imposé : C avant A
});

test('placerGraphe : sans opts.ordre, tri par échéance puis ref inchangé', () => {
  const pos = Ariane.placerGraphe(
    [N('A', { echeance: '2026-03-02' }), N('B', { echeance: '2026-01-01' })],
    [], { dx: 200, dy: 100 });
  assert.ok(pos.get('B').y < pos.get('A').y);            // B échoit avant A
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

test('placerGraphe : hauteur variable espace les nœuds d un même rang', () => {
  const pos = Ariane.placerGraphe([N('A'), N('B')], [],
    { dx: 200, dy: 100, hauteur: (r) => (r === 'A' ? 200 : 60) });
  assert.ok(pos.get('B').y - pos.get('A').y >= 200);
});

/* -------------------------- lienValide ------------------------------ */

const D = (obj) => new Map(Object.entries(obj));

test('un lien qui referme un cycle est refusé', () => {
  const aretes = [{ de: 'A', vers: 'B', type: 'bloque' }, { de: 'B', vers: 'C', type: 'bloque' }];
  const r = Ariane.lienValide(aretes, D({}), { de: 'C', vers: 'A', type: 'bloque' });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'cycle');
});

test('cycle du graphe FUSIONNÉ : une mère bloquée par sa propre fille est refusée', () => {
  // M est mère de F (arête hier M->F) ; on tente « F bloque M » (arête F->M).
  const r = Ariane.lienValide(
    [{ de: 'M', vers: 'F', type: 'hier' }], D({}),
    { de: 'F', vers: 'M', type: 'bloque' });
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

test('rectSelection : touche = chevauchement, pas seulement inclusion', () => {
  const B = [
    { ref: 'A', x: 0, y: 0, w: 100, h: 50 },
    { ref: 'B', x: 200, y: 0, w: 100, h: 50 },
    { ref: 'C', x: 0, y: 200, w: 100, h: 50 },
  ];
  // rectangle qui englobe A et effleure B
  assert.deepEqual(
    Ariane.rectSelection(B, { x: -10, y: -10, w: 230, h: 80 }).sort(),
    ['A', 'B']);
  // entièrement dans A
  assert.deepEqual(Ariane.rectSelection(B, { x: 10, y: 10, w: 20, h: 20 }), ['A']);
  // ne touche personne
  assert.deepEqual(Ariane.rectSelection(B, { x: 500, y: 500, w: 10, h: 10 }), []);
  // le bord qui affleure ne compte pas (contact strict)
  assert.deepEqual(Ariane.rectSelection(B, { x: 100, y: 0, w: 50, h: 50 }), []);
  // rectangle nul, entrées vides
  assert.deepEqual(Ariane.rectSelection([], { x: 0, y: 0, w: 10, h: 10 }), []);
  assert.deepEqual(Ariane.rectSelection(B, {}), []);
});
