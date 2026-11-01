const test = require('node:test');
const assert = require('node:assert');
const { citationsZotflowVersAriane } = require('./obsidian-factice.js')._test;

// Citation telle que zotflow la recopie depuis une note Zotero.
function citation(item, libelle) {
  const data = encodeURIComponent(JSON.stringify({ citationItems: [item], properties: {} }));
  return '<span class="citation" data-citation="' + data + '">(<span class="citation-item">'
    + libelle + '</span>)</span>';
}
const source = 'http://zotero.org/users/1/items/PARENT01';
const parCleZotero = new Map([['PARENT01', '@valkokariBusinessInnovation2015']]);
const parCleAnnotation = new Map([['ANNOTA01', 'ANNOTA01']]);

test('une citation glissée depuis un surlignage pointe vers sa note d annotation', () => {
  const corps = 'Nature : ' + citation({ uris: [source], locator: '17', annotationKey: 'ANNOTA01',
    annotationURI: 'http://zotero.org/users/1/items/ANNOTA01' }, 'Valkokari, 2015, p. 17');
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation),
    'Nature : ([[ANNOTA01|Valkokari, 2015, p. 17]])');
});

test('la clé peut venir de l URI seule', () => {
  const corps = citation({ uris: [source], locator: '17',
    annotationURI: 'http://zotero.org/users/1/items/ANNOTA01' }, 'Valkokari, 2015, p. 17');
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation),
    '([[ANNOTA01|Valkokari, 2015, p. 17]])');
});

test('note d annotation absente du coffre : la citation vise la source, comme avant', () => {
  const corps = citation({ uris: [source], locator: '17', annotationKey: 'INCONNUE' }, 'Valkokari, 2015, p. 17');
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation),
    '([[@valkokariBusinessInnovation2015|Valkokari, 2015, p. 17]])');
});

test('citation sans clé de surlignage : inchangé', () => {
  const corps = citation({ uris: [source], locator: '17' }, 'Valkokari, 2015, p. 17');
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero, parCleAnnotation),
    '([[@valkokariBusinessInnovation2015|Valkokari, 2015, p. 17]])');
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero),
    '([[@valkokariBusinessInnovation2015|Valkokari, 2015, p. 17]])');
});

test('une cible en chemin, quand le nom seul est ambigu', () => {
  const corps = citation({ uris: [source], annotationKey: 'ANNOTA01' }, 'Valkokari, 2015');
  const parChemin = new Map([['ANNOTA01', '02 - Annotations/@valkokari/ANNOTA01']]);
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero, parChemin),
    '([[02 - Annotations/@valkokari/ANNOTA01|Valkokari, 2015]])');
});

// Une citation posée à la main dans Zotero : la page, sans clé de surlignage.
const { annotationsDeSource, choisirAnnotationCitee, rafraichirLibelles } = require('./obsidian-factice.js')._test;
const fiche = [
  '> [!zotflow-highlight-#ffd400] [x.pdf, p.40](obsidian://zotflow?type=open-annotation&libraryID=1&key=ANNOTA01)',
  '> > the alignment structure of the multilateral set of partners',
  '>',
  '> <!-- ZF_ANNO_BEG_ANNOTA01 -->',
  '> **Définition.** Une structure d’alignement de partenaires multilatéraux.',
  '> <!-- ZF_ANNO_END_ANNOTA01 -->',
  '^ANNOTA01',
  '',
  '> [!zotflow-highlight-#ffd400] [x.pdf, p.40](obsidian://zotflow?type=open-annotation&libraryID=1&key=ANNOTA02)',
  '> > communities of associated actors defined by their networks',
  '>',
  '> <!-- ZF_ANNO_BEG_ANNOTA02 -->',
  '> **Deux visions.** Des communautés d’acteurs associés définis par leurs réseaux et les écosystèmes de plateformes.',
  '> <!-- ZF_ANNO_END_ANNOTA02 -->',
  '^ANNOTA02',
  '',
].join('\n');

test('annotationsDeSource : clé, page et texte de chaque encadré', () => {
  const a = annotationsDeSource(fiche);
  assert.deepStrictEqual(a.map((x) => [x.cle, x.page]), [['ANNOTA01', '40'], ['ANNOTA02', '40']]);
  assert.ok(a[1].texte.includes('communautés'));
});

test('citation posée à la main : reliée au surlignage de la page que reprend la phrase', () => {
  const annos = annotationsDeSource(fiche);
  const tableAnno = new Map([['ANNOTA01', 'ANNOTA01'], ['ANNOTA02', 'ANNOTA02']]);
  const corps = '* Communautés d’acteurs associés définis par leurs réseaux '
    + citation({ uris: [source], locator: '40' }, 'Valkokari, 2015, p. 40') + '.';
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero, tableAnno, annos),
    '* Communautés d’acteurs associés définis par leurs réseaux ([[ANNOTA02|Valkokari, 2015, p. 40]]).');
  // Le surlignage choisi sans note d'annotation : la source, page comprise.
  assert.strictEqual(citationsZotflowVersAriane(corps, parCleZotero, new Map(), annos),
    '* Communautés d’acteurs associés définis par leurs réseaux ([[@valkokariBusinessInnovation2015|Valkokari, 2015, p. 40]]).');
});

test('choisirAnnotationCitee : seul à la page, ou nettement le plus proche ; sinon personne', () => {
  const annos = annotationsDeSource(fiche);
  assert.strictEqual(choisirAnnotationCitee('rien', annos.slice(0, 1)).cle, 'ANNOTA01');
  assert.strictEqual(choisirAnnotationCitee('Une phrase sans rapport aucun', annos), null);
  assert.strictEqual(choisirAnnotationCitee('', []), null);
});

test('rafraichirLibelles garde la page d une citation de la source', () => {
  const r = rafraichirLibelles('([[@adner2017|Adner, 2017, p. 40]]) et [[@adner2017|Adner (2017, p. 44)]]',
    () => 'Adner, 2017', () => true);
  assert.strictEqual(r.texte, '([[@adner2017|Adner, 2017, p. 40]]) et [[@adner2017|Adner (2017, p. 44)]]');
  assert.strictEqual(r.n, 0);
});
