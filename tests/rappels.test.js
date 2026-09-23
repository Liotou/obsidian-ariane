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
  assert.ok(s.includes('EKEventStore'));            // moteur EventKit
  assert.ok(s.includes('saveReminderCommitError'));
  assert.ok(s.includes('function run()'));
});

test('genererJXAListes : script JS valide (EventKit)', () => {
  const s = Ariane.genererJXAListes();
  new vm.Script(s);
  assert.ok(s.includes('calendarsForEntityType'));
});

test('genererJXAReleve : script JS valide, paires + listes surveillées', () => {
  const s = Ariane.genererJXAReleve(
    [{ ref: 'T26-001', id: 'x-apple-reminder://A' }],
    ['Doctorat - Tâches', 'Doctorat - Tâches', '']);
  new vm.Script(s);
  assert.ok(s.includes('x-apple-reminder://A'));
  assert.ok(s.includes('"Doctorat - Tâches"'));
  assert.ok(!/"listes":\[[^\]]*,""/.test(s));  // vides filtrés
  assert.ok(s.includes('NOUVEAU'));            // détection des rappels ajoutés à la main
});

test('genererJXARappels : entrée vide reste un script valide', () => {
  const s = Ariane.genererJXARappels();
  new vm.Script(s);
  assert.ok(s.includes('IN.taches'));
});

// --- SP-4 : refacto du préambule EventKit (approche B) ---

test('_jxaEK : le préambule Rappels garde tous ses helpers après la refacto', () => {
  const s = Ariane._jxaEK();
  new vm.Script(s);
  for (const fn of ['function acces(', 'function listes(', 'function listeParNom(',
                    'function remById(', 'function fetchListe(', 'function comps(',
                    'function isoDe(', 'function norm(', 'function net(', 'function titre(',
                    'function pompe(']) {
    assert.ok(s.includes(fn), 'helper manquant : ' + fn);
  }
  assert.ok(s.includes('requestFullAccessToRemindersWithCompletion'));
  assert.ok(s.includes('calendarsForEntityType(1)'));
  assert.ok(s.includes('EKReminder'));
  assert.ok(s.includes('predicateForRemindersInCalendars'));
});

test('_jxaEKEvenements : préambule Événements valide, helpers propres à EKEvent', () => {
  const s = Ariane._jxaEKEvenements();
  new vm.Script(s);
  for (const fn of ['function acces(', 'function cals(', 'function calParNom(',
                    'function evById(', 'function evId(', 'function fmtDate(',
                    'function statutAcces(', 'function isoDeDate(',
                    'function comps(', 'function isoDe(']) {
    assert.ok(s.includes(fn), 'helper manquant : ' + fn);
  }
  assert.ok(s.includes('requestFullAccessToEventsWithCompletion'));
  assert.ok(s.includes('calendarsForEntityType(0)'));
  assert.ok(s.includes('EKEvent'));
  assert.ok(s.includes('defaultCalendarForNewEvents'));
  assert.ok(s.includes('Number($.EKEventStore.authorizationStatusForEntityType'));
  assert.ok(!s.includes('EKReminder'));
  assert.ok(!s.includes('couleurCal'));   // couleur relevée en AppleScript (SIGBUS en JXA)
  assert.ok(!s.includes('AppKit'));
});

test('_jxaEKCommun : ni accès ni entité, juste les utilitaires partagés', () => {
  const s = Ariane._jxaEKCommun();
  new vm.Script(s);
  assert.ok(s.includes('function comps('));
  assert.ok(s.includes('function isoDe('));
  assert.ok(!s.includes('function acces('));
  assert.ok(!s.includes('calendarsForEntityType'));
});

test('tâche abandonnée : son rappel se supprime, la terminée se coche', () => {
  const r = {};
  assert.equal(Ariane.rappelASupprimer('abandonnée', 'x-apple://A', r), true);
  assert.equal(Ariane.rappelASupprimer('terminée', 'x-apple://A', r), false,
    'une tâche terminée reste dans Rappels, cochée');
  assert.equal(Ariane.rappelASupprimer('à faire', 'x-apple://A', r), false);
  assert.equal(Ariane.rappelASupprimer('abandonnée', '', r), false, 'rien à supprimer sans rappel');
  assert.equal(Ariane.rappelASupprimer('abandonnée', '   ', r), false);
  assert.equal(Ariane.rappelASupprimer('abandonnée', 'x', { rappelsSupprimerAbandonnees: false }), false,
    'le réglage coupé laisse le rappel en place');
  assert.equal(Ariane.rappelASupprimer('abandonnée', 'x', undefined), true, 'actif par défaut');
});

test('genererJXARappels : une suppression demandée retire le rappel et le dit', () => {
  const s = Ariane.genererJXARappels([
    { ref: 'T26-009', id: 'x-apple-reminder://DEAD', supprimer: true },
    { ref: 'T26-010', id: '', titre: '[T26-010] - Vivante', notes: '', liste: 'Doctorat',
      echeance: '2026-10-02', heure: '', priorite: '', termine: false },
  ]);
  new vm.Script(s);
  assert.ok(s.includes('"supprimer":true'));
  assert.ok(s.includes('removeReminderCommitError(rs'), 'la branche de suppression est là');
  assert.ok(s.includes('SUPPRIME'), 'et elle rend compte de ce qu\'elle a fait');
  // La tâche vivante suit le chemin normal, dans le même script.
  assert.ok(s.includes('saveReminderCommitError'));
  assert.ok(s.includes('T26-010'));
});
