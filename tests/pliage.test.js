const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('niveau d\'une ligne de liste : lu dans les classes d\'Obsidian', () => {
  const n = Ariane.niveauLigneListe;
  assert.equal(n('HyperMD-list-line HyperMD-list-line-1 cm-line'), 1);
  assert.equal(n('cm-line HyperMD-list-line-3'), 3);
  assert.equal(n('cm-line'), 0, 'un paragraphe n\'est pas une ligne de liste');
  assert.equal(n('HyperMD-list-line'), 0, 'sans niveau, pas de niveau');
  assert.equal(n('cm-line HyperMD-list-line-12 x'), 12);
  assert.equal(n(''), 0);
  assert.equal(n(null), 0);
  // Une classe qui contient le motif sans être la bonne ne compte pas.
  assert.equal(n('zfa-HyperMD-list-line-2'), 0);
});

test('bloc replié : les lignes plus profondes, jusqu\'à celle qui remonte', () => {
  //  0: niveau 1  <- on replie celle-ci
  //  1: niveau 2      dedans
  //  2: niveau 3      dedans
  //  3: niveau 2      dedans
  //  4: niveau 1      dehors : même niveau
  const niveaux = [1, 2, 3, 2, 1, 2];
  assert.deepEqual(Ariane.lignesDuPli(niveaux, 0), [1, 2, 3]);
  assert.deepEqual(Ariane.lignesDuPli(niveaux, 1), [2], 'depuis la sous-puce');
  assert.deepEqual(Ariane.lignesDuPli(niveaux, 3), [], 'une puce sans enfant ne replie rien');
  assert.deepEqual(Ariane.lignesDuPli(niveaux, 4), [5]);
  assert.deepEqual(Ariane.lignesDuPli(niveaux, 5), [], 'la dernière ligne');
});

test('bloc replié : une ligne hors liste arrête le bloc', () => {
  // Le 0 est un paragraphe ou une ligne vide : on s'arrête là plutôt que
  // d'étendre le bloc à tort, l'animation resterait alors en deçà du pli réel.
  assert.deepEqual(Ariane.lignesDuPli([1, 2, 0, 2], 0), [1]);
  assert.deepEqual(Ariane.lignesDuPli([0, 2, 3], 0), [], 'partir de hors liste ne replie rien');
});

test('durée du pliage : réglage borné, et zéro quand on ne veut pas d\'animation', () => {
  const greffon = Object.create(Ariane.prototype);
  const fenetre = (reduit) => ({ matchMedia: () => ({ matches: reduit }) });

  greffon.settings = { pliageAnime: true, pliageDuree: 200 };
  assert.equal(greffon.pliageDuree(fenetre(false)), 200);
  assert.equal(greffon.pliageDuree(fenetre(true)), 0, 'le système demande d\'éviter les animations');

  greffon.settings = { pliageAnime: false, pliageDuree: 200 };
  assert.equal(greffon.pliageDuree(fenetre(false)), 0, 'réglage coupé');

  greffon.settings = { pliageAnime: true, pliageDuree: 5 };
  assert.equal(greffon.pliageDuree(fenetre(false)), 80, 'trop court : borné');
  greffon.settings = { pliageAnime: true, pliageDuree: 9000 };
  assert.equal(greffon.pliageDuree(fenetre(false)), 400, 'trop long : borné');
  greffon.settings = { pliageAnime: true };
  assert.equal(greffon.pliageDuree(fenetre(false)), 160, 'valeur par défaut');
  assert.equal(greffon.pliageDuree(null), 160, 'sans fenêtre, on anime quand même');
});

// ── L'enchaînement du clic ──────────────────────────────────────────────────
// Un éditeur factice : juste ce que le mixin touche. Les minuteries sont
// tenues à la main, pour dérouler l'animation pas à pas.
function editeurFactice(lignesSpec) {
  const differes = [];
  const cadres = [];
  const fenetre = {
    matchMedia: () => ({ matches: false }),
    setTimeout: (f) => { differes.push(f); return differes.length; },
    requestAnimationFrame: (f) => { cadres.push(f); },
    MouseEvent: class { constructor(type, o) { this.type = type; Object.assign(this, o || {}); } },
  };
  const contenu = { children: [] };
  const lignes = lignesSpec.map((niveau) => {
    const fleche = {
      className: 'cm-fold-indicator', classList: { contient: false,
        contains(c) { return c === 'is-collapsed' && this.contient; } },
      envoyes: [],
      dispatchEvent(e) { this.envoyes.push(e); return true; },
    };
    const ligne = {
      className: niveau ? 'cm-line HyperMD-list-line HyperMD-list-line-' + niveau : 'cm-line',
      style: {}, offsetHeight: 24, fleche,
      ownerDocument: { defaultView: fenetre },
      get parentElement() { return contenu; },
      getAttribute: () => null, removeAttribute() { this.styleRetire = true; },
    };
    fleche.closest = (sel) => (sel === '.cm-fold-indicator' ? fleche : (sel === '.cm-line' ? ligne : null));
    contenu.children.push(ligne);
    return ligne;
  });
  return { lignes, fenetre, differes, cadres };
}

function clicSur(greffon, ligne) {
  const evt = { target: ligne.fleche, defaut: 0, arret: 0,
    preventDefault() { this.defaut += 1; }, stopPropagation() { this.arret += 1; } };
  greffon._pliageSurClic(evt);
  return evt;
}

test('clic pour replier : le pli attend la fin de l\'animation', () => {
  const g = Object.create(Ariane.prototype);
  g.settings = { pliageAnime: true, pliageDuree: 120 };
  const { lignes, differes } = editeurFactice([1, 2, 2, 1]);

  const evt = clicSur(g, lignes[0]);
  assert.equal(evt.defaut, 1, 'le clic d\'Obsidian est retenu');
  assert.equal(evt.arret, 1);
  assert.equal(lignes[1].style.height, '0px', 'les lignes descendent');
  assert.equal(lignes[2].style.opacity, '0');
  assert.equal(lignes[3].style.height, undefined, 'la ligne de même niveau est laissée');
  assert.equal(lignes[0].fleche.envoyes.length, 0, 'rien n\'est replié tant que ça bouge');

  differes.shift()();                      // fin de l'animation
  assert.equal(lignes[1].style.height, '', 'les styles sont rendus à CodeMirror');
  assert.equal(lignes[1].style.transition, '');
  assert.equal(lignes[0].fleche.envoyes.length, 1, 'le pli a lieu ensuite');
  assert.equal(lignes[0].fleche.envoyes[0].type, 'click');
});

test('clic pour déplier : le clic passe, les lignes entrent après coup', () => {
  const g = Object.create(Ariane.prototype);
  g.settings = { pliageAnime: true, pliageDuree: 120 };
  const { lignes, differes, cadres } = editeurFactice([1, 2, 2, 1]);
  lignes[0].fleche.classList.contient = true;      // déjà replié

  const evt = clicSur(g, lignes[0]);
  assert.equal(evt.defaut, 0, 'Obsidian déplie lui-même, sans être retenu');
  assert.equal(cadres.length, 1, 'l\'entrée est remise à la frappe suivante');

  cadres.shift()();                                // les lignes sont réapparues
  assert.equal(lignes[1].style.height, '24px', 'elles montent vers leur hauteur');
  assert.equal(lignes[1].style.opacity, '1');
  differes.shift()();
  assert.equal(lignes[1].style.height, '', 'puis rendues intactes');
});

test('clic sans bloc, ou animation coupée : Ariane ne s\'en mêle pas', () => {
  const g = Object.create(Ariane.prototype);
  g.settings = { pliageAnime: true, pliageDuree: 120 };
  const { lignes } = editeurFactice([1, 1]);
  assert.equal(clicSur(g, lignes[0]).defaut, 0, 'une puce sans enfant : rien à animer');

  g.settings = { pliageAnime: false };
  const b = editeurFactice([1, 2]);
  assert.equal(clicSur(g, b.lignes[0]).defaut, 0, 'réglage coupé');

  g.settings = { pliageAnime: true, pliageDuree: 120 };
  const c = editeurFactice([0, 2]);
  assert.equal(clicSur(g, c.lignes[0]).defaut, 0, 'une ligne hors liste');
});

test('clic de relais : notre propre clic n\'est pas ré-intercepté', () => {
  const g = Object.create(Ariane.prototype);
  g.settings = { pliageAnime: true, pliageDuree: 120 };
  const { lignes } = editeurFactice([1, 2]);
  g._pliageRelance = true;
  assert.equal(clicSur(g, lignes[0]).defaut, 0, 'sans quoi le pli n\'aurait jamais lieu');
});
