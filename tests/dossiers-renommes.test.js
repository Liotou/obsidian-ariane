const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const DOSSIERS = ['00 - Cadrage', '02 - Annotations', '03 - Notes conceptuelles',
  '07 - Journal du temps', '08 - Tâches', '04 - Livrables', '04 - Livrables/Réunions'];

test('normaliser un dossier : zéros de tête et casse mis de côté', () => {
  assert.equal(Ariane.normaliserDossier('7 - Journal du temps'), '7 - journal du temps');
  assert.equal(Ariane.normaliserDossier('07 - Journal du temps'), '7 - journal du temps');
  assert.equal(Ariane.normaliserDossier('007 - JOURNAL du temps'), '7 - journal du temps');
  assert.equal(Ariane.normaliserDossier('04 - Livrables/01 - Réunions'),
    Ariane.normaliserDossier('4 - Livrables/1 - Réunions'), 'chaque segment est traité');
  assert.equal(Ariane.normaliserDossier('  '), '');
  assert.equal(Ariane.normaliserDossier(null), '');
  // Un zéro seul reste un zéro : on ne rabote pas le dernier chiffre.
  assert.equal(Ariane.normaliserDossier('0 - Racine'), '0 - racine');
});

test('dossier équivalent : le réglage périmé retrouve le dossier réel', () => {
  assert.equal(Ariane.dossierEquivalent('7 - Journal du temps', DOSSIERS), '07 - Journal du temps');
  assert.equal(Ariane.dossierEquivalent('8 - Tâches', DOSSIERS), '08 - Tâches');
  assert.equal(Ariane.dossierEquivalent('4 - Livrables/Réunions', DOSSIERS), '04 - Livrables/Réunions');
});

test('dossier équivalent : rien à faire quand le réglage est juste, ou perdu', () => {
  assert.equal(Ariane.dossierEquivalent('08 - Tâches', DOSSIERS), '', 'le dossier existe déjà');
  assert.equal(Ariane.dossierEquivalent('42 - Inventé', DOSSIERS), '', 'aucun dossier ne correspond');
  assert.equal(Ariane.dossierEquivalent('', DOSSIERS), '');
  assert.equal(Ariane.dossierEquivalent('7 - Journal du temps', []), '');
  // Deux dossiers également plausibles : on ne choisit pas à la place de l'utilisateur.
  assert.equal(Ariane.dossierEquivalent('7 - X', ['7 - x', '07 - X']), '');
});

test('reconciliation : les réglages de dossier suivent le coffre, une liste comprise', () => {
  const greffon = Object.create(Ariane.prototype);
  greffon.settings = {
    dossierTaches: '8 - Tâches',
    tempsDossierJournal: '7 - Journal du temps',
    dossierNotesConceptuelles: '03 - Notes conceptuelles',
    exportDossier: '96 - Inexistant',
    dossierAnnotations: '',
    tempsDossiersExclus: '8 - Tâches\n7 - Journal du temps\n',
    famillesNotes: [{ dossier: '3 - Notes conceptuelles' }],
  };
  greffon.app = {
    vault: { getAllLoadedFiles: () => DOSSIERS.map((p) => ({ path: p, children: [] }))
      .concat([{ path: '08 - Tâches/T001.md' }]) },
  };
  const corriges = greffon.reconcilierDossiersReglages();
  assert.equal(greffon.settings.dossierTaches, '08 - Tâches');
  assert.equal(greffon.settings.tempsDossierJournal, '07 - Journal du temps');
  assert.equal(greffon.settings.tempsDossiersExclus, '08 - Tâches\n07 - Journal du temps\n');
  assert.equal(greffon.settings.dossierNotesConceptuelles, '03 - Notes conceptuelles', 'déjà juste');
  assert.equal(greffon.settings.exportDossier, '96 - Inexistant', 'sans équivalent, on n\'invente rien');
  assert.equal(greffon.settings.dossierAnnotations, '', 'un réglage vide reste vide');
  assert.deepEqual(greffon.settings.famillesNotes, [{ dossier: '3 - Notes conceptuelles' }],
    'la table des familles ne nous regarde pas');
  assert.deepEqual(corriges.sort(), [
    '7 - Journal du temps → 07 - Journal du temps',
    '7 - Journal du temps → 07 - Journal du temps',
    '8 - Tâches → 08 - Tâches',
    '8 - Tâches → 08 - Tâches',
  ]);
});

test('reconciliation : un coffre pas encore lu ne fait rien changer', () => {
  const greffon = Object.create(Ariane.prototype);
  greffon.settings = { dossierTaches: '8 - Tâches' };
  greffon.app = { vault: { getAllLoadedFiles: () => [] } };
  assert.deepEqual(greffon.reconcilierDossiersReglages(), []);
  assert.equal(greffon.settings.dossierTaches, '8 - Tâches');
});

test('dossier équivalent : un dossier renuméroté est retrouvé par son nom', () => {
  assert.equal(Ariane.dossierEquivalent('1 - Annotations', DOSSIERS), '02 - Annotations');
  assert.equal(Ariane.dossierEquivalent('01 - Annotations', DOSSIERS), '02 - Annotations');
  assert.equal(Ariane.dossierEquivalent('3 - Livrables/Réunions', DOSSIERS), '04 - Livrables/Réunions');
  assert.equal(Ariane.dossierEquivalent('5 - Annotations', ['02 - Annotations', '09 - Annotations']), '',
    'deux dossiers du même nom : on ne choisit pas');
  assert.equal(Ariane.dossierEquivalent('Annotations', ['Archives/02 - Annotations']), '',
    'pas d\'un niveau à l\'autre');
  assert.equal(Ariane.dossierEquivalent('2 - Notes de lecture', DOSSIERS), '', 'aucun dossier de ce nom');
});

test('familles : les dossiers disparus sont signalés, jamais réécrits', () => {
  const greffon = Object.create(Ariane.prototype);
  const familles = [{ nom: 'Annotations', dossiers: ['01 - Annotations'] },
                    { nom: 'Tâches', dossiers: ['08 - Tâches'] },
                    { nom: 'Lecture', dossiers: ['02 - Notes de lecture'] }];
  greffon.settings = { famillesNotes: familles };
  greffon.app = { vault: { getAllLoadedFiles: () => DOSSIERS.map((p) => ({ path: p, children: [] })) } };
  assert.deepEqual(greffon.famillesDossiersPerimes(), [
    { famille: 'Annotations', dossier: '01 - Annotations', probable: '02 - Annotations' },
    { famille: 'Lecture', dossier: '02 - Notes de lecture', probable: '' },
  ]);
  assert.deepEqual(greffon.settings.famillesNotes[0].dossiers, ['01 - Annotations'], 'la table n\'est pas touchée');
});
