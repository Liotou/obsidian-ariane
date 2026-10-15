const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const DEF = 'T-{n:3}';
const suivante = (noms, gabarit) => Ariane.referenceTacheSuivante(noms, gabarit || DEF);

/* --------------------- formatModele -------------------------------- */

test('formatModele : {n} et {n:3}', () => {
  assert.equal(Ariane.formatModele('T-{n:3}', { n: 7 }), 'T-007');
  assert.equal(Ariane.formatModele('#{n}', { n: 42 }), '#42');
  assert.equal(Ariane.formatModele('{n:2}', { n: 1234 }), '1234'); // jamais tronqué
});

test('formatModele : jetons de texte et jeton inconnu', () => {
  assert.equal(
    Ariane.formatModele('[{ref}] - {intitule}', { ref: 'T-001', intitule: 'Lire' }),
    '[T-001] - Lire');
  assert.equal(Ariane.formatModele('{ref} {absent}', { ref: 'X' }), 'X {absent}');
});

test('analyserGabaritRef : un seul jeton {n} obligatoire', () => {
  assert.deepEqual(Ariane.analyserGabaritRef('T-{n:3}'),
    { prefixe: 'T-', suffixe: '', largeur: 3 });
  assert.deepEqual(Ariane.analyserGabaritRef('{n:4}'),
    { prefixe: '', suffixe: '', largeur: 4 });
  assert.equal(Ariane.analyserGabaritRef('rien'), null);
  assert.equal(Ariane.analyserGabaritRef('{n}-{n}'), null);
});

/* --------------------- referenceTacheSuivante --------------------- */

test('la première tâche porte le rang 001 (gabarit par défaut)', () => {
  assert.equal(suivante([]), 'T-001');
});

test('le rang suit le plus grand déjà employé', () => {
  assert.equal(suivante(['T-001', 'T-002']), 'T-003');
});

test('un trou dans la numérotation ne réattribue pas le rang libéré', () => {
  assert.equal(suivante(['T-001', 'T-004']), 'T-005');
});

test('un coffre déjà numéroté à l ancienne continue sa série', () => {
  assert.equal(suivante(['T26-041', 'T26-040']), 'T-042');
});

test('au delà de 999 la référence garde tous ses chiffres', () => {
  assert.equal(suivante(['T-999']), 'T-1000');
});

test('un nom qui ne suit pas la convention est ignoré', () => {
  assert.equal(suivante(['Brouillon', 'T-abc', 'T-']), 'T-001');
});

test('gabarit personnalisé sans préfixe', () => {
  assert.equal(suivante(['0007'], '{n:4}'), '0008');
});

test('gabarit personnalisé avec préfixe et sans largeur', () => {
  assert.equal(suivante(['TASK-7'], 'TASK-{n}'), 'TASK-8');
});

test('gabarit invalide : repli sur T-{n:3}', () => {
  assert.equal(suivante(['T-005'], 'sans jeton'), 'T-006');
});

/* --------------------- incrementerRef & refDansTexte ------------- */

test('incrementerRef : derniers chiffres, largeur conservée', () => {
  assert.equal(Ariane.incrementerRef('T-007'), 'T-008');
  assert.equal(Ariane.incrementerRef('T-099'), 'T-100');
  assert.equal(Ariane.incrementerRef('Sans titre'), 'Sans titre-2');
});

test('refDansTexte : jeton entre crochets puis sous-chaîne', () => {
  const refs = new Set(['T-001', 'T26-014', 'AB']);
  assert.equal(Ariane.refDansTexte('[T-001] - Lire', refs), 'T-001');
  assert.equal(Ariane.refDansTexte('T26-014. Rédiger', refs), 'T26-014');
  assert.equal(Ariane.refDansTexte('rien de connu', refs), '');
  assert.equal(Ariane.refDansTexte('AB truc', refs), ''); // trop court, ignoré
});

/* --------------------- refDepuisChemin ------------------------------ */

const rc = (chemin, dossier) => Ariane.refDepuisChemin(chemin, dossier);

test('une note du dossier des tâches : la référence est son nom de fichier', () => {
  assert.equal(rc('8 - Tâches/Lire Bonnefoy.md', '8 - Tâches'), 'Lire Bonnefoy');
});

test('une note dans un sous-dossier du dossier des tâches compte aussi', () => {
  assert.equal(rc('8 - Tâches/Thèse/Chapitre 2.md', '8 - Tâches'), 'Chapitre 2');
});

test('une ancienne référence T26-xxx est reconnue où qu elle soit', () => {
  assert.equal(rc('ailleurs/T26-014.md', '8 - Tâches'), 'T26-014');
});

test('une note hors du dossier et sans forme T26 n est pas une tâche', () => {
  assert.equal(rc('Lectures/Bonnefoy 2005.md', '8 - Tâches'), null);
});

test('un fichier non .md n est jamais une tâche', () => {
  assert.equal(rc('8 - Tâches/pièce jointe.pdf', '8 - Tâches'), null);
  assert.equal(rc('8 - Tâches/Tâches.base', '8 - Tâches'), null);
});

test('sans dossier configuré, seule la forme T26 est reconnue', () => {
  assert.equal(rc('n importe où/T26-003.md', ''), 'T26-003');
  assert.equal(rc('n importe où/Note.md', ''), null);
});

test('un nom générique « Sans titre » (avec ou sans numéro) appelle une référence', () => {
  const g = (n) => Ariane.estNomTacheGenerique(n);
  assert.equal(g('Sans titre'), true);
  assert.equal(g('sans titre'), true);
  assert.equal(g('Sans titre 1'), true);
  assert.equal(g('Untitled'), true);
  assert.equal(g('Untitled 12'), true);
  assert.equal(g('  Sans titre  '), true);
});

test('un nom choisi par l utilisateur est respecté, même s il commence par « Sans titre »', () => {
  const g = (n) => Ariane.estNomTacheGenerique(n);
  assert.equal(g('Sans titre du chapitre'), false);
  assert.equal(g('T26-004'), false);
  assert.equal(g('Rédiger l intro'), false);
  assert.equal(g(''), false);
});

test('sousDossier : chemin dans un dossier listé ou un sous-dossier', () => {
  const D = ['8 - Tâches', ' 9 - Journal/ '];
  assert.equal(Ariane.sousDossier('8 - Tâches/T26-001.md', D), true);
  assert.equal(Ariane.sousDossier('8 - Tâches/2026/T26-050.md', D), true);
  assert.equal(Ariane.sousDossier('9 - Journal/2026-08-31.md', D), true);
  assert.equal(Ariane.sousDossier('Lectures/Bonnefoy.md', D), false);
  assert.equal(Ariane.sousDossier('8 - Tâchesbis/x.md', D), false); // pas un préfixe de segment
  assert.equal(Ariane.sousDossier('x.md', []), false);
  assert.equal(Ariane.sousDossier('x.md', ['', '  ']), false);
});

test('références orphelines : fiche absente ou à la corbeille, et jamais sur une base mal lue', () => {
  const notes = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD', 'EEEEEEEE', 'FFFFFFFF', 'GGGGGGGG', 'HHHHHHHH']
    .map((cle) => ({ cle }));
  const etats = new Map(notes.map((n) => [n.cle, 'active']));
  etats.delete('BBBBBBBB');
  etats.set('CCCCCCCC', 'corbeille');
  const o = Ariane.referencesOrphelines(notes, etats, 3000);
  assert.deepEqual(o.map((x) => x.cle + ':' + x.etat), ['BBBBBBBB:absente', 'CCCCCCCC:corbeille']);
  assert.deepEqual(Ariane.referencesOrphelines(notes, etats, 0), [], 'base vide : rien');
  assert.deepEqual(Ariane.referencesOrphelines(notes, new Map(), 3000), [], 'plus aucune note reconnue : base mal lue, rien');
});

test('proposerRoles(true) : un rôle qui désigne un dossier absent suit le dossier existant, même vide', () => {
  const dossiers = ['02 - Annotations', '11 - Notes de lecture', '08 - Tâches'];
  const settings = { dossierNotesLecture: '2 - Notes de lecture', dossierAnnotations: '02 - Annotations', dossierTaches: '' };
  const app = { vault: {
    getMarkdownFiles: () => [{ path: '02 - Annotations/@a/K.md' }],
    getAllLoadedFiles: () => dossiers.map((p) => ({ path: p, children: [] })),
    getAbstractFileByPath: (p) => (dossiers.includes(p) ? { path: p } : null),
  } };
  const n = Ariane.prototype.proposerRoles.call({ app, settings }, true);
  assert.equal(n, 1);
  assert.equal(settings.dossierNotesLecture, '11 - Notes de lecture');
  assert.equal(settings.dossierTaches, '');            // rôle vide : laissé au choix de l'utilisateur
  assert.equal(settings.dossierAnnotations, '02 - Annotations');
});

test('extraireNotesFilles : les mentions de catalogue ne deviennent pas des notes de lecture', () => {
  const { extraireNotesFilles } = Ariane._test;
  const bloc = (cle, corps) => '<!-- ZF_NOTE_BEG_' + cle + ' -->\n' + corps + '\n<!-- ZF_NOTE_END_' + cle + ' -->\n';
  const t = bloc('AAAA1111', 'Bibliography: p. 287-290') + bloc('BBBB2222', 'Hier auch später erschienene, unveränderte Nachdrucke')
    + bloc('CCCC3333', 'Includes bibliographical references and index.') + bloc('DDDD4444', 'Aborde la notion d’écosystème.');
  assert.deepEqual(extraireNotesFilles(t).map((b) => b.cle), ['DDDD4444']);
});

test('contenuNoteLecture : la note de lecture se déclare verrouillée, comme une note d’annotation', () => {
  const t = Ariane.prototype.contenuNoteLecture.call({}, { basename: '@aven2011' },
    { cle: 'NOTEKEY1', titre: 'Synthèse', corps: 'Le texte de la note.' }, new Map(), new Map());
  assert.match(t, /\nzotflow-note-key: NOTEKEY1\n/);
  assert.match(t, /\nzotflow-auto: true\nzotflow-locked: true\n---\n/);
  assert.match(t, /Le texte de la note\.\n$/);
});
