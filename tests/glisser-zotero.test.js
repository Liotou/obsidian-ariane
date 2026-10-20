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

test('glisser depuis Zotero : la note d’annotation déjà dans le coffre est citée, comme depuis Obsidian', async () => {
  const charge = Ariane.lireChargeZotero(MD);
  const note = { path: '02 - Annotations/@valkokari2015/4GWCTBFD.md', basename: '4GWCTBFD_Hétérogénéité' };
  const ctx = Object.assign(Object.create(Ariane.prototype), {
    indexAnnotationsParCle: () => new Map([['4GWCTBFD', note]]),
    sourceDeZotflow: () => null,
  });
  assert.deepEqual(await ctx.clesDepuisZotflow(charge, MD), ['4GWCTBFD_Hétérogénéité']);
});

// Avec le gabarit « {{citation}} » seul : la citation HTML, clé d'Annota comprise.
const CIT = (extra) => '<p><span class="citation" data-citation="' + encodeURIComponent(JSON.stringify({
  citationItems: [Object.assign({ uris: ['http://zotero.org/users/123/items/Y4GRSDJ9'], locator: '3' }, extra)], properties: {},
})) + '">(<span class="citation-item">Power, 2010, p. 3</span>)</span></p>';

test('lireCitationsZotero : la clé du surlignage qu’Annota inscrit dans la citation', () => {
  assert.deepEqual(Ariane.lireCitationsZotero(CIT({ annotationKey: 'AB12CD34' })),
    { key: 'Y4GRSDJ9', annotations: [{ id: 'AB12CD34', page: '3' }], sansCle: [] });
});

test('lireCitationsZotero : sans clé, la fiche et la page, en HTML ou en texte', () => {
  assert.deepEqual(Ariane.lireCitationsZotero(CIT({})), { key: 'Y4GRSDJ9', annotations: [], sansCle: [{ key: 'Y4GRSDJ9', page: '3' }] });
  assert.deepEqual(Ariane.lireCitationsZotero('([Power, 2010, p. 3](zotero://select/library/items/Y4GRSDJ9))'),
    { key: 'Y4GRSDJ9', annotations: [], sansCle: [{ key: 'Y4GRSDJ9', page: '3' }] });
});

test('glisser la citation seule : le surlignage unique de la page, sinon la source à la page', async () => {
  const src = { path: '98/@power2010.md', basename: '@power2010' };
  const unique = { path: '02 - Annotations/@power2010/AB12.md', basename: 'AB12_Incertitude' };
  const mk = (notes) => Object.assign(Object.create(Ariane.prototype), {
    sourceDeZotflow: () => src,
    annotationsALaPage: () => notes,
    indexAnnotationsParCle: () => new Map(),
  });
  const charge = Ariane.lireCitationsZotero('([Power, 2010, p. 3](zotero://select/library/items/Y4GRSDJ9))');
  assert.deepEqual(await mk([unique]).clesDepuisZotflow(charge, ''), ['AB12_Incertitude']);
  // Plusieurs à la page : on demande ; sans réponse, la source à la page.
  const plusieurs = mk([unique, { basename: 'autre' }]);
  plusieurs.choisirAnnotation = async () => null;
  assert.deepEqual(await plusieurs.clesDepuisZotflow(charge, ''), [{ cle: '@power2010', page: '3' }]);
  plusieurs.choisirAnnotation = async (notes) => notes[1];
  assert.deepEqual(await plusieurs.clesDepuisZotflow(charge, ''), ['autre']);
});
