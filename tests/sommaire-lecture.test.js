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
