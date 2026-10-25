// ── avecLecturesWeb ───────────────────────────────────────────────────────
// Domaine : la liste de lecture de Safari, lue sans commande.
// Au démarrage puis toutes les heures, Ariane lit la liste de lecture de
// Safari (Bookmarks.plist, en lecture seule : Safari n'est jamais modifié)
// et fait de chaque article nouveau une note du dossier des lectures web :
// le texte principal de la page, débarrassé de ses menus et de ses
// publicités, en Markdown, lisible hors ligne. Une page illisible (accès
// payant, site tout en JavaScript) donne une note d'aperçu, retentée aux
// passages suivants. Au clic droit, « Ajouter à Zotero » passe l'article à
// Zotero ouvert, par l'entrée locale de son connecteur.
// Il faut à Obsidian l'« Accès complet au disque ».
const avecLecturesWeb = (Base) => class extends Base {
  //#region Ariane · static · lectures web

  // Un fichier plist au format XML (plutil -convert xml1) en valeurs
  // JavaScript : dict en objet, array en tableau, date et data en chaînes.
  static lirePlist(xml) {
    const s = String(xml || '');
    const ents = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    const texte = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ents[e] != null ? ents[e] : m;
    });
    const re = /<(\/?)(dict|array|key|string|date|data|integer|real|true|false)(\s*\/)?>/g;
    let m;
    const valeur = () => {
      m = re.exec(s);
      if (!m) return undefined;
      const [, fin, tag, vide] = m;
      if (fin) return { fin: tag };
      if (tag === 'true') return true;
      if (tag === 'false') return false;
      if (vide) return tag === 'dict' ? {} : tag === 'array' ? [] : '';
      if (tag === 'dict') {
        const o = {};
        for (;;) {
          const k = valeur();
          if (k === undefined || (k && k.fin === 'dict')) return o;
          if (!k || typeof k !== 'object' || k.cle === undefined) continue;
          const v = valeur();
          if (v === undefined || (v && v.fin)) return o;
          o[k.cle] = v;
        }
      }
      if (tag === 'array') {
        const a = [];
        for (;;) {
          const v = valeur();
          if (v === undefined || (v && v.fin === 'array')) return a;
          a.push(v);
        }
      }
      const debut = re.lastIndex;
      const fermeture = s.indexOf('</' + tag + '>', debut);
      const brut = s.slice(debut, fermeture < 0 ? s.length : fermeture);
      re.lastIndex = fermeture < 0 ? s.length : fermeture + tag.length + 3;
      if (tag === 'key') return { cle: texte(brut) };
      if (tag === 'integer' || tag === 'real') return Number(brut);
      return texte(brut);
    };
    for (;;) {
      const v = valeur();
      if (v === undefined) return null;
      if (v && typeof v === 'object' && !v.fin && v.cle === undefined) return v;
    }
  }

  // Les articles de la liste de lecture : [{ url, titre, ajoute, apercu }].
  static listeLectureSafari(racine) {
    const out = [];
    const parcourir = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.Title === 'com.apple.ReadingList' && Array.isArray(n.Children)) {
        for (const c of n.Children) {
          if (!c || !c.URLString) continue;
          const rl = c.ReadingList || {};
          out.push({
            url: String(c.URLString),
            titre: String((c.URIDictionary && c.URIDictionary.title) || '').trim(),
            ajoute: String(rl.DateAdded || '').slice(0, 10),
            apercu: String(rl.PreviewText || '').trim(),
          });
        }
        return;
      }
      for (const c of n.Children || []) parcourir(c);
    };
    parcourir(racine);
    return out;
  }

  // Une adresse réduite à ce qui l'identifie : sans ancre, sans paramètres
  // de suivi, sans barre finale, hôte en minuscules.
  static urlNormalisee(u) {
    let x;
    try { x = new URL(String(u || '').trim()); } catch (e) { return String(u || '').trim(); }
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|xtor$|at_)/i.test(k)) x.searchParams.delete(k);
    }
    x.hostname = x.hostname.toLowerCase();
    if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, '');
    return x.toString();
  }

  // La note d'un article. a : { titre, url, site, auteur, publie, ajoute,
  // apercu, markdown, complet }.
  static noteArticle(a) {
    const q = (v) => JSON.stringify(String(v || ''));
    const l = ['---', 'Type: article web', 'url: ' + q(a.url), 'site: ' + q(a.site), 'auteur: ' + q(a.auteur)];
    l.push('publié-le: ' + (a.publie || ''));
    l.push('ajouté-le: ' + (a.ajoute || ''));
    l.push('contenu: ' + (a.complet ? 'complet' : 'aperçu'));
    if (!a.complet) l.push('tentatives: ' + (Number(a.tentatives) || 1));
    l.push('---', '# ' + (a.titre || a.url), '');
    l.push(Ariane.blocArticle(a));
    return l.join('\n') + '\n';
  }

  // Le corps entretenu par Ariane, entre ses marques : réécrit quand une page
  // illisible finit par se lire, sans toucher à ce que Monsieur a ajouté.
  static blocArticle(a) {
    const l = [ZFA_ARTICLE_DEBUT, '[' + tr('Lire en ligne') + '](' + a.url + ')', ''];
    if (a.complet) l.push(String(a.markdown || '').trim());
    else {
      if (a.apercu) l.push('> ' + a.apercu.replace(/\n+/g, ' '), '');
      l.push('*' + tr('Page illisible hors du navigateur pour l’instant : Ariane la retentera.') + '*');
    }
    l.push(ZFA_ARTICLE_FIN);
    return l.join('\n');
  }

  // Le texte principal d'une page, et ce qu'elle dit d'elle-même. `doc` :
  // document analysé (DOMParser), modifié sur place. Rend { titre, site,
  // auteur, publie, extrait, html, longueur }.
  static extraireArticle(doc, adresse) {
    const attr = (sel, a) => { const e = doc.querySelector(sel); return e ? String(e.getAttribute(a || 'content') || '').trim() : ''; };
    let ld = {};
    for (const sc of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(sc.textContent || '');
        const liste = [].concat(j && j['@graph'] ? j['@graph'] : j);
        const art = liste.find((x) => x && /Article|BlogPosting|Report/i.test([].concat(x['@type'] || '').join(' ')));
        if (art) { ld = art; break; }
      } catch (e) { /* JSON-LD illisible */ }
    }
    const nomLd = (v) => [].concat(v || []).map((x) => (typeof x === 'string' ? x : (x && x.name) || '')).filter(Boolean).join(', ');
    const titreBalise = doc.querySelector('title');
    const titre = attr('meta[property="og:title"]') || String(ld.headline || '').trim()
      || (titreBalise ? titreBalise.textContent.trim() : '');
    let site = attr('meta[property="og:site_name"]') || nomLd(ld.publisher);
    if (!site) { try { site = new URL(adresse).hostname.replace(/^www\./, ''); } catch (e) { site = ''; } }
    let auteur = nomLd(ld.author) || attr('meta[name="author"]') || attr('meta[property="article:author"]');
    if (/^https?:/i.test(auteur)) auteur = '';
    const temps = doc.querySelector('time[datetime]');
    const publie = String(ld.datePublished || attr('meta[property="article:published_time"]')
      || attr('meta[name="date"]') || (temps ? temps.getAttribute('datetime') : '') || '').slice(0, 10);
    const extrait = attr('meta[property="og:description"]') || attr('meta[name="description"]');

    for (const e of doc.querySelectorAll('script, style, noscript, iframe, form, nav, footer, aside, button, svg, canvas, dialog, template, '
      + '[role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"], [hidden]')) e.remove();
    const textePara = (e) => [...e.querySelectorAll('p')].reduce((t, p) => t + (p.textContent || '').trim().length, 0);
    const bruit = /(^|[\s_-])(comments?|share|sharing|social|promo|related|newsletter|cookies?|subscribe|advert|ads?|sponsor|sidebar|breadcrumbs?|menu|popup|modal|banner|paywall|recommend\w*)([\s_-]|$)/i;
    for (const e of doc.querySelectorAll('[class], [id]')) {
      if (!e.isConnected || /^(BODY|HTML|MAIN|ARTICLE)$/.test(e.tagName)) continue;
      if (bruit.test((e.getAttribute('class') || '') + ' ' + (e.id || '')) && textePara(e) < 200) e.remove();
    }
    let cible = null;
    let meilleur = 0;
    for (const e of doc.querySelectorAll('article, [itemprop="articleBody"], main, [role="main"]')) {
      const n = textePara(e);
      if (n > meilleur) { meilleur = n; cible = e; }
    }
    if (!cible || meilleur < 500) {
      const scores = new Map();
      for (const p of doc.querySelectorAll('p')) {
        const n = (p.textContent || '').trim().length;
        if (n < 40) continue;
        const a = p.parentElement;
        if (a) scores.set(a, (scores.get(a) || 0) + n);
        if (a && a.parentElement) scores.set(a.parentElement, (scores.get(a.parentElement) || 0) + n / 2);
      }
      for (const [e, n] of scores) if (n > meilleur) { meilleur = n; cible = e; }
    }
    cible = cible || doc.body;
    if (!cible) return { titre, site, auteur, publie, extrait, html: '', longueur: 0 };
    const absolue = (v) => { try { return new URL(v, adresse).href; } catch (e) { return v; } };
    for (const a of cible.querySelectorAll('a[href]')) a.setAttribute('href', absolue(a.getAttribute('href')));
    for (const img of cible.querySelectorAll('img')) {
      const src = img.getAttribute('data-src') || img.getAttribute('src')
        || String(img.getAttribute('srcset') || '').split(',')[0].trim().split(/\s+/)[0];
      if (src) img.setAttribute('src', absolue(src)); else img.remove();
    }
    // Le titre de la note suffit : un premier titre identique ne se répète pas.
    const net = (x) => String(x || '').replace(/\s+/g, ' ').trim();
    const h1 = cible.querySelector('h1');
    if (h1 && titre && net(h1.textContent) === net(titre)) h1.remove();
    return { titre, site, auteur, publie, extrait, html: cible.innerHTML, longueur: textePara(cible) };
  }

  // L'élément Zotero d'un article (page web), pour le connecteur.
  static elementZoteroArticle(fm, maintenant) {
    const d = new Date(maintenant || Date.now());
    const p = (n) => String(n).padStart(2, '0');
    const acces = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
      + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    const creators = String(fm.auteur || '').split(/\s*,\s*/).filter(Boolean).map((n) => {
      const mots = n.trim().split(/\s+/);
      return mots.length > 1
        ? { creatorType: 'author', firstName: mots.slice(0, -1).join(' '), lastName: mots[mots.length - 1] }
        : { creatorType: 'author', lastName: n.trim(), fieldMode: 1 };
    });
    return {
      itemType: 'webpage', title: String(fm.titre || fm.url || ''), url: String(fm.url || ''),
      websiteTitle: String(fm.site || ''), date: String(fm['publié-le'] || ''), accessDate: acces,
      creators, tags: [], attachments: [], notes: [],
    };
  }

  //#endregion Ariane · static · lectures web

  //#region Ariane · lectures web (liste de lecture de Safari)

  get dossierLecturesWeb() {
    return String(this.settings.dossierLecturesWeb || '12 - Liste de lectures Web').replace(/\/+$/, '');
  }

  lecturesWebActives() {
    return !!(obsidian.Platform.isMacOS && obsidian.Platform.isDesktopApp && this.settings.lecturesWebActif !== false);
  }

  // Au démarrage (un peu après, pour ne pas peser sur l'ouverture), puis
  // toutes les heures. Sans commande.
  demarrerLecturesWeb() {
    this.app.workspace.onLayoutReady(() => {
      const t = window.setTimeout(() => this.importerListeLecture(), 30000);
      this.register(() => window.clearTimeout(t));
    });
    this.registerInterval(window.setInterval(() => this.importerListeLecture(), 60 * 60000));
    // « Ajouter à Zotero », au clic droit sur une note d'article.
    const entree = (menu, f) => {
      if (!f || f.extension !== 'md' || !f.path.startsWith(this.dossierLecturesWeb + '/')) return;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (!fm.url || fm.zotero) return;
      menu.addItem((it) => it.setTitle(tr('Ariane : ajouter à Zotero')).setIcon('book-plus')
        .onClick(() => this.ajouterArticleZotero(f)));
    };
    this.registerEvent(this.app.workspace.on('file-menu', (menu, f) => entree(menu, f)));
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, ed, vue) => entree(menu, vue && vue.file)));
  }

  // Le contenu de Bookmarks.plist, en XML. null si Safari est illisible ;
  // `this._lectureAcces` dit alors pourquoi.
  _lirePlistSafari() {
    const chemin = require('path').join(require('os').homedir(), 'Library', 'Safari', 'Bookmarks.plist');
    return new Promise((fin) => {
      executer('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', chemin], { maxBuffer: 64 << 20, timeout: 30000 }, (err, sortie, erreurs) => {
        if (!err) { this._lectureAcces = ''; fin(String(sortie || '')); return; }
        const msg = String(erreurs || err.message || '');
        this._lectureAcces = /not permitted|EPERM|EACCES|Permission denied/i.test(msg) ? 'acces' : (msg.trim() || 'erreur');
        fin(null);
      });
    });
  }

  _avisAccesSafari() {
    if (this._lectureAvisDonne) return;
    this._lectureAvisDonne = true;
    const frag = document.createDocumentFragment();
    frag.appendText(tr('Liste de lecture de Safari : Obsidian n’a pas le droit de la lire. Donnez-lui l’« Accès complet au disque », puis relancez Obsidian. '));
    const a = frag.createEl('a', { text: tr('Ouvrir les Réglages Système'), href: '#' });
    a.addEventListener('click', (e) => {
      e.preventDefault();
      try { require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'); } catch (err) { /* rien */ }
    });
    new obsidian.Notice(frag, 20000);
  }

  // Les notes d'article du coffre, par adresse normalisée.
  _articlesConnus() {
    const m = new Map();
    const d = this.dossierLecturesWeb + '/';
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(d)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.url) m.set(Ariane.urlNormalisee(fm.url), { fichier: f, fm });
    }
    return m;
  }

  async importerListeLecture() {
    if (!this.lecturesWebActives() || this._lectureEnCours) return 0;
    this._lectureEnCours = true;
    try {
      const xml = await this._lirePlistSafari();
      if (xml == null) {
        if (this._lectureAcces === 'acces') this._avisAccesSafari();
        else console.warn('[Ariane] liste de lecture de Safari :', this._lectureAcces);
        return 0;
      }
      const articles = Ariane.listeLectureSafari(Ariane.lirePlist(xml));
      const connus = this._articlesConnus();
      let n = 0;
      // Les plus récents d'abord, et pas plus de quinze pages par passage.
      const nouveaux = articles.filter((a) => !connus.has(Ariane.urlNormalisee(a.url)))
        .sort((x, y) => (y.ajoute || '').localeCompare(x.ajoute || '')).slice(0, 15);
      for (const a of nouveaux) {
        try { if (await this._creerNoteArticle(a)) n += 1; }
        catch (e) { console.warn('[Ariane] article ' + a.url + ' :', e); }
      }
      // Les pages restées illisibles : retentées, trois fois au plus, une heure au moins après.
      for (const { fichier, fm } of connus.values()) {
        if (fm.contenu !== 'aperçu' || (Number(fm.tentatives) || 0) >= 3) continue;
        if (Date.now() - fichier.stat.mtime < 60 * 60000) continue;
        try { await this._relireArticle(fichier, fm); } catch (e) { console.warn('[Ariane] article ' + fm.url + ' :', e); }
      }
      if (n) new obsidian.Notice(n + tr(' article(s) de la liste de lecture enregistré(s) dans « ') + this.dossierLecturesWeb + ' ».');
      return n;
    } finally {
      this._lectureEnCours = false;
    }
  }

  // La page d'un article, lue et nettoyée : { titre, site, auteur, publie,
  // extrait, markdown } ou null si elle ne se lit pas.
  async _lireArticle(url) {
    let rep;
    try {
      rep = await obsidian.requestUrl({ url, method: 'GET', throw: false, headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      } });
    } catch (e) { return null; }
    if (!rep || rep.status < 200 || rep.status >= 300) return null;
    const type = String((rep.headers && (rep.headers['content-type'] || rep.headers['Content-Type'])) || '');
    if (type && !/html/i.test(type)) return null;
    // Le jeu de caractères de l'en-tête, sinon celui que la page annonce.
    const octets = new Uint8Array(rep.arrayBuffer);
    let jeu = (type.match(/charset=([\w-]+)/i) || [])[1];
    if (!jeu) {
      const debut = new TextDecoder('ascii').decode(octets.slice(0, 4096));
      jeu = (debut.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
    }
    let html;
    try { html = new TextDecoder(jeu || 'utf-8').decode(octets); } catch (e) { html = new TextDecoder('utf-8').decode(octets); }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const a = Ariane.extraireArticle(doc, url);
    if (!a.html || a.longueur < 300) return Object.assign(a, { markdown: '' });
    const md = obsidian.htmlToMarkdown(a.html).replace(/\n{3,}/g, '\n\n').trim();
    return Object.assign(a, { markdown: md });
  }

  async _creerNoteArticle(entree) {
    const lu = await this._lireArticle(entree.url);
    const complet = !!(lu && lu.markdown);
    const titre = (lu && lu.titre) || entree.titre || entree.url;
    await this.assurerDossier(this.dossierLecturesWeb);
    const base = this.nettoyerNomFichier(titre).replace(/[.\s#^[\]]+$/, '').slice(0, 120) || 'Article';
    let chemin = this.dossierLecturesWeb + '/' + base + '.md';
    for (let k = 2; this.app.vault.getAbstractFileByPath(chemin); k += 1) chemin = this.dossierLecturesWeb + '/' + base + ' (' + k + ').md';
    await this.ecrire(chemin, Ariane.noteArticle({
      titre, url: entree.url, site: lu ? lu.site : '', auteur: lu ? lu.auteur : '', publie: lu ? lu.publie : '',
      ajoute: entree.ajoute, apercu: entree.apercu || (lu ? lu.extrait : ''), markdown: lu ? lu.markdown : '', complet,
    }));
    return true;
  }

  // Une note d'aperçu dont la page se lit enfin : son bloc reçoit l'article.
  async _relireArticle(fichier, fm) {
    const lu = await this._lireArticle(fm.url);
    this.marquerEcriture(fichier.path);
    if (!lu || !lu.markdown) {
      await this.app.fileManager.processFrontMatter(fichier, (x) => { x.tentatives = (Number(x.tentatives) || 1) + 1; });
      return false;
    }
    const bloc = Ariane.blocArticle({ url: fm.url, complet: true, markdown: lu.markdown });
    await this.app.vault.process(fichier, (t) => {
      const d = t.indexOf(ZFA_ARTICLE_DEBUT);
      const f = t.indexOf(ZFA_ARTICLE_FIN);
      return d >= 0 && f > d ? t.slice(0, d) + bloc + t.slice(f + ZFA_ARTICLE_FIN.length) : t + '\n' + bloc + '\n';
    });
    this.marquerEcriture(fichier.path);
    await this.app.fileManager.processFrontMatter(fichier, (x) => {
      x.contenu = 'complet';
      delete x.tentatives;
      if (!x.site && lu.site) x.site = lu.site;
      if (!x.auteur && lu.auteur) x.auteur = lu.auteur;
      if (!x['publié-le'] && lu.publie) x['publié-le'] = lu.publie;
    });
    return true;
  }

  // Passe l'article à Zotero ouvert, comme le ferait son extension de
  // navigateur : une page web, que ZotFlow rapatriera ensuite.
  async ajouterArticleZotero(fichier) {
    const cache = this.app.metadataCache.getFileCache(fichier) || {};
    const fm = Object.assign({}, cache.frontmatter || {});
    if (!fm.url) return false;
    const h1 = (cache.headings || []).find((h) => h.level === 1);
    fm.titre = h1 ? h1.heading : fichier.basename;
    const base = 'http://127.0.0.1:23119/connector/';
    const entetes = { 'Content-Type': 'application/json', 'X-Zotero-Connector-API-Version': '3' };
    try {
      const ping = await obsidian.requestUrl({ url: base + 'ping', method: 'GET', throw: false });
      if (!ping || ping.status !== 200) throw new Error('ping');
    } catch (e) {
      new obsidian.Notice(tr('Zotero n’est pas ouvert : ouvrez-le, puis recommencez.'));
      return false;
    }
    const corps = { sessionID: 'ariane-' + Date.now().toString(36), uri: fm.url,
      items: [Object.assign({ id: 'ariane-1' }, Ariane.elementZoteroArticle(fm))] };
    const rep = await obsidian.requestUrl({ url: base + 'saveItems', method: 'POST', throw: false,
      headers: entetes, body: JSON.stringify(corps) });
    if (!rep || rep.status < 200 || rep.status >= 300) {
      new obsidian.Notice(tr('Zotero a refusé l’article (HTTP ') + (rep ? rep.status : '?') + ').', 9000);
      return false;
    }
    this.marquerEcriture(fichier.path);
    await this.app.fileManager.processFrontMatter(fichier, (x) => { x.zotero = 'ajouté le ' + jourIsoDe(new Date()); });
    new obsidian.Notice(tr('Article ajouté à Zotero : ZotFlow le rapatriera à sa prochaine synchronisation.'));
    return true;
  }

  //#endregion Ariane · lectures web (liste de lecture de Safari)
};
