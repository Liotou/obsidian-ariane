// Sommaire de lecture à imprimer : tri des pages et page HTML.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('sommaire : les pages liminaires, puis les numéros, puis le reste', () => {
  const e = [
    { page: '12', titre: 'b', ordre: 2 }, { page: 'xii', titre: 'r', ordre: 9 }, { page: '3', titre: 'a', ordre: 5 },
    { page: '', titre: 'sans', ordre: 1 }, { page: '12-13', titre: 'c', ordre: 1 }, { page: 'iv', titre: 'q', ordre: 8 },
  ];
  assert.deepEqual(Ariane.trierSommaire(e, 'page').map((x) => x.titre), ['q', 'r', 'a', 'c', 'b', 'sans']);
  assert.deepEqual(Ariane.trierSommaire(e, 'ordre').map((x) => x.titre), ['sans', 'c', 'b', 'a', 'q', 'r']);
  assert.deepEqual(Ariane.rangPage('xiv'), [0, 14]);
});

test('sommaire : une page sobre, en-tête des fiches graphiques, échappée', () => {
  const html = Ariane.pageSommaireLecture({ reference: 'Kamaté (2023)', titre: 'Participation <citoyenne>', date: '07/10/2026',
    format: 'A5', entrees: [{ page: '6', titre: 'Charte de confiance & continuité' }] });
  assert.match(html, /@page \{ size: A5;/);
  assert.match(html, /<div class="ref">Kamaté \(2023\)<\/div><div class="date">07\/10\/2026<\/div>/);
  assert.match(html, /<p class="titre">Participation &lt;citoyenne&gt;<\/p>/);
  assert.match(html, /<li><span class="p">6\.<\/span><span class="t">Charte de confiance &amp; continuité<\/span><\/li>/);
  assert.ok(!/column-count/.test(html), 'une colonne par défaut');
  assert.match(Ariane.pageSommaireLecture({ reference: 'x', entrees: [{ page: '313', titre: 't' }], colonnes: 2 }), /column-count: 2/);
  assert.match(html, /font-family: Georgia/);
  assert.ok(!/window\.print/.test(html), 'pas d\'impression automatique dans l\'aperçu');
  assert.match(Ariane.pageSommaireLecture({ reference: 'x', entrees: [], imprimer: true }), /window\.print\(\)/);
  assert.match(Ariane.pageSommaireLecture({ reference: 'x', entrees: [] }), /Aucune annotation\./);
});
