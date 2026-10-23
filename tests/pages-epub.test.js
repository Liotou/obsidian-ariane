// La page d'un surlignage : lue dans l'en-tête ZotFlow, pour un PDF comme
// pour un EPUB (pagination imprimée).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { extraireBlocs, DEFAULT_SETTINGS } = Ariane._test;

const bloc = (fichier, page, cle) => [
  '> [!zotflow-highlight-#ffd400] [' + fichier + ', p.' + page + '](obsidian://zotflow?type=open-annotation&libraryID=1&key=' + cle + ')',
  '> > Un passage surligné.',
  '>',
  '> <!-- ZF_ANNO_BEG_' + cle + ' -->',
  '> **Titre de l’annotation.**',
  '> Mon commentaire.',
  '> <!-- ZF_ANNO_END_' + cle + ' -->',
  '> ',
  '^' + cle,
].join('\n');

test('page d’un surlignage : PDF comme EPUB', () => {
  const contenu = '# Source\n## Annotations\n' + bloc('lahire2026.epub', '131', 'AAAAAAA1') + '\n\n' + bloc('rapport.pdf', '4', 'AAAAAAA2') + '\n';
  const blocs = extraireBlocs(contenu, DEFAULT_SETTINGS);
  assert.deepEqual(blocs.map((b) => [b.cle, b.page]), [['AAAAAAA1', '131'], ['AAAAAAA2', '4']]);
});
