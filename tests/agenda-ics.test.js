// Agenda iCal (Google Agenda) en fond : lecture, répétitions, fuseaux.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

process.env.TZ = process.env.TZ || 'Europe/Paris';

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'BEGIN:VEVENT', 'DTSTART:20261020T080000Z', 'DTEND:20261020T093000Z', 'UID:simple@google.com',
  'SUMMARY:Séminaire\\, salle B', 'LOCATION:Dauphine', 'DESCRIPTION:Ligne 1\\nLigne 2', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261022', 'DTEND;VALUE=DATE:20261024', 'UID:jour@google.com', 'SUMMARY:Colloque', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Paris:20261019T140000', 'DTEND;TZID=Europe/Paris:20261019T150000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=6', 'EXDATE;TZID=Europe/Paris:20261022T140000', 'UID:hebdo@google.com',
  'SUMMARY:Atelier', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Paris:20261027T160000', 'DTEND;TZID=Europe/Paris:20261027T170000',
  'RECURRENCE-ID;TZID=Europe/Paris:20261026T140000', 'UID:hebdo@google.com', 'SUMMARY:Atelier (déplacé)', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261021T100000Z', 'DTEND:20261021T110000Z', 'UID:annule@google.com', 'STATUS:CANCELLED',
  'SUMMARY:Annulé', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('lireIcs : propriétés, texte échappé, lignes continuées', () => {
  const l = Ariane.lireIcs('BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261020T080000Z\r\nSUMMARY:Une très longue\r\n  ligne\r\nEND:VEVENT');
  assert.equal(l[0].titre, 'Une très longue ligne');
  const e = Ariane.lireIcs(ICS)[0];
  assert.equal(e.titre, 'Séminaire, salle B');
  assert.equal(e.notes, 'Ligne 1\nLigne 2');
});

test('evenementsIcs : heures locales, journée entière, répétitions, exception, occurrence déplacée, annulation', () => {
  const ev = Ariane.evenementsIcs(ICS, '2026-10-19', '2026-11-01', { nom: 'Doctorat', couleur: '#3366cc' });
  const t = (titre) => ev.filter((e) => e.titre === titre);
  // 08:00 UTC = 10:00 à Paris (heure d'été jusqu'au 25 octobre).
  assert.deepEqual([t('Séminaire, salle B')[0].debut, t('Séminaire, salle B')[0].fin], ['2026-10-20T10:00', '2026-10-20T11:30']);
  const col = t('Colloque')[0];
  assert.equal(col.allDay, true);
  assert.deepEqual([col.debut, col.fin], ['2026-10-22T00:00', '2026-10-24T00:00']);
  // Lundis et jeudis, 6 fois à partir du 19 : 19, 22 (exclu), 26 (déplacé), 29, 2 nov., 5 nov. ;
  // dans la fenêtre : 19, 29 ; le 26 devient le 27 à 16 h.
  assert.deepEqual(t('Atelier').map((e) => e.debut), ['2026-10-19T14:00', '2026-10-29T14:00']);
  assert.deepEqual(t('Atelier (déplacé)').map((e) => e.debut), ['2026-10-27T16:00']);
  assert.equal(t('Annulé').length, 0);
  assert.ok(ev.every((e) => e.source === 'ics' && e.calendrier === 'Doctorat' && e.couleur === '#3366cc'));
});

test('repetitionsIcs : mensuelle au deuxième mardi, annuelle, jusqu’à une date', () => {
  const d = Ariane.dateIcs('20261013T090000', {});
  const m = Ariane.repetitionsIcs(d, 'FREQ=MONTHLY;BYDAY=2TU;COUNT=3', Date.UTC(2030, 0, 1));
  assert.deepEqual(m.map((x) => x.mo + '/' + x.d), ['10/13', '11/10', '12/8']);
  // Le 29 février ne revient que les années bissextiles.
  const a = Ariane.repetitionsIcs(Ariane.dateIcs('20280229', { VALUE: 'DATE' }), 'FREQ=YEARLY;UNTIL=20370101', Date.UTC(2040, 0, 1));
  assert.deepEqual(a.map((x) => x.y), [2028, 2032, 2036]);
  const u = Ariane.repetitionsIcs(Ariane.dateIcs('20261019T090000', {}), 'FREQ=DAILY;UNTIL=20261021T235959Z', Date.UTC(2030, 0, 1));
  assert.equal(u.length, 3);
});
