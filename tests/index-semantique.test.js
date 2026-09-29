// Index sémantique : le cache ne garde que les notes indexées aujourd'hui.
// Une note déplacée restait sous son ancien chemin, et sortait deux fois de
// la recherche du serveur MCP ariane-annotations, dont une fois vide.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('reconstruction : les entrées dont la note n\'est plus indexée sont retirées du cache', async () => {
  const g = Object.create(Ariane.prototype);
  const cache = {
    '02 - Annotations/@tong2020/KHXS6EEP.md': { hash: 'h1', vec: [1, 0] },
    '1 - Annotations/@tong2020/KHXS6EEP.md': { hash: 'h1', vec: [1, 0] },
  };
  let sauvegarde = 0;
  let encodages = 0;
  g.settings = { suggModeleEmbed: 'bge-m3' };
  g.suggVecs = new Map([['1 - Annotations/@tong2020/KHXS6EEP.md', {}]]);
  g.assurerCacheEmbeddings = async () => cache;
  g.vueSuggestions = () => null;
  g.encoderTextes = async (t) => { encodages += t.length; return t.map(() => [0, 1]); };
  g.planifierSauvegardeEmbeddings = () => { sauvegarde += 1; };
  await g.construireIndexSemantique([{ path: '02 - Annotations/@tong2020/KHXS6EEP.md', basename: 'KHXS6EEP',
    titre: 'Le risque comme potentiel de crise.', hash: 'h1', texte: 'x' }]);
  assert.deepEqual(Object.keys(cache), ['02 - Annotations/@tong2020/KHXS6EEP.md']);
  assert.equal(g.suggVecs.has('1 - Annotations/@tong2020/KHXS6EEP.md'), false);
  assert.equal(encodages, 0, 'la note à jour n\'est pas réencodée');
  assert.equal(sauvegarde, 1, 'le ménage suffit à justifier une sauvegarde');
  assert.equal(g.suggIndexSem.docs.length, 1);
});
