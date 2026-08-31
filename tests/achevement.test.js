const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const a = (fm) => Ariane.achevementAEcrire(fm, '2026-08-28');

test('une tâche terminée sans date reçoit le jour même', () => {
  assert.equal(a({ type: 'tache', statut: 'terminée' }), '2026-08-28');
});

test('une tâche terminée qui a déjà sa date n est pas retouchée', () => {
  assert.equal(a({ type: 'tache', statut: 'terminée', 'termine-le': '2026-07-01' }), null);
});

test('une tâche non terminée qui porte une date la perd', () => {
  assert.equal(a({ type: 'tache', statut: 'en cours', 'termine-le': '2026-07-01' }), '');
});

test('une tâche non terminée sans date ne demande rien', () => {
  assert.equal(a({ type: 'tache', statut: 'à faire' }), null);
});

test('une tâche abandonnée n est pas une tâche achevée', () => {
  assert.equal(a({ type: 'tache', statut: 'abandonnée' }), null);
});

test('une note qui n est pas une tâche est laissée tranquille', () => {
  assert.equal(a({ type: 'conceptuelle', statut: 'terminée' }), null);
});

/* --------------------- sansEcheanceAEcrire -------------------------- */

const se = (ech, actuel) => Ariane.sansEcheanceAEcrire(ech, actuel);

test('sans échéance et propriété absente : écrire true', () => {
  assert.equal(se('', undefined), true);
  assert.equal(se(null, undefined), true);
});

test('avec échéance et propriété absente : écrire false', () => {
  assert.equal(se('2026-09-30', undefined), false);
});

test('déjà en phase : ne rien réécrire', () => {
  assert.equal(se('', true), null);
  assert.equal(se('2026-09-30', false), null);
});

test('valeur divergente : corriger', () => {
  assert.equal(se('2026-09-30', true), false);
  assert.equal(se('  ', false), true); // espaces = pas d'échéance
});
