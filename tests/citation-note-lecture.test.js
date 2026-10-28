// Glisser une note de lecture : elle cite la source qu'elle commente,
// comme une annotation, mais sans page.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const P = Ariane.prototype;
const FM = {
  DIVJ6K3M: { 'zotflow-note-key': 'DIVJ6K3M', 'zotflow-source': '[[@mazriReDefiningEmerging2017]]', type: 'lecture' },
  K1: { 'zotflow-anno-key': 'K1', 'zotflow-source': '[[@mazriReDefiningEmerging2017]]', page: '12' },
  '@mazriReDefiningEmerging2017': { citationKey: 'mazriReDefiningEmerging2017' },
  Libre: { aliases: ['Une note'] },
};

const greffon = () => {
  const g = Object.create(P);
  g.settings = { modeleCitation: '{{auteurs}}, {{annee}}, p. {{page}}', separateurCitation: ' ; ' };
  g.dossierA = 'Annotations';
  g.app = { metadataCache: {
    getFirstLinkpathDest: (c) => (c in FM ? { basename: c, path: (c === 'K1' ? 'Annotations/' : 'Lecture/') + c + '.md', extension: 'md' } : null),
    getFileCache: (f) => ({ frontmatter: FM[f.basename] }),
  } };
  g.auteursDepuisReference = (lien) => (lien === '[[@mazriReDefiningEmerging2017]]'
    ? { court: 'Mazri', complet: 'Mazri', annee: '2017' } : null);
  return g;
};

test('note de lecture : « Auteur, année », sans page', () => {
  const g = greffon();
  assert.equal(g.libelleCitation('DIVJ6K3M'), 'Mazri, 2017');
  assert.equal(g.libelleCitation('K1'), 'Mazri, 2017, p. 12', 'l’annotation garde sa page');
});

test('note de lecture : citable, et rattachée à sa source pour la fusion', () => {
  const g = greffon();
  assert.equal(g.estCitable('DIVJ6K3M'), true);
  assert.equal(g.estCitable('Libre'), false);
  assert.deepEqual(g.infoCitation('DIVJ6K3M'), { source: '@mazriReDefiningEmerging2017', libelle: 'Mazri, 2017' });
  g.settings.dropToutesNotes = false;
  assert.equal(g.noteCitable('DIVJ6K3M'), true, 'acceptée au dépôt même hors « toutes les notes »');
  assert.equal(g.noteCitable('Libre'), false);
});
