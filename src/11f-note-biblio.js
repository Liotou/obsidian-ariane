
// ── avecNoteBiblio ────────────────────────────────────────────────────────
// Domaine : notes (Zotero, biblio, schémas).
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

  // Les notes des dossiers exclus (réglages) n'ont pas de bibliographie.
  biblioExclue(chemin) {
    return Ariane.sousDossier(chemin, this.settings.biblioDossiersExclus || []);
  }

  async majBibliographie(file, silencieux) {
    if (!file || file.extension !== 'md') return false;
    if (this.biblioExclue(file.path)) {
      if (!silencieux) new obsidian.Notice(tr('Bibliographie : cette note est dans un dossier exclu (réglages).'));
      return false;
    }
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

  // Libellé lisible d'une annotation : « Mérivel et al., 2009, p. 2 ».
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
    // Une clé est un nom de note, ou { cle, page } : une source citée à une
    // page (annotation glissée du lecteur, pas encore atomisée).
    const nom = (c) => (typeof c === 'string' ? c : c.cle);
    const entrees = cles
      .filter((c) => typeof c !== 'string' || voisinage.indexOf('[[' + c + '|') === -1)
      .map((c) => '[[' + nom(c) + '|' + this.libelleDeCitation(c) + ']]');

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
   * Garnier 2015 à lui seul cite Lebrun & Roy, Fabre et van Dorst, invisibles
   * autrement. Zotero garde sur le disque le texte extrait de chaque PDF, dans
   * « storage/<clé>/.zotero-ft-cache ». On y lit la bibliographie directement.
   * ------------------------------------------------------------------------ */

  racineZotero() {
    const regle = (this.settings.dossierZotero || '').trim();
    if (regle) return regle;
    const os = require('os');
    return require('path').join(os.homedir(), 'Zotero');
  }

  // La base de Zotero telle qu'elle est vraiment. Zotero écrit d'abord dans
  // son journal (zotero.sqlite-wal) ; une lecture « immutable » de la base
  // seule ignorait donc les derniers changements (une fiche supprimée y était
  // encore). Quand ce journal existe, on lit une copie de la base ET du
  // journal, que sqlite réunit à l'ouverture ; la copie est refaite seulement
  // si l'un des deux a changé. Rend l'argument à passer à sqlite3, ou ''.
  async baseZoteroLisible() {
    const fs = require('fs'), path = require('path'), os = require('os');
    const base = path.join(this.racineZotero(), 'zotero.sqlite');
    let sb, sw = null;
    try { sb = await fs.promises.stat(base); } catch (e) { return ''; }
    try { sw = await fs.promises.stat(base + '-wal'); } catch (e) { sw = null; }
    if (!sw || !sw.size) return require('url').pathToFileURL(base).href + '?immutable=1';
    const cle = sb.mtimeMs + ':' + sb.size + ':' + sw.mtimeMs + ':' + sw.size;
    const dossier = path.join(os.tmpdir(), 'ariane-zotero');
    const copie = path.join(dossier, 'zotero.sqlite');
    if (this._baseZoteroCle === cle && fs.existsSync(copie)) return copie;
    try {
      await fs.promises.mkdir(dossier, { recursive: true });
      for (const suf of ['', '-wal', '-shm']) {
        try { await fs.promises.unlink(copie + suf); } catch (e) { /* rien à retirer */ }
      }
      await fs.promises.copyFile(base, copie);
      await fs.promises.copyFile(base + '-wal', copie + '-wal');
      this._baseZoteroCle = cle;
      return copie;
    } catch (e) {
      console.warn('[Ariane] copie de la base Zotero impossible, lecture sans le journal :', e);
      return require('url').pathToFileURL(base).href + '?immutable=1';
    }
  }

  // Une requête sur la base de Zotero (module sqlite de Node, sinon l'outil
  // sqlite3). Rend les
  // lignes, champs séparés, ou null si la base n'est pas lisible.
  async requeteZotero(requete) {
    if (!obsidian.Platform.isDesktopApp) return null;
    const cible = await this.baseZoteroLisible();
    if (!cible) return null;
    // Le module sqlite intégré à Node (Obsidian l'embarque) marche sur tout
    // système, sans rien installer. À défaut, l'outil sqlite3 (macOS, Linux).
    const integre = Ariane.requeteSqliteIntegre(cible, requete);
    if (integre) return integre;
    return new Promise((ok) => {
      executer('sqlite3', ['-separator', '\t', cible, requete],
        { timeout: 20000, maxBuffer: 16 << 20 }, (err, sortie) => {
          if (err) { ok(null); return; }
          ok(String(sortie || '').split('\n').filter((l) => l !== '').map((l) => l.split('\t')));
        });
    });
  }

  // Une requête en lecture par node:sqlite. `cible` : un chemin, ou une URI
  // « file:…?immutable=1 ». Rend les lignes en chaînes, comme l'outil
  // sqlite3, ou null si le module manque ou si la lecture échoue.
  static requeteSqliteIntegre(cible, requete) {
    let sqlite = null;
    try { sqlite = require('node:sqlite'); } catch (e) { return null; }
    if (!sqlite || typeof sqlite.DatabaseSync !== 'function') return null;
    let db = null;
    try {
      db = new sqlite.DatabaseSync(/^file:/.test(cible) ? new URL(cible) : cible, { readOnly: true });
      const lignes = db.prepare(requete).all();
      return lignes.map((r) => Object.values(r).map((v) => (v == null ? '' : String(v))));
    } catch (e) {
      console.debug('[Ariane] sqlite intégré :', e && e.message);
      return null;
    } finally {
      try { if (db) db.close(); } catch (e) { /* déjà fermée */ }
    }
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
   * Le libellé agrège mal : « Aubert & Colas, 2014 » et « Aubert, 2014 » sont
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
      // seule connue quand il n'y en a qu'une. Sans cette règle, « Bouvier &
      // Sarrazin, 1999 » passait pour deux travaux, l'un identifié et l'autre non.
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
  // « Ferrat, 2008 », peut désigner deux travaux différents selon l'article qui
  // la cite : mesuré, sur les neuf références résolues par au moins deux
  // sources, cinq divergent et deux désignent réellement deux œuvres. Prendre
  // la première venue choisissait au hasard, et le hasard s'est déjà écrit dans
  // le coffre.
  //
  // L'égalité des noms est stricte sur les mots : « lin » CONTENU dans
  // « linda » rattachait Lin et al. 2017 à Linda 2018.
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
    // avait inscrit un mauvais « Ferrat, 2008 » dans le coffre.
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
        executerPython([script, '--remap', outPath, JSON.stringify(m)],
          { env: env || envOutils() },
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
    const env = envOutils();
    try {
      const out = await new Promise((resolve, reject) => {
        executerPython([script, '--list', modele], { env, maxBuffer: 8 * 1024 * 1024 },
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
    // Berthier & Lanoix, 2025, p. 1, …, cité dans 2025, p. 1, … ».
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
        executerPython([script, '--verifier', modele],
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
    // Les notes intégrées « ![[…]] » sont dépliées dans le texte, comme
    // Obsidian les affiche.
    const cibleFichier = (c) => this.app.metadataCache.getFirstLinkpathDest(c, file.path);
    const deplie = await deplierIntegrations(contenu,
      async (c) => { const f = cibleFichier(c); return f && f.extension === 'md' ? this.app.vault.cachedRead(f) : null; },
      async (c) => { const f = cibleFichier(c); return f ? this.cheminAbsoluVault(f.path) : null; });
    let md = footnotesVersCitations(deplie, resoudre, citeDans);
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
      // LUA_PATH sépare ses motifs par « ; » sur tout système.
      const env = envOutils({
        LUA_PATH: pathMod.join(dirFiltre, '?.lua') + ';' + pathMod.join(dirFiltre, '?', 'init.lua') + ';;',
      });
      const args = ['--lua-filter', this.settings.exportFiltreLua];
      const modele = this.settings.exportModeleWord;
      if (modele && fs.existsSync(modele)) args.push('--reference-doc', modele);
      args.push(tmp, '-s', '-o', outPath);
      await new Promise((resolve, reject) => {
        executer(
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
    // ce nettoyage, une propriété sortait « [[Camille Rouvier]], [[Sacha
    // Delorme]] », crochets compris.
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
    // Les relevés d'Ariane (temps passé, identifiants de synchronisation) ne
    // sont pas des propriétés du document.
    const internes = (cle) => /^temps$|\bID$|Synchro/i.test(String(cle));
    const proprietes = [];
    for (const [cle, val] of Object.entries(fm)) {
      if (val == null || val === '') continue;
      let texte = lisible(Array.isArray(val) ? val.map(lisible).join(', ') : val);
      if (!texte.trim()) continue;
      // Une date ISO s'écrit comme les autres dates du document.
      if (/^\d{4}-\d{2}-\d{2}$/.test(texte.trim())) texte = this.formaterDate(new Date(texte.trim() + 'T12:00'), 'long');
      valeurs['propriété:' + cle] = texte;
      if (!structurelles.has(String(cle).toLowerCase()) && !internes(cle)) {
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
        executerPython([script, chemin, ordres],
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

  //#region Ariane · sommaire de lecture
  // ── sommaire de lecture à imprimer ──────────────────────────────────────
  //  Pour une source, la liste de ses annotations : le numéro de page et le
  //  titre de l'annotation, rien d'autre, à glisser dans le livre. L'en-tête
  //  reprend celui des fiches graphiques : la référence en Georgia à
  //  gauche, la date en Helvetica à droite, un filet vertical entre les
  //  deux, un filet horizontal dessous.

  // Le rang d'une page pour le tri : les pages liminaires en chiffres
  // romains d'abord, puis les numéros, puis ce qui n'est pas un numéro.
  static rangPage(page) {
    // Une page approchée (« ≈42 ») se range comme la page dont elle part.
    const p = String(page == null ? '' : page).trim().toLowerCase().replace(/^≈\s*/, '');
    const n = p.match(/^\d+/);
    if (n) return [1, Number(n[0])];
    if (/^[ivxlcdm]+\b/.test(p)) {
      const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
      const r = p.match(/^[ivxlcdm]+/)[0];
      let t = 0;
      for (let i = 0; i < r.length; i++) t += (v[r[i + 1]] > v[r[i]] ? -1 : 1) * v[r[i]];
      return [0, t];
    }
    return [2, 0];
  }

  // Les entrées triées par page (puis ordre de lecture), ou dans l'ordre de
  // lecture (« ordre »).
  static trierSommaire(entrees, mode) {
    const l = (entrees || []).slice();
    const parOrdre = (a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0);
    if (mode === 'ordre') return l.sort(parOrdre);
    return l.sort((a, b) => {
      const ra = Ariane.rangPage(a.page);
      const rb = Ariane.rangPage(b.page);
      return (ra[0] - rb[0]) || (ra[1] - rb[1]) || parOrdre(a, b);
    });
  }

  // L'imposition d'un sommaire de `n` fiches recto verso sur des feuilles
  // A4 portrait à découper : trois fiches par face (deux debout en haut,
  // une couchée dessous), la fiche k portant les pages 2k (recto) et 2k+1
  // (verso). Au dos de la feuille (retournée sur le bord long), chaque
  // verso est à la place miroir de son recto ; la fiche couchée y est
  // tournée dans l'autre sens, pour que son verso se lise à l'endroit
  // quand on la retourne comme une page. Rend [{ recto: [emplacement],
  // verso: [emplacement] }], emplacement = { page, x, y, rot } en mm (rot :
  // 0, 90 ou -90 degrés ; x, y : coin haut gauche de la case).
  static impositionA4(n) {
    const L = 210;
    const ox = 5;
    const oy = (297 - 250) / 2;
    const cases = [{ x: ox, y: oy, l: 100, rot: 0 }, { x: ox + 100, y: oy, l: 100, rot: 0 }, { x: ox, y: oy + 150, l: 150, rot: 90 }];
    const feuilles = [];
    for (let k = 0; k < n; k += 3) {
      const recto = [];
      const verso = [];
      for (let i = 0; i < 3 && k + i < n; i++) {
        const c = cases[i];
        recto.push({ page: 2 * (k + i), x: c.x, y: c.y, rot: c.rot });
        verso.push({ page: 2 * (k + i) + 1, x: L - c.x - c.l, y: c.y, rot: -c.rot });
      }
      feuilles.push({ recto, verso });
    }
    return feuilles;
  }

  // La page HTML, prête à imprimer, au format des fiches graphiques : leur
  // page draw.io fait 394 × 591 unités de 0,254 mm, soit 10 × 15 cm. Chaque
  // fiche reprend leur en-tête : 40 unités de haut, le livre et son auteur
  // en Georgia corps 11 à gauche, la date en Helvetica à droite après un
  // filet vertical (unité 319), un filet horizontal dessous. Puis une ligne
  // par annotation, « 11. Titre », serrée comme un sommaire écrit à la
  // main, en Georgia corps 10 (celui des blocs des fiches). Les fiches se
  // remplissent dans la page elle-même (le texte y est mesuré), puis, en
  // A4, s'imposent trois par face. o = { titre, citation « (Auteur,
  // AAAA) », date, entrees [{ page, titre }], colonnes: 1 | 2, sortie:
  // 'fiche' | 'a4', imprimer (lancer l'impression une fois composé) }.
  static pageSommaireLecture(o) {
    const h = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const u = (n) => (n * 0.254).toFixed(2) + 'mm';
    const colonnes = Number(o.colonnes) === 2 ? 2 : 1;
    const a4 = o.sortie === 'a4';
    const entrees = (o.entrees || []).map((e) => ({ p: e.page ? e.page + '.' : '', t: String(e.titre || '') }));
    // Largeur de la colonne des pages, au plus juste : un chiffre tient un
    // demi-cadratin (chiffres tabulaires), le point un quart, le reste davantage.
    const chasse = (p) => [...p].reduce((n, c) => n + (/\d/.test(c) ? 0.53 : c === '.' ? 0.25 : 0.6), 0);
    const large = Math.max(0.75, ...entrees.map((e) => chasse(e.p)));
    const trait = u(1) + ' solid #000';
    const entete = '<header><div class="ref">' + (o.titre ? '<span>' + h(o.titre) + '</span>' : '') + (o.citation ? '<span>' + h(o.citation) + '</span>' : '')
      + '</div><div class="date">' + h(o.date || '') + '</div></header>';
    const script = [
      'var ENTREES = ' + JSON.stringify(entrees).replace(/</g, '\\u003c') + ';',
      'var A4 = ' + (a4 ? 'true' : 'false') + ', DEUX = ' + (colonnes === 2 ? 'true' : 'false') + ', IMPRIMER = ' + (o.imprimer ? 'true' : 'false') + ';',
      'var ENTETE = ' + JSON.stringify(entete).replace(/</g, '\\u003c') + ';',
      'var IMPOSER = { ' + Ariane.impositionA4.toString() + ' };',
      'function carte() {',
      '  var c = document.createElement("div"); c.className = "carte";',
      '  c.innerHTML = ENTETE + "<main><ol></ol></main><footer class=\\"folio\\"></footer>";',
      '  return c;',
      '}',
      'function deborde(c) {',
      '  var m = c.querySelector("main"), ol = c.querySelector("ol");',
      '  return DEUX ? ol.scrollWidth > ol.clientWidth + 1 : m.scrollHeight > m.clientHeight + 1;',
      '}',
      'function composer() {',
      '  var zone = document.getElementById("cartes"), cartes = [], c = carte();',
      '  zone.appendChild(c); cartes.push(c);',
      '  if (!ENTREES.length) c.querySelector("main").innerHTML = "<p class=\\"vide\\">Aucune annotation.</p>";',
      '  ENTREES.forEach(function (e) {',
      '    var li = document.createElement("li");',
      '    var p = document.createElement("span"); p.className = "p"; p.textContent = e.p;',
      '    var t = document.createElement("span"); t.className = "t"; t.textContent = e.t;',
      '    li.appendChild(p); li.appendChild(t);',
      '    c.querySelector("ol").appendChild(li);',
      '    if (deborde(c) && c.querySelectorAll("li").length > 1) {',
      '      li.remove(); c = carte(); zone.appendChild(c); cartes.push(c); c.querySelector("ol").appendChild(li);',
      '    }',
      '  });',
      // Folio « n / total » au pied de chaque fiche, dès qu'il y en a deux.
      '  if (cartes.length > 1) cartes.forEach(function (x, i) { x.querySelector(".folio").textContent = (i + 1) + " / " + cartes.length; });',
      '  if (!A4) return;',
      // Le nombre de fiches recto verso : deux pages par fiche.
      '  var fiches = Math.ceil(cartes.length / 2), plan = IMPOSER.impositionA4(fiches);',
      '  var sortie = document.getElementById("feuilles");',
      '  plan.forEach(function (f) {',
      '    ["recto", "verso"].forEach(function (face) {',
      '      var feuille = document.createElement("div"); feuille.className = "feuille est-" + face;',
      '      f[face].forEach(function (e) {',
      '        var place = document.createElement("div"); place.className = "place" + (e.rot ? " couchee" : "");',
      '        place.style.left = e.x + "mm"; place.style.top = e.y + "mm";',
      '        var x = cartes[e.page];',
      '        if (x) {',
      '          if (e.rot === 90) x.style.transform = "translate(150mm, 0) rotate(90deg)";',
      '          if (e.rot === -90) x.style.transform = "translate(0, 100mm) rotate(-90deg)";',
      '          place.appendChild(x);',
      '        }',
      '        feuille.appendChild(place);',
      '      });',
      '      sortie.appendChild(feuille);',
      '    });',
      '  });',
      '  zone.remove();',
      '}',
      'function lancer() { composer(); if (IMPRIMER) setTimeout(function () { window.print(); }, 50); }',
      'if (document.fonts && document.fonts.ready) document.fonts.ready.then(lancer); else window.addEventListener("load", lancer);',
    ].join('\n');
    return '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><title>' + h(o.titre || o.citation) + '</title>\n<style>\n'
      + '@page { size: ' + (a4 ? 'A4 portrait' : '100mm 150mm') + '; margin: 0; }\n'
      + '* { box-sizing: border-box; }\n'
      + 'html, body { margin: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n'
      + 'body { font-family: Georgia, "Times New Roman", serif; font-size: ' + u(10) + '; line-height: 1.22; }\n'
      + '.carte { width: 100mm; height: 150mm; overflow: hidden; display: flex; flex-direction: column; background: #fff; transform-origin: top left; break-after: page; }\n'
      + 'header { flex: 0 0 auto; display: flex; min-height: ' + u(40) + '; border-bottom: ' + trait + '; width: ' + u(390) + '; }\n'
      + 'header .ref { width: ' + u(319) + '; padding: ' + u(3) + ' ' + u(6) + ' ' + u(3) + ' ' + u(2) + '; font-size: ' + u(11) + '; line-height: 1.2;'
      + ' display: flex; flex-direction: column; justify-content: center; }\n'
      + 'header .date { flex: 1; border-left: ' + trait + '; font-family: Helvetica, Arial, sans-serif; font-size: ' + u(11) + ';'
      + ' display: flex; align-items: center; justify-content: flex-end; white-space: nowrap; padding-right: ' + u(2) + '; }\n'
      + 'main { flex: 1 1 auto; min-height: 0; overflow: hidden; padding: ' + u(8) + ' ' + u(6) + ' ' + u(2) + ' ' + u(2) + '; }\n'
      + '.folio { flex: 0 0 ' + u(12) + '; font-family: Helvetica, Arial, sans-serif; font-size: ' + u(8) + '; line-height: 1;'
      + ' display: flex; align-items: center; justify-content: flex-end; padding-right: ' + u(2) + '; font-variant-numeric: tabular-nums; }\n'
      + 'ol { list-style: none; margin: 0; padding: 0;' + (colonnes === 2 ? ' height: 100%; column-count: 2; column-fill: auto; column-gap: ' + u(12) + '; column-rule: ' + u(0.5) + ' solid #999;' : '') + ' }\n'
      + 'li { display: grid; grid-template-columns: ' + large.toFixed(2) + 'em 1fr; column-gap: 0.35em; padding: 0.05em 0; break-inside: avoid; }\n'
      + 'li .p { font-variant-numeric: lining-nums tabular-nums; }\n'
      + '.vide { font-style: italic; }\n'
      + '.carte:last-child, .feuille:last-child { break-after: auto; }\n'
      + '.feuille { position: relative; width: 210mm; height: 297mm; overflow: hidden; break-after: page; background: #fff; }\n'
      + '.place { position: absolute; width: 100mm; height: 150mm; }\n'
      + '.place.couchee { width: 150mm; height: 100mm; }\n'
      + '.place .carte { position: absolute; left: 0; top: 0; break-after: auto; }\n'
      // Repères de coupe, au recto seulement (un décalage du verso ne les
      // rendrait pas faux).
      + '.est-recto .place { outline: 0.1mm solid #c8c8c8; }\n'
      + '@media screen { html { background: #e8e8e8; } body { padding: 16px 0; }'
      + ' .carte, .feuille { margin: 0 auto 16px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18); }'
      + ' .place .carte { margin: 0; box-shadow: none; }'
      + ' .feuille.est-verso::before { content: "Verso"; position: absolute; right: 4mm; top: 3mm; font: 9px Helvetica, sans-serif; color: #999; } }\n'
      + '</style></head><body>\n<div id="cartes"></div><div id="feuilles"></div>\n'
      + '<script>\n' + script + '\n</script>\n'
      + '</body></html>\n';
  }

  // Le titre du livre pour l'en-tête : sans son sous-titre (après « : »
  // ou « . »), qui le rendrait trop long pour la fiche.
  static titreCourtOuvrage(titre) {
    const t = String(titre || '').replace(/\s+/g, ' ').trim();
    const m = t.match(/^(.{8,}?)\s*[:.]\s+\S/);
    return m ? m[1].trim() : t;
  }

  // Les sources qui ont des annotations : { fichier, cle, reference,
  // titre, n }, la source de la note active en tête.
  sourcesAvecAnnotations() {
    const compte = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = sansLien(fm['zotflow-source'] || '');
      if (src) compte.set(src, (compte.get(src) || 0) + 1);
    }
    const out = [];
    for (const [cle, n] of compte) {
      const f = this.app.metadataCache.getFirstLinkpathDest(cle, '');
      const fm = f ? ((this.app.metadataCache.getFileCache(f) || {}).frontmatter || {}) : {};
      out.push({ fichier: f, cle, n, titre: String(fm.title || '').trim(),
        reference: String(entreeBiblio(cle, fm, '{{auteurs}} ({{annee}})') || cle).replace(/\.$/, ''),
        citation: '(' + String(entreeBiblio(cle, fm, '{{auteurs}}, {{annee}}') || cle).replace(/\.$/, '') + ')' });
    }
    out.sort((a, b) => a.reference.localeCompare(b.reference, 'fr'));
    const actif = this.app.workspace.getActiveFile();
    if (actif) {
      const fmA = (this.app.metadataCache.getFileCache(actif) || {}).frontmatter || {};
      const cleA = sansLien(fmA['zotflow-source'] || '') || actif.basename;
      const i = out.findIndex((x) => x.cle === cleA);
      if (i > 0) out.unshift(out.splice(i, 1)[0]);
    }
    return out;
  }

  // Les annotations d'une source : { page, titre, ordre }. Le titre est
  // l'alias de l'annotation (son intitulé), à défaut le nom de la note.
  annotationsPourSommaire(cleSource) {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (sansLien(fm['zotflow-source'] || '') !== cleSource) continue;
      const alias = [].concat(fm.aliases || []).map((x) => String(x).trim()).filter(Boolean);
      out.push({ page: String(fm.page == null ? '' : fm.page).trim(), titre: alias[0] || f.basename, ordre: fm.ordre,
        cle: String(fm['zotflow-anno-key'] || '').trim() });
    }
    return out;
  }

  // Les pages manquantes complétées d'après Zotero : `zotero` = Map(clé de
  // l'annotation → { page, tri }) (tri : position de lecture). Une
  // annotation sans page dans Zotero non plus (un passage d'EPUB sans
  // repère de pagination) prend, marquée « ≈ », la page de la précédente
  // dans l'ordre de lecture : on sait où chercher sans la croire exacte.
  // L'ordre de lecture de Zotero remplace alors celui du coffre.
  static completerPagesSommaire(entrees, zotero) {
    const z = zotero || new Map();
    const l = (entrees || []).map((e) => {
      const x = z.get(e.cle) || {};
      return Object.assign({}, e, { page: e.page || x.page || '', tri: x.tri || '' });
    });
    const parLecture = l.filter((e) => e.tri).sort((a, b) => (a.tri < b.tri ? -1 : a.tri > b.tri ? 1 : 0));
    let derniere = '';
    parLecture.forEach((e, k) => {
      e.ordre = k + 1;
      if (e.page) derniere = String(e.page).replace(/^≈\s*/, '');
      else if (derniere) e.page = '≈' + derniere;
    });
    return l.map(({ tri, ...e }) => e);
  }

  // Les pages et l'ordre de lecture d'annotations Zotero (clés), lus dans
  // la base de Zotero (voir requeteZotero). Map vide si rien n'est lisible.
  async pagesZotero(cles) {
    const valides = (cles || []).filter((c) => /^[A-Z0-9]{8}$/.test(c));
    if (!valides.length) return new Map();
    const requete = 'SELECT i.key, IFNULL(a.pageLabel, \'\'), IFNULL(a.sortIndex, \'\'), IFNULL(a.position, \'\'), '
      + 'pj.key, IFNULL(ia.path, \'\') FROM itemAnnotations a JOIN items i ON i.itemID = a.itemID '
      + 'JOIN items pj ON pj.itemID = a.parentItemID LEFT JOIN itemAttachments ia ON ia.itemID = a.parentItemID '
      + 'WHERE i.key IN (' + valides.map((c) => "'" + c + "'").join(',') + ');';
    const m = new Map();
    for (const [cle, page, tri, position, pj, chemin] of (await this.requeteZotero(requete)) || []) {
      if (!cle) continue;
      const cfi = (String(position || '').match(/epubcfi\([^)]*\)/) || [])[0] || '';
      const fichier = /^storage:/.test(chemin || '') && pj
        ? require('path').join(this.racineZotero(), 'storage', pj, String(chemin).slice(8)) : '';
      m.set(cle, { page: (page || '').trim(), tri: (tri || '').trim(), cfi, fichier });
    }
    return m;
  }

  // ── pages des annotations d'EPUB ──
  //  Zotero repère une annotation d'EPUB par un CFI (« epubcfi(/6/10!/4/2/6,
  //  /1:215,/1:547) ») et ne lui donne pas toujours de page. Un EPUB paginé
  //  porte, lui, un repère par page imprimée (<span epub:type="pagebreak"
  //  title="12">) : la page d'une annotation est celle du dernier repère qui
  //  la précède. Fonctions pures, sur le texte XHTML (pas de DOM).

  // Un CFI en { spine (rang dans la spine), etapes (pas d'éléments dans le
  // document), texte (rang du nœud texte, impair), decalage }, ou null.
  static analyserCfi(cfi) {
    const m = String(cfi || '').match(/epubcfi\(([^)]*)\)/);
    if (!m) return null;
    const parties = m[1].split(',');
    const chemin = parties[0] + (parties.length > 1 ? parties[1] : '');
    const [avant, apres] = chemin.split('!');
    if (apres === undefined) return null;
    const pas = (t) => t.split('/').filter(Boolean).map((x) => { const q = x.match(/^(\d+)(?::(\d+))?/); return q ? { n: Number(q[1]), d: q[2] != null ? Number(q[2]) : null } : null; });
    const pa = pas(avant).filter(Boolean);
    const pd = pas(apres).filter(Boolean);
    if (pa.length < 2) return null;
    const etapes = [];
    let texte = null;
    let decalage = 0;
    for (const x of pd) {
      if (x.n % 2 === 0) { etapes.push(x.n); continue; }
      texte = x.n;
      decalage = x.d || 0;
      break;
    }
    return { spine: pa[1].n / 2 - 1, etapes, texte, decalage };
  }

  // La position (en caractères du source) que désigne un chemin de CFI dans
  // un document XHTML, et les repères de page qu'il contient ({ pos, page }).
  static positionsXhtml(xml, etapes, texte, decalage) {
    const x = String(xml || '');
    const reperes = [];
    let pos = null;
    const pile = [];       // compteur d'enfants éléments, par niveau (depuis <html>)
    let racine = false;
    let suivis = 0;        // pas déjà suivis
    let cible = -1;        // niveau de la cible dans la pile
    const finsEnfants = []; // fins des enfants directs de la cible
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<\/[^>]+>|<[^>]+?\/?>/g;
    let m;
    // Le nœud texte visé (rang impair > 1) commence après le (rang - 1) / 2
    // ième enfant de la cible : dès que cet enfant se referme.
    const verifier = () => {
      if (pos === null && cible >= 0 && texte != null && texte > 1 && finsEnfants.length === (texte - 1) / 2) {
        pos = avancerTexte(finsEnfants[finsEnfants.length - 1], decalage);
      }
    };
    const avancerTexte = (debut, n) => {
      let k = debut;
      let reste = n;
      while (reste > 0 && k < x.length && x[k] !== '<') {
        if (x[k] === '&') { const f = x.indexOf(';', k); k = f > k ? f + 1 : k + 1; } else k++;
        reste--;
      }
      return k;
    };
    while ((m = re.exec(x))) {
      const t = m[0];
      if (t.startsWith('<!') || t.startsWith('<?')) continue;
      if (/pagebreak/.test(t) && !t.startsWith('</')) {
        const ti = t.match(/\btitle="([^"]*)"/) || t.match(/\baria-label="([^"]*)"/);
        if (ti) reperes.push({ pos: m.index, page: ti[1] });
      }
      if (t.startsWith('</')) {
        if (!racine) continue;
        pile.pop();
        if (cible >= 0 && pile.length === cible + 1) { finsEnfants.push(m.index + t.length); verifier(); }
        if (cible >= 0 && pile.length === cible) cible = -2; // la cible est refermée
        continue;
      }
      const ferme = /\/>$/.test(t);
      if (!racine) { racine = true; if (!ferme) pile.push(0); continue; }
      const niveau = pile.length - 1;
      pile[niveau]++;
      if (pos === null && suivis === niveau && suivis < etapes.length && pile[niveau] * 2 === etapes[suivis]) {
        suivis++;
        if (suivis === etapes.length) {
          cible = niveau + 1;
          if (texte == null || texte === 1) pos = avancerTexte(m.index + t.length, decalage);
        }
      }
      if (!ferme) pile.push(0);
      else if (cible >= 0 && pile.length === cible + 1) { finsEnfants.push(m.index + t.length); verifier(); }
    }
    if (pos === null && cible !== -1) pos = x.length; // cible trouvée, texte introuvable : sa fin
    return { pos, reperes };
  }

  // La page d'une annotation d'EPUB : `docs` = textes XHTML dans l'ordre de
  // la spine. Le dernier repère qui précède la position, dans ce document ou
  // les précédents ; '' si rien.
  static pageDepuisCfi(docs, cfi) {
    const c = Ariane.analyserCfi(cfi);
    if (!c || !docs[c.spine]) return '';
    const r = Ariane.positionsXhtml(docs[c.spine], c.etapes, c.texte, c.decalage);
    if (r.pos == null) return '';
    const avant = r.reperes.filter((p) => p.pos <= r.pos);
    if (avant.length) return avant[avant.length - 1].page;
    for (let k = c.spine - 1; k >= 0; k--) {
      const rk = Ariane.positionsXhtml(docs[k], [], null, 0).reperes;
      if (rk.length) return rk[rk.length - 1].page;
    }
    return '';
  }

  // Les documents d'un EPUB dans l'ordre de sa spine (outil unzip de macOS),
  // gardés par fichier et date.
  async documentsEpub(fichier) {
    const fs = require('fs');
    let st;
    try { st = fs.statSync(fichier); } catch (e) { return []; }
    const c = this._epubCache || (this._epubCache = new Map());
    const sig = st.size + ':' + st.mtimeMs;
    const vu = c.get(fichier);
    if (vu && vu.sig === sig) return vu.docs;
    // L'archive se lit en JavaScript : « unzip » n'existe pas sous Windows.
    let octets = null;
    try { octets = await fs.promises.readFile(fichier); } catch (e) { return []; }
    const lire = async (entree) => {
      const nom = decodeURIComponent(String(entree || '')).replace(/^\/+/, '');
      const brut = lireEntreeZip(octets, nom) || lireEntreeZip(octets, entree);
      return brut ? brut.toString('utf8') : '';
    };
    const conteneur = await lire('META-INF/container.xml');
    const opfChemin = (conteneur.match(/full-path="([^"]+)"/) || [])[1];
    if (!opfChemin) return [];
    const opf = await lire(opfChemin);
    const base = opfChemin.includes('/') ? opfChemin.replace(/\/[^/]*$/, '/') : '';
    const manifeste = new Map();
    for (const it of opf.match(/<item\b[^>]*>/g) || []) {
      const id = (it.match(/\bid="([^"]+)"/) || [])[1];
      const href = (it.match(/\bhref="([^"]+)"/) || [])[1];
      if (id && href) manifeste.set(id, base + decodeURIComponent(href));
    }
    const docs = [];
    for (const ref of opf.match(/<itemref\b[^>]*>/g) || []) {
      const id = (ref.match(/\bidref="([^"]+)"/) || [])[1];
      docs.push(manifeste.has(id) ? await lire(manifeste.get(id)) : '');
    }
    c.set(fichier, { sig, docs });
    return docs;
  }

  // Les entrées du sommaire d'une source, pages complétées par Zotero.
  // ── pages saisies à la main (livres papier) ──
  //  Monsieur note sur papier les pages de ses annotations, dans l'ordre :
  //  une page par annotation, répétée si deux tombent sur la même. Elles
  //  sont rangées à part (« .ariane/pages-manuelles.json », par clé
  //  d'annotation), les notes d'annotation étant régénérées par Ariane, et
  //  l'emportent sur toute autre source.

  // Les pages tapées (séparées par des espaces, virgules, points-virgules ou
  // retours à la ligne) associées dans l'ordre aux entrées. Rend { pages,
  // n, attendu, ok }.
  static associerPagesSaisies(texte, entrees) {
    const pages = String(texte || '').split(/[\s,;]+/).map((x) => x.trim().replace(/\.$/, '')).filter(Boolean);
    const attendu = (entrees || []).length;
    return { pages, n: pages.length, attendu, ok: pages.length === attendu && attendu > 0 };
  }

  get cheminPagesManuelles() { return '.ariane/pages-manuelles.json'; }

  async pagesManuelles() {
    try {
      const a = this.app.vault.adapter;
      if (await a.exists(this.cheminPagesManuelles)) return JSON.parse(await a.read(this.cheminPagesManuelles)) || {};
    } catch (e) { /* fichier absent ou abîmé */ }
    return {};
  }

  // Enregistre (ou, avec des pages vides, oublie) les pages de ces annotations.
  async enregistrerPagesManuelles(parCle) {
    const toutes = await this.pagesManuelles();
    for (const [cle, page] of Object.entries(parCle || {})) {
      if (page) toutes[cle] = String(page); else delete toutes[cle];
    }
    const a = this.app.vault.adapter;
    if (!(await a.exists('.ariane'))) await a.mkdir('.ariane');
    await a.write(this.cheminPagesManuelles, JSON.stringify(toutes, null, 1));
  }

  async entreesSommaire(cleSource) {
    const entrees = this.annotationsPourSommaire(cleSource);
    const manuelles = await this.pagesManuelles();
    for (const e of entrees) if (manuelles[e.cle]) { e.page = manuelles[e.cle]; e.manuelle = true; }
    let zotero = new Map();
    try { zotero = await this.pagesZotero(entrees.map((e) => e.cle)); } catch (e) { /* Zotero illisible */ }
    // Une annotation d'EPUB sans page dans Zotero : sa page se lit dans
    // l'EPUB, au dernier repère de page qui la précède.
    for (const e of entrees) {
      const z = zotero.get(e.cle);
      if (e.page || !z || z.page || !z.cfi || !/\.epub$/i.test(z.fichier)) continue;
      try { z.page = Ariane.pageDepuisCfi(await this.documentsEpub(z.fichier), z.cfi); } catch (err) { /* EPUB illisible */ }
    }
    return Ariane.completerPagesSommaire(entrees, zotero);
  }

  ouvrirSommaireLecture() {
    const sources = this.sourcesAvecAnnotations();
    if (!sources.length) { new obsidian.Notice(tr('Aucune source annotée.')); return; }
    new ChoixListeModal(this.app, tr('Sommaire de lecture : quelle source ?'),
      sources.map((s) => Object.assign({ nom: s.reference + '  ' + (s.titre ? s.titre.slice(0, 80) + '  ' : '') + '(' + s.n + ')' }, s)),
      (s) => new ModaleSommaireLecture(this.app, this, s).open()).open();
  }

  //#endregion Ariane · sommaire de lecture
};
