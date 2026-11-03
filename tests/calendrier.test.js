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
  assert.ok(a.startsWith('## Sessions'));
  assert.ok(/Commentaire/.test(a));       // colonne de commentaires
  assert.ok(/2 sessions/.test(a));
  assert.ok(/4 h 00/.test(a));            // total planifié
});

test('commentaires : écrits dans le bloc puis relus (clé mois-jour + heure)', () => {
  const cr = ['2026-09-08 14:00-16:00', '2026-09-10 09:00-11:00'];
  const bloc = Ariane.blocCreneaux(cr, null, {
    [Ariane.cleCommentaire(cr[0])]: 'Préparer les slides | relire\nversion 2',
  });
  const texte = ['<!-- ariane:creneaux -->', bloc, '<!-- /ariane:creneaux -->'].join('\n');
  const coms = Ariane.commentairesDuBloc(texte);
  assert.deepEqual(coms, { '09-08T14:00': 'Préparer les slides | relire\nversion 2' });
  // clé sans l'année : la même session replanifiée l'an suivant garde son commentaire
  assert.equal(Ariane.cleCommentaire('2027-09-08 14:00-16:00'), '09-08T14:00');
});

test('séance : sous-tâches lues et réécrites dans le commentaire du créneau', () => {
  const com = Ariane.commentaireDeSeance('Avancer le plan\ndeux idées', [
    { ref: 'T070', intitule: 'Relire [la] partie | 2' }, { ref: 'T071', intitule: '' },
  ]);
  assert.equal(com, 'Avancer le plan\ndeux idées\n- [[T070|Relire la partie 2]]\n- [[T071]]');
  assert.deepEqual(Ariane.seanceDuCommentaire(com), { texte: 'Avancer le plan\ndeux idées', refs: ['T070', 'T071'] });
  // Une case cochée à la main, un doublon, un lien dans le texte : seuls les
  // liens seuls sur leur ligne sont des sous-tâches.
  assert.deepEqual(Ariane.seanceDuCommentaire('Voir [[T080]] avant\n- [x] [[T070|a]]\n- [[T070]]'),
    { texte: 'Voir [[T080]] avant', refs: ['T070'] });
  assert.equal(Ariane.commentaireDeSeance('', []), '');
  // Aller-retour par le tableau « Sessions » (barres et retours échappés).
  const cr = ['2026-11-03 09:00-11:00'];
  const bloc = Ariane.blocCreneaux(cr, null, { [Ariane.cleCommentaire(cr[0])]: com });
  const relu = Ariane.commentairesDuBloc(['<!-- ariane:creneaux -->', bloc, '<!-- /ariane:creneaux -->'].join('\n'));
  assert.deepEqual(Ariane.seanceDuCommentaire(relu['11-03T09:00']).refs, ['T070', 'T071']);
});

test('séance : glisser pour retenir, réordonner et relâcher les sous-tâches', () => {
  const M = Ariane._test.ModaleSeance;
  const m = Object.create(M.prototype);
  Object.assign(m, { retenues: ['A', 'B', 'C'], modifie: false, _dessiner() {} });
  m._retenir('D', 1);
  assert.deepEqual(m.retenues, ['A', 'D', 'B', 'C'], 'lâchée au deuxième rang');
  m._retenir('A', 3);
  assert.deepEqual(m.retenues, ['D', 'B', 'A', 'C'], 'descendue : le rang tient compte de son retrait');
  m._retenir('C', 0);
  assert.deepEqual(m.retenues, ['C', 'D', 'B', 'A'], 'remontée en tête');
  m._retenir('E', -1);
  assert.deepEqual(m.retenues, ['C', 'D', 'B', 'A', 'E'], 'sans rang : à la fin');
  m._relacher('D');
  assert.deepEqual(m.retenues, ['C', 'B', 'A', 'E']);
  assert.ok(m.modifie);
});

test('séance en langage naturel : la proposition de l’IA rendue sûre', () => {
  const filles = [
    { ref: 'T043', intitule: 'Récupérer la liste des étudiants du TD' },
    { ref: 'T044', intitule: 'Envoyer numéros de groupe et liens Mural aux étudiants' },
  ];
  const p = Ariane.propositionSeance({
    retenir: ['T043', 'T999', 'T043'],
    creer: [{ titre: '  Préparer le support du TD. ' }, 'Envoyer numéros de groupe et liens Mural aux étudiants',
      { titre: 'préparer le support du td' }, { titre: '' }],
  }, filles);
  assert.deepEqual(p, {
    retenir: ['T043', 'T044'],           // inconnue écartée, doublon fondu, intitulé repris reconnu
    creer: [{ titre: 'Préparer le support du TD' }],
  });
  assert.deepEqual(Ariane.propositionSeance(['Relire le plan'], filles), { retenir: [], creer: [{ titre: 'Relire le plan' }] });
  assert.deepEqual(Ariane.propositionSeance(null, filles), { retenir: [], creer: [] });
  // L'invite donne les filles avec leur référence et leur état.
  const g = Object.create(Ariane.prototype);
  const inv = g.promptSeance({ ref: 'T040', intitule: 'Préparer les cours' },
    [{ ref: 'T043', intitule: 'Récupérer la liste', faite: true }], 'reprendre la liste');
  assert.match(inv, /T040 « Préparer les cours »/);
  assert.match(inv, /- T043 :: Récupérer la liste :: faite/);
  assert.match(inv, /reprendre la liste$/);
});

test('jauge : le travail sur les sous-tâches compte pour la mère', () => {
  const taches = [
    { ref: 'T1' }, { ref: 'T2', parent: '[[T1]]' }, { ref: 'T3', parent: '[[T2]]' },
    { ref: 'T4', parent: '[[T9]]' }, { ref: 'T5', parent: '[[T3]]' }, { ref: 'T9', parent: '[[T4]]' },
  ];
  assert.deepEqual(Ariane.descendantesDe('T1', taches), ['T2', 'T3', 'T5']);
  assert.deepEqual(Ariane.descendantesDe('T4', taches), ['T9'], 'une boucle ne tourne pas sans fin');
  assert.deepEqual(Ariane.descendantesDe('T5', taches), []);
  // Vingt minutes sur la note d'une fille, dans le créneau de la mère.
  const sessions = [{ chemin: 'T/T2.md', debut: '2026-11-03T10:50', fin: '2026-11-03T11:10' }];
  assert.equal(Ariane.minutesFaitesCreneau('2026-11-03T10:45', '2026-11-03T12:00', sessions, ['T/T1.md']), 0);
  assert.equal(Ariane.minutesFaitesCreneau('2026-11-03T10:45', '2026-11-03T12:00', sessions, ['T/T1.md', 'T/T2.md']), 20);
});

test('barre d’état : la bulle retrouve le commentaire du créneau en cours', async () => {
  const cr = ['2026-09-08 14:00-16:00', '2026-09-10 09:00-11:00'];
  const bloc = Ariane.blocCreneaux(cr, null, { [Ariane.cleCommentaire(cr[1])]: 'Relire le chapitre 2\npuis les notes' });
  const texte = ['<!-- ariane:creneaux -->', bloc, '<!-- /ariane:creneaux -->'].join('\n');
  const g = Object.create(Ariane.prototype);
  g.app = { vault: { cachedRead: async () => texte } };
  const tache = { fichier: { path: 'T.md' } };
  const [c1, c2] = Ariane.creneauxDeTache(cr).map((c) => ({ tache, debut: c.debut, fin: c.fin, enCours: true }));
  assert.equal(await g._commentaireDuCreneau(c2), 'Relire le chapitre 2\npuis les notes');
  assert.equal(await g._commentaireDuCreneau(c1), '');
  assert.equal(await g._commentaireDuCreneau({ tache: {}, debut: c1.debut }), '');
});

test('commentaires : ancien bloc à 4 colonnes → aucune clé, session supprimée → rien', () => {
  const ancien = ['<!-- ariane:creneaux -->', '## Créneaux', '',
    '| Session | Date | Heures | Durée |', '|---|---|---|---|',
    '| 1 | mar. 8 sept. | 14:00 – 16:00 | 2 h 00 |', '', '**1 session**',
    '<!-- /ariane:creneaux -->'].join('\n');
  assert.deepEqual(Ariane.commentairesDuBloc(ancien), {});
  // Un commentaire dont la session n'existe plus ne se rend pas dans le bloc.
  const cr = ['2026-09-10 09:00-11:00'];
  const bloc = Ariane.blocCreneaux(cr, null, { '09-08T14:00': 'orphelin' });
  assert.ok(!/orphelin/.test(bloc));
});

test('blocCreneaux : aucune ligne → chaîne vide', () => {
  assert.equal(Ariane.blocCreneaux([], Ariane.statsCreneaux([], '2026-09-01T00:00')), '');
});

test('hierarchiesTaches : chaîne de mères racine → tâche, arbre de filles', () => {
  const t = (ref, parent) => ({ ref, parent });
  const h = Ariane.hierarchiesTaches([
    t('R', ''), t('M', '[[R]]'), t('A', '[[M]]'), t('B', '[[M]]'), t('F', '[[A]]'),
  ]);
  assert.deepEqual(h.meres.get('A'), ['R', 'M', 'A']);
  assert.deepEqual(h.meres.get('R'), ['R']);
  assert.deepEqual(h.filles.get('M').map((x) => x.ref), ['A', 'B']);
  assert.deepEqual(h.filles.get('A')[0].ref, 'F');
  // sous-arbre complet depuis la racine : une entrée par tâche, en profondeur
  assert.deepEqual(h.filles.get('R')[0].filles.map((x) => x.ref), ['A', 'B']);
});

test('hierarchiesTaches : parent inconnu, auto-parent, cycle coupé', () => {
  const t = (ref, parent) => ({ ref, parent });
  const h = Ariane.hierarchiesTaches([
    t('X', '[[Fantome]]'), t('Y', '[[Y]]'), t('P', '[[Q]]'), t('Q', '[[P]]'),
  ]);
  assert.deepEqual(h.meres.get('X'), ['X']);          // parent inconnu → racine
  assert.deepEqual(h.meres.get('Y'), ['Y']);          // auto-parent ignoré
  assert.deepEqual(h.meres.get('P'), ['Q', 'P']);     // cycle : la remontée s'arrête
  assert.deepEqual(h.meres.get('Q'), ['P', 'Q']);
  assert.deepEqual(h.filles.get('P').map((x) => x.ref), ['Q']);
  // le cycle se voit une fois en filles, puis coupe à sa première répétition
  assert.deepEqual(h.filles.get('P')[0].filles.map((x) => x.ref), ['P']);
  assert.deepEqual(h.filles.get('P')[0].filles[0].filles, []);
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

test('instantAgenda : liste des créneaux canoniques + statut, stable', () => {
  const t = { statut: 'en cours', creneaux: ['2026-09-10 09:00-11:00', '2026-09-08 14:00-16:00'] };
  const a = Ariane.instantAgenda(t);
  // créneaux triés par début, forme canonique
  assert.equal(a, '2026-09-08 14:00-16:00;2026-09-10 09:00-11:00|en cours');
  assert.equal(Ariane.instantAgenda(t), a); // idempotent
});

test('instantAgenda : sensible au statut et à chaque créneau', () => {
  const base = { statut: 'à faire', creneaux: ['2026-09-08 14:00-16:00'] };
  assert.notEqual(Ariane.instantAgenda(base),
    Ariane.instantAgenda({ ...base, statut: 'terminée' }));
  assert.notEqual(Ariane.instantAgenda(base),
    Ariane.instantAgenda({ ...base, creneaux: ['2026-09-08 14:00-17:00'] }));
  assert.notEqual(Ariane.instantAgenda(base),
    Ariane.instantAgenda({ ...base, creneaux: [] }));
});

test('instantAgenda : sans créneau ni statut → "|"', () => {
  assert.equal(Ariane.instantAgenda({}), '|');
  assert.equal(Ariane.instantAgenda(null), '|');
});

test('clampHauteurBandeau : borne 24–320, repli 66, arrondi entier', () => {
  assert.equal(Ariane.clampHauteurBandeau(66), 66);
  assert.equal(Ariane.clampHauteurBandeau(10), 24);
  assert.equal(Ariane.clampHauteurBandeau(999), 320);
  assert.equal(Ariane.clampHauteurBandeau('80'), 80);
  assert.equal(Ariane.clampHauteurBandeau(120.7), 121);
  for (const v of [undefined, null, NaN, 'x', '', 0, -5]) {
    assert.equal(Ariane.clampHauteurBandeau(v), 66, JSON.stringify(v));
  }
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

// --- Traits de lignée de la vue semaine (calendrier) ---

test('pairesLigneeCalendrier : mère directe + bloqueur ; parent inconnu écarté', () => {
  const taches = [
    { ref: 'M', parent: '' },
    { ref: 'F', parent: '[[M]]' },
    { ref: 'B', bloquePar: ['[[F]]'] },
    { ref: 'X', parent: '[[Fantome]]' },
  ];
  const hier = Ariane.hierarchiesTaches(taches);
  assert.deepEqual(Ariane.pairesLigneeCalendrier(taches, hier), [
    { de: 'M', vers: 'F', genre: 'hier' },
    { de: 'F', vers: 'B', genre: 'bloque' },
  ]);
});

test('pairesLigneeCalendrier : la grand-mère n\'est pas reliée à la petite-fille', () => {
  const taches = [
    { ref: 'R', parent: '' }, { ref: 'M', parent: '[[R]]' }, { ref: 'F', parent: '[[M]]' },
  ];
  const hier = Ariane.hierarchiesTaches(taches);
  assert.deepEqual(Ariane.pairesLigneeCalendrier(taches, hier), [
    { de: 'R', vers: 'M', genre: 'hier' },
    { de: 'M', vers: 'F', genre: 'hier' },
  ]);
});

test('pairesLigneeCalendrier : bloqueur hors vue → rien ; doublons dédupliqués', () => {
  const taches = [{ ref: 'A', bloquePar: ['[[Fantome]]', '[[B]]', '[[B]]'] }, { ref: 'B' }];
  const hier = Ariane.hierarchiesTaches(taches);
  assert.deepEqual(Ariane.pairesLigneeCalendrier(taches, hier),
    [{ de: 'B', vers: 'A', genre: 'bloque' }]);
});

test('liensLigneeCalendrier : plusieurs créneaux de part et d\'autre → tous reliés', () => {
  const points = [
    { ref: 'M', quand: '2026-09-02T09:00' },
    { ref: 'M', quand: '2026-09-04T14:00' },
    { ref: 'F', quand: '2026-09-02T15:00' },
    { ref: 'F', quand: '2026-09-04T09:00' },
  ];
  assert.deepEqual(Ariane.liensLigneeCalendrier(points,
    [{ de: 'M', vers: 'F', genre: 'hier' }]), [
    { a: 0, b: 2, genre: 'hier' },
    { a: 0, b: 3, genre: 'hier' },
    { a: 1, b: 2, genre: 'hier' },
    { a: 1, b: 3, genre: 'hier' },
  ]);
});

test('liensLigneeCalendrier : au-delà de la portée (largeur de la vue), pas de trait', () => {
  const points = [
    { ref: 'M', quand: '2026-09-01T09:00' },
    { ref: 'F', quand: '2026-09-15T09:00' },
  ];
  assert.deepEqual(Ariane.liensLigneeCalendrier(points,
    [{ de: 'M', vers: 'F', genre: 'hier' }], 6), []);
});

test('cheminLienCalendrier : jours différents → courbe bord à bord', () => {
  const c = Ariane.cheminLienCalendrier(
    { x: 100, y: 50, w: 60, h: 40 }, { x: 300, y: 90, w: 60, h: 40 });
  assert.deepEqual([c.ax, c.ay, c.bx, c.by], [160, 70, 300, 110]);
  assert.ok(c.d.startsWith('M 160 70'));
  assert.ok(c.d.endsWith('300 110'));
  assert.ok(c.d.includes('C '));
});

test('cheminLienCalendrier : même colonne, créneaux décalés → courbe verticale', () => {
  const c = Ariane.cheminLienCalendrier(
    { x: 100, y: 50, w: 60, h: 40 }, { x: 100, y: 200, w: 60, h: 40 });
  assert.deepEqual([c.ax, c.ay, c.bx, c.by], [130, 90, 130, 200]);
});

test('cheminLienCalendrier : blocs côte à côte → court trait horizontal', () => {
  const c = Ariane.cheminLienCalendrier(
    { x: 100, y: 50, w: 60, h: 40 }, { x: 170, y: 50, w: 60, h: 40 });
  assert.deepEqual([c.ax, c.ay, c.bx, c.by], [160, 70, 170, 70]);
});

test('dureeCreneauMin : minutes entre deux bornes, changement d\'heure neutre', () => {
  assert.equal(Ariane.dureeCreneauMin('2026-09-08T09:00', '2026-09-08T10:30'), 90);
  assert.equal(Ariane.dureeCreneauMin('2026-09-08T23:30', '2026-09-09T01:00'), 90, 'minuit franchi');
  assert.equal(Ariane.dureeCreneauMin('2026-10-25T01:00', '2026-10-25T04:00'), 180,
    'la nuit du passage à l\'heure d\'hiver ne change pas la durée affichée');
  assert.equal(Ariane.dureeCreneauMin('2026-09-08T09:00', '2026-09-08T09:05'), 15, 'jamais moins d\'un quart d\'heure');
  assert.equal(Ariane.dureeCreneauMin('x', 'y'), 60, 'bornes illisibles : une heure');
});

test('poseCreneau : colonne visée et haut calé au quart d\'heure', () => {
  const base = { colW: 100, pxHeure: 40, nbJours: 7, prise: 10 };
  assert.deepEqual(Ariane.poseCreneau(Object.assign({ xRel: 250, yRel: 95 }, base)), { idx: 2, top: 90 },
    'tenu 10 px sous son haut : la carte commence à 85 px, calée à 90');
  assert.deepEqual(Ariane.poseCreneau(Object.assign({ xRel: 0, yRel: 3 }, base)), { idx: 0, top: 0 },
    'jamais au-dessus du début de la grille');
  assert.equal(Ariane.poseCreneau(Object.assign({ xRel: 700, yRel: 50 }, base)), null, 'à droite de la grille');
  assert.equal(Ariane.poseCreneau(Object.assign({ xRel: -1, yRel: 50 }, base)), null, 'à gauche');
  assert.equal(Ariane.poseCreneau(Object.assign({ xRel: 50, yRel: 500, hauteur: 400 }, base)), null, 'sous la grille');
  assert.equal(Ariane.poseCreneau({ xRel: 50, yRel: 50, colW: 0, pxHeure: 40, nbJours: 7 }), null,
    'grille pas encore mesurée');
});

// Obsidian recrée la vue Bases (donc le moteur) à chaque écriture dans le
// fichier .base : la période consultée ne doit pas repartir d'aujourd'hui.
test('calendrier recréé : il retrouve la semaine consultée et le défilement', () => {
  const { MoteurCalendrier } = require('./obsidian-factice.js')._test;
  const greffon = { app: {} };
  const fenetre = { setInterval: () => 1, clearInterval: () => {} };
  const racine = () => ({ ownerDocument: { defaultView: fenetre }, addClass() {}, addEventListener() {} });
  const cle = (c) => ({ cle: () => c });

  const a = new MoteurCalendrier(greffon, racine(), cle('Tâches.base::Semaine'));
  const auj = new Date().toISOString().slice(0, 10);
  assert.equal(a._ancre, auj, 'une vue neuve s\'ouvre sur aujourd\'hui');
  a._ancre = '2026-03-02';
  a._semScrollTop = 420;

  const b = new MoteurCalendrier(greffon, racine(), cle('Tâches.base::Semaine'));
  assert.equal(b._ancre, '2026-03-02', 'la vue recréée reste sur la semaine consultée');
  assert.equal(b._semScrollTop, 420, 'et sur la même heure');

  const autre = new MoteurCalendrier(greffon, racine(), cle('Tâches.base::Mois'));
  assert.equal(autre._ancre, auj, 'une autre vue a sa propre mémoire');
});

test('suggestions pour un créneau tracé : travail récent, frise, échéance', () => {
  const jour = '2026-09-10';
  const taches = [
    { ref: 'T1', intitule: 'Vieille tâche', statut: 'à faire', creneaux: ['2026-07-01 09:00-10:00'] },
    { ref: 'T2', intitule: 'Travaillée hier', statut: 'en cours', creneaux: ['2026-09-09 09:00-11:00'] },
    { ref: 'T3', intitule: 'Échéance proche', statut: 'à faire', debut: '2026-09-01', echeance: '2026-09-12' },
    { ref: 'T4', intitule: 'Finie', statut: 'terminée', creneaux: ['2026-09-10 09:00-10:00'] },
    { ref: 'T5', intitule: 'Jalon', jalon: true, echeance: '2026-09-10' },
    { ref: 'T6', intitule: 'Abandonnée', statut: 'abandonnée' },
  ];
  const s = Ariane.suggererTachesCreneau(taches, jour);
  assert.deepEqual(s.map((x) => x.t.ref), ['T2', 'T3', 'T1'],
    'terminées, abandonnées et jalons écartés ; la tâche d\'hier en tête');
  assert.equal(s[0].raison, 'dernier créneau il y a 1 j');
  assert.equal(s[1].raison, 'échéance dans 2 j');
  assert.ok(s[1].score > s[2].score, 'une échéance proche passe devant un vieux créneau');
});

test('suggestions pour un créneau tracé : une échéance dépassée compte encore', () => {
  const s = Ariane.suggererTachesCreneau([
    { ref: 'A', intitule: 'A', statut: 'à faire', echeance: '2026-09-01' },
    { ref: 'B', intitule: 'B', statut: 'à faire' },
  ], '2026-09-10');
  assert.equal(s[0].t.ref, 'A');
  assert.equal(s[0].raison, 'échéance dépassée');
  assert.equal(s[1].raison, '', 'rien à dire sur une tâche sans indice');
});

test('vue mois : la journée entière d\'abord, puis tout par heure, tâches et événements mêlés', () => {
  const l = Ariane.trierElementsJour([
    { id: 'tache 10:15', debut: '2026-09-10T10:15' },
    { id: 'tâche du jour', allDay: true, debut: '' },
    { id: 'événement 09:00', debut: '2026-09-10T09:00' },
    { id: 'événement journée', allDay: true, debut: '2026-09-10T00:00' },
    { id: 'tache 18:00', debut: '2026-09-10T18:00' },
  ]);
  assert.deepEqual(l.map((x) => x.id),
    ['tâche du jour', 'événement journée', 'événement 09:00', 'tache 10:15', 'tache 18:00']);
});

test('Créneau tracé : la tâche dite en langage naturel est créée, puis le créneau lui est attaché', async () => {
  const { ModaleTacheDuCreneau } = Ariane._test;
  const m = Object.create(ModaleTacheDuCreneau.prototype);
  const crees = [];
  const attache = [];
  let ferme = false;
  Object.assign(m, {
    o: { surChoix: (ref) => attache.push(ref) },
    close: () => { ferme = true; },
    greffon: { creerTachesLN: async (specs) => { crees.push(...specs.filter((s) => s.inclus !== false).map((s) => s.titre)); return ['T071', 'T072'].slice(0, crees.length); } },
    _specsLN: [{ titre: 'Relire le chapitre 2', famille: 'action' }, { titre: 'Envoyer le chapitre', famille: 'action', inclus: false }],
  });
  await m._creerLN();
  assert.deepEqual(crees, ['Relire le chapitre 2']);
  assert.deepEqual(attache, ['T071']);
  assert.ok(ferme && m.choisi, 'la fenêtre se ferme comme sur un choix, sans abandonner le créneau');
  // Tout décoché : rien n'est créé, la fenêtre reste ouverte.
  const n = Object.create(ModaleTacheDuCreneau.prototype);
  let appele = false;
  Object.assign(n, { o: {}, close() {}, greffon: { creerTachesLN: async () => { appele = true; return []; } }, _specsLN: [{ titre: 'X', inclus: false }] });
  await n._creerLN();
  assert.equal(appele, false);
});

test('Carte de survol d\'un créneau : seulement quand le bloc cache quelque chose', () => {
  const { MoteurCalendrier } = Ariane._test;
  const enfant = (cls, bas) => ({ matches: (sel) => sel.split(',').some((x) => x.trim() === '.' + cls), getBoundingClientRect: () => ({ bottom: bas }) });
  const bloc = (titre, enfants) => ({
    querySelector: (sel) => (sel === '.zfa-cal-carte-titre' ? titre : null),
    getBoundingClientRect: () => ({ bottom: 100 }),
    children: enfants,
  });
  const entier = { scrollHeight: 32, clientHeight: 32, scrollWidth: 80, clientWidth: 80 };
  const coupe = { scrollHeight: 48, clientHeight: 32, scrollWidth: 80, clientWidth: 80 };
  const d = MoteurCalendrier.prototype._blocDeborde;
  // Tout tient : pas de carte (les boutons du flanc débordent, ils ne comptent pas).
  assert.equal(d(bloc(entier, [enfant('zfa-cal-carte-l1', 40), enfant('zfa-cal-lignee-btns', 180)])), false);
  // Intitulé coupé.
  assert.equal(d(bloc(coupe, [enfant('zfa-cal-carte-l1', 40)])), true);
  // Sous-tâches sous le bord.
  assert.equal(d(bloc(entier, [enfant('zfa-cal-carte-l1', 40), enfant('zfa-cal-seance', 130)])), true);
});

test('Glisser une tâche sur la semaine : aperçu d\'une heure calé au quart d\'heure, ôté au dépôt', () => {
  const { MoteurCalendrier } = Ariane._test;
  const m = Object.create(MoteurCalendrier.prototype);
  Object.assign(m, { _pxHeure: 60, _hDeb: 8, _win: () => ({ requestAnimationFrame: () => {} }) });
  const crees = [];
  const inner = {
    createDiv() {
      const el = { style: {}, dataset: {}, isConnected: true, parentElement: inner, texte: '',
        setText(t) { this.texte = t; }, remove() { this.isConnected = false; } };
      crees.push(el);
      return el;
    },
  };
  const col = { dataset: { jour: '2026-11-03' }, style: { left: '120px', width: '120px' },
    getBoundingClientRect: () => ({ top: 100 }) };
  // 7 h 10 sous le haut de la grille (8 h) : 15:10, calé à 15:15.
  m._apercuDepot(inner, col, { clientY: 100 + 7 * 60 + 10 });
  assert.equal(crees.length, 1);
  const g = crees[0];
  assert.equal(g.texte, '15:15 → 16:15');
  assert.equal(g.style.top, (7.25 * 60) + 'px');
  assert.equal(g.style.height, '60px');
  assert.equal(g.style.left, '120px');
  // Le même quart d'heure : rien n'est refait ; un autre : le guide glisse.
  m._apercuDepot(inner, col, { clientY: 100 + 7 * 60 + 12 });
  m._apercuDepot(inner, col, { clientY: 100 + 9 * 60 });
  assert.equal(crees.length, 1);
  assert.equal(g.texte, '17:00 → 18:00');
  m._oterApercuDepot();
  assert.equal(g.isConnected, false);
});
