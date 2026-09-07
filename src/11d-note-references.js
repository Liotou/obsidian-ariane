
// ── avecNoteReferences ────────────────────────────────────────────────────
// Phase 2 : ariane-note.
// Reconnaissance des références citées, index Zotero, routage par famille, et
// la file des références en attente de rattachement.
const avecNoteReferences = (Base) => class extends Base {
  //#region Ariane · static · références
  // ── static · références ──────────────────────────────────────────────────

  // Deux formes ont coexisté dans le cache : les tableaux « reference » bruts de
  // Crossref, et la forme d'Ariane { auteurs, annee, titre, doi, brut }. On
  // convertit à la lecture, pour n'en manipuler qu'une seule ensuite.
  static normaliserEntree(e) {
    if (!e || typeof e !== 'object') return null;
    if (Array.isArray(e.auteurs) || e.annee !== undefined) return e; // déjà normalisée
    const brut = String(e.unstructured || '').trim();
    const decoupe = e._ariane || null;
    const auteur = String(e.author || '').trim();
    const auteurs = decoupe && decoupe.auteurs && decoupe.auteurs.length
      ? decoupe.auteurs
      : (auteur ? auteur.split(/[^\p{L}\p{M}'-]+/u).filter((x) => x.length > 1) : []);
    return {
      auteurs,
      annee: String(e.year || (decoupe && decoupe.annee) || '').trim(),
      titre: String(e['article-title'] || e['volume-title'] || (decoupe && decoupe.titre) || '').trim(),
      revue: String(e['journal-title'] || (decoupe && decoupe.revue) || '').trim(),
      doi: normDoi(e.DOI),
      brut,
    };
  }

  static normaliserBiblio(liste) {
    return (liste || []).map((e) => Ariane.normaliserEntree(e)).filter(Boolean);
  }

  // Une entrée de bibliographie porte le nom SUIVI d'initiales, « March, S. T.
  // (1995) », ce qu'un appel en cours de texte n'écrit jamais : « (March and
  // Smith 1995) ». C'est ce discriminant qui distingue les deux, et il est
  // fiable — vérifié sur huit références d'un même ouvrage.
  static entreeDansTexte(texte, nomFamille, annee) {
    if (!texte || !nomFamille || !annee) return null;
    let motif;
    try {
      motif = new RegExp(echapperRegex(nomFamille)
        + ',\\s*(?:[A-Z]\\.\\s*){1,4}[^\\n]{0,120}?\\b' + annee + '\\b[^\\n]{0,320}', 'g');
    } catch (e) { return null; }
    let brut = null;
    let m;
    while ((m = motif.exec(texte)) !== null) {
      const s = m[0].replace(/\s+/g, ' ').trim();
      if (!brut || s.length > brut.length) brut = s;
    }
    if (!brut) return null;
    // Couper à l'entrée suivante, qui commence par « Nom, X. ».
    const suivante = /\s(?:[A-Z][\wÀ-ÿ'’-]+(?:\s[A-Z][\wÀ-ÿ'’-]+)?,\s*(?:[A-Z]\.\s*){1,4})/;
    const apres = brut.indexOf(annee) + annee.length;
    const d = suivante.exec(brut.slice(apres));
    if (d) brut = brut.slice(0, apres + d.index).trim();
    let titre = '';
    const mt = new RegExp(annee + '\\)?\\s*[.,]\\s*(.+?)(?:\\.\\s|\\.$)').exec(brut);
    if (mt) titre = mt[1].trim();
    return { brut, titre };
  }

// Deux entrées désignent le même travail quand l'une des deux commence ou
  // contient l'autre au-delà de douze caractères : « Co-opetition » et
  // « Co‐opetition: A revolutionary mindset… », « Designing interactive
  // strategy » et « From value chain… designing interactive strategy ». Deux
  // DOI distincts restent deux œuvres, quel que soit le titre.
  static fondreOeuvresProches(liste) {
    const clef = (t) => sansAccents(t || '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const out = [];
    for (const o of liste) {
      const ko = clef(o.titre);
      const jumeau = out.find((x) => {
        if (x.doi && o.doi) return x.doi === o.doi;
        if (x.doi !== o.doi && (x.doi || o.doi)) return false;
        const kx = clef(x.titre);
        if (!ko || !kx) return false;
        const court = ko.length < kx.length ? ko : kx;
        const long = ko.length < kx.length ? kx : ko;
        if (court.length >= 12 && long.includes(court)) return true;
        // Un mot d'écart ne fait pas deux œuvres : « Design science in
        // information systems research » et « Design research in information
        // systems research » sortent du même PDF, à une coquille près.
        const a = new Set(court.split(' ').filter((w) => w.length > 2));
        const b = new Set(long.split(' ').filter((w) => w.length > 2));
        if (a.size < 3 || b.size < 3) return false;
        let communs = 0;
        for (const w of a) if (b.has(w)) communs += 1;
        return communs / Math.max(a.size, b.size) >= 0.75;
      });
      if (!jumeau) { out.push(o); continue; }
      jumeau.n += o.n;
      for (const sr of o.sources) if (!jumeau.sources.includes(sr)) jumeau.sources.push(sr);
      if ((o.titre || '').length > (jumeau.titre || '').length) jumeau.titre = o.titre;
      if (!jumeau.doi && o.doi) jumeau.doi = o.doi;
    }
    return out;
  }

  // Le modèle rend parfois « {"annee":["2012"]} » au lieu d'une chaîne : on
  // accepte les deux plutôt que de perdre l'extraction sur une vétille.
  static premier(v) {
    if (Array.isArray(v)) return v.length ? String(v[0]).trim() : '';
    return String(v == null ? '' : v).trim();
  }

  // Moteur de gabarit à jetons, partagé par la référence de tâche et le titre
  // du rappel Apple. `{n}` → vars.n ; `{n:3}` → vars.n complété de zéros à
  // gauche sur 3 chiffres (au moins) ; `{clé}` → vars.clé si défini, sinon le
  // jeton reste verbatim ; le reste est littéral.
  static formatModele(modele, vars) {
    const v = vars || {};
    return String(modele == null ? '' : modele).replace(
      /\{(\w+)(?::(\d+))?\}/g,
      (jeton, cle, largeur) => {
        if (cle === 'n' && v.n != null) {
          const s = String(Math.trunc(Number(v.n)) || 0);
          return largeur ? s.padStart(Number(largeur), '0') : s;
        }
        return v[cle] != null ? String(v[cle]) : jeton;
      });
  }

  // Décompose un gabarit de référence en { prefixe, suffixe, largeur } autour de
  // son unique jeton `{n}` / `{n:W}`. Rend null si le jeton manque ou apparaît
  // plus d'une fois (gabarit refusé).
  static analyserGabaritRef(gabarit) {
    const g = String(gabarit == null ? '' : gabarit);
    const re = /\{n(?::(\d+))?\}/g;
    const trouves = [...g.matchAll(re)];
    if (trouves.length !== 1) return null;
    const m = trouves[0];
    return {
      prefixe: g.slice(0, m.index),
      suffixe: g.slice(m.index + m[0].length),
      largeur: m[1] ? Number(m[1]) : 1,
    };
  }

  // Référence d'une tâche : un compteur incrémental habillé par `gabarit`
  // (défaut « T-{n:3} » → T-001). Le rang ne réemploie jamais un numéro libéré ;
  // une référence est définitive, deux tâches distinctes ne portent jamais le
  // même nom. Le plus grand rang déjà pris est cherché à la fois sur le gabarit
  // courant ET sur la forme héritée « T26-041 » (seule forme jamais produite
  // avant) : un coffre déjà numéroté continue sa série au lieu de repartir à 1.
  static referenceTacheSuivante(noms, gabarit) {
    const spec = Ariane.analyserGabaritRef(gabarit) || { prefixe: 'T-', suffixe: '', largeur: 3 };
    const reExact = new RegExp(
      '^' + Ariane._echapRe(spec.prefixe) + '(\\d+)' + Ariane._echapRe(spec.suffixe) + '$');
    const reHerite = /^T\d{2}-(\d+)$/;
    let max = 0;
    for (const nom of noms || []) {
      if (typeof nom !== 'string') continue;
      const m = nom.match(reExact) || nom.match(reHerite);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return spec.prefixe + String(max + 1).padStart(spec.largeur, '0') + spec.suffixe;
  }

  static _echapRe(s) {
    return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Incrémente les derniers chiffres d'une référence en gardant leur largeur
  // (« T-007 » → « T-008 », « TASK9 » → « TASK10 »). Sans chiffres, suffixe -2.
  static incrementerRef(ref) {
    const r = String(ref == null ? '' : ref);
    if (!/\d(?!.*\d)/.test(r)) return r + '-2';
    return r.replace(/(\d+)(?!.*\d)/, (d) => String(parseInt(d, 10) + 1).padStart(d.length, '0'));
  }

  // Cherche dans `texte` (un titre de rappel Apple) la référence d'une tâche
  // connue (`refs` : Set de réfs), sans supposer de forme : d'abord un jeton
  // entre crochets, puis n'importe quelle réf (longueur ≥ 3) en sous-chaîne.
  // Rend la réf trouvée ou ''.
  static refDansTexte(texte, refs) {
    const s = String(texte == null ? '' : texte);
    const jeu = refs instanceof Set ? refs : new Set(refs || []);
    const crochet = s.match(/\[([^\]]+)\]/);
    if (crochet && jeu.has(crochet[1].trim())) return crochet[1].trim();
    let trouve = '';
    for (const r of jeu) {
      if (typeof r === 'string' && r.length >= 3 && s.includes(r) && r.length > trouve.length) {
        trouve = r;
      }
    }
    return trouve;
  }

  // Un chemin est-il dans l'un des dossiers listés (ou un de leurs
  // sous-dossiers) ? Les entrées sont normalisées (sans / de tête/queue).
  static sousDossier(chemin, dossiers) {
    const p = String(chemin || '');
    for (let d of dossiers || []) {
      d = String(d || '').trim().replace(/^\/+|\/+$/g, '');
      if (!d) continue;
      if (p === d || p.startsWith(d + '/')) return true;
    }
    return false;
  }

  // Décrit ce qu'il faut ajouter à un fichier .base (objet déjà analysé) pour
  // que les colonnes de tâche s'affichent sans le préfixe : un `displayName`
  // dépréfixé pour chaque propriété préfixée citée qui n'en a pas déjà un.
  // Ne propose jamais d'écraser un displayName choisi à la main.
  static planHarmonisationBase(base, prefixe) {
    const pre = String(prefixe || '');
    const vide = { ajouts: [] };
    if (!pre || !base || typeof base !== 'object') return vide;
    const cites = new Set();
    const noter = (n) => {
      if (typeof n !== 'string') return;
      const brut = n.startsWith('note.') ? n.slice(5) : n;
      if (brut.length > pre.length && brut.startsWith(pre)) cites.add(brut);
    };
    const scan = (v) => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v.order)) v.order.forEach(noter);
      if (Array.isArray(v.sort)) v.sort.forEach((s) => noter(s && s.property));
      if (v.groupBy) noter(v.groupBy.property);
      for (const k of Object.keys(v.columnSize || {})) noter(k);
      for (const k of Object.keys(v.properties || {})) noter(k);
    };
    scan(base);
    if (Array.isArray(base.views)) base.views.forEach(scan);
    if (!cites.size) return vide;
    const props = (base.properties && typeof base.properties === 'object') ? base.properties : {};
    const aDejaNom = (brut) => {
      const e = props['note.' + brut] || props[brut];
      return !!(e && typeof e === 'object'
        && typeof e.displayName === 'string' && e.displayName.trim());
    };
    const ajouts = [];
    for (const brut of cites) {
      if (aDejaNom(brut)) continue;
      ajouts.push({ cle: 'note.' + brut, nom: brut.slice(pre.length) });
    }
    return { ajouts };
  }

  // Insère (ou complète) le bloc `properties:` de niveau racine dans le TEXTE
  // d'un .base sans re-sérialiser le reste : on préserve tel quel les chaînes
  // fragiles (p. ex. arianeArtPlan, que stringifyYaml couperait sur 80 col).
  static insererProprietesBase(texte, ajouts) {
    if (!ajouts || !ajouts.length) return texte;
    const eol = texte.includes('\r\n') ? '\r\n' : '\n';
    const lignes = texte.split(/\r?\n/);
    const entrees = [];
    for (const a of ajouts) {
      entrees.push('  ' + JSON.stringify(a.cle) + ':');
      entrees.push('    displayName: ' + JSON.stringify(a.nom));
    }
    const iProps = lignes.findIndex((l) => /^properties:[ \t]*$/.test(l));
    if (iProps !== -1) {
      let fin = iProps + 1;
      while (fin < lignes.length && (lignes[fin] === '' || /^[ \t]/.test(lignes[fin]))) fin++;
      lignes.splice(fin, 0, ...entrees);
      return lignes.join(eol);
    }
    // Un `properties:` en ligne (« properties: {} ») : on n'ose pas créer un
    // second bloc (clé dupliquée). On laisse le fichier tel quel.
    if (lignes.some((l) => /^properties:/.test(l))) return texte;
    const bloc = ['properties:', ...entrees];
    const iViews = lignes.findIndex((l) => /^views:[ \t]*$/.test(l));
    if (iViews !== -1) {
      lignes.splice(iViews, 0, ...bloc);
    } else {
      if (lignes.length && lignes[lignes.length - 1] !== '') lignes.push('');
      lignes.push(...bloc);
    }
    return lignes.join(eol);
  }

  // Icône (nom lucide) d'un concept de tâche — la même variété que le
  // formulaire de création. Défaut « tag » pour l'inconnu.
  static iconeConcept(concept) {
    const d = Ariane.PROPS_GENERIQUES.find((p) => p.cle === concept);
    if (d) return d.icone;
    return ({
      'bloque-par': 'ban', 'termine-le': 'calendar-check', source: 'book-marked',
      livrable: 'package', fichier: 'file', liste: 'list-checks', 'rappel-id': 'bell',
    })[concept] || 'tag';
  }

  // Nom de fichier encore générique (« Sans titre », « Untitled 3 ») : c'est
  // qu'Obsidian l'a créé sans que l'utilisateur le nomme. On peut alors lui
  // attribuer une référence. Un nom choisi (même s'il commence par ces mots)
  // est respecté.
  static estNomTacheGenerique(nom) {
    return /^(sans titre|untitled)( \d+)?$/i.test(String(nom || '').trim());
  }

  //#endregion Ariane · static · références

  //#region Ariane · index Zotero
  // ── index Zotero ─────────────────────────────────────────────────────────

  /* ------------------------------ Index Zotero ------------------------------ */

  // Construit une entrée d'index Zotero à partir du frontmatter d'un fichier.
  // Renvoie toujours un objet ; « citkey » vide = ce n'est pas une source Zotero.
  entreeIndex(file) {
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const citkey = fm.citationKey || (file.basename.startsWith('@') ? file.basename.slice(1) : '');
    const creators = fm.creators
      ? (Array.isArray(fm.creators) ? fm.creators : [fm.creators]).map(sansLien)
      : [];
    const surnames = creators
      .map((c) => sansAccents(String(c).trim().split(/\s+/).pop()))
      .filter((x) => x.length > 0);
    const anneeMatch = String(fm.year || fm.date || '').match(/\d{4}/);
    const creatorsFull = [];
    for (const c of creators) {
      const nom = nomCompletAuteur(c);
      if (nom && !creatorsFull.includes(nom)) creatorsFull.push(nom);
    }
    return {
      basename: file.basename,
      citkey,
      premier: surnames[0] || '',
      surnames,
      creatorsFull,
      titre: fm.title || '',
      doi: normDoi(fm.doi),
      annee: anneeMatch ? anneeMatch[0] : '',
    };
  }

  construireIndexZotero() {
    const idx = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const e = this.entreeIndex(file);
      if (e.citkey) idx.push(e);
    }
    return idx;
  }

  estSourceZoteroFrontmatter(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache ? cache.frontmatter : null;
    return !!((fm && fm.citationKey) || file.basename.startsWith('@'));
  }

  //#endregion Ariane · index Zotero

  //#region Ariane · lecteurs ZotFlow & liens Zotero
  // ── lecteurs ZotFlow & liens Zotero ──────────────────────────────────────

  /* --------------------- Notes de lecture (notes-filles) ---------------- */

  // Table clé Zotero -> clé de citation, bâtie sur les fiches sources. Elle
  // permet de rendre à une citation de note-fille sa forme d'Ariane.
  indexParCleZotero() {
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.citationKey && fm['zotero-key']) {
        m.set(String(fm['zotero-key']).trim(), '@' + String(fm.citationKey).trim());
      }
    }
    return m;
  }

  // Atomise les notes-filles d'une fiche source : une note par bloc, dans le
  // dossier des notes de lecture. Le lien vers la source suffit à la
  // réciprocité — Obsidian tient les rétroliens.
  async atomiserNotesLecture(fichierSource, parCleZotero) {
    if (this.settings.atomiserNotesLecture === false) return 0;
    const fm = (this.app.metadataCache.getFileCache(fichierSource) || {}).frontmatter || {};
    if (!fm.citationKey) return 0;
    const exclues = (this.settings.sourcesExclues || [])
      .map((x) => String(x).trim().replace(/^@/, '')).filter(Boolean);
    if (exclues.includes(String(fm.citationKey).trim())) return 0;
    const contenu = await this.app.vault.cachedRead(fichierSource);
    const blocs = extraireNotesFilles(contenu);
    if (!blocs.length) return 0;

    const table = parCleZotero || this.indexParCleZotero();
    const racine = this.settings.dossierNotesLecture || '2 - Notes de lecture';
    const dossier = racine + '/' + fichierSource.basename;
    await this.assurerDossier(racine);
    await this.assurerDossier(dossier);

    let faits = 0;
    for (const bloc of blocs) {
      const chemin = dossier + '/' + bloc.cle + '.md';
      const existant = this.app.vault.getAbstractFileByPath(chemin);
      if (existant) {
        const fmx = (this.app.metadataCache.getFileCache(existant) || {}).frontmatter || {};
        if (fmx['zotflow-locked'] === false || fmx.locked === true) continue; // note reprise à la main
      }
      const corps = citationsZotflowVersAriane(bloc.corps, table);
      const entete = [
        '---',
        'aliases:',
        '  - ' + JSON.stringify(bloc.titre || bloc.cle),
        'cssclasses:',
        '  - note-de-lecture',
        'zotflow-note-key: ' + bloc.cle,
        'zotflow-source: "[[' + fichierSource.basename + ']]"',
        'type: lecture',
        'zotflow-auto: true',
        '---',
        '',
      ].join('\n');
      await this.ecrire(chemin, entete + corps + '\n', existant || null);
      faits += 1;
    }
    return faits;
  }

  // Passe sur toutes les fiches sources. L'index des clés Zotero n'est bâti
  // qu'une fois : le refaire par source coûterait 736 lectures à chaque tour.
  async atomiserToutesNotesLecture() {
    const table = this.indexParCleZotero();
    let sources = 0, notes = 0;
    const notice = new obsidian.Notice(tr('Notes de lecture : atomisation…'), 0);
    try {
      for (const f of this.app.vault.getMarkdownFiles()) {
        const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        if (!fm.citationKey) continue;
        const n = await this.atomiserNotesLecture(f, table);
        if (n) { sources += 1; notes += n; }
      }
    } finally {
      notice.hide();
    }
    new obsidian.Notice(tr('Notes de lecture : ') + notes + ' note(s) depuis ' + sources + ' source(s).');
    return notes;
  }

  /* ----------------------- Retour vers Zotero --------------------------- */

  // Les deux vues de lecture de zotflow. Leur état de feuille porte, tel quel,
  // { libraryID, itemKey } — et cette clé est celle de la PIÈCE JOINTE, la
  // même que Zotero attend. Aucun détour par la fiche source n'est nécessaire.
  estLecteurZotflow(vue) {
    if (!vue || typeof vue.getViewType !== 'function') return false;
    const t = vue.getViewType();
    return t === 'zotflow-zotero-reader-view' || t === 'zotflow-local-zotero-reader-view';
  }

  cibleLecteurZotflow(feuille) {
    if (!feuille || typeof feuille.getViewState !== 'function') return null;
    let etat = null;
    try { etat = (feuille.getViewState() || {}).state || null; } catch (e) { return null; }
    if (!etat || !etat.itemKey) return null;
    return { libraryID: etat.libraryID, itemKey: String(etat.itemKey) };
  }

  // La page en cours. On tente d'abord la vue vivante — sans rien supposer de
  // sa structure interne, qui appartient à zotflow — puis on se rabat sur
  // l'état que zotflow persiste dans ses réglages.
  async pageDuLecteur(vue, cible) {
    const sonder = (o, profondeur) => {
      if (!o || typeof o !== 'object' || profondeur > 3) return null;
      const p = o.primaryViewState;
      if (p && typeof p.pageIndex === 'number') return p.pageIndex;
      if (typeof o.pageIndex === 'number') return o.pageIndex;
      for (const cle of ['state', 'reader', 'viewer', 'viewState', '_state']) {
        const v = sonder(o[cle], profondeur + 1);
        if (v !== null) return v;
      }
      return null;
    };
    let idx = null;
    try { idx = sonder(vue, 0); } catch (e) { idx = null; }
    if (idx === null && cible) {
      try {
        const chemin = this.manifest.dir.replace(/[^/]+$/, 'zotflow') + '/data.json';
        if (await this.app.vault.adapter.exists(chemin)) {
          const d = JSON.parse(await this.app.vault.adapter.read(chemin));
          const e = (d.viewStates || {})[cible.libraryID + ':' + cible.itemKey];
          const p = e && e.primaryViewState;
          if (p && typeof p.pageIndex === 'number') idx = p.pageIndex;
        }
      } catch (e) { /* réglages de zotflow illisibles : on ouvrira sans page */ }
    }
    return (typeof idx === 'number' && idx >= 0) ? idx + 1 : null;   // pageIndex est à base zéro
  }

  async ouvrirLecteurDansZotero(feuille) {
    const f = feuille || this.app.workspace.activeLeaf;
    const cible = this.cibleLecteurZotflow(f);
    if (!cible) { new obsidian.Notice(tr("Ce n'est pas un lecteur ZotFlow.")); return; }
    const page = await this.pageDuLecteur(f ? f.view : null, cible);
    const uri = 'zotero://open-pdf/library/items/' + cible.itemKey
      + (page ? '?page=' + page : '');
    try {
      window.open(uri);
      console.log('[Ariane] Zotero —', uri);
    } catch (e) {
      new obsidian.Notice(tr('Ouverture dans Zotero impossible : ') + (e && e.message ? e.message : e));
    }
  }

  // Un bouton dans la barre d'actions du lecteur. On parcourt TOUTES les
  // feuilles, y compris celles des fenêtres détachées : trois fonctionnalités
  // se sont déjà cassées pour n'avoir couvert que la fenêtre principale.
  decorerLecteursZotflow() {
    this.app.workspace.iterateAllLeaves((feuille) => {
      const vue = feuille ? feuille.view : null;
      if (!this.estLecteurZotflow(vue)) return;
      if (vue._arianeBoutonZotero) return;
      if (typeof vue.addAction !== 'function') return;   // zotflow a changé : on n'insiste pas
      try {
        vue.addAction('external-link', 'Ouvrir dans Zotero (même page)',
          () => this.ouvrirLecteurDansZotero(feuille));
        vue._arianeBoutonZotero = true;
      } catch (e) { console.debug('[Ariane] bouton Zotero non posé', e); }
    });
  }

  // La fiche source de zotflow porte ses pièces jointes sous « ## Attachments »,
  // chacune sous la forme :
  //   - [nom.pdf](obsidian://zotflow?type=open-attachment&libraryID=…&key=T5HPDH45)
  // C'est cette clé de pièce jointe — et non celle de la référence — que Zotero
  // attend pour ouvrir le PDF.
  async cleAttachement(fichierSource) {
    try {
      const texte = await this.app.vault.cachedRead(fichierSource);
      const bloc = texte.split(/^##\s+Attachments\s*$/m)[1];
      if (!bloc) return null;
      const avant = bloc.split(/^##\s+/m)[0];
      const m = avant.match(/type=open-attachment[^)\n]*?[&;]key=([A-Za-z0-9]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  // Rend { source, annoKey, page, libraryId } si la note active se rattache à
  // Zotero, sinon null. Vaut pour une annotation comme pour une fiche source.
  cibleZotero(fichier) {
    const f = fichier || this.app.workspace.getActiveFile();
    if (!f || f.extension !== 'md') return null;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    if (fm.citationKey) {
      return { source: f, annoKey: null, page: '', libraryId: fm['library-id'] || '' };
    }
    const src = fm['zotflow-source'];
    if (!src) return null;
    const cible = String(src).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const source = this.app.metadataCache.getFirstLinkpathDest(cible, f.path);
    if (!source) return null;
    const fms = (this.app.metadataCache.getFileCache(source) || {}).frontmatter || {};
    return {
      source,
      annoKey: fm['zotflow-anno-key'] ? String(fm['zotflow-anno-key']).trim() : null,
      page: fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '',
      libraryId: fms['library-id'] || '',
    };
  }

  async ouvrirDansZotero(fichier) {
    // Depuis un lecteur ZotFlow, la feuille active dit tout : on n'a pas
    // besoin de la note.
    if (!fichier) {
      const f = this.app.workspace.activeLeaf;
      if (f && this.estLecteurZotflow(f.view)) { await this.ouvrirLecteurDansZotero(f); return; }
    }
    const cible = this.cibleZotero(fichier);
    if (!cible) { new obsidian.Notice(tr('Cette note ne se rattache pas à une source Zotero.')); return; }
    const fms = (this.app.metadataCache.getFileCache(cible.source) || {}).frontmatter || {};
    const att = await this.cleAttachement(cible.source);
    let uri;
    if (att) {
      // Zotero replace le lecteur sur l'annotation quand on la lui nomme ;
      // à défaut, sur la page. Sans pièce jointe, on se rabat sur la fiche.
      const ancre = cible.annoKey
        ? '?annotation=' + encodeURIComponent(cible.annoKey)
        : (cible.page ? '?page=' + encodeURIComponent(cible.page) : '');
      uri = 'zotero://open-pdf/library/items/' + att + ancre;
    } else if (fms['zotero-key']) {
      uri = 'zotero://select/library/items/' + String(fms['zotero-key']).trim();
    } else {
      new obsidian.Notice(tr('Aucune pièce jointe ni clé Zotero dans « ') + cible.source.basename + ' ».');
      return;
    }
    try {
      window.open(uri);
      console.log('[Ariane] Zotero —', uri);
    } catch (e) {
      new obsidian.Notice(tr('Ouverture dans Zotero impossible : ') + (e && e.message ? e.message : e));
    }
  }

  //#endregion Ariane · lecteurs ZotFlow & liens Zotero

  //#region Ariane · familles de notes & routage de dossier
  // ── familles de notes & routage de dossier ───────────────────────────────

  /* ------------------------ Familles de notes --------------------------- */

  // Une famille : un libellé, un ou PLUSIEURS dossiers, un préfixe facultatif,
  // et ce qu'Ariane doit en faire. Rien n'y est imposé : c'est l'utilisateur
  // qui décrit son organisation, et non le greffon qui présume la sienne.
  familles() {
    const brut = Array.isArray(this.settings.famillesNotes) ? this.settings.famillesNotes : [];
    return brut.map((f) => ({
      nom: String((f && f.nom) || '').trim(),
      dossiers: (Array.isArray(f && f.dossiers) ? f.dossiers : [])
        .map((d) => String(d || '').trim().replace(/^\/+|\/+$/g, '')).filter(Boolean),
      prefixe: String((f && f.prefixe) || '').trim(),
      aparte: (f && f.aparte) !== false,
      suggestions: !!(f && f.suggestions),
      couleur: String((f && f.couleur) || '').trim(),
      icone: String((f && f.icone) || '').trim(),
      monospace: !!(f && f.monospace),
      alias: !!(f && f.alias),
    })).filter((f) => f.dossiers.length || f.prefixe);
  }

  // Une note appartient à une famille par son dossier — sous-dossiers compris —
  // ou par son préfixe de nom. Le dossier prime : le préfixe n'est qu'un
  // filet de sécurité pour les notes rangées ailleurs.
  familleDuChemin(chemin, basename) {
    const c = String(chemin || '');
    const n = String(basename || c.split('/').pop() || '').replace(/\.md$/i, '');
    const fams = this.familles();
    for (const f of fams) {
      if (f.dossiers.some((d) => c === d + '.md' || c.startsWith(d + '/'))) return f;
    }
    for (const f of fams) {
      if (f.prefixe && n.startsWith(f.prefixe)) return f;
    }
    return null;
  }

  // Tous les dossiers dont les notes nourrissent les suggestions.
  dossiersSuggeres() {
    const out = [];
    for (const f of this.familles()) {
      if (!f.suggestions) continue;
      for (const d of f.dossiers) if (!out.includes(d)) out.push(d);
    }
    return out;
  }

  // Couleur et icône d'un dossier, portées par sa famille.
  styleDuDossier(dossier) {
    const d = String(dossier || '').trim();
    for (const f of this.familles()) {
      if (f.dossiers.includes(d)) return { couleur: f.couleur, icone: f.icone };
    }
    return {};
  }

  dossiersDeFamille(propriete) {
    const out = [];
    for (const f of this.familles()) {
      if (!f[propriete]) continue;
      for (const d of f.dossiers) if (!out.includes(d)) out.push(d);
    }
    return out;
  }

  // Reprise des anciens réglages : l'utilisateur ne doit rien ressaisir. On ne
  // migre qu'une fois, et seulement si la table est encore vide.
  // Propose un rôle par dossier dont le nom s'en approche. On ne remplit que
  // les rôles restés vides : jamais on n'écrase un choix de l'utilisateur.
  proposerRoles() {
    const racines = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const parts = f.path.split('/');
      for (let i = 1; i <= Math.min(2, parts.length - 1); i++) racines.add(parts.slice(0, i).join('/'));
    }
    const sansAccent = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const indices = [
      ['dossierAnnotations', ['annotation']],
      ['dossierNotesLecture', ['note de lecture', 'notes de lecture', 'lecture']],
      ['dossierReferences', ['reference en attente', 'references en attente', 'en attente']],
      ['dossierTaches', ['tache', 'taches']],
      ['dossierBibliographies', ['bibliographie citee', 'bibliographies citees', 'biblio']],
      ['exportDossier', ['livrable', 'export', 'document']],
      ['tempsDossierJournal', ['journal']],
    ];
    let poses = 0;
    for (const [cle, mots] of indices) {
      if (this.settings[cle]) continue;
      let choisi = null;
      for (const d of racines) {
        const n = sansAccent(d);
        if (mots.some((m) => n.includes(m))) {
          if (!choisi || d.length < choisi.length) choisi = d;
        }
      }
      if (choisi) { this.settings[cle] = choisi; poses += 1; }
    }
    return poses;
  }

  // Propose une famille par dossier qui porte des notes — sous-dossiers
  // compris, car les vôtres comptent : les comptes-rendus et les notes
  // préparatoires vivent sous « Livrables ». Le préfixe est DÉDUIT des noms de
  // fichiers : si toutes les notes d'un dossier commencent pareil, c'en est un.
  familiesProposees() {
    const parDossier = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const parts = f.path.split('/');
      if (parts.length < 2) continue;
      const dossier = parts.slice(0, -1).join('/');
      if (dossier.startsWith('.')) continue;
      if (!parDossier.has(dossier)) parDossier.set(dossier, []);
      parDossier.get(dossier).push(f.basename);
    }
    // Un dossier dont TOUS les sous-dossiers sont déjà proposés n'apporte rien.
    const deja = new Set();
    for (const f of this.familles()) for (const d of f.dossiers) deja.add(d);
    const out = [];
    for (const [dossier, noms] of [...parDossier.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
      if (deja.has(dossier) || noms.length < 2) continue;
      // Annotations et notes de lecture sont rangées PAR SOURCE : des dizaines
      // de sous-dossiers « @citekey », qui n'ont pas à devenir autant de
      // familles. On les écarte par leur rôle et par leur nom.
      const parents = [this.settings.dossierAnnotations, this.settings.dossierNotesLecture].filter(Boolean);
      if (parents.some((r) => dossier.startsWith(r + '/'))) continue;
      if (dossier.split('/').pop().startsWith('@')) continue;
      out.push({
        nom: dossier.replace(/^\d+\s*-\s*/, '').split('/').pop(),
        dossiers: [dossier],
        prefixe: prefixeCommun(noms),
        aparte: true, suggestions: false, couleur: '', icone: '',
        monospace: false, alias: false,
      });
    }
    return out;
  }

  migrerFamilles() {
    if (Array.isArray(this.settings.famillesNotes) && this.settings.famillesNotes.length) return 0;
    const s = this.settings;
    const styles = s.suggStylesDossiers || {};
    const mono = new Set((s.dossiersMonospace || []).map((x) => String(x).trim()));
    const alias = new Set((s.dossiersAliasExplorateur || []).map((x) => String(x).trim()));
    const parDossier = new Map();
    const ajouter = (dossier, champs) => {
      const d = String(dossier || '').trim().replace(/^\/+|\/+$/g, '');
      if (!d) return;
      const f = parDossier.get(d) || {
        nom: d.replace(/^\d+\s*-\s*/, '').split('/').pop(),
        dossiers: [d], prefixe: '', aparte: true, suggestions: false,
        couleur: '', icone: '', monospace: false, alias: false,
      };
      Object.assign(f, champs);
      parDossier.set(d, f);
    };
    for (const d of (s.suggDossiersCandidats || [])) {
      ajouter(d, { suggestions: true, couleur: (styles[d] || {}).couleur || '', icone: (styles[d] || {}).icone || '' });
    }
    if (s.dossierNotesConceptuelles) {
      ajouter(s.dossierNotesConceptuelles, {
        nom: 'Note conceptuelle',
        prefixe: s.prefixeNoteConceptuelle || '',
        aparte: s.aparteConceptuelles !== false,
      });
    }
    for (const d of mono) ajouter(d, { monospace: true });
    for (const d of alias) ajouter(d, { alias: true });
    if (!parDossier.size) return 0;
    this.settings.famillesNotes = [...parDossier.values()];
    return this.settings.famillesNotes.length;
  }

  //#endregion Ariane · familles de notes & routage de dossier

  //#region Ariane · références en attente
  // ── références en attente ────────────────────────────────────────────────

  // Nom canonique par clé de libellé. Deux écritures qui ne diffèrent que par
  // une conjonction, un accent, un trait d'union ou une virgule désignent la
  // même référence : « Castan~er » et « Castaner », « Gentner et al., » et
  // « Gentner, et al., ». Il n'y a rien à arbitrer là-dedans, c'est
  // déterministe, et cela se règle à la création plutôt qu'après coup.
  indexCanoniques() {
    const m = new Map();
    const dossier = this.dossierR;
    if (!dossier) return m;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(dossier + '/')) continue;
      const k = cleLibelle(f.basename);
      if (!k) continue;
      const ancien = m.get(k);
      if (!ancien) { m.set(k, f.basename); continue; }
      // Départage, dans cet ordre et sans dépendre de l'ordre des fichiers, qui
      // n'est pas garanti : d'abord la forme normalisée sur les conjonctions,
      // puis la plus petite dans l'ordre des caractères. Ce second critère
      // retient les formes lisibles : « Castaner » avant « Castan~er »,
      // « Gentner et al. » avant « Gentner, et al. », « Garcia-Aristizabal »
      // avant « GarciaAristizabal ».
      const normNeuf = normaliserConjAuteurs(f.basename) === f.basename;
      const normAncien = normaliserConjAuteurs(ancien) === ancien;
      if (normNeuf !== normAncien) { if (normNeuf) m.set(k, f.basename); continue; }
      if (f.basename < ancien) m.set(k, f.basename);
    }
    return m;
  }

  // Rend le nom de note à employer : celui qui existe déjà sous une écriture
  // équivalente, sinon celui de la référence, la note étant alors créée.
  async assurerReference(ref, canoniques) {
    const k = cleLibelle(ref.nom);
    const deja = canoniques && k ? canoniques.get(k) : null;
    if (deja) return deja;
    const nom = this.nettoyerNomFichier(ref.nom);
    const chemin = this.dossierR + '/' + nom + '.md';
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      await this.assurerDossier(this.dossierR);
      await this.ecrire(chemin, construireReference(ref, this.settings));
    }
    if (canoniques && k) canoniques.set(k, nom);
    return nom;
  }

  // Renomme les notes de référence « … et … » / « … and … » en « … & … »
  // (en conservant « et al. »), via l'API Obsidian pour préserver les liens.
  // « March et Smith, 1995 » et « March & Smith, 1995 » sont la même référence.
  // parseNomReference normalise déjà les conjonctions à la création, donc seules
  // les notes antérieures à ce garde-fou subsistent. Renommer ne suffit pas :
  // quand la forme normalisée existe déjà, il faut FUSIONNER, ce que l'ancienne
  // version refusait de faire en comptant un « conflit ». Elle échouait donc
  // exactement sur les cas qui la justifient.
  async normaliserConjonctionsReferences() {
    const dossier = this.dossierR;
    const fichiers = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'));
    let renommees = 0, fusionnees = 0, liens = 0, echecs = 0;
    const avis = new obsidian.Notice(tr('Normalisation…'), 0);
    for (const f of fichiers) {
      const nouveauNom = this.nettoyerNomFichier(normaliserConjAuteurs(f.basename));
      if (nouveauNom === f.basename) continue;
      const cible = dossier + '/' + nouveauNom + '.md';
      const existante = this.app.vault.getAbstractFileByPath(cible);
      if (existante) {
        const c = this.indexCitations().get(f.basename) || { total: 0, sources: new Map() };
        const n = await this.fusionnerReferences(
          { nom: f.basename, fichier: f, citations: c.total }, nouveauNom, true);
        fusionnees += 1; liens += n;
        avis.setMessage(tr('Normalisation : ') + (renommees + fusionnees) + ' / ' + fichiers.length);
        continue;
      }
      try {
        await this.app.fileManager.renameFile(f, cible);
        renommees += 1;
      } catch (e) {
        echecs += 1;
        console.error('[Ariane] normalisation', f.basename, e);
      }
    }
    avis.hide();
    new obsidian.Notice(tr('Conjonctions : ') + renommees + ' ' + tr('renommée(s)')
      + ', ' + fusionnees + ' ' + tr('fusionnée(s)') + ' (' + liens + ' ' + tr('lien(s)') + ')'
      + (echecs ? ', ' + echecs + ' ' + tr('en échec') : '') + '.', 10000);
  }

  async nettoyerSupprimees(sourceBasename, clesPresentes) {
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      if (!String(fm['zotflow-source'] || '').includes(sourceBasename)) continue;
      const cle = fm['zotflow-anno-key'];
      if (cle && !clesPresentes.has(cle)) {
        await this.supprimerAnnotation(f, cle);
      }
    }
  }

  async supprimerAnnotation(file, cle) {
    await this.supprimerFichier(file);
    if (this.settings.propagerSuppressions) await this.retirerLiens(cle);
  }

  // Propagation de la suppression d'une SOURCE (supprimée dans Zotero) :
  // retire toutes ses annotations, son sous-dossier vidé, et les fiches
  // auteurs qui ne dépendaient que de cette source.
  async surSuppressionSource(basename) {
    const annotations = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      const s = String(fm['zotflow-source'] || '')
        .replace(/^\[\[|\]\]$/g, '')
        .replace(/\|.*$/, '')
        .trim();
      if (s === basename) annotations.push({ f, cle: fm['zotflow-anno-key'] });
    }
    const dossierSource = this.dossierA + '/' + this.nettoyerNomFichier(basename);
    const dossier = this.app.vault.getAbstractFileByPath(dossierSource);
    const dossierExiste = dossier instanceof obsidian.TFolder;
    // Rien qui rattache ce fichier à une source atomisée : on n'y touche pas.
    if (annotations.length === 0 && !dossierExiste) return;

    for (const { f, cle } of annotations) {
      if (cle) await this.supprimerAnnotation(f, cle);
      else await this.supprimerFichier(f);
    }

    // Sous-dossier de la source, une fois vidé.
    const d = this.app.vault.getAbstractFileByPath(dossierSource);
    if (d instanceof obsidian.TFolder && d.children.length === 0) {
      this.marquerEcriture(dossierSource);
      await this.app.fileManager.trashFile(d);
    }

    await this.nettoyerAuteursSource(basename);
  }

  // Fiches auteurs pointant vers une source supprimée : retire le lien ; si la
  // fiche ne pointe plus vers aucune source, elle est mise à la corbeille.
  async nettoyerAuteursSource(basename) {
    if (!this.settings.liensAuteurs) return;
    const dossier = this.settings.dossierAuteurs;
    if (!(this.app.vault.getAbstractFileByPath(dossier) instanceof obsidian.TFolder)) return;
    const lien = '[[' + basename + ']]';
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(dossier + '/')) continue;
      const contenu = await this.app.vault.read(f);
      if (!contenu.includes(lien)) continue;
      const lignes = contenu.split('\n').filter((l) => !l.includes(lien));
      const resteUnLien = /\[\[[^\]]+\]\]/.test(lignes.join('\n'));
      const cache = this.app.metadataCache.getFileCache(f);
      const estFicheAuteur = !!(cache && cache.frontmatter && cache.frontmatter.type === 'auteur');
      if (!resteUnLien && estFicheAuteur) {
        await this.supprimerFichier(f);
      } else {
        const nouveau = lignes.join('\n');
        if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
      }
    }
  }

  async retirerLiens(cible) {
    const re = new RegExp('!?\\[\\[' + echapperRegex(cible) + '(\\|[^\\]]*)?\\]\\]', 'g');
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(this.dossierA + '/')) continue;
      const contenu = await this.app.vault.read(f);
      re.lastIndex = 0;
      if (!re.test(contenu)) continue;

      const lignes = contenu.split('\n').map((l) => {
        re.lastIndex = 0;
        if (!re.test(l)) return l;
        re.lastIndex = 0;
        return l
          .replace(re, '')
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\s+;\s*$/, '')
          .replace(/^\s*;\s*/, '')
          .replace(/[ \t]+$/g, '');
      });
      const nettoyees = lignes.filter((l) => !/^\s*([-*+]|\d+\.)\s*$/.test(l));
      const nouveau = nettoyees.join('\n');
      if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
    }
  }

  /* ------------------------------ Verrouillage ------------------------------ */

  async verrouiller(file) {
    if (!this.settings.verrouillage) return;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache ? cache.frontmatter : null;
    if (!fm || fm['zotflow-auto'] !== true) return;

    const cle = fm['zotflow-anno-key'];
    const srcNom = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '');
    if (!cle || !srcNom) return;

    const source = this.app.metadataCache.getFirstLinkpathDest(srcNom, file.path);
    if (!source) return;

    const contenu = await this.app.vault.read(source);
    const blocs = extraireBlocs(contenu, this.settings);
    const bloc = blocs.find((b) => b.cle === cle);
    if (!bloc) {
      if (this.settings.propagerSuppressions) await this.supprimerAnnotation(file, cle);
      return;
    }
    const idx = this.construireIndexZotero();
    const fmSrc = (this.app.metadataCache.getFileCache(source) || {}).frontmatter || {};
    const canon = construireNote(bloc, source.basename, idx, this.settings, { collections: fmSrc.collections });
    const actuel = await this.app.vault.read(file);
    if (actuel !== canon) await this.ecrire(file.path, canon, file);
  }

  /* ------------------------ Rattachement Zotero (réf.) ----------------------- */

  async rattacherReferencesZotero(zoteroFile) {
    if (!this.settings.rattachementZotero) return;
    const entree = this.entreeIndex(zoteroFile);
    const creatorsFull = entree.creatorsFull;
    if (!entree.premier || !entree.annee) return;

    if (!this.app.vault.getAbstractFileByPath(this.dossierR)) return;
    // Index complet (pour juger l'unicité d'un appariement fort).
    const index = this.settings.rattachementAutoCertain ? this.construireIndexZotero() : null;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierR + '/')) continue;
      const ref = parseNomReference(f.basename, this.settings);
      if (!ref) continue;
      if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) continue; // suffixe -> assistant
      if (appariementSource(ref, entree)) {
        // Correspondance CERTAINE (unique appariement fort dans toute la
        // bibliothèque) -> rattachement automatique, sans confirmation.
        const certaine = index && trouverSourceZotero(ref, index) === zoteroFile.basename;
        if (!certaine && !(await this.deciderRattachement(f.basename, zoteroFile, entree))) continue;
        await this.remplacerLiens(f.basename, zoteroFile.basename);
        await this.supprimerFichier(f);
        await this.assurerNotesAuteurs(zoteroFile.basename, creatorsFull);
      }
    }
  }

  // Balaye toutes les références en attente et rattache automatiquement celles
  // qui ont une correspondance Zotero certaine (unique appariement fort), sans
  // confirmation. Les cas ambigus (plusieurs candidats, « et al. », 2005a/b)
  // sont laissés à l'assistant.
  async rattacherToutesReferences() {
    if (!this.app.vault.getAbstractFileByPath(this.dossierR)) {
      new obsidian.Notice(tr('Aucun dossier de références en attente.'));
      return;
    }
    const index = this.construireIndexZotero();
    let attachees = 0, ambigues = 0, sansSource = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierR + '/')) continue;
      const ref = parseNomReference(f.basename, this.settings);
      if (!ref) continue;
      if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) { ambigues++; continue; }
      const base = trouverSourceZotero(ref, index);
      if (base) {
        await this.remplacerLiens(f.basename, base);
        await this.supprimerFichier(f);
        const e = index.find((z) => z.basename === base);
        if (e) await this.assurerNotesAuteurs(base, e.creatorsFull || []);
        attachees++;
      } else {
        (candidatsSource(ref, index).length ? (ambigues++) : (sansSource++));
      }
    }
    new obsidian.Notice(tr('Références : ') + attachees + ' rattachée(s) automatiquement, ' + ambigues +
      ' ambiguë(s) (assistant), ' + sansSource + ' sans source Zotero.'
    );
  }

  // Notes d'auteur dédiées : pour chaque auteur (nom complet Zotero) d'une
  // source, garantit une note Auteurs/<Nom complet>.md qui pointe vers la
  // source. Entièrement sous contrôle du plugin (indépendant de ZotFlow).
  async assurerNotesAuteurs(sourceBasename, auteursFull) {
    if (!this.settings.liensAuteurs || !auteursFull || auteursFull.length === 0) return;
    const dossier = this.settings.dossierAuteurs;
    await this.assurerDossier(dossier);
    const lien = '[[' + sourceBasename + ']]';
    for (const auteur of auteursFull) {
      const chemin = dossier + '/' + this.nettoyerNomFichier(auteur) + '.md';
      const f = this.app.vault.getAbstractFileByPath(chemin);
      const { nom, prenom } = separerNomPrenom(auteur);
      if (f instanceof obsidian.TFile) {
        const contenu = await this.app.vault.read(f);
        if (!contenu.includes(lien)) {
          await this.ecrire(chemin, contenu.replace(/\s*$/, '') + '\n' + lien + '\n', f);
        }
        // Rétro-remplit nom/prénom si absents.
        const fmc = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        const manque = (nom && !fmc.nom) || (prenom && (fmc['prénom'] == null || fmc['prénom'] === ''));
        if (manque) {
          this.marquerEcriture(f.path);
          await this.app.fileManager.processFrontMatter(f, (fm) => {
            if (nom && !fm.nom) fm.nom = nom;
            if (prenom && (fm['prénom'] == null || fm['prénom'] === '')) fm['prénom'] = prenom;
          });
        }
      } else {
        const tete = '---\ntype: auteur\n'
          + (nom ? 'nom: ' + JSON.stringify(nom) + '\n' : '')
          + (prenom ? 'prénom: ' + JSON.stringify(prenom) + '\n' : '')
          + '---\n\n';
        await this.ecrire(chemin, tete + lien + '\n');
      }
    }
  }

  // Tranche un rattachement ambigu avec le modèle local. Renvoie true, false,
  // ou null si le modèle est injoignable (on retombe alors sur la fenêtre).
  async deciderRattachementIA(refNom, entree) {
    try {
      const auteurs = (entree.creatorsFull || []).join(', ');
      const prompt =
        'Tu aides un chercheur à relier une référence citée à une fiche bibliographique.\n\n'
        + 'Référence citée, telle qu\'elle apparaît dans un texte :\n"' + refNom + '"\n\n'
        + 'Fiche candidate :\n'
        + '- Auteurs : ' + (auteurs || '(inconnus)') + '\n'
        + '- Année : ' + (entree.annee || '(inconnue)') + '\n'
        + '- Titre : ' + (entree.titre || '(inconnu)') + '\n\n'
        + 'Désignent-elles le même travail ? Sois prudent : en cas de doute sérieux '
        + '(auteurs différents, homonymie possible, année incohérente), réponds false.\n'
        + 'Réponds UNIQUEMENT en JSON : {"meme": true} ou {"meme": false}.';
      const brut = await this.genererJson(prompt, 64);
      if (!brut) return null;
      let obj = null;
      try { obj = JSON.parse(brut); } catch (e) {
        const m = brut.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
      }
      if (!obj) return null;
      const v = obj.meme !== undefined ? obj.meme : obj.same;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return /^(true|oui|yes)$/i.test(v.trim());
      return null;
    } catch (e) {
      console.debug('[Ariane] rattachement IA', e);
      return null;
    }
  }

  // Décision pour un couple (référence en attente, fiche Zotero) : mémoire
  // persistante d'abord, puis modèle local, puis vous. Une question posée une
  // fois ne revient jamais, même après une nouvelle synchronisation zotflow.
  async deciderRattachement(refNom, zoteroFile, entree) {
    if (!this.settings.rattachementsDecides) this.settings.rattachementsDecides = {};
    const memo = this.settings.rattachementsDecides;
    const cle = refNom + ' => ' + zoteroFile.basename;
    if (Object.prototype.hasOwnProperty.call(memo, cle)) return memo[cle] === true;

    let ok = null;
    if (this.settings.rattachementIA !== false) {
      ok = await this.deciderRattachementIA(refNom, entree);
    }
    if (ok === null) {
      ok = await this.confirmerRattachement(refNom, zoteroFile.basename, entree.creatorsFull);
    }
    memo[cle] = ok === true;
    await this.saveSettings();
    return ok === true;
  }

  // Fenêtre de validation d'un rattachement (anti-homonymie). Renvoie une
  // promesse booléenne. Sans validation activée, renvoie true directement.
  confirmerRattachement(refNom, sourceBasename, auteursFull) {
    if (!this.settings.validationRattachement) return Promise.resolve(true);
    const cle = refNom + '|' + sourceBasename;
    if (this.rattachementsIgnores && this.rattachementsIgnores.has(cle)) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      const texte =
        'Rattacher la référence citée « ' + refNom + ' » à la source Zotero « ' +
        sourceBasename + ' »' +
        (auteursFull && auteursFull.length ? ' (auteurs : ' + auteursFull.join(', ') + ')' : '') +
        ' ? Vérifiez qu\'il ne s\'agit pas d\'un homonyme.';
      new ConfirmationRattachement(this.app, texte, (ok) => {
        if (!ok && this.rattachementsIgnores) this.rattachementsIgnores.add(cle);
        resolve(ok);
      }).open();
    });
  }

  // Assistant : lie la note de référence active (ex. « Aven, 2005a ») à la
  // bonne fiche Zotero parmi les candidats auteur+année, mémorise le choix,
  // remplace les liens et retire la note provisoire.
  async assistantLiageReference() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md' || !file.path.startsWith(this.dossierR + '/')) {
      new obsidian.Notice(tr('Ouvrez une note de référence (dossier « ') + this.dossierR + ' »).');
      return;
    }
    const ref = parseNomReference(file.basename, this.settings);
    if (!ref) {
      new obsidian.Notice(tr('Nom de référence non reconnu (attendu « Auteur, Année »).'));
      return;
    }
    const candidats = candidatsSource(ref, this.construireIndexZotero()).map((c) => c.entree);
    if (!candidats.length) {
      new obsidian.Notice(tr('Aucune fiche Zotero pour « ') + (ref.premierAuteur || '') + ', ' + (ref.annee4 || ref.annee) + ' ».');
      return;
    }
    new ChoixSourceModal(this.app, file.basename, candidats, async (choix) => {
      if (!choix) return;
      if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
      this.settings.correspondancesSuffixe[ref.nom] = { __defaut: choix };
      await this.saveSettings();
      await this.remplacerLiens(file.basename, choix);
      const entree = candidats.find((c) => c.basename === choix);
      if (entree) await this.assurerNotesAuteurs(choix, entree.creatorsFull || []);
      await this.supprimerFichier(file);
      new obsidian.Notice(tr('Référence « ') + file.basename + ' » liée à « ' + choix + ' ».');
    }).open();
  }

  async remplacerLiens(ancien, nouveau) {
    const re = new RegExp('\\[\\[' + echapperRegex(ancien) + '(\\|[^\\]]*)?\\]\\]', 'g');
    for (const f of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.read(f);
      re.lastIndex = 0;
      if (!re.test(contenu)) continue;
      const nouveauContenu = contenu.replace(re, '[[' + nouveau + ']]');
      if (nouveauContenu !== contenu) await this.ecrire(f.path, nouveauContenu, f);
    }
  }

  /* ===================== Arbitrage des références en attente ================ *
   * Mesuré sur un vrai coffre : sur 631 références en attente, 19 seulement se
   * rattachent par auteur et année. Les autres demandent un arbitrage humain,
   * et pour arbitrer il faut voir ce que la référence désigne réellement. D'où
   * la résolution par la bibliographie de la source citante : l'article qui
   * cite « Aven & Renn, 2009a » donne dans sa propre liste de références le
   * titre et le DOI de ce qu'il désigne.
   * ========================================================================= */

  // Le rattachement complet : mémoriser le choix, réécrire tous les liens du
  // coffre, créer les notes d'auteurs, retirer la note provisoire. C'est le
  // même geste que l'assistant sur note active, factorisé pour que les deux
  // chemins ne divergent jamais.
  async rattacherReference(entree, cible) {
    if (!cible) return;
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    this.settings.correspondancesSuffixe[entree.nom] = { __defaut: cible };
    await this.saveSettings();
    await this.remplacerLiens(entree.nom, cible);
    const z = this.construireIndexZotero().find((x) => x.basename === cible);
    if (z) await this.assurerNotesAuteurs(cible, z.creatorsFull || []);
    await this.supprimerFichier(entree.fichier);
    new obsidian.Notice(tr('Référence « ') + entree.nom + ' » liée à « ' + cible + ' ».');
  }

  // « à acquérir » ou « écartée », inscrit dans la note elle-même pour que la
  // décision survive à une réinstallation du greffon.
  async marquerReference(entree, etat) {
    const f = entree.fichier;
    const contenu = await this.app.vault.read(f);
    let neuf;
    if (/^---\n[\s\S]*?\n---/.test(contenu)) {
      const sansLigne = contenu.replace(/^(---\n[\s\S]*?)^arbitrage:.*\n([\s\S]*?---)/m, '$1$2');
      neuf = etat
        ? sansLigne.replace(/^(---\n)/, '$1arbitrage: ' + JSON.stringify(etat) + '\n')
        : sansLigne;
    } else {
      neuf = etat ? '---\narbitrage: ' + JSON.stringify(etat) + '\n---\n\n' + contenu : contenu;
    }
    await this.ecrire(f.path, neuf, f);
  }

  // Inscrit dans la note en attente l'œuvre retenue. C'est la seule écriture
  // que l'arbitrage produit, et elle est réversible : deux propriétés.
  async ecrireIdentification(entree, verdict) {
    if (!verdict || !verdict.titre) return;
    const f = entree.fichier;
    const contenu = await this.app.vault.read(f);
    const pose = (texte, cle, valeur) => {
      const sans = texte.replace(new RegExp('^' + cle + ':.*\\n', 'm'), '');
      return valeur ? sans.replace(/^(---\n)/, '$1' + cle + ': ' + JSON.stringify(valeur) + '\n') : sans;
    };
    let neuf = contenu;
    if (!/^---\n[\s\S]*?\n---/.test(neuf)) neuf = '---\n---\n\n' + neuf;
    neuf = pose(neuf, 'titre-cité', verdict.titre);
    neuf = pose(neuf, 'doi', verdict.doi || '');
    await this.ecrire(f.path, neuf, f);
    new obsidian.Notice(tr('Identification écrite : ') + '« ' + verdict.titre.slice(0, 60) + ' »');
  }

  // Réparation : d'anciennes versions découpaient « Dupont, Martin, & Durand »
  // en laissant l'esperluette collée au dernier nom, d'où des liens « [[& X]] »
  // qui ne pointent nulle part. Le découpage est corrigé, restent les résidus.
  async reparerLiensAuteurs() {
    const motif = /\[\[\s*&\s+([^\]|#]+?)\s*(\|[^\]]*)?\]\]/g;
    let fichiers = 0, liens = 0;
    const touches = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.cachedRead(f);
      motif.lastIndex = 0;
      if (!motif.test(contenu)) continue;
      motif.lastIndex = 0;
      let n = 0;
      const neuf = contenu.replace(motif, (tout, nom, alias) => {
        n += 1;
        return '[[' + nom.trim() + (alias || '') + ']]';
      });
      if (neuf === contenu) continue;
      await this.ecrire(f.path, neuf, f);
      fichiers += 1; liens += n;
      touches.push(f.basename);
    }
    if (!fichiers) new obsidian.Notice(tr('Aucun lien d’auteur à réparer.'));
    else new obsidian.Notice(tr('Liens d’auteurs réparés : ') + liens + tr(' dans ') + fichiers + tr(' note(s).'));
    console.log('[Ariane] liens d’auteurs réparés dans :', touches);
    return liens;
  }

  /* ------------- Compléter une référence depuis son DOI -------------------- *
   * L'arbitrage identifie l'œuvre ; il n'en donne que le titre et le DOI, parce
   * que c'est tout ce qu'une entrée de bibliographie contient. La fiche
   * complète, elle, se demande à Crossref sur le DOI lui-même : auteurs avec
   * leurs prénoms, revue ou éditeur, type, année.
   * ------------------------------------------------------------------------ */

  async ficheDepuisDoi(doi) {
    const d = normDoi(doi);
    if (!d) return null;
    const q = this.paramMailto();
    const j = await this.apiGetJson(
      'https://api.crossref.org/works/' + encodeURIComponent(d) + (q ? '?' + q : ''));
    const m = j && j.message ? j.message : null;
    if (!m) return null;
    const parts = (m.issued && m.issued['date-parts']) || [];
    const auteurs = (m.author || [])
      .map((a) => String((a.given || '') + ' ' + (a.family || a.name || '')).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return {
      doi: d,
      titre: String((m.title || [])[0] || '').trim(),
      auteurs,
      annee: String((parts[0] || [])[0] || '').trim(),
      revue: String((m['container-title'] || [])[0] || '').trim(),
      editeur: String(m.publisher || '').trim(),
      type: String(m.type || '').trim(),
      url: String(m.URL || '').trim(),
    };
  }

  // La fiche récupérée doit parler du même travail : l'année et le nom cité
  // doivent s'y retrouver. Sinon on ne l'écrit pas. Un DOI erroné, cela arrive,
  // et une fausse fiche dans une thèse coûte plus cher qu'une fiche absente.
  ficheConcorde(fiche, nomReference) {
    if (!fiche || !fiche.titre) return false;
    const m = String(nomReference).match(/^(.*?),\s*(\d{4})/);
    if (!m) return true;
    if (fiche.annee && fiche.annee !== m[2]) return false;
    const premier = sansAccents(m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop());
    if (!premier || !fiche.auteurs.length) return true;
    return fiche.auteurs.some((a) => sansAccents(a).split(/[^a-z0-9]+/).includes(premier));
  }

  async completerReference(entree, doi) {
    const fiche = await this.ficheDepuisDoi(doi);
    if (!fiche) { new obsidian.Notice(tr('Fiche introuvable pour ce DOI.')); return false; }
    if (!this.ficheConcorde(fiche, entree.nom)) {
      new obsidian.Notice(tr('La fiche du DOI ne concorde pas avec « ') + entree.nom + ' ». '
        + tr('Rien n’a été écrit.'), 9000);
      return false;
    }
    const f = entree.fichier;
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      // L'alias porte le titre : c'est lui que lit l'aparté, et c'est par lui
      // que la référence devient trouvable ailleurs qu'en « Auteur, Année ».
      const al = Array.isArray(fm.aliases) ? fm.aliases : (fm.aliases ? [fm.aliases] : []);
      if (!al.includes(fiche.titre)) fm.aliases = [fiche.titre].concat(al.filter((x) => x !== fiche.titre));
      fm['titre-cité'] = fiche.titre;
      fm.doi = fiche.doi;
      if (fiche.auteurs.length) fm.auteurs = fiche.auteurs;
      if (fiche.annee) fm.annee = fiche.annee;
      if (fiche.revue) fm.revue = fiche.revue;
      if (fiche.editeur) fm['éditeur'] = fiche.editeur;
      if (fiche.type) fm['type-œuvre'] = fiche.type;
      if (fiche.url) fm.url = fiche.url;
    });
    // Le corps ne portait que des noms de famille, « [[Bowker]] », alors que
    // les notes d'auteurs du coffre sont en noms complets. On les aligne.
    if (fiche.auteurs.length) {
      const contenu = await this.app.vault.read(f);
      const corps = contenu.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const reste = corps.replace(/^\s*\[\[[^\]]+\]\]\s*$/gm, '').trim();
      const liens = fiche.auteurs.map((a) => '[[' + a + ']]').join('\n');
      const fmBloc = (contenu.match(/^---\n[\s\S]*?\n---\n?/) || [''])[0];
      await this.ecrire(f.path, fmBloc + '\n' + liens + (reste ? '\n\n' + reste : '') + '\n', f);
      await this.assurerNotesAuteurs(entree.nom, fiche.auteurs);
    }
    return true;
  }

  /* --------------------- Fusionner deux libellés --------------------------- *
   * « Gawer & Cusumano, 2014 » et « Gawer, 2014 » désignent parfois le même
   * article et comptent séparément : le signal d'acquisition en est dilué. La
   * fusion réunit les liens sous un seul libellé et mémorise le renvoi.
   * ------------------------------------------------------------------------ */

  async fusionnerReferences(depuis, vers, silencieux) {
    if (!depuis || !vers || depuis.nom === vers) return 0;
    const n = await this.remplacerLiens(depuis.nom, vers);
    const cible = this.app.vault.getMarkdownFiles().find((f) => f.basename === vers);
    if (cible) {
      // Le libellé absorbé est conservé en propriété : il reste cherchable, et
      // l'on sait sous quelles formes ce travail a été cité.
      this.marquerEcriture(cible.path);
      await this.app.fileManager.processFrontMatter(cible, (fm) => {
        const l = Array.isArray(fm['libellés']) ? fm['libellés'] : (fm['libellés'] ? [fm['libellés']] : []);
        if (!l.includes(depuis.nom)) l.push(depuis.nom);
        fm['libellés'] = l;
      });
    }
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    this.settings.correspondancesSuffixe[depuis.nom] = { __defaut: vers };
    await this.saveSettings();
    await this.marquerReference(depuis, 'fusionnée');
    if (!silencieux) {
      new obsidian.Notice(tr('Fusionnée : ') + depuis.nom + ' → ' + vers
        + ' (' + n + ' ' + tr('lien(s)') + ').', 8000);
    }
    return n;
  }

  /* ------------------- Détacher une œuvre d'un libellé --------------------- *
   * « Renn, 2008 » recouvre deux travaux selon l'article citant. On crée une
   * note pour l'œuvre minoritaire, nommée par SON titre, et la table renvoie
   * chaque source vers la bonne. Le libellé d'origine garde son nom : aucun
   * lien existant ne se casse ailleurs.
   * ------------------------------------------------------------------------ */

  async detacherOeuvre(entree, oeuvre, silencieux) {
    if (!oeuvre || !oeuvre.sources || !oeuvre.sources.length) return null;
    const nom = this.nettoyerNomFichier(nomOeuvreDetachee(entree.nom, oeuvre.titre));
    if (nom === entree.nom) { new obsidian.Notice(tr('Titre insuffisant pour détacher.')); return null; }
    const chemin = this.dossierR + '/' + nom + '.md';
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      const fm = ['---', 'aliases:', '  - ' + JSON.stringify(oeuvre.titre || nom),
        'type: reference-citee'];
      if (oeuvre.doi) fm.push('doi: ' + JSON.stringify(oeuvre.doi));
      if (oeuvre.titre) fm.push('titre-cité: ' + JSON.stringify(oeuvre.titre));
      fm.push('libellés:'); fm.push('  - ' + JSON.stringify(entree.nom));
      fm.push('détachée-de: ' + JSON.stringify('[[' + entree.nom + ']]'));
      fm.push('---');
      await this.ecrire(chemin, fm.join('\n') + '\n');
    }
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    const table = Object.assign({}, this.settings.correspondancesSuffixe[entree.nom] || {});
    for (const src of oeuvre.sources) table[src] = nom;
    this.settings.correspondancesSuffixe[entree.nom] = table;
    await this.saveSettings();

    // On ne réécrit que les notes des sources concernées : les autres gardent
    // leur lien vers le libellé d'origine, qui reste valide.
    const motif = new RegExp('\\[\\[' + echapperRegex(entree.nom) + '(\\|[^\\]]*)?\\]\\]', 'g');
    const cibles = new Set(oeuvre.sources);
    let n = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fmc = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = cleDeLien(sansLien(fmc['zotflow-source'] || ''));
      if (!src || !cibles.has(src)) continue;
      const contenu = await this.app.vault.cachedRead(f);
      motif.lastIndex = 0;
      if (!motif.test(contenu)) continue;
      motif.lastIndex = 0;
      const neuf = contenu.replace(motif, (tout, alias) => '[[' + nom + (alias || '') + ']]');
      if (neuf === contenu) continue;
      await this.ecrire(f.path, neuf, f);
      n += 1;
    }
    if (!silencieux) {
      new obsidian.Notice(tr('Détachée : ') + nom + ' (' + n + ' ' + tr('lien(s)') + ').', 8000);
    }
    return { nom, liens: n };
  }

  /* ------------------ Détachement automatique ------------------------------ *
   * Quand la bibliographie de deux sources désigne deux travaux pour un même
   * libellé, il n'y a rien à arbitrer : chacune a raison pour son article. On
   * crée la note de l'œuvre minoritaire et la table renvoie chaque source vers
   * la sienne. Le libellé d'origine garde son nom, donc aucun lien valide ne
   * se casse.
   *
   * Cela suit la génération des bibliographies, seul moment où l'identification
   * change, plutôt que d'être une commande de plus.
   * ------------------------------------------------------------------------ */

  // Symétrique du détachement : deux libellés qui désignent le même travail se
  // réunissent d'eux-mêmes. Le libellé le plus cité l'emporte.
  async fusionnerAutomatiquement(silencieux) {
    const { parOeuvre } = await this.indexOeuvres();
    let n = 0, liens = 0;
    for (const o of parOeuvre.values()) {
      if (!o.libelles || o.libelles.length < 2) continue;
      const notes = [];
      for (const nom of o.libelles) {
        const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + nom + '.md');
        if (f instanceof obsidian.TFile) notes.push({ nom, fichier: f });
      }
      if (notes.length < 2) continue;
      const cites = this.indexCitations();
      notes.sort((a, b) => ((cites.get(b.nom) || {}).total || 0) - ((cites.get(a.nom) || {}).total || 0)
        || a.nom.localeCompare(b.nom));
      const garde = notes[0].nom;
      for (const autre of notes.slice(1)) {
        liens += await this.fusionnerReferences(autre, garde, true);
        n += 1;
      }
    }
    if (!silencieux && !n) new obsidian.Notice(tr('Aucun libellé à fusionner.'));
    console.log('[Ariane] fusions automatiques :', n, 'libellés,', liens, 'liens');
    return n;
  }

  // La résolution vivait en mémoire, recalculée à chaque ouverture du volet, et
  // n'était écrite dans les notes que par un geste manuel. Tout ce qui lit les
  // notes voyait donc des références non identifiées alors qu'elles l'étaient.
  // On inscrit ce qui ne souffre aucun doute : une seule œuvre pour ce libellé.
  async ecrireIdentificationsAutomatiquement(silencieux) {
    const { parRef } = await this.indexOeuvres();
    let n = 0;
    for (const [libelle, e] of parRef) {
      if (!e.oeuvres || e.oeuvres.length !== 1) continue;
      const o = e.oeuvres[0];
      if (!o.titre || !titreCredible(o.titre)) continue;
      const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + libelle + '.md');
      if (!(f instanceof obsidian.TFile)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // On n'écrase pas une identification déjà posée, ni ce que l'utilisateur
      // a corrigé à la main.
      if (fm['titre-cité']) continue;
      this.marquerEcriture(f.path);
      await this.app.fileManager.processFrontMatter(f, (x) => {
        x['titre-cité'] = o.titre;
        if (o.doi) x.doi = o.doi;
        const al = Array.isArray(x.aliases) ? x.aliases : (x.aliases ? [x.aliases] : []);
        if (!al.includes(o.titre)) x.aliases = [o.titre].concat(al);
      });
      n += 1;
    }
    if (!silencieux) {
      new obsidian.Notice(n ? tr('Identifications écrites : ') + n : tr('Rien de nouveau à identifier.'));
    }
    console.log('[Ariane] identifications écrites :', n);
    return n;
  }

  async detacherAutomatiquement(silencieux) {
    const { parRef } = await this.indexOeuvres();
    const aTraiter = [];
    for (const [libelle, e] of parRef) {
      if (!e.oeuvres || e.oeuvres.length < 2) continue;
      const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + libelle + '.md');
      if (!(f instanceof obsidian.TFile)) continue;
      aTraiter.push({ entree: { nom: libelle, fichier: f }, oeuvres: e.oeuvres });
    }
    if (!aTraiter.length) {
      if (!silencieux) new obsidian.Notice(tr('Aucun libellé à détacher.'));
      return 0;
    }
    let notes = 0, liens = 0;
    for (const t of aTraiter) {
      // L'œuvre la plus attestée garde le libellé ; les autres sont détachées.
      const tries = t.oeuvres.slice().sort((a, b) => b.n - a.n);
      // Prudence : on ne sépare que sur une preuve symétrique. Deux DOI
      // distincts, ou aucun DOI de part et d'autre. Quand une seule des deux
      // entrées porte un DOI, l'écart peut n'être qu'une lacune de l'une des
      // bibliographies : le chapitre « Risk Governance: An Application… » et le
      // livre « Handbook of performability engineering » qui le contient sont
      // le même travail, et rien dans les titres ne le dit.
      const separables = (a, b) => (a.doi && b.doi) ? a.doi !== b.doi : (!a.doi && !b.doi);
      for (const o of tries.slice(1)) {
        if (!separables(tries[0], o)) continue;
        const r = await this.detacherOeuvre(t.entree, o, true);
        if (r) { notes += 1; liens += r.liens; }
      }
    }
    if (!silencieux) {
      new obsidian.Notice(tr('Détachements : ') + notes + ' ' + tr('note(s)')
        + ', ' + liens + ' ' + tr('lien(s)') + '.', 9000);
    }
    console.log('[Ariane] détachements automatiques :', notes, 'notes,', liens, 'liens');
    return notes;
  }

  // Ouvre le PDF d'une source dans le lecteur ZotFlow, à l'intérieur d'Obsidian.
  // Le lecteur accepte une page : navigation={"pageIndex":N}, en base zéro.
  async ouvrirPdfSource(sourceBasename, page) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === sourceBasename);
    if (!f) { new obsidian.Notice(tr('Note introuvable : ') + sourceBasename); return; }
    const cle = await this.cleAttachement(f);
    if (!cle) { new obsidian.Notice(tr('Cette source n’a pas de PDF attaché.')); return; }
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const lib = fm['library-id'] || '';
    let url = 'obsidian://zotflow?type=open-attachment&libraryID=' + encodeURIComponent(lib)
      + '&key=' + encodeURIComponent(cle);
    if (page) {
      url += '&navigation=' + encodeURIComponent(JSON.stringify({ pageIndex: Math.max(0, page - 1) }));
    }
    window.open(url);
  }

  async ouvrirNote(basename) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === basename);
    if (f) await this.app.workspace.getLeaf(true).openFile(f);
    else new obsidian.Notice(tr('Note introuvable : ') + basename);
  }

  async ouvrirVueReferences() {
    const ex = this.app.workspace.getLeavesOfType(TYPE_VUE_REFS);
    if (ex.length) { this.app.workspace.revealLeaf(ex[0]); return; }
    const feuille = this.app.workspace.getRightLeaf(false);
    if (!feuille) return;
    await feuille.setViewState({ type: TYPE_VUE_REFS, active: true });
    this.app.workspace.revealLeaf(feuille);
  }

  async ouvrirVueIncoherences() {
    const ex = this.app.workspace.getLeavesOfType(TYPE_VUE_INCOHERENCES);
    if (ex.length) { this.app.workspace.revealLeaf(ex[0]); return; }
    const feuille = this.app.workspace.getRightLeaf(false);
    if (!feuille) return;
    await feuille.setViewState({ type: TYPE_VUE_INCOHERENCES, active: true });
    this.app.workspace.revealLeaf(feuille);
  }

  //#endregion Ariane · références en attente
};
