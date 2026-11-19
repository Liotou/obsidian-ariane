// ── avecNotesManuscrites ──────────────────────────────────────────────────
// Domaine : les cahiers de la tablette Boox (module « manuscrites »).
// La Boox dépose chaque cahier en PDF vectoriel sur un WebDAV, à la fermeture
// du cahier, sous « onyx/<appareil>/<dossier>/<nom>.pdf ». Ariane le relit
// depuis l'ordinateur : une note NM-AAAAMMJJHHMM par cahier (date de la
// première fois qu'Ariane le voit, figée ensuite), le PDF entier dans le
// dossier des pièces jointes, et les séances d'écriture repérées par les
// traits nouveaux. Chaque trait du PDF de la Boox porte un identifiant
// stable : ce qui est nouveau depuis le passage précédent est donc exact.
// Rien n'est jamais supprimé ; un cahier disparu est seulement signalé.
const avecNotesManuscrites = (Base) => class extends Base {
  //#region Ariane · notes manuscrites
  // ── fonctions pures (testées seules) ──

  // Le nom d'une note manuscrite, d'après une date locale.
  static nomNoteManuscrite(d) {
    const x = d instanceof Date ? d : new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return 'NM-' + x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate()) + p(x.getHours()) + p(x.getMinutes());
  }

  // « AAAA-MM-JJTHH:MM », en heure locale.
  static isoLocalManuscrit(d) {
    const x = d instanceof Date ? d : new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()) + 'T' + p(x.getHours()) + ':' + p(x.getMinutes());
  }

  // La réponse d'un PROPFIND (207 Multi-Status) : une entrée par ressource.
  // Les préfixes d'espace de noms varient d'un serveur à l'autre (d:, D:,
  // lp1:…), d'où la lecture par motifs plutôt que par un analyseur XML, qui
  // manquerait d'ailleurs aux tests. chemin : décodé, relatif à la base.
  static listeWebdav(xml, base) {
    const t = String(xml || '');
    const baseChemin = (() => {
      try { return decodeURIComponent(new URL(base).pathname); } catch (e) { return String(base || ''); }
    })().replace(/\/+$/, '') + '/';
    const balise = (bloc, nom) => {
      const m = new RegExp('<(?:[\\w-]+:)?' + nom + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + nom + '>', 'i').exec(bloc);
      return m ? m[1].trim() : '';
    };
    const entites = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const sortie = [];
    for (const m of t.matchAll(/<(?:[\w-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)) {
      const bloc = m[1];
      const href = entites(balise(bloc, 'href'));
      if (!href) continue;
      let absolu;
      try { absolu = decodeURIComponent(/^https?:/i.test(href) ? new URL(href).pathname : href); } catch (e) { absolu = href; }
      const dossier = /<(?:[\w-]+:)?collection\s*\/?>/i.test(balise(bloc, 'resourcetype'));
      let chemin = absolu.startsWith(baseChemin) ? absolu.slice(baseChemin.length) : absolu.replace(/^\/+/, '');
      chemin = chemin.replace(/\/+$/, '');
      const modif = Date.parse(balise(bloc, 'getlastmodified'));
      sortie.push({
        chemin, href, dossier,
        taille: Number(balise(bloc, 'getcontentlength')) || 0,
        modif: Number.isFinite(modif) ? modif : 0,
        etag: entites(balise(bloc, 'getetag')).replace(/^W\//, '').replace(/"/g, ''),
      });
    }
    return sortie;
  }

  // Ce que dit le chemin d'un cahier : « onyx/NoteAir5C/Cahiers/Nom.pdf ».
  static cheminCahierBoox(chemin) {
    const morceaux = String(chemin || '').split('/').filter(Boolean);
    const i = morceaux.findIndex((x) => x.toLowerCase() === 'onyx');
    const utiles = i >= 0 ? morceaux.slice(i + 1) : morceaux;
    const nom = (utiles.pop() || '').replace(/\.pdf$/i, '');
    const appareil = i >= 0 && utiles.length ? utiles.shift() : '';
    return { titre: nom, appareil, dossier: utiles.join('/') };
  }

  // Un PDF arrivé en entier se termine par « %%EOF ». La Boox met plus
  // d'une minute à envoyer un gros cahier : lu trop tôt, il est tronqué.
  static pdfComplet(texte) {
    const t = String(texte || '');
    return t.startsWith('%PDF') && /%%EOF\s*$/.test(t.slice(-2048));
  }

  // Une date de PDF (« D:20261119102437 ») : la Boox l'écrit en heure
  // locale, sans fuseau.
  static dateBoox(s) {
    const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  // La clé courte d'un trait : douze chiffres hexadécimaux de son identifiant.
  static cleTrait(id) {
    return String(id || '').replace(/-/g, '').toLowerCase().slice(0, 12);
  }

  // Les traits d'un PDF de la Boox, page par page. Le fichier s'allonge de
  // révisions successives : la dernière définition d'un objet fait foi.
  // Rend { pages: [{ traits: [{ cle, y1, y2 }] }], date, vectoriel }.
  static traitsPdfBoox(texte) {
    const t = String(texte || '');
    const objets = new Map();
    for (const m of t.matchAll(/(?:^|[\r\n\s])(\d+) 0 obj\b/g)) {
      const debut = m.index + m[0].length;
      let fin = t.indexOf('endobj', debut);
      if (fin < 0) fin = t.length;
      const flux = t.indexOf('stream', debut);
      if (flux >= 0 && flux < fin) fin = flux;
      objets.set(Number(m[1]), t.slice(debut, fin));
    }
    const refs = (s) => [...String(s || '').matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]));
    const tableau = (dict, cle) => {
      const m = new RegExp('/' + cle + '\\s*(\\[[^\\]]*\\]|\\d+ 0 R)').exec(dict || '');
      if (!m) return [];
      if (m[1].startsWith('[')) return refs(m[1]);
      return refs(objets.get(refs(m[1])[0]) || '');
    };
    const trait = (dict) => {
      if (!/#ONYX-|onyxtag/.test(dict || '')) return null;
      const id = /"id":"([0-9A-Za-z-]{8,})"/.exec(dict);
      if (!id) return null;
      const r = /\/Rect\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(dict);
      const y1 = r ? Math.min(+r[2], +r[4]) : 0;
      const y2 = r ? Math.max(+r[2], +r[4]) : 0;
      return { cle: Ariane.cleTrait(id[1]), y1, y2 };
    };
    // L'ordre des pages : celui de la racine /Pages (sans /Parent), en
    // descendant dans les nœuds intermédiaires.
    let racine = null;
    for (const [n, d] of objets) if (/\/Type\s*\/Pages\b/.test(d) && !/\/Parent\b/.test(d)) racine = n;
    const pages = [];
    const vus = new Set();
    const descendre = (n) => {
      if (vus.has(n)) return;
      vus.add(n);
      const d = objets.get(n) || '';
      if (/\/Type\s*\/Pages\b/.test(d)) { for (const k of tableau(d, 'Kids')) descendre(k); return; }
      if (/\/Type\s*\/Page\b/.test(d)) pages.push(d);
    };
    if (racine != null) descendre(racine);
    const sortie = pages.map((d) => {
      const traits = [];
      const cles = new Set();
      for (const a of tableau(d, 'Annots')) {
        const x = trait(objets.get(a));
        if (x && !cles.has(x.cle)) { cles.add(x.cle); traits.push(x); }
      }
      return { traits };
    });
    // Sans arbre de pages lisible : tous les traits sur une seule page.
    if (!sortie.length) {
      const traits = [];
      const cles = new Set();
      for (const d of objets.values()) {
        const x = trait(d);
        if (x && !cles.has(x.cle)) { cles.add(x.cle); traits.push(x); }
      }
      sortie.push({ traits });
    }
    let date = null;
    for (const m of t.matchAll(/\/(?:ModDate|LastModified)\s*\(\s*(D:\d{8,14})/g)) {
      const x = Ariane.dateBoox(m[1]);
      if (x && (!date || x > date)) date = x;
    }
    const vectoriel = sortie.some((p) => p.traits.length);
    return { pages: sortie, date, vectoriel };
  }

  // La séance : les traits nouveaux depuis le passage précédent (connus :
  // un Set de clés), par page, avec la bande de la page qu'ils occupent.
  static seanceManuscrite(analyse, connus) {
    const pages = [];
    let nouveaux = 0;
    analyse.pages.forEach((p, i) => {
      const n = p.traits.filter((x) => !connus.has(x.cle));
      if (!n.length) return;
      nouveaux += n.length;
      pages.push({ page: i + 1, traits: n.length,
        zone: [Math.min(...n.map((x) => x.y1)), Math.max(...n.map((x) => x.y2))].map((v) => Math.round(v)) });
    });
    return { nouveaux, pages };
  }

  // Un cahier renommé ou déplacé sur la Boox arrive sous un autre chemin :
  // on le reconnaît à ses traits, déjà connus pour plus de la moitié.
  // candidats : [{ chemin, cles: Set }]. Rend le chemin reconnu, ou null.
  static cahierReconnu(cles, candidats) {
    if (!cles.length) return null;
    let mieux = null;
    let part = 0.5;
    for (const c of candidats || []) {
      let communs = 0;
      for (const k of cles) if (c.cles.has(k)) communs += 1;
      const p = communs / cles.length;
      if (p > part) { part = p; mieux = c.chemin; }
    }
    return mieux;
  }

  // Un cahier se lit quand il a fini d'arriver : modifié depuis deux minutes,
  // ou vu deux fois, à une minute d'écart au moins, sans avoir bougé.
  static cahierPret(f, attente, maintenant) {
    if (f.modif && maintenant - f.modif >= 120000) return true;
    return !!(attente && attente.taille === f.taille && attente.etag === f.etag && maintenant - attente.t >= 60000);
  }

  // Le cahier a-t-il changé depuis la dernière lecture ?
  static cahierChange(f, connu) {
    if (!connu) return true;
    if (f.etag && connu.etag) return f.etag !== connu.etag;
    return f.taille !== connu.taille || f.modif !== connu.modif;
  }

  // Le bloc des séances, le plus récent en tête.
  static blocSeancesManuscrites(seances) {
    if (!seances || !seances.length) return '';
    const nb = (n) => Number(n).toLocaleString('fr-FR');
    const lignes = seances.slice().reverse().map((s) => {
      const d = new Date(s.quand);
      const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const heure = String(d.getHours()) + ' h ' + String(d.getMinutes()).padStart(2, '0');
      const pages = (s.pages || []).map((p) => p.page);
      const ou = pages.length ? (pages.length > 1 ? tr(', pages ') : tr(', page ')) + pages.join(', ') : '';
      const quoi = s.premiere ? tr('premier import, ') + nb(s.nouveaux) + tr(' traits')
        : nb(s.nouveaux) + (s.nouveaux > 1 ? tr(' traits nouveaux') : tr(' trait nouveau'));
      return '- ' + jour + tr(' à ') + heure + ' : ' + quoi + ou;
    });
    return ['<!-- ariane:seances -->', '**' + tr('Séances d’écriture') + '**', '', ...lignes, '<!-- /ariane:seances -->'].join('\n');
  }

  // La note d'un cahier, à sa création.
  static noteManuscriteInitiale(info) {
    const q = (s) => JSON.stringify(String(s == null ? '' : s));
    return [
      '---',
      'Type: note-manuscrite',
      'Titre: ' + q(info.titre),
      'Cahier: ' + q(info.dossier ? info.dossier + '/' + info.titre : info.titre),
      'Appareil: ' + q(info.appareil),
      'PDF: ' + q('[[' + info.pdf + ']]'),
      'Première synchronisation: ' + info.vu,
      'Dernière écriture: ' + info.derniere,
      'Pages: ' + info.pages,
      'Traits: ' + info.traits,
      'aliases: [' + q(info.titre) + ']',
      '---',
      '# ' + info.titre,
      '',
      info.bloc || '',
      '',
      '![[' + info.pdf + ']]',
      '',
    ].join('\n');
  }

  // ── transcription (fonctions pures) ──

  // Une zone haute (cahier infini) se lit en bandes : 1 000 points au plus,
  // chevauchées de 30, de haut en bas (y du PDF : origine en bas). La zone
  // est d'abord élargie d'une marge, dans les limites de la page.
  static bandesZone(zone, hauteur, max, marge, recouvrement) {
    const m = marge == null ? 20 : marge;
    const pas = max || 1000;
    const rec = recouvrement == null ? 30 : recouvrement;
    const bas = Math.max(0, Math.min(zone[0], zone[1]) - m);
    const haut = Math.min(hauteur, Math.max(zone[0], zone[1]) + m);
    const bandes = [];
    for (let h = haut; h > bas; h -= pas - rec) {
      bandes.push([Math.max(bas, h - pas), h]);
      if (h - pas <= bas) break;
    }
    return bandes;
  }

  // Une séance trop haute pour un seul appel (huit bandes) se coupe en
  // plusieurs tâches de transcription, de haut en bas.
  static tachesTranscription(seance, quand, premiere) {
    const taches = [];
    const max = 7000;
    for (const p of seance.pages || []) {
      const [b, h] = [Math.min(p.zone[0], p.zone[1]), Math.max(p.zone[0], p.zone[1])];
      for (let x = h; x > b; x -= max) {
        taches.push({ page: p.page, zone: [Math.max(b, x - max), x], quand, premiere: !!premiere });
        if (x - max <= b) break;
      }
    }
    return taches;
  }

  static promptTranscription(n, deja) {
    return [
      n > 1
        ? 'Transcris fidèlement, en français, l’écriture manuscrite de ces ' + n + ' images : des bandes successives d’une même page de cahier, de haut en bas, qui se chevauchent un peu (ne répète pas une ligne coupée entre deux bandes).'
        : 'Transcris fidèlement, en français, l’écriture manuscrite de cette image : une bande d’une page de cahier.',
      'Rends seulement le texte, en Markdown simple : garde les retours à la ligne et les listes ; une flèche s’écrit →, un mot souligné en **gras**. Mot illisible : [?]. Mot barré : omis. Un dessin ou un schéma : [schéma : quelques mots]. Aucun commentaire, aucune introduction.',
      deja ? 'Une partie de cette page est déjà transcrite, ci-dessous. Ne rends que ce qui n’y figure pas encore (les ajouts de la dernière séance), et rien du tout s’il n’y a rien de nouveau.\n\n---\n' + deja + '\n---' : '',
    ].filter(Boolean).join('\n\n');
  }

  // Le texte déjà transcrit d'une page, tel que la note le porte (vos
  // corrections comprises), sans le titre du bloc.
  static transcriptionDePage(corps, page) {
    const m = new RegExp('<!-- ariane:transcription-p' + page + ' -->([\\s\\S]*?)<!-- /ariane:transcription-p' + page + ' -->').exec(String(corps || ''));
    if (!m) return '';
    return m[1].split('\n').filter((l) => !/^\*\*Transcription, /.test(l.trim())).join('\n').trim();
  }

  // Ajoute le texte d'une séance à la transcription de sa page. Jamais de
  // remplacement : ce qui est déjà écrit, et vos corrections, restent. Le
  // bloc d'une page nouvelle se pose avant le PDF intégré.
  static corpsAvecTranscription(corps, page, texte, etiquette) {
    const t = String(corps || '');
    const ajout = (etiquette ? '*' + etiquette + '*\n\n' : '') + String(texte || '').trim();
    if (!String(texte || '').trim()) return t;
    const ouv = '<!-- ariane:transcription-p' + page + ' -->';
    const fer = '<!-- /ariane:transcription-p' + page + ' -->';
    const i = t.indexOf(ouv);
    const j = t.indexOf(fer);
    if (i >= 0 && j > i) return t.slice(0, j).replace(/\n*$/, '\n\n') + ajout + '\n' + t.slice(j);
    const bloc = [ouv, '**' + tr('Transcription, page ') + page + '**', '', ajout, fer].join('\n');
    const pdf = /^!\[\[[^\]]+\.pdf\]\]\s*$/m.exec(t);
    if (pdf) return t.slice(0, pdf.index).replace(/\n*$/, '\n\n') + bloc + '\n\n' + t.slice(pdf.index);
    return t.replace(/\n*$/, '\n\n') + bloc + '\n';
  }

  // Une réponse vide, ou qui ne dit que « rien de nouveau ».
  static transcriptionVide(texte) {
    const t = String(texte || '').trim().replace(/[*_.«»"]/g, '').trim();
    return !t || /^(rien( de nouveau)?|aucun (ajout|texte nouveau)|néant)$/i.test(t);
  }

  // ── réglages et accès au WebDAV ──

  get dossierNM() {
    return this.settings.manuscritesDossier || '12 - Notes manuscrites';
  }

  // Le mot de passe va au trousseau d'Obsidian, jamais dans data.json (que
  // iCloud recopie). Sans trousseau (Obsidian ancien), il reste en mémoire.
  static get SECRET_WEBDAV() { return 'ariane-webdav-manuscrites'; }

  motDePasseWebdav() {
    const s = this.app && this.app.secretStorage;
    if (s && typeof s.getSecret === 'function') return s.getSecret(Ariane.SECRET_WEBDAV) || '';
    return this._mdpWebdav || '';
  }

  enregistrerMotDePasseWebdav(v) {
    const s = this.app && this.app.secretStorage;
    if (s && typeof s.setSecret === 'function') s.setSecret(Ariane.SECRET_WEBDAV, String(v || ''));
    else this._mdpWebdav = String(v || '');
  }

  _baseWebdav() {
    const u = String(this.settings.manuscritesUrl || '').trim();
    return u ? u.replace(/\/*$/, '/') : '';
  }

  _authWebdav() {
    const brut = String(this.settings.manuscritesUtilisateur || '') + ':' + this.motDePasseWebdav();
    const octets = new TextEncoder().encode(brut);
    let bin = '';
    for (const o of octets) bin += String.fromCharCode(o);
    return 'Basic ' + btoa(bin);
  }

  async _requeteWebdav(url, o) {
    return obsidian.requestUrl(Object.assign({ url, throw: false }, o || {},
      { headers: Object.assign({ Authorization: this._authWebdav() }, (o && o.headers) || {}) }));
  }

  async _propfind(url, profondeur) {
    const corps = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop>'
      + '<d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop></d:propfind>';
    const r = await this._requeteWebdav(url, { method: 'PROPFIND', body: corps, contentType: 'application/xml; charset=utf-8',
      headers: { Depth: String(profondeur) } });
    if (r.status !== 207) throw new Error('WebDAV ' + r.status);
    return Ariane.listeWebdav(r.text, this._baseWebdav());
  }

  // Tous les PDF sous la base, dossier par dossier (bien des serveurs
  // refusent la profondeur infinie). Une erreur arrête tout : une liste
  // partielle ferait croire à des cahiers disparus.
  async listerCahiersBoox() {
    const base = this._baseWebdav();
    const origine = new URL(base).origin;
    const fichiers = [];
    const aVisiter = [{ url: base, chemin: '' }];
    const vus = new Set();
    while (aVisiter.length) {
      const d = aVisiter.shift();
      if (vus.has(d.chemin) || vus.size > 200) continue;
      vus.add(d.chemin);
      for (const e of await this._propfind(d.url, 1)) {
        if (e.chemin === d.chemin) continue;
        if (e.dossier) {
          if (e.chemin.split('/').length <= 6) aVisiter.push({ url: origine + e.href, chemin: e.chemin });
        } else if (/\.pdf$/i.test(e.chemin)) {
          fichiers.push(Object.assign({ url: origine + e.href }, e));
        }
      }
    }
    return fichiers;
  }

  // Pour le bouton des réglages : la base répond-elle ?
  async verifierWebdav() {
    if (!this._baseWebdav()) return tr('Indiquez d’abord l’adresse du WebDAV.');
    try {
      const r = await this._requeteWebdav(this._baseWebdav(), { method: 'PROPFIND', headers: { Depth: '0' } });
      if (r.status === 207) return tr('Connexion établie.');
      if (r.status === 401 || r.status === 403) return tr('Le serveur refuse l’accès : vérifiez l’identifiant et le mot de passe.');
      if (r.status === 404) return tr('Adresse introuvable sur le serveur.');
      return tr('Le serveur répond : ') + r.status;
    } catch (e) {
      return tr('Serveur injoignable : ') + (e && e.message ? e.message : e);
    }
  }

  // ── état gardé dans le coffre (.ariane) ──
  //  « notes-manuscrites.json » : un résumé par cahier, petit. Les clés des
  //  traits et les séances, plus lourdes, ont un fichier par note.

  async _lireJsonAriane(chemin, defaut) {
    try {
      const a = this.app.vault.adapter;
      if (await a.exists(chemin)) return JSON.parse(await a.read(chemin)) || defaut;
    } catch (e) { /* absent ou abîmé */ }
    return defaut;
  }

  async _ecrireJsonAriane(chemin, valeur) {
    const a = this.app.vault.adapter;
    const dossier = chemin.slice(0, chemin.lastIndexOf('/'));
    if (!(await a.exists('.ariane'))) await a.mkdir('.ariane');
    if (dossier !== '.ariane' && !(await a.exists(dossier))) await a.mkdir(dossier);
    await a.write(chemin, JSON.stringify(valeur));
  }

  async etatManuscrites() {
    const e = await this._lireJsonAriane('.ariane/notes-manuscrites.json', null);
    return e && e.cahiers ? e : { version: 1, cahiers: {}, attente: {} };
  }

  _cheminTraits(note) { return '.ariane/notes-manuscrites/' + note + '.json'; }

  async traitsCahier(note) {
    const d = await this._lireJsonAriane(this._cheminTraits(note), null);
    return { cles: new Set((d && d.cles) || []), seances: (d && d.seances) || [], aTranscrire: (d && d.aTranscrire) || [] };
  }

  // ── la synchronisation ──

  // Lit le WebDAV, importe les cahiers nouveaux, met à jour ceux qui ont
  // changé. manuel : un avis dit ce qui s'est passé. Rend le bilan.
  async synchroniserNotesManuscrites(manuel) {
    if (surMobile()) return null;
    if (!this._baseWebdav()) {
      if (manuel) new obsidian.Notice(tr('Notes manuscrites : indiquez d’abord le WebDAV dans les réglages.'));
      return null;
    }
    if (this._syncNM) return this._syncNM;
    this._syncNM = this._passeNotesManuscrites(manuel).finally(() => { this._syncNM = null; });
    return this._syncNM;
  }

  async _passeNotesManuscrites(manuel) {
    const bilan = { nouvelles: 0, majs: 0, attente: 0, erreurs: 0, transcrites: 0 };
    let fichiers;
    try {
      fichiers = await this.listerCahiersBoox();
    } catch (e) {
      console.warn('[Ariane] notes manuscrites :', e);
      if (manuel) new obsidian.Notice(tr('Notes manuscrites : le WebDAV ne répond pas (') + (e && e.message ? e.message : e) + ')');
      return null;
    }
    const etat = await this.etatManuscrites();
    etat.attente = etat.attente || {};
    const maintenant = Date.now();
    const presents = new Set(fichiers.map((f) => f.chemin));
    for (const f of fichiers) {
      const connu = etat.cahiers[f.chemin];
      if (connu && connu.ignore) continue;
      if (!Ariane.cahierChange(f, connu)) { delete etat.attente[f.chemin]; continue; }
      if (!Ariane.cahierPret(f, etat.attente[f.chemin], maintenant)) {
        const a = etat.attente[f.chemin];
        if (!a || a.taille !== f.taille || a.etag !== f.etag) etat.attente[f.chemin] = { taille: f.taille, etag: f.etag, t: maintenant };
        bilan.attente += 1;
        continue;
      }
      try {
        const r = await this._requeteWebdav(f.url, { method: 'GET' });
        if (r.status !== 200) throw new Error('WebDAV ' + r.status);
        const octets = r.arrayBuffer;
        const texte = new TextDecoder('latin1').decode(new Uint8Array(octets));
        if (!Ariane.pdfComplet(texte)) {
          etat.attente[f.chemin] = { taille: f.taille, etag: f.etag, t: maintenant };
          bilan.attente += 1;
          continue;
        }
        delete etat.attente[f.chemin];
        const fait = await this._traiterCahier(f, octets, Ariane.traitsPdfBoox(texte), etat, presents);
        if (fait === 'nouvelle') bilan.nouvelles += 1;
        else if (fait === 'maj') bilan.majs += 1;
      } catch (e) {
        console.warn('[Ariane] notes manuscrites, ' + f.chemin + ' :', e);
        bilan.erreurs += 1;
      }
    }
    // Les cahiers disparus du WebDAV : signalés après une demi-heure
    // d'absence, jamais supprimés.
    for (const [chemin, c] of Object.entries(etat.cahiers)) {
      if (presents.has(chemin) || c.ignore) { if (c.absentDepuis && !c.retire) delete c.absentDepuis; continue; }
      if (!c.absentDepuis) c.absentDepuis = maintenant;
      else if (!c.retire && maintenant - c.absentDepuis >= 30 * 60000) {
        const note = this._fichierNM(c.note);
        if (note) {
          this.marquerEcriture(note.path);
          await this.app.fileManager.processFrontMatter(note, (x) => { x.Statut = tr('retiré de la Boox'); });
        }
        c.retire = true;
      }
    }
    for (const chemin of Object.keys(etat.attente)) if (!presents.has(chemin)) delete etat.attente[chemin];
    await this._ecrireJsonAriane('.ariane/notes-manuscrites.json', etat);
    if (this.settings.manuscritesTranscrire !== false) {
      await this._transcrireEnAttente(etat, bilan, manuel);
      await this._ecrireJsonAriane('.ariane/notes-manuscrites.json', etat);
    }
    if (bilan.attente) this._relancerNotesManuscrites();
    if (manuel) {
      const morceaux = [];
      if (bilan.nouvelles) morceaux.push(bilan.nouvelles + (bilan.nouvelles > 1 ? tr(' notes nouvelles') : tr(' note nouvelle')));
      if (bilan.majs) morceaux.push(bilan.majs + (bilan.majs > 1 ? tr(' mises à jour') : tr(' mise à jour')));
      if (bilan.attente) morceaux.push(bilan.attente + tr(' en cours d’envoi depuis la Boox'));
      if (bilan.transcrites) morceaux.push(bilan.transcrites + (bilan.transcrites > 1 ? tr(' passages transcrits') : tr(' passage transcrit')));
      if (bilan.erreurs) morceaux.push(bilan.erreurs + (bilan.erreurs > 1 ? tr(' erreurs (voir la console)') : tr(' erreur (voir la console)')));
      new obsidian.Notice(tr('Notes manuscrites : ') + (morceaux.length ? morceaux.join(', ') : tr('rien de nouveau')) + '.');
    }
    return bilan;
  }

  // Un cahier encore en cours d'envoi : nouvel essai dans deux minutes.
  _relancerNotesManuscrites() {
    clearTimeout(this._relanceNM);
    this._relanceNM = setTimeout(() => {
      this.synchroniserNotesManuscrites(false).catch((e) => console.warn('[Ariane] notes manuscrites :', e));
    }, 120000);
  }

  // Le fichier d'une note (ou d'un PDF) par son nom, où qu'il ait été rangé.
  _fichierNM(nom) {
    if (!nom) return null;
    const f = this.app.metadataCache.getFirstLinkpathDest(nom, '');
    return f || null;
  }

  // Importe ou met à jour un cahier. Rend 'nouvelle', 'maj' ou null.
  async _traiterCahier(f, octets, analyse, etat, presents) {
    const info = Ariane.cheminCahierBoox(f.chemin);
    const quand = analyse.date || new Date(f.modif || Date.now());
    const toutes = analyse.pages.flatMap((p) => p.traits.map((x) => x.cle));
    let chemin = f.chemin;
    let connu = etat.cahiers[chemin];
    // Un chemin nouveau : peut-être un cahier renommé ou déplacé sur la Boox.
    if (!connu) {
      const candidats = [];
      for (const [c, x] of Object.entries(etat.cahiers)) {
        if (presents.has(c) || x.ignore) continue;
        candidats.push({ chemin: c, cles: (await this.traitsCahier(x.note)).cles });
      }
      const ancien = Ariane.cahierReconnu(toutes, candidats);
      if (ancien) {
        connu = etat.cahiers[ancien];
        delete etat.cahiers[ancien];
        delete connu.absentDepuis;
        delete connu.retire;
        etat.cahiers[chemin] = connu;
      }
    }
    if (!connu) return this._importerCahier(f, octets, analyse, etat, info, quand, toutes);

    const note = this._fichierNM(connu.note);
    if (!note) {
      // L'utilisateur a supprimé la note : le cahier n'est plus suivi.
      connu.ignore = true;
      return null;
    }
    const traits = await this.traitsCahier(connu.note);
    const seance = Ariane.seanceManuscrite(analyse, traits.cles);
    for (const k of toutes) traits.cles.add(k);
    if (seance.nouveaux) {
      traits.seances.push({ quand: Ariane.isoLocalManuscrit(quand), nouveaux: seance.nouveaux, pages: seance.pages });
      traits.aTranscrire.push(...Ariane.tachesTranscription(seance, Ariane.isoLocalManuscrit(quand), false));
    }
    const pdf = this._fichierNM(connu.pdf);
    if (pdf) await this.app.vault.modifyBinary(pdf, octets);
    else await this._poserPdf(connu.pdf, octets, note.path);
    this.marquerEcriture(note.path);
    await this.app.fileManager.processFrontMatter(note, (x) => {
      x.Titre = info.titre;
      x.Cahier = info.dossier ? info.dossier + '/' + info.titre : info.titre;
      x['Dernière écriture'] = Ariane.isoLocalManuscrit(quand);
      x.Pages = analyse.pages.length;
      x.Traits = traits.cles.size;
      delete x.Statut;
      const al = [].concat(x.aliases || []).map(String);
      if (!al.includes(info.titre)) x.aliases = al.concat(info.titre);
    });
    const corps = await this.app.vault.read(note);
    const nouveau = Ariane.corpsAvecBloc(corps, 'seances', Ariane.blocSeancesManuscrites(traits.seances));
    if (nouveau !== corps) { this.marquerEcriture(note.path); await this.app.vault.modify(note, nouveau); }
    await this._ecrireJsonAriane(this._cheminTraits(connu.note), { cles: [...traits.cles], seances: traits.seances,
      aTranscrire: traits.aTranscrire });
    Object.assign(connu, { etag: f.etag, taille: f.taille, modif: f.modif, titre: info.titre, aTranscrire: traits.aTranscrire.length });
    return 'maj';
  }

  async _poserPdf(nom, octets, cheminNote) {
    const chemin = await this.app.fileManager.getAvailablePathForAttachment(nom, cheminNote);
    const dossier = chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/')) : '';
    if (dossier) await this.assurerDossier(dossier);
    this.marquerEcriture(chemin);
    await this.app.vault.createBinary(chemin, octets);
    return chemin;
  }

  async _importerCahier(f, octets, analyse, etat, info, quand, toutes) {
    await this.assurerDossier(this.dossierNM);
    // Le nom : la minute où Ariane voit le cahier, avec -2, -3… si la minute
    // est déjà prise.
    const base = Ariane.nomNoteManuscrite(new Date());
    let nom = base;
    for (let n = 2; this.app.vault.getAbstractFileByPath(this.dossierNM + '/' + nom + '.md')
      || Object.values(etat.cahiers).some((c) => c.note === nom); n += 1) nom = base + '-' + n;
    const cheminNote = this.dossierNM + '/' + nom + '.md';
    const cheminPdf = await this._poserPdf(nom + '.pdf', octets, cheminNote);
    const nomPdf = cheminPdf.slice(cheminPdf.lastIndexOf('/') + 1);
    const seance = Ariane.seanceManuscrite(analyse, new Set());
    const seances = toutes.length
      ? [{ quand: Ariane.isoLocalManuscrit(quand), nouveaux: seance.nouveaux, pages: seance.pages, premiere: true }] : [];
    const texte = Ariane.noteManuscriteInitiale({
      titre: info.titre, dossier: info.dossier, appareil: info.appareil, pdf: nomPdf,
      vu: Ariane.isoLocalManuscrit(new Date()), derniere: Ariane.isoLocalManuscrit(quand),
      pages: analyse.pages.length, traits: new Set(toutes).size, bloc: Ariane.blocSeancesManuscrites(seances),
    });
    await this.ecrire(cheminNote, texte);
    const aTranscrire = Ariane.tachesTranscription(seance, Ariane.isoLocalManuscrit(quand), true);
    await this._ecrireJsonAriane(this._cheminTraits(nom), { cles: [...new Set(toutes)], seances, aTranscrire });
    etat.cahiers[f.chemin] = { note: nom, pdf: nomPdf, titre: info.titre, etag: f.etag, taille: f.taille, modif: f.modif,
      vu: Ariane.isoLocalManuscrit(new Date()), aTranscrire: aTranscrire.length };
    return 'nouvelle';
  }

  // ── transcription ──
  //  Après chaque relève, quelques passages en attente (six appels au plus
  //  par passe, pour ne pas monopoliser l'IA) : la bande de la page écrite à
  //  la séance, rendue en images, lue par l'IA de « Transcrire les cahiers ».
  //  Un échec se retente à la passe suivante, trois fois.
  async _transcrireEnAttente(etat, bilan, manuel) {
    let budget = 6;
    for (const c of Object.values(etat.cahiers)) {
      if (budget <= 0) break;
      if (!c.aTranscrire || c.ignore) continue;
      const note = this._fichierNM(c.note);
      const pdf = this._fichierNM(c.pdf);
      if (!note || !pdf) continue;
      const traits = await this.traitsCahier(c.note);
      let doc = null;
      try {
        while (traits.aTranscrire.length && budget > 0) {
          const t = traits.aTranscrire[0];
          budget -= 1;
          let texte = null;
          try {
            if (!doc) doc = await this._ouvrirPdfManuscrit(await this.app.vault.readBinary(pdf));
            const deja = t.premiere ? '' : Ariane.transcriptionDePage(await this.app.vault.read(note), t.page);
            const images = await this._rendreBandesPdf(doc, t.page, t.zone);
            texte = await this.genererImagesPour('manuscrites-transcrire', Ariane.promptTranscription(images.length, deja), images, 4000);
          } catch (e) {
            this._diagIA = String(e && e.message ? e.message : e);
          }
          if (texte === null) {
            t.essais = (t.essais || 0) + 1;
            console.warn('[Ariane] transcription, ' + c.note + ' : ' + (this._diagIA || tr('échec')));
            if (manuel && this._diagIA) new obsidian.Notice(tr('Transcription : ') + this._diagIA, 10000);
            if (t.essais >= 3) traits.aTranscrire.shift();
            break;
          }
          traits.aTranscrire.shift();
          if (!Ariane.transcriptionVide(texte)) {
            const d = new Date(t.quand);
            const etiquette = t.premiere ? '' : tr('Séance du ') + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
              + ', ' + d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0');
            const corps = await this.app.vault.read(note);
            const nouveau = Ariane.corpsAvecTranscription(corps, t.page, texte, etiquette);
            if (nouveau !== corps) { this.marquerEcriture(note.path); await this.app.vault.modify(note, nouveau); }
            bilan.transcrites += 1;
          }
        }
      } finally {
        if (doc && typeof doc.destroy === 'function') { try { doc.destroy(); } catch (e) { /* déjà fermé */ } }
        await this._ecrireJsonAriane(this._cheminTraits(c.note), { cles: [...traits.cles], seances: traits.seances,
          aTranscrire: traits.aTranscrire });
        c.aTranscrire = traits.aTranscrire.length;
      }
    }
  }

  // Le PDF d'un cahier, ouvert par pdf.js, celui qu'Obsidian embarque.
  async _ouvrirPdfManuscrit(octets) {
    const pdfjs = await obsidian.loadPdfJs();
    return pdfjs.getDocument({ data: new Uint8Array(octets) }).promise;
  }

  // Les bandes d'une zone de page, en images PNG d'environ 1 400 pixels de
  // large : assez pour l'écriture, sous la limite d'image des IA.
  async _rendreBandesPdf(doc, numero, zone) {
    const page = await doc.getPage(numero);
    const [x0, y0, x1, y1] = page.view;
    const largeur = x1 - x0;
    const echelle = Math.min(2, 1400 / largeur);
    const vue = page.getViewport({ scale: echelle });
    const images = [];
    for (const [b, h] of Ariane.bandesZone([zone[0] - y0, zone[1] - y0], y1 - y0)) {
      const toile = createEl('canvas');
      toile.width = Math.ceil(vue.width);
      toile.height = Math.ceil((h - b) * echelle);
      const ctx = toile.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, toile.width, toile.height);
      await page.render({ canvasContext: ctx, viewport: vue, transform: [1, 0, 0, 1, 0, -((y1 - y0) - h) * echelle] }).promise;
      images.push({ type: 'image/png', base64: toile.toDataURL('image/png').split(',')[1] });
    }
    if (typeof page.cleanup === 'function') page.cleanup();
    return images;
  }

  // ── branchement ──
  // Tout ce que le module enregistre ; appelé seulement s'il est actif.
  brancherNotesManuscrites() {
    this.addCommand({
      id: 'manuscrites-synchroniser', module: 'manuscrites', bureau: true, icon: 'notebook-pen',
      name: tr('Notes manuscrites : synchroniser avec la Boox'),
      callback: () => this.synchroniserNotesManuscrites(true),
    });
    this.register(() => clearTimeout(this._relanceNM));
    this.app.workspace.onLayoutReady(() => {
      if (surMobile()) return;
      setTimeout(() => {
        this.synchroniserNotesManuscrites(false).catch((e) => console.warn('[Ariane] notes manuscrites :', e));
      }, 20000);
      this.registerInterval(window.setInterval(() => {
        this.synchroniserNotesManuscrites(false).catch((e) => console.warn('[Ariane] notes manuscrites :', e));
      }, Math.max(1, Number(this.settings.manuscritesIntervalle) || 1) * 60000));
      // Au retour dans Obsidian (la tablette posée), une relève, une par minute au plus.
      this.registerDomEvent(window, 'focus', () => {
        if (Date.now() - (this._focusNM || 0) < 60000) return;
        this._focusNM = Date.now();
        this.synchroniserNotesManuscrites(false).catch((e) => console.warn('[Ariane] notes manuscrites :', e));
      });
    });
  }
  //#endregion Ariane · notes manuscrites
};
