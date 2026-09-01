const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const hier = (de, vers) => ({ de, vers, type: 'hier' });
const bloq = (de, vers) => ({ de, vers, type: 'bloque' });

test('une fille d’une mère bloquante est dérivée', () => {
  const ar = [hier('M', 'F'), bloq('M', 'T')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), 'M');
});

test('une petite-fille remonte jusqu’à la bloquante', () => {
  const ar = [hier('G', 'M'), hier('M', 'F'), bloq('G', 'T')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), 'G');
});

test('l’ancêtre le plus proche est retenu quand plusieurs bloquent', () => {
  const ar = [hier('G', 'M'), hier('M', 'F'), bloq('G', 'T'), bloq('M', 'T')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), 'M');
});

test('sans bloqueur dans la lignée, le lien porte sa propre information', () => {
  const ar = [hier('M', 'F')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), '');
});

test('la mère qui bloque une autre tâche ne dérive rien', () => {
  const ar = [hier('M', 'F'), bloq('M', 'X')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), '');
});

test('une sœur bloquante ne dérive pas sa sœur', () => {
  const ar = [hier('M', 'F'), hier('M', 'S'), bloq('S', 'T')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), '');
});

test('le lien déjà posé de la fille elle-même ne se dérive pas lui-même', () => {
  const ar = [hier('M', 'F'), bloq('F', 'T')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), '');
});

test('une ancêtre bloquée par la tâche ne dérive rien (sens inverse)', () => {
  const ar = [hier('M', 'F'), bloq('T', 'M')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), '');
});

test('le blocage d’une tâche étrangère à la lignée ne dérive rien', () => {
  const ar = [bloq('X', 'T')];
  assert.equal(Ariane.blocageDerive(ar, 'F', 'T'), '');
});

test('un graphe vide ou absent ne fait pas tomber la fonction', () => {
  assert.equal(Ariane.blocageDerive([], 'F', 'T'), '');
  assert.equal(Ariane.blocageDerive(null, 'F', 'T'), '');
  assert.equal(Ariane.blocageDerive([hier('M', 'F')], '', 'T'), '');
  assert.equal(Ariane.blocageDerive([hier('M', 'F')], 'F', ''), '');
});
