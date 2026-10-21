// Notes conceptuelles glissées dans le texte : l'alias, en minuscule sauf
// en tête de phrase ou pour un sigle.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { debutDePhrase, libelleConcept, insertionNarrative } = Ariane._test;

test('libelleConcept : minuscule en cours de phrase, casse gardée pour un sigle', () => {
  assert.strictEqual(libelleConcept('Approche descendante (top-down)', false), 'approche descendante (top-down)');
  assert.strictEqual(libelleConcept('Économie de la fonctionnalité', false), 'économie de la fonctionnalité');
  assert.strictEqual(libelleConcept('ICPE', false), 'ICPE');
  assert.strictEqual(libelleConcept('REX organisationnel', false), 'REX organisationnel');
  assert.strictEqual(libelleConcept('résilience', true), 'Résilience');
  assert.strictEqual(libelleConcept('Choix [a|b]', false), 'choix ab');
});

test('debutDePhrase : début de ligne, après un point, pas au milieu', () => {
  assert.strictEqual(debutDePhrase(''), true);
  assert.strictEqual(debutDePhrase('- '), true);
  assert.strictEqual(debutDePhrase('> ## '), true);
  assert.strictEqual(debutDePhrase('Il pleut. '), true);
  assert.strictEqual(debutDePhrase('Il pleut ?» '), true);
  assert.strictEqual(debutDePhrase('On retient la '), false);
  assert.strictEqual(debutDePhrase('Deux notions : '), false);
});

test('un concept se pose comme un mot, espaces au besoin', () => {
  const ligne = 'On retient la  dans ce cas.';
  const lien = '[[NC-1|' + libelleConcept('Résilience', debutDePhrase(ligne.slice(0, 14))) + ']]';
  const r = insertionNarrative(ligne, 14, [lien], ', ');
  assert.strictEqual(ligne.slice(0, r.off) + r.insert + ligne.slice(r.off), 'On retient la [[NC-1|résilience]] dans ce cas.');
});
