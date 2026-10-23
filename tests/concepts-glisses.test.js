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
  assert.strictEqual(libelleConcept('Design Science (Research)', false), 'Design Science (Research)');
  assert.strictEqual(libelleConcept('Théorie de Weick', false), 'théorie de Weick');
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

test('uniformiserLiensConcepts : alias, casse selon la phrase, le reste intact', () => {
  const { uniformiserLiensConcepts: u } = Ariane._test;
  const alias = { 'NC-1': 'Résilience organisationnelle', 'NC-2': 'ICPE', 'NC-3': 'Phénomène' };
  const aliasDe = (c) => alias[c.split('/').pop()] || '';
  const avant = [
    '---',
    'lien: "[[NC-1]]"',
    '---',
    'On retient la [[NC-1]] et le [[NC-3|Phénomène]] ici.',
    '[[NC-3|phénomène]] en tête. Puis [[NC-1|NC-1]].',
    '\t- les [[NC-2]] et les [[NC-3|Phénomènes]]',
    '| [[NC-1]] | voir [[NC-3\\|Phénomène]] |',
    '![[NC-1]] [[NC-1#Titre]] [[Autre]] [[NC-1|résilience]]',
    '```',
    '[[NC-1]]',
    '```',
  ].join('\n');
  const r = u(avant, aliasDe);
  assert.deepEqual(r.texte.split('\n'), [
    '---',
    'lien: "[[NC-1]]"',
    '---',
    'On retient la [[NC-1|résilience organisationnelle]] et le [[NC-3|phénomène]] ici.',
    '[[NC-3|Phénomène]] en tête. Puis [[NC-1|résilience organisationnelle]].',
    '\t- les [[NC-2|ICPE]] et les [[NC-3|phénomènes]]',
    '| [[NC-1\\|résilience organisationnelle]] | voir [[NC-3\\|phénomène]] |',
    '![[NC-1]] [[NC-1#Titre]] [[Autre]] [[NC-1|résilience]]',
    '```',
    '[[NC-1]]',
    '```',
  ]);
  assert.equal(r.changements.length, 8);
  assert.equal(u(r.texte, aliasDe).changements.length, 0, 'une seconde passe ne change rien');
});
