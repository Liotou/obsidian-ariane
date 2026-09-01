const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const Ariane = require('./obsidian-factice.js');

// --- SP-4 : générateurs JXA EventKit (EKEvent, entité 0) ---

test('genererJXAEvenementsPush : script valide, save/remove, données embarquées', () => {
  const s = Ariane.genererJXAEvenementsPush([
    { ref: 'T26-001', idx: 0, id: '', titre: '[T26-001] - Lire (session 1)', notes: 'lien',
      calendrier: 'Doctorat', debut: '2026-09-08T14:00', fin: '2026-09-08T16:00' },
    { ref: 'T26-001', idx: 1, id: 'ABC', supprimer: true },
  ]);
  new vm.Script(s);
  assert.ok(s.includes('T26-001'));
  assert.ok(s.includes('EKEvent'));
  assert.ok(s.includes('saveEventSpanCommitError'));
  assert.ok(s.includes('removeEventSpanCommitError'));
  assert.ok(s.includes('calendarsForEntityType(0)'));
  assert.ok(s.includes('eventIdentifier'));      // identité stable des événements
  assert.ok(s.includes('SUPPRIME'));
  assert.ok(s.includes('"calendrier":"Doctorat"'));
  assert.ok(!s.includes('EKReminder'));
});

test('genererJXAEvenementsPush : entrée vide reste valide', () => {
  const s = Ariane.genererJXAEvenementsPush();
  new vm.Script(s);
  assert.ok(s.includes('IN.evenements'));
});

test('genererJXAEvenementsReleve : script valide, paires, MANQUANT', () => {
  const s = Ariane.genererJXAEvenementsReleve([{ ref: 'T26-001', idx: 0, id: 'X1' }], 90);
  new vm.Script(s);
  assert.ok(s.includes('X1'));
  assert.ok(s.includes('MANQUANT'));
  assert.ok(s.includes('isoDeDate'));
  assert.ok(s.includes('eventWithIdentifier'));  // relève par identité d'événement
  assert.ok(!s.includes('NOUVEAU'));            // pas d'import d'événements inconnus
});

test('genererJXAEvenementsFond : predicate events, couleur, nom de calendrier quoté', () => {
  const s = Ariane.genererJXAEvenementsFond(
    ['Doctorat - Agenda', 'Doctorat - Agenda', ''], '2026-09-01', '2026-09-30');
  new vm.Script(s);
  assert.ok(s.includes('predicateForEventsWithStartDateEndDateCalendars'));
  assert.ok(s.includes('eventsMatchingPredicate'));
  assert.ok(s.includes('couleurCal'));
  assert.ok(s.includes('"Doctorat - Agenda"'));
  assert.ok(!/"calendriers":\[[^\]]*,""/.test(s));  // vides filtrés
});

test('genererJXAEvenementsFond : fenêtre absente → script valide quand même', () => {
  const s = Ariane.genererJXAEvenementsFond([], '', '');
  new vm.Script(s);
  assert.ok(s.includes('if(!IN.debut'));
});
