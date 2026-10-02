// Bloc « Bibliographie » des notes : le titre avant les marqueurs, et les
// blocs de l'ancienne forme réécrits dans la nouvelle.
const test = require('node:test');
const assert = require('node:assert');
const { construireBibliographie, injecterBibliographie } = require('./obsidian-factice.js')._test;

const BLOC = construireBibliographie(['Mitra (2023)', 'Sillmann (2022)'], 'Bibliographie');

test('bloc : filet et titre d’abord, marqueurs autour des seules entrées', () => {
  assert.equal(BLOC, '---\n## Bibliographie\n%% ariane:biblio %%\n- Mitra (2023)\n- Sillmann (2022)\n%% /ariane:biblio %%');
});

test('bloc : ajouté en fin de note après une ligne vide', () => {
  assert.equal(injecterBibliographie('## Journal\n', BLOC), '## Journal\n\n' + BLOC + '\n');
});

test('bloc : l’ancienne forme est réécrite, sans marqueur sous « Journal »', () => {
  const ancien = '## Journal\n\n%% ariane:biblio %%\n\n---\n## Bibliographie\n- Mitra (2023)\n%% /ariane:biblio %%\n';
  assert.equal(injecterBibliographie(ancien, BLOC), '## Journal\n\n' + BLOC + '\n');
});

test('bloc : la nouvelle forme se remplace sur place, sans doubler le titre', () => {
  const une = injecterBibliographie('Texte.\n', BLOC);
  const autre = construireBibliographie(['Mitra (2023)'], 'Bibliographie');
  const deux = injecterBibliographie(une, autre);
  assert.equal(deux, 'Texte.\n\n' + autre + '\n');
  assert.equal(injecterBibliographie(deux, autre), deux);
});
