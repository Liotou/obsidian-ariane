const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const t = (ref, o) => Object.assign(
  { ref, intitule: ref, parent: '', debut: '', echeance: '', statut: 'à faire',
    priorite: '', avancement: 0, jalon: false, ordre: null }, o);

/* ------------------------------- Le tri -------------------------------- */

test('par défaut les racines se rangent par date', () => {
  const l = Ariane.disposerGantt([
    t('T26-003', { debut: '2026-09-10' }), t('T26-002', { debut: '2026-09-01' })]);
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-003']);
});

test('le tri manuel suit le champ ordre', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { debut: '2026-09-01', ordre: 2 }),
    t('T26-002', { debut: '2026-09-10', ordre: 1 }),
  ], 'manuel');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('en tri manuel une tâche sans ordre passe après celles qui en ont', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'), t('T26-002', { ordre: 5 })], 'manuel');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('le tri par priorité met la haute en tête', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { priorite: 'basse' }),
    t('T26-002', { priorite: 'haute' }),
    t('T26-003', { priorite: 'moyenne' }),
  ], 'priorite');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-003', 'T26-001']);
});

test('une priorité absente vient après les trois autres', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'), t('T26-002', { priorite: 'basse' })], 'priorite');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('le tri par intitulé ignore la casse et les accents', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { intitule: 'Zoologie' }),
    t('T26-002', { intitule: 'état de l art' }),
    t('T26-003', { intitule: 'Analyse' }),
  ], 'intitule');
  assert.deepEqual(l.map((x) => x.intitule), ['Analyse', 'état de l art', 'Zoologie']);
});

test('le tri s applique aussi entre frères, pas seulement aux racines', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'),
    t('T26-002', { parent: 'T26-001', ordre: 2 }),
    t('T26-003', { parent: 'T26-001', ordre: 1 }),
  ], 'manuel');
  assert.deepEqual(l.map((x) => x.ref), ['T26-001', 'T26-003', 'T26-002']);
});

/* ----------------------------- Les filtres ----------------------------- */

const jeu = [
  t('T26-001', { intitule: 'Rédiger l état de l art', statut: 'en cours', priorite: 'haute' }),
  t('T26-002', { intitule: 'Partie gouvernance', parent: 'T26-001', statut: 'à faire' }),
  t('T26-003', { intitule: 'Envoyer le rapport', statut: 'terminée', priorite: 'basse' }),
];

test('sans filtre tout passe', () => {
  assert.equal(Ariane.filtrerTaches(jeu, {}).length, 3);
});

test('le filtre de statut ne garde que le statut demandé, et les ancêtres', () => {
  const r = Ariane.filtrerTaches(jeu, { statut: 'à faire' }).map((x) => x.ref);
  assert.ok(r.includes('T26-002'));
  assert.ok(r.includes('T26-001'), 'le parent doit rester pour le contexte');
  assert.ok(!r.includes('T26-003'));
});

test('le filtre de priorité fonctionne', () => {
  assert.deepEqual(Ariane.filtrerTaches(jeu, { priorite: 'haute' }).map((x) => x.ref), ['T26-001']);
});

test('la recherche mord sur l intitulé sans égard aux accents', () => {
  const r = Ariane.filtrerTaches(jeu, { texte: 'etat' }).map((x) => x.ref);
  assert.deepEqual(r, ['T26-001']);
});

test('la recherche mord aussi sur la référence', () => {
  assert.deepEqual(Ariane.filtrerTaches(jeu, { texte: 'T26-003' }).map((x) => x.ref), ['T26-003']);
});

test('deux critères se combinent', () => {
  assert.deepEqual(
    Ariane.filtrerTaches(jeu, { statut: 'terminée', priorite: 'basse' }).map((x) => x.ref),
    ['T26-003']);
});

test('un filtre qui ne trouve rien rend une liste vide', () => {
  assert.deepEqual(Ariane.filtrerTaches(jeu, { texte: 'introuvable' }), []);
});
