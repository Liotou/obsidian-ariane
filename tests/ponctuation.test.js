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
