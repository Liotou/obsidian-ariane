const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const { correcteurMasquer, correcteurBlocs, correcteurFautes, correcteurCleIgnore } = Ariane._test;

test('masquer : la longueur ne change jamais, les positions restent exactes', () => {
  const lignes = [
    '## Titre avec `du code` et un [[lien|alias]] puis ![[image.png]]',
    '- [ ] tâche à [lire](https://exemple.org/a?b=1) avec #étiquette et **gras** ==surligné==',
    '> [!note] Une citation avec $x^2$ et <span class="a">balise</span> %%commentaire%%',
    'Une note_avec_soulignés et un _mot_ en italique, note[^1] fin ^bloc-id',
  ];
  for (const l of lignes) assert.equal(correcteurMasquer(l).length, l.length, l);
});

test('masquer : la prose reste, le reste devient des espaces', () => {
  const m = correcteurMasquer('- [ ] Voir [le guide](https://x.org) et `code` puis [[Note]] fin');
  assert.ok(m.includes('Voir'));
  assert.ok(m.includes('le guide'));
  assert.ok(m.includes('fin'));
  assert.ok(!/https|code|Note|\[|\]|\(|\)/.test(m), m);
  const t = correcteurMasquer('Un mot #tag/sous et un_mot_composé');
  assert.ok(!t.includes('#tag'));
  assert.ok(t.includes('un_mot_composé'), 'les soulignés au cœur d\'un mot sont gardés');
});

test('blocs : entête YAML, code et formules sont sautés, les positions sont absolues', () => {
  const texte = [
    '---', 'titre: Un titre', '---',
    'Première ligne.',
    '```js', 'const trucEnCode = 1;', '```',
    '',
    '$$', 'E = mc^2', '$$',
    '- Une puce',
    '![[image.png]]',
  ].join('\n');
  const blocs = correcteurBlocs(texte);
  assert.deepEqual(blocs.map((b) => b.texte.trim()), ['Première ligne.', 'Une puce']);
  for (const b of blocs) assert.equal(texte.substr(b.from, b.texte.length).trim().length > 0, true);
  assert.equal(texte.substr(blocs[0].from, 15), 'Première ligne.');
  assert.equal(texte.substr(blocs[1].from, 10), '- Une puce');
});

test('blocs : un fichier sans entête, fins de ligne Windows comprises', () => {
  const texte = 'Bonjour le monde.\r\nDeuxième ligne.\r\n';
  const blocs = correcteurBlocs(texte);
  assert.equal(blocs.length, 2);
  assert.equal(blocs[1].from, 'Bonjour le monde.\r\n'.length);
});

test('fautes : positions absolues, genres demandés, fautes ignorées', () => {
  const blocs = [{ from: 10, texte: 'a' }, { from: 50, texte: 'b' }];
  const cache = new Map([
    ['a', [{ from: 3, length: 4, kind: 'grammar', word: 'abcd', replace: ['x'], message: 'm', category: 'c' }]],
    ['b', [{ from: 0, length: 2, kind: 'spelling', word: 'zz', replace: [] }]],
  ]);
  const tout = correcteurFautes(blocs, cache, new Set(), { grammar: true, spelling: true });
  assert.deepEqual(tout.map((f) => [f.from, f.to, f.kind]), [[13, 17, 'grammar'], [50, 52, 'spelling']]);
  const gram = correcteurFautes(blocs, cache, new Set(), { grammar: true, spelling: false });
  assert.equal(gram.length, 1);
  const ign = correcteurFautes(blocs, cache, new Set([correcteurCleIgnore(cache.get('a')[0])]), { grammar: true, spelling: true });
  assert.deepEqual(ign.map((f) => f.kind), ['spelling']);
});
