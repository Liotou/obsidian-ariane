const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('une date valide est rendue telle quelle', () => {
  assert.equal(Ariane.jourValide('2026-09-01'), '2026-09-01');
});

test('une date horodatée est ramenée au jour', () => {
  assert.equal(Ariane.jourValide('2026-09-01T18:30:00'), '2026-09-01');
});

test('ce qui n est pas une date rend la chaîne vide', () => {
  assert.equal(Ariane.jourValide(''), '');
  assert.equal(Ariane.jourValide(null), '');
  assert.equal(Ariane.jourValide('bientôt'), '');
});

test('une date impossible est rejetée plutôt que reportée', () => {
  assert.equal(Ariane.jourValide('2026-02-31'), '');
  assert.equal(Ariane.jourValide('2026-13-01'), '');
});

test('décaler de zéro ne change rien', () => {
  assert.equal(Ariane.decalerJour('2026-09-01', 0), '2026-09-01');
});

test('décaler franchit les mois', () => {
  assert.equal(Ariane.decalerJour('2026-08-30', 3), '2026-09-02');
});

test('décaler en arrière franchit les années', () => {
  assert.equal(Ariane.decalerJour('2026-01-02', -3), '2025-12-30');
});

test('décaler traverse le changement d heure sans perdre un jour', () => {
  assert.equal(Ariane.decalerJour('2026-10-24', 2), '2026-10-26');
  assert.equal(Ariane.decalerJour('2026-03-28', 2), '2026-03-30');
});

test('une année bissextile est respectée', () => {
  assert.equal(Ariane.decalerJour('2028-02-28', 1), '2028-02-29');
  assert.equal(Ariane.decalerJour('2026-02-28', 1), '2026-03-01');
});

test('l écart se compte en jours, signé', () => {
  assert.equal(Ariane.ecartJours('2026-09-01', '2026-09-10'), 9);
  assert.equal(Ariane.ecartJours('2026-09-10', '2026-09-01'), -9);
  assert.equal(Ariane.ecartJours('2026-09-01', '2026-09-01'), 0);
});

test('l écart traverse aussi le changement d heure', () => {
  assert.equal(Ariane.ecartJours('2026-10-24', '2026-10-26'), 2);
});

test('un écart sur une date invalide vaut zéro', () => {
  assert.equal(Ariane.ecartJours('', '2026-09-01'), 0);
  assert.equal(Ariane.ecartJours('2026-09-01', 'bientôt'), 0);
});

test('décaler une date invalide rend la chaîne vide', () => {
  assert.equal(Ariane.decalerJour('', 3), '');
});
