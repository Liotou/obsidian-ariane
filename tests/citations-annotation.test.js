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
