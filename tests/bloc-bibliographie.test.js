// Bloc « Bibliographie » des notes : le titre avant les marqueurs, et les
// blocs de l'ancienne forme réécrits dans la nouvelle.
const test = require('node:test');
const assert = require('node:assert');
const { construireBibliographie, injecterBibliographie } = require('./obsidian-factice.js')._test;

const BLOC = construireBibliographie(['Mirabel (2023)', 'Sauvage (2022)'], 'Bibliographie');

test('bloc : filet et titre d’abord, marqueurs autour des seules entrées', () => {
  assert.equal(BLOC, '---\n## Bibliographie\n%% ariane:biblio %%\n- Mirabel (2023)\n- Sauvage (2022)\n%% /ariane:biblio %%');
});

test('bloc : ajouté en fin de note après une ligne vide', () => {
  assert.equal(injecterBibliographie('## Journal\n', BLOC), '## Journal\n\n' + BLOC + '\n');
});

test('bloc : l’ancienne forme est réécrite, sans marqueur sous « Journal »', () => {
  const ancien = '## Journal\n\n%% ariane:biblio %%\n\n---\n## Bibliographie\n- Mirabel (2023)\n%% /ariane:biblio %%\n';
  assert.equal(injecterBibliographie(ancien, BLOC), '## Journal\n\n' + BLOC + '\n');
});

test('bloc : la nouvelle forme se remplace sur place, sans doubler le titre', () => {
  const une = injecterBibliographie('Texte.\n', BLOC);
  const autre = construireBibliographie(['Mirabel (2023)'], 'Bibliographie');
  const deux = injecterBibliographie(une, autre);
  assert.equal(deux, 'Texte.\n\n' + autre + '\n');
  assert.equal(injecterBibliographie(deux, autre), deux);
});

test('dossiers sans bibliographie : la note et ses sous-dossiers, pas les voisins', async () => {
  const Ariane_ = require('./obsidian-factice.js');
  const g = Object.create(Ariane_.prototype);
  g.settings = { biblioDossiersExclus: ['Journal', '08 - Tâches/'] };
  assert.equal(g.biblioExclue('Journal/2026/oct.md'), true);
  assert.equal(g.biblioExclue('08 - Tâches/T001.md'), true);
  assert.equal(g.biblioExclue('Journal intime/x.md'), false, 'un préfixe de nom n\'est pas un sous-dossier');
  assert.equal(g.biblioExclue('Notes/x.md'), false);
  g.app = { vault: { read: async () => { throw new Error('ne doit pas lire'); } } };
  assert.equal(await g.majBibliographie({ path: 'Journal/x.md', extension: 'md' }, true), false);
});
