
// ── avecNoteBiblio ────────────────────────────────────────────────────────
// Phase 2 : ariane-note.
// Bibliographie en note, index bibliographique, export Pandoc/Word, fusion des
// variantes de nom d'auteur.
const avecNoteBiblio = (Base) => class extends Base {
  //#region Ariane · bibliographie en note & citations dynamiques
  // ── bibliographie en note & citations dynamiques ─────────────────────────

  /* -------------------------- Bibliographie ----------------------------- */

  // Note source (@citekey) correspondant à une clé citée : elle-même si c'en
  // est une, sinon la source de l'annotation.
  sourceDeCle(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(String(cle), '');
    if (!dest) return null;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    if (fm.citationKey) return dest;
    const src = fm['zotflow-source'];
    if (!src) return null;
    const cible = String(src).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const f = this.app.metadataCache.getFirstLinkpathDest(cible, dest.path);
    return f || null;
  }

  // Sources citées dans le corps, dans l'ordre d'apparition, sans doublon.
  sourcesCitees(contenu) {
    const corps = corpsCitable(contenu);
    const vues = new Map();
    for (const m of corps.matchAll(/\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)) {
      const f = this.sourceDeCle(cleDeLien(m[1]));
      if (f && !vues.has(f.path)) vues.set(f.path, f);
    }
    return [...vues.values()];
  }

  async majBibliographie(file, silencieux) {
    if (!file || file.extension !== 'md') return false;
    const avant = await this.app.vault.read(file);
    const sources = this.sourcesCitees(avant);

    // Aucune citation et aucun bloc existant : on n'ajoute rien.
    if (!sources.length && avant.indexOf(ZFA_BIBLIO_DEBUT) === -1) return false;

    const modele = this.settings.biblioModele;
    const champ = this.settings.biblioChamp || 'bibliographie';

    const entrees = [];
    for (const f of sources) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // Référence déjà formatée par zotflow, sinon repli sur le modèle libre.
      let texte = nettoyerEntreeBiblio(fm[champ]);
      if (!texte) texte = entreeBiblio(f.basename, fm, modele);
      if (!texte) continue;
      entrees.push({
        texte,
        cle: f.basename,
        tri: entreeBiblio(f.basename, fm, '{{auteurs}} {{annee}}') || texte,
      });
    }

    if (this.settings.biblioTri !== 'apparition') {
      entrees.sort((a, b) => a.tri.localeCompare(b.tri, 'fr'));
    }

    const lignes = entrees.map((e) => (this.settings.biblioLien === false
      ? e.texte
      : entreeCliquable(e.texte, e.cle, this.settings.biblioLienTexte)));
    const bloc = construireBibliographie(lignes, this.settings.biblioTitre);
    const apres = injecterBibliographie(avant, bloc);
    if (apres === avant) return false;
    await this.ecrire(file.path, apres, file);
    if (!silencieux) new obsidian.Notice(tr('Bibliographie : ') + entrees.length + ' source(s).');
    return true;
  }

  async majBibliographieToutes() {
    const notes = this.notesConvertibles();
    const notice = new obsidian.Notice(tr('Bibliographies…'), 0);
    let n = 0;
    try {
      for (const f of notes) { if (await this.majBibliographie(f, true)) n++; }
    } finally { notice.hide(); }
    new obsidian.Notice(tr('Bibliographie mise à jour dans ') + n + ' note(s).');
  }

  // Une clé désigne-t-elle une annotation ou une note source citable ?
  estCitable(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(String(cle), '');
    if (!dest) return false;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    return fm['zotflow-anno-key'] !== undefined || !!fm.citationKey;
  }

  async rafraichirCitations(portee) {
    let fichiers;
    if (portee === 'active') {
      const f = this.app.workspace.getActiveFile();
      if (!f || f.extension !== 'md') { new obsidian.Notice(tr('Ouvrez une note.')); return; }
      fichiers = [f];
    } else {
      fichiers = this.notesConvertibles();
    }
    const notice = new obsidian.Notice(tr('Rafraîchissement des citations…'), 0);
    let notes = 0, total = 0;
    try {
      for (const f of fichiers) {
        const avant = await this.app.vault.read(f);
        if (avant.indexOf('|') === -1) continue;
        const r = rafraichirLibelles(avant, (c) => this.libelleCitation(c), (c) => this.estCitable(c));
        if (!r.n || r.texte === avant) continue;
        await this.ecrire(f.path, r.texte, f);
        notes++; total += r.n;
      }
    } finally { notice.hide(); }
    new obsidian.Notice(total
      ? total + ' citation(s) mise(s) à jour dans ' + notes + ' note(s).'
      : 'Toutes les citations sont déjà à jour.');
  }

  // Libellé lisible d'une annotation : « Méric et al., 2009, p. 2 ».
  // Met en forme un libellé « Auteurs, année, p. X » à partir de composants.
  formatCitation(a, page, cle) {
    const vars = {
      auteur: a ? a.court : '',
      auteurs: a ? a.court : '',
      auteursComplets: a ? a.complet : '',
      annee: a ? a.annee : '',
      page: page || '',
      key: cle || '',
    };
    return appliquerModele(this.settings.modeleCitation || '{{auteurs}}, {{annee}}, p. {{page}}', vars)
      .replace(/,\s*p\.\s*(?=$|[;,)])/g, '')
      .replace(/\s*,\s*(?=,)/g, '')
      .replace(/^[\s,;]+|[\s,;]+$/g, '')
      .replace(/\s{2,}/g, ' ');
  }

  // Libellé d'une citation. Trois cas :
  //  - note source : ses propres auteurs, sans page ;
  //  - annotation sans référence citée : auteurs de la source + page ;
  //  - annotation citant un travail tiers : ce travail, suivi de « cité dans »
  //    et de la source réellement consultée — sauf si ce travail figure lui
  //    aussi dans Zotero, auquel cas il est cité directement.
  libelleCitation(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    const fm = dest ? ((this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {}) : {};

    if (fm['zotflow-anno-key'] === undefined) {
      return this.formatCitation(this.auteursDepuisReference('[[' + cle + ']]', ''), '', cle) || cle;
    }

    const pageAnno = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const libSource = this.formatCitation(
      src ? this.auteursDepuisReference('[[' + src + ']]', dest ? dest.path : '') : null, pageAnno, cle);

    // Références citées distinctes de la source. Une annotation peut en
    // porter plusieurs : elles sont toutes retenues, et non la première
    // seulement. Celles qui figurent dans Zotero sont citées directement,
    // les autres sont regroupées derrière un unique « cité dans ».
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const pages = fm['références-pages'] || {};
    const sep = this.settings.separateurCitation || ' ; ';
    const directes = [];
    const indirectes = [];

    for (const rv of refs) {
      const cible = String(rv).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
      if (!cible || cible === src) continue;

      const pageRef = String(pages[cible] != null ? pages[cible] : '').replace(/^["']|["']$/g, '').trim();
      const dansZotero = cible.startsWith('@')
        || !!(this.app.metadataCache.getFirstLinkpathDest(cible, '')
          && ((this.app.metadataCache.getFileCache(
            this.app.metadataCache.getFirstLinkpathDest(cible, '')) || {}).frontmatter || {}).citationKey);

      const libRef = this.formatCitation(
        this.auteursDepuisReference('[[' + cible + ']]', dest ? dest.path : ''), pageRef, cible);
      if (!libRef) continue;

      // Consultée directement : citation simple. Sinon : citation de seconde main.
      (dansZotero ? directes : indirectes).push(libRef);
    }

    const morceaux = [];
    if (directes.length) morceaux.push(directes.join(sep));

    if (indirectes.length) {
      if (this.settings.citationsIndirectesAbregees !== false) {
        // Forme abrégée : la source porte le nombre de travaux qu'elle
        // rapporte. La portée du « cité dans » cesse d'être ambiguë, puisque
        // les emprunts sont rattachés à leur source au lieu d'être alignés
        // à côté des citations directes.
        morceaux.push(libSource + ' ' + this.marqueEmprunt(indirectes.length));
      } else {
        // Forme complète. L'accord au pluriel signale au moins qu'il y a
        // plusieurs emprunts derrière un même « cité dans ».
        const mention = this.settings.citeDans || ', cité dans ';
        // « \b » ne marque pas de frontière après « é », qui n'est pas un
        // caractère de mot : on vise donc explicitement « cité dans ».
        const accorde = indirectes.length > 1
          ? mention.replace(/cité(\s+dans)/, 'cités$1')
          : mention;
        morceaux.push(indirectes.join(sep) + accorde + libSource);
      }
    }
    if (morceaux.length) return morceaux.join(sep);

    return libSource || cle;
  }

  // Motif du compteur, dérivé du modèle de réglage : « ⟨{{n}}⟩ » -> /⟨(\d+)⟩/
  motifEmprunt() {
    const modele = this.settings.citationsMarqueEmprunt || '⟨{{n}}⟩';
    const echappe = modele.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(echappe.replace('\\{\\{n\\}\\}', '(\\d+)').replace('{{n}}', '(\\d+)'));
  }

  // Infobulle listant les travaux rapportés, en liens cliquables. Une seule
  // bulle vit à la fois ; elle se ferme au départ du pointeur.
  ouvrirBulleEmprunts(ancre, cle) {
    this.fermerBulleEmprunts();
    const emprunts = this.empruntsDeAnnotation(cle);
    if (!emprunts.length) return;

    const bulle = document.createElement('div');
    bulle.className = 'zfa-bulle-emprunts';

    const source = this.sourceLisible(cle);
    const entete = bulle.createDiv({ cls: 'zfa-bulle-entete' });
    entete.setText(emprunts.length > 1
      ? 'Travaux rapportés par ' + (source || 'cette source')
      : 'Travail rapporté par ' + (source || 'cette source'));

    for (const e of emprunts) {
      const l = bulle.createDiv({ cls: 'zfa-bulle-item' });
      const a = l.createEl('a', { cls: 'internal-link', text: e.libelle });
      a.setAttr('href', e.cible);
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.app.workspace.openLinkText(e.cible, e.chemin, ev.ctrlKey || ev.metaKey);
        this.fermerBulleEmprunts();
      });
    }

    document.body.appendChild(bulle);
    const r = ancre.getBoundingClientRect();
    bulle.style.left = Math.max(8, Math.min(r.left, window.innerWidth - bulle.offsetWidth - 8)) + 'px';
    const dessous = r.bottom + 6;
    bulle.style.top = (dessous + bulle.offsetHeight > window.innerHeight
      ? Math.max(8, r.top - bulle.offsetHeight - 6) : dessous) + 'px';

    // La bulle reste tant que le pointeur est sur elle ou sur le compteur.
    let sortie = null;
    const partir = () => { sortie = window.setTimeout(() => this.fermerBulleEmprunts(), 220); };
    const rester = () => { if (sortie) { window.clearTimeout(sortie); sortie = null; } };
    ancre.addEventListener('mouseleave', partir);
    bulle.addEventListener('mouseenter', rester);
    bulle.addEventListener('mouseleave', partir);
    this._bulleEmprunts = bulle;
  }

  fermerBulleEmprunts() {
    if (this._bulleEmprunts) {
      this._bulleEmprunts.remove();
      this._bulleEmprunts = null;
    }
  }

  // En lecture : le compteur est un morceau de texte dans le lien de citation.
  // On l'isole pour lui accrocher la bulle, sans toucher au lien lui-même.
  enrichirCompteursEmprunts(el) {
    if (!el.querySelectorAll) return;
    const motif = this.motifEmprunt();
    for (const a of el.querySelectorAll('a.internal-link')) {
      if (a.querySelector('.zfa-emprunt')) continue;
      const cle = (a.getAttribute('data-href') || a.getAttribute('href') || '')
        .replace(/#.*$/, '').trim();
      if (!cle) continue;
      for (const noeud of Array.from(a.childNodes)) {
        if (noeud.nodeType !== Node.TEXT_NODE) continue;
        const m = noeud.nodeValue.match(motif);
        if (!m) continue;
        const apres = noeud.splitText(m.index);
        apres.nodeValue = apres.nodeValue.slice(m[0].length);
        const marque = document.createElement('span');
        marque.className = 'zfa-emprunt';
        marque.textContent = m[0];
        marque.setAttribute('aria-label', m[1] + ' travaux rapportés');
        marque.addEventListener('mouseenter', () => this.ouvrirBulleEmprunts(marque, cle));
        a.insertBefore(marque, apres);
        break;
      }
    }
  }

  // Compteur d'emprunts accolé à la source consultée.
  marqueEmprunt(n) {
    const modele = this.settings.citationsMarqueEmprunt || '⟨{{n}}⟩';
    return modele.replace(/\{\{n\}\}/g, String(n));
  }

  // Références rapportées par une annotation, pour l'infobulle du compteur.
  // Rend les cibles telles qu'écrites, afin qu'elles restent cliquables.
  empruntsDeAnnotation(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest) return [];
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    if (fm['zotflow-anno-key'] === undefined) return [];

    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const pages = fm['références-pages'] || {};
    const out = [];
    for (const rv of refs) {
      const cible = String(rv).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
      if (!cible || cible === src) continue;
      const dansZotero = cible.startsWith('@')
        || !!(this.app.metadataCache.getFirstLinkpathDest(cible, '')
          && ((this.app.metadataCache.getFileCache(
            this.app.metadataCache.getFirstLinkpathDest(cible, '')) || {}).frontmatter || {}).citationKey);
      if (dansZotero) continue; // citée directement, elle figure déjà en clair
      const page = String(pages[cible] != null ? pages[cible] : '').replace(/^["']|["']$/g, '').trim();
      const libelle = this.formatCitation(
        this.auteursDepuisReference('[[' + cible + ']]', dest.path), page, cible) || cible;
      out.push({ cible, libelle, chemin: dest.path });
    }
    return out;
  }

  // Source consultée d'une annotation, pour l'en-tête de l'infobulle.
  sourceLisible(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest) return '';
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    if (!src) return '';
    const page = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    return this.formatCitation(this.auteursDepuisReference('[[' + src + ']]', dest.path), page, cle) || src;
  }



  // Mode « citation classique » : insère « ([[clé|Auteur, année, p. X]]) » au
  // point visé, ou complète le groupe de citations déjà présent à cet endroit.
  attacherCitation(cm, lineNumber, cles, insertOffset) {
    const doc = cm.state.doc;
    const docStr = doc.toString();
    const ligneFin = doc.line(lineNumber);
    const sep = this.settings.separateurCitation || ' ; ';

    // La citation se place toujours AVANT la ponctuation finale. En dépôt sur
    // la phrase, l'offset est déjà calculé ainsi ; en dépôt sur le paragraphe,
    // on vise la ponctuation qui termine la ligne.
    let pos;
    if (insertOffset != null) {
      pos = insertOffset;
    } else {
      const txt = ligneFin.text;
      const mFin = masquerLiens(txt).match(/[.?!…][ \t]*$/);
      if (mFin) {
        let i = mFin.index;
        while (i > 0 && /[ \t\u00a0\u202f]/.test(txt[i - 1])) i--;
        pos = ligneFin.from + i;
      } else {
        pos = ligneFin.to;
      }
    }

    // Ne pas citer deux fois la même annotation dans le voisinage immédiat.
    const voisinage = docStr.slice(Math.max(0, pos - 400), pos + 400);
    const entrees = cles
      .filter((c) => voisinage.indexOf('[[' + c + '|') === -1)
      .map((c) => '[[' + c + '|' + this.libelleCitation(c) + ']]');

    const modif = composerCitation(docStr, pos, entrees, sep);
    if (!modif) return false;
    cm.dispatch({ changes: [modif] });
    return true;
  }

  //#endregion Ariane · bibliographie en note & citations dynamiques

  //#region Ariane · bibliographie — index & génération
  // ── bibliographie — index & génération ───────────────────────────────────

  cheminBibliographies() {
    const rel = this.app.vault.configDir + '/plugins/' + this.manifest.id + '/bibliographies.json';
    const base = (this.app.vault.adapter && this.app.vault.adapter.basePath) || '';
    return base ? require('path').join(base, rel) : null;
  }

  chargerBibliographies() {
    if (this.bibliographies) return this.bibliographies;
    const c = this.cheminBibliographies();
    try {
      this.bibliographies = c ? JSON.parse(require('fs').readFileSync(c, 'utf8')) : {};
    } catch (e) {
      this.bibliographies = {};
    }
    return this.bibliographies;
  }

  // Les références citées d'une source, dans la forme d'Ariane, quelle que soit
  // la manière dont elles sont entrées dans le cache.
  /* ------------- La bibliographie lue dans le PDF lui-même ----------------- *
   * Crossref ne connaît que ce qui porte un DOI. Or les livres n'en ont
   * souvent pas, et ce sont eux qui portent les références les plus citées :
   * Dresch 2015 à lui seul cite March & Smith, Romme et van Aken, invisibles
   * autrement. Zotero garde sur le disque le texte extrait de chaque PDF, dans
   * « storage/<clé>/.zotero-ft-cache ». On y lit la bibliographie directement.
   * ------------------------------------------------------------------------ */

  racineZotero() {
    const regle = (this.settings.dossierZotero || '').trim();
    if (regle) return regle;
    const os = require('os');
    return require('path').join(os.homedir(), 'Zotero');
  }

  // Le texte extrait d'une pièce jointe, mis en cache mémoire : un PDF pèse
  // deux cent cinquante mille caractères, on ne le relit pas par référence.
  texteAttachement(cle) {
    if (!cle) return '';
    if (!this._textesPdf) this._textesPdf = {};
    if (Object.prototype.hasOwnProperty.call(this._textesPdf, cle)) return this._textesPdf[cle];
    const chemin = require('path').join(this.racineZotero(), 'storage', cle, '.zotero-ft-cache');
    let t = '';
    try { t = require('fs').readFileSync(chemin, 'utf8'); } catch (e) { t = ''; }
    this._textesPdf[cle] = t;
    return t;
  }

  // Cherche dans le PDF d'une source ce qu'elle dit d'un libellé cité.
  async entreePdfPourSource(sourceBasename, libelle) {
    const m = String(libelle).match(/^(.*?),\s*(\d{4})/);
    if (!m) return null;
    const nom = m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop();
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === sourceBasename);
    if (!f) return null;
    const cle = await this.cleAttachement(f);
    if (!cle) return null;
    const t = this.texteAttachement(cle);
    if (!t) return null;
    const e = Ariane.entreeDansTexte(t, nom, m[2]);
    if (!e || !e.titre || e.titre.length < 8) return null;
    return { auteurs: [nom.toLowerCase()], annee: m[2], titre: e.titre,
      revue: '', doi: '', brut: e.brut, viaPdf: true };
  }

  // Clé de pièce jointe par source, construite une fois : candidatsPourSource
  // est synchrone et ne peut pas lire les notes.
  async indexAttachements() {
    if (this._attachements) return this._attachements;
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.estSourceZoteroFrontmatter(f)) continue;
      const cle = await this.cleAttachement(f);
      if (cle) m.set(f.basename, cle);
    }
    this._attachements = m;
    return m;
  }

  bibliographieDeDoi(doi) {
    const d = normDoi(doi);
    if (!d) return null;
    const brut = this.chargerBibliographies()[d];
    if (!brut) return null;
    if (!this._biblioNorm) this._biblioNorm = {};
    if (!this._biblioNorm[d]) this._biblioNorm[d] = Ariane.normaliserBiblio(brut);
    return this._biblioNorm[d];
  }

  async ecrireBibliographies() {
    const c = this.cheminBibliographies();
    if (!c) return;
    try {
      require('fs').writeFileSync(c, JSON.stringify(this.bibliographies || {}), 'utf8');
    } catch (e) {
      console.error('[Ariane] Cache de bibliographies non écrit :', e);
    }
  }

  // Qui cite quoi. Une annotation porte « zotflow-source » et
  // « références-citées » : le croisement des deux donne, pour chaque référence
  // en attente, les sources qui la mentionnent et combien de fois.
  indexCitations() {
    const parRef = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = sansLien(fm['zotflow-source'] || '');
      const refs = fm['références-citées'];
      if (!src || !refs) continue;
      const liste = Array.isArray(refs) ? refs : [refs];
      for (const brut of liste) {
        const nom = cleDeLien(sansLien(brut));
        if (!nom || nom === src) continue;
        if (!parRef.has(nom)) parRef.set(nom, { total: 0, sources: new Map() });
        const e = parRef.get(nom);
        e.total += 1;
        e.sources.set(src, (e.sources.get(src) || 0) + 1);
      }
    }
    return parRef;
  }

  // Toutes les références en attente, avec ce qu'on sait d'elles.
  indexReferencesAttente() {
    const dossier = this.dossierR;
    const citations = this.indexCitations();
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!dossier || !f.path.startsWith(dossier + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.type !== 'reference-citee') continue;
      const c = citations.get(f.basename) || { total: 0, sources: new Map() };
      out.push({
        fichier: f,
        nom: f.basename,
        doi: normDoi(fm.doi),
        titre: String(fm['titre-cité'] || '').trim(),
        etat: String(fm['arbitrage'] || '').trim(),
        complete: Array.isArray(fm.auteurs) && fm.auteurs.length > 0 && !!fm['titre-cité'],
        citations: c.total,
        sources: [...c.sources.entries()].sort((a, b) => b[1] - a[1]),
      });
    }
    out.sort((a, b) => b.citations - a.citations || a.nom.localeCompare(b.nom));
    return out;
  }

  // Les passages surlignés où une référence est citée. C'est la matière que
  // demande la résolution fine : le texte de l'article autour de l'appel de
  // citation, qui dit de quoi il retourne.
  indexPassages() {
    const parRef = new Map();
    const marque = '[!' + (this.settings.calloutCitation || 'quote') + ']';
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = sansLien(fm['zotflow-source'] || '');
      const refs = fm['références-citées'];
      if (!src || !refs) continue;
      const liste = (Array.isArray(refs) ? refs : [refs]).map((x) => cleDeLien(sansLien(x)));
      const noms = liste.filter((n) => n && n !== src);
      if (!noms.length) continue;
      parRef.set('__fichiers__', true);
      for (const nom of noms) {
        if (!parRef.has(nom)) parRef.set(nom, []);
        parRef.get(nom).push({ fichier: f, source: src, marque });
      }
    }
    parRef.delete('__fichiers__');
    return parRef;
  }

  // Le passage surligné d'une note d'annotation, tel que le modèle l'a écrit.
  async passageDe(fichier, marque) {
    const t = await this.app.vault.cachedRead(fichier);
    const i = t.indexOf('> ' + marque);
    if (i < 0) return '';
    const lignes = [];
    for (const l of t.slice(i).split('\n').slice(1)) {
      const m = l.match(/^>\s?(.*)$/);
      if (!m) break;
      if (/^\[!/.test(m[1].trim())) break;
      lignes.push(m[1]);
    }
    return lignes.join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  // Fenêtre de texte autour de l'appel de citation dans le passage. C'est elle
  // qui départage deux entrées de bibliographie du même auteur et de la même
  // année : le sujet de la phrase ressemble au titre du bon travail.
  fenetreCitation(passage, nomFamille) {
    if (!passage || !nomFamille) return '';
    const p = sansAccents(passage);
    const i = p.indexOf(sansAccents(nomFamille));
    if (i < 0) return passage;
    const mots = passage.split(/\s+/);
    let compte = 0, index = 0;
    for (let k = 0; k < mots.length; k++) {
      compte += mots[k].length + 1;
      if (compte > i) { index = k; break; }
    }
    return mots.slice(Math.max(0, index - 25), index + 25).join(' ');
  }

  // Les candidats de bibliographie d'un libellé chez UNE source, classés. Sorti
  // de la résolution pour que le comptage par œuvre s'appuie exactement sur le
  // même appariement, sans en écrire un second qui divergerait.
  candidatsPourSource(libelle, source, passage) {
    const m = String(libelle).match(/^(.*?),\s*(\d{4})([a-z]?)/);
    if (!m) return [];
    const premier2 = m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop();
    const premier = sansAccents(premier2);
    const annee = m[2];
    const suffixe = m[3] || '';
    const fiche = this.construireIndexZotero().find((z) => z.basename === source);
    const liste = fiche && fiche.doi ? this.bibliographieDeDoi(fiche.doi) : null;
    // Crossref muet — le cas de tous les livres, qui n'ont pas de DOI : on lit
    // la bibliographie dans le texte du PDF lui-même.
    const versPdf = () => {
      const cle = this._attachements ? this._attachements.get(source) : null;
      const e = cle ? Ariane.entreeDansTexte(this.texteAttachement(cle), premier2, annee) : null;
      if (!e || !titreCredible(e.titre)) return [];
      return [{ titre: e.titre, doi: '', brut: e.brut, revue: '', score: 0, viaPdf: true }];
    };
    // Crossref muet, le cas de tous les livres, qui n'ont pas de DOI.
    if (!liste || !liste.length) return versPdf();
    const sac = new Set(tokeniser(this.fenetreCitation(passage || '', premier)));

    const cands = [];
    for (const e of liste) {
      if (String(e.annee || '') !== annee) continue;
      const brut = sansAccents(e.brut || '');
      const noms = (e.auteurs || []).map((x) => sansAccents(String(x).split(/\s+/).pop()));
      const colle = noms.length
        ? noms.includes(premier)
        : brut.split(/[^a-z0-9]+/).filter(Boolean)[0] === premier;
      if (!colle) continue;
      // Crossref rend parfois la référence entière en guise de titre. On en
      // extrait le vrai titre, faute de quoi la note détachée s'appellerait
      // « (Lawrence, M.G., S) », un début de liste d'auteurs.
      let titre = String(e.titre || '').trim();
      if (titre && !titreCredible(titre)) titre = titreDansReference(titre, annee);
      const doi = normDoi(e.doi);
      if (!titre && !doi) continue;
      cands.push({ titre, doi, brut, revue: String(e.revue || '').trim(), score: 0 });
    }
    if (!cands.length) return [];

    if (suffixe) {
      const explicite = cands.filter((c) => c.brut.includes(annee + suffixe));
      if (explicite.length) {
        for (const c of explicite) c.score += 100;
      } else {
        const rang = suffixe.charCodeAt(0) - 97;
        const tries = cands.slice().sort((x, y) => x.titre.localeCompare(y.titre));
        if (tries[rang]) tries[rang].score += 60;
      }
    }
    for (const c of cands) {
      let ctx = 0;
      for (const mot of tokeniser(c.titre)) if (sac.has(mot)) ctx += 3;
      c.score += Math.min(ctx, 30);
    }
    // Crossref a répondu mais ne mentionne pas cette référence : sa liste est
    // souvent incomplète. Le PDF, lui, porte la bibliographie entière.
    if (!cands.length) return versPdf();

    cands.sort((a, b) => b.score - a.score);
    return cands;
  }

  /* ------------------ Compter par œuvre, non par libellé ------------------- *
   * Le libellé agrège mal : « Gawer & Cusumano, 2014 » et « Gawer, 2014 » sont
   * le même article et comptent séparément, tandis que « Iansiti & Levien,
   * 2004 » cumule six citations pour DEUX ouvrages distincts. Compter par œuvre
   * répare les deux, et c'est ce compte qui doit guider une acquisition.
   * ------------------------------------------------------------------------ */

  async indexOeuvres(passages) {
    const P = passages || this.indexPassages();
    await this.indexAttachements();
    const parRef = new Map();
    const parOeuvre = new Map();

    for (const [libelle, occurrences] of P) {
      const oeuvres = new Map();
      let nonResolues = 0;
      for (const occ of occurrences) {
        const passage = await this.passageDe(occ.fichier, occ.marque);
        const c = this.candidatsPourSource(libelle, occ.source, passage)[0];
        const cle = c ? cleOeuvre(c.titre, c.doi) : '';
        if (!cle) { nonResolues += 1; continue; }
        if (!oeuvres.has(cle)) {
          oeuvres.set(cle, { cle, titre: c.titre, doi: c.doi, revue: c.revue,
            viaPdf: !!c.viaPdf, n: 0, sources: [] });
        }
        const o = oeuvres.get(cle);
        o.n += 1;
        if (!o.sources.includes(occ.source)) o.sources.push(occ.source);
        if (c.titre.length > (o.titre || '').length) o.titre = c.titre;
        if (!o.doi && c.doi) o.doi = c.doi;
      }
      // Une occurrence non résolue ne fonde pas une œuvre : elle rejoint la
      // seule connue quand il n'y en a qu'une. Sans cette règle, « Bowker &
      // Star, 1999 » passait pour deux travaux, l'un identifié et l'autre non.
      const liste = Ariane.fondreOeuvresProches([...oeuvres.values()]);
      // La clé doit être recalculée après la fonte : le titre retenu est le plus
      // complet des deux, et sans ce recalcul la clé restait celle du premier
      // venu. Deux libellés désignant la même œuvre gardaient alors des clés
      // différentes, et la détection des fusions tombait à zéro.
      for (const o of liste) o.cle = cleOeuvre(o.titre, o.doi) || o.cle;
      if (liste.length === 1) liste[0].n += nonResolues;
      const total = occurrences.length;
      parRef.set(libelle, { oeuvres: liste, nonResolues: liste.length === 1 ? 0 : nonResolues, total });
      for (const o of liste) {
        if (!parOeuvre.has(o.cle)) {
          parOeuvre.set(o.cle, { cle: o.cle, titre: o.titre, doi: o.doi,
            viaPdf: !!o.viaPdf, n: 0, libelles: [] });
        }
        const g = parOeuvre.get(o.cle);
        g.n += o.n;
        if (!g.libelles.includes(libelle)) g.libelles.push(libelle);
        if ((o.titre || '').length > (g.titre || '').length) g.titre = o.titre;
        if (!g.doi && o.doi) g.doi = o.doi;
      }
    }
    return { parRef, parOeuvre };
  }

  // Résolution d'une référence en attente, source par source.
  //
  // On ne retient plus « la première source qui répond ». Une même note,
  // « Renn, 2008 », peut désigner deux travaux différents selon l'article qui
  // la cite : mesuré, sur les neuf références résolues par au moins deux
  // sources, cinq divergent et deux désignent réellement deux œuvres. Prendre
  // la première venue choisissait au hasard, et le hasard s'est déjà écrit dans
  // le coffre.
  //
  // L'égalité des noms est stricte sur les mots : « han » CONTENU dans
  // « hannah » rattachait Han et al. 2017 à Hannah 2018.
  async resoudreParBibliographie(entree, passages) {
    await this.indexAttachements();
    const biblio = this.chargerBibliographies();
    const m = entree.nom.match(/^(.*?),\s*(\d{4})([a-z]?)/);
    if (!m) return null;
    const premier = sansAccents(m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop());
    const annee = m[2];
    const suffixe = m[3] || '';
    const index = this.construireIndexZotero();
    const occurrences = (passages || this.indexPassages()).get(entree.nom) || [];

    const parSource = [];
    for (const occ of occurrences) {
      const fiche = index.find((z) => z.basename === occ.source);
      const liste = fiche && fiche.doi ? this.bibliographieDeDoi(fiche.doi) : null;
      if (!liste || !liste.length) continue;
      const passage = await this.passageDe(occ.fichier, occ.marque);
      const sac = new Set(tokeniser(this.fenetreCitation(passage, premier)));

      // Un seul appariement dans tout le greffon : la copie qui vivait ici a
      // divergé une fois, un garde-fou n'ayant été posé que sur l'autre.
      const cands = this.candidatsPourSource(entree.nom, occ.source, passage);
      if (!cands.length) continue;
      const ecart = cands.length > 1 ? cands[0].score - cands[1].score : 999;
      parSource.push({
        source: occ.source, fichier: occ.fichier, passage,
        candidats: cands, retenu: cands[0], sur: cands.length === 1 || ecart >= 3,
      });
    }
    if (!parSource.length) return null;

    // Regroupement en œuvres distinctes. La comparaison des titres est plus
    // délicate qu'il n'y paraît : mesuré sur un vrai coffre, trois « conflits »
    // sur cinq n'en étaient pas. « Co-opetition » et « Co‐opetition: A
    // revolutionary mindset… » diffèrent par un trait d'union Unicode et un
    // sous-titre ; « Designing interactive strategy » est la troncature de
    // « From value chain to value constellation: designing interactive
    // strategy ». D'où : normalisation dure, puis un titre qui commence l'autre
    // désigne le même travail. Un titre vide ne fonde jamais une œuvre à part.
    const clefTitre = (t) => sansAccents(t)
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const oeuvres = [];
    for (const p of parSource) {
      const c = p.retenu;
      const kt = clefTitre(c.titre);
      let o = null;
      if (c.doi) o = oeuvres.find((x) => x.doi && x.doi === c.doi);
      if (!o && kt) {
        o = oeuvres.find((x) => {
          if (x.doi && c.doi && x.doi !== c.doi) return false; // deux DOI distincts : deux œuvres
          const kx = clefTitre(x.titre);
          if (!kx) return true;
          const court = kt.length < kx.length ? kt : kx;
          const long = kt.length < kx.length ? kx : kt;
          // Contenu, et pas seulement en tête : « Designing interactive
          // strategy » est le SOUS-titre de « From value chain to value
          // constellation: designing interactive strategy ». Le seuil de douze
          // caractères écarte les rapprochements fortuits.
          return court.length >= 12 && long.includes(court);
        });
      }
      // Entrée sans titre ni DOI : elle rejoint la première œuvre plutôt que
      // d'en inventer une seconde à partir de rien.
      if (!o && !kt && !c.doi) o = oeuvres[0];
      if (!o) {
        o = { cle: c.doi || kt, titre: c.titre, doi: c.doi, revue: c.revue, sources: [] };
        oeuvres.push(o);
      }
      // Un titre plus complet vaut mieux qu'un titre tronqué.
      if (c.titre.length > (o.titre || '').length) o.titre = c.titre;
      if (!o.doi && c.doi) o.doi = c.doi;
      o.sources.push(p.source);
    }
    oeuvres.sort((a, b) => b.sources.length - a.sources.length);

    const t = parSource.find((x) => x.sur) || parSource[0];
    return {
      parSource, oeuvres,
      conflit: oeuvres.length > 1,
      source: t.source, passage: t.passage, sur: t.sur && oeuvres.length === 1,
      doi: t.retenu.doi, titre: t.retenu.titre, revue: t.retenu.revue,
      autres: t.candidats.slice(1).map((x) => ({ titre: x.titre, doi: x.doi })),
    };
  }



  /* ------------- Découpage des entrées de bibliographie brutes ------------- *
   * Mesuré : sur 5917 entrées en cache, 2988 portent un titre, 1974 ne portent
   * rien d'exploitable, et 955 n'existent qu'en texte brut, du genre
   * « Baldwin C. Y.(2014).Bottlenecks modules… (Working Paper No. 15-028) ».
   * Aucune expression régulière n'en vient à bout. Un modèle, si.
   *
   * Règle : le modèle propose, il ne décide jamais. Chaque extraction est
   * recoupée avec le texte d'origine, l'année et le nom devant s'y retrouver,
   * faute de quoi elle est jetée. Une fausse référence dans une thèse est un
   * dégât autrement plus grave qu'une référence non résolue.
   * ------------------------------------------------------------------------ */

  // Recoupement avec le texte d'origine. C'est ici que se joue la confiance.
  validerDecoupage(extrait, brut) {
    const b = sansAccents(brut);
    const annee = Ariane.premier(extrait.annee);
    if (!/^\d{4}$/.test(annee) || !b.includes(annee)) return null;
    const auteurs = (Array.isArray(extrait.auteurs) ? extrait.auteurs : [extrait.auteurs])
      .map((x) => sansAccents(String(x || '')).split(/\s+/)[0])
      .filter((x) => x.length > 1);
    if (!auteurs.length) return null;
    const mots = new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
    if (!mots.has(auteurs[0])) return null;
    const titre = Ariane.premier(extrait.titre);
    // Un titre que le texte d'origine ne contient pas est une invention.
    if (titre.length < 8 || !b.includes(sansAccents(titre).slice(0, 24))) return null;
    return { auteurs, annee, titre, revue: Ariane.premier(extrait.revue) };
  }

  async decouperBibliographies() {
    const biblio = this.chargerBibliographies();
    const aFaire = [];
    for (const doi of Object.keys(biblio)) {
      const liste = biblio[doi] || [];
      const norm = this.bibliographieDeDoi(doi) || [];
      for (let i = 0; i < norm.length; i++) {
        const e = norm[i];
        if (e.titre) continue;
        if (!e.brut || e.brut.length < 20) continue;
        aFaire.push({ doi, i, brut: e.brut });
      }
    }
    if (!aFaire.length) { new obsidian.Notice(tr('Rien à découper.')); return 0; }

    const consigne = tr("Tu reçois une référence bibliographique brute. Rends STRICTEMENT un objet JSON avec les clés auteurs (liste de noms de famille), annee (chaîne de 4 chiffres), titre (le titre de l'œuvre, sans la revue ni l'éditeur), revue (ou chaîne vide). Aucun texte hors du JSON.")
      + '\n\n' + tr('Référence :') + '\n';

    const avis = new obsidian.Notice(tr('Découpage : 0 / ') + aFaire.length, 0);
    let n = 0, gardes = 0, jetes = 0;
    this.decoupageEnCours = true;
    for (const t of aFaire) {
      if (!this.decoupageEnCours) break;
      const rep = await this.genererJsonRefs(consigne + t.brut, 320);
      n += 1;
      avis.setMessage(tr('Découpage : ') + n + ' / ' + aFaire.length
        + '  (' + gardes + ' ' + tr('retenus') + ', ' + jetes + ' ' + tr('rejetés') + ')');
      if (!rep) { jetes += 1; continue; }
      let brutJson = String(rep).trim();
      const d = brutJson.indexOf('{'), f = brutJson.lastIndexOf('}');
      if (d >= 0 && f > d) brutJson = brutJson.slice(d, f + 1);
      let extrait;
      try { extrait = JSON.parse(brutJson); } catch (e) { jetes += 1; continue; }
      const valide = this.validerDecoupage(extrait, t.brut);
      if (!valide) { jetes += 1; continue; }
      // On écrit dans la forme normalisée, qui est celle du cache désormais.
      const cible = (this.bibliographieDeDoi(t.doi) || [])[t.i];
      if (!cible) { jetes += 1; continue; }
      cible.titre = valide.titre;
      cible.revue = cible.revue || valide.revue || '';
      if (!cible.auteurs || !cible.auteurs.length) cible.auteurs = valide.auteurs;
      if (!cible.annee) cible.annee = valide.annee;
      this.bibliographies[t.doi] = this.bibliographieDeDoi(t.doi);
      gardes += 1;
      // Écriture régulière : un lot de mille entrées ne doit pas être perdu
      // parce qu'Obsidian a été fermé en cours de route.
      if (gardes % 25 === 0) await this.ecrireBibliographies();
    }
    this.decoupageEnCours = false;
    await this.ecrireBibliographies();
    avis.hide();
    if (gardes) {
      await this.fusionnerAutomatiquement(true);
      await this.detacherAutomatiquement(true);
      await this.ecrireIdentificationsAutomatiquement(true);
    }
    new obsidian.Notice(tr('Découpage terminé : ') + gardes + ' ' + tr('retenus')
      + ', ' + jetes + ' ' + tr('rejetés') + '.');
    return gardes;
  }

  // Une passe unique sur les sources citantes qui portent un DOI. Mesuré : 69
  // appels suffisent pour couvrir 631 références en attente, et le résultat est
  // conservé sur disque, donc le volet s'ouvre ensuite sans réseau.
  async rafraichirBibliographies(forcer) {
    const biblio = this.chargerBibliographies();
    const index = this.construireIndexZotero();
    const refs = this.indexReferencesAttente();
    const besoins = new Set();
    for (const r of refs) {
      for (const [src] of r.sources) {
        const fiche = index.find((z) => z.basename === src);
        if (fiche && fiche.doi && (forcer || !(fiche.doi in biblio))) besoins.add(fiche.doi);
      }
    }
    if (!besoins.size) {
      new obsidian.Notice(tr('Bibliographies déjà à jour.'));
      return 0;
    }
    const liste = [...besoins];
    const avis = new obsidian.Notice(tr('Bibliographies : 0 / ') + liste.length, 0);
    let n = 0;
    for (const doi of liste) {
      // On passe par le chemin unique : il interroge Crossref puis OpenAlex,
      // complète les entrées qui n'ont qu'un DOI, et écrit dans le cache
      // partagé. Une seconde requête maison faisait double emploi.
      await this.apiRefsPourDoi(doi);
      n += 1;
      avis.setMessage(tr('Bibliographies : ') + n + ' / ' + liste.length);
      if (this.dernierAppelReseau) await new Promise((r) => setTimeout(r, 300));
    }
    avis.hide();
    new obsidian.Notice(tr('Bibliographies récupérées : ') + n);
    return n;
  }

  /* --------------- Références citées via API bibliographique ---------------- */

  paramMailto() {
    const e = (this.settings.apiEmail || '').trim();
    return e ? 'mailto=' + encodeURIComponent(e) : '';
  }

  async apiGetJson(url) {
    try {
      const rep = await obsidian.requestUrl({ url, method: 'GET', throw: false });
      if (rep && rep.status >= 200 && rep.status < 300) {
        return rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      }
    } catch (e) {
      console.debug('[Ariane] apiGetJson', url, e);
    }
    return null;
  }

  async apiCrossref(doi) {
    const q = this.paramMailto();
    const url = 'https://api.crossref.org/works/' + encodeURIComponent(doi) + (q ? '?' + q : '');
    const json = await this.apiGetJson(url);
    return json ? refsDepuisCrossref(json) : [];
  }

  async apiOpenAlex(doi) {
    const q = this.paramMailto();
    const base = 'https://api.openalex.org';
    const w = await this.apiGetJson(base + '/works/doi:' + doi + '?select=referenced_works' + (q ? '&' + q : ''));
    const ids = (w && w.referenced_works) || [];
    const refs = [];
    for (let i = 0; i < ids.length; i += 50) {
      const lot = ids.slice(i, i + 50).map((x) => String(x).replace(/^https?:\/\/openalex\.org\//i, ''));
      const rep = await this.apiGetJson(
        base + '/works?filter=ids.openalex:' + lot.join('|') +
        '&per-page=50&select=id,doi,title,publication_year,authorships' + (q ? '&' + q : '')
      );
      if (rep && rep.results) refs.push(...refsDepuisOpenAlexWorks(rep.results));
    }
    return refs;
  }

  async apiRefsPourDoi(doi, forcer) {
    doi = normDoi(doi);
    if (!doi) return [];
    // Le cache est partagé avec le volet d'arbitrage : générer une
    // bibliographie l'alimente, et l'ouvrir n'appelle plus le réseau. Les deux
    // fonctions interrogeaient les mêmes DOI chacune de son côté.
    this.dernierAppelReseau = false;
    if (!forcer) {
      const enCache = this.bibliographieDeDoi(doi);
      if (enCache && enCache.length) return enCache;
    }
    this.dernierAppelReseau = true;
    const src = this.settings.apiSource || 'auto';
    let refs;
    if (src === 'crossref') refs = await this.apiCrossref(doi);
    else if (src === 'openalex') refs = await this.apiOpenAlex(doi);
    else {
      refs = await this.apiCrossref(doi); // Crossref d'abord (couverture, un appel)
      if (!refs.length) refs = await this.apiOpenAlex(doi); // sinon OpenAlex
    }
    const finales = await this.enrichirRefsParDoi(refs);
    if (finales && finales.length) {
      this.chargerBibliographies()[doi] = finales;
      if (this._biblioNorm) delete this._biblioNorm[doi];
      await this.ecrireBibliographies();
    }
    return finales;
  }

  // Complète les références qui n'ont qu'un DOI (fréquent avec Crossref) en
  // récupérant titre / année / auteurs via OpenAlex, par lots. Échoue en
  // silence : au pire les références restent « sans titre ».
  async enrichirRefsParDoi(refs) {
    const manquants = (refs || []).filter((r) => r.doi && (!r.titre || !r.auteurs || !r.auteurs.length));
    const dois = [...new Set(manquants.map((r) => r.doi))];
    if (!dois.length) return refs;
    const q = this.paramMailto();
    const parDoi = new Map();
    for (let i = 0; i < dois.length; i += 40) {
      const lot = dois.slice(i, i + 40);
      const url = 'https://api.openalex.org/works?filter=doi:' + lot.join('|') +
        '&per-page=40&select=doi,title,publication_year,authorships' + (q ? '&' + q : '');
      const rep = await this.apiGetJson(url);
      for (const w of (rep && rep.results) || []) {
        const d = normDoi(w.doi || '');
        if (d) parDoi.set(d, w);
      }
    }
    for (const r of refs) {
      const w = r.doi ? parDoi.get(r.doi) : null;
      if (!w) continue;
      if (!r.titre) r.titre = String(w.title || '').trim();
      if (!r.annee && w.publication_year) r.annee = String(w.publication_year);
      if (!r.auteurs || !r.auteurs.length) {
        r.auteurs = (w.authorships || [])
          .map((a) => nomFamille((a.author && a.author.display_name) || a.raw_author_name || ''))
          .filter(Boolean);
      }
    }
    return refs;
  }

  sourceParDoi(doi, index) {
    const d = normDoi(doi);
    if (!d) return null;
    for (const z of index || []) if (z.doi && z.doi === d) return z.basename;
    return null;
  }

  doiDeSource(file) {
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter;
    return normDoi(fm && fm.doi);
  }

  // Une référence citée (parseNomReference) correspond-elle à une réf. API ?
  refCorrespondApi(ref, apiRef) {
    return appariementSource(ref, { surnames: apiRef.auteurs || [], annee: apiRef.annee }) != null;
  }

  // Notes de référence en attente citées par une source (via ses annotations).
  referencesEnAttenteDeSource(sourceBasename) {
    const noms = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      const s = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
      if (s !== sourceBasename) continue;
      let refs = fm['références-citées'];
      if (!refs) continue;
      if (!Array.isArray(refs)) refs = [refs];
      for (const r of refs) {
        const cible = String(r).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
        if (!cible) continue;
        const dest = this.app.metadataCache.getFirstLinkpathDest(cible, f.path);
        if (dest && dest.path.startsWith(this.dossierR + '/')) noms.add(dest.basename);
      }
    }
    return [...noms];
  }

  async enrichirReference(refFile, apiRef) {
    this.marquerEcriture(refFile.path);
    await this.app.fileManager.processFrontMatter(refFile, (fm) => {
      if (apiRef.titre) fm['titre-cité'] = apiRef.titre;
      if (apiRef.doi) fm['doi'] = apiRef.doi;
    });
  }

  // Commande : générer la note de bibliographie citée d'une source.
  ligneRefTexte(a) {
    const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
    const aut = (a.auteurs || []).map(cap).join(', ');
    const t = a.titre || a.brut || '(sans titre)';
    const d = a.doi ? '`' + a.doi + '`' : '`—`';
    return '- ' + (aut ? aut + ' ' : '') + (a.annee ? '(' + a.annee + ') ' : '') + '— ' + t + '  ' + d;
  }

  // Génère la note de bibliographie citée d'une source, à trois statuts, et
  // rattache / enrichit dynamiquement ses références en attente au passage.
  async genererBibliographieSource(fileArg, silencieux) {
    if (!this.settings.apiReferencesCitees) {
      if (!silencieux) new obsidian.Notice(tr('Références citées via API : désactivé dans les réglages.'));
      return null;
    }
    const file = fileArg || this.app.workspace.getActiveFile();
    if (!file || !this.estSourceZoteroFrontmatter(file)) {
      if (!silencieux) new obsidian.Notice(tr('Ouvrez une note source Zotero.'));
      return null;
    }
    const doi = this.doiDeSource(file);
    if (!doi) { if (!silencieux) new obsidian.Notice(tr("Cette source n'a pas de DOI.")); return null; }
    if (!silencieux) new obsidian.Notice(tr('Récupération de la bibliographie…'));
    const apiRefs = await this.apiRefsPourDoi(doi);
    if (!apiRefs.length) { if (!silencieux) new obsidian.Notice(tr("Aucune référence citée trouvée pour ce DOI.")); return null; }

    const index = this.construireIndexZotero();
    const pendings = this.referencesEnAttenteDeSource(file.basename)
      .map((nm) => ({ nom: nm, ref: parseNomReference(nm, this.settings) }))
      .filter((x) => x.ref);
    // Combien d'entrées de la bibliographie répondent à chaque référence en
    // attente ? Au-delà d'une, l'appariement auteur-année ne désigne rien : on
    // classe la référence sans écrire d'identification. C'est ce silence qui
    // avait inscrit un mauvais « Renn, 2008 » dans le coffre.
    const ambigues = new Set();
    for (const x of pendings) {
      let n = 0;
      for (const a of apiRefs) if (this.refCorrespondApi(x.ref, a)) n += 1;
      if (n > 1) ambigues.add(x.nom);
    }

    const dejaMatch = new Set();
    const secZotero = [];
    const secAttente = [];
    const secSeule = [];

    for (const a of apiRefs) {
      const zBase = a.doi ? this.sourceParDoi(a.doi, index) : null;
      const pm = pendings.find((x) => !dejaMatch.has(x.nom) && this.refCorrespondApi(x.ref, a));
      if (zBase) {
        // Présente dans Zotero : rattache la référence en attente correspondante.
        if (pm) {
          await this.remplacerLiens(pm.nom, zBase);
          const pf = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + pm.nom + '.md');
          if (pf instanceof obsidian.TFile) await this.supprimerFichier(pf);
          const e = index.find((z) => z.basename === zBase);
          if (e) await this.assurerNotesAuteurs(zBase, e.creatorsFull || []);
          dejaMatch.add(pm.nom);
        }
        secZotero.push('[[' + zBase + ']]');
      } else if (pm) {
        // Référence en attente (citée en annotation, absente de Zotero) : enrichie.
        const pf = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + pm.nom + '.md');
        if (pf instanceof obsidian.TFile && !ambigues.has(pm.nom)) await this.enrichirReference(pf, a);
        dejaMatch.add(pm.nom);
        // On inscrit à côté du lien ce que la bibliographie dit de cette
        // référence. Sans cela la note ne montre qu'un « Auteur, Année » qui ne
        // distingue rien, alors que l'identification vient d'être trouvée et
        // écrite dans la note en attente : elle était invérifiable.
        secAttente.push('[[' + pm.nom + ']] ' + this.ligneRefTexte(a).replace(/^- /, '— ')
          + (ambigues.has(pm.nom) ? '  *(plusieurs entrées possibles : à arbitrer)*' : ''));
      } else {
        // Bibliographie seule : texte, hors graphe.
        secSeule.push(this.ligneRefTexte(a));
      }
    }
    // Celles que la bibliographie ne mentionne pas restent nues : c'est une
    // information en soi, et il ne faut pas laisser croire à une identification.
    for (const x of pendings) if (!dejaMatch.has(x.nom)) secAttente.push('[[' + x.nom + ']]  *(non trouvée dans cette bibliographie)*');

    const uniq = (arr) => [...new Set(arr)];
    const zList = uniq(secZotero);
    const aList = uniq(secAttente);
    const sList = uniq(secSeule);

    const lignes = [
      '---',
      'type: bibliographie-citée',
      'source: ' + JSON.stringify('[[' + file.basename + ']]'),
      'nb-references: ' + apiRefs.length,
      'nb-dans-zotero: ' + zList.length,
      'nb-en-attente: ' + aList.length,
      '---',
      '',
      '# Bibliographie citée — ' + file.basename,
      '',
      '> ' + zList.length + ' dans Zotero · ' + aList.length + ' en attente · ' +
        sList.length + ' hors corpus (sur ' + apiRefs.length + ').',
      '',
      '## Dans Zotero',
      ...(zList.length ? zList.map((l) => '- ' + l) : ['*(aucune)*']),
      '',
      '## Références en attente (citées dans vos annotations)',
      ...(aList.length ? aList.map((l) => '- ' + l) : ['*(aucune)*']),
      '',
      '## Bibliographie seule (non citées — hors graphe)',
      ...(sList.length ? sList : ['*(aucune)*']),
    ];
    await this.assurerDossier(this.settings.dossierBibliographies);
    const nomBiblio = this.nettoyerNomFichier((this.settings.prefixeBibliographie || '') + file.basename);
    const chemin = this.settings.dossierBibliographies + '/' + nomBiblio + '.md';
    await this.ecrire(chemin, lignes.join('\n') + '\n');
    if (!silencieux) {
      new obsidian.Notice(tr('Bibliographie : ') + zList.length + ' dans Zotero, ' + aList.length + ' en attente, ' +
        sList.length + ' hors corpus.'
      );
      const nf = this.app.vault.getAbstractFileByPath(chemin);
      if (nf instanceof obsidian.TFile) this.app.workspace.getLeaf(false).openFile(nf);
    }
    return { zotero: zList.length, attente: aList.length, seule: sList.length, total: apiRefs.length };
  }

  // Batch : génère les bibliographies pour toutes les sources ZotFlow à DOI.
  async genererToutesBibliographies() {
    if (!this.settings.apiReferencesCitees) { new obsidian.Notice(tr('Références citées via API : désactivé.')); return; }
    if (this.bibliosEnCours) { new obsidian.Notice(tr('Génération déjà en cours.')); return; }
    const sources = this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.estSourceZoteroFrontmatter(f) && this.doiDeSource(f));
    if (!sources.length) { new obsidian.Notice(tr('Aucune source Zotero avec DOI.')); return; }

    this.bibliosEnCours = true;
    // Une notification persistante, mise à jour à chaque source. L'ancienne
    // version en créait une neuve toutes les dix sources, qui s'effaçait au
    // bout de quelques secondes : entre deux, l'écran ne disait plus rien.
    const avis = new obsidian.Notice('', 0);
    const debut = Date.now();
    let ok = 0, vide = 0, i = 0, reseau = 0;

    for (const f of sources) {
      if (!this.bibliosEnCours) break;
      i++;
      const ecoule = (Date.now() - debut) / 1000;
      const reste = reseau > 0 && i > 1
        ? Math.round((ecoule / i) * (sources.length - i))
        : null;
      avis.setMessage(tr('Bibliographies : ') + i + ' / ' + sources.length
        + '  ·  ' + ok + ' ' + tr('générée(s)') + ', ' + vide + ' ' + tr('sans résultat')
        + (reste !== null ? '\n' + tr('Reste environ ') + dureeLisible(Math.ceil(reste / 60)) : '')
        + '\n' + f.basename.slice(0, 46));
      try {
        const r = await this.genererBibliographieSource(f, true);
        if (r) ok++; else vide++;
      } catch (e) {
        vide++;
        console.error('[Ariane] biblio', f.basename, e);
      }
      // La temporisation ne vaut que pour le réseau. Une source déjà en cache
      // n'appelle personne : la faire attendre 1,2 s coûtait un quart d'heure
      // sur sept cents sources.
      if (this.dernierAppelReseau) { reseau++; await new Promise((res) => setTimeout(res, 1200)); }
    }
    const arrete = !this.bibliosEnCours;
    this.bibliosEnCours = false;
    avis.hide();
    // L'identification vient de changer : les libellés à double sens se
    // détachent d'eux-mêmes, sans rien demander.
    if (!arrete) {
      await this.fusionnerAutomatiquement(true);
      await this.detacherAutomatiquement(true);
      await this.ecrireIdentificationsAutomatiquement(true);
    }
    new obsidian.Notice((arrete ? tr('Génération interrompue : ') : tr('Bibliographies terminées : '))
      + ok + ' ' + tr('générée(s)') + ', ' + vide + ' ' + tr('sans résultat')
      + ', ' + tr('sur ') + i + '. ' + reseau + ' ' + tr('appel(s) réseau') + '.', 12000);
  }

  //#endregion Ariane · bibliographie — index & génération

  //#region Ariane · export Word / Pandoc
  // ── export Word / Pandoc ─────────────────────────────────────────────────

  /* ------------- Export Word avec citations Zotero vivantes -------------- */

  cheminAbsoluVault(rel) {
    const ad = this.app.vault.adapter;
    if (typeof ad.getFullPath === 'function') return ad.getFullPath(rel);
    return require('path').join(ad.basePath || '', rel);
  }

  cheminScriptPandoc(nom) {
    return require('path').join(this.cheminAbsoluVault(this.manifest.dir), 'pandoc', nom);
  }

  // Applique les styles du modèle Word en remappant les identifiants pandoc.
  async remapperStyles(outPath, env) {
    const map = this.settings.exportMapStyles || {};
    if (!Object.values(map).some((v) => v && String(v).trim())) return;
    const m = Object.assign({}, map);
    if (m.BodyText) m.FirstParagraph = m.BodyText;
    const script = this.cheminScriptPandoc('remap-styles.py');
    try {
      await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, '--remap', outPath, JSON.stringify(m)],
          { env: env || process.env },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 300))) : resolve());
      });
    } catch (e) {
      new obsidian.Notice(tr('Styles du modèle non appliqués : ') + (e && e.message ? e.message : e));
      console.error('[Ariane] remap styles', e);
    }
  }

  // Liste les styles du modèle Word dans une fenêtre.
  async listerStylesModele() {
    const modele = this.settings.exportModeleWord;
    if (!modele || !require('fs').existsSync(modele)) { new obsidian.Notice(tr('Renseignez un modèle Word valide dans les réglages.')); return; }
    const script = this.cheminScriptPandoc('remap-styles.py');
    const env = Object.assign({}, process.env, { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') });
    try {
      const out = await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, '--list', modele], { env, maxBuffer: 8 * 1024 * 1024 },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 300))) : resolve(so));
      });
      new StylesModeleModal(this.app, JSON.parse(out)).open();
    } catch (e) {
      new obsidian.Notice(tr('Lecture des styles — échec : ') + (e && e.message ? e.message : e));
    }
  }

  citekeyDepuisLien(v) {
    return String(v || '').replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '').replace(/#.*/, '').replace(/^@/, '').trim();
  }

  cibleDepuisLien(v) {
    return String(v || '').replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
  }

  // Résout un lien [[annotation]] en un tableau d'entrées de citation Pandoc,
  // ou null. Gère l'apparat « cité dans » pour les références citées distinctes
  // de la source et absentes de Zotero.
  resoudreCitation(cible, sourcePath, ctx) {
    ctx = ctx || {};
    const dest = this.app.metadataCache.getFirstLinkpathDest(cible, sourcePath || '');
    if (!dest) return null;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    const src = fm['zotflow-source'];
    if (!src) {
      if (fm.citationKey) return ['@' + String(fm.citationKey).trim()];
      if (dest.basename.startsWith('@')) return ['@' + dest.basename.slice(1)];
      return null;
    }
    const srcKey = this.citekeyDepuisLien(src);
    if (!srcKey) return null;
    const page = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    // Entrée structurée : le regroupement se fait plus tard, à l'échelle de la
    // grappe, où l'on voit toutes les annotations d'une même source.
    const srcEntry = { cle: srcKey, page };
    const pages = fm['références-pages'] || {};
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const citeDansActif = this.settings.exportCiteDansActif !== false;
    const entrees = [];
    const rapportes = [];                          // travaux rapportés, absents de Zotero
    for (const rv of refs) {
      const cibleRef = this.cibleDepuisLien(rv);
      if (!cibleRef) continue;
      const ck = this.citekeyDepuisLien(rv);
      if (ck === srcKey) continue;                 // la référence est la source : rien de plus
      const pc = String(pages[cibleRef] != null ? pages[cibleRef] : '').replace(/^["']|["']$/g, '').trim();
      const locRef = pc ? ', p. ' + pc : '';       // page propre à la référence citée
      if (/^@/.test(cibleRef)) { entrees.push({ cle: ck, page: pc }); continue; } // déjà dans Zotero -> directe
      // référence en attente : présente malgré tout dans Zotero ?
      let base = null;
      if (ctx.index) {
        const ref = refDepuisNomAttente(cibleRef);
        base = ref ? trouverSourceZotero(ref, ctx.index) : null;
      }
      if (base) { entrees.push({ cle: base.replace(/^@/, ''), page: pc }); continue; } // citation directe
      // Travail rapporté, introuvable dans Zotero.
      if (citeDansActif) rapportes.push(cibleRef + locRef);
      else entrees.push({ cle: srcKey, page });    // on ne cite que la source consultée
    }
    // Les travaux rapportés d'une même source tiennent en UNE entrée. Huit
    // entrées distinctes renvoyant à la même source donnaient huit citations
    // que Zotero regroupait en effaçant le nom de l'auteur : « … cité dans
    // Raizada & Sinha, 2025, p. 1, …, cité dans 2025, p. 1, … ».
    //
    // Ils sont énumérés à la française — virgules, puis « et » — et non par des
    // points-virgules : le « ; » reste ainsi réservé à la séparation des
    // citations entre elles, si bien que le lecteur voit où le groupe finit.
    if (rapportes.length) {
      entrees.push({ cle: srcKey, page, travaux: rapportes });
    }
    return entrees.length ? entrees : [srcEntry];
  }

  // Garde-fou : le modèle se retouche dans Word, et Word y scinde les
  // jetons, quand ce n'est pas une faute de frappe qui les rend muets. Cette
  // commande dit ce que le modèle porte, et ce qui cloche, avant d'exporter.
  async verifierModeleWord() {
    const fs = require('fs');
    const script = this.cheminScriptPandoc('finition.py');
    const modele = this.settings.exportModeleWord || '';
    if (!fs.existsSync(script)) { new obsidian.Notice(tr('finition.py introuvable.')); return; }
    if (!modele || !fs.existsSync(modele)) { new obsidian.Notice(tr('Modèle Word introuvable : ') + modele); return; }
    try {
      const sortie = await new Promise((resolve) => {
        require('child_process').execFile('python3', [script, '--verifier', modele],
          { maxBuffer: 4 * 1024 * 1024 },
          (e, so, se) => resolve(String(so || '') + String(se || '')));
      });
      console.log('[Ariane] modèle —\n' + sortie);
      const alertes = sortie.split('\n').filter((l) => l.startsWith('ATTENTION'));
      new obsidian.Notice(alertes.length
        ? 'Modèle Word — ' + alertes.length + ' anomalie(s) :\n' + alertes.join('\n')
        : 'Modèle Word : aucune anomalie.\n' + sortie.trim(), alertes.length ? 0 : 12000);
    } catch (e) {
      new obsidian.Notice(tr('Vérification du modèle — échec : ') + (e && e.message ? e.message : e));
    }
  }

  async exporterWordZotero() {
    // L'export appelle pandoc et python par child_process : rien de tout cela
    // n'existe sur mobile. Le greffon se charge malgré tout, tous les modules
    // Node étant requis à l'intérieur des fonctions, mais mieux vaut un
    // message clair qu'une exception non rattrapée.
    if (obsidian.Platform && !obsidian.Platform.isDesktopApp) {
      new obsidian.Notice(tr("L'export Word demande pandoc et n'est possible que sur ordinateur."));
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') { new obsidian.Notice(tr('Ouvrez la note à exporter.')); return; }
    const contenu = await this.app.vault.read(file);
    const ctx = { index: this.construireIndexZotero() };
    const resoudre = (c) => this.resoudreCitation(c, file.path, ctx);
    // Les notes anciennes portent encore des notes de bas de page ; les
    // récentes des citations en ligne. Les deux passes se complètent.
    const citeDans = this.settings.citeDans || ', cité dans ';
    let md = footnotesVersCitations(contenu, resoudre, citeDans);
    md = preparerMarkdownExport(md, resoudre, {
      citeDans,
      styleEncadre: this.settings.exportStyleEncadre || 'Items de réflexion',
      insecables: this.settings.exportInsecables !== false,
      decalerTitres: this.settings.exportDecalerTitres !== false,
      retirerNumerotation: this.settings.exportRetirerNumerotation !== false,
    });
    // La bibliographie est ajoutée APRÈS la préparation, qui supprime celle
    // d'Ariane : c'est Zotero qui produira la sienne à cet emplacement.
    if (this.settings.exportBibliographie) md += '\n\n# Bibliographie\n';
    // Active les citations « auteur dans le texte » pour les liens [[@clé]] du corps.
    md = '---\nzotero:\n  author-in-text: true\n---\n\n' + md;
    const fs = require('fs'), os = require('os'), pathMod = require('path');
    const tmp = pathMod.join(os.tmpdir(), 'ariane-export-' + Date.now() + '.md');
    fs.writeFileSync(tmp, md, 'utf8');
    await this.assurerDossier(this.settings.exportDossier);
    const outPath = pathMod.join(this.cheminAbsoluVault(this.settings.exportDossier), file.basename + '.docx');
    const notice = new obsidian.Notice(tr('Export Word (Zotero)…'), 0);
    try {
      const dirFiltre = pathMod.dirname(this.settings.exportFiltreLua);
      const env = Object.assign({}, process.env, {
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || ''),
        LUA_PATH: dirFiltre + '/?.lua;' + dirFiltre + '/?/init.lua;;',
      });
      const args = ['--lua-filter', this.settings.exportFiltreLua];
      const modele = this.settings.exportModeleWord;
      if (modele && fs.existsSync(modele)) args.push('--reference-doc', modele);
      args.push(tmp, '-s', '-o', outPath);
      await new Promise((resolve, reject) => {
        require('child_process').execFile(
          this.settings.exportPandocBin || 'pandoc', args,
          { maxBuffer: 64 * 1024 * 1024, env, cwd: dirFiltre },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 400))) : resolve());
      });
      await this.remapperStyles(outPath, env);
      await this.finirDocument(outPath, env, file);
      notice.hide();
      new obsidian.Notice(tr('Export terminé : ') + file.basename + '.docx (dans « ' + this.settings.exportDossier + ' »).');
    } catch (e) {
      notice.hide();
      new obsidian.Notice(tr('Export — échec : ') + (e && e.message ? e.message : e) + ' — pandoc installé ? Zotero lancé ?');
      console.error('[Ariane] export word', e);
    } finally {
      try { fs.unlinkSync(tmp); } catch (e) { /* */ }
    }
  }

  // Finition du .docx : en-têtes du modèle rattachés, en-tête de première page
  // alimenté par les propriétés de la note, tableaux habillés. Pandoc écrit sa
  // propre section et laisse les en-têtes du modèle orphelins dans le fichier.
  async finirDocument(chemin, env, fichier) {
    if (this.settings.exportEntetes === false) return;
    const fs = require('fs'), os = require('os'), pathMod = require('path');
    const script = this.cheminScriptPandoc('finition.py');
    if (!fs.existsSync(script)) return;

    const fm = ((this.app.metadataCache.getFileCache(fichier) || {}).frontmatter) || {};
    const date = this.dateDeNote(fichier, fm);

    // Le greffon ne décide plus de rien : il dit seulement ce que vaut chaque
    // jeton. C'est le MODÈLE qui porte les jetons, donc qui décide où va
    // quelle donnée, et laquelle apparaît. Voir la légende en fin de modèle.
    // Les liens d'Obsidian n'ont pas leur place dans un document Word : sans
    // ce nettoyage, une propriété sortait « [[Chabane Mazri]], [[Lionel
    // Garreau]] », crochets compris.
    const lisible = (x) => (this.settings.exportNettoyerLiens === false ? String(x) : valeurLisible(x));

    const valeurs = {
      titre: lisible((Array.isArray(fm.aliases) && fm.aliases[0]) || fichier.basename),
      dossier: this.dossierDeNote(fichier),
      date: this.formaterDate(date, 'court'),
      'date:long': this.formaterDate(date, 'long'),
      'réf': this.referenceDeNote(fichier, fm),
    };

    // Toutes les propriétés de la note, à double titre : nommément, pour un
    // {{propriété:clé}} du modèle, et en liste, pour ses rangs répétables. La
    // finition écarte de la liste celles que le modèle place déjà ailleurs.
    const structurelles = new Set(['position', 'aliases', 'tags', 'cssclasses']);
    const proprietes = [];
    for (const [cle, val] of Object.entries(fm)) {
      if (val == null || val === '') continue;
      const texte = lisible(Array.isArray(val) ? val.map(lisible).join(', ') : val);
      if (!texte.trim()) continue;
      valeurs['propriété:' + cle] = texte;
      if (!structurelles.has(String(cle).toLowerCase())) {
        proprietes.push([this.libellePropriete(cle), texte]);
      }
    }

    const ordres = pathMod.join(os.tmpdir(), 'ariane-finition-' + Date.now() + '.json');
    fs.writeFileSync(ordres, JSON.stringify({
      valeurs,
      proprietes,
      // Le modèle porte les préférences Zotero (ZOTERO_PREF_1, _2) que pandoc
      // n'écrit pas pour le .docx : sans elles, Word ne reconnaît pas un
      // document Zotero et refuse d'actualiser les citations. Il porte aussi
      // la section et le gabarit du tableau des propriétés.
      modele: this.settings.exportModeleWord || '',
      // Le champ ZOTERO_BIBL, que le filtre ne pose que pour l'ODT.
      bibliographie: this.settings.exportBibliographie !== false,
      styleEnteteTableau: this.settings.exportStyleEnteteTableau || 'Titre de tableau',
      styleCelluleTableau: this.settings.exportStyleCelluleTableau || 'Champ de tableau',
      // Les styles que pandoc invente pour le corps de texte sont ramenés à
      // ceux du modèle. La finition résout les noms en identifiants.
      styles: this.settings.exportMapStyles || {},
    }), 'utf8');

    try {
      const sortie = await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, chemin, ordres],
          { maxBuffer: 32 * 1024 * 1024, env },
          (e, so, se) => (e ? reject(new Error(String(se || e.message).slice(0, 400))) : resolve(String(so || ''))));
      });
      console.log('[Ariane] finition —', sortie.trim());
      // Rien ne doit se dérégler en silence : ce que la finition signale est
      // remonté à l'utilisateur, l'export ayant tout de même abouti.
      const alertes = sortie.split('\n').filter((l) => l.startsWith('ATTENTION'));
      if (alertes.length) {
        new obsidian.Notice(tr('Modèle Word — ') + alertes.length + ' anomalie(s) :\n'
          + alertes.join('\n') + '\n(commande « Vérifier le modèle Word » pour le détail)', 0);
      }
      try { fs.unlinkSync(chemin + '.avant-finition'); } catch (e) { /* */ }
    } catch (e) {
      new obsidian.Notice(tr('Finition non appliquée : ') + (e && e.message ? e.message : e), 10000);
      console.error('[Ariane] finition', e);
      try {
        if (fs.existsSync(chemin + '.avant-finition')) {
          fs.copyFileSync(chemin + '.avant-finition', chemin);
          fs.unlinkSync(chemin + '.avant-finition');
        }
      } catch (err) { /* on garde ce qu'on a */ }
    } finally {
      try { fs.unlinkSync(ordres); } catch (e) { /* */ }
    }
  }

  //#endregion Ariane · export Word / Pandoc

  //#region Ariane · doublons d'auteurs
  // ── doublons d'auteurs ───────────────────────────────────────────────────

  /* ------------------- Fusion des doublons d'auteurs -------------------- */

  baseSansConflit(n) {
    return n.replace(/\s*-?\s*MacBook Pro de .*/i, '')
            .replace(/\s*\(conflicted copy[^)]*\)/i, '')
            .replace(/\s+\(\d+\)$/, '').trim();
  }

  async detecterDoublonsAuteurs() {
    const dossier = (this.settings.dossierAuteurs || 'Auteurs').replace(/\/+$/, '');
    const noms = this.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'))
      .map((f) => f.basename);
    const ensemble = new Set(noms);
    const conflits = [], propres = [];
    for (const n of noms) {
      const base = this.baseSansConflit(n);
      if (base && base !== n && ensemble.has(base)) conflits.push({ nom: n, base });
      else propres.push(n);
    }
    return { conflits, clusters: clustersDoublons(propres), dossier };
  }

  async ouvrirFusionAuteurs() {
    const { conflits, clusters, dossier } = await this.detecterDoublonsAuteurs();
    if (!conflits.length && !clusters.length) { new obsidian.Notice(tr("Aucun doublon d'auteur détecté.")); return; }
    new FusionAuteursModal(this.app, this, conflits, clusters, dossier).open();
  }

  async supprimerConflitsAuteurs(conflits, dossier) {
    for (const c of conflits) {
      const f = this.app.vault.getAbstractFileByPath(dossier + '/' + c.nom + '.md');
      if (f instanceof obsidian.TFile) await this.app.fileManager.trashFile(f);
    }
  }

  async fusionnerCluster(canon, variantes, dossier) {
    const fCanon = this.app.vault.getAbstractFileByPath(dossier + '/' + canon + '.md');
    if (fCanon instanceof obsidian.TFile) {
      await this.app.fileManager.processFrontMatter(fCanon, (fm) => {
        const al = new Set(Array.isArray(fm.aliases) ? fm.aliases : (fm.aliases ? [fm.aliases] : []));
        for (const v of variantes) al.add(v);
        fm.aliases = [...al];
      });
    }
    // Redirige les liens partout dans le coffre.
    const repl = [];
    for (const v of variantes) { repl.push(['[[' + v + ']]', '[[' + canon + ']]']); repl.push(['[[' + v + '|', '[[' + canon + '|']); }
    for (const f of this.app.vault.getMarkdownFiles()) {
      let contenu = await this.app.vault.read(f); const orig = contenu;
      for (const [a, b] of repl) if (contenu.includes(a)) contenu = contenu.split(a).join(b);
      if (contenu !== orig) await this.app.vault.modify(f, contenu);
    }
    // Supprime les variantes.
    for (const v of variantes) {
      const f = this.app.vault.getAbstractFileByPath(dossier + '/' + v + '.md');
      if (f instanceof obsidian.TFile) await this.app.fileManager.trashFile(f);
    }
  }

  //#endregion Ariane · doublons d'auteurs
};
