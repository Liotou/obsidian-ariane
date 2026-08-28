const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const a = (de, vers) => ({ de, vers });

test('un graphe sans cycle n en signale aucun', () => {
  assert.deepEqual(Ariane.cyclesDe([a('A', 'B'), a('B', 'C')]), []);
});

test('un cycle de deux est trouvé', () => {
  const c = Ariane.cyclesDe([a('A', 'B'), a('B', 'A')]);
  assert.equal(c.length, 1);
  assert.equal(c[0][0], c[0][c[0].length - 1]);
  assert.ok(c[0].includes('A') && c[0].includes('B'));
});

test('un cycle de trois est trouvé', () => {
  const c = Ariane.cyclesDe([a('A', 'B'), a('B', 'C'), a('C', 'A')]);
  assert.equal(c.length, 1);
  assert.equal(c[0].length, 4);
});

test('une boucle sur soi est un cycle', () => {
  assert.equal(Ariane.cyclesDe([a('A', 'A')]).length, 1);
});

test('un losange n est pas un cycle', () => {
  assert.deepEqual(Ariane.cyclesDe([a('A', 'B'), a('A', 'C'), a('B', 'D'), a('C', 'D')]), []);
});

test('deux cycles disjoints sont tous deux signalés', () => {
  const c = Ariane.cyclesDe([a('A', 'B'), a('B', 'A'), a('X', 'Y'), a('Y', 'X')]);
  assert.equal(c.length, 2);
});

test('le même cycle atteint par deux entrées n est compté qu une fois', () => {
  const c = Ariane.cyclesDe([a('Z', 'A'), a('W', 'B'), a('A', 'B'), a('B', 'A')]);
  assert.equal(c.length, 1);
});

test('un graphe vide ne fait pas tomber la fonction', () => {
  assert.deepEqual(Ariane.cyclesDe([]), []);
  assert.deepEqual(Ariane.cyclesDe(null), []);
});
