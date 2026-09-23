const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

// Un coffre minimal : des fichiers avec leur frontmatter, et de quoi les lire.
function coffre(fichiers, reglages) {
  const greffon = Object.create(Ariane.prototype);
  greffon.settings = Object.assign({ dossierNotesEvenements: "10 - Notes d'événements" }, reglages || {});
  greffon.app = {
    vault: { getMarkdownFiles: () => fichiers },
    metadataCache: { getFileCache: (f) => (f && f.fm ? { frontmatter: f.fm } : null) },
  };
  return greffon;
}

const fichier = (path, fm) => ({ path, basename: path.split('/').pop().replace(/\.md$/, ''), fm });

test('id d\'événement : lu dans le frontmatter, espaces en trop mis de côté', () => {
  assert.equal(Ariane.idEvenementDe({ 'Événement ID': '  ABC-123 ' }), 'ABC-123');
  assert.equal(Ariane.idEvenementDe({ 'Événement ID': '' }), '');
  assert.equal(Ariane.idEvenementDe({ autre: 'x' }), '');
  assert.equal(Ariane.idEvenementDe(null), '');
});

test('note d\'un événement : retrouvée par son identifiant', () => {
  const g = coffre([
    fichier('03 - Notes/Idée.md', { titre: 'x' }),
    fichier("10 - Notes d'événements/EV-202609231200.md", { 'Événement ID': 'ABC-123' }),
    fichier("10 - Notes d'événements/EV-202609231300.md", { 'Événement ID': 'XYZ-999' }),
  ]);
  assert.equal(g.noteDeEvenement('ABC-123').basename, 'EV-202609231200');
  assert.equal(g.noteDeEvenement('XYZ-999').basename, 'EV-202609231300');
  assert.equal(g.noteDeEvenement('INCONNU'), null);
  assert.equal(g.noteDeEvenement(''), null, 'un événement sans identifiant n\'a pas de note');
  assert.equal(g.noteDeEvenement(null), null);
});

test('note d\'un événement : le dossier dédié passe devant, mais ne borne pas', () => {
  const g = coffre([
    fichier('01 - Ailleurs/Note déplacée.md', { 'Événement ID': 'SEUL' }),
    fichier('01 - Ailleurs/Doublon.md', { 'Événement ID': 'DEUX' }),
    fichier("10 - Notes d'événements/EV-officielle.md", { 'Événement ID': 'DEUX' }),
  ]);
  assert.equal(g.noteDeEvenement('SEUL').basename, 'Note déplacée',
    'une note sortie du dossier reste retrouvable');
  assert.equal(g.noteDeEvenement('DEUX').basename, 'EV-officielle',
    'à égalité, celle du dossier dédié l\'emporte');
});

test('jalon d\'un événement : retrouvé parmi les tâches, sinon rien', () => {
  const t1 = { ref: 'T010', fichier: fichier('08 - Tâches/T010.md', { 'Événement ID': 'ABC-123' }) };
  const t2 = { ref: 'T011', fichier: fichier('08 - Tâches/T011.md', {}) };
  const g = coffre([]);
  g.tachesPourGantt = () => [t2, t1, { ref: 'T012' }];
  assert.equal(g.jalonDeEvenement('ABC-123').ref, 'T010');
  assert.equal(g.jalonDeEvenement('AUTRE'), null);
  assert.equal(g.jalonDeEvenement(''), null);
  const sansTaches = coffre([]);
  sansTaches.tachesPourGantt = null;
  assert.equal(sansTaches.jalonDeEvenement('ABC-123'), null);
});
