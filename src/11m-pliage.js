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

  // Ce que le dernier clic a donné, pour le diagnostic des réglages : quand
  // rien ne bouge, c'est ici qu'on lit pourquoi.
  _pliageTrace(raison, extra) {
    this._pliageDernier = Object.assign({ raison, quand: Date.now() }, extra || {});
  }

  _pliageSurClic(evt) {
    if (this._pliageRelance) return;               // notre propre clic de relais
    const cible = evt.target;
    if (!cible || !cible.closest) return;
    const fleche = cible.closest('.cm-fold-indicator');
    if (!fleche) {
      // Mode lecture : la liste est du HTML, le repli masque le sous-arbre.
      if (cible.closest('.markdown-preview-view, .markdown-rendered')) this._pliageLecture(evt, cible);
      return;
    }
    const ligne = fleche.closest('.cm-line');
    if (!ligne || !ligne.parentElement) { this._pliageTrace('flèche hors d’une ligne'); return; }
    const fenetre = ligne.ownerDocument.defaultView;
    const duree = this.pliageDuree(fenetre);
    if (!duree) { this._pliageTrace('animation coupée ou mouvement réduit'); return; }

    const soeurs = Array.from(ligne.parentElement.children);
    const depart = soeurs.indexOf(ligne);
    const niveaux = soeurs.map((el) => Ariane.niveauLigneListe(el.className));
    if (!niveaux[depart]) {
      this._pliageTrace('ligne sans niveau de liste', { classes: String(ligne.className).slice(0, 120) });
      return;
    }

    // Déplier : les lignes n'existent pas encore. On laisse le clic passer,
    // puis on fait entrer celles qui viennent d'apparaître.
    if (fleche.classList.contains('is-collapsed')) {
      this._pliageTrace('dépliage animé');
      fenetre.requestAnimationFrame(() => this._pliageOuvrir(ligne, duree));
      return;
    }

    const suivantes = Ariane.lignesDuPli(niveaux, depart).map((i) => soeurs[i]);
    if (!suivantes.length || suivantes.length > 80) {
      this._pliageTrace('bloc vide ou trop grand', { lignes: suivantes.length, niveau: niveaux[depart] });
      return;
    }
    this._pliageTrace('repli animé', { lignes: suivantes.length });
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

  // En mode lecture, la liste est du HTML et le repli masque « li > ul ».
  // Rien à intercepter côté CodeMirror : on anime la hauteur du sous-arbre.
  _pliageLecture(evt, cible) {
    const bouton = cible.closest('.list-collapse-indicator, .collapse-indicator');
    if (!bouton) return;
    const item = bouton.closest('li');
    const sous = item ? item.querySelector(':scope > ul, :scope > ol') : null;
    if (!sous) { this._pliageTrace('mode lecture : pas de sous-liste'); return; }
    const fenetre = item.ownerDocument.defaultView;
    const duree = this.pliageDuree(fenetre);
    if (!duree) return;
    if (item.classList.contains('is-collapsed')) {
      // Déplié par Obsidian juste après : on le fait monter.
      this._pliageTrace('mode lecture : dépliage animé');
      fenetre.requestAnimationFrame(() => this._pliageMonter(sous, duree));
      return;
    }
    this._pliageTrace('mode lecture : repli animé');
    evt.preventDefault();
    evt.stopPropagation();
    this._pliageDescendre(sous, duree, () => {
      this._pliageRelance = true;
      try { bouton.dispatchEvent(new fenetre.MouseEvent('click', { bubbles: true, cancelable: true })); }
      finally { this._pliageRelance = false; }
    });
  }

  _pliageDescendre(el, duree, apres) {
    const h = el.offsetHeight;
    el.style.overflow = 'hidden';
    el.style.height = h + 'px';
    void el.offsetHeight;
    el.style.transition = 'height ' + duree + 'ms ease, opacity ' + duree + 'ms ease';
    el.style.height = '0px';
    el.style.opacity = '0';
    el.ownerDocument.defaultView.setTimeout(() => { this._pliageNettoyer([el]); apres(); }, duree);
  }

  _pliageMonter(el, duree) {
    const h = el.offsetHeight;
    if (!h) return;
    el.style.transition = 'none';
    el.style.overflow = 'hidden';
    el.style.height = '0px';
    el.style.opacity = '0';
    void el.offsetHeight;
    el.style.transition = 'height ' + duree + 'ms ease, opacity ' + duree + 'ms ease';
    el.style.height = h + 'px';
    el.style.opacity = '1';
    el.ownerDocument.defaultView.setTimeout(() => this._pliageNettoyer([el]), duree);
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
