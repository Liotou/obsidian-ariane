// Rattachement d'une référence citée à sa fiche Zotero : « Morin, 1990 »
// désigne l'Introduction à la pensée complexe (1990, rééditée en 2014), non
// l'ouvrage collectif de 1990 où Morin signe parmi douze auteurs.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { appariementSource, trouverSourceZotero } = Ariane._test;

const QUERELLE = {
  basename: '@pomianQuerelleDeterminisme1990', annee: '1990', anneeOriginale: '',
  surnames: ['amsterdamski', 'atlan', 'danchin', 'ekeland', 'largeault', 'morin', 'petitot', 'pomian', 'prigogine', 'ruelle', 'stengers', 'thom', 'pomian'],
};
const INTRODUCTION = {
  basename: '@morinIntroductionPenseeComplexe2014', annee: '2014', anneeOriginale: '1990', surnames: ['morin'],
};
const MORIN_1990 = { auteurs: ['Morin'], annee: '1990' };

test('un auteur cité seul qui n’ouvre pas la fiche n’est qu’un candidat', () => {
  assert.equal(appariementSource(MORIN_1990, QUERELLE), 'faible');
  assert.equal(appariementSource({ auteurs: ['Amsterdamski'], annee: '1990' }, QUERELLE), 'fort');
  assert.equal(appariementSource({ auteurs: ['Morin', 'Kern'], annee: '1993' },
    { annee: '1993', surnames: ['morin', 'kern'] }), 'fort');
});

test('la date originale d’une réédition vaut l’année citée', () => {
  assert.equal(appariementSource(MORIN_1990, INTRODUCTION), 'fort');
  assert.equal(appariementSource({ auteurs: ['Morin'], annee: '2014' }, INTRODUCTION), 'fort');
  assert.equal(appariementSource({ auteurs: ['Morin'], annee: '2005' }, INTRODUCTION), null);
});

test('« Morin, 1990 » se rattache à l’Introduction, non à la Querelle', () => {
  assert.equal(trouverSourceZotero(MORIN_1990, [QUERELLE, INTRODUCTION]), '@morinIntroductionPenseeComplexe2014');
  assert.equal(trouverSourceZotero(MORIN_1990, [QUERELLE]), null, 'seule la Querelle : rien d’automatique');
});
