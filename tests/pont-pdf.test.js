// Pont Claude : les PDF ouverts (pages demandées, recherche, texte de page).
const test = require('node:test');
const assert = require('node:assert');
const { pontTextePage, pontPagesDemandees, pontChercherPages } = require('./obsidian-factice.js')._test;

test('pages : sans demande, la page affichée et la suivante', () => {
  assert.deepEqual(pontPagesDemandees('', 643, 4, 30), [4, 5]);
  assert.deepEqual(pontPagesDemandees(undefined, 10, 10, 30), [10]);
  assert.deepEqual(pontPagesDemandees('', 10, null, 30), [1, 2]);
});

test('pages : listes, plages, bornes du document, plafond', () => {
  assert.deepEqual(pontPagesDemandees('3, 7, 10-12', 643, 1, 30), [3, 7, 10, 11, 12]);
  assert.deepEqual(pontPagesDemandees('640-650', 643, 1, 30), [640, 641, 642, 643]);
  assert.equal(pontPagesDemandees('1-100', 643, 1, 30).length, 30);
  assert.deepEqual(pontPagesDemandees('15-12', 643, 1, 30), [12, 13, 14, 15]);
});

test('recherche : tous les mots, casse et accents ignorés, extrait', () => {
  const pages = ['Introduction générale.', 'L’étude de cas est une méthode.', 'Les cas limites de l’Étude.'];
  const r = pontChercherPages(pages, 'etude CAS', 40);
  assert.deepEqual(r.map((x) => x.page), [2, 3]);
  assert.match(r[0].extrait, /étude de cas/);
  assert.deepEqual(pontChercherPages(pages, ' ', 40), []);
});

test('texte de page : sauts de ligne de pdf.js respectés', () => {
  assert.equal(pontTextePage([{ str: 'Méthodes', hasEOL: true }, { str: 'de recherche', hasEOL: false }, {}]),
    'Méthodes\nde recherche');
});
