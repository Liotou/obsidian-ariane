
// ── avecIa ────────────────────────────────────────────────────────────────
// Domaine : socle — utilisé par tous les autres mixins.
// Index de voisinage, encodage, fournisseurs LLM. C'est un SERVICE : la biblio
// s'en sert autant que les tâches — d'où sa place dans le socle et non dans un
// greffon (cf. spec du 2026-09-07, §1.b).
const avecIa = (Base) => class extends Base {
  //#region Ariane · suggestions locales
  // ── suggestions locales ──────────────────────────────────────────────────

  /* --------------------- Moteur de suggestions -------------------------- */

  // Fichiers markdown appartenant aux dossiers candidats configurés.
  fichiersCandidatsSuggestions() {
    const dossiers = this.dossiersSuggeres();
    const res = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!dossiers.length || dossiers.some((d) => f.path === d + '.md' || f.path.startsWith(d + '/'))) {
        res.push(f);
      }
    }
    return res;
  }

  // Dossier candidat (le plus spécifique) contenant un chemin, ou '' si aucun.
  // Un dossier candidat est-il retenu par le filtre du panneau ?
  dossierRetenu(dossier) {
    const masques = this.settings.suggDossiersMasques || [];
    return !masques.includes(dossier);
  }

  dossierCandidatDe(chemin) {
    const dossiers = this.dossiersSuggeres()
      .slice().sort((a, b) => b.length - a.length); // plus spécifique d'abord
    for (const d of dossiers) {
      if (chemin === d + '.md' || chemin.startsWith(d + '/')) return d;
    }
    return '';
  }

  // Titre lisible : premier alias, sinon nom de fichier.
  titreLisibleFichier(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const al = cache && cache.frontmatter ? cache.frontmatter.aliases : null;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string' && al) return al;
    return file.basename;
  }

  // Texte indexable d'un fichier candidat : titre (pondéré) + corps nettoyé.
  async texteIndexable(file) {
    let contenu = '';
    try { contenu = await this.app.vault.cachedRead(file); } catch (e) { contenu = ''; }
    const sansFm = contenu.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const propre = sansFm
      .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
      .replace(/[#>*_\[\]\(\)!|^-]+/g, ' ')
      .replace(/\s+/g, ' ');
    const titre = this.titreLisibleFichier(file);
    return titre + ' . ' + titre + ' . ' + propre; // titre compté deux fois
  }

  // (Re)construit l'index des notes candidates : lexical (toujours) et
  // sémantique (si le moteur l'exige et qu'Ollama répond).
  async construireIndexSuggestions() {
    const fichiers = this.fichiersCandidatsSuggestions();
    const entrees = [];
    for (const f of fichiers) {
      const texte = await this.texteIndexable(f);
      if (!texte.trim()) continue;
      entrees.push({ path: f.path, basename: f.basename, titre: this.titreLisibleFichier(f), texte, hash: hacherTexte(texte) });
    }
    this.suggEntrees = entrees;
    this.suggSales = new Set();
    this.recomposerIndexLexical();
    if (this.moteurSemantiqueDemande()) await this.construireIndexSemantique(entrees);
    else this.suggIndexSem = null;
    return this.suggIndex.docs.length;
  }

  moteurSemantiqueDemande() {
    const m = this.settings.suggMoteur || 'hybride';
    return m === 'semantique' || m === 'hybride';
  }

  // Recompose les vecteurs lexicaux à partir des entrées DÉJÀ en mémoire : une
  // centaine de millisecondes pour tout le coffre, sans lire un seul fichier.
  // C'est ce qui permet de ne plus tout relire au moindre enregistrement.
  recomposerIndexLexical() {
    const entrees = this.suggEntrees || [];
    const docsTf = entrees.map((e) => frequenceTermes(tokeniser(e.texte)));
    const idf = calculerIdf(docsTf);
    const docs = entrees.map((e, i) => {
      const v = vecteurTfIdf(docsTf[i], idf);
      return { path: e.path, basename: e.basename, titre: e.titre, vec: v.vec, norme: v.norme };
    });
    this.suggIndex = { docs, idf };
  }

  async assurerIndexSuggestions() {
    if (!this.suggIndex || !this.suggEntrees) { await this.construireIndexSuggestions(); return; }
    if (this.suggSales && this.suggSales.size) await this.rafraichirIndexSuggestions();
  }

  // Une note modifiée ne salit qu'elle-même. Auparavant le moindre
  // enregistrement jetait l'index entier : 1344 notes relues, et 29 Mo de
  // cache d'embeddings relus puis réécrits, à chaque fois.
  marquerNoteSale(file) {
    if (!file || !file.path || !this.suggEntrees) return;
    (this.suggSales = this.suggSales || new Set()).add(file.path);
  }

  async rafraichirIndexSuggestions() {
    const sales = [...(this.suggSales || [])];
    this.suggSales = new Set();
    if (!sales.length) return;
    const parPath = new Map((this.suggEntrees || []).map((e) => [e.path, e]));
    const candidats = new Set(this.fichiersCandidatsSuggestions().map((f) => f.path));
    for (const chemin of sales) {
      const f = this.app.vault.getAbstractFileByPath(chemin);
      if (!f || !f.basename || !candidats.has(chemin)) { parPath.delete(chemin); continue; }
      const texte = await this.texteIndexable(f);
      if (!texte.trim()) { parPath.delete(chemin); continue; }
      parPath.set(chemin, { path: chemin, basename: f.basename, titre: this.titreLisibleFichier(f), texte, hash: hacherTexte(texte) });
    }
    this.suggEntrees = [...parPath.values()];
    this.recomposerIndexLexical();
    if (this.moteurSemantiqueDemande()) await this.construireIndexSemantique(this.suggEntrees);
    else this.suggIndexSem = null;
  }

  invaliderIndexSuggestions() {
    this.suggIndex = null;
    this.suggIndexSem = null;
    this.suggEntrees = null;
    this.suggSales = null;
  }

  /* ---- Embeddings locaux via Ollama (gratuit, hors-ligne) ---- */

  cheminCacheEmbeddings() {
    return this.manifest.dir + '/cache-embeddings.json';
  }

  // Le cache des embeddings pèse 29 Mo. Il vit désormais en mémoire pour toute
  // la session : le relire et le réécrire à chaque mise à jour de l'index
  // coûtait cher, et faisait repartir OneDrive pour rien.
  async assurerCacheEmbeddings(modele) {
    if (this.suggEmb && this.suggEmbModele === modele) return this.suggEmb;
    let entrees = {};
    try {
      const chemin = this.cheminCacheEmbeddings();
      if (await this.app.vault.adapter.exists(chemin)) {
        const j = JSON.parse(await this.app.vault.adapter.read(chemin));
        if (j && j.model === modele && j.entries) entrees = j.entries;
      }
    } catch (e) { /* cache illisible : on repart de zéro */ }
    this.suggEmb = entrees;
    this.suggEmbModele = modele;
    this.suggEmbSale = false;
    this.suggVecs = new Map();
    return entrees;
  }

  // Écriture espacée : au plus une fois toutes les cinq minutes, et à la
  // fermeture. Les 29 Mo n'ont pas à repartir sur le disque à chaque frappe.
  planifierSauvegardeEmbeddings() {
    this.suggEmbSale = true;
    if (this.suggEmbMinuteur) return;
    this.suggEmbMinuteur = setTimeout(() => {
      this.suggEmbMinuteur = null;
      this.sauverCacheEmbeddings().catch(() => { /* fermeture en cours */ });
    }, 5 * 60 * 1000);
  }

  async sauverCacheEmbeddings() {
    if (!this.suggEmbSale || !this.suggEmb) return;
    this.suggEmbSale = false;
    try {
      await this.app.vault.adapter.write(this.cheminCacheEmbeddings(),
        JSON.stringify({ model: this.suggEmbModele, entries: this.suggEmb }));
    } catch (e) { console.debug('[Ariane] sauvegarde cache embeddings', e); }
  }

  // Encode une liste de textes via Ollama. Renvoie null si Ollama est
  // indisponible (le moteur bascule alors sur le lexical).
  /* --- Service d'inférence local : Ollama ou LM Studio --------------- */

  fournisseurLmStudio() {
    return (this.settings.suggFournisseur || 'ollama') === 'lmstudio';
  }

  // Le drapeau est passé explicitement : deux réglages coexistent, celui des
  // suggestions et celui du découpage bibliographique, et ils peuvent différer.
  urlInference(lm) {
    const estLm = lm === undefined ? this.fournisseurLmStudio() : !!lm;
    return estLm
      ? (this.settings.suggLmStudioUrl || 'http://localhost:1234').replace(/\/+$/, '')
      : (this.settings.suggOllamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  }

  // Encode une liste de textes. LM Studio parle l'API d'OpenAI — /v1/embeddings,
  // réponse dans « data[].embedding » — là où Ollama a la sienne. Rend null si
  // le service est indisponible : le moteur bascule alors sur le lexical.
  async encoderTextes(textes) {
    const lm = this.fournisseurLmStudio();
    try {
      const url = this.urlInference() + (lm ? '/v1/embeddings' : '/api/embed');
      const rep = await obsidian.requestUrl({
        url, method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.settings.suggModeleEmbed || 'bge-m3', input: textes }),
      });
      if (rep && rep.status >= 200 && rep.status < 300) {
        const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
        if (lm && Array.isArray(j.data)) return j.data.map((d) => d.embedding);
        if (Array.isArray(j.embeddings)) return j.embeddings;
        if (Array.isArray(j.embedding)) return [j.embedding];
      }
    } catch (e) {
      console.debug('[Ariane] encodage indisponible', e);
    }
    return null;
  }

  // Une génération censée rendre du JSON. Bornée dans les deux dialectes :
  // « num_predict » pour Ollama, « max_tokens » pour LM Studio. Sans cette
  // borne, un modèle qui ne referme pas son objet tourne jusqu'à saturer son
  // contexte — plusieurs minutes à pleine charge.
  async genererJson(prompt, jetons) {
    return this.genererJsonAvec(prompt, jetons || this.settings.suggRerankJetons || 400,
      this.fournisseurLmStudio(), this.settings.suggModeleLLM || 'llama3.2');
  }

  async genererJsonAvec(prompt, max, lm, modele) {
    const url = this.urlInference(lm) + (lm ? '/v1/chat/completions' : '/api/generate');
    try {
      const corps = lm
        // LM Studio refuse « response_format: json_object » — il n'accepte que
        // « json_schema » ou « text », et cela varie d'une version à l'autre.
        // On s'en passe : la consigne est dans l'invite, et l'analyse de la
        // réponse est déjà tolérante. « max_tokens » suffit à borner.
        ? { model: modele, messages: [{ role: 'user', content: prompt }],
            temperature: 0, max_tokens: max }
        : { model: modele, prompt, stream: false, format: 'json', keep_alive: '2m',
            options: { temperature: 0, num_predict: max } };
      const rep = await obsidian.requestUrl({
        url, method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      if (!rep || rep.status < 200 || rep.status >= 300) {
        this._diagIA = 'HTTP ' + (rep ? rep.status : '?') + ' — ' + url
          + (rep && rep.text ? ' : ' + String(rep.text).replace(/\s+/g, ' ').slice(0, 180) : '')
          + tr(' (modèle « ') + modele + tr(' » installé ? service lancé ?)');
        return null;
      }
      const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      if (lm) {
        const c = j && j.choices && j.choices[0];
        const t = c && c.message ? String(c.message.content || '') : '';
        if (!t) this._diagIA = tr('Réponse vide de LM Studio (modèle chargé ?).');
        return t || null;
      }
      const r = (j && typeof j.response === 'string') ? j.response : (rep.text || '');
      if (!r) this._diagIA = tr('Réponse vide d\'Ollama (essayez un autre modèle).');
      else this._diagIA = '';
      return r || null;
    } catch (e) {
      this._diagIA = url + tr(' injoignable : ') + (e && e.message ? e.message : e);
      console.debug('[Ariane] génération indisponible', e);
      return null;
    }
  }

  // Le découpage bibliographique passe par son propre moteur. Les quatre
  // dialectes se rejoignent ici, pour qu'il n'existe qu'un seul endroit où
  // borner la génération et rattraper les erreurs.
  async genererJsonRefs(prompt, jetons) {
    return this.genererAvecFournisseur(prompt, jetons || 300,
      this.settings.refsFournisseur || 'ollama', this.settings.refsModele || 'llama3.2');
  }



  async genererAvecFournisseur(prompt, max, f, modele) {
    if (f === 'mistral') return this.genererMistral(prompt, max, modele);
    if (f === 'claude') return this.genererClaude(prompt, max);
    return this.genererJsonAvec(prompt, max, f === 'lmstudio', modele);
  }

  async genererMistral(prompt, max, modele) {
    const cle = (this.settings.refsCleMistral || '').trim();
    if (!cle) {
      this._diagIA = tr('Clé Mistral absente des réglages.');
      new obsidian.Notice(this._diagIA);
      return null;
    }
    // Un nom de modèle local (llama…, qwen…, …:tag) ne veut rien dire pour
    // Mistral : on retombe alors sur un modèle Mistral valide.
    let m = String(modele || '').trim();
    if (!/^(mistral|ministral|magistral|codestral|pixtral|open-)/i.test(m)) m = 'mistral-small-latest';
    try {
      const rep = await obsidian.requestUrl({
        url: 'https://api.mistral.ai/v1/chat/completions',
        method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cle },
        body: JSON.stringify({
          model: m,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0, max_tokens: max,
          response_format: { type: 'json_object' },
        }),
      });
      if (!rep || rep.status < 200 || rep.status >= 300) {
        this._diagIA = 'Mistral HTTP ' + (rep ? rep.status : '?')
          + (rep && rep.text ? ' : ' + String(rep.text).replace(/\s+/g, ' ').slice(0, 180) : '')
          + tr(' (clé valide ? modèle « ') + m + ' » ?)';
        return null;
      }
      const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      const c = j && j.choices && j.choices[0];
      const t = c && c.message ? String(c.message.content || '') : '';
      this._diagIA = t ? '' : tr('Réponse vide de Mistral.');
      return t || null;
    } catch (e) {
      this._diagIA = tr('Mistral injoignable : ') + (e && e.message ? e.message : e);
      console.debug('[Ariane] Mistral indisponible', e);
      return null;
    }
  }

  // Le CLI de Claude ne demande ni clé ni serveur. On le borne dans le temps :
  // un processus qui ne rend pas la main bloquerait tout le lot.
  genererClaude(prompt, max) {
    const bin = (this.settings.refsCheminClaude || 'claude').trim() || 'claude';
    return new Promise((resoudre) => {
      let fini = false;
      const env = Object.assign({}, process.env, {
        PATH: process.env.HOME + '/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:'
          + (process.env.PATH || ''),
      });
      const enfant = require('child_process').execFile(
        bin, ['-p', prompt], { env, timeout: 60000, maxBuffer: 1 << 20 },
        (err, sortie) => {
          if (fini) return;
          fini = true;
          if (err) this._diagIA = tr('CLI Claude : ') + (err.message || err)
            + tr(' (« ') + bin + tr(' » dans le PATH ?)');
          else this._diagIA = '';
          resoudre(err ? null : String(sortie || '').trim());
        });
      // Sans cela le CLI attend trois secondes une entrée standard qui ne
      // viendra jamais, à chaque appel.
      try { if (enfant.stdin) enfant.stdin.end(); } catch (e) { /* déjà fermée */ }
      setTimeout(() => { if (!fini) { try { enfant.kill('SIGKILL'); } catch (e) { /* déjà mort */ } } }, 61000);
    });
  }

  async testerEncodage() {
    const v = await this.encoderTextes(['test']);
    return !!(v && v[0] && v[0].length);
  }

  async testerLLM() {
    const t = await this.genererJson('Réponds uniquement : {"ok":true}', 32);
    return !!t;
  }

  // Construit l'index sémantique en réutilisant le cache disque : seules les
  // notes nouvelles ou modifiées sont réencodées.
  async construireIndexSemantique(entrees) {
    const modele = this.settings.suggModeleEmbed || 'bge-m3';
    const cache = await this.assurerCacheEmbeddings(modele);
    const aEncoder = entrees.filter((e) => {
      const c = cache[e.path];
      return !(c && c.hash === e.hash && Array.isArray(c.vec));
    });
    const total = aEncoder.length;
    const vue = this.vueSuggestions();
    let notice = null;
    const rapporter = (fait) => {
      const msg = 'Indexation sémantique : ' + fait + ' / ' + total + ' notes…';
      if (notice) notice.setMessage(msg);
      if (vue && vue.marquerIndexation) vue.marquerIndexation(fait, total);
    };
    // Popup uniquement pour un gros index (premier build / reconstruction).
    // Les petites réindexations (note éditée) restent silencieuses.
    if (total > 30) notice = new obsidian.Notice(tr('Indexation sémantique…'), 0);
    if (total > 0) rapporter(0);
    const lot = 24;
    let fait = 0;
    for (let i = 0; i < aEncoder.length; i += lot) {
      const tranche = aEncoder.slice(i, i + lot);
      const vecs = await this.encoderTextes(tranche.map((e) => e.texte));
      if (!vecs) { // Ollama indisponible -> repli lexical
        if (notice) notice.hide();
        if (vue && vue.marquerIndexation) vue.marquerIndexation(-1, total);
        this.suggIndexSem = null;
        return;
      }
      tranche.forEach((e, k) => {
        const v = normaliserVecteur(vecs[k]);
        cache[e.path] = { hash: e.hash, vec: Array.from(v) };
        this.suggVecs.set(e.path, { hash: e.hash, vec: v });
      });
      fait += tranche.length;
      rapporter(fait);
    }
    if (notice) notice.hide();
    if (vue && vue.marquerIndexation) vue.marquerIndexation(total, total, true);

    // Les vecteurs restent en Float32Array d'une mise à jour à l'autre : les
    // reconvertir depuis le JSON coûtait 1,4 million de conversions à chaque
    // reconstruction, pour un résultat identique.
    const docs = [];
    for (const e of entrees) {
      let v = this.suggVecs.get(e.path);
      if (!v || v.hash !== e.hash) {
        const c = cache[e.path];
        if (!c || !Array.isArray(c.vec)) continue;
        v = { hash: c.hash, vec: Float32Array.from(c.vec) };
        this.suggVecs.set(e.path, v);
      }
      docs.push({ path: e.path, basename: e.basename, titre: e.titre, hash: e.hash, vec: v.vec });
    }
    this.suggIndexSem = { model: modele, docs };
    if (total > 0) this.planifierSauvegardeEmbeddings();
  }

  async reclasserLLM(noteTexte, candidats) {
    // Second garde-fou, côté greffon : même borné, un modèle peut être lent.
    // On rend la main au bout du délai réglé plutôt que d'attendre sans fin.
    const secondes = this.settings.suggRerankDelaiSec || 45;
    return Promise.race([
      this._reclasserLLM(noteTexte, candidats),
      new Promise((r) => setTimeout(() => r(null), secondes * 1000)),
    ]);
  }

  async _reclasserLLM(noteTexte, candidats) {
    try {
      const liste = candidats.map((c) => '- [' + c.basename + '] ' + c.titre).join('\n');
      const avecJustif = this.settings.suggRerankJustif !== false;
      const formatJson = avecJustif
        ? '{"resultats":[{"basename":"<identifiant>","raison":"courte justification en français"}]}'
        : '{"resultats":["<identifiant>", "..."]}';
      const prompt =
        'Tu aides un chercheur qui rédige une note. Voici son texte en cours :\n"""\n'
        + noteTexte.slice(0, 1800)
        + '\n"""\n\nParmi les notes candidates ci-dessous, sélectionne et classe les plus pertinentes pour enrichir sa rédaction (de la plus à la moins pertinente). N\'invente aucune note ; recopie exactement les identifiants entre crochets.\n\n'
        + liste
        + '\n\nRéponds UNIQUEMENT en JSON : ' + formatJson + ', au plus '
        + (this.settings.suggK || 8) + ' éléments.';
      const brut = await this.genererJson(prompt);
      if (!brut) return null;
      console.debug('[Ariane] LLM brut', brut);
      // Analyse tolérante : JSON direct, sinon premier bloc { } ou [ ] trouvé.
      let obj = null;
      try { obj = JSON.parse(brut); } catch (e) {
        const m = brut.match(/[\[{][\s\S]*[\]}]/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
      }
      if (!obj) return null;
      // Trouve le tableau de résultats quelle que soit la clé.
      let arr = null;
      if (Array.isArray(obj)) arr = obj;
      else if (Array.isArray(obj.resultats)) arr = obj.resultats;
      else if (Array.isArray(obj.results)) arr = obj.results;
      else if (Array.isArray(obj.suggestions)) arr = obj.suggestions;
      else for (const v of Object.values(obj)) { if (Array.isArray(v)) { arr = v; break; } }
      if (!arr || !arr.length) return null;
      // Appariement tolérant (crochets, .md, casse) sur clé puis titre.
      const norm = (x) => String(x || '').trim().replace(/^\[+|\]+$/g, '').replace(/\.md$/i, '').trim().toLowerCase();
      const parBase = new Map();
      const parTitre = new Map();
      for (const c of candidats) { parBase.set(norm(c.basename), c); parTitre.set(norm(c.titre), c); }
      const ordonne = [];
      for (const r of arr) {
        let id = '', raison = '';
        if (typeof r === 'string') id = r;
        else if (r && typeof r === 'object') {
          id = r.basename || r.id || r.identifiant || r.nom || r.name || r.cle || r.key || r.titre || r.title || '';
          raison = r.raison || r.reason || r.justification || r.pourquoi || '';
        }
        let c = parBase.get(norm(id)) || parTitre.get(norm(id));
        if (c && !ordonne.includes(c)) { c.raison = String(raison || '').trim(); ordonne.push(c); }
      }
      return ordonne.length ? ordonne : null;
    } catch (e) {
      console.debug('[Ariane] reclassement LLM échoué', e);
      return null;
    }
  }

  // Basenames déjà liés dans un contenu (pour ne pas les re-proposer).
  liensExistants(contenu) {
    const set = new Set();
    const re = /\[\[([^\]|#\n]+)/g;
    let m;
    while ((m = re.exec(contenu)) !== null) set.add(cleDeLien(m[1]));
    return set;
  }

  // Meilleures suggestions pour une note : combine score lexical et sémantique
  // selon le moteur choisi. Renvoie { liste, statut }.
  async suggestionsPour(cheminActif, contenu, dejaLies) {
    if (!this.suggIndex || !this.suggIndex.docs.length) return { liste: [], statut: 'vide' };
    const moteur = this.settings.suggMoteur || 'hybride';
    // Score lexical (toujours calculé)
    const { vec, norme } = vecteurTfIdf(frequenceTermes(tokeniser(contenu)), this.suggIndex.idf);
    const lex = new Map();
    for (const d of this.suggIndex.docs) lex.set(d.path, cosinusTfIdf(vec, norme, d.vec, d.norme));
    // Score sémantique (si disponible)
    let sem = null;
    let statut = 'lexical';
    if (moteur !== 'lexical' && this.suggIndexSem && this.suggIndexSem.docs.length) {
      // La requête change peu d'un recalcul à l'autre : revenir sur une note
      // déjà vue ne doit plus coûter 600 ms d'Ollama.
      const extrait = contenu.slice(0, 4000);
      const empreinte = hacherTexte(extrait);
      this.suggReqCache = this.suggReqCache || new Map();
      let q = this.suggReqCache.get(empreinte);
      if (!q) {
        const qv = await this.encoderTextes([extrait]);
        if (qv && qv[0]) {
          q = normaliserVecteur(qv[0]);
          if (this.suggReqCache.size > 24) this.suggReqCache.clear();
          this.suggReqCache.set(empreinte, q);
        }
      }
      if (q) {
        sem = new Map();
        for (const d of this.suggIndexSem.docs) sem.set(d.path, cosinusVecteurs(q, d.vec));
        statut = moteur === 'semantique' ? 'sémantique' : 'hybride';
      } else {
        statut = 'lexical (repli)';
      }
    }
    const w = typeof this.settings.suggPoidsSemantique === 'number' ? this.settings.suggPoidsSemantique : 0.7;
    const seuil = typeof this.settings.suggSeuil === 'number' ? this.settings.suggSeuil : 0.18;
    const res = [];
    for (const d of this.suggIndex.docs) {
      if (d.path === cheminActif) continue;
      if (dejaLies && dejaLies.has(d.basename)) continue;
      const l = lex.get(d.path) || 0;
      const s = sem ? (sem.get(d.path) || 0) : 0;
      let score;
      if (!sem) score = l;
      else if (moteur === 'semantique') score = s;
      else score = w * s + (1 - w) * l;
      if (score < seuil) continue;
      const dossier = this.dossierCandidatDe(d.path);
      if (!this.dossierRetenu(dossier)) continue;   // filtre du panneau
      res.push({ path: d.path, basename: d.basename, titre: d.titre, score, dossier });
    }
    res.sort((a, b) => b.score - a.score);
    return { liste: res.slice(0, this.settings.suggK || 8), statut };
  }

  vueSuggestions() {
    // Obsidian 1.7 diffère l'instanciation des vues : une feuille peut exister
    // sans que sa vue le soit encore. On ne renvoie qu'une vue réellement prête.
    const feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    for (const f of feuilles) {
      const v = f ? f.view : null;
      if (v && typeof v.rendre === 'function') return v;
    }
    return null;
  }

  // Recalcule et pousse les suggestions vers la vue, si ouverte.
  // forcerRerank : autorise le reclassement LLM (changement de note / manuel).
  // Une vue existe même repliée dans la barre latérale ou cachée derrière un
  // autre onglet. Tant qu'elle n'est pas RÉELLEMENT affichée, tout calcul est
  // perdu — et c'est ce qui faisait tourner Ollama pour rien. Le test porte sur
  // les dimensions du conteneur, ce qui vaut aussi en fenêtre détachée.
  vueSuggestionsVisible() {
    const v = this.vueSuggestions();
    const el = v ? v.containerEl : null;
    if (!el) return null;
    return (el.offsetWidth > 0 || el.offsetHeight > 0) ? v : null;
  }

  async majSuggestions(forcerRerank, ignorerVisibilite) {
    const vue = ignorerVisibilite ? this.vueSuggestions() : this.vueSuggestionsVisible();
    if (!vue) return;
    if (!this.settings.suggActif) { vue.rendre([], null, 'inactif'); return; }
    await this.assurerIndexSuggestions();
    const anc = this.suggAncrage;
    const file = this.app.workspace.getActiveFile();
    let cheminActif = '', requete = null, dejaLies = new Set();
    if (anc) {
      cheminActif = anc.sourcePath || (file ? file.path : '');
      requete = anc.texte;
    } else {
      if (!file || file.extension !== 'md') { if (vue.montrerAncrage) vue.montrerAncrage(null); vue.rendre([], null); return; }
      cheminActif = file.path;
      try { requete = await this.app.vault.cachedRead(file); } catch (e) { requete = ''; }
      dejaLies = this.liensExistants(requete);
    }
    if (vue.montrerAncrage) vue.montrerAncrage(anc ? anc.texte : null);
    const etiq = anc ? { basename: 'Argument sélectionné' } : file;
    const jeton = (this._suggJeton = (this._suggJeton || 0) + 1);
    const { liste, statut } = await this.suggestionsPour(cheminActif, requete, dejaLies);
    if (jeton !== this._suggJeton) return;
    vue.rendre(liste, etiq, (anc ? 'argument · ' : '') + statut);
    const reclasser = (forcerRerank || this.settings.suggRerankAuto === true)
      && this.settings.suggRerank && liste.length
      && (statut === 'sémantique' || statut === 'hybride');
    if (reclasser) {
      vue.marquerReclassement(true);
      const topN = liste.slice(0, this.settings.suggRerankTopN || 12).map((x) => Object.assign({}, x));
      const reclasse = await this.reclasserLLM(requete, topN);
      if (jeton !== this._suggJeton) return;
      vue.marquerReclassement(false);
      if (reclasse && reclasse.length) vue.rendre(reclasse, etiq, (anc ? 'argument · ' : '') + statut + ' + LLM');
      else vue.rendre(liste, etiq, (anc ? 'argument · ' : '') + statut + ' · LLM indisponible');
    }
  }

  // Suggestions ciblées sur un passage sélectionné (clic droit).
  async suggestionsPourArgument(texte) {
    if (!texte || !texte.trim()) return;
    await this.assurerIndexSuggestions();
    const file = this.app.workspace.getActiveFile();
    const cheminActif = file ? file.path : '';
    if ((this.settings.suggArgAffichage || 'panneau') === 'flottant') {
      const { liste } = await this.suggestionsPour(cheminActif, texte, new Set());
      this.afficherFenetreArgument(texte, liste);
    } else {
      this.suggAncrage = { texte, sourcePath: cheminActif };
      await this.ouvrirVueSuggestions();
      this.majSuggestions(true, true);
    }
  }

  libererAncrage() { this.suggAncrage = null; this.majSuggestions(false, true); }

  // Un item de suggestion (cliquable, glissable, aperçu au survol).
  construireItemSugg(container, sug, hoverParent) {
    const styleDe = (d) => this.styleDuDossier(d);
    const item = container.createDiv({ cls: 'zfa-sugg-item' });
    item.setAttribute('draggable', 'true');
    const style = sug.dossier ? styleDe(sug.dossier) : null;
    if (style && style.couleur) { item.addClass('zfa-sugg-colore'); item.style.setProperty('--zfa-sugg-couleur', style.couleur); }
    const tete = item.createDiv({ cls: 'zfa-sugg-tete' });
    if (style && style.icone) { const ic = tete.createSpan({ cls: 'zfa-sugg-icone' }); obsidian.setIcon(ic, style.icone); if (style.couleur) ic.style.color = style.couleur; }
    tete.createSpan({ cls: 'zfa-sugg-lien', text: sug.titre });
    if (sug.raison) item.createDiv({ cls: 'zfa-sugg-raison', text: sug.raison });
    const pct = typeof sug.score === 'number' ? Math.round(sug.score * 100) + '%  ·  ' : '';
    item.createDiv({ cls: 'zfa-sugg-meta', text: pct + sug.basename });
    item.addEventListener('click', () => this.app.workspace.openLinkText(sug.basename, '', false));
    item.addEventListener('mouseover', (event) => this.app.workspace.trigger('hover-link', { event, source: 'zfa-suggestions', hoverParent: hoverParent || this, targetEl: item, linktext: sug.path || sug.basename, sourcePath: '' }));
    item.addEventListener('dragstart', (e) => { if (e.dataTransfer) { e.dataTransfer.setData('text/plain', '[[' + sug.basename + ']]'); e.dataTransfer.effectAllowed = 'copy'; } });
    return item;
  }

  afficherFenetreArgument(texte, suggestions) {
    this.fermerFenetreArgument();
    const el = document.createElement('div');
    el.className = 'zfa-argfen';
    el.style.top = '90px'; el.style.right = '40px';
    const header = el.createDiv({ cls: 'zfa-argfen-header' });
    header.createSpan({ cls: 'zfa-argfen-titre', text: tr("Suggestions pour l'argument") });
    const x = header.createSpan({ cls: 'zfa-argfen-x', text: tr('✕') });
    x.onmousedown = (e) => e.stopPropagation();
    x.onclick = () => this.fermerFenetreArgument();
    const snip = String(texte).replace(/\s+/g, ' ').trim();
    el.createDiv({ cls: 'zfa-argfen-arg', text: snip.slice(0, 160) + (snip.length > 160 ? '…' : '') });
    const liste = el.createDiv({ cls: 'zfa-argfen-liste' });
    if (!suggestions || !suggestions.length) liste.createDiv({ cls: 'zfa-sugg-vide', text: tr('Aucune suggestion pertinente.') });
    else for (const sug of suggestions) this.construireItemSugg(liste, sug, this);
    this.rendreDeplacable(el, header);
    document.body.appendChild(el);
    this.argFenetreEl = el;
  }

  fermerFenetreArgument() { if (this.argFenetreEl) { this.argFenetreEl.remove(); this.argFenetreEl = null; } }

  async ouvrirVueSuggestions() {
    let feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    if (!feuilles.length) {
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: 'zfa-suggestions', active: true });
      feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    }
    if (feuilles.length) this.app.workspace.revealLeaf(feuilles[0]);
    this.majSuggestions();
  }

  //#endregion Ariane · suggestions locales
};
