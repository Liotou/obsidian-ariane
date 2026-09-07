
// ── avecNoteSchemas ───────────────────────────────────────────────────────
// Domaine : notes (Zotero, biblio, schémas).
// Schémas draw.io : synchronisation vers la note, index des cartes. Le produit
// « graphes » a été retiré ; ce qui reste convertit un schéma en texte.
const avecNoteSchemas = (Base) => class extends Base {
  //#region Ariane · schémas draw.io
  // ── schémas draw.io ──────────────────────────────────────────────────────

  /* ----------------------- Module Cartes (Canvas) ------------------------ */

  vocabCartes() {
    return {
      relations: this.settings.cartesRelations || [],
      types: this.settings.cartesTypesBlocs || [],
      strict: !!this.settings.cartesStrict,
    };
  }

  // Fichier de schéma draw.io actif (.drawio.svg ou .drawio).
  estSchemaDrawio(f) {
    return !!f && (/\.drawio\.svg$/i.test(f.path) || f.extension === 'drawio');
  }

  fichierSchemaActif() {
    const f = this.app.workspace.getActiveFile();
    return this.estSchemaDrawio(f) ? f : null;
  }

  // Graphe d'un schéma draw.io : toutes les pages fusionnées.
  async grapheSchema(file) {
    let contenu = '';
    try { contenu = await this.app.vault.read(file); } catch (e) { return { nodes: [], edges: [] }; }
    const pages = pagesDepuisDrawio(contenu);
    const nodes = [], edges = [];
    pages.forEach((pg, i) => {
      const pref = pages.length > 1 ? 'p' + i + ':' : '';
      for (const n of pg.graphe.nodes) nodes.push(Object.assign({}, n, { id: pref + n.id, page: pg.nom }));
      for (const e of pg.graphe.edges) edges.push(Object.assign({}, e, { id: pref + e.id, fromNode: pref + e.fromNode, toNode: pref + e.toNode, page: pg.nom }));
    });
    // Étiquettes implicites : voir propagerEtiquettes.
    const brut = { nodes, edges, pages: pages.map((x) => x.nom) };
    return this.settings.schemaPropagerEtiquettes === false ? brut : propagerEtiquettes(brut);
  }

  async validerCarte() {
    const schema = this.fichierSchemaActif();
    if (!schema) { new obsidian.Notice(tr('Ouvrez un schéma draw.io (.drawio.svg).')); return; }
    const g = await this.grapheSchema(schema);
    new RapportCarteModal(this.app, schema.basename, analyserCarte(g, this.vocabCartes(), {})).open();
  }

  /* ------------------------- Verrou d'édition --------------------------- */

  // Les notes portant « locked: true » deviennent non modifiables. Le verrou
  // est purement visuel (contenteditable) : le fichier reste accessible aux
  // outils, notamment à la synchronisation des schémas.
  installerVerrouLecture() {
    const appliquer = () => this.appliquerVerrouLecture();
    this.registerEvent(this.app.workspace.on('file-open', appliquer));
    this.registerEvent(this.app.workspace.on('active-leaf-change', appliquer));
    this.registerEvent(this.app.workspace.on('layout-change', appliquer));
    this.registerEvent(this.app.metadataCache.on('resolved', appliquer));
    this.app.workspace.onLayoutReady(appliquer);
  }

  appliquerVerrouLecture() {
    if (this.settings.verrouLecture === false) return;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const vue = leaf ? leaf.view : null;
      if (!vue || !vue.file || !vue.contentEl) continue;
      const fm = (this.app.metadataCache.getFileCache(vue.file) || {}).frontmatter;
      const verrou = !!(fm && (fm.locked === true || fm['zotflow-locked'] === true));
      const zone = vue.contentEl.querySelector('.cm-content');
      if (zone) zone.setAttribute('contenteditable', verrou ? 'false' : 'true');
      vue.contentEl.toggleClass('zfa-verrouillee', verrou);
    }
  }

  // Note associée à un schéma : d'abord par la propriété « graphique »,
  // sinon par la référence (nom de note = préfixe du nom du schéma).
  noteDeSchema(file) {
    const base = file.basename.replace(/\.drawio$/i, '');
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || !fm.graphique) continue;
      const cible = String(fm.graphique).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
      if (cible === base + '.drawio.svg' || cible === base || cible === file.path) return f;
    }
    // À défaut, par la référence : « FS007 - Contingence » -> note « FS007 ».
    // Les schémas peuvent vivre dans un sous-dossier (ex. « Graphiques ») et
    // les notes dans le dossier parent : on élargit donc la recherche, du plus
    // proche au plus lointain.
    const sep = base.match(/^(.*?)\s+-\s+/);
    const reference = (sep ? sep[1] : base).trim();
    if (!reference) return null;

    const dossierSchema = file.parent ? file.parent.path : '';
    const dossierParent = file.parent && file.parent.parent ? file.parent.parent.path : '';
    const homonymes = this.app.vault.getMarkdownFiles().filter((f) => f.basename === reference);
    if (!homonymes.length) return null;

    const dans = (d) => homonymes.find((f) => (f.parent ? f.parent.path : '') === d);
    return dans(dossierSchema) || dans(dossierParent) || homonymes[0];
  }

  // Recopie l'extrait lisible du schéma dans sa note. Renvoie true si écrit.
  async synchroniserSchema(file, silencieux) {
    if (!this.estSchemaDrawio(file)) return false;
    const note = this.noteDeSchema(file);
    if (!note) {
      if (!silencieux) new obsidian.Notice(tr('Aucune note associée à « ') + file.basename + ' ».');
      return false;
    }
    const graphe = await this.grapheSchema(file);
    const base = file.basename.replace(/\.drawio$/i, '');
    const sep = base.match(/^.*?\s+-\s+(.*)$/);
    const extrait = extraitSchema(graphe, sep ? sep[1].trim() : base);
    const actuel = await this.app.vault.read(note);
    const nouveau = injecterExtrait(actuel, extrait);
    if (nouveau === actuel) return false;
    await this.ecrire(note.path, nouveau, note);
    if (!silencieux) new obsidian.Notice(tr('Note « ') + note.basename + ' » synchronisée.');
    return true;
  }

  async synchroniserTousSchemas() {
    const schemas = this.app.vault.getFiles().filter((f) => this.estSchemaDrawio(f));
    if (!schemas.length) { new obsidian.Notice(tr('Aucun schéma draw.io trouvé.')); return; }
    const notice = new obsidian.Notice(tr('Synchronisation des schémas…'), 0);
    let majes = 0, sansNote = 0;
    try {
      for (const f of schemas) {
        if (!this.noteDeSchema(f)) { sansNote++; continue; }
        if (await this.synchroniserSchema(f, true)) majes++;
      }
    } finally { notice.hide(); }
    new obsidian.Notice(tr('Schémas : ') + majes + ' note(s) mise(s) à jour sur ' + schemas.length
      + (sansNote ? ', ' + sansNote + ' sans note associée.' : '.')
    );
  }

  // Agrège toutes les cartes du coffre en un graphe unique.
  async indexerCartes() {
    const vocab = this.vocabCartes();
    const noeuds = new Map();  // texte -> { texte, type, cartes:Set }
    const liens = [];
    for (const f of this.app.vault.getFiles()) {
      if (!this.estSchemaDrawio(f)) continue;
      const data = await this.grapheSchema(f);
      const a = analyserCarte(data, vocab, { blocs: {} });
      const parId = {};
      for (const b of a.blocs) {
        parId[b.id] = b.texte;
        if (!b.texte) continue;
        if (!noeuds.has(b.texte)) noeuds.set(b.texte, { texte: b.texte, type: b.type, cartes: new Set() });
        const n = noeuds.get(b.texte);
        n.cartes.add(f.basename);
        if (!n.type && b.type) n.type = b.type;
      }
      for (const l of a.liens) {
        if (!l.deTexte || !l.versTexte) continue;
        liens.push({ de: l.deTexte, vers: l.versTexte, etiquette: l.etiquette, relation: l.relation, carte: f.basename });
      }
    }
    return { noeuds: [...noeuds.values()], liens };
  }

  async interrogerGraphe() {
    const notice = new obsidian.Notice(tr('Indexation des cartes…'), 0);
    let g;
    try { g = await this.indexerCartes(); } finally { notice.hide(); }
    if (!g.noeuds.length) { new obsidian.Notice(tr('Aucun schéma draw.io trouvé (.drawio.svg).')); return; }
    const choix = g.noeuds
      .sort((a, b) => a.texte.localeCompare(b.texte))
      .map((n) => ({ nom: n.texte + (n.cartes.size > 1 ? '  (' + n.cartes.size + ' cartes)' : ''), valeur: n.texte }));
    new ChoixListeModal(this.app, 'Concept (' + g.noeuds.length + ')', choix, (c) => {
      const sortants = g.liens.filter((l) => l.de === c.valeur);
      const entrants = g.liens.filter((l) => l.vers === c.valeur);
      new VoisinageModal(this.app, c.valeur, sortants, entrants, this).open();
    }).open();
  }

  //#endregion Ariane · schémas draw.io
};
