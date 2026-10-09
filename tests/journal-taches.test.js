// Journal des modifications et analyse des tâches (spec 2026-09-29, lot 1) :
// fonctions pures, éprouvées sans Obsidian.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const tache = (x) => Object.assign({ ref: 'T001', intitule: 'Lire Hartwig', statut: 'à faire',
  priorite: '', debut: '', echeance: '', heure: '', avancement: 0, jalon: false, parent: '',
  bloquePar: [], famille: 'production', creneaux: [] }, x || {});

// ── Instantanés et différences ───────────────────────────────────────────

test('instantané : listes triées, valeurs simples, comparables', () => {
  const a = Ariane.instantaneTache(tache({ creneaux: ['2026-09-10 09:00-10:00', '2026-09-02 09:00-10:00'],
    bloquePar: ['[[T009]]', '[[T003]]'] }));
  assert.deepEqual(a.creneaux, ['2026-09-02 09:00-10:00', '2026-09-10 09:00-10:00']);
  assert.deepEqual(a['bloque-par'], ['[[T003]]', '[[T009]]']);
  assert.equal(a.jalon, false);
  assert.equal(a.avancement, 0);
});

test('différences : un champ changé, un créneau ajouté, un retiré', () => {
  const av = Ariane.instantaneTache(tache({ echeance: '2026-10-01', creneaux: ['2026-09-02 09:00-10:00'] }));
  const ap = Ariane.instantaneTache(tache({ echeance: '2026-10-15', creneaux: ['2026-09-20 14:00-16:00'] }));
  assert.deepEqual(Ariane.differencesTache(av, ap), [
    { champ: 'echeance', avant: '2026-10-01', apres: '2026-10-15' },
    { champ: 'creneau', avant: '', apres: '2026-09-20 14:00-16:00' },
    { champ: 'creneau', avant: '2026-09-02 09:00-10:00', apres: '' },
  ]);
});

test('différences : rien ne change, rien n\'est journalisé', () => {
  const a = Ariane.instantaneTache(tache({ bloquePar: ['[[T2]]', '[[T1]]'] }));
  const b = Ariane.instantaneTache(tache({ bloquePar: ['[[T1]]', '[[T2]]'] }));
  assert.deepEqual(Ariane.differencesTache(a, b), [], 'l\'ordre d\'une liste ne compte pas');
});

test('reports d\'échéance : seuls les reculs comptent', () => {
  const j = [
    { champ: 'echeance', avant: '2026-10-01', apres: '2026-10-15' },
    { champ: 'echeance', avant: '2026-10-15', apres: '2026-10-10' },
    { champ: 'echeance', avant: '2026-10-10', apres: '2026-11-01' },
    { champ: 'echeance', avant: '', apres: '2026-12-01' },
    { champ: 'statut', avant: 'à faire', apres: 'en cours' },
  ];
  assert.equal(Ariane.reportsEcheance(j), 2, 'avancer une échéance ou en poser une n\'est pas un report');
});

// ── Analyse ──────────────────────────────────────────────────────────────

const AUJ = '2026-09-29';

test('analyse : retard, urgence maximale', () => {
  const a = Ariane.analyseTache(tache({ echeance: '2026-09-20' }), { aujourdhui: AUJ });
  assert.equal(a.urgence.score, 100);
  assert.equal(a.urgence.niveau, 'haute');
  assert.equal(a.urgence.raison, 'échéance dépassée de 9 j');
  assert.ok(a.diagnostics.some((d) => d.code === 'retard'));
});

test('analyse : l\'urgence décroît avec l\'échéance, et monte avec ce qu\'elle bloque', () => {
  const proche = Ariane.analyseTache(tache({ echeance: '2026-10-01' }), { aujourdhui: AUJ });
  const loin = Ariane.analyseTache(tache({ echeance: '2026-12-01' }), { aujourdhui: AUJ });
  assert.ok(proche.urgence.score > loin.urgence.score);
  const bloque = Ariane.analyseTache(tache({ echeance: '2026-12-01' }), { aujourdhui: AUJ, bloquees: 2 });
  assert.ok(bloque.urgence.score > loin.urgence.score);
  const sans = Ariane.analyseTache(tache(), { aujourdhui: AUJ });
  assert.equal(sans.urgence.score, 0, 'sans échéance ni blocage, rien ne presse');
});

test('analyse : l\'importance vient de la priorité, sinon elle est déduite', () => {
  assert.equal(Ariane.analyseTache(tache({ priorite: 'haute' }), { aujourdhui: AUJ }).importance.niveau, 'haute');
  const deduite = Ariane.analyseTache(tache({ livrable: '[[Chapitre 2]]' }), { aujourdhui: AUJ, bloquees: 1 });
  assert.equal(deduite.importance.score, 65);
  assert.equal(deduite.importance.raison, 'rattachée à un livrable, débloque 1 tâche(s)');
  assert.equal(Ariane.analyseTache(tache(), { aujourdhui: AUJ }).importance.raison, 'rien ne la distingue');
});

test('analyse : s\'étire quand l\'échéance a été repoussée deux fois', () => {
  const journal = [
    { le: '2026-09-01T10:00', champ: 'echeance', avant: '2026-09-15', apres: '2026-09-30' },
    { le: '2026-09-20T10:00', champ: 'echeance', avant: '2026-09-30', apres: '2026-10-20' },
  ];
  const a = Ariane.analyseTache(tache({ echeance: '2026-10-20' }), { aujourdhui: AUJ, journal });
  assert.deepEqual(a.diagnostics.find((d) => d.code === 'etire'),
    { code: 'etire', raison: 'échéance repoussée 2 fois' });
  assert.equal(a.reports, 2);
});

test('analyse : sous-planifiée quand l\'échéance approche sans créneau', () => {
  const a = Ariane.analyseTache(tache({ echeance: '2026-10-05' }), { aujourdhui: AUJ });
  assert.ok(a.diagnostics.some((d) => d.code === 'sous-planifiee'));
  const planifiee = Ariane.analyseTache(tache({ echeance: '2026-10-05',
    creneaux: ['2026-10-02 09:00-11:00'] }), { aujourdhui: AUJ });
  assert.ok(!planifiee.diagnostics.some((d) => d.code === 'sous-planifiee'));
  assert.equal(planifiee.prochainCreneau, '2026-10-02T09:00');
});

test('analyse : abandon probable après quatre semaines sans rien', () => {
  const vieille = tache({ cree: '2026-07-01', creneaux: ['2026-08-10 09:00-10:00'] });
  const a = Ariane.analyseTache(vieille, { aujourdhui: AUJ });
  assert.deepEqual(a.diagnostics.find((d) => d.code === 'abandon'),
    { code: 'abandon', raison: 'aucune activité depuis le 2026-08-10' });
  assert.equal(a.dernierCreneau, '2026-08-10');
  // Un signe de vie suffit à l'écarter.
  const touchee = Ariane.analyseTache(vieille, { aujourdhui: AUJ,
    journal: [{ le: '2026-09-25T09:00', champ: 'statut', avant: 'à faire', apres: 'en cours' }] });
  assert.ok(!touchee.diagnostics.some((d) => d.code === 'abandon'));
  const travaillee = Ariane.analyseTache(vieille, { aujourdhui: AUJ, tempsRecentMin: 40 });
  assert.ok(!travaillee.diagnostics.some((d) => d.code === 'abandon'));
  const recente = Ariane.analyseTache(tache({ cree: '2026-09-20' }), { aujourdhui: AUJ });
  assert.ok(!recente.diagnostics.some((d) => d.code === 'abandon'), 'une tâche neuve n\'est pas abandonnée');
  const attente = Ariane.analyseTache(Object.assign({}, vieille, { statut: 'en attente' }), { aujourdhui: AUJ });
  assert.ok(!attente.diagnostics.some((d) => d.code === 'abandon'), 'en attente est un choix, pas un abandon');
});

test('analyse : une tâche finie n\'a ni urgence ni diagnostic', () => {
  const a = Ariane.analyseTache(tache({ statut: 'terminée', echeance: '2026-09-01' }), { aujourdhui: AUJ, bloquees: 3 });
  assert.equal(a.urgence.score, 0);
  assert.deepEqual(a.diagnostics, []);
});

// ── Le circuit dans le greffon ───────────────────────────────────────────

test('journal : un changement est noté avec son origine, puis écrit', async () => {
  const Ariane_ = Ariane;
  const g = Object.create(Ariane_.prototype);
  const ecoutes = {};
  const fichierT1 = { path: '08 - Tâches/T001.md' };
  let taches = [Object.assign(tache(), { fichier: fichierT1 })];
  const disque = {};
  g.settings = {};
  g.manifest = { dir: '.obsidian/plugins/obsidian-ariane' };
  g.antirebonds = new Map();
  g.antirebond = (cle, fn) => { g._aVider = fn; };
  g.ecritePlugin = () => false;
  g.refDeChemin = (p) => (p.startsWith('08 - Tâches/') ? p.split('/').pop().replace(/\.md$/, '') : '');
  g.tachesPourGantt = () => taches;
  g.registerEvent = () => {};
  g.app = {
    workspace: { onLayoutReady: (fn) => fn() },
    metadataCache: { resolved: true, on: (nom, fn) => { ecoutes['cache:' + nom] = fn; return {}; } },
    vault: {
      on: (nom, fn) => { ecoutes['vault:' + nom] = fn; return {}; },
      adapter: {
        exists: async (p) => p in disque || Object.keys(disque).some((k) => k.startsWith(p + '/')),
        write: async (p, s) => { disque[p] = s; },
        append: async (p, s) => { disque[p] += s; },
        read: async (p) => disque[p],
        mkdir: async () => {},
        list: async (d) => ({ files: Object.keys(disque).filter((k) => k.startsWith(d + '/')), folders: [] }),
      },
    },
  };
  g.demarrerJournalTaches();

  // Monsieur repousse l'échéance dans le panneau des propriétés.
  taches = [Object.assign(tache({ echeance: '2026-11-01' }), { fichier: fichierT1 })];
  ecoutes['cache:changed'](fichierT1);
  // Puis Ariane pose un créneau depuis le calendrier.
  g.marquerOrigineTache(fichierT1.path);
  taches = [Object.assign(tache({ echeance: '2026-11-01', creneaux: ['2026-10-02 09:00-10:00'] }),
    { fichier: fichierT1 })];
  ecoutes['cache:changed'](fichierT1);

  const avant = await g.lireJournalTaches();
  assert.deepEqual(avant.map((e) => [e.ref, e.champ, e.apres, e.origine]), [
    ['T001', 'echeance', '2026-11-01', 'externe'],
    ['T001', 'creneau', '2026-10-02 09:00-10:00', 'ariane'],
  ], 'le tampon se lit avant même d\'être écrit');

  await g._aVider();
  await g.ecrireDonneesJours();
  // Les changements rejoignent le fichier de leur jour, dans le journal du temps.
  const jour = avant[0].le.slice(0, 10);
  const fichier = JSON.parse(disque['.ariane/jours/' + jour + '.json']);
  assert.equal(fichier.taches.length, 2, 'un élément par changement');
  const relu = await g.lireJournalTaches();
  assert.equal(relu.length, 2, 'relu depuis le fichier, sans doublon avec le tampon vidé');

  // Une nouvelle tâche apparaît, une autre disparaît.
  const fichierT2 = { path: '08 - Tâches/T002.md' };
  taches = taches.concat([Object.assign(tache({ ref: 'T002', intitule: 'Relire' }), { fichier: fichierT2 })]);
  ecoutes['cache:changed'](fichierT2);
  ecoutes['vault:delete'](fichierT1);
  const fin = await g.lireJournalTaches();
  assert.deepEqual(fin.slice(2).map((e) => [e.ref, e.champ]), [['T002', 'creation'], ['T001', 'suppression']]);
});

// ── Charge et revue ──────────────────────────────────────────────────────

test('plages libres : ce qui reste entre les occupations, au-delà d\'une demi-heure', () => {
  const l = Ariane.plagesLibres('2026-10-01', [
    { debut: '2026-10-01T09:00', fin: '2026-10-01T10:30' },
    { debut: '2026-10-01T10:45', fin: '2026-10-01T12:00' },
    { debut: '2026-10-01T14:00', fin: '2026-10-01T15:00' },
    { debut: '2026-09-30T18:00', fin: '2026-10-01T08:30' },
  ], '08:00', '19:00');
  assert.deepEqual(l, [
    { debut: '08:30', fin: '09:00', minutes: 30 },
    { debut: '12:00', fin: '14:00', minutes: 120 },
    { debut: '15:00', fin: '19:00', minutes: 240 },
  ], 'le quart d\'heure 10:30-10:45 est écarté ; la nuit de la veille déborde jusqu\'à 08:30');
  assert.deepEqual(Ariane.plagesLibres('2026-10-01', [], '09:00', '12:00'),
    [{ debut: '09:00', fin: '12:00', minutes: 180 }]);
  assert.deepEqual(Ariane.plagesLibres('2026-10-01', [
    { debut: '2026-10-01T07:00', fin: '2026-10-01T20:00' }], '08:00', '19:00'), [], 'journée pleine');
});

test('revue : chaque rubrique rassemble ce qui la concerne', () => {
  const x = (ref, t, ctx) => ({ tache: Object.assign(tache({ ref }), t),
    analyse: Ariane.analyseTache(Object.assign(tache({ ref }), t), Object.assign({ aujourdhui: AUJ }, ctx)) });
  const r = Ariane.revueTaches([
    x('R', { echeance: '2026-09-20' }),
    x('S', { echeance: '2026-10-03' }),
    x('P', { echeance: '2026-10-20', creneaux: ['2026-10-01 09:00-10:00'] }),
    x('I', { priorite: 'haute' }),
    x('F', { statut: 'terminée', echeance: '2026-09-01' }),
  ], AUJ);
  assert.deepEqual(r.enRetard.map((y) => y.tache.ref), ['R']);
  assert.deepEqual(r.sousPlanifiees.map((y) => y.tache.ref), ['S']);
  assert.deepEqual(r.cetteSemaine.map((y) => y.tache.ref), ['S', 'P'], 'échéance ou créneau dans les 7 jours');
  assert.deepEqual(r.importantPasUrgent.map((y) => y.tache.ref), ['I']);
  assert.ok(!JSON.stringify(r).includes('"F"'), 'les tâches finies n\'y figurent pas');
});

// ── Propositions de Claude ───────────────────────────────────────────────

test('propositions : un changement valide devient une liste d\'opérations', () => {
  const taches = [tache({ ref: 'T001', echeance: '2026-10-01', creneaux: ['2026-10-02 09:00-11:00'] }),
    tache({ ref: 'T002', intitule: 'Mère' })];
  const r = Ariane.validerPropositions([{
    ref: 'T001', justification: 'Trois reports : une échéance réaliste.',
    champs: { echeance: '2026-10-20', statut: 'en cours', parent: 'T002', priorite: '' },
    ajouter_creneaux: [{ debut: '2026-10-06T14:00', fin: '2026-10-06T16:00' }],
    retirer_creneaux: ['2026-10-02 09:00-11:00'],
  }], taches);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.valides[0].justification, 'Trois reports : une échéance réaliste.');
  assert.deepEqual(r.valides[0].operations, [
    { genre: 'champ', champ: 'echeance', avant: '2026-10-01', apres: '2026-10-20' },
    { genre: 'champ', champ: 'statut', avant: 'à faire', apres: 'en cours' },
    { genre: 'champ', champ: 'parent', avant: '', apres: '[[T002]]' },
    { genre: 'creneau+', debut: '2026-10-06T14:00', fin: '2026-10-06T16:00', brut: '2026-10-06 14:00-16:00' },
    { genre: 'creneau-', brut: '2026-10-02 09:00-11:00' },
  ], 'la priorité déjà vide n\'est pas une opération');
});

test('propositions : une seule valeur invalide écarte le changement entier', () => {
  const taches = [tache({ ref: 'T001' })];
  const r = Ariane.validerPropositions([
    { ref: 'T001', champs: { echeance: '2026-02-31', statut: 'en cours' } },
    { ref: 'T001', champs: { chemin: 'ailleurs' } },
    { ref: 'T404', champs: { statut: 'en cours' } },
    { ref: 'T001', champs: { statut: 'à faire' } },
    { ref: 'T001', ajouter_creneaux: [{ debut: '2026-10-06T16:00', fin: '2026-10-06T14:00' }] },
    { ref: 'T001', retirer_creneaux: ['2026-10-02 09:00-11:00'] },
    { ref: 'T001', champs: { parent: 'T001' } },
  ], taches);
  assert.deepEqual(r.valides, []);
  assert.deepEqual(r.erreurs.map((e) => e.erreur), [
    'echeance invalide : 2026-02-31',
    'champ non modifiable : chemin',
    'tâche introuvable : T404',
    'rien à changer',
    'créneau invalide : {"debut":"2026-10-06T16:00","fin":"2026-10-06T14:00"}',
    'créneau à retirer introuvable : "2026-10-02 09:00-11:00"',
    'une tâche ne peut être sa propre mère',
  ]);
});

test('propositions : créer une tâche, avec ses créneaux', () => {
  const r = Ariane.validerPropositions([{
    creer: { intitule: 'Relire le chapitre 2', famille: 'production', echeance: '2026-10-30' },
    ajouter_creneaux: [{ debut: '2026-10-07T09:00', fin: '2026-10-07T11:00' }],
    justification: 'Découpe de T002.',
  }], []);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.valides[0].intitule, 'Relire le chapitre 2');
  assert.deepEqual(r.valides[0].operations.map((o) => o.genre), ['creation', 'creneau+']);
  const sans = Ariane.validerPropositions([{ creer: { famille: 'production' } }], []);
  assert.equal(sans.erreurs[0].erreur, 'création sans intitulé');
});


// ── Tableau de bord « Gestion de l'organisation » ─────────────────────────

test('échéance relative : dite en clair, avec son genre', () => {
  assert.deepEqual(Ariane.echeanceRelative('2026-09-20', AUJ), { texte: 'dépassée de 9 j', genre: 'retard', jours: -9 });
  assert.equal(Ariane.echeanceRelative(AUJ, AUJ).texte, 'aujourd’hui');
  assert.equal(Ariane.echeanceRelative('2026-09-30', AUJ).texte, 'demain');
  assert.deepEqual(Ariane.echeanceRelative('2026-10-04', AUJ), { texte: 'dans 5 j', genre: 'proche', jours: 5 });
  assert.equal(Ariane.echeanceRelative('2026-10-09', AUJ).genre, 'loin');
  assert.equal(Ariane.echeanceRelative('2026-11-10', AUJ).texte, 'dans 6 sem.');
  assert.equal(Ariane.echeanceRelative('', AUJ), null);
});

test('journal en phrases', () => {
  assert.equal(Ariane.phraseJournal({ champ: 'echeance', avant: '2026-10-01', apres: '2026-10-15' }),
    'échéance repoussée du 2026-10-01 au 2026-10-15');
  assert.equal(Ariane.phraseJournal({ champ: 'echeance', avant: '2026-10-15', apres: '2026-10-01' }),
    'échéance avancée du 2026-10-15 au 2026-10-01');
  assert.equal(Ariane.phraseJournal({ champ: 'echeance', avant: '', apres: '2026-10-01' }), 'échéance fixée au 2026-10-01');
  assert.equal(Ariane.phraseJournal({ champ: 'creneau', avant: '', apres: '2026-10-02 09:00-11:00' }),
    'créneau ajouté : 2026-10-02 09:00-11:00');
  assert.equal(Ariane.phraseJournal({ champ: 'statut', avant: 'à faire', apres: 'en cours' }), 'statut : à faire → en cours');
  assert.equal(Ariane.phraseJournal({ champ: 'priorite', avant: '', apres: 'haute' }), 'priorité : (aucune) → haute');
  assert.equal(Ariane.phraseJournal({ champ: 'parent', avant: '', apres: '[[T002]]' }), 'rattachée à T002');
});

test('tableau : chiffres, semaine, aujourd\'hui, matrice, familles, activité', () => {
  // AUJ = mardi 2026-09-29 ; semaine du lundi 28 au dimanche 4.
  const e = (ref, t, extra) => {
    const tt = Object.assign(tache({ ref, intitule: 'Tâche ' + ref }), t);
    return Object.assign({ tache: tt, analyse: Ariane.analyseTache(tt, { aujourdhui: AUJ }) }, extra || {});
  };
  const d = Ariane.tableauOrganisation([
    e('A', { echeance: '2026-09-20', famille: 'production', creneaux: [AUJ + ' 14:00-16:00', '2026-09-28 09:00-10:00'] },
      { tempsSemaineMin: 45 }),
    e('B', { echeance: '2026-10-02', famille: 'lecture', priorite: 'haute', creneaux: ['2026-10-01 09:00-11:30'] }),
    e('C', { famille: 'lecture', priorite: 'haute' }),
    e('D', { statut: 'terminée', famille: 'lecture', creneaux: ['2026-09-28 11:00-12:00'] }, { termineLe: '2026-09-28' }),
    e('E', { statut: 'abandonnée', famille: 'production' }),
  ], {
    aujourdhui: AUJ,
    evenements: [
      { titre: 'Séminaire', debut: AUJ + 'T10:00', fin: AUJ + 'T12:00', calendrier: 'Travail', allDay: false },
      { titre: 'Colloque', debut: '2026-09-29T00:00', fin: '2026-09-30T00:00', allDay: true },
    ],
    journal: [
      { le: '2026-09-29T08:00', ref: 'A', champ: 'echeance', avant: '2026-09-15', apres: '2026-09-20', origine: 'externe' },
      { le: '2026-09-29T09:00', ref: 'B', champ: 'creneau', avant: '', apres: '2026-10-01 09:00-11:30', origine: 'claude' },
    ],
  });
  assert.equal(d.lundi, '2026-09-28');
  assert.deepEqual(d.chiffres, { actives: 3, enRetard: 1, echeances7: 1,
    minutesPlanifieesSemaine: 120 + 60 + 150 + 60, minutesPasseesSemaine: 45, termineesSemaine: 1 });
  assert.deepEqual(d.semaine.map((j) => j.minutesPlanifiees), [120, 120, 0, 150, 0, 0, 0]);
  assert.equal(d.semaine[1].aujourdhui, true);
  assert.equal(d.semaine[1].nbEvenements, 1);
  assert.deepEqual(d.aujourdhui.map((x) => x.genre + ':' + x.debut.slice(11)), ['evenement:10:00', 'creneau:14:00'],
    'rendez-vous et créneaux mêlés, dans l\'ordre de l\'heure');
  assert.deepEqual(d.journeeEntiere.map((x) => x.titre), ['Colloque']);
  assert.deepEqual(d.matrice.urgentImportant.map((x) => x.tache.ref), ['B']);
  assert.deepEqual(d.matrice.importantPasUrgent.map((x) => x.tache.ref), ['C']);
  assert.deepEqual(d.matrice.urgentPasImportant.map((x) => x.tache.ref), ['A']);
  // A a un créneau aujourd'hui : elle est dans « Aujourd'hui », pas dans les
  // suggestions. B (urgente, importante, déjà planifiée) et C (importante,
  // à planifier) sont suggérées, avec leur conseil.
  assert.deepEqual(d.suggestions.map((x) => [x.tache.ref, x.conseil.genre]),
    [['B', 'prevue'], ['C', 'relancer']]);
  assert.deepEqual(d.surveiller.map((x) => x.tache.ref), ['A'],
    'à surveiller : ce que les suggestions ne couvrent pas (A, en retard, déjà au programme du jour)');
  assert.deepEqual(d.echeances.map((x) => x.tache.ref), ['B']);
  assert.deepEqual(d.familles.map((f) => [f.famille, f.actives, f.terminees, f.taux, f.minutesSemaine]),
    [['lecture', 2, 1, 33, 210], ['production', 1, 0, 0, 180]]);
  assert.deepEqual(d.activite.map((a) => [a.ref, a.origine]), [['B', 'Claude'], ['A', 'vous']]);
  assert.equal(d.activite[1].phrase, 'échéance repoussée du 2026-09-15 au 2026-09-20');
});

test('suggestions : le plus pressant d\'abord, avec son conseil ; ni attente ni jalon', () => {
  const e = (ref, t) => {
    const tt = Object.assign(tache({ ref, cree: '2026-09-25' }), t);
    return { tache: tt, analyse: Ariane.analyseTache(tt, { aujourdhui: AUJ }) };
  };
  const d = Ariane.tableauOrganisation([
    e('PLAN', { echeance: '2026-10-20', priorite: 'haute', creneaux: ['2026-10-05 09:00-11:00'] }),
    e('SOUS', { echeance: '2026-10-03' }),
    e('RET', { echeance: '2026-09-25' }),
    e('ATT', { echeance: '2026-09-20', statut: 'en attente' }),
    e('JAL', { echeance: '2026-10-01', jalon: true }),
    e('CALME', {}),
  ], { aujourdhui: AUJ });
  assert.deepEqual(d.suggestions.map((x) => [x.tache.ref, x.conseil.genre, x.conseil.date]), [
    ['RET', 'retard', '2026-09-25'],
    ['SOUS', 'planifier-avant', '2026-10-03'],
    ['PLAN', 'prevue', '2026-10-05T09:00'],
  ]);
});

test('temps libre : 9 h - 18 h des jours ouvrés restants, moins créneaux et rendez-vous', () => {
  // AUJ = mardi 29 ; il reste mardi (à partir de 14:05), mercredi, jeudi, vendredi.
  const t = Object.assign(tache({ ref: 'A' }), { creneaux: [AUJ + ' 15:00-16:00', '2026-10-01 09:00-12:00', '2026-10-03 10:00-12:00'] });
  const d = Ariane.tableauOrganisation([{ tache: t, analyse: Ariane.analyseTache(t, { aujourdhui: AUJ }) }], {
    aujourdhui: AUJ, maintenant: '14:05',
    evenements: [
      { titre: 'Réunion', debut: '2026-09-30T10:00', fin: '2026-09-30T11:30', allDay: false },
      { titre: 'Colloque', debut: '2026-10-02T00:00', fin: '2026-10-03T00:00', allDay: true },
    ],
  });
  const l = d.tempsLibre;
  assert.deepEqual(l.jours.map((j) => j.jour), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'],
    'lundi est passé, le week-end n\'est pas compté');
  assert.deepEqual(l.jours[0].plages.map((p) => p.debut + '-' + p.fin), ['14:15-15:00', '16:00-18:00'],
    'aujourd\'hui : à partir du quart d\'heure suivant maintenant (14:15), le créneau de 15:00 retiré');
  assert.deepEqual(l.jours[1].plages.map((p) => p.debut + '-' + p.fin), ['09:00-10:00', '11:30-18:00']);
  assert.deepEqual(l.jours[2].plages.map((p) => p.debut + '-' + p.fin), ['12:00-18:00']);
  assert.equal(l.jours[3].minutes, 540, 'une journée entière ne bloque rien');
  assert.equal(l.minutes, (45 + 120) + (60 + 390) + 360 + 540);
  assert.equal(l.nbPlages, 2 + 2 + 1 + 1);
  assert.equal(d.semaine[5].libre, null, 'samedi : pas de temps libre compté');
  const avecWeekend = Ariane.tableauOrganisation([], { aujourdhui: AUJ, maintenant: '14:05', weekend: true,
    heureDebut: '10:00', heureFin: '12:00' });
  assert.deepEqual(avecWeekend.tempsLibre.jours.map((j) => j.jour).slice(-2), ['2026-10-03', '2026-10-04']);
  assert.equal(avecWeekend.tempsLibre.jours[0].minutes, 0, 'aujourd\'hui, la plage 10-12 est déjà passée');
});

// ── Répartition de la semaine par l'IA ────────────────────────────────────

test('répartition : candidats, les plus pressantes d\'abord, avec leurs indices de taille', () => {
  const e = (ref, t) => { const tt = Object.assign(tache({ ref }), t); return { tache: tt, analyse: Ariane.analyseTache(tt, { aujourdhui: AUJ }) }; };
  const c = Ariane.candidatsRepartition([
    e('FOND', { debut: '2026-07-01', echeance: '2026-12-20', creneaux: ['2026-09-10 09:00-12:00'] }),
    e('MAIL', { echeance: '2026-09-30' }),
    e('ATT', { statut: 'en attente', echeance: '2026-09-30' }),
    e('JAL', { jalon: true, echeance: '2026-10-01' }),
  ], AUJ);
  assert.deepEqual(c.map((x) => x.ref), ['MAIL', 'FOND'], 'ni attente ni jalon ; l\'échéance de demain en tête');
  const fond = c.find((x) => x.ref === 'FOND');
  assert.equal(fond.dureeVieJours, 172);
  assert.equal(fond.minutesPasseesPlanifiees, 180);
  const p = Ariane.promptRepartition(c, { heureDebut: '09:00', heureFin: '18:00', minutes: 1200, nbPlages: 4 }, AUJ,
    [{ id: 'production', nom: 'Production', description: 'Travail de fond' }]);
  assert.match(p, /FOND \| Lire Hartwig \| famille : Production \(Travail de fond\)/);
  assert.match(p, /durée de vie 172 j/);
  assert.match(p, /Réponds UNIQUEMENT par un tableau JSON/);
});

test('répartition : la réponse de l\'IA est vérifiée et bornée', () => {
  const c = [{ ref: 'A' }, { ref: 'B' }];
  const e = Ariane.lireEstimations([
    { ref: 'A', taille: 'grosse', effort_restant_min: 900, cette_semaine_min: 5000, bloc_min: 999, moment: 'matin', raison: 'Ouvrage de 400 pages.' },
    { ref: 'A', taille: 'petite' },
    { ref: 'Z', taille: 'petite' },
    { ref: 'B', taille: 'énorme', cette_semaine_min: 'beaucoup' },
  ], c);
  assert.deepEqual(e[0], { ref: 'A', taille: 'grosse', effort: 900, semaine: 900, bloc: 240, moment: 'matin', raison: 'Ouvrage de 400 pages.' },
    'la part de la semaine ne dépasse pas l\'effort ; le bloc est plafonné à 4 h');
  assert.deepEqual(e.map((x) => x.ref), ['A', 'B'], 'doublon et tâche inconnue écartés');
  assert.equal(e[1].taille, 'moyenne');
  assert.equal(e[1].semaine, 60);
});

test('répartition : placement dans les plages libres, par règles fixes', () => {
  // Mercredi 30 : 09:00-10:00 (entre deux choses, courte) et 11:30-18:00 ;
  // jeudi 1er : 09:00-18:00. Échéance de PETITE : mercredi.
  const jours = [
    { jour: '2026-09-30', plages: [{ debut: '09:00', fin: '10:00' }, { debut: '11:30', fin: '18:00' }] },
    { jour: '2026-10-01', plages: [{ debut: '09:00', fin: '18:00' }] },
  ];
  const candidats = [
    { ref: 'PETITE', echeance: '2026-09-30', joursRestants: 1 },
    { ref: 'GROSSE', echeance: '2026-12-20', joursRestants: 82 },
  ];
  const est = [
    { ref: 'GROSSE', taille: 'grosse', semaine: 360, bloc: 180, moment: 'matin', raison: '' },
    { ref: 'PETITE', taille: 'petite', semaine: 45, bloc: 45, moment: 'indifferent', raison: '' },
  ];
  const r = Ariane.placerRepartition(est, { jours, candidats, heureDebut: '09:00', maxJourMin: 360, reserve: 0 });
  assert.deepEqual(r.placements.map((p) => [p.ref, p.debut, p.fin]), [
    ['PETITE', '2026-09-30T09:00', '2026-09-30T09:45'],
    ['GROSSE', '2026-10-01T09:00', '2026-10-01T12:00'],
    ['GROSSE', '2026-09-30T11:45', '2026-09-30T14:45'],
  ], 'la petite d\'abord, avant son échéance, dans la plage courte ; le gros travail le matin, un bloc par jour, un quart d\'heure après ce qui précède');
  assert.deepEqual(r.nonPlaces, []);
});

test('répartition : plafond par jour, réserve et échéance respectés ; ce qui ne tient pas est dit', () => {
  const jours = [{ jour: '2026-09-30', plages: [{ debut: '09:00', fin: '18:00' }] }];
  const r = Ariane.placerRepartition(
    [{ ref: 'A', taille: 'moyenne', semaine: 600, bloc: 120, moment: 'indifferent', raison: '' }],
    { jours, candidats: [{ ref: 'A', echeance: '2026-09-29', joursRestants: 0 }], heureDebut: '09:00',
      maxJourMin: 360, reserve: 0.2, dejaParJour: { '2026-09-30': 120 } });
  assert.deepEqual(r.placements, [], 'échéance aujourd\'hui : rien après elle');
  const r2 = Ariane.placerRepartition(
    [{ ref: 'A', taille: 'petite', semaine: 600, bloc: 60, moment: 'indifferent', raison: '' }],
    { jours, candidats: [{ ref: 'A', echeance: '2026-10-10', joursRestants: 11 }], heureDebut: '09:00',
      maxJourMin: 360, reserve: 0.2, dejaParJour: { '2026-09-30': 120 } });
  assert.equal(r2.placeMin, 240, 'plafond : 360 min par jour, dont 120 déjà planifiées');
  assert.deepEqual(r2.nonPlaces, [{ ref: 'A', manqueMin: 360 }]);
  const props = Ariane.propositionsRepartition(r2, [{ ref: 'A', taille: 'petite', raison: 'Courriels.' }], [{ ref: 'A', intitule: 'Répondre' }]);
  assert.equal(props.length, 1);
  assert.equal(props[0].justification, 'petite tâche : Courriels.');
  assert.equal(props[0].ajouter_creneaux.length, 4);
});

test('temps libre : la pause déjeuner réglée n\'en fait pas partie', () => {
  const d = Ariane.tableauOrganisation([], { aujourdhui: AUJ, maintenant: '08:00', pauseDebut: '12:00', pauseFin: '13:00' });
  assert.deepEqual(d.tempsLibre.jours[0].plages.map((p) => p.debut + '-' + p.fin), ['09:00-12:00', '13:00-18:00']);
  assert.equal(d.tempsLibre.jours[0].minutes, 480);
});

test('répartition : un reste court est fait d\'une traite, pas laissé au lendemain', () => {
  const jours = [{ jour: '2026-09-30', plages: [{ debut: '09:00', fin: '12:00' }] },
                 { jour: '2026-10-01', plages: [{ debut: '09:00', fin: '12:00' }] }];
  const r = Ariane.placerRepartition([{ ref: 'P', taille: 'moyenne', semaine: 150, bloc: 120, moment: 'matin', raison: '' }],
    { jours, candidats: [{ ref: 'P', echeance: '2026-10-02', joursRestants: 3 }], heureDebut: '09:00', maxJourMin: 360, reserve: 0 });
  assert.deepEqual(r.placements.map((p) => p.debut + '-' + p.fin.slice(11)), ['2026-09-30T09:00-11:30']);
});

test('pseudo-calendrier : la grille de la semaine, et les propositions devenues caduques', () => {
  const t = Object.assign(tache({ ref: 'A', intitule: 'Lire', famille: 'lecture' }), { creneaux: ['2026-09-30 10:00-11:00'] });
  const d = Ariane.tableauOrganisation([{ tache: t, analyse: Ariane.analyseTache(t, { aujourdhui: AUJ }) }], {
    aujourdhui: AUJ, maintenant: '08:00', pauseDebut: '12:00', pauseFin: '13:00',
    evenements: [{ titre: 'Réunion', debut: '2026-10-01T14:00', fin: '2026-10-01T15:00', allDay: false, calendrier: 'Travail' }],
  });
  assert.deepEqual(d.grille.jours.map((j) => j.jour), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(d.grille.jours[0].passe, true);
  assert.deepEqual(d.grille.jours[2].occupations.map((o) => [o.genre, o.ref, o.debut]), [['creneau', 'A', '2026-09-30T10:00']]);
  assert.equal(d.grille.pauseDebut, '12:00');
  const props = [
    { id: 1, ref: 'A', debut: '2026-09-30T14:00', fin: '2026-09-30T15:00' },
    { id: 2, ref: 'A', debut: '2026-09-30T10:30', fin: '2026-09-30T11:30' },
    { id: 3, ref: 'A', debut: '2026-09-29T07:00', fin: '2026-09-29T07:30' },
    { id: 4, ref: 'Z', debut: '2026-10-02T09:00', fin: '2026-10-02T10:00' },
    { id: 5, ref: 'A', debut: '2026-10-01T14:30', fin: '2026-10-01T16:00' },
  ];
  const n = Ariane.nettoyerPropositions(props, d.grille, AUJ + 'T08:00', ['A']);
  assert.deepEqual(n.gardees.map((p) => p.id), [1]);
  assert.deepEqual(n.retirees.map((p) => p.id), [2, 3, 4, 5],
    'chevauche un créneau ; déjà passée ; tâche disparue ; chevauche un rendez-vous');
});
