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

test('creneauxDeTache : dédoublonnage sur début|fin, formes équivalentes fusionnées', () => {
  const l = Ariane.creneauxDeTache([
    '2026-09-08 14:00-16:00',
    '2026-09-08 14:00 / 2026-09-08 16:00',
    '2026-09-10 09:00-11:00']);
  assert.equal(l.length, 2);
  assert.deepEqual(l.map((c) => c.debut), ['2026-09-08T14:00', '2026-09-10T09:00']);
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

test('statsCreneaux : compte, total, passé/futur, premier/dernier', () => {
  const s = Ariane.statsCreneaux(
    ['2026-09-08 14:00-16:00', '2026-09-10 09:00-11:00', '2026-09-20 08:00-12:00'],
    '2026-09-12T00:00');
  assert.equal(s.nb, 3);
  assert.equal(s.totalMin, 120 + 120 + 240);
  assert.equal(s.passeMin, 240);          // les deux premiers
  assert.equal(s.futurMin, 240);          // le dernier
  assert.equal(s.premier, '2026-09-08T14:00');
  assert.equal(s.dernier, '2026-09-20T12:00');
});

test('statsCreneaux : créneau dupliqué compté une seule fois', () => {
  const s = Ariane.statsCreneaux(
    ['2026-09-08 14:00-16:00', '2026-09-08 14:00-16:00'], '2026-09-01T00:00');
  assert.equal(s.nb, 1);
  assert.equal(s.totalMin, 120);
});

test('statsCreneaux : liste vide', () => {
  const s = Ariane.statsCreneaux([], '2026-09-12T00:00');
  assert.deepEqual([s.nb, s.totalMin, s.passeMin, s.futurMin], [0, 0, 0, 0]);
});

test('blocCreneaux : markdown stable, contient le résumé', () => {
  const cr = ['2026-09-08 14:00-16:00', '2026-09-10 09:00-11:00'];
  const a = Ariane.blocCreneaux(cr, Ariane.statsCreneaux(cr, '2026-09-01T00:00'));
  const b = Ariane.blocCreneaux(cr, Ariane.statsCreneaux(cr, '2026-09-01T00:00'));
  assert.equal(a, b);
  assert.ok(a.startsWith('## Créneaux'));
  assert.ok(/2 sessions/.test(a));
  assert.ok(/4 h 00/.test(a));            // total planifié
});

test('blocCreneaux : aucune ligne → chaîne vide', () => {
  assert.equal(Ariane.blocCreneaux([], Ariane.statsCreneaux([], '2026-09-01T00:00')), '');
});

test('grilleMois : 6×7, lundi en tête, contient le mois', () => {
  const g = Ariane.grilleMois('2026-09-15');
  assert.equal(g.semaines.length, 6);
  assert.ok(g.semaines.every((s) => s.length === 7));
  assert.equal(g.semaines[0][0], '2026-08-31'); // 1er sept. = mardi
  assert.ok(g.semaines.flat().includes('2026-09-15'));
  assert.equal(g.moisDebut, '2026-09-01');
  assert.equal(g.moisFin, '2026-09-30');
});

test('grilleSemaine : lundi + 7 jours', () => {
  const g = Ariane.grilleSemaine('2026-09-03');
  assert.equal(g.lundi, '2026-08-31');
  assert.equal(g.jours.length, 7);
  assert.equal(g.jours[6], '2026-09-06');
});

test('moisSuivantN : avance / recule sur l’année', () => {
  assert.equal(Ariane.moisSuivantN('2026-11-10', 3), '2027-02-01');
  assert.equal(Ariane.moisSuivantN('2026-02-10', -3), '2025-11-01');
});

test('creneauDepuisDrop : yRel → heure calée 15 min, +1 h', () => {
  assert.deepEqual(Ariane.creneauDepuisDrop({
    yRel: 130, hauteurHeure: 40, heureDebut: 8, jourISO: '2026-09-08' }),
    { debut: '2026-09-08T11:15', fin: '2026-09-08T12:15' });
});

test('creneauDepuisDrop : durée réglable, minuit franchi', () => {
  assert.deepEqual(Ariane.creneauDepuisDrop({
    yRel: 15.5 * 40, hauteurHeure: 40, heureDebut: 8, jourISO: '2026-09-08', dureeMin: 90 }),
    { debut: '2026-09-08T23:30', fin: '2026-09-09T01:00' });
});

test('creneauDepuisDrop : jour invalide → null', () => {
  assert.equal(Ariane.creneauDepuisDrop({ yRel: 40, hauteurHeure: 40, heureDebut: 8, jourISO: 'x' }), null);
});
