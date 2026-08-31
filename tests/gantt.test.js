const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const t = (ref, o) => Object.assign(
  { ref, intitule: ref, parent: '', debut: '', echeance: '', statut: 'à faire',
    avancement: 0, jalon: false }, o);

test('des tâches sans parent restent au premier niveau', () => {
  const l = Ariane.disposerGantt([t('T26-001'), t('T26-002')]);
  assert.deepEqual(l.map((x) => x.niveau), [0, 0]);
});

test('un enfant suit son parent et descend d un niveau', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'), t('T26-002', { parent: '[[T26-001]]' })]);
  assert.deepEqual(l.map((x) => x.ref), ['T26-001', 'T26-002']);
  assert.deepEqual(l.map((x) => x.niveau), [0, 1]);
});

test('un parent écrit avec un alias est reconnu', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'), t('T26-002', { parent: '[[T26-001|partie 2]]' })]);
  assert.equal(l[1].niveau, 1);
});

test('la barre d une méta-tâche couvre sa descendance', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'),
    t('T26-002', { parent: 'T26-001', debut: '2026-09-05', echeance: '2026-09-20' }),
    t('T26-003', { parent: 'T26-001', debut: '2026-09-01', echeance: '2026-09-10' }),
  ]);
  const meta = l.find((x) => x.ref === 'T26-001');
  assert.equal(meta.debut, '2026-09-01');
  assert.equal(meta.echeance, '2026-09-20');
  assert.equal(meta.aDesEnfants, true);
});

test('la remontée traverse deux niveaux', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'),
    t('T26-002', { parent: 'T26-001' }),
    t('T26-003', { parent: 'T26-002', debut: '2026-09-01', echeance: '2026-09-10' }),
  ]);
  assert.equal(l.find((x) => x.ref === 'T26-001').echeance, '2026-09-10');
});

test('les dates propres de la méta-tâche sont conservées à part', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { debut: '2026-08-01', echeance: '2026-08-02' }),
    t('T26-002', { parent: 'T26-001', debut: '2026-09-01', echeance: '2026-09-10' }),
  ]);
  const meta = l.find((x) => x.ref === 'T26-001');
  assert.equal(meta.debut, '2026-08-01');
  assert.equal(meta.propre.echeance, '2026-08-02');
  assert.equal(meta.echeance, '2026-09-10');
});

test('un parent inconnu ne fait pas disparaître la tâche', () => {
  const l = Ariane.disposerGantt([t('T26-002', { parent: 'T26-999' })]);
  assert.equal(l.length, 1);
  assert.equal(l[0].niveau, 0);
});

test('un cycle de parenté ne fait pas tourner la disposition à l infini', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { parent: 'T26-002' }), t('T26-002', { parent: 'T26-001' })]);
  assert.equal(l.length, 2);
});

test('une tâche qui se dit son propre parent remonte à la racine', () => {
  const l = Ariane.disposerGantt([t('T26-001', { parent: 'T26-001' })]);
  assert.equal(l.length, 1);
  assert.equal(l[0].niveau, 0);
});

test('un jalon n a pas de début, quelle que soit la note', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { jalon: true, debut: '2026-09-01', echeance: '2026-09-30' })]);
  assert.equal(l[0].debut, '');
  assert.equal(l[0].echeance, '2026-09-30');
});

test('les racines sont triées sur la date puis sur la référence', () => {
  const l = Ariane.disposerGantt([
    t('T26-003', { debut: '2026-09-10' }),
    t('T26-002', { debut: '2026-09-01' }),
    t('T26-001'),
  ]);
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-003', 'T26-001']);
});

test('une date invalide dans la note ne se propage pas dans la frise', () => {
  const l = Ariane.disposerGantt([t('T26-001', { debut: 'bientôt', echeance: '2026-09-30' })]);
  assert.equal(l[0].debut, '');
  assert.equal(l[0].echeance, '2026-09-30');
});

test('une liste vide rend une liste vide', () => {
  assert.deepEqual(Ariane.disposerGantt([]), []);
  assert.deepEqual(Ariane.disposerGantt(null), []);
});

test('datesAscendants : la mère (puis au-dessus) s étend pour contenir la fille', () => {
  const L = [
    { ref: 'GP', parent: '', propre: { debut: '2026-09-10', echeance: '2026-09-20' } },
    { ref: 'M', parent: 'GP', propre: { debut: '2026-09-11', echeance: '2026-09-15' } },
    { ref: 'F', parent: 'M', propre: { debut: '2026-09-12', echeance: '2026-09-14' } },
  ];
  // la fille part au 2026-09-25 : M doit s étendre à ...09-25, puis GP aussi
  const r = Ariane.datesAscendants(L, 'M', { debut: '2026-09-22', echeance: '2026-09-25' });
  assert.deepEqual(r, [
    { ref: 'M', debut: '2026-09-11', echeance: '2026-09-25' },
    { ref: 'GP', debut: '2026-09-10', echeance: '2026-09-25' },
  ]);
});

test('datesAscendants : rien si la mère contient déjà la fille', () => {
  const L = [
    { ref: 'M', parent: '', propre: { debut: '2026-09-01', echeance: '2026-09-30' } },
    { ref: 'F', parent: 'M', propre: { debut: '2026-09-10', echeance: '2026-09-12' } },
  ];
  assert.deepEqual(
    Ariane.datesAscendants(L, 'M', { debut: '2026-09-14', echeance: '2026-09-16' }), []);
});

test('datesAscendants : une mère sans dates propres prend celles de la fille', () => {
  const L = [
    { ref: 'M', parent: '', propre: { debut: '', echeance: '' } },
    { ref: 'F', parent: 'M', propre: { debut: '2026-09-10', echeance: '2026-09-12' } },
  ];
  assert.deepEqual(
    Ariane.datesAscendants(L, 'M', { debut: '2026-09-10', echeance: '2026-09-12' }),
    [{ ref: 'M', debut: '2026-09-10', echeance: '2026-09-12' }]);
});

test('chaque ligne porte le parent (réf. résolue), en mode arbre comme à plat', () => {
  const t2 = { ref: 'T26-002', intitule: 'T26-002', parent: '[[T26-001|Mère]]',
    debut: '', echeance: '', statut: 'à faire', avancement: 0, jalon: false };
  const arbre = Ariane.disposerGantt([t('T26-001'), t2]);
  assert.equal(arbre.find((l) => l.ref === 'T26-002').parent, 'T26-001');
  assert.equal(arbre.find((l) => l.ref === 'T26-001').parent, '');
  const plat = Ariane.disposerGantt([t('T26-001'), t2], 'intitule', 1, true);
  assert.equal(plat.find((l) => l.ref === 'T26-002').parent, 'T26-001');
});

test('mode plat : plus de regroupement sous le parent, tout au niveau 0', () => {
  const l = Ariane.disposerGantt([
    t('T26-002', { parent: '[[T26-001]]', priorite: 'basse', debut: '2026-09-10' }),
    t('T26-001', { priorite: 'haute', debut: '2026-09-20' })],
    'priorite', 1, true);
  assert.deepEqual(l.map((x) => x.ref), ['T26-001', 'T26-002']); // tri prioritaire, pas l'arbre
  assert.deepEqual(l.map((x) => x.niveau), [0, 0]);
  assert.equal(l[0].aDesEnfants, true);   // l'info reste, pour le style de la barre
  // une méta-tâche montre SES dates, pas l'enveloppe de ses filles
  assert.equal(l[0].debut, '2026-09-20');
});

test('la famille (et la priorité) de la tâche survit à la disposition', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { famille: 'lecture', priorite: 'haute' }),
    t('T26-002', { parent: '[[T26-001]]', famille: 'production' })]);
  assert.equal(l[0].famille, 'lecture');
  assert.equal(l[0].priorite, 'haute');
  assert.equal(l[1].famille, 'production');
  // défaut sûr quand la note n'en porte pas
  assert.equal(Ariane.disposerGantt([t('T26-009')])[0].famille, '');
});

/* --------------------- tachesEnRetard -------------------------------- */

test('tachesEnRetard : échéance passée et pas terminée → en retard', () => {
  const r = Ariane.tachesEnRetard([
    t('A', { echeance: '2026-08-01' }),
    t('B', { echeance: '2026-08-01', statut: 'terminée' }),
    t('C', { echeance: '2026-08-01', statut: 'abandonnée' }),
    t('D', { echeance: '2026-12-01' }),
    t('E', {}),
  ], '2026-09-15');
  assert.deepEqual([...r].sort(), ['A']);
});

test('tachesEnRetard : une échéance au jour même n est pas en retard', () => {
  const r = Ariane.tachesEnRetard([t('A', { echeance: '2026-09-15' })], '2026-09-15');
  assert.equal(r.size, 0);
});

test('tachesEnRetard : sans date de référence, ensemble vide', () => {
  assert.equal(Ariane.tachesEnRetard([t('A', { echeance: '2026-08-01' })], '').size, 0);
});
