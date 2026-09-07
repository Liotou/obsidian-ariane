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

test('replierRelatifs : sous-arbre hier privé, garde les enfants partagés', () => {
  const ar = [A('P', 'C1', 'hier'), A('C1', 'G1', 'hier'),
    A('P', 'C2', 'hier'), A('Q', 'C2', 'hier')];        // C2 a aussi Q pour parent
  const plan = new Set(['P', 'C1', 'G1', 'C2', 'Q']);
  const r = Ariane.replierRelatifs('P', ar, plan, 'hier').sort();
  assert.deepEqual(r, ['C1', 'G1']);                    // C2 reste (retenu par Q)
  assert.deepEqual(Ariane.replierRelatifs('P', ar, new Set(['P']), 'hier'), []);
  assert.deepEqual(Ariane.replierRelatifs('Z', ar, plan, 'hier'), []); // hors plan
});

test('replierRelatifs : chaîne de bloqueurs, s arrête à un bloqueur partagé', () => {
  const ar = [A('B1', 'T', 'bloque'), A('B2', 'B1', 'bloque'), A('B1', 'U', 'bloque')];
  const plan = new Set(['T', 'U', 'B1', 'B2']);
  // B1 bloque aussi U (gardé) → on ne retire rien.
  assert.deepEqual(Ariane.replierRelatifs('T', ar, plan, 'bloque'), []);
  // Sans U dans le plan, B1 puis B2 se replient.
  assert.deepEqual(
    Ariane.replierRelatifs('T', ar, new Set(['T', 'B1', 'B2']), 'bloque').sort(),
    ['B1', 'B2']);
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
