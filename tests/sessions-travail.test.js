// Sessions de travail réel (compteur de temps → calendrier) : fonctions pures.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const S = (chemin, debut, fin) => ({ chemin, debut, fin });

test('sessions : même note à moins de cinq minutes → fusionnées', () => {
  const f = Ariane.fusionnerSessions([
    S('a.md', '2026-10-02T09:30:00', '2026-10-02T10:00:00'),
    S('a.md', '2026-10-02T09:00:00', '2026-10-02T09:27:00'),
    S('b.md', '2026-10-02T10:01:00', '2026-10-02T10:20:00'),
    S('a.md', '2026-10-02T10:40:00', '2026-10-02T11:00:00'),
  ], 5);
  assert.deepEqual(f, [
    S('a.md', '2026-10-02T09:00:00', '2026-10-02T10:00:00'),
    S('b.md', '2026-10-02T10:01:00', '2026-10-02T10:20:00'),
    S('a.md', '2026-10-02T10:40:00', '2026-10-02T11:00:00'),
  ]);
});

test('sessions : une note intercalée coupe la fusion, une session illisible tombe', () => {
  const f = Ariane.fusionnerSessions([
    S('a.md', '2026-10-02T09:00:00', '2026-10-02T09:10:00'),
    S('b.md', '2026-10-02T09:11:00', '2026-10-02T09:12:00'),
    S('a.md', '2026-10-02T09:13:00', '2026-10-02T09:20:00'),
    S('a.md', 'n’importe', '2026-10-02T09:20:00'),
  ], 5);
  assert.equal(f.length, 3);
});

test('jauge : seul le temps dans le créneau et dans les notes de la tâche compte', () => {
  const sessions = [
    S('T012.md', '2026-10-02T08:30:00', '2026-10-02T09:30:00'),
    S('chapitre.md', '2026-10-02T09:45:00', '2026-10-02T10:30:00'),
    S('autre.md', '2026-10-02T09:30:00', '2026-10-02T10:00:00'),
  ];
  assert.equal(Ariane.minutesTravaillees('2026-10-02T09:00', '2026-10-02T11:00', sessions,
    ['T012.md', 'chapitre.md']), 75);
  assert.equal(Ariane.minutesTravaillees('2026-10-02T09:00', '2026-10-02T11:00', sessions, []), 0);
});

test('jauge : des sessions qui se recouvrent ne comptent qu’une fois', () => {
  const sessions = [
    S('a.md', '2026-10-02T09:00:00', '2026-10-02T09:40:00'),
    S('b.md', '2026-10-02T09:20:00', '2026-10-02T10:00:00'),
  ];
  assert.equal(Ariane.minutesTravaillees('2026-10-02T09:00', '2026-10-02T10:00', sessions,
    ['a.md', 'b.md']), 60);
});

test('liseré : rogné à minuit, le bruit de moins de trois minutes écarté', () => {
  const l = Ariane.sessionsDuJour('2026-10-02', [
    S('a.md', '2026-10-01T23:30:00', '2026-10-02T00:30:00'),
    S('b.md', '2026-10-02T09:00:00', '2026-10-02T09:02:00'),
    S('c.md', '2026-10-02T14:00:00', '2026-10-02T15:15:00'),
  ], 3);
  assert.deepEqual(l.map((x) => [x.chemin, x.a, x.b]), [['a.md', 0, 30], ['c.md', 840, 915]]);
});

test('instantSession : heure locale à la seconde', () => {
  assert.equal(Ariane.instantSession(new Date(2026, 9, 2, 9, 5, 7)), '2026-10-02T09:05:07');
});
