const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const suivante = (noms, annee) => Ariane.referenceTacheSuivante(noms, annee);

test('la première tâche de l année porte le rang 001', () => {
  assert.equal(suivante([], 2026), 'T26-001');
});

test('le rang suit le plus grand déjà employé', () => {
  assert.equal(suivante(['T26-001', 'T26-002'], 2026), 'T26-003');
});

test('un trou dans la numérotation ne réattribue pas le rang libéré', () => {
  assert.equal(suivante(['T26-001', 'T26-004'], 2026), 'T26-005');
});

test('le compteur repart à chaque année', () => {
  assert.equal(suivante(['T25-999'], 2026), 'T26-001');
});

test('au delà de 999 la référence passe à quatre chiffres', () => {
  assert.equal(suivante(['T26-999'], 2026), 'T26-1000');
});

test('un nom qui ne suit pas la convention est ignoré', () => {
  assert.equal(suivante(['Brouillon', 'T26-abc', 'T26-'], 2026), 'T26-001');
});

test('un rang écrit sans zéros de tête est tout de même compté', () => {
  assert.equal(suivante(['T26-7'], 2026), 'T26-008');
});
