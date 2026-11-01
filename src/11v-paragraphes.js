// ── avecParagraphes ───────────────────────────────────────────────────────
// Domaine : les paragraphes numérotés et déplaçables (module « paragraphes »).
// Le branchement de la section 25 : extension de l'éditeur, commandes pour
// monter ou descendre le bloc du curseur, choix de l'affichage.
const avecParagraphes = (Base) => class extends Base {
  //#region Ariane · paragraphes
  // Tout ce que le module enregistre ; appelé seulement s'il est actif.
  brancherParagraphes() {
    this.registerEditorExtension(GlisserParagraphes.extension(this));
    // Les commandes portent leur icône : la barre d'édition (section 21) en
    // fait ses boutons.
    this.addCommand({
      id: 'paragraphe-monter', module: 'paragraphes', name: tr('Monter le paragraphe'), icon: 'arrow-up',
      editorCallback: (editeur) => this.deplacerParagraphe(editeur, -1),
    });
    this.addCommand({
      id: 'paragraphe-descendre', module: 'paragraphes', name: tr('Descendre le paragraphe'), icon: 'arrow-down',
      editorCallback: (editeur) => this.deplacerParagraphe(editeur, 1),
    });
    this.addCommand({
      id: 'paragraphes-affichage', module: 'paragraphes', name: tr('Numéros des paragraphes : changer l’affichage'),
      icon: 'list-ordered',
      callback: () => this.changerAffichageParagraphes(),
    });
  }

  // Le bloc du curseur échange sa place avec son voisin (sens -1 ou 1).
  deplacerParagraphe(editeur, sens) {
    const cm = editeur && editeur.cm;
    if (!cm) return;
    const texte = cm.state.doc.toString();
    const blocs = ParagraphesTexte.blocs(texte);
    const i = ParagraphesTexte.indexA(blocs, cm.state.selection.main.head);
    if (i < 0) return;
    const r = ParagraphesTexte.deplacer(texte, blocs, i, sens < 0 ? i - 1 : i + 2);
    if (!r) return;
    const decalage = cm.state.selection.main.head - blocs[i].from;
    cm.dispatch({ changes: r.changements, selection: { anchor: r.debut + decalage }, scrollIntoView: true,
      userEvent: 'move.paragraphe' });
  }

  // Toujours, au survol, poignée seule : un tour, puis chaque éditeur se
  // redessine.
  async changerAffichageParagraphes(mode) {
    const modes = GlisserParagraphes.MODES;
    const actuel = GlisserParagraphes.mode(this);
    this.settings.paragraphesMode = modes.includes(mode) ? mode : modes[(modes.indexOf(actuel) + 1) % modes.length];
    await this.saveSettings();
    this.redessinerParagraphes();
    if (!mode) {
      new obsidian.Notice(tr({ toujours: 'Numéros des paragraphes : toujours visibles',
        survol: 'Numéros des paragraphes : au survol', poignee: 'Numéros des paragraphes : masqués, poignée au survol' }[this.settings.paragraphesMode]));
    }
  }

  redessinerParagraphes() {
    if (!this._effetParagraphes) return;
    for (const l of this.app.workspace.getLeavesOfType('markdown')) {
      const cm = l.view && l.view.editor && l.view.editor.cm;
      try { if (cm) cm.dispatch({ effects: this._effetParagraphes.of(null) }); } catch (e) { /* éditeur fermé */ }
    }
  }
  //#endregion Ariane · paragraphes
};
