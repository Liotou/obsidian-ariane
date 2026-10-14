const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { plagesInsecables, souderPonctuation } = Ariane._test;

const morceaux = (t) => plagesInsecables(t).map(([a, b]) => t.slice(a, b));

test('plagesInsecables : parenthèse et espace, italique, lien, point-virgule', () => {
  assert.deepEqual(morceaux('organismes vivants ( biotiques) en interaction'), ['( biotiques)']);
  assert.deepEqual(morceaux('d’environnement (*éco*) et de système'), ['(*éco*)']);
  assert.deepEqual(morceaux('système ([[K1|Harrison, 2026, p. 17]] ; [[K2|Tansley, 1935]]).'),
    ['([[K1|Harrison,', '17]] ;', '1935]]).']);
  assert.deepEqual(morceaux('« écosystème » comme'), ['« écosystème »']);
  assert.deepEqual(morceaux('Source : une note'), ['Source :']);
});

test('plagesInsecables : rien là où le navigateur ne coupe pas déjà', () => {
  assert.deepEqual(morceaux('vivants (abiotiques) de leur environnement, le concept.'), []);
  assert.deepEqual(morceaux('Tansley (1935) est'), []);
  assert.deepEqual(morceaux(''), []);
  // Intégration ou formule : laissées.
  assert.deepEqual(morceaux('voir ( ![[schéma.png]])'), []);
  assert.deepEqual(morceaux('soit ( $x$)'), []);
});

test('souderPonctuation : espaces insécables au contact de la ponctuation', () => {
  assert.equal(souderPonctuation('vivants ( biotiques) et « mot » ; fin !'),
    'vivants (\u00a0biotiques) et «\u00a0mot\u00a0»\u00a0; fin\u00a0!');
  assert.equal(souderPonctuation('rien (à) faire.'), 'rien (à) faire.');
});

test('numerosTitres : ## = 1., ### = 1.1., #### = 1.1.1.', () => {
  const { numerosTitres } = Ariane._test;
  const n = (t) => [...numerosTitres(t)].map(([i, v]) => i + ':' + v);
  assert.deepEqual(n('# Titre\n## A\n### A1\n#### A1a\n### A2\n## B\n### B1'),
    ['1:1.', '2:1.1.', '3:1.1.1.', '4:1.2.', '5:2.', '6:2.1.']);
  // Entête ignoré, code ignoré.
  assert.deepEqual(n('---\ntype: x\n---\n## A\n```\n## pas un titre\n```\n## B'), ['3:1.', '7:2.']);
  // Sans « ## », le plus haut niveau présent fait 1.
  assert.deepEqual(n('### A\n#### A1\n### B'), ['0:1.', '1:1.1.', '2:2.']);
  // Niveau sauté : zéro.
  assert.deepEqual(n('## A\n#### A01'), ['0:1.', '1:1.0.1.']);
  // Déjà numérotée à la main, ou dispensée : rien.
  assert.deepEqual(n('## A\n### 1) Charge'), []);
  assert.deepEqual(n('## 1. Introduction'), []);
  assert.deepEqual(n('---\nnumérotation: false\n---\n## A'), []);
  // « 2026 : bilan » n'est pas une numérotation.
  assert.deepEqual(n('## 2026 : bilan\n## Suite'), ['0:1.', '1:2.']);
});

test('numerosDepuisTitres : depuis l’index des métadonnées (panneau « Plan »)', () => {
  const { numerosDepuisTitres } = Ariane._test;
  const t = [
    { ligne: 0, niveau: 1, texte: 'Titre' },
    { ligne: 4, niveau: 2, texte: 'A' },
    { ligne: 9, niveau: 3, texte: 'A1' },
    { ligne: 12, niveau: 2, texte: 'B' },
  ];
  assert.deepEqual([...numerosDepuisTitres(t)], [[4, '1.'], [9, '1.1.'], [12, '2.']]);
  assert.deepEqual([...numerosDepuisTitres([{ ligne: 2, niveau: 2, texte: '1. Intro' }])], []);
});
