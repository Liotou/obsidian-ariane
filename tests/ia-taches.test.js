const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

/* -------------------------- datesDansTexte -------------------------- */

test('datesDansTexte : ISO et JJ/MM/AAAA, ramenées en ISO', () => {
  const s = Ariane.datesDansTexte('rendu le 2026-09-30, réunion 03/10/2026, rien le 32/13/2026');
  assert.ok(s.has('2026-09-30'));
  assert.ok(s.has('2026-10-03'));
  assert.equal(s.has(''), false);
});

/* --------------------------- extraireJson -------------------------- */

test('extraireJson : nu, avec fence, avec bavardage', () => {
  assert.deepEqual(Ariane.extraireJson('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(Ariane.extraireJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(Ariane.extraireJson('Voici :\n[{"a":1}]\nVoilà.'), [{ a: 1 }]);
  assert.equal(Ariane.extraireJson('pas du json'), null);
});

/* ---------------------- normaliserSpecsTaches --------------------- */

const OPTS = {
  familles: new Set(['lecture', 'production', 'action']),
  defaut: 'action',
  dates: new Set(['2026-09-30']),
};

test('normaliserSpecsTaches : familles bornées, booléens, priorité, profondeur', () => {
  const brut = [{
    titre: '  Approfondir  ', famille: 'INCONNUE', jalon: 'oui', priorite: 'BONUS',
    enfants: [{ title: 'Lire X', family: 'lecture', source_pressentie: 'von Hartwig' }],
  }];
  const s = Ariane.normaliserSpecsTaches(brut, OPTS);
  assert.equal(s[0].titre, 'Approfondir');
  assert.equal(s[0].famille, 'action');       // inconnue -> défaut
  assert.equal(s[0].jalon, true);
  assert.equal(s[0].priorite, 'basse');
  assert.equal(s[0].enfants[0].famille, 'lecture');
  assert.equal(s[0].enfants[0].source, 'von Hartwig');
});

test('normaliserSpecsTaches : aucune date qui ne soit dans le texte source', () => {
  const s = Ariane.normaliserSpecsTaches(
    [{ titre: 'T', echeance: '2026-12-25', debut: '2026-09-30' }], OPTS);
  assert.equal(s[0].echeance, '');            // absente de dates -> jetée
  assert.equal(s[0].debut, '2026-09-30');     // présente -> gardée
});

test('normaliserSpecsTaches : nœuds sans titre ignorés, {taches:[…]} accepté', () => {
  const s = Ariane.normaliserSpecsTaches({ taches: [{ nom: 'A' }, { note: 'orphelin' }] }, OPTS);
  assert.deepEqual(s.map((x) => x.titre), ['A']);
});

/* --------------------------- meilleurTitre ------------------------ */

test('meilleurTitre : trouve la tâche par recouvrement de mots', () => {
  const cand = [
    { ref: 'A', titre: 'Rédiger le chapitre 3' },
    { ref: 'B', titre: 'Lire Vasseur' },
    { ref: 'C', titre: 'Envoyer le mail à Solène' },
  ];
  assert.equal(Ariane.meilleurTitre('rédaction du chapitre 3', cand).ref, 'A');
  assert.equal(Ariane.meilleurTitre('le mail pour solène', cand).ref, 'C');
});

test('meilleurTitre : rien de probant -> null', () => {
  assert.equal(Ariane.meilleurTitre('acheter du café', [{ ref: 'A', titre: 'Rédiger le chapitre' }]), null);
  assert.equal(Ariane.meilleurTitre('', [{ ref: 'A', titre: 'x' }]), null);
});

/* ------- aplatir / reconstruire / déplacer les specs (hiérarchie) ----- */

const ARBRE = () => ([
  { titre: 'A', enfants: [
    { titre: 'A1', enfants: [] },
    { titre: 'A2', enfants: [] },
  ] },
  { titre: 'B', enfants: [] },
  { titre: 'C', enfants: [{ titre: 'C1', enfants: [] }] },
]);

const platTxt = (plat) => plat.map((x) => x.n.titre + x.prof).join(' ');
const titresArbre = (arbre) => Ariane.aplatirSpecsTaches(arbre)
  .map((x) => x.n.titre + x.prof).join(' ');

test('aplatirSpecsTaches / reconstruireSpecsTaches : aller-retour', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  assert.equal(platTxt(plat), 'A0 A11 A21 B0 C0 C11');
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(plat)), 'A0 A11 A21 B0 C0 C11');
});

test('reconstruireSpecsTaches : saut de profondeur ramené sous le parent ouvert', () => {
  const arbre = Ariane.reconstruireSpecsTaches([
    { n: { titre: 'A', enfants: [] }, prof: 0 },
    { n: { titre: 'X', enfants: [] }, prof: 2 },
  ]);
  assert.equal(titresArbre(arbre), 'A0 X1');
});

test('deplacerSpecTaches : remonte une tâche au-dessus d\'un bloc', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  const apres = Ariane.deplacerSpecTaches(plat, 3, 0, 0); // B tout en haut
  assert.equal(platTxt(apres), 'B0 A0 A11 A21 C0 C11');
});

test('deplacerSpecTaches : imbrique C sous A2, la descendance suit', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  assert.equal(Ariane.depotSpecTaches(plat, 4, 3).profMax, 2); // enfant de A2
  const apres = Ariane.deplacerSpecTaches(plat, 4, 3, 2);
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(apres)), 'A0 A11 A21 C2 C13 B0');
});

test('deplacerSpecTaches : remonte un bloc entier avec sa descendance', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  const apres = Ariane.deplacerSpecTaches(plat, 0, 6, 0); // A (et A1, A2) à la fin
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(apres)), 'B0 C0 C11 A0 A11 A21');
});

test('deplacerSpecTaches : interdit de se poser dans sa propre descendance', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  assert.equal(Ariane.depotSpecTaches(plat, 0, 2), null);
  assert.equal(Ariane.deplacerSpecTaches(plat, 0, 1, 0), null);
  assert.equal(Ariane.deplacerSpecTaches(plat, 0, 2, 0), null);
});

test('deplacerSpecTaches : profondeur bornée au voisinage du trou', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  // tout en haut : profMax = 0, même si l'on demande 3
  assert.equal(platTxt(Ariane.deplacerSpecTaches(plat, 4, 0, 3)), 'C0 C11 A0 A11 A21 B0');
  // après B (prof 0) : profMax = 1, C1 suit d'autant
  const apres = Ariane.deplacerSpecTaches(plat, 4, 4, 5);
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(apres)), 'A0 A11 A21 B0 C1 C12');
});

test('normaliserSpecsTaches : datesLibres accepte toute date valide rendue par l’IA', () => {
  const brut = [{ titre: 'Relire le chapitre', echeance: '2026-10-09', debut: '2026-02-30' }];
  const libre = Ariane.normaliserSpecsTaches(brut, { familles: ['action'], datesLibres: true });
  assert.equal(libre[0].echeance, '2026-10-09');
  assert.equal(libre[0].debut, '');
  const garde = Ariane.normaliserSpecsTaches(brut, { familles: ['action'], dates: new Set() });
  assert.equal(garde[0].echeance, '');
});

test('lireTachesLN : plusieurs tâches, dépendance par rang, rangs recalculés', () => {
  const l = Ariane.lireTachesLN([
    { titre: 'Rédiger le résumé du webinaire', famille: 'production', echeance: '2026-10-05', apres: null },
    { titre: '' },
    { titre: 'Envoyer le résumé à Solène', famille: 'action', echeance: '2026-10-05', apres: 0 },
    { titre: 'Relire', apres: 9, bloque_par: 'Chapitre 2' },
  ], { familles: ['action', 'production'] });
  assert.deepEqual(l.map((x) => x.titre), ['Rédiger le résumé du webinaire', 'Envoyer le résumé à Solène', 'Relire']);
  assert.equal(l[1].apres, 0);
  assert.equal(l[1].echeance, '2026-10-05');
  assert.equal(l[2].apres, null);
  assert.equal(l[2].bloquePar, 'Chapitre 2');
});

test('lireTachesLN : un objet seul ou { taches } sont acceptés', () => {
  assert.equal(Ariane.lireTachesLN({ titre: 'Lire X' }, { familles: ['action'] }).length, 1);
  assert.equal(Ariane.lireTachesLN({ taches: [{ titre: 'A' }, { titre: 'B', apres: 0 }] },
    { familles: ['action'] })[1].apres, 0);
});

/* ---------------------- modèle d'un dossier ----------------------- */

test('modèle d’un dossier : par le nom, au singulier près, numéro et accents ignorés', () => {
  const modeles = ['Compte-rendu de réunion', 'Fiche graphique', 'Note conceptuelle',
    'Note préparatoire de réunion', 'Note réflexive', 'Résumé thèse'].map((b) => ({ basename: b, path: 'M/' + b + '.md' }));
  const m = (noms) => (Ariane.modelePourNoms(noms, modeles) || {}).basename || null;
  assert.equal(m(['Notes réflexives', '06 - Notes réflexives']), 'Note réflexive');
  assert.equal(m(['Comptes-rendus de réunion']), 'Compte-rendu de réunion');
  assert.equal(m(['Notes préparatoires de réunions']), 'Note préparatoire de réunion');
  assert.equal(m(['Fiches graphiques']), 'Fiche graphique');
  assert.equal(m(['03 - Notes conceptuelles']), 'Note conceptuelle');
  assert.equal(m(['08 - Tâches', 'Tâches']), null);
});

test('diagnosticClaude : la cause, pas la ligne de commande ; le remède à une connexion expirée', () => {
  const d = (err, erreurs) => Ariane.diagnosticClaude(err, erreurs, 'claude');
  const longue = { message: 'Command failed: claude --model sonnet -p Tu transformes…\nFailed to authenticate: OAuth session expired and could not be refreshed', code: 1 };
  const m = d(longue, 'Failed to authenticate: OAuth session expired and could not be refreshed\n');
  assert.match(m, /expiré/);
  assert.match(m, /\/login/);
  assert.ok(!/Tu transformes/.test(m), 'l’invite ne revient pas dans le message');
  assert.match(d(longue, ''), /expiré/, 'la cause se lit aussi dans le message');
  assert.match(d({ code: 'ENOENT' }, ''), /introuvable/);
  assert.match(d({ killed: true, signal: 'SIGTERM' }, ''), /délai/);
  assert.equal(d({ message: 'Command failed: claude -p x\nerreur réseau', code: 1 }, ''), 'CLI Claude : erreur réseau');
});

test('langage naturel : la note visée devient le livrable de la tâche', async () => {
  const notes = [
    { nom: 'Risque', cle: 'NC-1', concept: true }, { nom: 'Risque émergent', cle: 'NC-2', concept: true },
    { nom: 'Gouvernance des risques', cle: 'NC-3', concept: true }, { nom: 'Partie 1 - Cadrage théorique', cle: 'Partie 1 - Cadrage théorique' },
  ];
  let invite = '';
  const g = Object.assign(Object.create(Ariane.prototype), {
    settings: { familleTacheDefaut: 'action' },
    _notesConceptuelles: () => notes.filter((n) => n.concept).map(({ nom, cle }) => ({ nom, cle })),
    notesPourChoix: () => notes.map(({ nom, cle }) => ({ nom, cle })),
    famillesIA: () => [{ id: 'production' }, { id: 'lecture' }, { id: 'action' }],
    _blocFamilles: () => '',
    genererIA: async (p) => { invite = p; return ([
      { titre: 'Rédiger la note conceptuelle sur le risque', famille: 'production', note_visee: 'Risque' },
      { titre: 'Compléter la gouvernance', famille: 'production', note_visee: 'gouvernance des risques' },
      { titre: 'Relire le cadrage', famille: 'production', note_visee: 'cadrage théorique partie 1' },
      { titre: 'Lire Beck', famille: 'lecture', note_visee: 'Risque' },
      { titre: 'Appeler le labo', famille: 'action', note_visee: '' },
      { titre: 'Écrire sur la météo', famille: 'production', note_visee: 'Météorologie' },
      { titre: 'Rédiger la note sur le risque émergé', famille: 'production', note_visee: 'risques émergents' },
      { titre: 'Créer la note sur la résilience', famille: 'production', note_visee: 'Risque organisationnel' },
    ]); },
  });
  const specs = await g.analyserTachesLN('rédiger la note conceptuelle sur le risque, etc.');
  assert.match(invite, /Notes conceptuelles du coffre : Risque ; Risque émergent ; Gouvernance des risques\./);
  assert.deepEqual(specs.map((s) => s.livrable || ''),
    ['[[NC-1]]', '[[NC-3]]', '[[Partie 1 - Cadrage théorique]]', '', '', '', '[[NC-2]]', ''],
    'pluriel près ; jamais une note qui ne partage que quelques mots');
  assert.equal(Ariane.memesMots('Risque', 'Risque émergent'), 0.5);
  assert.equal(specs[0].livrableNom, 'Risque');
});

/* ------------- Fenêtre de création : langage naturel d'emblée ------------- */

test('Création d\'une tâche : la fenêtre s\'ouvre sur le langage naturel, le formulaire en option', () => {
  const { ModaleTache } = Ariane._test;
  const greffon = { settings: { famillesTaches: [{ id: 'action' }, { id: 'lecture' }] }, analyserTachesLN: async () => [] };
  assert.equal(new ModaleTache({}, greffon, {}).modeLN, true);
  // Modifier une tâche, ou convertir une carte déjà écrite : le formulaire.
  assert.equal(new ModaleTache({}, greffon, { ref: 'T001' }).modeLN, false);
  assert.equal(new ModaleTache({}, greffon, { defauts: { intitule: 'X', note: 'corps' } }).modeLN, false);
  // Sans IA des tâches : le formulaire.
  assert.equal(new ModaleTache({}, { settings: {} }, {}).modeLN, false);

  // « Remplir à la main » après analyse : la première tâche retenue pré-remplit.
  const m = new ModaleTache({}, greffon, {});
  let dessine = 0;
  m._dessiner = () => { dessine++; };
  m._texteLN = 'relire Latour pour vendredi';
  m._texteAnalyse = 'relire Latour pour vendredi';
  m._specsLN = [{ titre: 'Écarté', inclus: false }, { titre: 'Relire Latour', famille: 'lecture', echeance: '2026-11-06' }];
  m._versFormulaire();
  assert.equal(m.modeLN, false);
  assert.equal(dessine, 1);
  assert.equal(m.v.intitule, 'Relire Latour');
  assert.equal(m.v.famille, 'lecture');
  assert.equal(m.v.echeance, '2026-11-06');
  // Sans analyse à jour : la description devient l'intitulé.
  const n = new ModaleTache({}, greffon, {});
  n._dessiner = () => {};
  n._texteLN = 'Écrire le plan\nsuite';
  n._specsLN = [{ titre: 'Ancien' }];
  n._texteAnalyse = 'autre chose';
  n._versFormulaire();
  assert.equal(n.v.intitule, 'Écrire le plan');
});

test('Création en langage naturel : Entrée analyse, puis crée ; la fenêtre se ferme avant `apres`', async () => {
  const { ModaleTache } = Ariane._test;
  const ordre = [];
  const rattaches = [];
  const greffon = {
    settings: {},
    analyserTachesLN: async () => [{ titre: 'Relire', famille: 'action' }],
    creerTachesLN: async (specs) => { ordre.push('cree'); return specs.filter((s) => s.inclus !== false).map((_, i) => 'T09' + i); },
    rattacher: async (r, p) => { rattaches.push([r, p]); },
  };
  const m = new ModaleTache({}, greffon, { defauts: { parent: 'T001' }, apres: (ref) => ordre.push('apres ' + ref) });
  m.close = () => ordre.push('ferme');
  m.apercuLN = { empty() {} };
  m._apercuLN = () => {};
  m._texteLN = 'relire';
  m._agirLN();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(m._specsLN.map((s) => s.titre), ['Relire'], 'premier Entrée : analyse');
  m._texteLN = 'relire ';
  assert.equal(m._lnAJour(), true, 'des espaces en plus ne périment pas l\'aperçu');
  m._texteLN = 'relire et envoyer';
  assert.equal(m._lnAJour(), false, 'un texte retouché se ré-analyse');
  m._texteLN = 'relire';
  await m._creerLN();
  assert.deepEqual(ordre, ['cree', 'ferme', 'apres T090']);
  assert.deepEqual(rattaches, [['T090', 'T001']], 'la mère fixée par l\'appelant vaut pour la tâche décrite');
  // Rien de créé : la fenêtre reste ouverte et se laisse réessayer.
  const k = new ModaleTache({}, Object.assign({}, greffon, { creerTachesLN: async () => [] }), {});
  let fermee = false;
  k.close = () => { fermee = true; };
  k._specsLN = [{ titre: 'X' }];
  await k._creerLN();
  assert.equal(fermee, false);
  assert.equal(k.repondu, false);
});
