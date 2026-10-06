// ── avecTableaux ──────────────────────────────────────────────────────────
// Domaine : tableaux des notes (aperçu en direct et mode lecture).
// Largeur des colonnes réglable à la souris, retour à la ligne dans une
// cellule (Maj+Entrée), listes dans les cellules.
//
// Un tableau Markdown n'a pas de syntaxe pour la largeur des colonnes : elle
// est rangée dans un commentaire invisible juste au-dessus du tableau,
//   %% ariane-tableau : 20, 45, 35 %%
// en pourcentages, suivi d'une ligne vide. Le commentaire voyage avec la
// note ; Obsidian ne l'affiche pas en mode lecture, Ariane le masque dans
// l'aperçu en direct (sauf quand le curseur y est) et l'export l'ôte.
const avecTableaux = (Base) => class extends Base {
  //#region Ariane · static · tableaux
  // ── static · tableaux ───────────────────────────────────────────────────

  static get RE_LARGEURS_TABLEAU() { return /^\s*%%\s*ariane-tableau\s*:\s*([\d.,\s]*)%%\s*$/; }

  static lireLargeursTableau(ligne) {
    const m = Ariane.RE_LARGEURS_TABLEAU.exec(String(ligne || ''));
    if (!m) return null;
    const l = m[1].split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x > 0);
    return l.length ? l : null;
  }

  // Des largeurs ramenées à 100 %, au dixième.
  static normaliserLargeurs(largeurs) {
    const l = (largeurs || []).map((x) => Math.max(1, Number(x) || 0));
    const t = l.reduce((s, x) => s + x, 0) || 1;
    return l.map((x) => Math.round(x / t * 1000) / 10);
  }

  static ligneLargeursTableau(largeurs) {
    return '%% ariane-tableau : ' + Ariane.normaliserLargeurs(largeurs).join(', ') + ' %%';
  }

  // Le commentaire des largeurs d'un tableau dont l'en-tête est à la ligne
  // `iTete` : juste au-dessus, ou au-dessus d'une ligne vide. Rend
  // { largeurs, i } (i = sa ligne) ou null.
  static largeursAuDessus(lignes, iTete) {
    for (const k of [iTete - 1, iTete - 2]) {
      if (k < 0) return null;
      const l = Ariane.lireLargeursTableau(lignes[k]);
      if (l) return { largeurs: l, i: k };
      if (k === iTete - 1 && String(lignes[k] || '').trim() !== '') return null;
    }
    return null;
  }

  // Les lignes du texte avec les largeurs posées (ou retirées si `largeurs`
  // est vide) pour le tableau d'en-tête `iTete`. Un commentaire neuf se pose
  // au-dessus du tableau, suivi d'une ligne vide : collé, il ferait partie
  // du paragraphe précédent.
  static poserLargeursTableau(lignes, iTete, largeurs) {
    const out = lignes.slice();
    const deja = Ariane.largeursAuDessus(out, iTete);
    const vide = !largeurs || !largeurs.length;
    if (deja) {
      if (vide) {
        const suiteVide = String(out[deja.i + 1] || '').trim() === '' && deja.i + 1 < iTete;
        out.splice(deja.i, suiteVide ? 2 : 1);
      } else {
        out[deja.i] = Ariane.ligneLargeursTableau(largeurs);
      }
      return out;
    }
    if (vide) return out;
    const avant = iTete > 0 && String(out[iTete - 1] || '').trim() !== '';
    out.splice(iTete, 0, ...(avant ? ['', Ariane.ligneLargeursTableau(largeurs), ''] : [Ariane.ligneLargeursTableau(largeurs), '']));
    return out;
  }

  // Une ligne de cellule commence-t-elle une liste ? Rend { ordonnee, texte }
  // ou null.
  static puceCellule(texte) {
    const m = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/s.exec(String(texte || ''));
    if (!m) return null;
    return { ordonnee: !m[1], texte: m[3] };
  }

  //#endregion Ariane · static · tableaux

  //#region Ariane · tableaux des notes
  // ── tableaux des notes ──────────────────────────────────────────────────

  installerTableaux() {
    // Mode lecture : largeurs, poignées, listes.
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (this.settings.tableauxActifs === false) return;
      const tables = el.querySelectorAll('table');
      if (!tables.length) return;
      const info = ctx.getSectionInfo ? ctx.getSectionInfo(el) : null;
      const lignes = info ? info.text.split('\n') : null;
      for (const table of tables) {
        this._listesDansTableau(table);
        if (!info) continue;
        const iTete = info.lineStart;
        const l = Ariane.largeursAuDessus(lignes, iTete);
        this._appliquerLargeurs(table, l ? l.largeurs : null);
        this._poserPoignees(table, (largeurs) => this._ecrireLargeursFichier(ctx.sourcePath, iTete, largeurs));
      }
    });
    this._installerTableauxEditeur();
    // Maj+Entrée dans une cellule en cours d'édition (aperçu en direct) : un
    // retour à la ligne <br>. La cellule est un petit éditeur à part : on le
    // retrouve depuis le DOM.
    const surTouche = (e) => {
      if (e.key !== 'Enter' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (this.settings.tableauxActifs === false) return;
      const t = e.target;
      if (!t || !t.closest || !t.closest('.cm-table-widget')) return;
      const ed = t.closest('.cm-editor');
      if (!ed) return;
      try {
        const { EditorView } = require('@codemirror/view');
        const vue = EditorView.findFromDOM(ed);
        if (!vue) return;
        e.preventDefault(); e.stopPropagation();
        vue.dispatch(vue.state.replaceSelection('<br>'));
      } catch (err) { /* éditeur introuvable : comportement d'Obsidian */ }
    };
    const ecouter = (doc) => this.registerDomEvent(doc, 'keydown', surTouche, { capture: true });
    ecouter(document);
    this.registerEvent(this.app.workspace.on('window-open', (_w, win) => { if (win && win.document) ecouter(win.document); }));
  }

  // Aperçu en direct : le commentaire des largeurs masqué hors du curseur,
  // Maj+Entrée sur une ligne de tableau en mode source, et les tableaux
  // (widgets d'Obsidian) habillés à chaque mise à jour.
  _installerTableauxEditeur() {
    let cm;
    try {
      cm = { view: require('@codemirror/view'), state: require('@codemirror/state') };
    } catch (e) { return; }
    const { Decoration, EditorView, ViewPlugin, keymap } = cm.view;
    const { StateField, Prec } = cm.state;
    const plugin = this;

    const masquer = (state) => {
      const deco = [];
      const sel = state.selection.main;
      for (let n = 1; n <= state.doc.lines; n++) {
        const l = state.doc.line(n);
        if (l.length > 120 || l.text.indexOf('ariane-tableau') < 0) continue;
        if (!Ariane.lireLargeursTableau(l.text)) continue;
        if (sel.from <= l.to && sel.to >= l.from) continue;
        deco.push(Decoration.replace({ block: true }).range(l.from, l.to));
      }
      return Decoration.set(deco, true);
    };
    const champ = StateField.define({
      create: (state) => masquer(state),
      update: (val, tr) => (tr.docChanged || tr.selection ? masquer(tr.state) : val),
      provide: (f) => EditorView.decorations.from(f),
    });

    const habiller = ViewPlugin.fromClass(class {
      constructor(view) { this.view = view; this.planifier(); }
      update(u) { if (u.docChanged || u.viewportChanged || u.geometryChanged) this.planifier(); }
      planifier() {
        clearTimeout(this.t);
        this.t = setTimeout(() => plugin._habillerTableauxVue(this.view), 30);
      }
      destroy() { clearTimeout(this.t); }
    });

    const touche = Prec.high(keymap.of([{
      key: 'Shift-Enter',
      run: (view) => {
        if (plugin.settings.tableauxActifs === false) return false;
        const l = view.state.doc.lineAt(view.state.selection.main.head);
        if (!/^\s*\|/.test(l.text)) return false;
        view.dispatch(view.state.replaceSelection('<br>'));
        return true;
      },
    }]));

    this.registerEditorExtension([champ, habiller, touche]);
  }

  // Les tableaux affichés par un éditeur (aperçu en direct).
  _habillerTableauxVue(view) {
    if (this.settings.tableauxActifs === false || !view || !view.dom || !view.dom.isConnected) return;
    for (const w of view.dom.querySelectorAll('.cm-table-widget')) {
      const table = w.querySelector('table');
      if (!table) continue;
      let pos;
      try { pos = view.posAtDOM(w); } catch (e) { continue; }
      const doc = view.state.doc;
      const nTete = doc.lineAt(pos).number;
      const lignes = [];
      for (let n = Math.max(1, nTete - 2); n <= nTete; n++) lignes.push(doc.line(n).text);
      const l = Ariane.largeursAuDessus(lignes, lignes.length - 1);
      this._appliquerLargeurs(table, l ? l.largeurs : null);
      this._listesDansTableau(table);
      this._poserPoignees(table, (largeurs) => this._ecrireLargeursEditeur(view, w, largeurs));
    }
  }

  // Largeurs posées sur le tableau (colgroup), ou retirées.
  _appliquerLargeurs(table, largeurs) {
    const ncol = (table.rows[0] && table.rows[0].cells.length) || 0;
    let cg = table.querySelector(':scope > colgroup.zfa-tab-cols');
    if (!largeurs || !ncol) {
      if (cg) cg.remove();
      table.removeClass('zfa-tab-largeurs');
      return;
    }
    const l = Ariane.normaliserLargeurs(Array.from({ length: ncol }, (_, i) => largeurs[i] || (100 / ncol)));
    if (!cg) {
      cg = table.ownerDocument.createElement('colgroup');
      cg.className = 'zfa-tab-cols';
      table.insertBefore(cg, table.firstChild);
    }
    while (cg.children.length > ncol) cg.lastChild.remove();
    while (cg.children.length < ncol) cg.appendChild(table.ownerDocument.createElement('col'));
    l.forEach((x, i) => { cg.children[i].style.width = x + '%'; });
    table.addClass('zfa-tab-largeurs');
  }

  // Une poignée au bord droit de chaque cellule d'en-tête. Tirer élargit la
  // colonne (les autres gardent leur largeur, le tout ramené à 100 %) ;
  // double-clic : largeurs automatiques. `ecrire(largeurs|null)` enregistre.
  _poserPoignees(table, ecrire) {
    const tete = table.rows[0];
    if (!tete) return;
    const cells = Array.from(tete.cells);
    cells.forEach((th, i) => {
      if (th.querySelector(':scope > .zfa-tab-poignee')) return;
      const p = th.ownerDocument.createElement('div');
      p.className = 'zfa-tab-poignee';
      p.setAttribute('aria-label', tr('Glisser : largeur de la colonne · double-clic : automatique'));
      th.appendChild(p);
      p.addEventListener('mousedown', (e) => e.stopPropagation());
      p.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
      p.addEventListener('dblclick', (e) => {
        e.stopPropagation(); e.preventDefault();
        this._appliquerLargeurs(table, null);
        ecrire(null);
      });
      p.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation(); e.preventDefault();
        const doc = p.ownerDocument;
        const x0 = e.clientX;
        const depart = Array.from(table.rows[0].cells).map((c) => c.getBoundingClientRect().width);
        let fin = depart.slice();
        table.addClass('est-redimensionne');
        const bouger = (mv) => {
          fin = depart.slice();
          fin[i] = Math.max(40, depart[i] + (mv.clientX - x0));
          this._appliquerLargeurs(table, fin);
        };
        const lacher = () => {
          doc.removeEventListener('pointermove', bouger);
          doc.removeEventListener('pointerup', lacher);
          table.removeClass('est-redimensionne');
          if (fin.some((x, k) => Math.abs(x - depart[k]) > 2)) ecrire(Ariane.normaliserLargeurs(fin));
        };
        doc.addEventListener('pointermove', bouger);
        doc.addEventListener('pointerup', lacher);
      });
    });
  }

  // Écriture depuis l'aperçu en direct : une transaction de l'éditeur, que
  // ⌘Z défait comme une frappe.
  _ecrireLargeursEditeur(view, widget, largeurs) {
    let pos;
    try { pos = view.posAtDOM(widget); } catch (e) { return; }
    const doc = view.state.doc;
    const nTete = doc.lineAt(pos).number;
    const n0 = Math.max(1, nTete - 2);
    const avant = [];
    for (let n = n0; n <= nTete; n++) avant.push(doc.line(n).text);
    const apres = Ariane.poserLargeursTableau(avant, avant.length - 1, largeurs);
    const from = doc.line(n0).from;
    const to = doc.line(nTete).to;
    view.dispatch({ changes: { from, to, insert: apres.join('\n') } });
  }

  // Écriture depuis le mode lecture : dans le fichier.
  async _ecrireLargeursFichier(chemin, iTete, largeurs) {
    const f = this.app.vault.getAbstractFileByPath(chemin);
    if (!f) return;
    await this.app.vault.process(f, (texte) => {
      const lignes = texte.split('\n');
      if (!/\|/.test(lignes[iTete] || '')) return texte;
      return Ariane.poserLargeursTableau(lignes, iTete, largeurs).join('\n');
    });
  }

  // Les lignes d'une cellule qui commencent par « - », « * » ou « 1. »
  // deviennent une vraie liste. Le fichier, lui, garde « - a<br>- b ».
  // Une cellule en cours d'édition n'est pas touchée.
  _listesDansTableau(table) {
    for (const cell of table.querySelectorAll('td, th')) {
      if (cell.querySelector('.cm-editor')) continue;
      const hote = cell.querySelector(':scope > .table-cell-wrapper') || cell;
      if (hote.querySelector(':scope > .zfa-tab-liste')) continue;
      // Les lignes de la cellule, séparées par les <br>.
      const groupes = [[]];
      for (const n of Array.from(hote.childNodes)) {
        if (n.nodeName === 'BR') groupes.push([]);
        else groupes[groupes.length - 1].push(n);
      }
      const texteDe = (g) => g.map((n) => n.textContent).join('');
      if (!groupes.some((g) => Ariane.puceCellule(texteDe(g)))) continue;
      const doc = hote.ownerDocument;
      const frag = doc.createDocumentFragment();
      let liste = null;
      for (const g of groupes) {
        const p = Ariane.puceCellule(texteDe(g));
        if (!p) {
          liste = null;
          const bloc = doc.createElement('div');
          for (const n of g) bloc.appendChild(n);
          if (g.length) frag.appendChild(bloc);
          continue;
        }
        if (!liste || (liste.tagName === 'OL') !== p.ordonnee) {
          liste = doc.createElement(p.ordonnee ? 'ol' : 'ul');
          liste.className = 'zfa-tab-liste';
          frag.appendChild(liste);
        }
        const li = doc.createElement('li');
        // Retirer la marque du premier nœud texte, garder le reste (gras,
        // liens…) tel quel.
        let ote = false;
        for (const n of g) {
          if (!ote && n.nodeType === 3) {
            n.textContent = n.textContent.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
            ote = true;
          }
          li.appendChild(n);
        }
        liste.appendChild(li);
      }
      hote.textContent = '';
      hote.appendChild(frag);
    }
  }

  //#endregion Ariane · tableaux des notes
};
