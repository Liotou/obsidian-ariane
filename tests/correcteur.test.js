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

test('fautes : la relecture prime, une même ligne répétée est signalée partout', () => {
  // Deux lignes de même texte : le cache ne sert qu'une fois, les deux
  // soulignements se posent quand même, chacun à sa place.
  const blocs = [{ from: 0, texte: 'x' }, { from: 100, texte: 'x' }];
  const cache = new Map([['x', [{ from: 2, length: 5, kind: 'grammar', word: 'testé', replace: ['tester'], message: 'm', category: 'Forme du verbe' }]]]);
  const f = correcteurFautes(blocs, cache, new Set(), { grammar: true, spelling: true });
  assert.deepEqual(f.map((x) => x.from), [2, 102]);
  assert.deepEqual(f[0].replace, ['tester']);
  assert.equal(f[1].category, 'Forme du verbe');
});

test('fautes : une ligne que le démon n\'a pas encore vue ne produit rien', () => {
  const blocs = [{ from: 0, texte: 'jamais vue' }];
  assert.deepEqual(correcteurFautes(blocs, new Map(), new Set(), { grammar: true, spelling: true }), []);
});

// Un document minimal : le strict nécessaire à construireBulle, pour éprouver
// la bulle sans dépendre d'un vrai navigateur.
function faussesBalises() {
  const creer = (tag) => ({
    tag, className: '', textContent: '', enfants: [], attributs: {}, ecoutes: {},
    appendChild(e) { this.enfants.push(e); return e; },
    setAttribute(k, v) { this.attributs[k] = v; },
    addEventListener(nom, f) { (this.ecoutes[nom] = this.ecoutes[nom] || []).push(f); },
  });
  return { createElement: creer };
}

function bulleDe(faute) {
  const centre = new (Ariane._test.CorrecteurApple)({ settings: {} });
  const envois = [];
  const vue = { dom: { ownerDocument: faussesBalises() }, dispatch: (s) => envois.push(s) };
  return { racine: centre.construireBulle(vue, faute), envois };
}

const parClasse = (el, classe) => {
  const trouves = [];
  const descendre = (e) => { if (String(e.className).split(' ').includes(classe)) trouves.push(e); e.enfants.forEach(descendre); };
  descendre(el);
  return trouves;
};

test('bulle : catégorie, explication, propositions, actions', () => {
  const { racine, envois } = bulleDe({
    from: 34, to: 38, kind: 'grammar', word: 'elle', replace: ['elles'],
    message: 'Ici, le pronom « elles » doit être utilisé à la place de « elle ».', category: 'Pronom',
  });
  assert.equal(parClasse(racine, 'zfa-corr-categorie')[0].textContent, 'Pronom');
  assert.match(parClasse(racine, 'zfa-corr-texte')[0].textContent, /pronom « elles »/);
  const choix = parClasse(racine, 'zfa-corr-choix');
  assert.deepEqual(choix.map((b) => b.textContent), ['elles']);
  assert.match(choix[0].attributs['aria-label'], /Remplacer/);
  // Une seule action pour la grammaire : ignorer. Pas de dictionnaire.
  assert.equal(parClasse(racine, 'zfa-corr-action').length, 1);
  choix[0].ecoutes.mousedown[0]({ preventDefault() {} });
  assert.deepEqual(envois, [{ changes: { from: 34, to: 38, insert: 'elles' } }]);
});

test('bulle : orthographe, propositions en retrait après la première', () => {
  const { racine } = bulleDe({ from: 0, to: 8, kind: 'spelling', word: 'xyzzyque',
    replace: ['xyloque', 'xystique', 'xyste', 'xyris', 'de trop'], message: '', category: '' });
  assert.equal(parClasse(racine, 'zfa-corr-categorie')[0].textContent, 'Orthographe');
  assert.match(parClasse(racine, 'zfa-corr-texte')[0].textContent, /dictionnaire/);
  const choix = parClasse(racine, 'zfa-corr-choix');
  assert.equal(choix.length, 4, 'quatre propositions au plus');
  assert.equal(choix[0].className, 'zfa-corr-choix');
  assert.ok(choix.slice(1).every((b) => b.className.includes('est-secondaire')));
  // Orthographe : dictionnaire et ignorer.
  assert.equal(parClasse(racine, 'zfa-corr-action').length, 2);
});

test('bulle : sans proposition, la rangée le dit au lieu de rester vide', () => {
  const { racine } = bulleDe({ from: 0, to: 3, kind: 'spelling', word: 'zzz', replace: [], message: '', category: '' });
  assert.equal(parClasse(racine, 'zfa-corr-choix').length, 0);
  assert.equal(parClasse(racine, 'zfa-corr-aucune')[0].textContent, 'Aucune proposition');
});
