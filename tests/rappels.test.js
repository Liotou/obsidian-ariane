const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const Ariane = require('./obsidian-factice.js');

test('genererJXARappels : script JS valide, données embarquées', () => {
  const taches = [
    { ref: 'T26-001', id: '', titre: '[T26-001] - Lire', notes: 'obsidian://open?...',
      liste: 'Doctorat', echeance: '2026-09-30', heure: '', priorite: 'haute', termine: false },
    { ref: 'T26-002', id: 'x-apple-reminder://ABC', titre: '[T26-002] - Rédiger',
      notes: 'n', liste: 'Prod', echeance: '2026-10-01', heure: '14:30', priorite: '', termine: true },
  ];
  const s = Ariane.genererJXARappels(taches);
  new vm.Script(s);                       // ne lève pas -> syntaxe JS correcte
  assert.ok(s.includes('T26-001'));
  assert.ok(s.includes('x-apple-reminder://ABC'));
  assert.ok(s.includes('"heure":"14:30"'));
  assert.ok(s.includes('Application("Reminders")'));
  assert.ok(s.includes('function run()'));
});

test('genererJXAReleve : script JS valide, paires embarquées', () => {
  const s = Ariane.genererJXAReleve([{ ref: 'T26-001', id: 'x-apple-reminder://A' }]);
  new vm.Script(s);
  assert.ok(s.includes('x-apple-reminder://A'));
  assert.ok(s.includes('r.completed()'));
});

test('genererJXARappels : entrée vide reste un script valide', () => {
  const s = Ariane.genererJXARappels();
  new vm.Script(s);
  assert.ok(s.includes('IN.taches'));
});
