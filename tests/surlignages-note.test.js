const test = require('node:test');
const assert = require('node:assert');
const { citationsZotflowVersAriane, commentairesAnnotations } = require('./obsidian-factice.js')._test;

// Surlignage glissé dans une note Zotero (gabarit par défaut), tel que zotflow
// le recopie dans la fiche source.
const enc = (o) => encodeURIComponent(JSON.stringify(o));
function surlignage(cle, passage, page) {
  return '<span class="highlight" data-annotation="' + enc({ attachmentURI: 'http://zotero.org/users/1/items/RZ4BV8NX',
    annotationKey: cle, color: '#ffd400', pageLabel: page }) + '"><a class="zotflow-span-link" href="obsidian://zotflow?type=open-attachment&#x26;key=RZ4BV8NX">« '
    + passage + ' »</a></span> <span class="citation" data-citation="' + enc({ citationItems: [{ uris: ['http://zotero.org/users/1/items/K5BDA9BL'], locator: page }], properties: {} })
    + '"><a class="zotflow-span-link" href="obsidian://zotflow?type=open-note&#x26;key=K5BDA9BL">(<span class="citation-item">Valkokari, 2015, p. ' + page + '</span>)</a></span>';
}
const fiche = '> [!zotflow-highlight-#ffd400] [x.pdf, p.18](obsidian://zotflow?key=4GWCTBFD)\n> > In other words…\n>\n'
  + '> <!-- ZF_ANNO_BEG_4GWCTBFD -->\n> **Hétérogénéité des acteurs et innovation dans les écosystèmes.**\n'
  + '> Grâce à l’hétérogénéité des acteurs, les écosystèmes produisent de nouveaux résultats.\n> <!-- ZF_ANNO_END_4GWCTBFD -->\n> \n^4GWCTBFD\n';
const commentaire = ' **Hétérogénéité des acteurs et innovation dans les écosystèmes.**  \nGrâce à l’hétérogénéité des acteurs, les écosystèmes produisent de nouveaux résultats.';
const parCleZotero = new Map([['K5BDA9BL', '@valkokariBusinessInnovationKnowledge2015']]);
const parCleAnnotation = new Map([['4GWCTBFD', '4GWCTBFD']]);

test('commentairesAnnotations : commentaire lu dans la fiche source', () => {
  assert.equal(commentairesAnnotations(fiche).get('4GWCTBFD'),
    '**Hétérogénéité des acteurs et innovation dans les écosystèmes.**\nGrâce à l’hétérogénéité des acteurs, les écosystèmes produisent de nouveaux résultats.');
});

test('passage, citation et commentaire deviennent la seule citation, liée à la note d annotation', () => {
  const corps = 'Nature de l’écosystème :\n\n' + surlignage('4GWCTBFD', 'In other words, through interbreeding…', '18') + commentaire + '\n\nSuite de ma note.';
  assert.equal(citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation, commentairesAnnotations(fiche)),
    'Nature de l’écosystème :\n\n([[4GWCTBFD|Valkokari, 2015, p. 18]])\n\nSuite de ma note.');
});

test('un texte ajouté à la main après la citation est conservé', () => {
  const corps = surlignage('4GWCTBFD', 'Passage', '18') + ' Mon propre commentaire.';
  assert.equal(citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation, commentairesAnnotations(fiche)),
    '([[4GWCTBFD|Valkokari, 2015, p. 18]]) Mon propre commentaire.');
});

test('un commentaire depuis prolongé par Annota est retiré lui aussi', () => {
  const corps = surlignage('4GWCTBFD', 'Passage', '18') + ' Grâce à l’hétérogénéité des acteurs, les écosystèmes';
  assert.equal(citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation, commentairesAnnotations(fiche)),
    '([[4GWCTBFD|Valkokari, 2015, p. 18]])');
});

test('surlignage sans note d annotation dans le coffre : seule la citation est convertie, comme avant', () => {
  const corps = surlignage('INCONNUE', 'Passage', '18');
  const sortie = citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation, commentairesAnnotations(fiche));
  assert.ok(sortie.includes('class="highlight"'));
  assert.ok(sortie.endsWith('([[@valkokariBusinessInnovationKnowledge2015|Valkokari, 2015, p. 18]])'));
});

test('surlignage sans citation qui le suit : laissé tel quel', () => {
  const seul = surlignage('4GWCTBFD', 'Passage', '18').replace(/ <span class="citation"[\s\S]*$/, '');
  assert.equal(citationsZotflowVersAriane(seul + ' texte', parCleZotero, parCleAnnotation, new Map()), seul + ' texte');
});

test('deux surlignages dans la même note', () => {
  const corps = surlignage('4GWCTBFD', 'A', '18') + commentaire + '\n\n' + surlignage('KSC8PL3U', 'B', '19');
  const anno = new Map([['4GWCTBFD', '4GWCTBFD'], ['KSC8PL3U', 'KSC8PL3U']]);
  assert.equal(citationsZotflowVersAriane(corps, parCleZotero, anno, commentairesAnnotations(fiche)),
    '([[4GWCTBFD|Valkokari, 2015, p. 18]])\n\n([[KSC8PL3U|Valkokari, 2015, p. 19]])');
});
