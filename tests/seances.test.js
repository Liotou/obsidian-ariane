// Séances empruntées : une descendante retenue pour la séance d'une
// ascendante garde le créneau en mémoire (propriété « Séances »), à part de
// ses créneaux propres, et cela à tous les étages.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const obsidian = require('obsidian');

const encadrer = (bloc) => ['# Tâche', '', '<!-- ariane:creneaux -->', bloc, '<!-- /ariane:creneaux -->', ''].join('\n');

test('lireSeance / formatSeance : le créneau puis la tâche d\'origine', () => {
  assert.deepEqual(Ariane.lireSeance('2026-11-13 14:00-16:00 T070'),
    { debut: '2026-11-13T14:00', fin: '2026-11-13T16:00', brut: '2026-11-13 14:00-16:00', origine: 'T070' });
  assert.equal(Ariane.lireSeance('2026-11-13 14:00-16:00 [[T070]]').origine, 'T070');
  assert.equal(Ariane.lireSeance('2026-11-13 14:00-16:00'), null, 'sans origine');
  assert.equal(Ariane.lireSeance('n\'importe quoi'), null);
  assert.equal(Ariane.formatSeance({ debut: '2026-11-13T14:00', fin: '2026-11-13T16:00' }, '[[T070]]'),
    '2026-11-13 14:00-16:00 T070');
  // Triées par début, sans doublon.
  assert.deepEqual(Ariane.seancesDeTache(['2026-11-14 09:00-10:00 T071', '2026-11-13 14:00-16:00 T070',
    '2026-11-13 14:00-16:00 T070']).map((x) => x.origine), ['T070', 'T071']);
});

// Trois générations : T070 > T071 > T072, et T073, autre fille de T070.
const LIGNEE = [
  { ref: 'T070', parent: '' },
  { ref: 'T071', parent: '[[T070]]' },
  { ref: 'T072', parent: '[[T071]]' },
  { ref: 'T073', parent: '[[T070]]' },
  { ref: 'T090', parent: '' },
];

test('projectionSeances : la retenue et toute sa lignée jusqu\'à l\'origine, l\'origine exclue', () => {
  const cr = ['2026-11-13 14:00-16:00', '2026-11-14 09:00-10:00'];
  const coms = {
    '11-13T14:00': 'Plan\n- [[T072|Petite-fille]]',
    '11-14T09:00': '- [[T073]]\n- [[T090]]',
  };
  const p = Ariane.projectionSeances('T070', LIGNEE, cr, coms);
  assert.deepEqual(Object.fromEntries(p), {
    T072: ['2026-11-13 14:00-16:00 T070'],
    T071: ['2026-11-13 14:00-16:00 T070'],   // l'échelon intermédiaire
    T073: ['2026-11-14 09:00-10:00 T070'],
  });
  assert.ok(!p.has('T090'), 'une retenue hors de la lignée ne reçoit rien');
  assert.ok(!p.has('T070'), 'l\'origine ne s\'emprunte pas à elle-même');
  // Une boucle de rattachements ne fait pas tourner sans fin.
  const boucle = [{ ref: 'A', parent: '[[B]]' }, { ref: 'B', parent: '[[A]]' }];
  assert.equal(Ariane.projectionSeances('T070', boucle, cr, { '11-13T14:00': '- [[A]]' }).size, 0);
});

test('seancesReconciliees : seules les séances de l\'origine sont remplacées', () => {
  const avant = ['2026-11-14 09:00-10:00 T071', '2026-11-13 14:00-16:00 T070', 'écrit à la main'];
  assert.deepEqual(Ariane.seancesReconciliees(avant, 'T070', ['2026-11-20 14:00-16:00 T070']),
    ['2026-11-14 09:00-10:00 T071', '2026-11-20 14:00-16:00 T070', 'écrit à la main']);
  assert.deepEqual(Ariane.seancesReconciliees(avant, 'T070', []),
    ['2026-11-14 09:00-10:00 T071', 'écrit à la main']);
});

test('blocCreneaux : principal et séance distingués, temps de séance à part, commentaires relus', () => {
  const cr = ['2026-11-12 10:00-11:00'];
  const bloc = Ariane.blocCreneaux(cr, Ariane.statsCreneaux(cr, '2026-11-01T00:00'),
    { '11-12T10:00': 'Mon travail' }, [], ['2026-11-13 14:00-16:00 T070']);
  assert.match(bloc, /\| Session \| Date \| Heures \| Durée \| Commentaire \| Créneau \|/);
  assert.match(bloc, /\| 1 \| .* \| 1 h 00 \| Mon travail \| principal \|/);
  assert.match(bloc, /\| 2 \| .* \| 2 h 00 \|  \| séance de \[\[T070\]\] \|/);
  assert.match(bloc, /\*\*1 session · 1 h 00 planifiées/, 'le temps prévu ne compte que le créneau principal');
  assert.match(bloc, /\*\*En séance, pour mémoire : 1 créneau, 2 h 00 \(comptés dans la tâche d'origine\)\*\*/);
  // Le commentaire du créneau principal se relit dans le tableau à six colonnes.
  assert.deepEqual(Ariane.commentairesDuBloc(encadrer(bloc)), { '11-12T10:00': 'Mon travail' });
  // Sans séance, le tableau garde ses cinq colonnes (les notes ne bougent pas).
  assert.equal(Ariane.blocCreneaux(cr, null, {}, [], []), Ariane.blocCreneaux(cr, null, {}));
  // Une tâche qui n'a que des séances empruntées a tout de même ses Sessions.
  const seul = Ariane.blocCreneaux([], null, {}, [], ['2026-11-13 14:00-16:00 T070']);
  assert.match(seul, /^## Sessions/);
  assert.doesNotMatch(seul, /planifiées/);
});

// Un petit coffre : frontmatter et texte de chaque tâche, écritures notées.
function coffre(etat) {
  const g = Object.create(Ariane.prototype);
  const fichiers = {};
  const fichier = (ref) => fichiers[ref] || (fichiers[ref] = Object.assign(new obsidian.TFile(),
    { path: '08 - Tâches/' + ref + '.md', basename: ref }));
  const ecrits = [];
  Object.assign(g, {
    settings: {},
    app: {
      metadataCache: { getFileCache: (f) => ({ frontmatter: (etat[f.basename] || {}).fm }) },
      vault: {
        read: async (f) => (etat[f.basename] || {}).texte || '',
        cachedRead: async (f) => (etat[f.basename] || {}).texte || '',
      },
      fileManager: {
        processFrontMatter: async (f, fn) => { fn(etat[f.basename].fm); ecrits.push(f.basename); },
      },
    },
    fichierDeRef: (r) => (etat[r] ? fichier(r) : null),
    refDeChemin: (p) => (/(T\d+)\.md$/.exec(p) || [])[1] || null,
    cleT: (c) => c,
    _lireT: (fm, c) => (fm || {})[c],
    marquerEcriture() {},
    majBlocCreneaux: async () => true,
    tachesPourGantt: () => Object.keys(etat).map((ref) => ({
      ref, parent: etat[ref].fm.parent || '', fichier: fichier(ref),
      creneaux: [].concat(etat[ref].fm.creneaux || []),
      seances: [].concat(etat[ref].fm.seances || []),
    })),
  });
  return { g, ecrits };
}

const seance = (cr, refs) => encadrer(Ariane.blocCreneaux(cr, null,
  { [Ariane.cleCommentaire(cr[0])]: Ariane.commentaireDeSeance('Séance', refs.map((ref) => ({ ref }))) }));

function troisGenerations() {
  return {
    T070: { fm: { creneaux: ['2026-11-13 14:00-16:00'] }, texte: seance(['2026-11-13 14:00-16:00'], ['T072']) },
    T071: { fm: { parent: '[[T070]]', creneaux: ['2026-11-12 10:00-11:00'] }, texte: '' },
    T072: { fm: { parent: '[[T071]]' }, texte: '' },
    T073: { fm: { parent: '[[T070]]' }, texte: '' },
  };
}

test('propagerSeances : création sur trois générations, sans toucher aux créneaux propres', async () => {
  const etat = troisGenerations();
  const { g, ecrits } = coffre(etat);
  assert.equal(await g.propagerSeances('T070'), 2);
  assert.deepEqual(etat.T072.fm.seances, ['2026-11-13 14:00-16:00 T070']);
  assert.deepEqual(etat.T071.fm.seances, ['2026-11-13 14:00-16:00 T070'], 'l\'échelon intermédiaire');
  assert.deepEqual(etat.T071.fm.creneaux, ['2026-11-12 10:00-11:00'], 'le créneau principal reste seul dans « creneaux »');
  assert.equal(etat.T073.fm.seances, undefined, 'la sœur non retenue ne reçoit rien');
  assert.equal(etat.T070.fm.seances, undefined);
  assert.equal(etat.T072.fm.modifie, undefined, 'une mémoire, pas une modification');
  // Rien de nouveau : rien ne s'écrit (c'est ce qui arrête l'écoute).
  ecrits.length = 0;
  assert.equal(await g.propagerSeances('T070'), 0);
  assert.deepEqual(ecrits, []);
});

test('propagerSeances : la fille tient séance à son tour, les deux origines se cumulent', async () => {
  const etat = troisGenerations();
  etat.T071.texte = seance(['2026-11-12 10:00-11:00'], ['T072']);
  const { g } = coffre(etat);
  await g.propagerSeances('T070');
  await g.propagerSeances('T071');
  assert.deepEqual(etat.T072.fm.seances, ['2026-11-12 10:00-11:00 T071', '2026-11-13 14:00-16:00 T070']);
  assert.deepEqual(etat.T071.fm.seances, ['2026-11-13 14:00-16:00 T070'], 'pas de séance empruntée à soi-même');
});

test('propagerSeances : créneau déplacé, descendante retirée, créneau supprimé, origine disparue', async () => {
  const etat = troisGenerations();
  const { g } = coffre(etat);
  await g.propagerSeances('T070');
  // Déplacé : le commentaire a suivi le créneau, la séance suit chez toutes.
  etat.T070.fm.creneaux = ['2026-11-20 09:00-11:00'];
  etat.T070.texte = seance(['2026-11-20 09:00-11:00'], ['T072']);
  await g.propagerSeances('T070');
  assert.deepEqual(etat.T072.fm.seances, ['2026-11-20 09:00-11:00 T070']);
  assert.deepEqual(etat.T071.fm.seances, ['2026-11-20 09:00-11:00 T070']);
  // T073 retenue à la place de T072 : T072 et T071 perdent la séance.
  etat.T070.texte = seance(['2026-11-20 09:00-11:00'], ['T073']);
  await g.propagerSeances('T070');
  assert.ok(!('seances' in etat.T072.fm), 'propriété retirée quand vide');
  assert.ok(!('seances' in etat.T071.fm));
  assert.deepEqual(etat.T073.fm.seances, ['2026-11-20 09:00-11:00 T070']);
  // Créneau supprimé (passé par l'appelant, que le cache ne voit pas encore).
  await g.propagerSeances('T070', { creneaux: [] });
  assert.ok(!('seances' in etat.T073.fm));
  // Origine disparue : tout ce qu'elle avait laissé s'en va.
  await g.propagerSeances('T070');
  assert.ok('seances' in etat.T073.fm);
  delete etat.T070;
  await g.propagerSeances('T070');
  assert.ok(!('seances' in etat.T073.fm));
});

test('veillerSeances : une descendante qui change de lignée perd puis gagne les séances', async () => {
  const etat = troisGenerations();
  etat.T080 = { fm: { creneaux: ['2026-11-15 08:00-09:00'] }, texte: seance(['2026-11-15 08:00-09:00'], ['T072']) };
  const { g } = coffre(etat);
  await g.propagerSeances('T070');
  assert.deepEqual(etat.T072.fm.seances, ['2026-11-13 14:00-16:00 T070']);
  // T072 passe sous T080 : la séance de T070 part (elle n'est plus de sa
  // lignée), celle de T080, qui la retenait déjà, arrive.
  etat.T072.fm.parent = '[[T080]]';
  await g.veillerSeances('T072');
  assert.deepEqual(etat.T072.fm.seances, ['2026-11-15 08:00-09:00 T080']);
  assert.ok(!('seances' in etat.T071.fm), 'l\'ancien échelon intermédiaire aussi');
});

test('rattraperSeances : les séances tenues avant cette version, à tous les étages', async () => {
  const etat = troisGenerations();
  etat.T071.texte = seance(['2026-11-12 10:00-11:00'], ['T072']);
  const { g } = coffre(etat);
  // Trois écritures : T072 et T071 pour la séance de T070, puis T072 pour celle de T071.
  assert.equal(await g.rattraperSeances(), 3);
  assert.deepEqual(etat.T072.fm.seances, ['2026-11-12 10:00-11:00 T071', '2026-11-13 14:00-16:00 T070']);
  assert.deepEqual(etat.T071.fm.seances, ['2026-11-13 14:00-16:00 T070']);
  assert.equal(await g.rattraperSeances(), 0, 'idempotent');
});

test('ModaleSeance : toute la descendance, en arbre, les abandonnées écartées', () => {
  const toutes = [
    { ref: 'T071', parent: '[[T070]]', statut: 'à faire', intitule: 'Fille' },
    { ref: 'T072', parent: '[[T071]]', statut: 'à faire', intitule: 'Petite-fille' },
    { ref: 'T074', parent: '[[T075]]', statut: 'à faire', intitule: 'Fille d\'abandonnée' },
    { ref: 'T075', parent: '[[T070]]', statut: 'abandonnée', intitule: 'Abandonnée' },
    { ref: 'T073', parent: '[[T070]]', statut: 'à faire', intitule: 'Sœur' },
    { ref: 'T090', parent: '', statut: 'à faire', intitule: 'Étrangère' },
  ];
  const m = Object.create(Ariane._test.ModaleSeance.prototype);
  Object.assign(m, { o: { greffon: { tachesPourGantt: () => toutes }, mere: { ref: 'T070' } }, noms: {}, retenues: [] });
  assert.deepEqual(m._filles().map((t) => [t.ref, t.prof]),
    [['T071', 0], ['T072', 1], ['T074', 0], ['T073', 0]]);
});
