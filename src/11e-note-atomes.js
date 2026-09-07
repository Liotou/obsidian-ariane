
// ── avecNoteAtomes ────────────────────────────────────────────────────────
// Phase 2 : ariane-note.
// Découpe d'une note source en notes atomiques, rendu des citations, panier.
const avecNoteAtomes = (Base) => class extends Base {
  //#region Ariane · atomisation (orchestration)
  // ── atomisation (orchestration) ──────────────────────────────────────────

  /* --------------------------- Atomisation source --------------------------- */

  async commandeNoteActive() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new obsidian.Notice(tr('Aucune note active.'));
      return;
    }
    const contenu = await this.app.vault.read(file);
    if (!contenu.includes(this.settings.marqueurSource)) {
      new obsidian.Notice(tr("Cette note ne contient pas d'annotations reconnues."));
      return;
    }
    await this.atomiseSource(file);
  }

  async atomiserTout() {
    let n = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.read(file);
      if (contenu.includes(this.settings.marqueurSource)) {
        await this.atomiseSource(file);
        n++;
      }
    }
    new obsidian.Notice(tr('Ariane : ') + n + ' source(s) atomisée(s).');
  }

  async atomiseSource(file) {
    const cfg = this.settings;
    const contenu = await this.app.vault.read(file);
    if (!contenu.includes(cfg.marqueurSource)) return;

    const idx = this.construireIndexZotero();
    const blocs = extraireBlocs(contenu, cfg);

    // Dossier cible des annotations : sous-dossier par source si activé.
    const dossierCible = cfg.regrouperParSource
      ? this.dossierA + '/' + this.nettoyerNomFichier(file.basename)
      : this.dossierA;

    // Aucune annotation compatible : retirer les annotations désormais
    // orphelines de cette source, puis le sous-dossier une fois vidé.
    if (blocs.length === 0) {
      if (cfg.propagerSuppressions) {
        await this.nettoyerSupprimees(file.basename, new Set());
      }
      if (cfg.regrouperParSource) {
        const d = this.app.vault.getAbstractFileByPath(dossierCible);
        if (d instanceof obsidian.TFolder && d.children.length === 0) {
          this.marquerEcriture(dossierCible);
          await this.app.fileManager.trashFile(d);
        }
      }
      return;
    }

    await this.assurerDossier(this.dossierA);
    if (dossierCible !== this.dossierA) await this.assurerDossier(dossierCible);

    let creees = 0;
    let majes = 0;
    let renommees = 0;
    const clesPresentes = new Set();
    const parCle = this.indexAnnotationsParCle();
    const canoniques = this.indexCanoniques();

    for (const bloc of blocs) {
      clesPresentes.add(bloc.cle);

      for (const r of bloc.refs) {
        if (r.estAuteurSeul) continue; // auteur seul : pas de note de référence
        const z = cfg.rattachementZotero ? trouverSourceZotero(r, idx) : null;
        if (!z) await this.assurerReference(r, canoniques);
      }

      const fmSource = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
      const canon = construireNote(bloc, file.basename, idx, cfg,
        { collections: fmSource.collections, canoniques });
      const existant = parCle.get(bloc.cle);

      const base = this.nomFichierAnnotation(bloc);
      let cible = dossierCible + '/' + base + '.md';
      const occupant = this.app.vault.getAbstractFileByPath(cible);
      if (occupant instanceof obsidian.TFile && (!existant || occupant.path !== existant.path)) {
        cible = dossierCible + '/' + base + ' (' + bloc.cle + ').md';
      }

      if (existant instanceof obsidian.TFile) {
        if (existant.path !== cible) {
          this.marquerEcriture(existant.path);
          this.marquerEcriture(cible);
          await this.app.fileManager.renameFile(existant, cible);
          renommees++;
        }
        const actuel = await this.app.vault.read(existant);
        if (actuel !== canon) {
          await this.ecrire(existant.path, canon, existant);
          majes++;
        }
      } else {
        await this.ecrire(cible, canon);
        creees++;
      }
    }

    if (cfg.propagerSuppressions) {
      await this.nettoyerSupprimees(file.basename, clesPresentes);
    }

    // Notes d'auteur (nom complet) pour les auteurs de cette source.
    if (cfg.liensAuteurs) {
      const entreeSrc = idx.find((z) => z.basename === file.basename);
      await this.assurerNotesAuteurs(file.basename, (entreeSrc && entreeSrc.creatorsFull) || []);
    }

    if (creees || majes || renommees) {
      new obsidian.Notice(tr('ZotFlow [') + file.basename + '] : ' + creees + ' créée(s), ' + majes + ' maj, ' + renommees + ' renommée(s).'
      );
    }
  }

  //#endregion Ariane · atomisation (orchestration)

  //#region Ariane · notes & citations — rendu
  // ── notes & citations — rendu ────────────────────────────────────────────

  // La référence de la note pour l'en-tête principal. On cherche, dans
  // l'ordre, les propriétés que l'utilisateur a désignées ; à défaut, et s'il
  // l'a demandé, le nom du fichier fait office de référence — c'est le cas des
  // notes nommées « NP-260826-07 » ou « CR-260826-07 ».
  referenceDeNote(fichier, fm) {
    const noms = String(this.settings.exportProprieteReference || 'ref')
      .split(',').map((x) => x.trim()).filter(Boolean);
    const sansAccent = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const table = new Map();
    for (const [k, v] of Object.entries(fm || {})) table.set(sansAccent(k).replace(/\.$/, ''), v);
    for (const n of noms) {
      const v = table.get(sansAccent(n).replace(/\.$/, ''));
      if (v != null && String(v).trim()) {
        return valeurLisible(Array.isArray(v) ? v.join(', ') : v);
      }
    }
    return this.settings.exportRefDepuisNom === false ? '' : fichier.basename;
  }

  // Le dossier du coffre où vit la note, sans son numéro de rangement :
  // « 2 - Notes conceptuelles » -> « Notes conceptuelles ». C'est ce que le
  // gabarit de l'en-tête principal appelle « Type ».
  dossierDeNote(fichier) {
    const parent = fichier.parent && fichier.parent.name ? fichier.parent.name : '';
    return parent.replace(/^\s*\d+\s*-\s*/, '').trim();
  }

  // Date de création : la propriété « date » de la note si elle est lisible,
  // sinon la date de création du fichier.
  dateDeNote(fichier, fm) {
    const brute = fm && fm.date ? String(fm.date) : '';
    const d = brute ? new Date(brute) : null;
    if (d && !isNaN(d.getTime())) return d;
    const ctime = fichier.stat && fichier.stat.ctime;
    return ctime ? new Date(ctime) : new Date();
  }

  // Deux formats, ceux du modèle : « 02/07/2026 » dans l'en-tête principal,
  // « Jeudi 02 juillet 2026 » dans le tableau des propriétés.
  formaterDate(d, forme) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    if (forme === 'court') {
      return d.toLocaleDateString('fr-FR',
        { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    const t = d.toLocaleDateString('fr-FR',
      { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // « date-creation » -> « Date creation ». Les noms techniques restent lisibles.
  libellePropriete(cle) {
    const t = String(cle).replace(/[-_]+/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Infobulle dans l'explorateur : le total inscrit dans la note.
  installerInfobulleTemps() {
    if (!this.settings.tempsInfobulleExplorateur) return;
    this.registerDomEvent(document, 'mouseover', (e) => {
      const cible = e && e.target;
      if (!cible || typeof cible.closest !== 'function') return;
      const titre = cible.closest('.nav-file-title');
      if (!titre) return;
      const chemin = titre.getAttribute('data-path');
      if (!chemin || !chemin.endsWith('.md')) return;
      const minutes = this.tempsTotalDe(chemin)
        + ((this._tempsSecondes && this._tempsSecondes.get(chemin)) || 0) / 60;
      if (minutes < 1) return;
      titre.setAttribute('title', 'Temps passé : ' + dureeLisible(minutes));
    }, { capture: true });
  }

  /* Compteur d'appels dans l'explorateur retiré : voir la vue
     « Ordre et appels » de la base ZotFlow. */

  // Titre (alias) d'une annotation ciblée par un lien, ou '' si ce n'en
  // est pas une.
  titreAnnotationCiblee(cheminLien, sourcePath, pourAparte) {
    if (!cheminLien) return '';
    const dest = this.app.metadataCache.getFirstLinkpathDest(cheminLien, sourcePath || '');
    if (!dest) return '';
    const cache = this.app.metadataCache.getFileCache(dest);
    const fm = cache ? cache.frontmatter : null;
    if (!fm) return '';
    // Cibles éligibles à l'aparté : annotations ET notes conceptuelles.
    const estAnnotation = dest.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined;
    // Hors annotations, c'est la famille de la note qui dit si l'aparté
    // s'applique — plus aucun type de note n'est nommé dans le code.
    const famille = estAnnotation ? null : this.familleDuChemin(dest.path, dest.basename);
    if (!estAnnotation && !famille) return '';
    // Filtrage par type, uniquement pour l'aparté sur les liens.
    if (pourAparte) {
      if (estAnnotation && !this.settings.aparteAnnotations) return '';
      if (famille && !famille.aparte) return '';
    }
    const al = fm.aliases;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string') return al;
    return '';
  }

  // Post-traitement (lecture) : ajoute « (Titre) » discret après un lien
  // d'annotation qui affiche la clé. N'écrit rien dans les notes.
  enrichirLiensAnnotation(el, ctx) {
    if (!this.settings.aliasSurLiens) return;
    const liens = el.querySelectorAll('a.internal-link');
    liens.forEach((a) => {
      const suivant = a.nextElementSibling;
      if (suivant && suivant.classList && suivant.classList.contains('zfa-lien-alias')) return;
      const cible = a.getAttribute('data-href') || a.getAttribute('href') || '';
      if (!cible || cible.includes('#')) return;
      // Alias manuel présent ([[cible|affiché]]) -> pas d'aparté auto.
      const affiche = (a.textContent || '').trim();
      const base = cible.split('/').pop().replace(/\.md$/, '');
      if (affiche && affiche !== cible && affiche !== base) return;
      const titre = this.titreAnnotationCiblee(cible, ctx && ctx.sourcePath, true);
      if (!titre) return;
      // On n'ajoute rien si le lien affiche déjà le titre.
      if (affiche === titre) return;
      const span = document.createElement('span');
      span.className = 'zfa-lien-alias';
      span.textContent = this.formatAparte(titre, cible);
      a.insertAdjacentElement('afterend', span);
    });
  }

  // Explorateur de fichiers : ajoute l'alias (titre) à côté du nom des
  // annotations et notes conceptuelles, dont le nom de fichier est cryptique.
  installerDecorateurExplorateur() {
    const planifier = () => this.antirebond('explorateur', () => this.decorerExplorateur(), 200);
    this.registerEvent(this.app.workspace.on('layout-change', planifier));
    this.registerEvent(this.app.workspace.on('active-leaf-change', planifier));
    this.registerEvent(this.app.metadataCache.on('resolved', planifier));
    const cont = document.querySelector('.nav-files-container');
    if (cont && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(() => planifier());
      obs.observe(cont, { childList: true, subtree: true });
      this.register(() => obs.disconnect());
    }
    planifier();
  }

  decorerExplorateur() {
    const dossiers = this.dossiersDeFamille('alias');
    // Dossiers en police à largeur fixe : appartenance directe uniquement,
    // un sous-dossier n'hérite pas du réglage de son parent.
    const dossiersMono = new Set(this.dossiersDeFamille('monospace'));
    document.querySelectorAll('.nav-file-title').forEach((el) => {
      const ancien = el.querySelector('.zfa-explorer-alias');
      const path = el.getAttribute('data-path') || '';
      // Police à largeur fixe si la note est directement dans un dossier listé.
      const i = path.lastIndexOf('/');
      const dossierNote = i === -1 ? '' : path.slice(0, i);
      el.classList.toggle('zfa-nom-mono', !!(path.endsWith('.md') && dossiersMono.has(dossierNote)));
      if (!path.endsWith('.md') || !dossiers.some((d) => path === d + '.md' || path.startsWith(d + '/'))) {
        if (ancien) ancien.remove();
        return;
      }
      const alias = this.aliasDeFichier(path);
      if (!alias) { if (ancien) ancien.remove(); return; }
      if (ancien) { if (ancien.textContent !== alias) ancien.textContent = alias; return; }
      el.createSpan({ cls: 'zfa-explorer-alias', text: alias });
    });
  }

  // Premier alias du frontmatter d'un fichier, quel que soit son type.
  aliasDeFichier(path) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!f) return '';
    const cache = this.app.metadataCache.getFileCache(f);
    const al = cache && cache.frontmatter ? cache.frontmatter.aliases : null;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string' && al) return al;
    return '';
  }

  formaterAuteurs(familles, annee) {
    familles = (familles || []).filter(Boolean);
    let court = '';
    if (familles.length === 1) court = familles[0];
    else if (familles.length === 2) court = familles[0] + ' et ' + familles[1];
    else if (familles.length >= 3) court = familles[0] + ' et al.';
    return { court, complet: familles.join(', '), annee: annee || '' };
  }

  // Auteurs déduits d'un lien de référence : via les « creators » si la
  // cible en a (source Zotero), sinon via l'analyse du nom « Auteur, Année ».
  auteursDepuisReference(lien, ctx) {
    const cible = String(lien)
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/\|.*$/, '')
      .replace(/#.*$/, '')
      .trim();
    if (!cible) return null;
    const dest = this.app.metadataCache.getFirstLinkpathDest(cible, ctx || '');
    if (dest) {
      const cache = this.app.metadataCache.getFileCache(dest);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm.creators) {
        const creators = (Array.isArray(fm.creators) ? fm.creators : [fm.creators]).map(sansLien);
        const familles = creators
          .map((c) => {
            const s = String(c).trim();
            return s.includes(',') ? s.split(',')[0].trim() : s.split(/\s+/).pop();
          })
          .filter(Boolean);
        const an = String(fm.year || fm.date || '').match(/\d{4}/);
        return this.formaterAuteurs(familles, an ? an[0] : '');
      }
    }
    // Pas de creators : la cible est du type « Auteur(s), Année ».
    const ref = parseNomReference(cible, this.settings);
    if (ref) return { court: ref.auteurComplet, complet: ref.auteurComplet, annee: ref.annee };
    return null;
  }

  // Auteurs de l'annotation : d'abord la référence citée, puis la source.
  auteursAnnotation(cle) {
    const anno = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!anno) return null;
    const cache = this.app.metadataCache.getFileCache(anno);
    const fmA = cache ? cache.frontmatter : null;
    if (!fmA) return null;

    // 1) Référence(s) citée(s) en priorité.
    let refs = fmA['références-citées'];
    if (refs) {
      if (!Array.isArray(refs)) refs = [refs];
      if (refs.length) {
        const r = this.auteursDepuisReference(refs[0], anno.path);
        if (r && r.court) return r;
      }
    }
    // 2) Repli : la source de l'annotation.
    const src = String(fmA['zotflow-source'] || '')
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/\|.*$/, '')
      .trim();
    if (src) {
      const r = this.auteursDepuisReference('[[' + src + ']]', anno.path);
      if (r && r.court) return r;
    }
    return null;
  }

  // Texte de l'aparté, à partir du modèle configurable.
  formatAparte(titre, cle) {
    const vars = { alias: titre, title: titre, key: cle || '', auteur: '', auteurs: '', annee: '' };
    if (/\{\{\s*(auteur|auteurs|annee)\s*\}\}/.test(this.settings.modeleAparte || '')) {
      const a = this.auteursAnnotation(cle);
      if (a) {
        vars.auteur = a.court;
        vars.auteurs = a.complet;
        vars.annee = a.annee;
      }
    }
    let out = appliquerModele(this.settings.modeleAparte || ' ({{alias}})', vars);
    // Retire une parenthèse d'auteurs restée vide (ex. « (, ) » pour les notes
    // conceptuelles, qui n'ont pas d'auteur), sans toucher au reste de l'alias.
    out = out.replace(/\s*\([\s,;]*\)/g, '').replace(/\s+$/, '');
    return out;
  }

  // Applique couleur et taille de l'aparté via des variables CSS globales.
  appliquerStyleAparte() {
    const b = document.body;
    if (!b) return;
    const taille = (this.settings.aparteTaille || '').trim();
    const couleur = (this.settings.aparteCouleur || '').trim();
    if (taille) b.style.setProperty('--zfa-aparte-taille', taille);
    else b.style.removeProperty('--zfa-aparte-taille');
    if (couleur) b.style.setProperty('--zfa-aparte-couleur', couleur);
    else b.style.removeProperty('--zfa-aparte-couleur');
    const police = (this.settings.nomsMonospaceFont || '').trim();
    if (police) b.style.setProperty('--zfa-nom-mono-font', police);
    else b.style.removeProperty('--zfa-nom-mono-font');
  }

  // Commande : retire l'alias affiché des liens d'annotation
  // (« [[clé|Titre]] » -> « [[clé]] »). Ne touche pas les notes d'annotation.
  async retirerAliasLiensAnnotation() {
    const cles = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm['zotflow-anno-key'] !== undefined) cles.add(f.basename);
    }
    if (cles.size === 0) {
      new obsidian.Notice(tr('Aucune annotation trouvée.'));
      return;
    }
    let modifs = 0;
    const re = /(?<!!)\[\[([^\]|#^\n]+)\|[^\]\n]*\]\]/g;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(this.dossierA + '/')) continue;
      const contenu = await this.app.vault.read(f);
      const nouveau = contenu.replace(re, (m, cible) => {
        const t = cible.trim();
        if (cles.has(t)) {
          modifs++;
          return '[[' + t + ']]';
        }
        return m;
      });
      if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
    }
    new obsidian.Notice(tr('Ariane : ') + modifs + ' lien(s) nettoyé(s).');
  }

  //#endregion Ariane · notes & citations — rendu

  //#region Ariane · glisser-déposer & clés d'annotation
  // ── glisser-déposer & clés d'annotation ──────────────────────────────────

  /* ------------- Glisser une annotation sur un paragraphe --------------- */

  // Éditeur CodeMirror situé sous un point de l'écran (quel que soit le
  // volet actif), pour gérer le glisser depuis la base vers la note.
  // Document de l'événement (gère les fenêtres détachées / multi-moniteurs).
  docDeEvenement(e) {
    return (e && e.view && e.view.document) ||
      (e && e.target && e.target.ownerDocument) ||
      document;
  }

  cmSousPoint(x, y, doc) {
    const d = doc || document;
    const el = d.elementFromPoint(x, y);
    const editeur = el && el.closest ? el.closest('.cm-editor') : null;
    if (!editeur) return null;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      const cm = view && view.editor ? view.editor.cm : null;
      if (cm && cm.dom === editeur) return cm;
    }
    return null;
  }

  estAnnotationCle(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest || !dest.path.startsWith(this.dossierA + '/')) return false;
    const cache = this.app.metadataCache.getFileCache(dest);
    const fm = cache ? cache.frontmatter : null;
    return !!(fm && fm['zotflow-anno-key'] !== undefined);
  }

  extraireCleDepuisTexte(text) {
    if (!text) return '';
    const s = String(text).trim();
    const m = s.match(/\[\[([^\]|#\n]+)/);
    return m ? cleDeLien(m[1]) : s.split('\n')[0].trim();
  }

  // Un glisser venu d'un panneau tiers — le chat de Claudian, par exemple —
  // n'est pas un glisser interne d'Obsidian : c'est un glisser HTML natif,
  // dont la charge peut prendre des formes très diverses. On les ramène
  // toutes à un nom de note.
  cleDepuisCharge(brut) {
    if (!brut) return '';
    let s = String(brut).trim().split('\n')[0].trim();
    if (!s) return '';

    // Lien interne, la forme la plus directe.
    const w = s.match(/\[\[([^\]|#\n]+)/);
    if (w) return cleDeLien(w[1]);

    // Lien markdown : on ne garde que la cible.
    const md = s.match(/\]\(([^)]+)\)/);
    if (md) s = md[1].trim();

    // URL Obsidian : le nom de la note est dans le paramètre « file ».
    const ob = s.match(/obsidian:\/\/[^\s]*[?&]file=([^&\s]+)/i);
    if (ob) {
      try { s = decodeURIComponent(ob[1]); } catch (e) { s = ob[1]; }
    } else if (/^app:\/\//i.test(s)) {
      // Forme interne d'Obsidian pour un fichier du coffre.
      try { s = decodeURIComponent(s.replace(/^app:\/\/[^/]*\//i, '')); } catch (e) { /* brut */ }
    } else if (/%[0-9a-f]{2}/i.test(s)) {
      try { s = decodeURIComponent(s); } catch (e) { /* brut */ }
    }

    return s.replace(/^<|>$/g, '')
      .replace(/#.*$/, '')
      .replace(/\|.*$/, '')
      .replace(/\.md$/i, '')
      .trim();
  }

  // Note la cible du lien d'où part le glisser. On interroge « data-href »
  // en premier : c'est la valeur qu'Obsidian et Claudian y inscrivent, non
  // résolue, donc exploitable telle quelle.
  noterSourceGlissee(e) {
    this._sourceGlissee = '';
    const cible = e && e.target;
    if (!cible || typeof cible.closest !== 'function') return;

    let a = cible.closest('a[data-href], a.internal-link, .claudian-file-link');
    // Le glisser peut partir de l'aparté qu'Ariane accole après le lien.
    if (!a) {
      const aparte = cible.closest('.zfa-lien-alias');
      if (aparte && aparte.previousElementSibling) a = aparte.previousElementSibling;
    }
    if (a && typeof a.getAttribute === 'function') {
      this._sourceGlissee = (a.getAttribute('data-href')
        || a.getAttribute('href')
        || a.textContent
        || '').trim();
      return;
    }

    // En édition, une citation déjà posée n'est pas une balise « a » : le lien
    // est rendu sans « data-href », seul l'alias est visible. On lit donc le
    // document sous le point de départ pour y retrouver le « [[…]] » englobant.
    const cle = this.lienSousPoint(e);
    if (!cle) return;
    this._sourceGlissee = cle;

    // Réutiliser une citation, c'est la copier : sans cela l'éditeur la
    // déplacerait, et elle disparaîtrait du paragraphe d'origine. On ne force
    // cet effet que sur une cible réellement citable, pour ne pas altérer le
    // déplacement ordinaire d'un lien quelconque.
    if (e.dataTransfer && this.noteCitable(cle)) {
      try { e.dataTransfer.effectAllowed = 'copy'; } catch (err) { /* selon la source */ }
    }
  }

  // Une note peut-elle servir d'appui : annotation, ou source Zotero ?
  noteCitable(cle) {
    if (!cle) return false;
    for (const c of [cle, String(cle).split('/').pop()]) {
      const f = this.app.metadataCache.getFirstLinkpathDest(c, '');
      if (!f || f.extension !== 'md') continue;
      if (this.settings.dropToutesNotes) return true;
      const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
      if (f.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined) return true;
      if (fm.citationKey !== undefined) return true;
    }
    return false;
  }

  // Cible du lien interne situé sous les coordonnées d'un événement, lue dans
  // le texte source de l'éditeur. Rend '' si le point ne tombe pas dans un lien.
  lienSousPoint(e) {
    if (!e || e.clientX == null) return '';
    let cm = null;
    try {
      cm = this.cmSousPoint(e.clientX, e.clientY, this.docDeEvenement(e));
    } catch (err) { return ''; }
    if (!cm) return '';

    let pos = null;
    try { pos = cm.posAtCoords({ x: e.clientX, y: e.clientY }); } catch (err) { return ''; }
    if (pos == null) return '';

    const ligne = cm.state.doc.lineAt(pos);
    const rel = pos - ligne.from;
    for (const m of ligne.text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      if (rel >= m.index && rel <= m.index + m[0].length) {
        return m[1].split('|')[0].split('#')[0].trim();
      }
    }
    return '';
  }

  // Quand la charge n'est pas un identifiant propre — une sélection de texte,
  // par exemple, où la clé se trouve collée au titre par l'aparté d'Ariane —
  // on y cherche les jetons qui ressemblent à une clé : citekey Zotero
  // « @auteurTitre2014 », ou clé d'annotation en capitales « TG7F24EE ».
  clesCandidates(brut) {
    const s = String(brut || '');
    const out = [];
    const ajouter = (x) => { if (x && out.indexOf(x) === -1) out.push(x); };
    for (const m of s.matchAll(/@[A-Za-zÀ-ÿ0-9_-]{4,}/g)) ajouter(m[0]);
    for (const m of s.matchAll(/\b[A-Z0-9]{6,12}\b/g)) ajouter(m[0]);
    return out;
  }

  // Récupère la clé de l'annotation glissée, en priorité via le
  // gestionnaire de glisser interne d'Obsidian (dragManager), sinon via
  // les données du presse-papier.
  // Toutes les notes markdown portées par un glisser (tâches ou non) :
  // fichier(s) du dragManager d'Obsidian, panier de notes, ou liens [[…]] du
  // presse-papier. Renvoie une liste de basenames, dédoublonnée.
  notesGlissees(e) {
    const noms = new Set();
    const add = (f) => { if (f && f.extension === 'md') noms.add(f.basename); };
    const parNom = (v) => {
      const cible = String(v || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
      if (!cible || cible === 'zfa-panier') return;
      add(this.app.metadataCache.getFirstLinkpathDest(cible, '')
        || this.app.vault.getMarkdownFiles().find((z) => z.basename === cible || z.path === cible));
    };
    if (this.glisseDepuisPanier && Array.isArray(this.panier)) this.panier.forEach(parNom);
    const d = this.app.dragManager && this.app.dragManager.draggable;
    if (d) {
      add(d.file);
      for (const arr of [d.files, d.items]) if (Array.isArray(arr)) arr.forEach(add);
      for (const k of ['linktext', 'link', 'title', 'name']) {
        const s = typeof d[k] === 'string' ? d[k] : '';
        if (s.includes('[[')) for (const m of s.matchAll(/\[\[([^\]|#\n]+)/g)) parNom(m[1]);
        else if (s) parNom(s);
      }
    }
    if (!noms.size && e && e.dataTransfer) {
      const t = e.dataTransfer.getData('text/plain') || '';
      if (t.includes('[[')) for (const m of t.matchAll(/\[\[([^\]|#\n]+)/g)) parNom(m[1]);
      else t.split(/\r?\n/).forEach(parNom);
    }
    return [...noms];
  }

  obtenirCleGlissee(e) {
    const toutes = this.settings.dropToutesNotes;
    // Un fichier est-il acceptable comme appui ? Toute note markdown si
    // « toutes les notes », sinon seulement les annotations.
    const accepteFichier = (f) => {
      if (!f || !f.path || f.extension !== 'md') return false;
      if (toutes) return true;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = (cache ? cache.frontmatter : null) || {};
      // Annotation.
      if (f.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined) return true;
      // Note source : citer un travail sans passer par une annotation reste
      // légitime, et c'est précisément ce qu'on glisse depuis un panneau tiers.
      return fm.citationKey !== undefined;
    };
    const accepteCible = (cible) => {
      if (!cible) return false;
      // La charge peut porter un chemin complet comme un simple nom.
      const essais = [cible, cible.split('/').pop()];
      for (const c of essais) {
        if (accepteFichier(this.app.metadataCache.getFirstLinkpathDest(c, ''))) return true;
      }
      return false;
    };
    const normaliser = (cible) => {
      const essais = [cible, cible.split('/').pop()];
      for (const c of essais) {
        const f = this.app.metadataCache.getFirstLinkpathDest(c, '');
        if (accepteFichier(f)) return f.basename;
      }
      return '';
    };
    const dm = this.app.dragManager;
    const d = dm && dm.draggable;
    if (d) {
      if (accepteFichier(d.file)) return d.file.basename;
      const arr = d.files || d.items;
      if (Array.isArray(arr)) {
        for (const f of arr) if (accepteFichier(f)) return f.basename;
      }
      for (const k of ['linktext', 'link', 'title', 'name']) {
        if (typeof d[k] === 'string') {
          const cible = this.extraireCleDepuisTexte(d[k]);
          if (accepteCible(cible)) return cible;
        }
      }
    }
    // Élément d'origine, retenu au départ du glisser. C'est la seule voie
    // quand la charge est vide, ce qui est le cas depuis un panneau tiers.
    if (this._sourceGlissee) {
      const k = normaliser(this.cleDepuisCharge(this._sourceGlissee));
      if (k) return k;
      for (const jeton of this.clesCandidates(this._sourceGlissee)) {
        const j = normaliser(jeton);
        if (j) return j;
      }
    }

    // Glisser natif : on interroge chaque format proposé, du plus explicite
    // au plus vague. Un panneau tiers ne remplit pas forcément « text/plain ».
    const dt = e && e.dataTransfer;
    if (dt) {
      const formats = ['text/plain', 'text/uri-list', 'text/x-moz-url', 'text/html'];
      const vus = [];
      for (const fmt of formats) {
        let brut = '';
        try { brut = dt.getData(fmt); } catch (err) { brut = ''; }
        if (!brut) continue;
        vus.push(fmt);

        if (fmt === 'text/html') {
          // On tente d'abord les liens du fragment, puis son texte.
          const candidats = [];
          const re = /(?:href|data-href)\s*=\s*["']([^"']+)["']/gi;
          let m;
          while ((m = re.exec(brut)) !== null) candidats.push(m[1]);
          candidats.push(brut.replace(/<[^>]*>/g, ' '));
          for (const c of candidats) {
            const k = normaliser(this.cleDepuisCharge(c));
            if (k) return k;
          }
          for (const jeton of this.clesCandidates(brut)) {
            const k = normaliser(jeton);
            if (k) return k;
          }
          continue;
        }

        for (const ligne of String(brut).split('\n')) {
          const k = normaliser(this.cleDepuisCharge(ligne));
          if (k) return k;
        }
        // La charge entière n'a rien donné : on y cherche une clé isolée.
        for (const jeton of this.clesCandidates(brut)) {
          const k = normaliser(jeton);
          if (k) return k;
        }
      }
      // Aide au diagnostic : sans cela, un dépôt refusé reste muet.
      if (this.settings.dropSignalerRefus !== false) {
        const apercu = this._sourceGlissee || (() => {
          try { return dt.getData('text/plain'); } catch (err) { return ''; }
        })();
        new obsidian.Notice(tr("Dépôt non reconnu : ")
          + (apercu ? '« ' + String(apercu).slice(0, 80) + ' »' : 'charge vide')
          + '. Aucune note du coffre ne correspond.', 6000);
      }
      console.debug('[Ariane] glisser non reconnu. Formats reçus :',
        Array.from(dt.types || []), '| exploités :', vus,
        '| text/plain :', (() => { try { return dt.getData('text/plain'); } catch (err) { return '?'; } })());
    }
    if (d) console.debug('[Ariane] objet glissé non reconnu :', Object.keys(d), d);
    return '';
  }

  // La ligne appartient-elle à un paragraphe de corps (éligible au dépôt) ?
  ligneEstParagraphe(doc, n) {
    if (n < 1 || n > doc.lines) return false;
    const t = doc.line(n).text;
    if (t.trim() === '') return false;
    if (/^#{1,6}\s/.test(t)) return false; // titre
    if (/^\s*\[\^[^\]]+\]:/.test(t)) return false; // définition de note
    if (/^[\t ]/.test(t)) return false; // ligne indentée (continuation)
    if (/^(?:!?\[\[[^\]]*\]\]\s*)+$/.test(t.trim())) return false; // ligne de liens seuls
    // exclure la zone des notes de bas de page (à partir de la 1re définition)
    for (let k = 1; k < n; k++) {
      if (/^\s*\[\^[^\]]+\]:/.test(doc.line(k).text)) return false;
    }
    return true;
  }

  // Rattache une ou plusieurs annotations à la note de bas de page du
  // paragraphe contenant la ligne donnée (création ou complément).
  // Notes concernées par une conversion : on écarte les annotations elles-mêmes
  // et les fiches Zotero, qui ne contiennent pas de rédaction.
  notesConvertibles() {
    const exclus = [this.dossierA + '/', this.dossierR + '/', 'Références/', 'Auteurs/'];
    return this.app.vault.getMarkdownFiles()
      .filter((f) => !exclus.some((d) => f.path.startsWith(d)));
  }

  //#endregion Ariane · glisser-déposer & clés d'annotation

  //#region Ariane · citations repliables
  // ── citations repliables ─────────────────────────────────────────────────

  /* --------------------- Citations repliables ---------------------------- */

  // En lecture, la citation est rendue par un « ( », des liens internes, des
  // « ; » et un « ) ». On enveloppe l'ensemble pour pouvoir le masquer par
  // CSS, en laissant une pastille cliquable à sa place.
  rendreCitationsRepliables(el) {
    if (!this.settings.citationsRepliables) return;
    // Une citation contient forcément un lien interne : en l'absence de tout
    // lien, il est inutile de parcourir les blocs. La grande majorité des
    // paragraphes sort ici, en une seule interrogation du DOM.
    if (!el.querySelector || !el.querySelector('a.internal-link')) return;

    const blocs = el.querySelectorAll('p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6');
    for (const bloc of [el, ...blocs]) {
      if (!bloc.querySelector) continue;
      if (!bloc.querySelector('a.internal-link')) continue;
      if (bloc.querySelector('.zfa-cit')) continue;
      this.envelopperCitations(bloc);
    }
  }

  // Le tableau des enfants devient obsolète dès qu'une citation est
  // enveloppée : on relance donc une passe complète après chaque prise, plutôt
  // que de poursuivre sur une liste périmée. La borne évite toute boucle
  // infinie si un cas imprévu empêchait le repérage d'avancer.
  envelopperCitations(bloc) {
    for (let passe = 0; passe < 50; passe++) {
      if (!this.envelopperUneCitation(bloc)) return;
    }
  }

  envelopperUneCitation(bloc) {
    const enfants = Array.from(bloc.childNodes);
    for (let i = 0; i < enfants.length; i++) {
      const n = enfants[i];
      if (n.nodeType !== Node.TEXT_NODE || !n.nodeValue.endsWith('(')) continue;

      // On avance tant qu'on rencontre des liens internes et des séparateurs.
      let j = i + 1;
      let liens = 0;
      let ferme = null;
      while (j < enfants.length) {
        const suivant = enfants[j];
        if (suivant.nodeType === Node.ELEMENT_NODE
            && suivant.classList && suivant.classList.contains('internal-link')) {
          liens++; j++; continue;
        }
        if (suivant.nodeType === Node.TEXT_NODE) {
          const t = suivant.nodeValue;
          if (/^\s*;\s*$/.test(t)) { j++; continue; }
          if (t.startsWith(')')) { ferme = suivant; break; }
        }
        break;
      }
      if (!liens || !ferme) continue;

      // On coupe les parenthèses des textes qui les portent.
      n.nodeValue = n.nodeValue.slice(0, -1);
      ferme.nodeValue = ferme.nodeValue.slice(1);

      const enveloppe = document.createElement('span');
      enveloppe.className = 'zfa-cit';

      const pastille = document.createElement('span');
      pastille.className = 'zfa-cit-pastille';
      pastille.textContent = String(liens);
      pastille.setAttribute('aria-label', liens > 1
        ? liens + ' références — cliquer pour déplier'
        : 'Une référence — cliquer pour déplier');
      pastille.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        enveloppe.classList.toggle('zfa-cit--ouverte');
      });

      const contenu = document.createElement('span');
      contenu.className = 'zfa-cit-contenu';
      contenu.appendChild(document.createTextNode('('));
      for (let k = i + 1; k < j; k++) contenu.appendChild(enfants[k]);
      contenu.appendChild(document.createTextNode(')'));

      enveloppe.appendChild(pastille);
      enveloppe.appendChild(contenu);
      bloc.insertBefore(enveloppe, ferme);
      return true;
    }
    return false;
  }

  // L'état de repliement se lit sur le corps du document : le mode lecture est
  // ainsi piloté par la seule feuille de style, sans nouveau rendu.
  appliquerEtatCitations() {
    this._citVersion = (this._citVersion || 0) + 1;
    // Même reprise en main côté lecture : une citation dépliée d'un clic porte
    // sa propre exception, qui doit céder devant la commande globale.
    for (const e of document.querySelectorAll('.zfa-cit--ouverte')) {
      e.classList.remove('zfa-cit--ouverte');
    }
    document.body.classList.toggle(
      'zfa-citations-repliees',
      !!(this.settings.citationsRepliables && this.settings.citationsRepliees)
    );
    // En édition, il faut en revanche relancer le calcul des décorations.
    for (const feuille of this.app.workspace.getLeavesOfType('markdown')) {
      const cm = feuille.view && feuille.view.editor && feuille.view.editor.cm;
      if (cm && typeof cm.dispatch === 'function') {
        try { cm.dispatch({}); } catch (e) { /* vue non prête */ }
      }
    }
  }

  // L'affichage est modifié d'abord, l'enregistrement ensuite : attendre
  // l'écriture du fichier de réglages avant de rafraîchir ajoutait un délai
  // perceptible à chaque basculement.
  basculerCitations(replier) {
    this.settings.citationsRepliees = replier;
    // Aucune notification : le changement se voit à l'écran, l'annoncer en
    // plus ne fait qu'encombrer.
    this.appliquerEtatCitations();
    this.saveSettings().catch((e) => console.error('[Ariane] réglages non enregistrés :', e));
  }

  //#endregion Ariane · citations repliables

  //#region Ariane · panier d'annotations & dépôt paragraphe
  // ── panier d'annotations & dépôt paragraphe ──────────────────────────────

  attacherAnnotationParagraphe(cm, lineNumber, cles, insertOffset) {
    cles = (Array.isArray(cles) ? cles : [cles]).filter(Boolean);
    if (!cles.length) return false;
    return this.attacherCitation(cm, lineNumber, cles, insertOffset);
  }

  // Retire dynamiquement les définitions de notes de bas de page orphelines
  // (appel disparu) gérées par le plugin. Déclenché, avec anti-rebond, à
  // chaque modification de l'éditeur.
  nettoyageNotesOrphelines(editor) {
    if (!this.settings.nettoyerNotesOrphelines) return;
    if (!editor || !editor.cm) return;
    const cm = editor.cm;
    const docStr = cm.state.doc.toString();
    const ranges = rangesNotesOrphelines(docStr, this.settings.titreSectionNotes || '');
    if (!ranges.length) return;
    cm.dispatch({ changes: ranges.map((r) => ({ from: r.from, to: r.to })) });
  }

  /* ------------------------------ Événements DnD ------------------------- */

  surDragOverParagraphe(e) {
    if (!this.settings.dropSurParagraphe) return;
    const doc = this.docDeEvenement(e);
    const cm = this.cmSousPoint(e.clientX, e.clientY, doc);
    if (!cm) { this.nettoyerZoneDrop(); return; }
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null || !this.ligneEstParagraphe(cm.state.doc, cm.state.doc.lineAt(pos).number)) {
      this.nettoyerZoneDrop();
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    // Sur le texte -> mode phrase ; dans la marge gauche du paragraphe -> mode paragraphe.
    if (this.modeDrop(e, doc) === 'phrase' && this.effetPhrase) {
      this.surlignerPhrase(cm, pos);
      return;
    }
    this.effacerSurlignagePhrase();
    const ligneDom = this.ligneDomPour(cm, cm.state.doc.lineAt(pos).from);
    if (ligneDom && ligneDom !== this.zoneDrop) {
      if (this.zoneDrop) this.zoneDrop.classList.remove('zfa-drop-cible');
      ligneDom.classList.add('zfa-drop-cible');
      this.zoneDrop = ligneDom;
    }
  }

  // Détermine le mode de dépôt selon la position du survol : sur le texte
  // (au-dessus d'une .cm-line) -> « phrase » ; dans la marge gauche -> « paragraphe ».
  modeDrop(e, doc) {
    const el = doc.elementFromPoint(e.clientX, e.clientY);
    const surTexte = el && el.closest && el.closest('.cm-line');
    return surTexte ? 'phrase' : 'paragraphe';
  }

  // Retrouve l'élément .cm-line correspondant à une position, même quand le
  // survol a lieu dans la marge (hors de tout .cm-line sous le curseur).
  ligneDomPour(cm, pos) {
    try {
      const d = cm.domAtPos(pos);
      let n = d && d.node;
      if (n && n.nodeType === 3) n = n.parentElement;
      return n && n.closest ? n.closest('.cm-line') : null;
    } catch (e) {
      return null;
    }
  }

  // Surligne, via une décoration CodeMirror, la phrase visée sous le point de dépôt.
  surlignerPhrase(cm, pos) {
    const ligne = cm.state.doc.lineAt(pos);
    const localOff = pos - ligne.from;
    const from = ligne.from + debutPhrase(ligne.text, localOff);
    const to = ligne.from + finDePhrase(ligne.text, localOff);
    // Retire un éventuel surlignage de paragraphe hérité.
    if (this.zoneDrop) { this.zoneDrop.classList.remove('zfa-drop-cible'); this.zoneDrop = null; }
    if (to <= from) { this.effacerSurlignagePhrase(); return; }
    if (this.cmPhrase && this.cmPhrase !== cm) this.effacerSurlignagePhrase();
    if (this.cmPhrase === cm && this.phraseRange && this.phraseRange.from === from && this.phraseRange.to === to) return;
    this.cmPhrase = cm;
    this.phraseRange = { from, to };
    try { cm.dispatch({ effects: this.effetPhrase.of({ from, to }) }); } catch (e) { /* silencieux */ }
  }

  effacerSurlignagePhrase() {
    if (this.cmPhrase && this.effetPhrase) {
      try { this.cmPhrase.dispatch({ effects: this.effetPhrase.of(null) }); } catch (e) { /* silencieux */ }
    }
    this.cmPhrase = null;
    this.phraseRange = null;
  }

  surDropParagraphe(e) {
    if (!this.settings.dropSurParagraphe) return;
    const doc = this.docDeEvenement(e);
    const cm = this.cmSousPoint(e.clientX, e.clientY, doc);
    if (!cm) { this.nettoyerZoneDrop(); return; }
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) { this.nettoyerZoneDrop(); return; }
    const n = cm.state.doc.lineAt(pos).number;
    if (!this.ligneEstParagraphe(cm.state.doc, n)) { this.nettoyerZoneDrop(); return; }
    // Dépôt groupé depuis le panier flottant, sinon annotation unique glissée.
    let cles;
    if (this.glisseDepuisPanier && this.panier && this.panier.length) {
      cles = this.panier.slice();
    } else {
      const cle = this.obtenirCleGlissee(e);
      if (!cle) { this.nettoyerZoneDrop(); return; }
      cles = [cle];
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    // Dépôt sur le texte -> fin de la phrase visée ; dans la marge -> paragraphe.
    let insertOffset;
    if (this.modeDrop(e, doc) === 'phrase') {
      const ligne = cm.state.doc.lineAt(pos);
      insertOffset = ligne.from + finDePhraseAvantPonct(ligne.text, pos - ligne.from);
    }
    this.attacherAnnotationParagraphe(cm, n, cles, insertOffset);
    this.nettoyerZoneDrop();
  }

  nettoyerZoneDrop() {
    if (this.zoneDrop) {
      this.zoneDrop.classList.remove('zfa-drop-cible');
      this.zoneDrop = null;
    }
    this.effacerSurlignagePhrase();
  }

  /* --------------------------- Panier flottant --------------------------- */

  basculerPanier() {
    if (this.panierEl) this.fermerPanier();
    else this.creerPanier();
  }

  fermerPanier() {
    if (this.panierEl) {
      this.panierEl.remove();
      this.panierEl = null;
      this.panierListe = null;
    }
  }

  creerPanier() {
    const el = document.createElement('div');
    el.className = 'zfa-panier';
    el.style.top = '80px';
    el.style.right = '30px';

    const header = el.createDiv({ cls: 'zfa-panier-header' });
    this.panierTitre = header.createSpan({ cls: 'zfa-panier-titre', text: tr("Panier de notes") });
    const fermer = header.createSpan({ cls: 'zfa-panier-fermer', text: tr('✕') });
    fermer.onclick = () => this.fermerPanier();

    this.panierListe = el.createDiv({ cls: 'zfa-panier-liste' });

    const pied = el.createDiv({ cls: 'zfa-panier-pied' });
    const poignee = pied.createDiv({ cls: 'zfa-panier-deposer', text: tr('⇱ Glisser sur un paragraphe') });
    poignee.setAttribute('draggable', 'true');
    poignee.addEventListener('dragstart', (e) => {
      this.glisseDepuisPanier = true;
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', 'zfa-panier');
        e.dataTransfer.effectAllowed = 'copy';
      }
    });
    poignee.addEventListener('dragend', () => { this.glisseDepuisPanier = false; });

    const btns = pied.createDiv({ cls: 'zfa-panier-boutons' });
    const bDep = btns.createEl('button', { cls: 'zfa-panier-btn', text: tr('Déposer sur le curseur') });
    bDep.onclick = () => this.deposerPanierSurCurseur();
    const bVide = btns.createEl('button', { cls: 'zfa-panier-btn', text: tr('Vider') });
    bVide.onclick = () => this.viderPanier();

    this.rendreDeplacable(el, header);

    // Recevoir des notes / tâches glissées dans le panier (une ou plusieurs).
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (!this.glisseDepuisPanier) el.classList.add('zfa-panier-survol');
    });
    el.addEventListener('dragleave', () => el.classList.remove('zfa-panier-survol'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('zfa-panier-survol');
      if (this.glisseDepuisPanier) return; // ne pas s'auto-recevoir
      const noms = this.notesGlissees(e);
      if (noms.length) {
        e.preventDefault();
        e.stopPropagation();
        for (const n of noms) this.ajouterAuPanier(n);
      }
    });

    document.body.appendChild(el);
    this.panierEl = el;
    this.rendrePanier();
  }

  rendreDeplacable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, actif = false;
    const surMouvement = (e) => {
      if (!actif) return;
      el.style.left = (ox + e.clientX - sx) + 'px';
      el.style.top = (oy + e.clientY - sy) + 'px';
      el.style.right = 'auto';
    };
    const surRelache = () => {
      actif = false;
      document.removeEventListener('mousemove', surMouvement);
      document.removeEventListener('mouseup', surRelache);
    };
    handle.addEventListener('mousedown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('zfa-panier-fermer')) return;
      const rect = el.getBoundingClientRect();
      ox = rect.left; oy = rect.top; sx = e.clientX; sy = e.clientY;
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.right = 'auto';
      actif = true;
      document.addEventListener('mousemove', surMouvement);
      document.addEventListener('mouseup', surRelache);
      e.preventDefault();
    });
  }

  ajouterAuPanier(cle) {
    if (!this.panier.includes(cle)) this.panier.push(cle);
    this.rendrePanier();
  }

  retirerDuPanier(cle) {
    this.panier = this.panier.filter((c) => c !== cle);
    this.rendrePanier();
  }

  viderPanier() {
    this.panier = [];
    this.rendrePanier();
  }

  rendrePanier() {
    if (this.panierTitre) {
      this.panierTitre.textContent = tr("Panier de notes") + " (" + this.panier.length + ")";
    }
    if (!this.panierListe) return;
    this.panierListe.empty();
    if (!this.panier.length) {
      this.panierListe.createDiv({ cls: 'zfa-panier-vide', text: tr("Glissez des notes ici…") });
      return;
    }
    for (const cle of this.panier) {
      const item = this.panierListe.createDiv({ cls: 'zfa-panier-item' });
      const titre = this.titreAnnotationCiblee(cle, '') || cle;
      item.createSpan({ cls: 'zfa-panier-item-txt', text: titre });
      const x = item.createSpan({ cls: 'zfa-panier-item-x', text: tr('✕') });
      x.onclick = () => this.retirerDuPanier(cle);
    }
  }

  deposerPanierSurCurseur() {
    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view || !view.editor || !view.editor.cm) {
      new obsidian.Notice(tr('Ouvrez une note en mode édition.'));
      return;
    }
    if (!this.panier.length) {
      new obsidian.Notice(tr('Le panier est vide.'));
      return;
    }
    const cm = view.editor.cm;
    const n = view.editor.getCursor().line + 1;
    if (!this.ligneEstParagraphe(cm.state.doc, n)) {
      new obsidian.Notice(tr('Placez le curseur dans un paragraphe.'));
      return;
    }
    this.attacherAnnotationParagraphe(cm, n, this.panier.slice());
    new obsidian.Notice(this.panier.length + ' annotation(s) déposée(s) en note de bas de page.');
  }

  /* ------------- Tag « orpheline » (annotations à 0 appel) --------------- */

  // Ajoute ou retire le tag orpheline dans l'entête, sans toucher au corps.
  async appliquerTagOrpheline(file, orpheline) {
    const tag = this.settings.tagOrpheline || 'orphelin';
    this.marquerEcriture(file.path);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      let tags = fm.tags;
      if (Array.isArray(tags)) { /* garder */ }
      else if (typeof tags === 'string' && tags.trim()) tags = [tags];
      else tags = [];
      tags = tags.filter((t) => String(t).replace(/^#/, '') !== tag);
      if (orpheline) tags.push(tag);
      if (tags.length) fm.tags = tags;
      else delete fm.tags;
    });
  }

  // Met à jour le tag orpheline sur toutes les annotations selon leur
  // nombre d'appels (notes distinctes qui les citent).
  async synchroniserTagsOrphelines() {
    if (!this.settings.marquerOrphelines) return;
    const tag = this.settings.tagOrpheline || 'orphelin';
    const resolved = this.app.metadataCache.resolvedLinks || {};
    const counts = new Map();
    for (const source in resolved) {
      for (const cible in resolved[source]) {
        if (cible === source) continue;
        counts.set(cible, (counts.get(cible) || 0) + 1);
      }
    }
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-anno-key'] === undefined) continue;
      const orpheline = (counts.get(f.path) || 0) === 0;
      let present = false;
      const tg = fm.tags;
      if (Array.isArray(tg)) present = tg.some((t) => String(t).replace(/^#/, '') === tag);
      else if (typeof tg === 'string') present = tg.replace(/^#/, '') === tag;
      if (orpheline !== present) await this.appliquerTagOrpheline(f, orpheline);
    }
  }

  async retirerTousTagsOrphelines() {
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-anno-key'] === undefined) continue;
      await this.appliquerTagOrpheline(f, false);
    }
  }

  //#endregion Ariane · panier d'annotations & dépôt paragraphe
};
