// Journal des modifications et analyse des tâches (spec 2026-09-29, lot 1) :
// fonctions pures, éprouvées sans Obsidian.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const tache = (x) => Object.assign({ ref: 'T001', intitule: 'Lire Bertalanffy', statut: 'à faire',
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
        exists: async (p) => p in disque,
        write: async (p, s) => { disque[p] = s; },
        append: async (p, s) => { disque[p] += s; },
        read: async (p) => disque[p],
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
  const fichier = disque['.obsidian/plugins/obsidian-ariane/journal-taches.jsonl'];
  assert.equal(fichier.trim().split('\n').length, 2, 'une ligne JSON par changement');
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
  assert.deepEqual(d.surveiller.map((x) => x.tache.ref), ['A', 'C'],
    'le retard d\'abord ; B a un créneau avant son échéance ; C, sans aucune activité, est un abandon probable');
  assert.deepEqual(d.echeances.map((x) => x.tache.ref), ['B']);
  assert.deepEqual(d.familles.map((f) => [f.famille, f.actives, f.terminees, f.taux, f.minutesSemaine]),
    [['lecture', 2, 1, 33, 210], ['production', 1, 0, 0, 180]]);
  assert.deepEqual(d.activite.map((a) => [a.ref, a.origine]), [['B', 'Claude'], ['A', 'vous']]);
  assert.equal(d.activite[1].phrase, 'échéance repoussée du 2026-09-15 au 2026-09-20');
});
