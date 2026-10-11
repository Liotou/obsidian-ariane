// Export Word : préparation du markdown pour pandoc (notes intégrées,
// filets, guillemets, titres).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { deplierIntegrations, preparerMarkdownExport } = Ariane._test;

const NOTES = {
  'NC-1': '---\naliases:\n  - Phénomène\n---\n# Phénomène\nUn fait observable.\n\n## Nuance\nTexte nuancé. ^b1\n\n---\n## Bibliographie\n%% ariane:biblio %%\n- Réf.\n%% /ariane:biblio %%\n',
  T1: '---\nType: tache\n---\n# Plan\n\n<!-- ariane:creneaux -->\n## Sessions\n| a | b |\n<!-- /ariane:creneaux -->\n\n## Note de travail\n\nDeux pistes ![[NC-1#^b1]]\n',
  Boucle: 'Avant ![[Boucle]] après',
};
const lire = async (c) => (c in NOTES ? NOTES[c] : null);

test('export : une note intégrée est dépliée sous le titre qui l’accueille', async () => {
  const s = await deplierIntegrations('### Phénomène organisationnel\n![[NC-1|Phénomène]]\n', lire);
  assert.ok(!s.includes('![['), 'plus d’intégration brute');
  assert.ok(s.includes('Un fait observable.'));
  assert.ok(!/^# Phénomène/m.test(s), 'le titre de la note intégrée ne double pas celui de la section');
  assert.match(s, /^#### Nuance$/m, 'ses titres se rangent sous le « ### »');
  assert.ok(!/Bibliographie|Réf\./.test(s), 'sans la bibliographie d’Ariane');
});

test('export : intégrations de tâche, de bloc, imbriquées, absentes et en boucle', async () => {
  const s = await deplierIntegrations('## Plan\n![[T1]]\n', lire);
  assert.ok(!/Sessions|\| a \|/.test(s), 'sans les blocs que tient Ariane');
  assert.match(s, /^### Note de travail$/m);
  assert.match(s, /Deux pistes \nTexte nuancé\.\s*\n/, 'le bloc intégré, sans son ancre');
  assert.equal((await deplierIntegrations('Voir ![[Inconnue|la note]].', lire)).trim(), 'Voir la note.');
  assert.ok((await deplierIntegrations('![[Boucle]]', lire)).includes('Avant Boucle après'), 'pas de boucle sans fin');
  assert.equal((await deplierIntegrations('![[NC-1#Nuance]]', lire)).trim(), 'Texte nuancé. ^b1');
  assert.equal(await deplierIntegrations('```\n![[NC-1]]\n```', lire), '```\n![[NC-1]]\n```', 'le code reste tel quel');
  const img = await deplierIntegrations('![[schema.png]]', lire, async (c) => '/coffre/' + c);
  assert.equal(img.trim(), '![](</coffre/schema.png>)');
});

test('export : ni filet, ni guillemets droits, ni point final aux titres', () => {
  const s = preparerMarkdownExport('# Titre\n\n## Ordre du jour.\n\nidée de "prospection"\n\n---\n\n## Suite...\n\n<span class="x">a</span>\n\n| a |\n|---|\n| b |\n', () => null, {});
  assert.ok(!/^-{3,}$/m.test(s), 'le filet tombe');
  assert.match(s, /^# Ordre du jour$/m);
  assert.match(s, /^# Suite\.\.\.$/m, 'les points de suspension restent');
  assert.ok(s.includes('« prospection »'));
  assert.ok(s.includes('class="x"'), 'les attributs gardent leurs guillemets');
  assert.ok(s.includes('|---|'), 'les tableaux gardent leur ligne de séparation');
});

test('clic droit : l’application Office d’un document', () => {
  assert.equal(Ariane.appliOffice('DOCX').appli, 'Microsoft Word');
  assert.equal(Ariane.appliOffice('pptx').nom, 'PowerPoint');
  assert.equal(Ariane.appliOffice('csv').nom, 'Excel');
  assert.equal(Ariane.appliOffice('md'), null);
});
