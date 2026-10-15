const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

// Texte reçu en glissant un surlignage depuis le lecteur de Zotero (Markdown).
const MD = '« In other words, through interbreeding, ecosystem actors are able to constantly produce new outcomes. » '
  + '([Valkokari, 2015, p. 18](zotero://select/library/items/K5BDA9BL)) '
  + '([pdf](zotero://open-pdf/library/items/RZ4BV8NX?page=2&annotation=4GWCTBFD)) '
  + '**Hétérogénéité des acteurs et innovation dans les écosystèmes.**  \nGrâce à l’hétérogénéité des acteurs, p. 99 ne compte pas.';

test('lireChargeZotero : clé du surlignage et page de sa citation', () => {
  assert.deepEqual(Ariane.lireChargeZotero(MD),
    { key: 'K5BDA9BL', annotations: [{ id: '4GWCTBFD', page: '18' }] });
});

test('lireChargeZotero : plusieurs surlignages, chacun sa page', () => {
  const deux = MD + '\n\n« Autre passage. » ([Valkokari, 2015, pp. 20-21](zotero://select/library/items/K5BDA9BL)) '
    + '([pdf](zotero://open-pdf/library/items/RZ4BV8NX?page=4&annotation=ZZZZ2222))';
  assert.deepEqual(Ariane.lireChargeZotero(deux).annotations,
    [{ id: '4GWCTBFD', page: '18' }, { id: 'ZZZZ2222', page: '20-21' }]);
});

test('lireChargeZotero : la forme HTML du même glisser', () => {
  const html = '<p>« Passage. » (<a href="zotero://select/library/items/K5BDA9BL">Valkokari, 2015, p. 18</a>) '
    + '(<a href="zotero://open-pdf/library/items/RZ4BV8NX?page=2&amp;annotation=4GWCTBFD">pdf</a>)</p>';
  assert.deepEqual(Ariane.lireChargeZotero(html),
    { key: 'K5BDA9BL', annotations: [{ id: '4GWCTBFD', page: '18' }] });
});

test('lireChargeZotero : bibliothèque de groupe', () => {
  const g = '([X, 2020, p. 3](zotero://select/groups/42/items/AAAA1111)) ([pdf](zotero://open-pdf/groups/42/items/BBBB2222?page=1&annotation=CCCC3333))';
  assert.deepEqual(Ariane.lireChargeZotero(g), { key: 'AAAA1111', annotations: [{ id: 'CCCC3333', page: '3' }] });
});

test('lireChargeZotero : un texte sans surlignage Zotero est ignoré', () => {
  assert.equal(Ariane.lireChargeZotero('Un paragraphe ([[@clé|Auteur, 2020]]).'), null);
  assert.equal(Ariane.lireChargeZotero('([pdf](zotero://open-pdf/library/items/RZ4BV8NX?page=2))'), null);
  assert.equal(Ariane.lireChargeZotero(''), null);
});
