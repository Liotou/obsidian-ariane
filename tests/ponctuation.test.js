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
  assert.deepEqual(n('---\ntype: x\n---\n## A\n```\n## pas un titre\n```\n## B'), ['3:1.', '7:2.']);
  assert.deepEqual(n('### A\n#### A1\n### B'), ['0:1.', '1:1.1.', '2:2.']);
  assert.deepEqual(n('## A\n#### A01'), ['0:1.', '1:1.0.1.']);
  assert.deepEqual(n('---\nnumérotation: false\n---\n## A'), []);
  // Le titre de la bibliographie d'Ariane n'est pas numéroté.
  assert.deepEqual(n('## A\n---\n## Bibliographie\n%% ariane:biblio %%\n- x\n%% /ariane:biblio %%'), ['0:1.']);
});

test('renumeroterTitres : numéros écrits, numérotation manuelle remplacée', () => {
  const { renumeroterTitres } = Ariane._test;
  const r = renumeroterTitres('# Note\n## Contexte\n### 1) Charge mentale\n### 2.3 Vigilance\n## II - Suite\n## 2026 : bilan\n### 3 questions');
  assert.equal(r.texte, '# Note\n## 1. Contexte\n### 1.1. Charge mentale\n### 1.2. Vigilance\n## 2. Suite\n## 3. 2026 : bilan\n### 3.1. 3 questions');
  assert.deepEqual(r.changements[1], { ligne: 2, ancien: '1) Charge mentale', nouveau: '1.1. Charge mentale' });
  assert.equal(renumeroterTitres('## 1.Cadrage acté\n## LC-MS en pratique').texte, '## 1. Cadrage acté\n## 2. LC-MS en pratique');
  // Déjà à jour : rien ne change.
  const d = renumeroterTitres(r.texte);
  assert.equal(d.changements.length, 0);
  assert.equal(d.texte, r.texte);
  // Un titre ajouté avant décale les suivants.
  const e = renumeroterTitres(r.texte.replace('## 2. Suite', '## Nouveau\n## 2. Suite'));
  assert.match(e.texte, /## 2\. Nouveau\n## 3\. Suite\n## 4\. 2026 : bilan/);
});

test('numeroDeLigneTitre et majLiensTitre', () => {
  const { numeroDeLigneTitre, majLiensTitre } = Ariane._test;
  assert.deepEqual(numeroDeLigneTitre('### 1.2. Titre'), { debut: 4, fin: 9 });
  assert.equal(numeroDeLigneTitre('### Titre'), null);
  assert.equal(numeroDeLigneTitre('Texte 1. pas un titre'), null);
  const t = 'Voir [[NC-1#1. Contexte]], ![[dossier/NC-1#1. Contexte|ici]], [[NC-2#1. Contexte]] et [[#1. Contexte]].';
  assert.equal(majLiensTitre(t, 'NC-1', '1. Contexte', '2. Contexte', false),
    'Voir [[NC-1#2. Contexte]], ![[dossier/NC-1#2. Contexte|ici]], [[NC-2#1. Contexte]] et [[#1. Contexte]].');
  assert.match(majLiensTitre(t, 'NC-1', '1. Contexte', '2. Contexte', true), /\[\[#2\. Contexte\]\]/);
});
