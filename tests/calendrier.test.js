const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('parseCreneau : même jour, séparateur tiret', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 14:00-16:00'),
    { debut: '2026-09-08T14:00', fin: '2026-09-08T16:00' });
});

test('parseCreneau : tolère –, —, « à », « / » et H:MM', () => {
  const attendu = { debut: '2026-09-08T09:05', fin: '2026-09-08T10:30' };
  for (const s of ['2026-09-08 9:05–10:30', '2026-09-08 9:05 — 10:30',
                   '2026-09-08 9:05 à 10:30', '2026-09-08 09:05 / 10:30']) {
    assert.deepEqual(Ariane.parseCreneau(s), attendu, s);
  }
});

test('parseCreneau : fin ≤ début même jour → fin le lendemain', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 23:00-01:00'),
    { debut: '2026-09-08T23:00', fin: '2026-09-09T01:00' });
});

test('parseCreneau : passage de minuit explicite', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 22:00 / 2026-09-09 01:30'),
    { debut: '2026-09-08T22:00', fin: '2026-09-09T01:30' });
});

test('parseCreneau : invalides → null', () => {
  for (const s of ['', 'demain', '2026-09-08', '2026-09-08 14:00', null,
                   '2026-13-01 10:00-11:00', '2026-09-08 25:00-26:00']) {
    assert.equal(Ariane.parseCreneau(s), null, JSON.stringify(s));
  }
});

test('formatCreneau : compact même jour, explicite sinon ; aller-retour', () => {
  assert.equal(Ariane.formatCreneau('2026-09-08T14:00', '2026-09-08T16:00'),
    '2026-09-08 14:00-16:00');
  assert.equal(Ariane.formatCreneau('2026-09-08T22:00', '2026-09-09T01:30'),
    '2026-09-08 22:00 / 2026-09-09 01:30');
  for (const s of ['2026-09-08 14:00-16:00', '2026-09-08 22:00 / 2026-09-09 01:30']) {
    const p = Ariane.parseCreneau(s);
    assert.equal(Ariane.formatCreneau(p.debut, p.fin), s);
  }
});

test('creneauxDeTache : liste triée, invalides écartées, brut conservé', () => {
  const l = Ariane.creneauxDeTache({ creneaux: [
    '2026-09-10 09:00-11:00', 'n’importe quoi', '2026-09-08 14:00-16:00'] });
  assert.deepEqual(l.map((c) => c.debut), ['2026-09-08T14:00', '2026-09-10T09:00']);
  assert.equal(l[0].brut, '2026-09-08 14:00-16:00');
  assert.deepEqual(Ariane.creneauxDeTache({}), []);
  assert.deepEqual(Ariane.creneauxDeTache('2026-09-08 14:00-16:00').map((c) => c.debut),
    ['2026-09-08T14:00']);
});

test('CONCEPTS_TACHE / PROPS_GENERIQUES portent creneaux', () => {
  assert.ok(Ariane.CONCEPTS_TACHE.includes('creneaux'));
  assert.ok(Ariane.PROPS_GENERIQUES.some((p) => p.cle === 'creneaux'));
});

const T = (o) => Object.assign(
  { ref: 'T-1', debut: '', echeance: '', heure: '', creneaux: [], jalon: false }, o);

test('evenementsDeTache : un événement par créneau, avec idx/brut', () => {
  const evs = Ariane.evenementsDeTache(T({ debut: '2026-09-01', echeance: '2026-09-30',
    creneaux: ['2026-09-10 09:00-11:00', '2026-09-08 14:00-16:00'] }));
  assert.deepEqual(evs.map((e) => [e.genre, e.debut, e.idx, e.source]), [
    ['horaire', '2026-09-08T14:00', 0, 'creneau'],
    ['horaire', '2026-09-10T09:00', 1, 'creneau'],
  ]);
  assert.equal(evs[0].brut, '2026-09-08 14:00-16:00');
});

test('evenementsDeTache : sans créneau, début+échéance → un jour, borne exclusive', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({ debut: '2026-09-01', echeance: '2026-09-03' })),
    [{ genre: 'jour', debut: '2026-09-01', fin: '2026-09-04', allDay: true, source: 'dates' }]);
});

test('evenementsDeTache : échéance seule + heure → horaire 1 h', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({ echeance: '2026-09-03', heure: '09:30' })),
    [{ genre: 'horaire', debut: '2026-09-03T09:30', fin: '2026-09-03T10:30', allDay: false, source: 'dates' }]);
});

test('evenementsDeTache : échéance seule sans heure / jalon → un jour', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({ echeance: '2026-09-03' })),
    [{ genre: 'jour', debut: '2026-09-03', fin: '2026-09-04', allDay: true, source: 'dates' }]);
  assert.deepEqual(Ariane.evenementsDeTache(T({ echeance: '2026-09-03', jalon: true, heure: '09:00' })),
    [{ genre: 'jour', debut: '2026-09-03', fin: '2026-09-04', allDay: true, source: 'dates' }]);
});

test('evenementsDeTache : rien → []', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({})), []);
});
