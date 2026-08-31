const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const PRE = 'Tâche - ';

test('planHarmonisationBase : colonnes préfixées citées, sans displayName -> ajouts', () => {
  const base = {
    views: [{
      type: 'table',
      order: ['file.name', 'Tâche - Début', 'Tâche - Échéance'],
      sort: [{ property: 'Tâche - Début', direction: 'ASC' }],
    }],
  };
  const { ajouts } = Ariane.planHarmonisationBase(base, PRE);
  assert.deepEqual(
    ajouts.sort((a, b) => a.nom.localeCompare(b.nom)),
    [
      { cle: 'note.Tâche - Début', nom: 'Début' },
      { cle: 'note.Tâche - Échéance', nom: 'Échéance' },
    ]);
});

test('planHarmonisationBase : gère la forme note.<clé> et dédoublonne', () => {
  const base = {
    order: ['note.Tâche - Liste'],
    views: [{ groupBy: { property: 'Tâche - Liste' }, columnSize: { 'note.Tâche - Liste': 120 } }],
  };
  const { ajouts } = Ariane.planHarmonisationBase(base, PRE);
  assert.deepEqual(ajouts, [{ cle: 'note.Tâche - Liste', nom: 'Liste' }]);
});

test('planHarmonisationBase : un displayName déjà posé est laissé tel quel', () => {
  const base = {
    properties: { 'note.Tâche - Début': { displayName: 'Kickoff' } },
    views: [{ order: ['Tâche - Début', 'Tâche - Échéance'] }],
  };
  const { ajouts } = Ariane.planHarmonisationBase(base, PRE);
  assert.deepEqual(ajouts, [{ cle: 'note.Tâche - Échéance', nom: 'Échéance' }]);
});

test('planHarmonisationBase : rien sans préfixe, rien si aucune colonne préfixée', () => {
  assert.deepEqual(Ariane.planHarmonisationBase({ views: [{ order: ['Tâche - Début'] }] }, '').ajouts, []);
  assert.deepEqual(Ariane.planHarmonisationBase({ views: [{ order: ['file.name', 'aliases'] }] }, PRE).ajouts, []);
  assert.deepEqual(Ariane.planHarmonisationBase(null, PRE).ajouts, []);
});

test('insererProprietesBase : complète un bloc properties: existant', () => {
  const txt = [
    'properties:',
    '  file.name:',
    '    displayName: Tâche',
    'views:',
    '  - type: table',
    '',
  ].join('\n');
  const out = Ariane.insererProprietesBase(txt, [{ cle: 'note.Tâche - Début', nom: 'Début' }]);
  assert.equal(out, [
    'properties:',
    '  file.name:',
    '    displayName: Tâche',
    '  "note.Tâche - Début":',
    '    displayName: "Début"',
    'views:',
    '  - type: table',
    '',
  ].join('\n'));
});

test('insererProprietesBase : crée le bloc avant views: quand il manque', () => {
  const txt = [
    'filters:',
    '  and:',
    '    - file.ext == "md"',
    'views:',
    '  - type: table',
  ].join('\n');
  const out = Ariane.insererProprietesBase(txt, [{ cle: 'note.Tâche - Liste', nom: 'Liste' }]);
  assert.equal(out, [
    'filters:',
    '  and:',
    '    - file.ext == "md"',
    'properties:',
    '  "note.Tâche - Liste":',
    '    displayName: "Liste"',
    'views:',
    '  - type: table',
  ].join('\n'));
});

test('insererProprietesBase : ne touche pas aux chaînes fragiles (arianeArtPlan)', () => {
  const plan = '    arianeArtPlan: \'{"cartes":[{"ref":"T26-001","x":-270,"y":-90}],"_migre":true}\'';
  const txt = ['properties:', '  file.name:', '    displayName: X', 'views:', plan].join('\n');
  const out = Ariane.insererProprietesBase(txt, [{ cle: 'note.Tâche - Début', nom: 'Début' }]);
  assert.ok(out.includes(plan), 'la ligne arianeArtPlan est intacte');
});

test('insererProprietesBase : sans ajout, texte inchangé', () => {
  assert.equal(Ariane.insererProprietesBase('a: 1\n', []), 'a: 1\n');
});
