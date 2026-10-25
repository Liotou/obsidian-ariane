// Liste de lecture de Safari : plist, articles, adresses, note, Zotero.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Ariane = require('./obsidian-factice.js');

test('plist XML (sortie de plutil) : dict, array, dates, données, entités, balises vides', () => {
  const xml = fs.readFileSync(path.join(__dirname, 'donnees', 'liste-lecture-safari.xml'), 'utf8');
  const r = Ariane.lirePlist(xml);
  assert.equal(r.Children.length, 2);
  const art = r.Children[1].Children[0];
  assert.equal(art.URIDictionary.title, 'Un article & un titre');
  assert.equal(art.ReadingList.DateAdded, '2026-10-20T08:15:00Z');
  assert.equal(typeof art.imageURL, 'string');
  assert.deepEqual(Ariane.lirePlist('<plist><dict><key>a</key><string/><key>b</key><true/><key>c</key><integer>3</integer><key>d</key><array/></dict></plist>'),
    { a: '', b: true, c: 3, d: [] });
});

test('liste de lecture : seuls les articles de com.apple.ReadingList', () => {
  const r = Ariane.lirePlist(fs.readFileSync(path.join(__dirname, 'donnees', 'liste-lecture-safari.xml'), 'utf8'));
  assert.deepEqual(Ariane.listeLectureSafari(r), [{
    url: 'https://example.org/article?utm_source=x', titre: 'Un article & un titre', ajoute: '2026-10-20', apercu: 'Un aperçu.',
  }]);
});

test('adresse normalisée : sans suivi, sans ancre, sans barre finale', () => {
  assert.equal(Ariane.urlNormalisee('https://Example.org/a/?utm_source=x&id=3#haut'), 'https://example.org/a?id=3');
  assert.equal(Ariane.urlNormalisee('https://example.org/'), 'https://example.org/');
  assert.equal(Ariane.urlNormalisee('pas une adresse'), 'pas une adresse');
});

test('note d’article : propriétés, titre, bloc entretenu ; aperçu retenté', () => {
  const n = Ariane.noteArticle({ titre: 'Le risque', url: 'https://e.org/r', site: 'Le Monde', auteur: 'Ana "Bel"',
    publie: '2026-10-01', ajoute: '2026-10-20', markdown: 'Texte.', complet: true });
  assert.match(n, /^---\nType: article web\nurl: "https:\/\/e.org\/r"\nsite: "Le Monde"\nauteur: "Ana \\"Bel\\""\npublié-le: 2026-10-01\najouté-le: 2026-10-20\ncontenu: complet\n---\n# Le risque\n/);
  assert.match(n, /%% ariane:article %%\n\[Lire en ligne\]\(https:\/\/e.org\/r\)\n\nTexte.\n%% \/ariane:article %%/);
  const a = Ariane.noteArticle({ titre: 'X', url: 'https://e.org/x', apercu: 'Un\naperçu.', complet: false });
  assert.match(a, /contenu: aperçu\ntentatives: 1/);
  assert.match(a, /> Un aperçu\./);
});

test('élément Zotero : page web, auteurs découpés, date de consultation en UTC', () => {
  const el = Ariane.elementZoteroArticle({ titre: 'Le risque', url: 'https://e.org/r', site: 'Le Monde',
    auteur: 'Marie Curie, AFP', 'publié-le': '2026-10-01' }, Date.UTC(2026, 9, 25, 8, 5, 9));
  assert.equal(el.itemType, 'webpage');
  assert.equal(el.accessDate, '2026-10-25 08:05:09');
  assert.deepEqual(el.creators, [
    { creatorType: 'author', firstName: 'Marie', lastName: 'Curie' },
    { creatorType: 'author', lastName: 'AFP', fieldMode: 1 },
  ]);
  assert.equal(el.websiteTitle, 'Le Monde');
});
