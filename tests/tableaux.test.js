// Tableaux des notes : largeurs rangées en commentaire au-dessus du tableau,
// puces des cellules.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const T = ['Texte.', '', '| A | B | C |', '|---|---|---|', '| 1 | 2 | 3 |'];

test('largeurs : lecture, normalisation, ligne', () => {
  assert.deepEqual(Ariane.lireLargeursTableau('%% ariane-tableau : 20, 45, 35 %%'), [20, 45, 35]);
  assert.deepEqual(Ariane.lireLargeursTableau('%%ariane-tableau:1,1%%'), [1, 1]);
  assert.equal(Ariane.lireLargeursTableau('%% autre %%'), null);
  assert.deepEqual(Ariane.normaliserLargeurs([1, 1, 2]), [25, 25, 50]);
  assert.equal(Ariane.ligneLargeursTableau([100, 300]), '%% ariane-tableau : 25, 75 %%');
});

test('largeurs : posées au-dessus du tableau, après une ligne vide, puis remplacées puis retirées', () => {
  const un = Ariane.poserLargeursTableau(T, 2, [20, 40, 40]);
  assert.deepEqual(un, ['Texte.', '', '%% ariane-tableau : 20, 40, 40 %%', '', '| A | B | C |', '|---|---|---|', '| 1 | 2 | 3 |']);
  assert.deepEqual(Ariane.largeursAuDessus(un, 4), { largeurs: [20, 40, 40], i: 2 });
  const deux = Ariane.poserLargeursTableau(un, 4, [50, 25, 25]);
  assert.equal(deux[2], '%% ariane-tableau : 50, 25, 25 %%');
  assert.equal(deux.length, un.length);
  assert.deepEqual(Ariane.poserLargeursTableau(deux, 4, null), T);
});

test('largeurs : un paragraphe collé au-dessus reçoit une ligne vide, rien sans commentaire', () => {
  const colle = ['Texte.', '| A | B |', '|---|---|'];
  assert.deepEqual(Ariane.poserLargeursTableau(colle, 1, [1, 1]),
    ['Texte.', '', '%% ariane-tableau : 50, 50 %%', '', '| A | B |', '|---|---|']);
  assert.equal(Ariane.largeursAuDessus(colle, 1), null);
  assert.deepEqual(Ariane.poserLargeursTableau(T, 2, null), T);
});

test('puces de cellule : « - », « * », « • », « 1. »', () => {
  assert.deepEqual(Ariane.puceCellule('- item'), { ordonnee: false, texte: 'item' });
  assert.deepEqual(Ariane.puceCellule('2. second'), { ordonnee: true, texte: 'second' });
  assert.equal(Ariane.puceCellule('texte - avec tiret'), null);
  assert.equal(Ariane.puceCellule('-collé'), null);
});
