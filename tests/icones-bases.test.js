const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const { basesCleIcone, basesIconeOrigine, basesEstItemVue, IconesVuesBases } = Ariane._test;

// Un élément de page minimal : de quoi éprouver la pose et le retrait d'une
// icône sans navigateur. `setIcon` est neutralisé dans le faux Obsidian, on
// suit donc la trace laissée dans les attributs.
function el(classe, enfants) {
  const e = {
    className: classe || '', dataset: {}, enfants: enfants || [],
    querySelector(sel) {
      const trouve = (n) => {
        for (const x of n.enfants || []) {
          if (x.correspond && x.correspond(sel)) return x;
          const p = trouve(x);
          if (p) return p;
        }
        return null;
      };
      return trouve(e);
    },
    correspond(sel) {
      if (sel === 'svg') return e.tag === 'svg';
      return sel.startsWith('.') ? String(e.className).split(' ').includes(sel.slice(1)) : false;
    },
    empty() { e.enfants = []; },
  };
  return e;
}

function svg(classe) { const e = el(''); e.tag = 'svg'; e.getAttribute = () => classe; return e; }

test('clé d\'icône : la base et le nom de la vue, espaces en trop mis de côté', () => {
  assert.equal(basesCleIcone('08 - Tâches.base', 'Notes conceptuelles'), '08 - Tâches.base::Notes conceptuelles');
  assert.equal(basesCleIcone('a.base', '  Vue  '), 'a.base::Vue');
  assert.equal(basesCleIcone(null, null), '::');
  // Deux bases peuvent avoir une vue de même nom sans se mélanger.
  assert.notEqual(basesCleIcone('a.base', 'Vue'), basesCleIcone('b.base', 'Vue'));
});

test('icône en place : son nom lucide se relit, pour savoir la remettre', () => {
  const porteur = el('x', [svg('svg-icon lucide-table')]);
  assert.equal(basesIconeOrigine(porteur), 'lucide-table');
  assert.equal(basesIconeOrigine(el('x', [svg('svg-icon')])), '', 'une icône sans nom lucide');
  assert.equal(basesIconeOrigine(el('x')), '', 'aucune icône');
  assert.equal(basesIconeOrigine(null), '');
});

test('élément de menu : une vue, mais ni une propriété ni une formule', () => {
  const chevron = el('bases-toolbar-menu-item-icon');
  const coche = el(''); coche.correspond = (s) => s === 'input[type="checkbox"]';
  const valeur = el('bases-toolbar-menu-item-value');
  assert.equal(basesEstItemVue(el('bases-toolbar-menu-item', [chevron])), true);
  assert.equal(basesEstItemVue(el('bases-toolbar-menu-item', [coche])), false, 'une propriété porte une case');
  assert.equal(basesEstItemVue(el('bases-toolbar-menu-item', [valeur])), false, 'une formule affiche sa valeur');
  assert.equal(basesEstItemVue(null), false);
});

test('pose et retrait : l\'icône d\'origine est retenue, puis rendue', () => {
  const greffon = { app: { workspace: {} }, settings: { basesIcones: {} } };
  const centre = new IconesVuesBases(greffon);
  const porteur = el('x', [svg('svg-icon lucide-table')]);

  centre.poser(porteur, 'book-open');
  assert.equal(porteur.dataset.zfaIcone, 'book-open');
  assert.equal(porteur.dataset.zfaIconeOrigine, 'lucide-table', 'de quoi revenir en arrière');

  centre.poser(porteur, 'book-open');
  assert.equal(porteur.dataset.zfaIcone, 'book-open', 'reposer la même ne change rien');

  centre.poser(porteur, '');
  assert.equal(porteur.dataset.zfaIcone, undefined);
  assert.equal(porteur.dataset.zfaIconeOrigine, undefined, 'plus rien à retenir');

  centre.poser(null, 'book-open'); // sans porteur : sans effet, et sans erreur
});

test('pose : une icône jamais posée ne se retire pas non plus', () => {
  const centre = new IconesVuesBases({ app: { workspace: {} }, settings: {} });
  const porteur = el('x', [svg('svg-icon lucide-table')]);
  centre.poser(porteur, '');
  assert.deepEqual(porteur.dataset, {}, 'l\'icône d\'Obsidian est laissée intacte');
});

test('liste des icônes : le préfixe lucide tombe, sans doublon ni désordre', () => {
  const { ModaleChoixIcone } = Ariane._test;
  // Le catalogue vient d'Obsidian ; le faux en rend quatre, dont deux qui se
  // confondent une fois « lucide- » retiré.
  assert.deepEqual(ModaleChoixIcone.disponibles(), ['book-open', 'table', 'users']);
});
