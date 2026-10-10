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

test('sommaire : au format des fiches, en-tête « Titre / (Auteur, AAAA) », échappé', () => {
  const html = Ariane.pageSommaireLecture({ titre: 'Participation <citoyenne>', citation: '(Rivière, 2023)', date: '07/10/2026',
    entrees: [{ page: '6', titre: 'Charte </script> & continuité' }] });
  assert.match(html, /@page \{ size: 100mm 150mm; margin: 0; \}/);
  assert.ok(html.includes('Participation &lt;citoyenne&gt;'), 'le titre est échappé');
  assert.ok(html.includes('(Rivière, 2023)'));
  assert.ok(!/Charte <\/script>/.test(html), 'les données ne ferment pas le script');
  assert.match(html, /min-height: 10\.16mm/, 'l\'en-tête fait 40 unités de la fiche');
  assert.ok(!/column-count/.test(html), 'une colonne par défaut');
  assert.match(html, /IMPRIMER = false/);
  assert.match(Ariane.pageSommaireLecture({ titre: 'x', entrees: [], colonnes: 2 }), /column-count: 2/);
  assert.match(Ariane.pageSommaireLecture({ titre: 'x', entrees: [], imprimer: true }), /IMPRIMER = true/);
  const a4 = Ariane.pageSommaireLecture({ titre: 'x', entrees: [], sortie: 'a4' });
  assert.match(a4, /@page \{ size: A4 portrait; margin: 0; \}/);
  assert.match(a4, /var A4 = true/);
});

test('sommaire A4 : trois fiches par face, chaque verso au dos de son recto', () => {
  const f = Ariane.impositionA4(4);
  assert.equal(f.length, 2);
  assert.deepEqual(f[0].recto.map((e) => [e.page, e.x, e.rot]), [[0, 5, 0], [2, 105, 0], [4, 5, 90]]);
  // Retournée sur le bord long, la feuille inverse la gauche et la droite.
  assert.deepEqual(f[0].verso.map((e) => [e.page, e.x, e.rot]), [[1, 105, 0], [3, 5, 0], [5, 55, -90]]);
  assert.deepEqual(f[1].recto.map((e) => e.page), [6]);
  assert.deepEqual(f[1].verso.map((e) => e.page), [7]);
  for (const face of [f[0].recto, f[0].verso]) {
    for (const e of face) {
      const l = e.rot ? 150 : 100;
      const hh = e.rot ? 100 : 150;
      assert.ok(e.x >= 0 && e.x + l <= 210 && e.y >= 0 && e.y + hh <= 297, 'dans la feuille');
    }
  }
});

test('sommaire : le titre du livre sans son sous-titre', () => {
  assert.equal(Ariane.titreCourtOuvrage('Design Science Research: A Method for Science and Technology Advancement'), 'Design Science Research');
  assert.equal(Ariane.titreCourtOuvrage("L'ère du vide. Essais sur l'individualisme contemporain"), "L'ère du vide");
  assert.equal(Ariane.titreCourtOuvrage('Le risque'), 'Le risque');
});

test('sommaire : pages complétées par Zotero, approchées à défaut, ordre de lecture de Zotero', () => {
  const entrees = [
    { cle: 'AAAAAAAA', page: '', titre: 'a' }, { cle: 'BBBBBBBB', page: '', titre: 'b' },
    { cle: 'CCCCCCCC', page: '12', titre: 'c' }, { cle: 'DDDDDDDD', page: '', titre: 'd' },
  ];
  const z = new Map([
    ['AAAAAAAA', { page: 'vii', tri: '00004|00005639' }], ['BBBBBBBB', { page: '', tri: '00004|00009000' }],
    ['CCCCCCCC', { page: '12', tri: '00005|00000100' }], ['DDDDDDDD', { page: '', tri: '00005|00054340' }],
  ]);
  const r = Ariane.completerPagesSommaire(entrees, z);
  assert.deepEqual(r.map((e) => [e.titre, e.page, e.ordre]), [['a', 'vii', 1], ['b', '≈vii', 2], ['c', '12', 3], ['d', '≈12', 4]]);
  assert.deepEqual(Ariane.trierSommaire(r, 'page').map((e) => e.titre), ['a', 'b', 'c', 'd'], 'une page approchée se range avec la sienne');
  assert.ok(!('tri' in r[0]));
});

test('sommaire : pages saisies à la main, associées dans l’ordre, page répétée comprise', () => {
  const e = [{ titre: 'a' }, { titre: 'b' }, { titre: 'c' }];
  const r = Ariane.associerPagesSaisies('12, 12\n15.', e);
  assert.deepEqual(r.pages, ['12', '12', '15']);
  assert.equal(r.ok, true);
  assert.deepEqual(Ariane.associerPagesSaisies('12 ; 13', e), { pages: ['12', '13'], n: 2, attendu: 3, ok: false });
  assert.equal(Ariane.associerPagesSaisies('1 2 3 4', e).ok, false);
  assert.equal(Ariane.associerPagesSaisies('', []).ok, false);
});

test('EPUB : la page d’une annotation retrouvée par sa position CFI', () => {
  const c = Ariane.analyserCfi('epubcfi(/6/4!/4/2,/3:5,/3:9)');
  assert.deepEqual(c, { spine: 1, etapes: [4, 2], texte: 3, decalage: 5 });
  const doc0 = '<html><body><p>avant<span epub:type="pagebreak" title="7"/></p></body></html>';
  const doc1 = '<?xml version="1.0"?><html><head/><body><p>un<span epub:type="pagebreak" title="8"/>deux &amp; trois'
    + '<span role="doc-pagebreak" title="9"/>quatre</p></body></html>';
  const { pos, reperes } = Ariane.positionsXhtml(doc1, [4, 2], 3, 5);
  assert.deepEqual(reperes.map((x) => x.page), ['8', '9']);
  assert.ok(pos > reperes[0].pos && pos < reperes[1].pos, 'dans le texte entre les pages 8 et 9');
  assert.equal(Ariane.pageDepuisCfi([doc0, doc1], 'epubcfi(/6/4!/4/2,/3:5,/3:9)'), '8');
  assert.equal(Ariane.pageDepuisCfi([doc0, doc1], 'epubcfi(/6/4!/4/2,/5:1,/5:3)'), '9');
  assert.equal(Ariane.pageDepuisCfi([doc0, doc1], 'epubcfi(/6/4!/4/2,/1:0,/1:1)'), '7', 'avant tout repère : celui du document précédent');
  assert.equal(Ariane.pageDepuisCfi([doc0], 'epubcfi(/6/2!/4/2,/1:0,/1:1)'), '');
});
