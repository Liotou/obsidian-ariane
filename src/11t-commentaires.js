// ── avecCommentaires ──────────────────────────────────────────────────────
// Domaine : les commentaires en marge (module « commentaires »).
// Le branchement de la section 23 : commandes, menus, surlignage dans
// l'éditeur, rendu en lecture (passage surligné, bouton, bulle), écriture
// des balises dans la note. La logique pure vit dans CommentairesMarge.
const avecCommentaires = (Base) => class extends Base {
  //#region Ariane · commentaires en marge

  // Tout ce que le module enregistre ; appelé seulement s'il est actif.
  brancherCommentaires() {
    this.margeCommentaires = new GestionCommentairesMarge(this);
    this.registerView(TYPE_VUE_COMMENTAIRES, (leaf) => new VueCommentairesMarge(leaf, this));
    this.registerEditorExtension(this.extensionCommentaires());
    this.addRibbonIcon('message-square', tr('Commentaires en marge'), () => this.basculerVueCommentaires());
    // Les commandes portent leur icône : la barre d'édition (section 21) en
    // fait ses boutons.
    this.addCommand({
      id: 'commentaire-ajouter', module: 'commentaires', name: tr('Commenter le passage'), icon: 'message-square-plus',
      editorCallback: (editeur, vue) => this.commenterPassage(editeur, vue.file),
    });
    this.addCommand({
      id: 'commentaire-repondre', module: 'commentaires', name: tr('Répondre au commentaire'), icon: 'reply',
      editorCallback: (editeur, vue) => {
        const a = this._commentaireVise(editeur, vue);
        if (a) this.ouvrirVueCommentaires(true).then(() => {
          const p = vue.file && this.margeCommentaires.panneauDuFichier(vue.file.path);
          if (p) p.repondre(a.id);
        });
      },
    });
    this.addCommand({
      id: 'commentaire-resoudre', module: 'commentaires', name: tr('Marquer le commentaire comme résolu, ou le rouvrir'), icon: 'check',
      editorCallback: (editeur, vue) => {
        const a = this._commentaireVise(editeur, vue);
        if (a && vue.file) this.majCommentaireMarge(vue.file, a.id, (c) => ({ resolu: !c.resolu }));
      },
    });
    this.addCommand({
      id: 'commentaire-modifier', module: 'commentaires', name: tr('Modifier le commentaire sous le curseur'), icon: 'pencil',
      editorCallback: (editeur, vue) => {
        const a = this._commentaireVise(editeur, vue);
        if (a && vue.file) this.modifierCommentaireMarge(vue.file, a.id);
      },
    });
    this.addCommand({
      id: 'commentaire-supprimer', module: 'commentaires', name: tr('Supprimer le commentaire choisi'), icon: 'message-square-x',
      callback: () => {
        const vue = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (vue && vue.file && vue.getMode() === 'source') {
          const a = CommentairesMarge.trouverA(vue.editor.getValue(), vue.editor.posToOffset(vue.editor.getCursor('from')));
          if (a) { this.supprimerCommentaireMarge(vue.file, a.id); return; }
        }
        if (!this.margeCommentaires.supprimerChoisi()) {
          new obsidian.Notice(tr('Choisissez d’abord un commentaire (une carte du volet, ou le curseur dans le passage).'));
        }
      },
    });
    this.addCommand({
      id: 'commentaires-volet', module: 'commentaires', name: tr('Afficher ou masquer le volet des commentaires'),
      icon: 'messages-square',
      callback: () => this.basculerVueCommentaires(),
    });

    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editeur, info) => {
      const f = info && info.file;
      if (!f) return;
      const sous = this.sousMenuAriane(menu);
      sous.addItem((i) => i.setTitle(tr('Commenter le passage')).setIcon('message-square-plus')
        .onClick(() => this.commenterPassage(editeur, f)));
      const a = this._commentaireAuCurseur(editeur, false);
      if (a) { sous.addSeparator(); this.remplirMenuCommentaire(sous, f, a.id); }
    }));
    this.registerMarkdownPostProcessor((el, ctx) => this.decorerLectureCommentaires(el, ctx));

    const m = this.margeCommentaires;
    this.registerEvent(this.app.workspace.on('layout-change', () => m.synchroniser()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => m.synchroniser()));
    this.registerEvent(this.app.workspace.on('file-open', () => m.synchroniser()));
    this.registerEvent(this.app.workspace.on('editor-change',
      () => this.antirebond('commentaires:marge', () => m.synchroniser(), 250)));
    this.registerEvent(this.app.vault.on('modify', (f) => m.rafraichirFichier(f.path)));
    // Les balises masquées en aperçu en direct : une classe sur le corps de
    // chaque fenêtre, volets détachés compris.
    this.registerEvent(this.app.workspace.on('window-open', (fen) => this.appliquerMasqueBalises(fen && fen.doc)));
    this.registerInterval(window.setInterval(() => m.battement(), 1000));
    this.app.workspace.onLayoutReady(() => m.synchroniser(true));
    this.appliquerMasqueBalises();
    this.register(() => {
      for (const d of this._documentsOuverts()) d.body.removeClass('zfa-com-masquer');
      this.fermerBulleCommentaire();
      m.detacher();
    });
  }

  // Le surlignage des passages dans l'éditeur (source et aperçu en direct) :
  // le passage porte la couleur de son commentaire, souligné ; une petite
  // bulle à sa fin ouvre la carte. Le commentaire actif et celui qu'on
  // survole, dans le volet ou dans le texte, s'éclairent. Le suivi du
  // curseur rend active la carte du passage.
  extensionCommentaires() {
    const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
    const { StateEffect } = require('@codemirror/state');
    const greffon = this;
    // Un effet vide : « l'actif ou le survol ont changé, redessinez ».
    const effet = StateEffect.define();
    this._effetCommentaires = effet;

    class Signe extends WidgetType {
      constructor(id, couleur, etat) { super(); this.id = id; this.couleur = couleur; this.etat = etat; }
      eq(o) { return o.id === this.id && o.couleur === this.couleur && o.etat === this.etat; }
      toDOM(vue) {
        const el = vue.dom.ownerDocument.createElement('span');
        el.className = 'zfa-com-signe zfa-com-c-' + this.couleur + (this.etat ? ' ' + this.etat : '');
        el.dataset.comId = this.id;
        el.setAttribute('aria-label', tr('Voir le commentaire'));
        obsidian.setIcon(el, 'message-square');
        el.addEventListener('mousedown', (e) => e.preventDefault());
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          greffon.montrerCommentaire(this.id);
        });
        return el;
      }
      ignoreEvent() { return true; }
    }

    // Le chemin de la note que montre cet éditeur.
    const cheminDe = (vue) => {
      try {
        const info = obsidian.editorInfoField ? vue.state.field(obsidian.editorInfoField, false) : null;
        return info && info.file ? info.file.path : '';
      } catch (e) { return ''; }
    };
    const decorer = (vue) => {
      const doc = vue.state.doc.toString();
      const b = greffon._comBrouillon;
      const brouillon = b && b.from < b.to && b.to <= doc.length && b.chemin === cheminDe(vue) ? b : null;
      if (!brouillon && !doc.includes('class="ann-')) return Decoration.none;
      const actif = greffon._comActif;
      const survol = greffon._comSurvol;
      const plages = [];
      // Le passage d'un commentaire en cours d'écriture, surligné avant même
      // qu'il soit enregistré.
      if (brouillon) {
        plages.push(Decoration.mark({ class: 'zfa-com-texte zfa-com-c-' + brouillon.couleur + ' est-brouillon' })
          .range(brouillon.from, brouillon.to));
      }
      for (const a of CommentairesMarge.lire(doc)) {
        const etat = (a.resolu ? 'est-resolu ' : '') + (a.id === actif ? 'est-actif ' : '') + (a.id === survol ? 'est-survole' : '');
        plages.push(Decoration.mark({ class: 'zfa-com-balise' }).range(a.debut.from, a.debut.to));
        if (a.textFrom < a.textTo) {
          plages.push(Decoration.mark({ class: ('zfa-com-texte zfa-com-c-' + a.couleur + ' ' + etat).trim(),
            attributes: { 'data-com-id': a.id } }).range(a.textFrom, a.textTo));
        }
        plages.push(Decoration.mark({ class: 'zfa-com-balise' }).range(a.fin.from, a.fin.to));
        plages.push(Decoration.widget({ widget: new Signe(a.id, a.couleur, etat.trim()), side: 1 }).range(a.fin.to));
      }
      return Decoration.set(plages, true);
    };
    return ViewPlugin.fromClass(class {
      constructor(vue) { this.decorations = decorer(vue); }
      update(u) {
        const m = greffon.margeCommentaires;
        if (u.docChanged && m) m.suivreBrouillon(u.view, u.changes);
        const signal = u.transactions.some((t) => t.effects.some((e) => e.is(effet)));
        if (u.docChanged || signal) this.decorations = decorer(u.view);
        if (!m) return;
        if (u.selectionSet && !u.docChanged) m.surCurseur(u.view);
        if (u.geometryChanged || u.viewportChanged || u.docChanged) m.geometrie(u.view);
      }
    }, { decorations: (v) => v.decorations });
  }

  // L'actif ou le survol ont changé : chaque éditeur ouvert se redessine.
  // Hors de la mise à jour en cours (on peut venir du suivi du curseur, où
  // CodeMirror refuse une nouvelle transaction).
  // `force` : redessiner même sans changement (le brouillon a bougé).
  signalerCommentaires(actif, survol, force) {
    if (!force && this._comActif === actif && this._comSurvol === survol) return;
    this._comActif = actif;
    this._comSurvol = survol;
    if (!this._effetCommentaires) return;
    setTimeout(() => {
      for (const l of this.app.workspace.getLeavesOfType('markdown')) {
        const cm = l.view && l.view.editor && l.view.editor.cm;
        try { if (cm) cm.dispatch({ effects: this._effetCommentaires.of(null) }); } catch (e) { /* éditeur fermé */ }
      }
    }, 0);
  }

  // Ouvre le volet et y rend active la carte du commentaire.
  async montrerCommentaire(id) {
    await this.ouvrirVueCommentaires(true);
    const p = this.margeCommentaires.panneau;
    if (p) p.activer(id);
  }

  _documentsOuverts() {
    const docs = new Set([document]);
    this.app.workspace.iterateAllLeaves((l) => {
      const d = l.view && l.view.containerEl && l.view.containerEl.ownerDocument;
      if (d) docs.add(d);
    });
    return docs;
  }

  appliquerMasqueBalises(seul) {
    const masquer = this.settings.commentairesMasquer !== false;
    for (const d of seul ? [seul] : this._documentsOuverts()) if (d && d.body) d.body.toggleClass('zfa-com-masquer', masquer);
  }

  auteurCommentaires() {
    return String(this.settings.commentairesAuteur || '').trim() || tr('Moi');
  }

  async basculerVueCommentaires() {
    const ouvertes = this.app.workspace.getLeavesOfType(TYPE_VUE_COMMENTAIRES);
    if (ouvertes.length) ouvertes.forEach((l) => l.detach());
    else await this.ouvrirVueCommentaires(true);
  }

  async ouvrirVueCommentaires(montrer) {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(TYPE_VUE_COMMENTAIRES)[0];
    if (!leaf) {
      const droite = ws.getRightLeaf(false);
      if (!droite) return;
      await droite.setViewState({ type: TYPE_VUE_COMMENTAIRES, active: false });
      leaf = droite;
    }
    if (montrer) await ws.revealLeaf(leaf);
    this.margeCommentaires.synchroniser(true);
  }

  // Une note qu'Ariane ou ZotFlow réécrivent : un commentaire y serait perdu
  // à la prochaine régénération (annotations, notes de lecture, fiches
  // Zotero), ou ne pourrait pas s'y poser (notes verrouillées).
  noteTenueParAriane(f) {
    if (!f) return false;
    const dans = (d) => !!d && f.path.startsWith(d + '/');
    if (dans(this.dossierA) || dans(this.settings.dossierNotesLecture)) return true;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    return fm['zotero-key'] !== undefined || fm.locked === true || fm['zotflow-anno-key'] !== undefined;
  }

  // ── Lecture et écriture de la note ──

  _vueSourceMarge(f) {
    for (const l of this.app.workspace.getLeavesOfType('markdown')) {
      const v = l.view;
      if (v instanceof obsidian.MarkdownView && v.file && v.file.path === f.path && v.getMode() === 'source') return v;
    }
    return null;
  }

  // Le texte de la note : celui de l'éditeur ouvert s'il y en a un.
  async texteCommentaires(f) {
    const v = this._vueSourceMarge(f);
    return v ? v.editor.getValue() : this.app.vault.cachedRead(f);
  }

  appliquerAEditeurMarge(editeur, changements) {
    editeur.transaction({
      changes: changements.map((c) => ({ from: editeur.offsetToPos(c.from), to: editeur.offsetToPos(c.to), text: c.insert })),
    });
  }

  // Le défilement de chaque vue de la note, rendu après l'écriture : une
  // vue de lecture se redessine, et remonterait sinon tout en haut.
  _memoriserDefilement(f) {
    const pris = [];
    for (const l of this.app.workspace.getLeavesOfType('markdown')) {
      const v = l.view;
      if (!(v instanceof obsidian.MarkdownView) || !v.file || v.file.path !== f.path) continue;
      const el = v.getMode() === 'source' ? (v.editor.cm && v.editor.cm.scrollDOM)
        : v.contentEl.querySelector('.markdown-preview-view');
      if (el) pris.push([el, el.scrollTop]);
    }
    return () => {
      for (const delai of [0, 60, 200, 500]) {
        setTimeout(() => { for (const [el, haut] of pris) if (Math.abs(el.scrollTop - haut) > 2) el.scrollTop = haut; }, delai);
      }
    };
  }

  // Applique fn(doc) par l'éditeur ouvert s'il y en a un, sinon au fichier.
  async muterCommentairesMarge(f, fn) {
    const rendre = this._memoriserDefilement(f);
    const v = this._vueSourceMarge(f);
    if (v) {
      const ch = fn(v.editor.getValue());
      if (!ch || !ch.length) return false;
      this.appliquerAEditeurMarge(v.editor, ch);
      rendre();
      return true;
    }
    let fait = false;
    await this.app.vault.process(f, (doc) => {
      const ch = fn(doc);
      if (!ch || !ch.length) return doc;
      fait = true;
      return CommentairesMarge.appliquer(doc, ch);
    });
    rendre();
    return fait;
  }

  // ── Gestes ──

  _commentaireAuCurseur(editeur, prevenir) {
    const a = CommentairesMarge.trouverA(editeur.getValue(), editeur.posToOffset(editeur.getCursor('from')));
    if (!a && prevenir) new obsidian.Notice(tr('Le curseur n’est dans aucun passage commenté.'));
    return a;
  }

  // Le commentaire visé : celui sous le curseur, sinon la carte choisie
  // dans le volet.
  _commentaireVise(editeur, vue) {
    const a = this._commentaireAuCurseur(editeur, false);
    if (a) return a;
    const p = vue && vue.file && this.margeCommentaires.panneauDuFichier(vue.file.path);
    const c = p && p.carteActive();
    if (!c) new obsidian.Notice(tr('Choisissez d’abord un commentaire (une carte du volet, ou le curseur dans le passage).'));
    return c || null;
  }

  commenterPassage(editeur, f) {
    if (!f) return;
    if (this.noteTenueParAriane(f)) {
      new obsidian.Notice(tr('Cette note est réécrite automatiquement (par Ariane ou ZotFlow) : un commentaire y serait perdu.'));
      return;
    }
    const doc = editeur.getValue();
    const a = editeur.posToOffset(editeur.getCursor('from'));
    const b = editeur.posToOffset(editeur.getCursor('to'));
    let from = Math.min(a, b);
    let to = Math.max(a, b);
    if (!editeur.somethingSelected()) {
      // Un texte choisi dans un bloc rendu (encadré en aperçu en direct)
      // n'existe que dans le DOM.
      const rendu = this._selectionRendueMarge(editeur, doc);
      if (rendu === 'introuvable') {
        new obsidian.Notice(tr('Passage introuvable dans la note : double-cliquez pour passer en édition, puis sélectionnez-le.'));
        return;
      }
      // Rien de choisi : la cellule, le bloc de code ou la ligne du curseur.
      const r = rendu || CommentairesMarge.plageAuCurseur(doc, from);
      if (!r) { new obsidian.Notice(tr('Rien à commenter sur cette ligne.')); return; }
      ({ from, to } = r);
    }
    if (!CommentairesMarge.entourer(doc, from, to, 'x', 'test')) {
      new obsidian.Notice(tr('Rien à commenter dans la sélection (un tableau ne se commente que cellule par cellule).'));
      return;
    }
    this.margeCommentaires.panneauPour(editeur).then((p) => {
      if (p) p.commencer(from, to, doc.slice(from, to));
      else new obsidian.Notice(tr('Passez en mode édition et sélectionnez le passage à commenter.'));
    });
  }

  // L'aperçu en direct dessine les blocs hors du curseur en widgets ; un
  // texte choisi là n'est qu'une sélection du DOM. On la ramène à la source :
  // null hors d'un tel widget, « introuvable » si le texte n'y est pas.
  _selectionRendueMarge(editeur, doc) {
    const cm = editeur.cm;
    const sel = cm && cm.contentDOM.ownerDocument.getSelection();
    if (!cm || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const plage = sel.getRangeAt(0);
    const noeud = plage.commonAncestorContainer;
    const el = noeud.nodeType === 1 ? noeud : noeud.parentElement;
    const widget = el && el.closest('.cm-embed-block');
    if (!widget || !cm.contentDOM.contains(widget)) return null;
    const choisi = plage.toString();
    const cible = CommentairesMarge.texteCompact(choisi);
    if (!cible) return 'introuvable';
    // Quelle occurrence dans le widget, si le même texte y revient.
    const tout = widget.ownerDocument.createRange();
    tout.selectNodeContents(widget);
    const avant = tout.cloneRange();
    avant.setEnd(plage.startContainer, plage.startOffset);
    const rang = CommentairesMarge.occurrencesAvant(CommentairesMarge.texteCompact(tout.toString()), cible,
      CommentairesMarge.texteCompact(avant.toString()).length);
    let debut = -1;
    try {
      const r = widget.getBoundingClientRect();
      debut = cm.posAtCoords({ x: r.left + 2, y: r.top + 2 }, false);
    } catch (e) { /* widget non disposé */ }
    if (debut >= 0) {
      const bloc = CommentairesMarge.blocAutour(doc, debut);
      const occ = CommentairesMarge.trouverTexteRendu(doc.slice(bloc.from, bloc.to), choisi);
      const o = occ[Math.min(rang, occ.length - 1)];
      if (o) return { from: bloc.from + o.from, to: bloc.from + o.to };
    }
    // Position du widget inconnue : seulement une occurrence sans ambiguïté.
    const toutes = CommentairesMarge.trouverTexteRendu(doc, choisi);
    return toutes.length === 1 ? toutes[0] : 'introuvable';
  }

  async modifierCommentaireMarge(f, id) {
    const p = this.margeCommentaires.panneauDuFichier(f.path);
    if (p && p.trouver(id)) { p.modifier(id); return; }
    const a = CommentairesMarge.trouverParId(await this.texteCommentaires(f), id);
    if (!a) return;
    new ModaleCommentaireMarge(this.app, tr('Modifier le commentaire'), a.note, a.couleur, (note, couleur) => {
      this.majCommentaireMarge(f, id, { note, couleur });
    }).open();
  }

  // patch : un objet, ou une fonction du commentaire courant qui le rend.
  async majCommentaireMarge(f, id, patch) {
    await this.muterCommentairesMarge(f, (doc) => {
      const a = CommentairesMarge.trouverParId(doc, id);
      return a ? CommentairesMarge.changementsMaj(a, typeof patch === 'function' ? patch(a) : patch) : null;
    });
  }

  async supprimerCommentaireMarge(f, id) {
    await this.muterCommentairesMarge(f, (doc) => {
      const a = CommentairesMarge.trouverParId(doc, id);
      return a ? CommentairesMarge.changementsRetrait(a) : null;
    });
  }

  remplirMenuCommentaire(menu, f, id) {
    const p = this.margeCommentaires.panneauDuFichier(f.path);
    const c = p && p.trouver(id);
    const resolu = !!(c && c.resolu);
    if (p) menu.addItem((i) => i.setTitle(tr('Répondre')).setIcon('message-square').onClick(() => p.repondre(id)));
    menu.addItem((i) => i.setTitle(resolu ? tr('Rouvrir le commentaire') : tr('Marquer comme résolu'))
      .setIcon(resolu ? 'rotate-ccw' : 'check')
      .onClick(() => this.majCommentaireMarge(f, id, (a) => ({ resolu: !a.resolu }))));
    menu.addItem((i) => i.setTitle(tr('Modifier le commentaire')).setIcon('pencil').onClick(() => this.modifierCommentaireMarge(f, id)));
    menu.addItem((i) => {
      i.setTitle(tr('Couleur du commentaire')).setIcon('palette');
      const sous = typeof i.setSubmenu === 'function' ? i.setSubmenu() : null;
      if (!sous) return;
      for (const coul of CommentairesMarge.COULEURS) {
        sous.addItem((j) => j.setTitle(tr(coul.nom) + (c && c.couleur === coul.cle ? '  ✓' : '')).setIcon('circle')
          .onClick(() => this.majCommentaireMarge(f, id, { couleur: coul.cle })));
      }
    });
    menu.addItem((i) => i.setTitle(tr('Supprimer le commentaire')).setIcon('trash')
      .onClick(() => this.supprimerCommentaireMarge(f, id)));
  }

  // ── Mode lecture ──
  //  Les balises arrivent dans le DOM comme des span vides : le texte entre
  //  les deux est enveloppé d'un surlignage, la balise de fin devient un
  //  bouton qui ouvre la bulle du commentaire.

  decorerLectureCommentaires(el, ctx) {
    const d = el.ownerDocument;
    const abs = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    const f = abs instanceof obsidian.TFile ? abs : null;
    // Les commentaires déjà ouverts au début de cette section (étendue sur
    // plusieurs paragraphes).
    const ouverts = new Map();
    const info = ctx.getSectionInfo(el);
    if (info && info.text.includes('class="ann-')) {
      const debut = CommentairesMarge.decalageLigne(info.text, info.lineStart);
      for (const a of CommentairesMarge.lire(info.text)) {
        if (a.debut.to <= debut && a.fin.from >= debut) ouverts.set(a.id, a.couleur);
      }
    }
    const balises = el.querySelectorAll('span.ann-s, span.ann-e');
    if (!ouverts.size && !balises.length) return;
    // Sans information de section : une fin sans début dans ce bloc veut
    // dire « ouvert depuis le haut ».
    const vus = new Set();
    balises.forEach((b) => {
      const id = b.dataset.id || '';
      if (b.classList.contains('ann-s')) vus.add(id);
      else if (!vus.has(id) && !ouverts.has(id)) ouverts.set(id, CommentairesMarge.normaliserCouleur(b.dataset.color));
    });
    const noeuds = [];
    const parcours = d.createTreeWalker(el, 1 | 4);
    while (parcours.nextNode()) noeuds.push(parcours.currentNode);
    const EN_LIGNE = new Set(['P', 'EM', 'STRONG', 'A', 'B', 'I', 'DEL', 'MARK', 'SPAN', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    for (const n of noeuds) {
      if (n.nodeType === 1) {
        if (n.tagName !== 'SPAN') continue;
        const id = n.dataset.id || '';
        if (n.classList.contains('ann-s')) ouverts.set(id, CommentairesMarge.normaliserCouleur(n.dataset.color));
        else if (n.classList.contains('ann-e')) { this._boutonCommentaire(n, f); ouverts.delete(id); }
        continue;
      }
      if (!ouverts.size) continue;
      const val = n.nodeValue || '';
      const parent = n.parentElement;
      if (!val || !parent || parent.closest('.zfa-com-bouton, .zfa-com-bulle')) continue;
      if (val.trim() === '' && !EN_LIGNE.has(parent.tagName)) continue;
      let courant = n;
      for (const [id, couleur] of ouverts) {
        const s = parent.createSpan({ cls: 'zfa-com-hl' });
        s.dataset.id = id;
        s.dataset.color = couleur;
        if (f) {
          s.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const menu = new obsidian.Menu();
            this.remplirMenuCommentaire(menu, f, id);
            menu.showAtMouseEvent(ev);
          });
        }
        courant.parentNode.replaceChild(s, courant);
        s.appendChild(courant);
        courant = s;
      }
    }
  }

  _boutonCommentaire(b, f) {
    const note = b.dataset.note || '';
    b.addClass('zfa-com-bouton', 'zfa-com-c-' + CommentairesMarge.normaliserCouleur(b.dataset.color));
    obsidian.setIcon(b, 'message-square');
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', tr('Voir le commentaire'));
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // Le volet ouvert, la carte suffit ; sinon, une bulle.
      if (this.app.workspace.getLeavesOfType(TYPE_VUE_COMMENTAIRES).length) this.montrerCommentaire(b.dataset.id || '');
      else this._basculerBulleCommentaire(b, note, f);
    });
    if (f) {
      b.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const menu = new obsidian.Menu();
        this.remplirMenuCommentaire(menu, f, b.dataset.id || '');
        menu.showAtMouseEvent(ev);
      });
    }
  }

  _basculerBulleCommentaire(ancre, note, f) {
    const id = ancre.dataset.id || '';
    const ouverte = this._bulleCom && this._bulleCom.dataset.comId === id;
    this.fermerBulleCommentaire();
    if (ouverte) return;
    const d = ancre.ownerDocument;
    const fen = d.defaultView || window;
    const bulle = d.body.createDiv({ cls: 'zfa-com-bulle zfa-com-c-' + CommentairesMarge.normaliserCouleur(ancre.dataset.color) });
    bulle.dataset.comId = id;
    const tete = bulle.createDiv({ cls: 'zfa-com-tete' });
    obsidian.setIcon(tete.createSpan({ cls: 'zfa-com-icone' }), 'message-square');
    tete.createSpan({ cls: 'zfa-com-auteur', text: CommentairesMarge.decoder(ancre.dataset.author || '') || tr('Commentaire') });
    if (ancre.dataset.time) tete.createSpan({ cls: 'zfa-com-heure', text: CommentairesMarge.heureLisible(ancre.dataset.time) });
    bulle.createDiv({ cls: 'zfa-com-bulle-texte', text: note });
    if (f) {
      const actions = bulle.createDiv({ cls: 'zfa-com-actions' });
      actions.createEl('button', { text: tr('Modifier') }).addEventListener('click', () => {
        this.fermerBulleCommentaire();
        this.modifierCommentaireMarge(f, id);
      });
      actions.createEl('button', { text: tr('Supprimer') }).addEventListener('click', () => {
        this.fermerBulleCommentaire();
        this.supprimerCommentaireMarge(f, id);
      });
    }
    const r = ancre.getBoundingClientRect();
    const larg = Math.min(bulle.offsetWidth || 320, fen.innerWidth - 16);
    bulle.style.left = Math.max(8, Math.min(r.left, fen.innerWidth - larg - 8)) + 'px';
    bulle.style.top = (r.bottom + 6) + 'px';
    const surAppui = (e) => { if (!bulle.contains(e.target) && e.target !== ancre) this.fermerBulleCommentaire(); };
    const surTouche = (e) => { if (e.key === 'Escape') this.fermerBulleCommentaire(); };
    const surDefil = (e) => { if (!bulle.contains(e.target)) this.fermerBulleCommentaire(); };
    d.addEventListener('mousedown', surAppui, true);
    d.addEventListener('keydown', surTouche, true);
    d.addEventListener('scroll', surDefil, true);
    this._bulleCom = bulle;
    this._bulleComFin = () => {
      d.removeEventListener('mousedown', surAppui, true);
      d.removeEventListener('keydown', surTouche, true);
      d.removeEventListener('scroll', surDefil, true);
    };
  }

  fermerBulleCommentaire() {
    if (this._bulleComFin) this._bulleComFin();
    this._bulleComFin = null;
    if (this._bulleCom) this._bulleCom.remove();
    this._bulleCom = null;
  }

  //#endregion Ariane · commentaires en marge
};
