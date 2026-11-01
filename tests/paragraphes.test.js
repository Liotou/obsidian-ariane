const test = require('node:test');
const assert = require('node:assert/strict');
const { ParagraphesTexte } = require('./obsidian-factice.js')._test;

const T = [
  '---',
  'titre: x',
  '---',
  '# Titre',
  'Premier paragraphe,',
  'sur deux lignes.',
  '',
  '- une puce',
  '  suite de la puce',
  '- une autre',
  '',
  'Deuxième paragraphe.',
  '',
  '```js',
  'const a = 1;',
  '',
  'const b = 2;',
  '```',
  '',
  '> une citation',
  '',
  'Troisième.',
].join('\n');

test('blocs : une ligne, un paragraphe ; puce avec sa suite, code entier, en-tête sauté', () => {
  const b = ParagraphesTexte.blocs(T);
  assert.deepEqual(b.map((x) => [x.genre, x.numero]), [
    ['titre', 0], ['paragraphe', 1], ['paragraphe', 2], ['liste', 0], ['liste', 0], ['paragraphe', 3],
    ['code', 0], ['citation', 0], ['paragraphe', 4],
  ]);
  assert.equal(T.slice(b[1].from, b[1].to), 'Premier paragraphe,');
  assert.equal(T.slice(b[3].from, b[3].to), '- une puce\n  suite de la puce');
  assert.ok(T.slice(b[6].from, b[6].to).endsWith('```'));
});

test('un paragraphe ouvert par un commentaire en marge reste un paragraphe', () => {
  const b = ParagraphesTexte.blocs('<span class="ann-s" data-id="ab12" data-color="yellow"></span>Texte commenté.');
  assert.equal(b[0].genre, 'paragraphe');
  assert.equal(b[0].numero, 1);
});

test('deplacer : vers le haut, vers le bas, à la fin ; les écarts restent', () => {
  const t = 'A\n\nB\n\nC';
  const b = ParagraphesTexte.blocs(t);
  const appl = (r) => {
    let s = t;
    for (const c of r.changements.slice().reverse()) s = s.slice(0, c.from) + c.insert + s.slice(c.to);
    return s;
  };
  let r = ParagraphesTexte.deplacer(t, b, 2, 0);
  assert.equal(appl(r), 'C\n\nA\n\nB');
  assert.equal(appl(r).slice(r.debut, r.fin), 'C');
  r = ParagraphesTexte.deplacer(t, b, 0, 3);
  assert.equal(appl(r), 'B\n\nC\n\nA');
  assert.equal(appl(r).slice(r.debut, r.fin), 'A');
  r = ParagraphesTexte.deplacer(t, b, 0, 2);
  assert.equal(appl(r), 'B\n\nA\n\nC');
  assert.equal(ParagraphesTexte.deplacer(t, b, 1, 1), null);
  assert.equal(ParagraphesTexte.deplacer(t, b, 1, 2), null);
});

test('indexA : le bloc qui contient la position, -1 dans un écart', () => {
  const b = ParagraphesTexte.blocs('A\n\nB');
  assert.equal(ParagraphesTexte.indexA(b, 0), 0);
  assert.equal(ParagraphesTexte.indexA(b, 2), -1);
  assert.equal(ParagraphesTexte.indexA(b, 3), 1);
});

test('extrait : le début lisible du bloc', () => {
  const t = '- **Gras** et [[cible|lien]] et la suite';
  const b = ParagraphesTexte.blocs(t);
  assert.equal(ParagraphesTexte.extrait(t, b[0], 60), 'Gras et lien et la suite');
});

test('paragraphes séparés d’un simple saut de ligne : chacun le sien, et ils s’échangent', () => {
  const t = 'Un.\nDeux.\nTrois.';
  const b = ParagraphesTexte.blocs(t);
  assert.deepEqual(b.map((x) => x.numero), [1, 2, 3]);
  const r = ParagraphesTexte.deplacer(t, b, 2, 0);
  let s = t;
  for (const c of r.changements.slice().reverse()) s = s.slice(0, c.from) + c.insert + s.slice(c.to);
  assert.equal(s, 'Trois.\nUn.\nDeux.');
});

test('une puce emporte ses sous-puces ; les lignes d’une citation restent ensemble', () => {
  const t = '- a\n  - a1\n- b\n> c1\n> c2';
  const b = ParagraphesTexte.blocs(t);
  assert.deepEqual(b.map((x) => t.slice(x.from, x.to)), ['- a\n  - a1', '- b', '> c1\n> c2']);
});
