const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('une source désigne une lecture', () => {
  assert.equal(Ariane.familleTache({ source: '[[@perrow1984]]' }), 'lecture');
});

test('un livrable désigne une production', () => {
  assert.equal(Ariane.familleTache({ livrable: '[[NC-202607081912]]' }), 'production');
});

test('un fichier externe désigne aussi une production', () => {
  assert.equal(Ariane.familleTache({ fichier: '/Users/x/soutenance.pptx' }), 'production');
});

test('aucun des trois champs désigne une action', () => {
  assert.equal(Ariane.familleTache({ statut: 'à faire' }), 'action');
});

test('un champ vide ou blanc ne compte pas', () => {
  assert.equal(Ariane.familleTache({ source: '', livrable: '   ' }), 'action');
});

test('un frontmatter absent ne fait pas tomber la fonction', () => {
  assert.equal(Ariane.familleTache(null), 'action');
});

test('la source l emporte quand plusieurs champs sont remplis', () => {
  const c = Ariane.champTache({ source: '[[@a]]', fichier: '/x.pptx' });
  assert.equal(c.retenu, 'source');
  assert.deepEqual(c.conflits, ['source', 'fichier']);
});

test('un seul champ rempli ne produit aucun conflit', () => {
  assert.deepEqual(Ariane.champTache({ livrable: '[[N]]' }).conflits, []);
});
