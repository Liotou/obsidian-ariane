const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const base = {
  intitule: "Rédiger l'état de l'art",
  statut: 'à faire',
  priorite: 'haute',
  debut: '2026-09-01',
  echeance: '2026-11-30',
  avancement: 0,
  jalon: false,
  source: '',
  livrable: '',
  fichier: '',
  liste: 'Doctorat - Tâches',
  aujourdhui: '2026-08-28',
};

test('le frontmatter porte tous les champs du schéma, même vides', () => {
  const s = Ariane.corpsNouvelleTache(base);
  for (const cle of ['type', 'statut', 'priorite', 'debut', 'echeance',
                     'avancement', 'termine-le', 'jalon', 'parent', 'bloque-par',
                     'source', 'livrable', 'fichier', 'liste', 'rappel-id',
                     'cree', 'modifie']) {
    assert.ok(new RegExp('^' + cle + ':', 'm').test(s), 'champ manquant : ' + cle);
  }
  assert.ok(/^famille:/m.test(s), 'la note neuve déclare une ligne famille');
});

test('l intitulé figure en alias et en titre de niveau 1', () => {
  const s = Ariane.corpsNouvelleTache(base);
  assert.ok(s.includes('aliases:\n  - "Rédiger l\'état de l\'art"'));
  assert.ok(s.includes("\n# Rédiger l'état de l'art\n"));
});

test('les deux sections du corps sont présentes', () => {
  const s = Ariane.corpsNouvelleTache(base);
  assert.ok(s.includes('\n## Note de travail\n'));
  assert.ok(s.includes('\n## Journal\n'));
});

test('bloque-par est une liste vide, pas une chaîne', () => {
  assert.ok(/^bloque-par: \[\]$/m.test(Ariane.corpsNouvelleTache(base)));
});

test('les dates de création et de modification valent le jour donné', () => {
  const s = Ariane.corpsNouvelleTache(base);
  assert.ok(/^cree: 2026-08-28$/m.test(s));
  assert.ok(/^modifie: 2026-08-28$/m.test(s));
});

test('un guillemet dans l intitulé est échappé', () => {
  const s = Ariane.corpsNouvelleTache({ ...base, intitule: 'Lire « Normal "Accidents" »' });
  assert.ok(s.includes('\\"Accidents\\"'));
});

test('un jalon écrit jalon à vrai', () => {
  assert.ok(/^jalon: true$/m.test(Ariane.corpsNouvelleTache({ ...base, jalon: true })));
});

test('une source est écrite comme lien entre guillemets', () => {
  const s = Ariane.corpsNouvelleTache({ ...base, source: '[[@perrow1984]]' });
  assert.ok(/^source: "\[\[@perrow1984\]\]"$/m.test(s));
});

test('un champ vide est écrit sans valeur', () => {
  assert.ok(/^livrable:$/m.test(Ariane.corpsNouvelleTache(base)));
});

test('yamlChaine rend la chaîne vide pour une valeur absente', () => {
  assert.equal(Ariane.yamlChaine(null), '');
  assert.equal(Ariane.yamlChaine(''), '');
});
