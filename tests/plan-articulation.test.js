const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const A = (de, vers, type) => ({ de, vers, type });

test('aretesEntre garde les arêtes internes à l ensemble', () => {
  const ar = [A('P', 'C', 'hier'), A('P', 'X', 'hier'), A('B', 'P', 'bloque')];
  assert.deepEqual(
    Ariane.aretesEntre(ar, ['P', 'C']),
    [A('P', 'C', 'hier')]);
  assert.equal(Ariane.aretesEntre(ar, new Set(['P', 'C', 'B'])).length, 2);
  assert.deepEqual(Ariane.aretesEntre([], ['P']), []);
});

test('relativesHorsPlan : enfants et bloquantes absents du plan', () => {
  const ar = [A('T', 'C1', 'hier'), A('T', 'C2', 'hier'),
    A('B1', 'T', 'bloque'), A('T', 'B2', 'bloque')];
  const r = Ariane.relativesHorsPlan('T', ar, new Set(['T', 'C1']));
  assert.deepEqual(r.sousTaches, ['C2']);        // C1 est sur le plan
  assert.deepEqual(r.bloquantes, ['B1']);        // B2 est bloqué PAR T, pas l inverse
  const r2 = Ariane.relativesHorsPlan('T', ar, new Set(['T', 'C1', 'C2', 'B1']));
  assert.deepEqual(r2.sousTaches, []);
  assert.deepEqual(r2.bloquantes, []);
});

test('grillePlacement : N positions, saute l occupé, respecte parLigne', () => {
  const g = Ariane.grillePlacement(3, { origine: { x: 0, y: 0 },
    pas: { x: 100, y: 100 }, carte: { w: 50, h: 50 }, parLigne: 2 });
  assert.deepEqual(g, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);

  const occ = [{ x: 0, y: 0, w: 50, h: 50 }];
  const g2 = Ariane.grillePlacement(1, { origine: { x: 0, y: 0 },
    pas: { x: 100, y: 100 }, carte: { w: 50, h: 50 }, occupe: occ, parLigne: 2 });
  assert.deepEqual(g2, [{ x: 100, y: 0 }]);      // (0,0) est occupé

  assert.deepEqual(Ariane.grillePlacement(0, {}), []);
});
