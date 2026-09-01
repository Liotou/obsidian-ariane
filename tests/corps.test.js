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
                     'source', 'livrable', 'fichier', 'liste', 'rappel-id', 'agenda-id',
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

// --- P0 : complétion des propriétés du noyau sur les notes existantes ---

test('defautsNoyau : le jeu de concepts et leurs valeurs par défaut', () => {
  const d = Ariane.defautsNoyau();
  assert.deepEqual(Object.keys(d).sort(), [
    'avancement', 'bloque-par', 'creneaux', 'debut', 'echeance', 'heure',
    'jalon', 'parent', 'priorite', 'sans-echeance', 'statut', 'termine-le',
    'terminee',
  ]);
  assert.deepEqual(d.creneaux, []);
  assert.deepEqual(d['bloque-par'], []);
  assert.equal(d.avancement, 0);
  assert.equal(d.terminee, false);
  assert.equal(d.jalon, false);
  assert.equal(d.statut, 'à faire');
  assert.equal(d['sans-echeance'], false);
  assert.equal(d.priorite, null);
  assert.equal(d.debut, null);
  assert.equal(d['termine-le'], null);
});

test('defautsNoyau : n\'inclut aucun concept des groupes « rappel » / « agenda »', () => {
  const d = Ariane.defautsNoyau();
  assert.equal('liste' in d, false);
  assert.equal('rappel-id' in d, false);
  assert.equal('agenda-id' in d, false);
});

test('conceptsAAmorcer : seules les clés absentes, valeurs par défaut, clé réelle', () => {
  const present = { statut: 'en cours', echeance: '2026-10-01', creneaux: ['x'] };
  const lire = (c) => (c in present ? present[c] : undefined);
  const cleDe = (c) => 'T - ' + c; // simule un préfixe / renommage
  const out = Ariane.conceptsAAmorcer(Ariane.defautsNoyau(), lire, cleDe);
  // statut / echeance / creneaux déjà là → absents du résultat
  assert.equal('T - statut' in out, false);
  assert.equal('T - echeance' in out, false);
  assert.equal('T - creneaux' in out, false);
  // les manquants, avec la clé réelle et le défaut
  assert.deepEqual(out['T - bloque-par'], []);
  assert.equal(out['T - avancement'], 0);
  assert.equal(out['T - jalon'], false);
  assert.equal(out['T - priorite'], null);
});

test('conceptsAAmorcer : sans-echeance dérivé de l\'échéance lue', () => {
  const avec = Ariane.conceptsAAmorcer(Ariane.defautsNoyau(),
    (c) => (c === 'echeance' ? '2026-10-01' : undefined), (c) => c);
  assert.equal(avec['sans-echeance'], false); // échéance présente → pas "sans échéance"
  const sans = Ariane.conceptsAAmorcer(Ariane.defautsNoyau(),
    () => undefined, (c) => c);
  assert.equal(sans['sans-echeance'], true); // aucune échéance → "sans échéance"
});

test('conceptsAAmorcer : note déjà complète → résultat vide', () => {
  const d = Ariane.defautsNoyau();
  const out = Ariane.conceptsAAmorcer(d, (c) => (c in d ? 'x' : undefined), (c) => c);
  assert.deepEqual(out, {});
});
