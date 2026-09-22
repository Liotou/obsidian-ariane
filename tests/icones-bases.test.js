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

// ── Héritage depuis Iconize ─────────────────────────────────────────────────

test('icône Iconize : le jeu Lucide se traduit, l\'emoji passe, le reste non', () => {
  const { basesIconeIconize } = Ariane._test;
  assert.equal(basesIconeIconize('LiArchive'), 'archive');
  assert.equal(basesIconeIconize('LiBookTemplate'), 'book-template');
  assert.equal(basesIconeIconize('LiChartBarStacked'), 'chart-bar-stacked');
  assert.equal(basesIconeIconize('LiQrCode'), 'qr-code');
  assert.equal(basesIconeIconize('📚'), '📚', 'un emoji se pose tel quel');
  assert.equal(basesIconeIconize('FaBook'), '', 'un autre jeu ne se dessine pas ici');
  assert.equal(basesIconeIconize(''), '');
  assert.equal(basesIconeIconize(null), '');
});

test('dossiers d\'une vue : les formes de filtre qu\'Obsidian accepte', () => {
  const { basesDossiersDepuisFiltres } = Ariane._test;
  const filtres = {
    and: [
      'file.folder == "03 - Notes conceptuelles"',
      'file.ext == "md"',
      { or: ['file.folder.startsWith("02 - Annotations")', 'file.inFolder("09 - Divers")'] },
    ],
  };
  assert.deepEqual(basesDossiersDepuisFiltres(filtres),
    ['03 - Notes conceptuelles', '02 - Annotations', '09 - Divers']);
  // Deux dossiers dans un même filtre, et la barre finale en trop.
  assert.deepEqual(basesDossiersDepuisFiltres(['file.folder == "04 - Livrables/Réunions/"']),
    ['04 - Livrables/Réunions']);
  assert.deepEqual(basesDossiersDepuisFiltres(['note["Tâche - Terminée"] == false']), []);
  assert.deepEqual(basesDossiersDepuisFiltres(null), []);
});

test('icône d\'une vue : la sienne d\'abord, celle de son dossier ensuite', () => {
  const { IconesVuesBases, basesCleIcone } = Ariane._test;
  const reglages = {
    basesIcones: { [basesCleIcone('Base.base', 'Réunions')]: 'users' },
    basesIconesDossiers: true,
  };
  const centre = new IconesVuesBases({ app: { workspace: {} }, manifest: { dir: 'x/y' }, settings: reglages });
  centre.lireIconize = () => {};
  centre.lireBase = () => {};
  centre.iconesDossiers = { '03 - Notes conceptuelles': 'LiBookText', '06 - Réflexions': '💭' };
  centre.basesConnues.set('Base.base', {
    communs: ['03 - Notes conceptuelles'],
    vues: new Map([
      ['Notes conceptuelles', ['03 - Notes conceptuelles']],
      ['Réunions', ['04 - Sans icône']],
      ['Réflexives', ['06 - Réflexions']],
      ['Sans filtre', []],
    ]),
  });
  assert.equal(centre.iconeDeVue('Base.base', 'Notes conceptuelles'), 'book-text', 'héritée du dossier');
  assert.equal(centre.iconeDeVue('Base.base', 'Réunions'), 'users', 'la sienne l\'emporte');
  assert.equal(centre.iconeDeVue('Base.base', 'Réflexives'), '💭');
  assert.equal(centre.iconeDeVue('Base.base', 'Sans filtre'), 'book-text',
    'sans filtre propre, le dossier commun de la base');
  assert.equal(centre.iconeDeVue('Base.base', 'Inconnue'), 'book-text');
  assert.equal(centre.iconeDeVue('', 'Notes conceptuelles'), '', 'sans base, rien à hériter');

  reglages.basesIconesDossiers = false;
  assert.equal(centre.iconeDeVue('Base.base', 'Notes conceptuelles'), '', 'héritage coupé');
  assert.equal(centre.iconeDeVue('Base.base', 'Réunions'), 'users', 'la sienne reste');
});

test('icône d\'un dossier : à défaut, celle du dossier qui le contient', () => {
  const { basesIconeDeDossier } = Ariane._test;
  const table = { '04 - Livrables': 'LiNotebookText', '04 - Livrables/Notes': 'LiPenBox' };
  assert.equal(basesIconeDeDossier(table, '04 - Livrables/Notes'), 'pen-box', 'la sienne d\'abord');
  assert.equal(basesIconeDeDossier(table, '04 - Livrables/Comptes-rendus/2026'), 'notebook-text',
    'on remonte de deux crans s\'il le faut');
  assert.equal(basesIconeDeDossier(table, '09 - Ailleurs'), '');
  assert.equal(basesIconeDeDossier(table, ''), '');
  assert.equal(basesIconeDeDossier(null, '04 - Livrables'), '');
});
