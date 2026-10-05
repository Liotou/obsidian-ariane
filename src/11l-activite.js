// ── avecActivite ──────────────────────────────────────────────────────────
// Domaine : activité réelle hors d'Obsidian (calendrier).
// Lecture d'ActivityWatch (serveur local), classement des fenêtres par
// règles, agrégation en créneaux « réels » pour la vue semaine du calendrier.
//
// ActivityWatch enregistre l'application au premier plan, le titre de sa
// fenêtre, l'absence du clavier et, avec son extension, l'adresse de l'onglet
// actif. Ariane ne stocke rien de tout cela : les événements bruts restent en
// mémoire le temps de la session, et seuls les créneaux agrégés s'affichent.
const avecActivite = (Base) => class extends Base {
  //#region Ariane · static · activité réelle
  // ── static · activité réelle ─────────────────────────────────────────────

  // Choisit les seaux (« buckets ») utiles parmi ceux du serveur. Fenêtres et
  // absence doivent venir de la MÊME machine, sinon on croiserait l'activité
  // d'un ordinateur avec le clavier d'un autre : on prend l'hôte courant s'il
  // est connu du serveur, sinon celui dont le seau de fenêtres a bougé en
  // dernier. Les seaux du navigateur portent souvent un hôte « unknown » : on
  // les prend tous.
  static choisirBucketsAW(tous, hote) {
    const liste = Object.values(tous || {}).filter((b) => b && b.id);
    const deType = (t) => liste.filter((b) => b.type === t);
    const fen = deType('currentwindow');
    let h = hote && fen.some((b) => b.hostname === hote) ? hote : '';
    if (!h && fen.length) {
      const recent = fen.slice().sort((a, b) =>
        String(b.last_updated || '').localeCompare(String(a.last_updated || '')))[0];
      h = recent.hostname || '';
    }
    const deHote = (bs) => bs.filter((b) => !h || b.hostname === h).map((b) => b.id);
    return {
      hote: h,
      fenetre: deHote(fen),
      afk: deHote(deType('afkstatus')),
      web: deType('web.tab.current').map((b) => b.id),
    };
  }

  // Trie et fusionne des intervalles [début, fin] (ms) qui se touchent.
  static fusionnerIntervalles(iv) {
    const tri = (iv || []).filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a, b] of tri) {
      const der = out[out.length - 1];
      if (der && a <= der[1]) der[1] = Math.max(der[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  // Parties de [a, b] couvertes par une liste d'intervalles triés et fusionnés.
  static couperParIntervalles(a, b, actifs) {
    const out = [];
    for (const [x, y] of actifs) {
      if (y <= a) continue;
      if (x >= b) break;
      out.push([Math.max(a, x), Math.min(b, y)]);
    }
    return out;
  }

  // Segments d'activité d'une journée [d0, d1[ : chaque événement de fenêtre,
  // rogné à la journée, restreint aux plages où le clavier ou la souris ont
  // servi, et — pour un navigateur — découpé selon l'onglet actif, dont il
  // reprend l'adresse. Sans seau d'absence (afk === null), tout compte.
  static segmentsActivite(fenetres, afk, web, d0, d1) {
    const iv = (e) => {
      const a = Date.parse(e && e.timestamp);
      if (!Number.isFinite(a)) return [0, 0];
      const b = a + (Number(e.duration) || 0) * 1000;
      return [Math.max(a, d0), Math.min(b, d1)];
    };
    const actifs = afk ? Ariane.fusionnerIntervalles(afk
      .filter((e) => e && e.data && e.data.status === 'not-afk').map(iv)) : null;
    const onglets = (web || []).map((e) => {
      const [a, b] = iv(e);
      const d = (e && e.data) || {};
      return { a, b, url: String(d.url || ''), titre: String(d.title || '') };
    }).filter((w) => w.b > w.a).sort((x, y) => x.a - y.a);
    const navigateur = /chrome|chromium|safari|firefox|arc\b|brave|edge|vivaldi|opera|orion|zen\b/i;
    const out = [];
    for (const e of (fenetres || [])) {
      const [a, b] = iv(e);
      if (b <= a) continue;
      const d = (e && e.data) || {};
      const app = String(d.app || '');
      const titre = String(d.title || '');
      const morceaux = actifs ? Ariane.couperParIntervalles(a, b, actifs) : [[a, b]];
      for (const [x, y] of morceaux) {
        if (!onglets.length || !navigateur.test(app)) {
          out.push({ deb: x, fin: y, app, titre, url: '' });
          continue;
        }
        let cur = x;
        for (const w of onglets) {
          if (w.b <= cur) continue;
          if (w.a >= y) break;
          const s = Math.max(cur, w.a);
          const t = Math.min(y, w.b);
          if (s > cur) out.push({ deb: cur, fin: s, app, titre, url: '' });
          out.push({ deb: s, fin: t, app, titre: w.titre || titre, url: w.url });
          cur = t;
        }
        if (cur < y) out.push({ deb: cur, fin: y, app, titre, url: '' });
      }
    }
    return out.sort((p, q) => p.deb - q.deb);
  }

  // Motifs d'une règle, séparés par des virgules. Un motif est un fragment de
  // texte (casse indifférente) ou une expression /…/ ; un préfixe app:,
  // titre: ou url: le restreint à ce champ.
  static motifsActivite(corps) {
    const s = String(corps || '');
    const out = [];
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      if (i >= s.length) break;
      let champ = '';
      const mp = /^(app|titre|title|url)\s*:\s*/i.exec(s.slice(i));
      if (mp) {
        champ = mp[1].toLowerCase() === 'title' ? 'titre' : mp[1].toLowerCase();
        i += mp[0].length;
      }
      if (s[i] === '/') {
        let j = i + 1;
        let echap = false;
        while (j < s.length && (echap || s[j] !== '/')) { echap = !echap && s[j] === '\\'; j++; }
        if (j < s.length) {
          let k = j + 1;
          while (k < s.length && /[a-z]/i.test(s[k])) k++;
          const drapeaux = s.slice(j + 1, k).replace(/[^msu]/g, '') + 'i';
          try { out.push({ champ, re: new RegExp(s.slice(i + 1, j), drapeaux) }); } catch (e) { /* motif invalide : ignoré */ }
          i = k;
          continue;
        }
      }
      let j = s.indexOf(',', i);
      if (j < 0) j = s.length;
      const txt = s.slice(i, j).trim().toLowerCase();
      if (txt) out.push({ champ, txt });
      i = j;
    }
    return out;
  }

  // Règles de classement, une par ligne : « Catégorie #couleur = motif, … ».
  // La couleur est facultative. La catégorie « - » écarte ce qui correspond.
  // Les lignes vides et celles qui commencent par # sont ignorées. La
  // première règle qui correspond l'emporte.
  static compilerReglesActivite(texte) {
    const regles = [];
    for (const brute of String(texte || '').split('\n')) {
      const l = brute.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i <= 0) continue;
      let tete = l.slice(0, i).trim();
      let couleur = '';
      const mc = tete.match(/\s(#[0-9a-fA-F]{3,8})$/);
      if (mc) { couleur = mc[1]; tete = tete.slice(0, mc.index).trim(); }
      if (!tete) continue;
      const motifs = Ariane.motifsActivite(l.slice(i + 1));
      if (!motifs.length) continue;
      const ignorer = tete === '-';
      regles.push({ categorie: ignorer ? '' : tete, couleur, ignorer, motifs });
    }
    return regles;
  }

  // Règle qui s'applique à un segment : la règle, null si elle l'écarte,
  // undefined si aucune ne correspond.
  static classerActivite(seg, regles) {
    const champs = { app: String(seg.app || ''), titre: String(seg.titre || ''), url: String(seg.url || '') };
    const tout = champs.app + '\n' + champs.titre + '\n' + champs.url;
    const toutBas = tout.toLowerCase();
    for (const r of (regles || [])) {
      for (const m of r.motifs) {
        const cible = m.champ ? champs[m.champ] : tout;
        const ok = m.re ? m.re.test(cible)
          : (m.champ ? cible.toLowerCase() : toutBas).includes(m.txt);
        if (ok) return r.ignorer ? null : r;
      }
    }
    return undefined;
  }

  // Ce qui décrit un segment dans l'infobulle : le domaine pour une page web,
  // sinon l'application et le titre de sa fenêtre.
  static libelleActivite(seg) {
    if (seg.url) {
      const m = String(seg.url).match(/^[a-z][\w+.-]*:\/\/([^/?#]+)/i);
      if (m) return m[1].replace(/^www\./, '');
    }
    const t = String(seg.titre || '').trim();
    const l = t ? (seg.app ? seg.app + ' · ' + t : t) : String(seg.app || '');
    return l.length > 80 ? l.slice(0, 79) + '…' : l;
  }

  // Couleur stable d'une catégorie sans couleur déclarée.
  static couleurActivite(nom) {
    const pal = ['#4a7fd6', '#4f9d69', '#c08a2e', '#b5527a', '#7c5cbf', '#2a9d8f', '#d1603d', '#6c8ead'];
    let h = 0;
    for (const ch of String(nom || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return pal[h % pal.length];
  }

  // « AAAA-MM-JJTHH:MM » en heure locale, la forme des créneaux du calendrier.
  static isoLocalMinute(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return jourIsoDe(d) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // Agrège les segments d'une journée [d0, d1[ en créneaux réels. La journée
  // est découpée en grains (5 min par défaut) ; chaque grain prend la
  // catégorie qui l'a le plus occupé, s'il a été actif au moins un cinquième
  // du temps. Les grains voisins de même catégorie forment un créneau, borné
  // par la première et la dernière activité réelle ; un trou d'un grain au
  // plus ne le coupe pas. Les créneaux dont le temps ACTIF est trop court sont
  // écartés, puis leurs voisins de même catégorie se rejoignent : quatre
  // minutes de courriel au milieu d'une lecture ne la coupent pas en deux.
  static agregerActivite(segments, regles, opts) {
    const o = opts || {};
    const d0 = Number(o.d0);
    const d1 = Number(o.d1);
    const B = Math.max(1, Number(o.grainMin) || 5) * 60000;
    const tolerance = B;
    const dureeMin = Math.max(0, Number(o.dureeMin) || 0) * 60000;
    const autre = String(o.autre || '').trim();
    const grains = new Map(); // indice → Map(catégorie → { ms, a, b, couleur, det: Map(libellé → ms) })
    for (const s of (segments || [])) {
      let r = Ariane.classerActivite(s, regles);
      if (r === null) continue;
      if (r === undefined) {
        if (!autre) continue;
        r = { categorie: autre, couleur: '#8a8a8a' };
      }
      const lib = Ariane.libelleActivite(s);
      const deb = Math.max(s.deb, d0);
      const fin = Math.min(s.fin, d1);
      for (let k = Math.floor((deb - d0) / B); d0 + k * B < fin; k++) {
        const a = Math.max(deb, d0 + k * B);
        const b = Math.min(fin, d0 + (k + 1) * B);
        if (b <= a) continue;
        if (!grains.has(k)) grains.set(k, new Map());
        const g = grains.get(k);
        if (!g.has(r.categorie)) g.set(r.categorie, { ms: 0, a, b, couleur: r.couleur, det: new Map() });
        const c = g.get(r.categorie);
        c.ms += b - a;
        c.a = Math.min(c.a, a);
        c.b = Math.max(c.b, b);
        c.det.set(lib, (c.det.get(lib) || 0) + (b - a));
      }
    }
    const fusionnerDet = (m1, m2) => { for (const [l, v] of m2) m1.set(l, (m1.get(l) || 0) + v); };
    const rejoindre = (liste) => {
      const out = [];
      for (const b of liste) {
        const der = out[out.length - 1];
        if (der && der.categorie === b.categorie && b.deb - der.fin <= tolerance) {
          der.fin = b.fin;
          der.actif += b.actif;
          fusionnerDet(der.det, b.det);
        } else {
          out.push(b);
        }
      }
      return out;
    };
    const bruts = [];
    for (const k of [...grains.keys()].sort((a, b) => a - b)) {
      const g = grains.get(k);
      let total = 0;
      let meilleur = null;
      for (const [cat, c] of g) {
        total += c.ms;
        if (!meilleur || c.ms > meilleur[1].ms) meilleur = [cat, c];
      }
      if (total < B / 5) continue;
      bruts.push({ categorie: meilleur[0], couleur: meilleur[1].couleur, actif: meilleur[1].ms,
        deb: meilleur[1].a, fin: meilleur[1].b, det: new Map(meilleur[1].det) });
    }
    const blocs = rejoindre(rejoindre(bruts).filter((b) => b.actif >= dureeMin));
    return blocs.map((b) => ({
      categorie: b.categorie,
      couleur: b.couleur || Ariane.couleurActivite(b.categorie),
      debut: Ariane.isoLocalMinute(b.deb),
      fin: Ariane.isoLocalMinute(b.fin),
      actifMin: Math.round(b.actif / 60000),
      details: [...b.det].sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([libelle, ms]) => ({ libelle, min: Math.round(ms / 60000) })),
    }));
  }

  // Infobulle d'un créneau réel.
  static infobulleActivite(b) {
    const lignes = [b.categorie + ' · ' + b.debut.slice(11, 16) + '–' + b.fin.slice(11, 16),
      tr('Actif : ') + dureeLisible(b.actifMin)];
    for (const d of (b.details || [])) {
      if (d.min > 0) lignes.push('• ' + d.libelle + ' (' + dureeLisible(d.min) + ')');
    }
    return lignes.join('\n');
  }

  //#endregion Ariane · static · activité réelle

  //#region Ariane · activité réelle (ActivityWatch)
  // ── activité réelle (ActivityWatch) ──────────────────────────────────────

  // ActivityWatch tourne en local : rien à interroger sur mobile.
  activiteDisponible() {
    return !!(this.settings.activiteActif && obsidian.Platform.isDesktopApp);
  }

  async _awGet(chemin) {
    const base = String(this.settings.activiteUrl || 'http://localhost:5600').trim().replace(/\/+$/, '');
    const rep = await obsidian.requestUrl({ url: base + chemin, method: 'GET', throw: false });
    if (rep.status !== 200) throw new Error('HTTP ' + rep.status);
    return rep.json;
  }

  // Seaux du serveur, gardés cinq minutes.
  async _awBuckets(force) {
    const c = this._awBucketsCache;
    if (!force && c && Date.now() - c.le < 300000) return c.data;
    let hote = '';
    try { hote = require('os').hostname(); } catch (e) { /* pas de module os */ }
    const data = Ariane.choisirBucketsAW(await this._awGet('/api/0/buckets/'), hote);
    this._awBucketsCache = { le: Date.now(), data };
    return data;
  }

  // Segments bruts d'un jour local. Un jour passé ne change plus : il reste en
  // mémoire pour la session. Le jour courant est relu au plus toutes les deux
  // minutes. Un jour futur n'a rien.
  async _segmentsDuJour(jour) {
    const auj = jourIsoDe(new Date());
    if (jour > auj) return [];
    const cache = this._activiteSegments || (this._activiteSegments = new Map());
    const c = cache.get(jour);
    if (c && (jour < auj || Date.now() - c.le < 120000)) return c.segs;
    const d0 = new Date(jour + 'T00:00:00').getTime();
    const d1 = new Date(Ariane.decalerJour(jour, 1) + 'T00:00:00').getTime();
    const b = await this._awBuckets();
    const plage = '/events?limit=-1&start=' + encodeURIComponent(new Date(d0).toISOString())
      + '&end=' + encodeURIComponent(new Date(d1).toISOString());
    const lire = async (ids) => {
      const lots = await Promise.all(ids.map((id) =>
        this._awGet('/api/0/buckets/' + encodeURIComponent(id) + plage)));
      return [].concat(...lots.map((l) => (Array.isArray(l) ? l : [])));
    };
    const [fen, afk, web] = await Promise.all([lire(b.fenetre), lire(b.afk), lire(b.web)]);
    const segs = Ariane.segmentsActivite(fen, b.afk.length ? afk : null, web, d0, d1);
    cache.set(jour, { le: Date.now(), segs });
    return segs;
  }

  // Signature des réglages dont dépend l'agrégation : la changer invalide les
  // créneaux calculés, pas les segments lus.
  _signatureActivite() {
    const s = this.settings;
    return [s.activiteRegles, s.activiteAutre, s.activiteGrainMin, s.activiteDureeMin].join('\u0001');
  }

  // Créneaux réels de plusieurs jours : Map(jour → créneaux). Trois jours lus
  // à la fois. Un serveur injoignable donne une Map vide et un avis, une fois.
  async activitePlage(jours) {
    const out = new Map();
    if (!this.activiteDisponible()) return out;
    const sig = this._signatureActivite();
    if (!this._activiteRegles || this._activiteRegles.sig !== sig) {
      this._activiteRegles = { sig, regles: Ariane.compilerReglesActivite(this.settings.activiteRegles) };
      this._activiteBlocs = new Map();
    }
    const regles = this._activiteRegles.regles;
    const file = (jours || []).slice();
    const traiter = async (jour) => {
      const segs = await this._segmentsDuJour(jour);
      const memo = this._activiteBlocs.get(jour);
      if (memo && memo.segs === segs) { out.set(jour, memo.blocs); return; }
      const d0 = new Date(jour + 'T00:00:00').getTime();
      const d1 = new Date(Ariane.decalerJour(jour, 1) + 'T00:00:00').getTime();
      const blocs = Ariane.agregerActivite(segs, regles, {
        d0, d1,
        grainMin: this.settings.activiteGrainMin,
        dureeMin: this.settings.activiteDureeMin,
        autre: this.settings.activiteAutre,
      });
      this._activiteBlocs.set(jour, { segs, blocs });
      out.set(jour, blocs);
    };
    try {
      while (file.length) await Promise.all(file.splice(0, 3).map(traiter));
      this._activiteErreur = '';
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (this._activiteErreur !== msg) {
        this._activiteErreur = msg;
        new obsidian.Notice(tr('ActivityWatch injoignable : ') + msg, 6000);
      }
    }
    return out;
  }

  // Relit le jour courant dans les calendriers ouverts. Les jours passés
  // restent en mémoire : seul aujourd'hui est redemandé au serveur. Tout
  // oublier (réglage changé, test) relit tout et réautorise l'avis d'erreur ;
  // la relecture périodique, elle, ne le répète pas toutes les cinq minutes.
  _rafraichirActivite(toutOublier) {
    if (toutOublier) {
      this._activiteSegments = null;
      this._awBucketsCache = null;
      this._activiteErreur = '';
    }
    const dispo = this.activiteDisponible();
    for (const m of (this._moteursCalendrier || [])) {
      try {
        m._activiteCle = null;
        // Désactivée : la colonne déjà dessinée doit disparaître tout de suite.
        if (!dispo) { m._activite = new Map(); m.dessiner(); } else if (m._chargerActivite) m._chargerActivite();
      } catch (e) { /* vue fermée */ }
    }
  }

  // Une saisie dans les règles ne relance le calcul qu'une fois la frappe
  // finie : chaque touche ne doit pas redessiner les calendriers.
  _rafraichirActiviteDiffere() {
    clearTimeout(this._activiteMinuterie);
    this._activiteMinuterie = setTimeout(() => this._rafraichirActivite(false), 1200);
  }

  // Le jour courant avance : toutes les cinq minutes, les calendriers ouverts
  // relisent aujourd'hui, et ne se redessinent que si quelque chose a changé.
  demarrerActivite() {
    this.registerInterval(window.setInterval(() => {
      if (this.activiteDisponible()) this._rafraichirActivite(false);
    }, 300000));
  }

  // Bouton « Tester » des réglages : ce que le serveur expose, en clair.
  async testerActivityWatch() {
    try {
      const b = await this._awBuckets(true);
      if (!b.fenetre.length) {
        return tr("ActivityWatch répond, mais aucun seau de fenêtres n'existe : aw-watcher-window tourne-t-il ?");
      }
      return tr('ActivityWatch joint') + (b.hote ? ' (' + b.hote + ')' : '') + ' : '
        + b.fenetre.length + tr(' seau(x) de fenêtres, ')
        + (b.afk.length ? tr("absence détectée, ") : tr("pas de seau d'absence, "))
        + (b.web.length ? b.web.length + tr(' navigateur(s).') : tr('aucun navigateur.'));
    } catch (e) {
      return tr('ActivityWatch injoignable : ') + ((e && e.message) || String(e));
    }
  }

  //#endregion Ariane · activité réelle (ActivityWatch)
};
