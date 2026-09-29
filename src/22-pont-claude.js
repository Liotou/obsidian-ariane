//#region 22 · Pont Claude
// ═══════════════════════════════════════════════════════════════════════════
//  22 · PONT CLAUDE
//  Claude, dans Claudian, parle à Ariane par un serveur MCP (mcp/taches.js
//  du dépôt, installé dans ~/.ariane-mcp/). Ce serveur ne sait rien des
//  tâches : il relaie chaque appel d'outil au pont, qui vit ici, dans
//  Obsidian, et répond avec la logique d'Ariane (clés de propriétés,
//  familles, créneaux, journal, analyse). Deux versions de cette logique,
//  l'une dans le greffon et l'autre dans un script, finiraient par diverger.
//
//  Sécurité : le pont n'écoute que sur 127.0.0.1, sur un port choisi par le
//  système, et exige un jeton aléatoire renouvelé à chaque démarrage. Adresse
//  et jeton sont annoncés dans ~/.ariane-mcp/pont.json (droits 600), hors du
//  coffre, qui peut être synchronisé. Les outils ne lisent que les tâches ;
//  le seul qui écrit (lot 3) passe par une validation dans Obsidian.
//  Spec : docs/superpowers/specs/2026-09-29-gestion-taches-claude-design.md.
// ═══════════════════════════════════════════════════════════════════════════

// Où le pont annonce son adresse au serveur MCP.
function pontCheminAnnonce() {
  const os = require('os');
  const path = require('path');
  return path.join(os.homedir(), '.ariane-mcp', 'pont.json');
}

// Le texte d'une note de tâche, sans ses propriétés ni les blocs qu'Ariane
// entretient (ils répètent ce que les outils rendent déjà, en mieux rangé).
function pontCorpsNote(texte) {
  return String(texte || '')
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/<!-- ariane:([a-z-]+) -->[\s\S]*?<!-- \/ariane:\1 -->\n?/g, '')
    .trim();
}

class PontClaude extends obsidian.Component {
  constructor(greffon) {
    super();
    this.greffon = greffon;
    this.serveur = null;
    this.port = 0;
    this.jeton = '';
    // Remplaçable par les tests, pour ne jamais toucher au vrai fichier.
    this.cheminAnnonce = null;
  }

  get coffre() {
    try { return this.greffon.app.vault.adapter.getBasePath(); } catch (e) { return ''; }
  }

  onload() {
    if (!obsidian.Platform.isDesktopApp || this.greffon.settings.claudePont === false) return;
    this.demarrer();
  }

  onunload() { this.arreter(); }

  //#region Pont · écoute
  demarrer() {
    if (this.serveur) return;
    let http;
    let crypto;
    try { http = require('http'); crypto = require('crypto'); } catch (e) { return; }
    this.jeton = crypto.randomBytes(24).toString('hex');
    const srv = http.createServer((req, res) => this._repondre(req, res));
    srv.on('error', (e) => console.error('[Ariane] pont Claude :', e));
    srv.listen(0, '127.0.0.1', () => {
      this.port = srv.address().port;
      this._annoncer(true);
    });
    this.serveur = srv;
  }

  arreter() {
    if (!this.serveur) return;
    try { this.serveur.close(); } catch (e) { /* déjà fermé */ }
    this.serveur = null;
    this._annoncer(false);
  }

  // Écrit (ou retire) l'entrée de ce coffre dans pont.json. Plusieurs coffres
  // ouverts se partagent le fichier ; on ne retire que SON entrée.
  _annoncer(present) {
    const fs = require('fs');
    const path = require('path');
    const fichier = this.cheminAnnonce || pontCheminAnnonce();
    let tout = {};
    try { tout = JSON.parse(fs.readFileSync(fichier, 'utf8')) || {}; } catch (e) { tout = {}; }
    if (!tout.coffres || typeof tout.coffres !== 'object') tout.coffres = {};
    const cle = this.coffre;
    if (present) {
      tout.coffres[cle] = { port: this.port, jeton: this.jeton, pid: process.pid, le: new Date().toISOString() };
    } else if (tout.coffres[cle] && tout.coffres[cle].jeton === this.jeton) {
      delete tout.coffres[cle];
    }
    try {
      fs.mkdirSync(path.dirname(fichier), { recursive: true, mode: 0o700 });
      fs.writeFileSync(fichier, JSON.stringify(tout, null, 2), { mode: 0o600 });
      fs.chmodSync(fichier, 0o600);
    } catch (e) {
      console.error('[Ariane] pont Claude : annonce impossible', e);
    }
  }

  _jetonValide(entete) {
    const recu = String(entete || '').replace(/^Bearer\s+/i, '');
    if (!this.jeton || recu.length !== this.jeton.length) return false;
    try {
      const crypto = require('crypto');
      return crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(this.jeton));
    } catch (e) { return false; }
  }

  _repondre(req, res) {
    const fin = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST' || req.url !== '/outil') return fin(404, { ok: false, erreur: 'inconnu' });
    if (!this._jetonValide(req.headers.authorization)) return fin(401, { ok: false, erreur: 'jeton refusé' });
    let corps = '';
    req.on('data', (c) => {
      corps += c;
      if (corps.length > 1e6) req.destroy();
    });
    req.on('end', async () => {
      let msg;
      try { msg = JSON.parse(corps || '{}'); } catch (e) { return fin(400, { ok: false, erreur: 'JSON illisible' }); }
      try {
        const resultat = await this.executer(String(msg.nom || ''), msg.arguments || {});
        fin(200, { ok: true, resultat });
      } catch (e) {
        fin(200, { ok: false, erreur: e && e.message ? e.message : String(e) });
      }
    });
    return undefined;
  }
  //#endregion Pont · écoute

  //#region Pont · outils de lecture
  async executer(nom, a) {
    switch (nom) {
      case 'lister_taches': return this.listerTaches(a);
      case 'detail_tache': return this.detailTache(a);
      case 'charge_calendrier': return this.chargeCalendrier(a);
      case 'revue': return this.revue(a);
      default: throw new Error('Outil inconnu : ' + nom);
    }
  }

  // Une tâche telle que Claude la reçoit : ses champs, son analyse, ses
  // raisons. Compacte : une liste de soixante tâches doit tenir à l'aise.
  _fiche(x) {
    const t = x.tache;
    const a = x.analyse;
    return {
      ref: t.ref,
      intitule: t.intitule,
      statut: t.statut,
      famille: t.famille,
      priorite: t.priorite || '',
      debut: t.debut || '',
      echeance: t.echeance || '',
      avancement: Number(t.avancement) || 0,
      jalon: t.jalon === true,
      parent: Ariane.refDeLien(t.parent || ''),
      bloque_par: (t.bloquePar || []).map((b) => Ariane.refDeLien(b)).filter(Boolean),
      urgence: a.urgence,
      importance: a.importance,
      diagnostics: a.diagnostics,
      dernier_creneau: a.dernierCreneau,
      prochain_creneau: a.prochainCreneau,
      reports_echeance: a.reports,
      temps_recent_min: x.tempsRecentMin,
    };
  }

  async listerTaches(a) {
    const o = a || {};
    const auj = jourIsoDe(new Date());
    let l = await this.greffon.analyseTaches(auj);
    if (!o.inclure_finies) l = l.filter((x) => x.tache.statut !== 'terminée' && x.tache.statut !== 'abandonnée');
    if (o.statut) l = l.filter((x) => x.tache.statut === o.statut);
    if (o.famille) l = l.filter((x) => x.tache.famille === o.famille);
    if (o.diagnostic) l = l.filter((x) => x.analyse.diagnostics.some((d) => d.code === o.diagnostic));
    if (o.echeance_avant) {
      l = l.filter((x) => Ariane.jourValide(x.tache.echeance) && x.tache.echeance <= o.echeance_avant);
    }
    l.sort((x, y) => y.analyse.urgence.score - x.analyse.urgence.score
      || y.analyse.importance.score - x.analyse.importance.score);
    const limite = Number(o.limite) > 0 ? Number(o.limite) : 100;
    return { aujourdhui: auj, total: l.length, taches: l.slice(0, limite).map((x) => this._fiche(x)) };
  }

  async detailTache(a) {
    const ref = String((a && a.ref) || '').trim();
    if (!ref) throw new Error('Préciser la référence de la tâche (ref).');
    const auj = jourIsoDe(new Date());
    const x = (await this.greffon.analyseTaches(auj)).find((y) => y.tache.ref === ref);
    if (!x) throw new Error('Tâche introuvable : ' + ref);
    const t = x.tache;
    let note = '';
    try { note = pontCorpsNote(await this.greffon.app.vault.cachedRead(t.fichier)); } catch (e) { note = ''; }
    const journal = (await this.greffon.lireJournalTaches()).filter((e) => e.ref === ref);
    // Le temps par jour, sur deux mois : la note de la tâche et ses notes liées.
    const chemins = [t.fichier.path].concat(this.greffon._cheminsLiesTache(t));
    const seuil = Ariane.decalerJour(auj, -60);
    const h = this.greffon.settings.tempsHistorique || {};
    const temps = [];
    for (const jour of Object.keys(h).sort()) {
      if (jour < seuil) continue;
      const min = chemins.reduce((s, c) => s + (Number((h[jour] || {})[c]) || 0) / 60, 0);
      if (min >= 1) temps.push({ jour, minutes: Math.round(min) });
    }
    return Object.assign(this._fiche(x), {
      creneaux: Ariane.creneauxDeTache([].concat(t.creneaux || [])).map((c) => ({
        debut: c.debut, fin: c.fin, passe: c.debut.slice(0, 10) < auj })),
      journal,
      temps_par_jour: temps,
      notes_liees: chemins.slice(1),
      note: note.length > 6000 ? note.slice(0, 6000) + '\n[…]' : note,
    });
  }

  async chargeCalendrier(a) {
    const o = a || {};
    const auj = jourIsoDe(new Date());
    const du = Ariane.jourValide(o.du) || auj;
    let au = Ariane.jourValide(o.au) || Ariane.decalerJour(du, 13);
    if (Ariane.ecartJours(du, au) > 41) au = Ariane.decalerJour(du, 41);
    if (au < du) throw new Error('« au » précède « du ».');
    const taches = this.greffon.tachesPourGantt();
    let evenements = [];
    try { evenements = (await this.greffon.evenementsFond(du, Ariane.decalerJour(au, 1))) || []; } catch (e) { evenements = []; }
    const jours = [];
    for (let j = du; j <= au; j = Ariane.decalerJour(j, 1)) {
      const creneaux = [];
      for (const t of taches) {
        for (const c of Ariane.creneauxDeTache([].concat(t.creneaux || []))) {
          if (c.debut.slice(0, 10) === j) creneaux.push({ ref: t.ref, intitule: t.intitule, debut: c.debut, fin: c.fin });
        }
      }
      const duJour = evenements.filter((e) => String(e.debut || '').slice(0, 10) <= j
        && (String(e.fin || e.debut || '').slice(0, 10) >= j));
      const horaires = duJour.filter((e) => !e.allDay);
      const occupations = creneaux.concat(horaires);
      const minutes = occupations.reduce((s, x) => s + Math.max(0, Ariane.dureeCreneauMin(x.debut, x.fin || x.debut)), 0);
      jours.push({
        jour: j,
        creneaux: creneaux.sort((x, y) => (x.debut < y.debut ? -1 : 1)),
        evenements: horaires.map((e) => ({ titre: e.titre, debut: e.debut, fin: e.fin, calendrier: e.calendrier })),
        journee_entiere: duJour.filter((e) => e.allDay).map((e) => ({ titre: e.titre, calendrier: e.calendrier })),
        minutes_occupees: minutes,
        plages_libres: Ariane.plagesLibres(j, occupations, o.debut_journee || '08:00', o.fin_journee || '19:00', 30),
      });
    }
    return { du, au, jours };
  }

  async revue() {
    const auj = jourIsoDe(new Date());
    const r = Ariane.revueTaches(await this.greffon.analyseTaches(auj), auj);
    const fiches = (l) => l.map((x) => this._fiche(x));
    return {
      aujourdhui: r.aujourdhui,
      en_retard: fiches(r.enRetard),
      sous_planifiees: fiches(r.sousPlanifiees),
      s_etirent: fiches(r.sEtirent),
      abandons_probables: fiches(r.abandonsProbables),
      cette_semaine: fiches(r.cetteSemaine),
      urgent_et_important: fiches(r.urgentImportant),
      important_pas_urgent: fiches(r.importantPasUrgent),
    };
  }
  //#endregion Pont · outils de lecture
}

//#endregion 22 · Pont Claude
