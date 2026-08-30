const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const suivante = (noms, annee) => Ariane.referenceTacheSuivante(noms, annee);

test('la première tâche de l année porte le rang 001', () => {
  assert.equal(suivante([], 2026), 'T26-001');
});

test('le rang suit le plus grand déjà employé', () => {
  assert.equal(suivante(['T26-001', 'T26-002'], 2026), 'T26-003');
});

test('un trou dans la numérotation ne réattribue pas le rang libéré', () => {
  assert.equal(suivante(['T26-001', 'T26-004'], 2026), 'T26-005');
});

test('le compteur repart à chaque année', () => {
  assert.equal(suivante(['T25-999'], 2026), 'T26-001');
});

test('au delà de 999 la référence passe à quatre chiffres', () => {
  assert.equal(suivante(['T26-999'], 2026), 'T26-1000');
});

test('un nom qui ne suit pas la convention est ignoré', () => {
  assert.equal(suivante(['Brouillon', 'T26-abc', 'T26-'], 2026), 'T26-001');
});

test('un rang écrit sans zéros de tête est tout de même compté', () => {
  assert.equal(suivante(['T26-7'], 2026), 'T26-008');
});

/* --------------------- refDepuisChemin ------------------------------ */

const rc = (chemin, dossier) => Ariane.refDepuisChemin(chemin, dossier);

test('une note du dossier des tâches : la référence est son nom de fichier', () => {
  assert.equal(rc('8 - Tâches/Lire Latour.md', '8 - Tâches'), 'Lire Latour');
});

test('une note dans un sous-dossier du dossier des tâches compte aussi', () => {
  assert.equal(rc('8 - Tâches/Thèse/Chapitre 2.md', '8 - Tâches'), 'Chapitre 2');
});

test('une ancienne référence T26-xxx est reconnue où qu elle soit', () => {
  assert.equal(rc('ailleurs/T26-014.md', '8 - Tâches'), 'T26-014');
});

test('une note hors du dossier et sans forme T26 n est pas une tâche', () => {
  assert.equal(rc('Lectures/Latour 2005.md', '8 - Tâches'), null);
});

test('un fichier non .md n est jamais une tâche', () => {
  assert.equal(rc('8 - Tâches/pièce jointe.pdf', '8 - Tâches'), null);
  assert.equal(rc('8 - Tâches/Tâches.base', '8 - Tâches'), null);
});

test('sans dossier configuré, seule la forme T26 est reconnue', () => {
  assert.equal(rc('n importe où/T26-003.md', ''), 'T26-003');
  assert.equal(rc('n importe où/Note.md', ''), null);
});
