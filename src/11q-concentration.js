// ── avecConcentration ─────────────────────────────────────────────────────
// Domaine : les micro-interruptions et la concentration.
// Les créneaux réels se forment par tranches de quelques minutes : un coup
// d'œil de quarante secondes à un site sans rapport, ou au téléphone, s'y
// perd. Or chacun coupe la concentration. Ici, Ariane les relève sur les
// données brutes (segments du Mac et de l'iPhone), dès quelques secondes :
//  - un segment du Mac ou de l'iPhone qui est une distraction (liste de
//    Monsieur, règles d'activité, ou appris de l'IA, site par site) ;
//  - le téléphone utilisé pendant que le Mac l'est (une interruption).
// Le calendrier les marque d'un trait rouge en travers de la colonne des
// créneaux réels ; la chronologie et le bilan du soir en tirent des mesures
// (nombre par heure de travail, plages de concentration).
const avecConcentration = (Base) => class extends Base {
  //#region Ariane · concentration (statique)
  // ── fonctions pures ─────────────────────────────────────────────────────

  // La clé d'un segment pour juger s'il distrait : le domaine d'une page
  // web, sinon le nom de l'application (sans « (iPhone) »), en minuscules.
  static cleDistraction(seg) {
    const u = String((seg && seg.url) || '');
    const m = u.match(/^[a-z][\w+.-]*:\/\/([^/?#]+)/i);
    if (m) return m[1].replace(/^www\./, '').toLowerCase();
    return String((seg && seg.app) || '').replace(/\s*\(iPhone\)\s*$/, '').trim().toLowerCase();
  }

  // Une liste de Monsieur (un élément par ligne : domaine ou application) en
  // fonction de test : un domaine vaut aussi pour ses sous-domaines.
  static compilerListeDistractions(texte) {
    const l = String(texte || '').split('\n').map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
      .filter((x) => x && !x.startsWith('#'));
    return (cle) => l.some((x) => cle === x || cle.endsWith('.' + x));
  }

  // Une catégorie de vie privée ou de distraction (même lecture que l'IA).
  static estCategorieDistraction(nom) {
    return /personnel|distraction|priv|loisir/i.test(String(nom || ''));
  }

  // Les micro-interruptions d'un jour : [{ deb, fin, quoi, source }] (ms ;
  // source 'mac' ou 'iphone'). `segs` : les segments du jour (Mac et
  // iPhone) ; `interruptions` : le téléphone utilisé pendant le Mac ;
  // `distrait(seg)` : ce segment distrait-il ? Les morceaux d'une même chose
  // séparés de moins de `fusionSec` se rejoignent ; ceux de moins de
  // `seuilSec` en tout sont écartés.
  static microDistractions(segs, interruptions, distrait, opts) {
    const o = Object.assign({ seuilSec: 10, fusionSec: 20 }, opts || {});
    const bruts = [];
    for (const s of (segs || [])) {
      if (!(s.fin > s.deb) || !distrait(s)) continue;
      const iphone = s.appareil === 'iphone';
      bruts.push({ deb: s.deb, fin: s.fin, source: iphone ? 'iphone' : 'mac',
        quoi: iphone ? String(s.app || '').replace(/\s*\(iPhone\)\s*$/, '') : (Ariane.cleDistraction(s) || String(s.app || '')) });
    }
    for (const x of (interruptions || [])) {
      if (x.fin > x.deb) bruts.push({ deb: x.deb, fin: x.fin, source: 'iphone', quoi: x.app });
    }
    bruts.sort((a, b) => a.deb - b.deb);
    const out = [];
    for (const b of bruts) {
      const der = out[out.length - 1];
      if (der && der.source === b.source && der.quoi === b.quoi && b.deb - der.fin <= o.fusionSec * 1000) {
        der.fin = Math.max(der.fin, b.fin);
      } else if (der && b.deb < der.fin) {
        // Deux sources en même temps (le téléphone pendant un site distrayant) :
        // une seule interruption, la première nommée.
        der.fin = Math.max(der.fin, b.fin);
      } else {
        out.push(Object.assign({}, b));
      }
    }
    return out.filter((x) => x.fin - x.deb >= o.seuilSec * 1000);
  }

  // Les plages de concentration d'une journée : le travail (rail sans le
  // personnel, en minutes depuis minuit), les pauses de moins de `pause`
  // minutes comblées, puis coupé à chaque micro-interruption. Rend { n,
  // moyenne, longue } (minutes ; plages de 5 min au moins).
  static plagesConcentration(rail, micro, pause) {
    const p = Number(pause) >= 0 ? Number(pause) : 5;
    const segs = (rail || []).filter((x) => x.genre !== 'personnel').map((x) => [x.a, x.b]).sort((x, y) => x[0] - y[0]);
    const plages = [];
    for (const [a, b] of segs) {
      const der = plages[plages.length - 1];
      if (der && a - der[1] <= p) der[1] = Math.max(der[1], b);
      else plages.push([a, b]);
    }
    const coupes = Ariane.fusionnerIntervalles((micro || []).map((m) => [m.a, Math.max(m.b, m.a + 0.01)]));
    const durees = [];
    for (const [a, b] of plages) {
      for (const [x, y] of Ariane.couperParIntervallesInverses(a, b, coupes)) durees.push(y - x);
    }
    const utiles = durees.filter((d) => d >= 5);
    return { n: utiles.length, moyenne: utiles.length ? utiles.reduce((s, d) => s + d, 0) / utiles.length : 0,
      longue: utiles.length ? Math.max(...utiles) : 0 };
  }

  // Une micro-interruption en une ligne : « 10:42 reddit.com, 40 s ».
  static libelleMicro(m) {
    const d = new Date(m.deb);
    const sec = Math.round((m.fin - m.deb) / 1000);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + m.quoi
      + (m.source === 'iphone' ? ' (iPhone)' : '') + ', ' + (sec < 60 ? sec + ' s' : Math.round(sec / 60) + ' min');
  }

  // Les micro-interruptions survenues pendant le travail : celles qui
  // commencent dans une pièce du rail qui n'est pas « personnel » (minutes
  // depuis minuit, champs a et b). Les autres ne coupent rien.
  static microPendantTravail(micro, rail) {
    const travail = (rail || []).filter((x) => x.genre !== 'personnel');
    return (micro || []).filter((m) => travail.some((x) => m.a >= x.a && m.a < x.b));
  }

  // Ce qui distrait le plus : [{ quoi, n, sec }], par nombre de fois.
  static principalesDistractions(micro, max) {
    const m = new Map();
    for (const x of (micro || [])) {
      const k = x.quoi || '?';
      const v = m.get(k) || { quoi: k, n: 0, sec: 0 };
      v.n++;
      v.sec += (x.fin - x.deb) / 1000;
      m.set(k, v);
    }
    return [...m.values()].sort((a, b) => (b.n - a.n) || (b.sec - a.sec)).slice(0, max || 5);
  }

  // La consigne pour classer, en une fois, des sites et applications
  // inconnus : distraction ou non, pour le travail de Monsieur.
  static promptDistractions(cles, contexte) {
    return [
      'Pour chacun des sites et applications ci-dessous, dis si, ouvert pendant une journée de travail, c\'est une distraction (true) ou un outil de travail (false).',
      contexte ? 'Contexte : ' + contexte : '',
      'Une messagerie personnelle, un réseau social, une vidéo de loisir, un achat, l\'actualité générale sont des distractions ; une base bibliographique, un outil de rédaction, la messagerie du travail, un moteur de recherche ne le sont pas.',
      '',
      'Réponds UNIQUEMENT par du JSON : {"cle": true ou false, …}, avec exactement les clés données.',
      '',
      cles.map((c) => '- ' + c).join('\n'),
    ].filter((x) => x !== '').join('\n');
  }

  //#endregion Ariane · concentration (statique)

  //#region Ariane · concentration
  // ── distractions apprises, micro-interruptions d'un jour ────────────────

  get cheminDistractionsApprises() { return '.ariane/distractions.json'; }

  async _chargerDistractionsApprises() {
    if (this._distractionsApprises) return this._distractionsApprises;
    let o = {};
    try {
      const a = this.app.vault.adapter;
      if (await a.exists(this.cheminDistractionsApprises)) o = JSON.parse(await a.read(this.cheminDistractionsApprises)) || {};
    } catch (e) { o = {}; }
    this._distractionsApprises = o;
    return o;
  }

  async _sauverDistractionsApprises() {
    const a = this.app.vault.adapter;
    if (!(await a.exists('.ariane'))) await a.mkdir('.ariane');
    await a.write(this.cheminDistractionsApprises, JSON.stringify(this._distractionsApprises || {}, null, 1));
  }

  // Le juge d'un segment : les exceptions de Monsieur d'abord, puis sa liste,
  // puis les règles d'activité (catégorie de distraction), puis ce que l'IA a
  // appris. L'iPhone, faute de mieux, est jugé comme le Mac.
  _jugeDistraction() {
    const s = this.settings;
    const sig = [s.distractionsListe, s.distractionsExceptions, s.activiteRegles].join('\u0001');
    if (this._juge && this._juge.sig === sig && this._juge.appris === this._distractionsApprises) return this._juge.fn;
    const oui = Ariane.compilerListeDistractions(s.distractionsListe);
    const non = Ariane.compilerListeDistractions(s.distractionsExceptions);
    const regles = Ariane.compilerReglesActivite(s.activiteRegles);
    const appris = this._distractionsApprises || {};
    const memo = new Map();
    const fn = (seg) => {
      const cle = Ariane.cleDistraction(seg);
      if (!cle) return false;
      const k = cle + '\u0001' + (seg.titre || '');
      if (memo.has(k)) return memo.get(k);
      let v;
      if (non(cle)) v = false;
      else if (oui(cle)) v = true;
      else {
        const r = Ariane.classerActivite(seg, regles);
        if (r && Ariane.estCategorieDistraction(r.categorie)) v = true;
        else v = !!(appris[cle] && appris[cle].d);
      }
      memo.set(k, v);
      return v;
    };
    this._juge = { sig, appris: this._distractionsApprises, fn };
    return fn;
  }

  // Les micro-interruptions d'un jour, à partir des segments déjà lus
  // (activitePlage les a demandés). Gardées par jour et par segments.
  async microDuJour(jour) {
    if (!this.activiteDisponible || !this.activiteDisponible()) return [];
    await this._chargerDistractionsApprises();
    let segs;
    try { segs = await this._segmentsDuJour(jour); } catch (e) { return []; }
    const inter = (this._iphoneInterruptions && this._iphoneInterruptions.get(jour)) || [];
    const juge = this._jugeDistraction();
    const cache = this._microCache || (this._microCache = new Map());
    const c = cache.get(jour);
    if (c && c.segs === segs && c.juge === juge && c.inter === inter) return c.micro;
    const micro = Ariane.microDistractions(segs, inter, juge, { seuilSec: Number(this.settings.distractionSeuilSec) || 10 });
    cache.set(jour, { segs, juge, inter, micro });
    return micro;
  }

  // Classe par l'IA, en une fois, les sites et applications des jours
  // donnés que rien ne juge encore (ni liste, ni règle, ni apprentissage).
  // Les quarante plus fréquentés au plus. Rend le nombre appris.
  async classerDistractionsInconnues(jours, silencieux) {
    if (!this.activiteDisponible || !this.activiteDisponible()) return 0;
    const appris = await this._chargerDistractionsApprises();
    const s = this.settings;
    const oui = Ariane.compilerListeDistractions(s.distractionsListe);
    const non = Ariane.compilerListeDistractions(s.distractionsExceptions);
    const regles = Ariane.compilerReglesActivite(s.activiteRegles);
    const temps = new Map();
    for (const j of jours) {
      let segs = [];
      try { segs = await this._segmentsDuJour(j); } catch (e) { continue; }
      for (const seg of segs) {
        const cle = Ariane.cleDistraction(seg);
        if (!cle || appris[cle] || oui(cle) || non(cle)) continue;
        const r = Ariane.classerActivite(seg, regles);
        if (r && Ariane.estCategorieDistraction(r.categorie)) continue;
        temps.set(cle, (temps.get(cle) || 0) + (seg.fin - seg.deb));
      }
    }
    const cles = [...temps].sort((a, b) => b[1] - a[1]).slice(0, 40).map((x) => x[0]);
    if (!cles.length) { if (!silencieux) new obsidian.Notice(tr('Distractions : rien de nouveau à classer.')); return 0; }
    const avis = silencieux ? null : new obsidian.Notice(tr('Distractions : classement de ') + cles.length + tr(' sites et applications…'), 0);
    try {
      const rep = await this._genererActiviteIA(Ariane.promptDistractions(cles, s.activiteIAContexte), 1200, 'synthese');
      const le = jourIsoDe(new Date());
      let n = 0;
      for (const c of cles) {
        if (typeof rep[c] === 'boolean') { appris[c] = { d: rep[c], le }; n++; }
      }
      this._distractionsApprises = Object.assign({}, appris);
      await this._sauverDistractionsApprises();
      if (avis) avis.hide();
      if (!silencieux) new obsidian.Notice(tr('Distractions : ') + n + tr(' sites et applications classés.'));
      this._rafraichirActivite(false);
      return n;
    } catch (e) {
      if (avis) avis.hide();
      if (!silencieux) new obsidian.Notice(tr('Distractions : classement impossible : ') + ((e && e.message) || e), 10000);
      return 0;
    }
  }

  // Avec le résumé automatique des créneaux : le classement des inconnus
  // suit, une fois toutes les six heures au plus.
  _classerDistractionsAuto(jours) {
    if (!this.settings.activiteIAAuto) return;
    if (this._distractionsAutoLe && Date.now() - this._distractionsAutoLe < 6 * 3600000) return;
    this._distractionsAutoLe = Date.now();
    this.classerDistractionsInconnues(jours, true).catch(() => {});
  }

  //#endregion Ariane · concentration
};
