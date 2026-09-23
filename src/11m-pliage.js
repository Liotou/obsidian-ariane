// ── avecPliage ───────────────────────────────────────────────────────────
// Domaine : replier et déplier les puces sans saccade. Obsidian fait disparaître
// les lignes d'un coup, et le texte qui suit remonte d'un bloc. Ici, les lignes
// concernées voient leur hauteur descendre à zéro avant que le pli n'ait lieu,
// et remonter après qu'il a été défait : ce sont les VRAIES lignes qu'on anime,
// de sorte que tout ce qui est en dessous suit le mouvement.
//
// Deux précautions tiennent tout l'édifice :
//   - le pli lui-même reste à CodeMirror. Nous ne décidons jamais de ce qui se
//     replie : si notre calcul du bloc se trompe, l'animation est imparfaite,
//     le pli reste juste.
//   - les styles posés sur les lignes sont retirés dès l'animation finie.
//     CodeMirror mesure les hauteurs en continu ; lui laisser des lignes de
//     hauteur nulle lui ferait perdre le fil du défilement.
const avecPliage = (Base) => class extends Base {
  //#region Ariane · pliage animé

  // Le niveau d'imbrication d'une ligne de liste, d'après ses classes. Obsidian
  // les marque « HyperMD-list-line HyperMD-list-line-2 ». Rend 0 pour tout ce
  // qui n'est pas une ligne de liste : une ligne vide, un titre, un paragraphe.
  static niveauLigneListe(classe) {
    const m = /(?:^|\s)HyperMD-list-line-(\d+)(?:\s|$)/.exec(String(classe || ''));
    return m ? Number(m[1]) : 0;
  }

  // Les lignes qui dépendent de celle du départ : celles qui suivent avec un
  // niveau strictement plus profond, jusqu'à la première qui remonte. Une ligne
  // hors liste arrête le bloc plutôt que de l'étendre à tort.
  static lignesDuPli(niveaux, depart) {
    const base = niveaux[depart];
    if (!base) return [];
    const out = [];
    for (let i = depart + 1; i < niveaux.length; i += 1) {
      const n = niveaux[i];
      if (!n || n <= base) break;
      out.push(i);
    }
    return out;
  }

  // Durée retenue : le réglage, borné, et zéro quand le système demande qu'on
  // évite les animations.
  pliageDuree(fenetre) {
    if (this.settings.pliageAnime === false) return 0;
    try {
      if (fenetre && fenetre.matchMedia
        && fenetre.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    } catch (e) { /* pas de matchMedia : on anime */ }
    const d = Number(this.settings.pliageDuree);
    return Math.max(80, Math.min(400, Number.isFinite(d) ? d : 160));
  }

  installerPliageAnime() {
    const brancher = (doc) => {
      if (!doc) return;
      this.registerDomEvent(doc, 'click', (e) => this._pliageSurClic(e), true);
    };
    brancher(document);
    this.registerEvent(this.app.workspace.on('window-open', (_, fenetre) => {
      if (fenetre && fenetre.document) brancher(fenetre.document);
    }));
  }

  _pliageSurClic(evt) {
    if (this._pliageRelance) return;               // notre propre clic de relais
    const cible = evt.target;
    if (!cible || !cible.closest) return;
    const fleche = cible.closest('.cm-fold-indicator');
    if (!fleche) return;
    const ligne = fleche.closest('.cm-line');
    if (!ligne || !ligne.parentElement) return;
    const fenetre = ligne.ownerDocument.defaultView;
    const duree = this.pliageDuree(fenetre);
    if (!duree) return;

    const soeurs = Array.from(ligne.parentElement.children);
    const depart = soeurs.indexOf(ligne);
    const niveaux = soeurs.map((el) => Ariane.niveauLigneListe(el.className));
    if (!niveaux[depart]) return;                  // pas une ligne de liste

    // Déplier : les lignes n'existent pas encore. On laisse le clic passer,
    // puis on fait entrer celles qui viennent d'apparaître.
    if (fleche.classList.contains('is-collapsed')) {
      fenetre.requestAnimationFrame(() => this._pliageOuvrir(ligne, duree));
      return;
    }

    const suivantes = Ariane.lignesDuPli(niveaux, depart).map((i) => soeurs[i]);
    if (!suivantes.length || suivantes.length > 80) return;
    evt.preventDefault();
    evt.stopPropagation();
    this._pliageFermer(suivantes, duree, () => {
      this._pliageRelance = true;
      try {
        fleche.dispatchEvent(new fenetre.MouseEvent('click', { bubbles: true, cancelable: true }));
      } finally { this._pliageRelance = false; }
    });
  }

  // Descente à zéro, puis le pli réel.
  _pliageFermer(lignes, duree, apres) {
    const hauteurs = lignes.map((el) => el.offsetHeight);
    for (const [i, el] of lignes.entries()) {
      el.style.overflow = 'hidden';
      el.style.height = hauteurs[i] + 'px';
    }
    void lignes[0].offsetHeight;                   // force le calcul avant transition
    for (const el of lignes) {
      el.style.transition = 'height ' + duree + 'ms ease, opacity ' + duree + 'ms ease';
      el.style.height = '0px';
      el.style.opacity = '0';
    }
    const fenetre = lignes[0].ownerDocument.defaultView;
    fenetre.setTimeout(() => {
      this._pliageNettoyer(lignes);
      apres();
    }, duree);
  }

  // Le pli vient d'être défait : les lignes sont là, on les fait monter.
  _pliageOuvrir(ligne, duree) {
    if (!ligne.parentElement) return;
    const soeurs = Array.from(ligne.parentElement.children);
    const depart = soeurs.indexOf(ligne);
    if (depart < 0) return;
    const niveaux = soeurs.map((el) => Ariane.niveauLigneListe(el.className));
    const lignes = Ariane.lignesDuPli(niveaux, depart).map((i) => soeurs[i]);
    if (!lignes.length || lignes.length > 80) return;
    const hauteurs = lignes.map((el) => el.offsetHeight);
    for (const el of lignes) {
      el.style.transition = 'none';
      el.style.overflow = 'hidden';
      el.style.height = '0px';
      el.style.opacity = '0';
    }
    void lignes[0].offsetHeight;
    for (const [i, el] of lignes.entries()) {
      el.style.transition = 'height ' + duree + 'ms ease, opacity ' + duree + 'ms ease';
      el.style.height = hauteurs[i] + 'px';
      el.style.opacity = '1';
    }
    const fenetre = lignes[0].ownerDocument.defaultView;
    fenetre.setTimeout(() => this._pliageNettoyer(lignes), duree);
  }

  // Rendre les lignes à CodeMirror : aucune trace de notre passage.
  _pliageNettoyer(lignes) {
    for (const el of lignes) {
      el.style.transition = '';
      el.style.height = '';
      el.style.opacity = '';
      el.style.overflow = '';
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
  }

  //#endregion Ariane · pliage animé
}
