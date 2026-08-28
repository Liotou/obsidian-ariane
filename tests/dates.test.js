const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const dates = {
  'T26-001': { debut: '2026-09-01', echeance: '2026-09-30' },
  'T26-002': { debut: '2026-09-15', echeance: '2026-10-15' },
  'T26-003': { debut: '2026-10-01', echeance: '2026-10-20' },
  'T26-004': { debut: '', echeance: '' },
};

test('une tâche qui commence avant la fin de ce qui la bloque est signalée', () => {
  const r = Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-002' }], dates);
  assert.equal(r.length, 1);
  assert.equal(r[0].de, 'T26-001');
  assert.equal(r[0].vers, 'T26-002');
});

test('un enchaînement correct ne signale rien', () => {
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-003' }], dates), []);
});

test('commencer le jour même de l échéance reste admis', () => {
  const d = { A: { echeance: '2026-09-30' }, B: { debut: '2026-09-30' } };
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'A', vers: 'B' }], d), []);
});

test('une date manquante ne permet de rien conclure', () => {
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-004' }], dates), []);
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-004', vers: 'T26-002' }], dates), []);
});

test('une date horodatée est ramenée au jour', () => {
  const d = { A: { echeance: '2026-09-30T18:00:00' }, B: { debut: '2026-09-29T09:00:00' } };
  assert.equal(Ariane.datesIncoherentes([{ de: 'A', vers: 'B' }], d).length, 1);
});

test('une tâche inconnue de la table ne fait pas tomber la fonction', () => {
  assert.deepEqual(Ariane.datesIncoherentes([{ de: 'T26-001', vers: 'T26-999' }], dates), []);
});

test('plusieurs arêtes fautives sont toutes signalées', () => {
  const d = {
    A: { echeance: '2026-09-30' }, B: { debut: '2026-09-01' }, C: { debut: '2026-09-02' },
  };
  assert.equal(Ariane.datesIncoherentes([{ de: 'A', vers: 'B' }, { de: 'A', vers: 'C' }], d).length, 2);
});
