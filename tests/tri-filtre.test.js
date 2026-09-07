const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const t = (ref, o) => Object.assign(
  { ref, intitule: ref, parent: '', debut: '', echeance: '', statut: 'à faire',
    priorite: '', avancement: 0, jalon: false }, o);

/* ------------------------------- Le tri -------------------------------- */

test('par défaut les racines se rangent par date', () => {
  const l = Ariane.disposerGantt([
    t('T26-003', { debut: '2026-09-10' }), t('T26-002', { debut: '2026-09-01' })]);
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-003']);
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
    t('T26-002', { parent: 'T26-001', intitule: 'Bravo' }),
    t('T26-003', { parent: 'T26-001', intitule: 'Alpha' }),
  ], 'intitule');
  assert.deepEqual(l.map((x) => x.ref), ['T26-001', 'T26-003', 'T26-002']);
});

test('le tri par clé range sur la valeur préparée par la vue', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _cle: 'zèbre' }),
    Object.assign(t('T26-002'), { _cle: 'abeille' }),
  ], 'cle');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('le sens du tri par clé s inverse', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _cle: 'zèbre' }),
    Object.assign(t('T26-002'), { _cle: 'abeille' }),
  ], 'cle', -1);
  assert.deepEqual(l.map((x) => x.ref), ['T26-001', 'T26-002']);
});

test('le tri par clé compare les nombres comme des nombres', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _cle: '10' }),
    Object.assign(t('T26-002'), { _cle: '9' }),
  ], 'cle');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('une clé vide passe après celles qui sont remplies', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _cle: '' }),
    Object.assign(t('T26-002'), { _cle: 'a' }),
  ], 'cle');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

/* --------- Le tri natif de la base : multi-critères (_multi) ---------- */

test('le tri multi range sur le premier critère', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _multi: [{ v: 'b', s: 1 }] }),
    Object.assign(t('T26-002'), { _multi: [{ v: 'a', s: 1 }] }),
  ], 'multi');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('le tri multi départage par le second critère à égalité du premier', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _multi: [{ v: 'a', s: 1 }, { v: '2', s: 1 }] }),
    Object.assign(t('T26-002'), { _multi: [{ v: 'a', s: 1 }, { v: '1', s: 1 }] }),
  ], 'multi');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('le sens descendant d un critère inverse ce critère', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _multi: [{ v: 'a', s: -1 }] }),
    Object.assign(t('T26-002'), { _multi: [{ v: 'b', s: -1 }] }),
  ], 'multi');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('le tri multi compare les nombres comme des nombres', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _multi: [{ v: 10, s: 1 }] }),
    Object.assign(t('T26-002'), { _multi: [{ v: 9, s: 1 }] }),
  ], 'multi');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});

test('une valeur vide passe après, quel que soit le sens', () => {
  const l = Ariane.disposerGantt([
    Object.assign(t('T26-001'), { _multi: [{ v: '', s: -1 }] }),
    Object.assign(t('T26-002'), { _multi: [{ v: 'z', s: -1 }] }),
  ], 'multi');
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-001']);
});
