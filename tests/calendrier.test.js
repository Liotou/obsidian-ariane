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

// --- Task 1 : statiques purs de la refonte calendrier ---

test('comparerMulti : critère unique ASC / DESC, vide en dernier', () => {
  assert.ok(Ariane.comparerMulti([{ v: 'b', s: 1 }], [{ v: 'a', s: 1 }]) > 0);
  assert.ok(Ariane.comparerMulti([{ v: 'b', s: -1 }], [{ v: 'a', s: -1 }]) < 0);
  assert.ok(Ariane.comparerMulti([{ v: '', s: 1 }], [{ v: 'a', s: 1 }]) > 0);
  assert.equal(Ariane.comparerMulti([{ v: 'a', s: 1 }], [{ v: 'a', s: 1 }]), 0);
});

test('comparerMulti : le 2e critère départage le 1er égal', () => {
  const a = [{ v: 'x', s: 1 }, { v: '2', s: 1 }];
  const b = [{ v: 'x', s: 1 }, { v: '10', s: 1 }];
  assert.ok(Ariane.comparerMulti(a, b) < 0); // numeric: 2 < 10
});

test('comparerEmpilement : tout-le-jour avant horaire, puis heure, puis ref', () => {
  const jour = { ev: { allDay: true, debut: '2026-09-08' }, t: { ref: 'T-002' } };
  const tot = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-001' } };
  assert.ok(Ariane.comparerEmpilement(jour, tot) < 0);
  const a = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-002' } };
  const b = { ev: { allDay: false, debut: '2026-09-08T11:00' }, t: { ref: 'T-001' } };
  assert.ok(Ariane.comparerEmpilement(a, b) < 0);
  const m = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-002' } };
  const n = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-001' } };
  assert.ok(Ariane.comparerEmpilement(m, n) > 0); // T-002 après T-001
});

test('comparerEmpilement : respecte le tri natif (_multi) avant la ref', () => {
  const a = { ev: { allDay: false, debut: '2026-09-08T09:00' },
    t: { ref: 'T-001', _multi: [{ v: 'z', s: 1 }] } };
  const b = { ev: { allDay: false, debut: '2026-09-08T09:00' },
    t: { ref: 'T-999', _multi: [{ v: 'a', s: 1 }] } };
  assert.ok(Ariane.comparerEmpilement(a, b) > 0); // 'z' après 'a' malgré T-001 < T-999
});

test('ancreCarrousel : mois ±1, semaine ±1, sens 0', () => {
  assert.equal(Ariane.ancreCarrousel('2026-12-15', 'mois', 1), '2027-01-01');
  assert.equal(Ariane.ancreCarrousel('2026-01-15', 'mois', -1), '2025-12-01');
  assert.equal(Ariane.ancreCarrousel('2026-09-01', 'semaine', 1), '2026-09-08');
  assert.equal(Ariane.ancreCarrousel('2026-09-01', 'semaine', -1), '2026-08-25');
  assert.equal(Ariane.ancreCarrousel('2026-09-01', 'mois', 0), '2026-09-01');
});

test('jourSeme : jourSel > aujourd-dans-période > premier jour', () => {
  assert.equal(Ariane.jourSeme('2026-09-10', '2026-09-01', '2026-09-30', '2026-09-15'), '2026-09-10');
  assert.equal(Ariane.jourSeme('', '2026-09-01', '2026-09-30', '2026-09-15'), '2026-09-15');
  assert.equal(Ariane.jourSeme('', '2026-10-01', '2026-10-31', '2026-09-15'), '2026-10-01');
  assert.equal(Ariane.jourSeme('', '2026-09-01', '2026-09-30', '2026-09-01'), '2026-09-01');
});

test('lignesProprietes : écarte file*, vide, doublon du titre ; garde l\'ordre ; coupe', () => {
  const paires = [
    { cle: 'file.name', nom: 'Nom', valeur: 'T-001' },
    { cle: 'note.intitule', nom: 'Intitulé', valeur: 'Rédiger le rapport' },
    { cle: 'note.statut', nom: 'Statut', valeur: 'en cours' },
    { cle: 'note.priorite', nom: 'Priorité', valeur: '' },
    { cle: 'note.famille', nom: 'Famille', valeur: 'Édition' },
  ];
  assert.deepEqual(
    Ariane.lignesProprietes(paires, 'Rédiger le rapport', 5),
    [{ nom: 'Statut', valeur: 'en cours' }, { nom: 'Famille', valeur: 'Édition' }]);
  assert.deepEqual(Ariane.lignesProprietes(paires, 'Rédiger le rapport', 1),
    [{ nom: 'Statut', valeur: 'en cours' }]);
  assert.deepEqual(Ariane.lignesProprietes(paires, 'x', 0), []);
});

test('replierListe : sous le plafond → tout ; au-dessus → coupé + reste', () => {
  assert.deepEqual(Ariane.replierListe([1, 2], 3), { montres: [1, 2], reste: 0 });
  assert.deepEqual(Ariane.replierListe([1, 2, 3, 4, 5], 2), { montres: [1, 2], reste: 3 });
  assert.deepEqual(Ariane.replierListe([], 2), { montres: [], reste: 0 });
  assert.deepEqual(Ariane.replierListe([1, 2, 3], 0), { montres: [1, 2, 3], reste: 0 });
});

// --- P5 : répartition en colonnes des blocs horaires qui se chevauchent ---

test('disposerBlocsJour : liste vide / un seul bloc', () => {
  assert.deepEqual(Ariane.disposerBlocsJour([]), []);
  assert.deepEqual(Ariane.disposerBlocsJour([{ deb: 540, fin: 600 }]),
    [{ col: 0, ncols: 1 }]);
});

test('disposerBlocsJour : deux blocs disjoints → même colonne', () => {
  assert.deepEqual(
    Ariane.disposerBlocsJour([{ deb: 540, fin: 600 }, { deb: 600, fin: 660 }]),
    [{ col: 0, ncols: 1 }, { col: 0, ncols: 1 }]);
});

test('disposerBlocsJour : deux blocs qui se chevauchent → deux colonnes', () => {
  assert.deepEqual(
    Ariane.disposerBlocsJour([{ deb: 540, fin: 660 }, { deb: 600, fin: 720 }]),
    [{ col: 0, ncols: 2 }, { col: 1, ncols: 2 }]);
});

test('disposerBlocsJour : chevauchement triple → trois colonnes', () => {
  const r = Ariane.disposerBlocsJour([
    { deb: 540, fin: 720 }, { deb: 570, fin: 690 }, { deb: 600, fin: 780 }]);
  assert.deepEqual(r.map((x) => x.col).sort(), [0, 1, 2]);
  assert.ok(r.every((x) => x.ncols === 3));
});

test('disposerBlocsJour : escalier A∩B, B∩C, A∌C → groupe de 3, 2 colonnes', () => {
  // A 09:00-10:00 (540-600), B 09:30-10:30 (570-630), C 10:00-11:00 (600-660)
  const r = Ariane.disposerBlocsJour([
    { deb: 540, fin: 600 }, { deb: 570, fin: 630 }, { deb: 600, fin: 660 }]);
  assert.deepEqual(r, [
    { col: 0, ncols: 2 }, { col: 1, ncols: 2 }, { col: 0, ncols: 2 }]);
});

test('disposerBlocsJour : groupe puis bloc disjoint → le second groupe repart à 0', () => {
  const r = Ariane.disposerBlocsJour([
    { deb: 540, fin: 660 }, { deb: 600, fin: 720 }, { deb: 800, fin: 860 }]);
  assert.deepEqual(r, [
    { col: 0, ncols: 2 }, { col: 1, ncols: 2 }, { col: 0, ncols: 1 }]);
});
