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

/* --------------------- disposerArticulation ------------------------ */

const nn = (ref, ech) => ({ ref, echeance: ech || '' });
const ee = (de, vers, type) => ({ de, vers, type: type || 'hier' });
const chevauchent = (a, b, h) => a.x === b.x && Math.abs(a.y - b.y) < (h || 58);

test('disposerArticulation : une chaîne s étage par rang, alignée', () => {
  const p = Ariane.disposerArticulation(
    [nn('A'), nn('B'), nn('C'), nn('D')],
    [ee('A', 'B'), ee('B', 'C'), ee('C', 'D')], { dx: 300, gapY: 36 });
  assert.deepEqual(['A', 'B', 'C', 'D'].map((r) => p.get(r).x), [0, 300, 600, 900]);
  const ys = ['A', 'B', 'C', 'D'].map((r) => p.get(r).y);
  assert.ok(ys.every((y) => y === ys[0]), 'un seul nœud par rang → chaîne droite');
});

test('disposerArticulation : un éventail ne se chevauche pas et centre le parent', () => {
  const p = Ariane.disposerArticulation(
    [nn('P'), nn('X'), nn('Y'), nn('Z')],
    [ee('P', 'X'), ee('P', 'Y'), ee('P', 'Z')], { dx: 300, gapY: 36 });
  assert.equal(p.get('X').x, 300);
  assert.equal(p.get('Y').x, 300);
  assert.equal(p.get('Z').x, 300);
  const ys = ['X', 'Y', 'Z'].map((r) => p.get(r).y).sort((a, b) => a - b);
  assert.ok(ys[1] - ys[0] >= 58 + 36 && ys[2] - ys[1] >= 58 + 36, 'enfants séparés');
  assert.ok(p.get('P').y > ys[0] && p.get('P').y < ys[2], 'parent entre ses enfants');
});

test('disposerArticulation : deux parents croisés sont remis en ordre', () => {
  // P1 pointe C2, P2 pointe C1 : l ordre initial (par ref) croise ; la
  // réduction doit aligner C sur l ordre de P.
  const p = Ariane.disposerArticulation(
    [nn('P1'), nn('P2'), nn('C1'), nn('C2')],
    [ee('P1', 'C2'), ee('P2', 'C1')], { dx: 300, gapY: 36 });
  const hautP1 = p.get('P1').y < p.get('P2').y;
  const hautC2 = p.get('C2').y < p.get('C1').y;
  assert.equal(hautP1, hautC2, 'C2 (enfant de P1) du même côté que P1');
});

test('disposerArticulation : composantes séparées empilées, sans recouvrement', () => {
  const p = Ariane.disposerArticulation(
    [nn('A'), nn('B'), nn('M'), nn('N')],
    [ee('A', 'B'), ee('M', 'N')], { dx: 300, gapY: 36 });
  const bas1 = Math.max(p.get('A').y, p.get('B').y) + 58;
  assert.ok(Math.min(p.get('M').y, p.get('N').y) >= bas1, '2e composante sous la 1re');
});

test('disposerArticulation : aucune carte n en chevauche une autre', () => {
  const noeuds = 'ABCDEFGH'.split('').map((r) => nn(r));
  const aretes = [ee('A', 'B'), ee('A', 'C'), ee('B', 'D'), ee('C', 'D'),
    ee('A', 'E'), ee('E', 'F'), ee('D', 'F'), ee('C', 'G'), ee('G', 'H'), ee('B', 'H')];
  const p = Ariane.disposerArticulation(noeuds, aretes, { dx: 300, gapY: 36 });
  const refs = [...p.keys()];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      assert.ok(!chevauchent(p.get(refs[i]), p.get(refs[j]), 58 + 36),
        refs[i] + ' et ' + refs[j] + ' se chevauchent');
    }
  }
});

test('disposerArticulation : un cycle ne boucle pas', () => {
  const p = Ariane.disposerArticulation(
    [nn('A'), nn('B'), nn('C')],
    [ee('A', 'B'), ee('B', 'C'), ee('C', 'A')], {});
  assert.equal(p.size, 3);
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
