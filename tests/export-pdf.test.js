// Export PDF joint à l'export Word, et ouverture depuis le calendrier.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const Ariane = require('./obsidian-factice.js');
const { clesCitationsPandoc, styleZoteroDuModele, markdownPourPdf, scriptPdfWord, MoteurCalendrier } = Ariane._test;

test('clés citées : groupes, citation dans le texte, seconde main ; pas les adresses', () => {
  const md = 'A [@alpha, p. 2; -@beta_2024]. @Gamma:1 [p. 3] dit. [Dupont, cité dans @delta, p. 4]. @fin. moi@exemple.org';
  assert.deepEqual(clesCitationsPandoc(md), ['alpha', 'beta_2024', 'Gamma:1', 'delta', 'fin']);
});

test('style du modèle : lu dans les préférences Zotero échappées, APA en français à défaut', () => {
  const xml = '<vt:lpwstr>&lt;data&gt;&lt;style id=&quot;http://www.zotero.org/styles/chicago-author-date&quot; locale=&quot;en-GB&quot; hasBibliography=&quot;1&quot;/&gt;</vt:lpwstr>';
  assert.deepEqual(styleZoteroDuModele(xml),
    { id: 'http://www.zotero.org/styles/chicago-author-date', nom: 'chicago-author-date', locale: 'en-GB' });
  assert.deepEqual(styleZoteroDuModele(''), { id: 'http://www.zotero.org/styles/apa', nom: 'apa', locale: 'fr-FR' });
});

test('markdown du PDF : bibliographie écrite à sa place, ou supprimée', () => {
  const avec = markdownPourPdf('Texte [@a].', { locale: 'fr-FR', bibliographie: true });
  assert.ok(avec.startsWith('---\nlang: "fr-FR"\n---'));
  assert.ok(avec.includes('# Bibliographie\n\n::: {#refs}\n:::'));
  const sans = markdownPourPdf('Texte.', { bibliographie: false });
  assert.ok(sans.includes('suppress-bibliography: true'));
  assert.ok(!sans.includes('{#refs}'));
});

test('script Word : PDF enregistré, document refermé, Word quitté seulement s’il était fermé', () => {
  const s = scriptPdfWord('a"b.docx', '/tmp/x.pdf', false);
  assert.ok(s.includes('document "a\\"b.docx"'));
  assert.ok(s.includes('save as d file name "/tmp/x.pdf" file format format PDF'));
  assert.ok(s.includes('close d saving no'));
  assert.ok(s.includes('quit saving no'));
  assert.ok(!scriptPdfWord('a.docx', '/tmp/x.pdf', true).includes('quit saving no'));
});

test('calendrier : une tâche s’ouvre toujours dans un nouvel onglet', () => {
  const ouverts = [];
  const f = { path: 'T1.md' };
  const m = Object.create(MoteurCalendrier.prototype);
  m.greffon = { fichierDeRef: () => f };
  m.app = { workspace: { getLeaf: (o) => ({ openFile: (x) => ouverts.push([o, x]) }) } };
  m.ouvrir('T1');
  assert.deepEqual(ouverts, [['tab', f]]);
});

test('calendrier : plus d’option d’ouverture à part, ni de remplacement de l’onglet', () => {
  const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'src', '17-vue-calendrier.js'), 'utf8');
  assert.ok(!src.includes('Ouvrir dans un nouvel onglet'));
  assert.ok(!src.includes('Ouvrir dans un nouveau volet'));
  assert.ok(!/getLeaf\((false|true|e\.)/.test(src));
});
