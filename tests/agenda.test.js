const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const Ariane = require('./obsidian-factice.js');

// --- SP-4 : générateurs JXA EventKit (EKEvent, entité 0) ---

test('genererJXAEvenementsPush : script valide, save/remove, données embarquées', () => {
  const s = Ariane.genererJXAEvenementsPush([
    { ref: 'T26-001', idx: 0, id: '', titre: '[T26-001] - Lire (session 1)', notes: 'extrait',
      lien: 'obsidian://open?vault=V&file=T26-001',
      calendrier: 'Doctorat', debut: '2026-09-08T14:00', fin: '2026-09-08T16:00' },
    { ref: 'T26-001', idx: 1, id: 'ABC', supprimer: true },
  ]);
  new vm.Script(s);
  assert.ok(s.includes('T26-001'));
  assert.ok(s.includes('e.URL='));                 // lien dans le champ URL de l'événement (casse ObjC exacte)
  assert.ok(s.includes('NSURL.URLWithString'));
  assert.ok(s.includes('__ACCES__'));              // court-circuit si accès refusé
  assert.ok(s.includes('eventsMatchingPredicate')); // anti-doublon par titre/fenêtre
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

test('genererJXAEvenementsFond : predicate events, $(arr), nom de calendrier quoté', () => {
  const s = Ariane.genererJXAEvenementsFond(
    ['Doctorat - Agenda', 'Doctorat - Agenda', ''], '2026-09-01', '2026-09-30');
  new vm.Script(s);
  assert.ok(s.includes('predicateForEventsWithStartDateEndDateCalendars'));
  assert.ok(s.includes('eventsMatchingPredicate'));
  assert.ok(s.includes('$(arr)'));          // tableau ponté, pas null (SIGBUS)
  assert.ok(!s.includes('couleurCal'));     // extraction couleur retirée (crash JXA)
  assert.ok(s.includes('"Doctorat - Agenda"'));
  assert.ok(!/"calendriers":\[[^\]]*,""/.test(s));  // vides filtrés
  assert.ok(s.includes('__ACCES__'));
});

test('parseCouleursAgendas : « nom \\t r,g,b » 16 bits → #rrggbb', () => {
  const t = 'Personnel\t64633,3275,17438\nSessions de lecture\t65535,49319,0\nMauvaise ligne\n';
  const c = Ariane.parseCouleursAgendas(t);
  assert.equal(c['Personnel'], '#fb0d44');
  assert.equal(c['Sessions de lecture'], '#ffc000');
  assert.equal('Mauvaise ligne' in c, false);
  assert.deepEqual(Ariane.parseCouleursAgendas(''), {});
});

test('genererASCouleursAgendas : AppleScript (pas JXA), tell Calendar', () => {
  const s = Ariane.genererASCouleursAgendas();
  assert.ok(s.includes('tell application "Calendar"'));
  assert.ok(s.includes('color of c'));
  assert.ok(!s.includes('ObjC'));
});

test('genererJXAEvenementsFond : fenêtre absente → script valide quand même', () => {
  const s = Ariane.genererJXAEvenementsFond([], '', '');
  new vm.Script(s);
  assert.ok(s.includes('if(!IN.debut'));
  assert.ok(s.includes('__ACCES__'));
});

test('genererJXAEvenementsMenage : script valide, supprime les non-reliés « à nous »', () => {
  const s = Ariane.genererJXAEvenementsMenage(['Doctorat - Agenda'], { 'ID-OK': 1 }, ['T019'], 120);
  new vm.Script(s);
  assert.ok(s.includes('__ACCES__'));
  assert.ok(s.includes('removeEventSpanCommitError'));
  assert.ok(s.includes('obsidian://'));      // repérage par l'URL de la note
  assert.ok(s.includes('"ID-OK":1'));        // liens légitimes préservés
  assert.ok(s.includes('"refs":["T019"]'));
  assert.ok(s.includes('SUPPRIME'));
});

test('genererJXAAgendas : script valide, statut d\'accès + liste des calendriers', () => {
  const s = Ariane.genererJXAAgendas();
  new vm.Script(s);
  assert.ok(s.includes('statutAcces'));
  assert.ok(s.includes('authorizationStatusForEntityType'));
  assert.ok(s.includes('calendriers'));
  assert.ok(s.includes('defaultCalendarForNewEvents'));
});
