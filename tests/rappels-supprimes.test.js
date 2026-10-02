// Une tâche supprimée ne revient pas depuis Apple Rappels : son rappel est
// mis de côté (et retiré, hors de ce test qui coupe Rappels).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const greffon = () => {
  const g = Object.create(Ariane.prototype);
  g.settings = Object.assign({}, Ariane._test.DEFAULT_SETTINGS, { rappelsActif: false, rappelsIgnores: [] });
  g.saveSettings = async () => {};
  return g;
};

test('rappel oublié : retenu une seule fois, et reconnu à la relève', async () => {
  const g = greffon();
  await g.oublierRappel('ABC');
  await g.oublierRappel('ABC');
  await g.oublierRappel(' ');
  assert.deepEqual(g.settings.rappelsIgnores, ['ABC']);
  assert.equal(g._rappelIgnore('ABC'), true);
  assert.equal(g._rappelIgnore('XYZ'), false);
});

test('rappels oubliés : les 500 plus récents seulement', async () => {
  const g = greffon();
  g.settings.rappelsIgnores = Array.from({ length: 500 }, (_, i) => 'id' + i);
  await g.oublierRappel('nouveau');
  assert.equal(g.settings.rappelsIgnores.length, 500);
  assert.equal(g.settings.rappelsIgnores[0], 'id1');
  assert.equal(g.settings.rappelsIgnores[499], 'nouveau');
});
