const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const t = (ref, o) => Object.assign(
  { ref, intitule: ref, parent: '', debut: '', echeance: '', statut: 'à faire',
    priorite: '', avancement: 0, jalon: false }, o);

const S = Ariane.SANS_GROUPE;
const kinds = (l) => l.map((x) => x.kind);
const refs = (l) => l.filter((x) => x.kind === 'tache').map((x) => x.ref);

/* --------------------- disposerFriseGroupee --------------------------- */

test('sans groupes, sortie identique à disposerGantt (plus kind/cleLigne)', () => {
  const taches = [t('T26-002', { debut: '2026-09-05' }),
                  t('T26-001', { debut: '2026-09-01' })];
  const a = Ariane.disposerFriseGroupee(taches, null, 'date', 1);
  const b = Ariane.disposerGantt(taches, 'date', 1);
  assert.deepEqual(a.map((x) => x.ref), b.map((x) => x.ref));
  assert.ok(a.every((x) => x.kind === 'tache' && x.cleLigne === x.ref));
});

test('deux familles → un en-tête chacune, suivi de son arbre', () => {
  const g = new Map([['T26-001', ['Rédaction']], ['T26-002', ['Terrain']]]);
  const l = Ariane.disposerFriseGroupee(
    [t('T26-001'), t('T26-002')], g, 'date', 1);
  assert.deepEqual(kinds(l), ['groupe', 'tache', 'groupe', 'tache']);
  assert.deepEqual(l[0].libelle, 'Rédaction');
  assert.deepEqual(l[2].libelle, 'Terrain');
  assert.deepEqual(refs(l), ['T26-001', 'T26-002']);
});

test('une tâche sans valeur va dans le groupe « sans », placé en dernier', () => {
  const g = new Map([['T26-001', ['Terrain']], ['T26-002', [S]]]);
  const l = Ariane.disposerFriseGroupee(
    [t('T26-001'), t('T26-002')], g, 'date', 1);
  assert.deepEqual(l.map((x) => x.libelle).filter(Boolean), ['Terrain', S]);
});

test('les groupes sont classés alphabétiquement, « sans » toujours en dernier', () => {
  const g = new Map([
    ['T26-001', ['Zoologie']], ['T26-002', ['Analyse']], ['T26-003', [S]]]);
  const l = Ariane.disposerFriseGroupee(
    [t('T26-001'), t('T26-002'), t('T26-003')], g, 'date', 1);
  assert.deepEqual(l.filter((x) => x.kind === 'groupe').map((x) => x.libelle),
    ['Analyse', 'Zoologie', S]);
});

test('la direction descendante inverse l ordre des groupes, « sans » reste en dernier', () => {
  const g = new Map([
    ['T26-001', ['Zoologie']], ['T26-002', ['Analyse']], ['T26-003', [S]]]);
  const l = Ariane.disposerFriseGroupee(
    [t('T26-001'), t('T26-002'), t('T26-003')], g, 'date', 1, true);
  assert.deepEqual(l.filter((x) => x.kind === 'groupe').map((x) => x.libelle),
    ['Zoologie', 'Analyse', S]);
});

test('une tâche multi-valeur apparaît dans chaque groupe, cleLigne distinctes', () => {
  const g = new Map([['T26-001', ['A', 'B']]]);
  const l = Ariane.disposerFriseGroupee([t('T26-001')], g, 'date', 1);
  assert.deepEqual(kinds(l), ['groupe', 'tache', 'groupe', 'tache']);
  const cles = l.filter((x) => x.kind === 'tache').map((x) => x.cleLigne);
  assert.equal(cles.length, 2);
  assert.notEqual(cles[0], cles[1]);
  assert.ok(cles.every((c) => c.endsWith('T26-001')));
});

test('un parent hors du groupe devient racine dans le groupe de l enfant', () => {
  const g = new Map([['T26-001', ['A']], ['T26-002', ['B']]]);
  const l = Ariane.disposerFriseGroupee([
    t('T26-001'), t('T26-002', { parent: 'T26-001' })], g, 'date', 1);
  // groupe B ne contient que T26-002, au niveau 0
  const b = l.slice(l.findIndex((x) => x.libelle === 'B') + 1);
  assert.equal(b[0].ref, 'T26-002');
  assert.equal(b[0].niveau, 0);
});

test('le tri s applique à l intérieur de chaque groupe', () => {
  const g = new Map([
    ['T26-001', ['A']], ['T26-002', ['A']]]);
  const l = Ariane.disposerFriseGroupee([
    t('T26-001', { intitule: 'Bravo' }),
    t('T26-002', { intitule: 'Alpha' })], g, 'intitule', 1);
  assert.deepEqual(refs(l), ['T26-002', 'T26-001']);
});

/* ------------------------- placerLignes ------------------------------ */

const gr = (libelle) => ({ kind: 'groupe', libelle, cleGroupe: 'groupe:' + libelle });
const ta = (ref, niveau, o) => Object.assign(
  { kind: 'tache', ref, cleLigne: ref, niveau: niveau || 0, aDesEnfants: false }, o);

test('en-têtes à hEntete, lignes à hLigne, y cumulés', () => {
  const d = [gr('A'), ta('T1'), ta('T2'), gr('B'), ta('T3')];
  const r = Ariane.placerLignes(d, 30, 50, new Set());
  assert.deepEqual(r.lignes.map((x) => x.y), [30, 60, 110, 160, 190]);
  assert.deepEqual(r.lignes.map((x) => x.h), [30, 50, 50, 30, 50]);
  assert.equal(r.hauteurTotale, 240);
});

test('un groupe replié masque ses tâches mais garde sa bande', () => {
  const d = [gr('A'), ta('T1'), ta('T2'), gr('B'), ta('T3')];
  const r = Ariane.placerLignes(d, 30, 50, new Set(['groupe:A']));
  assert.deepEqual(r.lignes.map((x) => x.cleLigne || x.cleGroupe),
    ['groupe:A', 'groupe:B', 'T3']);
  assert.deepEqual(r.lignes.map((x) => x.y), [30, 60, 90]);
  assert.equal(r.hauteurTotale, 140);
});

test('une méta-tâche repliée masque sa descendance, à l intérieur du groupe', () => {
  const d = [gr('A'), ta('P', 0, { ref: 'P', cleLigne: 'P', aDesEnfants: true }),
    ta('E', 1, { ref: 'E', cleLigne: 'E' }), gr('B'), ta('T3')];
  const r = Ariane.placerLignes(d, 30, 50, new Set(['P']));
  assert.deepEqual(r.lignes.map((x) => x.cleLigne || x.cleGroupe),
    ['groupe:A', 'P', 'groupe:B', 'T3']);
});

test('sans marqueurs de groupe, placerLignes se comporte comme visibles + y', () => {
  const d = [ta('P', 0, { ref: 'P', cleLigne: 'P', aDesEnfants: true }),
    ta('E', 1, { ref: 'E', cleLigne: 'E' }), ta('T', 0)];
  const r = Ariane.placerLignes(d, 30, 40, new Set(['P']));
  assert.deepEqual(r.lignes.map((x) => x.ref), ['P', 'T']);
  assert.deepEqual(r.lignes.map((x) => x.y), [30, 70]);
});

/* --------------------- tâches sans date : marquage inline ------------- */

test('disposerGantt : une ligne sans début ni échéance porte sansDate', () => {
  const l = Ariane.disposerGantt(
    [t('A', { echeance: '2026-09-01' }), t('B')], 'date', 1);
  const parRef = new Map(l.map((x) => [x.ref, x]));
  assert.equal(parRef.get('A').sansDate, false);
  assert.equal(parRef.get('B').sansDate, true);
});

test('disposerGantt : une mère qui hérite des dates de sa fille n est pas sansDate', () => {
  const l = Ariane.disposerGantt(
    [t('M', { ref: 'M' }), t('F', { parent: 'M', echeance: '2026-09-10' })],
    'date', 1);
  const parRef = new Map(l.map((x) => [x.ref, x]));
  assert.equal(parRef.get('M').sansDate, false);
});

test('disposerGantt : en tri par colonne, une tâche sans date suit le tri (pas reléguée)', () => {
  const l = Ariane.disposerGantt([
    t('Z', { _cle: 'aaa' }),
    t('A', { _cle: 'zzz', echeance: '2026-09-01' }),
  ], 'cle', 1);
  // « aaa » avant « zzz » : la tâche sans date passe devant la datée.
  assert.deepEqual(l.map((x) => x.ref), ['Z', 'A']);
  assert.equal(l[0].sansDate, true);
});

test('placerLignes : une tâche sans date obéit au repli de son groupe', () => {
  const d = [gr('A'),
    { kind: 'tache', ref: 'Z', cleLigne: 'A Z', niveau: 0, aDesEnfants: false, sansDate: true },
    gr('B'), ta('T3')];
  const r = Ariane.placerLignes(d, 30, 20, new Set(['groupe:A']));
  assert.deepEqual(r.lignes.filter((x) => x.kind === 'tache').map((x) => x.ref), ['T3']);
});
