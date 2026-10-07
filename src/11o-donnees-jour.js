// ── avecDonneesJour ───────────────────────────────────────────────────────
// Domaine : les données du temps et de l'activité, rangées par jour.
// Un fichier JSON par jour dans « .ariane/jours/AAAA-MM-JJ.json », caché à la
// racine du coffre : il suit sa sauvegarde, et Obsidian ne le traite pas comme
// une note (ni recherche, ni graphe, ni bases). La chronologie l'affiche. Il
// réunit ce qui était dispersé entre les réglages, le dossier du greffon et
// les notes de l'ancien journal du temps :
//   temps         secondes par note (le compteur de temps)
//   sessions      sessions de travail dans Obsidian (heures)
//   onglets       onglets de Safari relevés par Ariane
//   activiteIA    résumés et catégories de l'IA des créneaux hors Obsidian
//   chronologie   événements de la chronologie d'activité
//   taches        modifications des tâches (journal)
//   resumeJournee le résumé de la journée par l'IA { texte, le, modele }
// Les rattachements restent dans les notes de tâche, les caches dans le
// dossier du greffon.
const avecDonneesJour = (Base) => class extends Base {
  //#region Ariane · données par jour
  // ── données par jour ────────────────────────────────────────────────────

  get dossierDonneesJour() { return '.ariane/jours'; }

  cheminDonneesJour(jour) { return this.dossierDonneesJour + '/' + jour + '.json'; }

  // Les données d'un jour, lues une fois par session ; la promesse est gardée
  // pour que deux appels simultanés partagent le même objet.
  donneesJour(jour) {
    const cache = this._jours || (this._jours = new Map());
    if (!cache.has(jour)) {
      cache.set(jour, (async () => {
        let o = null;
        try {
          const a = this.app.vault.adapter;
          const c = this.cheminDonneesJour(jour);
          if (await a.exists(c)) o = JSON.parse(await a.read(c));
        } catch (e) { console.warn('[Ariane] données du ' + jour + ' illisibles', e); }
        return Object.assign({ version: 1, jour }, o && typeof o === 'object' ? o : {});
      })());
    }
    return cache.get(jour);
  }

  // Les jours qui ont un fichier, du plus ancien au plus récent.
  async joursAvecDonnees() {
    try {
      const l = await this.app.vault.adapter.list(this.dossierDonneesJour);
      return (l.files || []).map((f) => f.split('/').pop())
        .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map((n) => n.slice(0, 10)).sort();
    } catch (e) { return []; }
  }

  // Les jours touchés s'écrivent groupés, quelques secondes plus tard.
  marquerJourSale(jour) {
    (this._joursSales || (this._joursSales = new Set())).add(jour);
    clearTimeout(this._joursMinuterie);
    this._joursMinuterie = setTimeout(() => this.ecrireDonneesJours(), 5000);
  }

  async _creerDossierDonneesJour() {
    const a = this.app.vault.adapter;
    const j = this.dossierDonneesJour;
    const parent = j.split('/').slice(0, -1).join('/');
    if (parent && !(await a.exists(parent))) await a.mkdir(parent);
    if (!(await a.exists(j))) await a.mkdir(j);
  }

  async ecrireDonneesJours() {
    clearTimeout(this._joursMinuterie);
    const sales = [...(this._joursSales || [])];
    if (!sales.length) return;
    this._joursSales = new Set();
    const a = this.app.vault.adapter;
    try {
      await this._creerDossierDonneesJour();
      for (const jour of sales) {
        const o = await this.donneesJour(jour);
        // Le compteur de temps tient son relevé en mémoire : il rejoint le
        // fichier du jour à l'écriture.
        const h = this.settings.tempsHistorique || {};
        if (h[jour]) o.temps = Object.assign({}, h[jour]);
        await a.write(this.cheminDonneesJour(jour), JSON.stringify(o, null, 1));
      }
    } catch (e) {
      console.error('[Ariane] données par jour non écrites', e);
    }
  }

  // Ajoute un élément à une liste du jour.
  async ajouterDonneeJour(jour, cle, element) {
    const o = await this.donneesJour(jour);
    (o[cle] || (o[cle] = [])).push(element);
    this.marquerJourSale(jour);
  }

  // Les listes `cle` des jours depuis `depuis` (inclus), bout à bout.
  async listesDepuis(cle, depuis) {
    const out = [];
    for (const j of await this.joursAvecDonnees()) {
      if (depuis && j < depuis) continue;
      const o = await this.donneesJour(j);
      for (const x of (o[cle] || [])) out.push(x);
    }
    return out;
  }

  // Le relevé du compteur de temps (secondes par note) des jours récents,
  // remis en mémoire au démarrage. La mémoire l'emporte quand elle a déjà
  // compté plus (la journée en cours).
  async chargerTempsDepuisJours() {
    const garder = Math.max(7, this.settings.tempsRetenirJours || 120);
    const seuil = jourIsoDe(new Date(Date.now() - garder * 86400000));
    const h = this.settings.tempsHistorique || (this.settings.tempsHistorique = {});
    for (const j of await this.joursAvecDonnees()) {
      if (j < seuil) continue;
      const o = await this.donneesJour(j);
      if (!o.temps) continue;
      const m = h[j] || (h[j] = {});
      for (const [c, sec] of Object.entries(o.temps)) m[c] = Math.max(Number(m[c]) || 0, Number(sec) || 0);
    }
  }

  // ── migration (une fois) ────────────────────────────────────────────────
  //  Les données éparses d'avant (réglages, dossier du greffon) passent dans
  //  les fichiers du jour. Les anciens fichiers sont gardés, renommés
  //  « .avant-donnees-jour », le temps de vérifier.

  async migrerVersDonneesJour() {
    const v = Number(this.settings.donneesJourVersion) || 0;
    if (v < 1) await this._migrerDonneesV1();
    if (v < 2) await this._migrerDonneesV2();
  }

  async _migrerDonneesV1() {
    const a = this.app.vault.adapter;
    const dir = (this.manifest && this.manifest.dir) || '.obsidian/plugins/obsidian-ariane';
    const lire = async (c) => { try { return (await a.exists(c)) ? await a.read(c) : ''; } catch (e) { return ''; } };
    const lignes = (t) => String(t || '').split('\n').filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
    const jourDe = (iso) => String(iso || '').slice(0, 10);
    const ajouter = async (jour, cle, x) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return;
      const o = await this.donneesJour(jour);
      (o[cle] || (o[cle] = [])).push(x);
      this.marquerJourSale(jour);
    };
    let n = 0;
    // Sessions (renommages rejoués).
    const sess = [];
    for (const x of lignes(await lire(dir + '/sessions-travail.jsonl'))) {
      if (x.renomme) { for (const y of sess) if (y.chemin === x.renomme) y.chemin = x.vers; } else if (x.chemin) sess.push(x);
    }
    for (const x of sess) { await ajouter(jourDe(x.debut), 'sessions', x); n++; }
    // Onglets de Safari (millisecondes).
    for (const x of lignes(await lire(dir + '/onglets-safari.jsonl'))) {
      if (x && x.url) { await ajouter(jourIsoDe(new Date(x.debut)), 'onglets', x); n++; }
    }
    // Journal des tâches.
    for (const x of lignes(await lire(dir + '/journal-taches.jsonl'))) { await ajouter(jourDe(x.le), 'taches', x); n++; }
    // Résumés de l'IA des créneaux.
    try {
      const r = JSON.parse((await lire(dir + '/activite-ia.json')) || '{}');
      for (const [cle, v] of Object.entries(r || {})) {
        const jour = cle.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) continue;
        const o = await this.donneesJour(jour);
        (o.activiteIA || (o.activiteIA = {}))[cle] = v;
        this.marquerJourSale(jour);
        n++;
      }
    } catch (e) { /* fichier absent ou abîmé */ }
    // Chronologie (un fichier par mois).
    try {
      const l = await a.list(dir + '/chronologie');
      for (const f of (l.files || [])) {
        if (!/\.json$/.test(f)) continue;
        const m = JSON.parse((await lire(f)) || '{}');
        for (const [jour, evts] of Object.entries(m || {})) {
          for (const e of (evts || [])) { await ajouter(jour, 'chronologie', e); n++; }
        }
      }
    } catch (e) { /* pas de chronologie */ }
    // Le relevé du compteur de temps, sorti des réglages.
    for (const [jour, m] of Object.entries(this.settings.tempsHistorique || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) continue;
      const o = await this.donneesJour(jour);
      o.temps = Object.assign({}, o.temps || {}, m);
      this.marquerJourSale(jour);
    }
    await this.ecrireDonneesJours();
    // Les anciens fichiers, gardés de côté.
    for (const f of ['sessions-travail.jsonl', 'onglets-safari.jsonl', 'journal-taches.jsonl', 'activite-ia.json']) {
      try { if (await a.exists(dir + '/' + f)) await a.rename(dir + '/' + f, dir + '/' + f + '.avant-donnees-jour'); } catch (e) { /* rien */ }
    }
    try { if (await a.exists(dir + '/chronologie')) await a.rename(dir + '/chronologie', dir + '/chronologie.avant-donnees-jour'); } catch (e) { /* rien */ }
    this.settings.donneesJourVersion = 1;
    await this.saveSettings();
    if (n) new obsidian.Notice(tr('Données du temps et de l’activité rangées par jour dans ') + this.dossierDonneesJour + ' (' + n + ').', 8000);
  }

  // Version 2 : plus de notes de journal du temps. Les fichiers du jour
  // quittent « <journal du temps>/.données » pour « .ariane/jours » (fusionnés
  // si les deux existent), puis le dossier du journal part à la corbeille du
  // système, s'il ne contient que des notes datées.
  async _migrerDonneesV2() {
    const a = this.app.vault.adapter;
    const ancien = String(this.settings.tempsDossierJournal || '07 - Journal du temps').replace(/^\/+|\/+$/g, '');
    const vieux = ancien + '/.données';
    let n = 0;
    try {
      if (await a.exists(vieux)) {
        // Ce qui est déjà en mémoire part d'abord sur le disque, au nouvel
        // endroit ; le cache est ensuite relu.
        await this.ecrireDonneesJours();
        await this._creerDossierDonneesJour();
        const l = await a.list(vieux);
        for (const f of (l.files || [])) {
          const nom = f.split('/').pop();
          const dest = this.dossierDonneesJour + '/' + nom;
          if (await a.exists(dest)) {
            const o = Ariane.fusionnerDonneesJour(JSON.parse(await a.read(dest)), JSON.parse(await a.read(f)));
            await a.write(dest, JSON.stringify(o, null, 1));
            await a.remove(f);
          } else {
            await a.rename(f, dest);
          }
          n++;
        }
        try { await a.rmdir(vieux, false); } catch (e) { /* pas vide */ }
        this._jours = new Map();
      }
    } catch (e) {
      console.error('[Ariane] déplacement des données par jour', e);
      return; // on réessaiera au prochain démarrage
    }
    let retire = false;
    const dossier = this.app.vault.getAbstractFileByPath && this.app.vault.getAbstractFileByPath(ancien);
    if (dossier && dossier instanceof obsidian.TFolder && !(await a.exists(vieux))) {
      const enfants = dossier.children || [];
      const seulementJournal = enfants.every((f) => f instanceof obsidian.TFile && /^\d{4}-\d{2}-\d{2}\.md$/.test(f.name));
      if (seulementJournal) {
        try { await this.app.vault.trash(dossier, true); retire = true; } catch (e) { console.error('[Ariane] journal du temps', e); }
      }
    }
    this.settings.donneesJourVersion = 2;
    await this.saveSettings();
    if (n || retire) {
      new obsidian.Notice(tr('Journal du temps : les données du jour sont désormais dans ') + this.dossierDonneesJour
        + (retire ? tr(', et le dossier « ') + ancien + tr(' » est dans la corbeille.') : '.'), 10000);
    }
  }

  // Deux versions d'un même jour réunies : listes mises bout à bout (sans
  // doublon exact), objets complétés, le reste gardé de `a`.
  static fusionnerDonneesJour(a, b) {
    const o = Object.assign({}, b || {}, a || {});
    for (const [k, vb] of Object.entries(b || {})) {
      const va = (a || {})[k];
      if (Array.isArray(va) && Array.isArray(vb)) {
        const vus = new Set(va.map((x) => JSON.stringify(x)));
        o[k] = va.concat(vb.filter((x) => !vus.has(JSON.stringify(x))));
      } else if (va && vb && typeof va === 'object' && typeof vb === 'object' && !Array.isArray(va)) {
        o[k] = Object.assign({}, vb, va);
      }
    }
    return o;
  }

  // Le temps passé dans chaque note un jour donné, en minutes, du plus long
  // au plus court (une minute au moins).
  async tempsDuJour(jour) {
    const m = Object.assign({}, (await this.donneesJour(jour)).temps || {});
    for (const [c, sec] of Object.entries((this.settings.tempsHistorique || {})[jour] || {})) {
      m[c] = Math.max(Number(m[c]) || 0, Number(sec) || 0);
    }
    return Object.entries(m).map(([chemin, sec]) => ({ chemin, min: (Number(sec) || 0) / 60 }))
      .filter((x) => x.min >= 1).sort((x, y) => y.min - x.min);
  }

  //#endregion Ariane · données par jour

  //#region Ariane · résumé de la journée
  // ── résumé de la journée ────────────────────────────────────────────────
  //  Un méta-résumé de la journée par l'IA (celle de l'activité) : ce qui a
  //  été accompli, où le temps est allé, les moments de distraction, à partir
  //  de tous les créneaux (dans Obsidian et hors d'Obsidian), des tâches
  //  terminées et des notes créées. Écrit pour être lu à voix haute. Il se
  //  retrouve toujours au même endroit : .ariane/jours/AAAA-MM-JJ.json, clé
  //  resumeJournee.texte ; la chronologie l'affiche sous le jour.

  // La matière du résumé, en lignes lisibles par l'IA.
  async _matiereJournee(jour) {
    const l = [];
    const reel = this.donneesTempsReel ? await this.donneesTempsReel(Ariane.lundiDeSemaine(jour), jour) : null;
    const pj = reel && reel.parJour.find((x) => x.jour === jour);
    if (pj) {
      l.push('Temps dans Obsidian : ' + dureeLisible(pj.obsidian) + ' ; hors Obsidian (travail) : '
        + dureeLisible(pj.externe) + ' ; personnel ou distraction : ' + dureeLisible(pj.personnel) + '.');
    }
    // Les notes travaillées dans Obsidian.
    const h = (this.settings.tempsHistorique || {})[jour] || {};
    const notes = Object.entries(h).map(([c, s]) => [c, s / 60]).filter(([, m]) => m >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (notes.length) {
      l.push('', 'NOTES TRAVAILLÉES DANS OBSIDIAN :');
      const parChemin = new Map(this.tachesPourGantt().filter((t) => t.fichier).map((t) => [t.fichier.path, t]));
      for (const [c, m] of notes) {
        const t = parChemin.get(c);
        l.push('- ' + dureeLisible(m) + ' : ' + c.split('/').pop().replace(/\.md$/, '') + (t ? ' (tâche ' + t.ref + ' : ' + t.intitule + ')' : ''));
      }
    }
    // Les créneaux hors Obsidian, avec leur résumé et leur catégorie.
    if (this.activiteDisponible && this.activiteDisponible()) {
      const blocs = ((await this.activitePlage([jour])).get(jour) || []);
      if (blocs.length) {
        l.push('', 'CRÉNEAUX HORS OBSIDIAN :');
        for (const b of blocs) {
          const ia = b.ia;
          const quoi = ia && ia.resume ? ia.resume : (b.details || []).slice(0, 3).map((d) => d.libelle).join(' ; ');
          l.push('- ' + b.debut.slice(11, 16) + ' à ' + b.fin.slice(11, 16) + ', ' + dureeLisible(b.actifMin)
            + ' actives, ' + (ia ? ia.categorie : b.categorie) + (ia && ia.personnel ? ' (personnel ou distraction)' : '')
            + ' : ' + quoi + ((b.rattache || []).length ? ' [pour ' + b.rattache.map((r) => r.ref).join(', ') + ']' : ''));
        }
      }
    }
    // Les événements du calendrier (Apple Agenda) : cours, réunions,
    // rendez-vous. Ceux qui portent un créneau de tâche n'y sont pas.
    const evts = await this._lignesEvenementsJour(jour);
    if (evts.length) { l.push('', 'ÉVÉNEMENTS DU CALENDRIER :'); l.push(...evts); }
    // Les tâches : terminées, avancées, et les créneaux prévus avec ce qui y
    // a été fait (même calcul que la jauge du calendrier).
    const o = await this.donneesJour(jour);
    const taches = this.tachesPourGantt();
    const parRef = new Map(taches.map((t) => [t.ref, t]));
    const nomTache = (ref) => ref + ' ' + ((parRef.get(ref) || {}).intitule || '');
    const terminees = (o.taches || []).filter((x) => x.champ === 'statut' && x.apres === 'terminée');
    if (terminees.length) {
      l.push('', 'TÂCHES TERMINÉES :');
      for (const x of terminees) l.push('- ' + nomTache(x.ref));
    }
    const avancees = new Map();
    for (const x of (o.taches || [])) {
      if (x.champ !== 'avancement') continue;
      const a = avancees.get(x.ref);
      avancees.set(x.ref, { avant: a ? a.avant : x.avant, apres: x.apres });
    }
    const lignesAv = [...avancees].filter(([, v]) => Number(v.apres) !== Number(v.avant))
      .map(([ref, v]) => '- ' + nomTache(ref) + ' : de ' + (Number(v.avant) || 0) + ' % à ' + (Number(v.apres) || 0) + ' %');
    if (lignesAv.length) { l.push('', 'AVANCEMENT DÉCLARÉ :'); l.push(...lignesAv); }
    const sessions = this.sessionsTravail ? this.sessionsTravail() : [];
    const maintenant = Ariane.instantSession(new Date());
    const prevus = [];
    for (const t of taches) {
      const chemins = t.fichier ? [t.fichier.path].concat(this._cheminsLiesTache(t)) : [];
      for (const c of Ariane.creneauxDeTache([].concat(t.creneaux || []))) {
        if (c.debut.slice(0, 10) !== jour) continue;
        const prevu = Ariane.dureeCreneauMin(c.debut, c.fin);
        let etat;
        if (c.debut > maintenant) {
          etat = 'à venir';
        } else {
          const fait = Ariane.minutesFaitesCreneau(c.debut, c.fin, sessions, chemins, t.tempsReel);
          const part = prevu ? fait / prevu : 0;
          etat = (c.fin > maintenant ? 'en cours, ' : '')
            + (fait <= 0 ? 'aucun travail relevé'
              : dureeLisible(fait) + ' faites sur ' + dureeLisible(prevu)
                + (part >= 0.8 ? ' (tenu)' : part >= 0.3 ? ' (en partie)' : ' (à peine entamé)'));
        }
        prevus.push(c.debut.slice(11, 16) + ' à ' + c.fin.slice(11, 16) + ' : ' + t.ref + ' ' + t.intitule
          + ' (statut ' + (t.statut || 'à faire') + ') : ' + etat);
      }
    }
    if (prevus.length) { l.push('', 'CRÉNEAUX DE TÂCHES PRÉVUS ET RÉALISÉ :'); for (const p of prevus.sort()) l.push('- ' + p); }
    // Les échéances du jour restées ouvertes.
    const dues = taches.filter((t) => t.echeance === jour && t.statut !== 'terminée' && t.statut !== 'abandonnée');
    if (dues.length) {
      l.push('', 'ÉCHÉANCES DU JOUR NON TERMINÉES :');
      for (const t of dues) l.push('- ' + t.ref + ' ' + t.intitule + (t.jalon ? ' (jalon)' : '') + ', statut ' + (t.statut || 'à faire'));
    }
    // Les ajouts automatiques (synchronisations) réduits à une ligne par lot :
    // ce n'est pas du travail, et des dizaines de titres noieraient le reste.
    const groupes = Ariane.grouperAjoutsAuto((o.chronologie || []).slice().sort((a, b) => b.t - a.t));
    const crees = groupes.filter((e) => e.type === 'note-creee' || e.type === 'capture');
    if (crees.length) {
      l.push('', 'NOTES CRÉÉES PAR MONSIEUR :');
      for (const e of crees.slice(0, 10)) l.push('- ' + (e.titre || String(e.chemin || '').split('/').pop()));
      if (crees.length > 10) l.push('- et ' + (crees.length - 10) + ' autres');
    }
    const lots = groupes.filter((e) => e.type === 'ajouts-auto');
    if (lots.length) {
      l.push('', 'AJOUTS AUTOMATIQUES (synchronisations, sans intervention de Monsieur ; ne pas les compter comme du travail) :');
      for (const e of lots) l.push('- ' + e.n + ' notes dans ' + (e.source || e.dossier || 'le coffre'));
    }
    return l.join('\n').trim();
  }

  // Les événements Apple Agenda d'un jour, en lignes lisibles. Ceux qui
  // portent un créneau de tâche n'y sont pas (evenementsFond les écarte).
  async _lignesEvenementsJour(jour) {
    let evts = [];
    try { evts = (await this.evenementsFond(jour, Ariane.decalerJour(jour, 1))) || []; } catch (e) { evts = []; }
    return evts.filter((e) => String(e.debut).slice(0, 10) <= jour && String(e.fin || e.debut).slice(0, 10) >= jour)
      .sort((a, b) => String(a.debut).localeCompare(String(b.debut)))
      .slice(0, 15)
      .map((e) => {
        const quand = e.allDay ? 'toute la journée' : String(e.debut).slice(11, 16) + ' à ' + String(e.fin).slice(11, 16);
        const plus = [e.calendrier ? 'agenda ' + e.calendrier : '', e.lieu ? 'lieu : ' + e.lieu : '',
          (e.participants || []).length ? (e.participants.length + ' participant' + (e.participants.length > 1 ? 's' : '')) : '']
          .filter(Boolean).join(', ');
        return '- ' + quand + ' : ' + e.titre + (plus ? ' (' + plus + ')' : '');
      });
  }

  // Ce qui attend Monsieur le lendemain de `jour` : événements, créneaux de
  // tâches, échéances, et les échéances des jours suivants.
  async _matiereDemain(jour) {
    const demain = Ariane.decalerJour(jour, 1);
    const l = [];
    const evts = await this._lignesEvenementsJour(demain);
    if (evts.length) { l.push('ÉVÉNEMENTS :'); l.push(...evts); }
    const taches = this.tachesPourGantt();
    const ouverte = (t) => t.statut !== 'terminée' && t.statut !== 'abandonnée';
    const creneaux = [];
    for (const t of taches) {
      if (!ouverte(t)) continue;
      for (const c of Ariane.creneauxDeTache([].concat(t.creneaux || []))) {
        if (c.debut.slice(0, 10) === demain) {
          creneaux.push(c.debut.slice(11, 16) + ' à ' + c.fin.slice(11, 16) + ' : ' + t.ref + ' ' + t.intitule
            + ' (statut ' + (t.statut || 'à faire') + (t.avancement ? ', ' + t.avancement + ' %' : '') + ')');
        }
      }
    }
    if (creneaux.length) { l.push('', 'CRÉNEAUX DE TÂCHES :'); for (const c of creneaux.sort()) l.push('- ' + c); }
    const dues = taches.filter((t) => ouverte(t) && t.echeance === demain);
    if (dues.length) {
      l.push('', 'ÉCHÉANCES :');
      for (const t of dues) l.push('- ' + t.ref + ' ' + t.intitule + (t.jalon ? ' (jalon)' : '') + ', statut ' + (t.statut || 'à faire'));
    }
    const fin = Ariane.decalerJour(jour, 7);
    const proches = taches.filter((t) => ouverte(t) && t.echeance > demain && t.echeance <= fin)
      .sort((a, b) => a.echeance.localeCompare(b.echeance)).slice(0, 4);
    if (proches.length) {
      l.push('', 'ÉCHÉANCES DES JOURS SUIVANTS :');
      for (const t of proches) l.push('- ' + t.echeance + ' : ' + t.ref + ' ' + t.intitule + (t.jalon ? ' (jalon)' : ''));
    }
    return l.join('\n').trim();
  }

  // Le mot pour clore la journée : tiré de la note réglée (une entrée par
  // ligne, « mot : définition »), en évitant ceux des trente derniers soirs.
  // Le même mot reste au jour si le bilan est refait. Sans note : null, et
  // l'IA choisit.
  async _motDuSoir(jour) {
    const d = await this.donneesJour(jour);
    if (d.resumeJournee && d.resumeJournee.mot && d.resumeJournee.motDeLaListe) {
      return { mot: d.resumeJournee.mot, definition: d.resumeJournee.definition || '' };
    }
    const entrees = await this._entreesMotsDuSoir();
    if (!entrees.length) return null;
    const recents = new Set((await this._motsRecents(jour)).map((m) => m.toLowerCase()));
    const libres = entrees.filter((e) => !recents.has(e.mot.toLowerCase()));
    const pool = libres.length ? libres : entrees;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Les mots possibles : une note (une entrée par ligne) ou un dossier (une
  // note par mot, celle de la copie d'Apple Notes : propriétés Mot et
  // Définition, ou à défaut le nom de la note).
  async _entreesMotsDuSoir() {
    const chemin = String(this.settings.resumeJourneeMots || '').trim().replace(/\/+$/, '');
    if (!chemin) return [];
    const v = this.app.vault;
    const lu = v.getAbstractFileByPath(chemin);
    if (lu instanceof obsidian.TFolder) {
      const out = [];
      for (const f of v.getMarkdownFiles()) {
        if (!f.path.startsWith(lu.path + '/')) continue;
        const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        out.push({ mot: String(fm.Mot || f.basename).trim(), definition: String(fm['Définition'] || '').trim() });
      }
      return out.filter((e) => e.mot);
    }
    const f = this.app.metadataCache.getFirstLinkpathDest(chemin.replace(/\.md$/, ''), '') || lu;
    if (!(f instanceof obsidian.TFile)) return [];
    return Ariane.motsDuSoir(await v.cachedRead(f));
  }

  // Les mots des trente soirs précédents.
  async _motsRecents(jour) {
    const out = [];
    for (let i = 1; i <= 30; i++) {
      const j = Ariane.decalerJour(jour, -i);
      if (!(await this.joursAvecDonnees()).includes(j)) continue;
      const r = (await this.donneesJour(j)).resumeJournee;
      if (r && r.mot) out.push(r.mot);
    }
    return out;
  }

  // Les entrées d'une liste de mots : une par ligne, puces et cases
  // retirées, « mot : définition » (ou « mot = », « mot, »). Titres, lignes
  // vides et entête ignorés.
  static motsDuSoir(texte) {
    const out = [];
    for (const brute of Ariane.corpsSansEntete(texte).split('\n')) {
      const l = brute.replace(/^\s*(?:[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)/, '').trim();
      if (!l || /^#/.test(l)) continue;
      const m = l.match(/^(.+?)\s*(?:\s:\s|:|=|,)\s*(.+)$/);
      const mot = Ariane.texteBrutLigne(m ? m[1] : l).trim();
      if (!mot || mot.length > 60) continue;
      out.push({ mot, definition: m ? Ariane.texteBrutLigne(m[2]).trim() : '' });
    }
    return out;
  }

  // La consigne du bilan du soir, inspirée de celle que Monsieur s'était
  // écrite pour un raccourci Apple : une base tangible, un miroir honnête,
  // le lendemain, un mot pour clore, une invitation à se déconnecter.
  static promptResumeJournee(jour, matiere, contexte, opts) {
    const o = opts || {};
    const jl = (x) => new Date(x + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const demain = Ariane.decalerJour(jour, 1);
    const mot = o.mot && o.mot.mot
      ? 'Le mot est imposé : « ' + o.mot.mot + ' »' + (o.mot.definition ? ', défini ainsi : « ' + o.mot.definition + ' »' : ' (donne toi-même sa définition exacte)') + '.'
      : 'Choisis toi-même un mot français précis et peu courant, en résonance discrète avec la journée ou avec le repos, et donne sa définition exacte.'
        + ((o.motsRecents || []).length ? ' Pas l\'un de ceux-ci, déjà donnés : ' + o.motsRecents.join(', ') + '.' : '');
    return [
      'Agis comme un majordome intellectuel, à la fois philosophe et rationnel. Tu écris le bilan du soir de Monsieur, pour le ' + jl(jour) + ', à partir du relevé ci-dessous.',
      o.portrait ? 'Portrait : ' + o.portrait : '',
      contexte ? 'Contexte : ' + contexte : '',
      '',
      'DÉROULÉ :',
      '1. La base tangible de la journée : la synthèse de ce qui a été accompli (tâches terminées ou avancées, travail de fond, cours, réunions et rendez-vous déjà passés).',
      '2. Un miroir honnête : où le temps est allé, en rapprochant le prévu du réalisé (créneaux tenus, faits en partie, laissés de côté) et en nommant les moments de distraction s\'il y en a eu. Si la journée a été productive, félicite sans excès. Si elle a été dispersée ou si du travail prévu a été repoussé, sois lucide : reconnais l\'écart sans le juger, et invite à tourner la page. Rassure par la logique plutôt que par des formules : une journée ne définit pas une thèse entière.',
      '3. Demain (' + jl(demain) + ') : ce qui l\'attend, concrètement et sans l\'accabler (le premier rendez-vous, les créneaux prévus, les échéances), en une ou deux phrases qui préparent sans inquiéter. Si rien n\'est prévu, dis-le simplement.',
      '4. Annonce clairement : « Le mot pour clore cette journée est : » suivi du mot, puis énonce précisément sa définition. ' + mot + ' Improvise ensuite une courte réflexion philosophique, culturelle, scientifique ou poétique sur ce mot (la thématique selon la nature du mot : un mot savant appelle une réflexion savante), en la liant subtilement à l\'état d\'esprit de la journée ou au repos nécessaire.',
      '5. Termine par une salutation élégante qui invite à la déconnexion immédiate.',
      '',
      'FORME :',
      '- Un texte continu de 220 à 340 mots, en français, qui vouvoie et appelle « Monsieur ».',
      '- Il sera lu à voix haute : texte brut, pas de liste, pas de titre, pas de markdown, pas de symboles ni d\'abréviations ; les durées et les heures en toutes lettres (« deux heures et quart », « neuf heures et demie »).',
      '- Uniquement ce que dit le relevé : n\'invente aucune activité, aucun nom, aucun chiffre, aucun rendez-vous.',
      '- Pas de tiret cadratin ni demi-cadratin.',
      '',
      'Réponds UNIQUEMENT par du JSON : {"resume": "…", "mot": "le mot retenu"}',
      '',
      'RELEVÉ DE LA JOURNÉE :',
      matiere,
      '',
      'DEMAIN (' + jl(demain) + ') :',
      o.demain || 'Rien de prévu au calendrier ni dans les tâches.',
    ].filter((x) => x !== '').join('\n');
  }

  async resumerJournee(jour, opts) {
    const o = opts || {};
    const j = jour || jourIsoDe(new Date());
    const matiere = await this._matiereJournee(j);
    if (!matiere) { if (!o.silencieux) new obsidian.Notice(tr('Rien de relevé ce jour-là.')); return ''; }
    const avis = o.silencieux ? null : new obsidian.Notice(tr('Résumé de la journée en cours…'), 0);
    let texte = '';
    let motRetenu = '';
    let mot = null;
    try {
      mot = await this._motDuSoir(j);
      const prompt = Ariane.promptResumeJournee(j, matiere, this.settings.activiteIAContexte, {
        portrait: this.settings.resumeJourneePortrait,
        demain: await this._matiereDemain(j),
        mot,
        motsRecents: mot ? [] : await this._motsRecents(j),
      });
      const rep = await this._genererActiviteIA(prompt, 1600, 'synthese');
      texte = String((rep && (rep.resume || rep.texte)) || '').replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+/g, ' ').trim();
      motRetenu = String((mot && mot.mot) || (rep && rep.mot) || '').trim();
    } catch (e) {
      if (avis) avis.hide();
      new obsidian.Notice(tr('Résumé de la journée impossible : ') + ((e && e.message) || e), 10000);
      return '';
    }
    if (avis) avis.hide();
    if (!texte) return '';
    const d = await this.donneesJour(j);
    d.resumeJournee = { texte, le: new Date().toISOString(), modele: this.settings.activiteIAFournisseur || this.settings.refsFournisseur || '' };
    if (motRetenu) {
      d.resumeJournee.mot = motRetenu;
      if (mot) Object.assign(d.resumeJournee, { motDeLaListe: true, definition: mot.definition || '' });
    }
    this.marquerJourSale(j);
    await this.ecrireDonneesJours();
    this._signalerResumeJournee();
    if (!o.silencieux) new obsidian.Notice(tr('Bilan de la journée prêt : il s’affiche dans la chronologie.'));
    return texte;
  }

  // Le résumé d'un jour, s'il existe (pour les vues, et pour qui voudra le
  // faire lire à voix haute).
  async resumeDeLaJournee(jour) {
    const d = await this.donneesJour(jour || jourIsoDe(new Date()));
    return (d.resumeJournee && d.resumeJournee.texte) || '';
  }

  _signalerResumeJournee() {
    if (typeof TYPE_VUE_CHRONOLOGIE === 'undefined') return;
    for (const f of this.app.workspace.getLeavesOfType(TYPE_VUE_CHRONOLOGIE)) {
      try { if (f.view && f.view.rafraichir) f.view.rafraichir(); } catch (e) { /* vue fermée */ }
    }
  }

  // Résumé automatique, à l'heure réglée (vide : jamais), une fois par jour.
  demarrerResumeJourneeAuto() {
    this.registerInterval(window.setInterval(() => {
      const h = String(this.settings.resumeJourneeHeure || '').trim();
      if (!/^\d{1,2}:\d{2}$/.test(h)) return;
      const now = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      if (p2(now.getHours()) + ':' + p2(now.getMinutes()) < h.padStart(5, '0')) return;
      const jour = jourIsoDe(now);
      if (this._resumeAutoFait === jour) return;
      this._resumeAutoFait = jour;
      this.resumeDeLaJournee(jour).then((t) => { if (!t) this.resumerJournee(jour, { silencieux: true }); });
    }, 60000));
  }

  //#endregion Ariane · résumé de la journée

  //#region Ariane · mots du soir
  // ── mots du soir : copie d'Apple Notes ──────────────────────────────────
  //  Le dossier d'Apple Notes où Monsieur range ses mots (une note par mot :
  //  « Mot (classe) : définition », exemple, étymologie) est recopié dans le
  //  coffre, une note par mot, À SENS UNIQUE : Apple Notes fait foi, n'est
  //  jamais modifié, et la copie est réécrite quand la note d'origine change.
  //  Les copies portent « apple-notes-id » : seules elles sont réécrites ou
  //  retirées (corbeille) quand leur note d'origine disparaît.

  static genererJXAMots(dossier) {
    return [
      'const N = Application("Notes");',
      'const f = N.folders.whose({ name: ' + JSON.stringify(dossier) + ' });',
      'if (!f.length) { "__ABSENT__"; } else {',
      '  const ns = f[0].notes;',
      '  const ids = ns.id(), noms = ns.name(), textes = ns.plaintext(), dates = ns.modificationDate();',
      '  JSON.stringify(ids.map((id, i) => ({ id, nom: noms[i], texte: textes[i], modifie: dates[i] ? dates[i].toISOString() : "" })));',
      '}',
    ].join('\n');
  }

  // Une note d'Apple Notes mise en forme pour le coffre : { nom, mot,
  // classe, definition, contenu }.
  static noteMotDepuisApple(n) {
    const titre = String(n.nom || '').trim();
    const lignes = String(n.texte || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (lignes.length && lignes[0] === titre) lignes.shift();
    let classe = '';
    let definition = '';
    const esc = titre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const corps = lignes.map((l, i) => {
      // « Mot (domaine) (classe) : définition » : la dernière parenthèse est
      // la classe grammaticale.
      const m = i === 0 ? l.match(new RegExp('^' + esc + '\\s*((?:\\([^)]*\\)\\s*)*):\\s*(.+)$', 'i')) : null;
      if (m) {
        const parens = [...m[1].matchAll(/\(([^)]*)\)/g)].map((x) => x[1].trim());
        classe = parens.length ? parens[parens.length - 1] : '';
        definition = m[2].trim();
        return '**' + titre + '**' + (m[1].trim() ? ' ' + m[1].trim() : '') + ' : ' + definition;
      }
      return l.replace(/^(Exemples?|Étymologie|Synonymes?|Antonymes?|Remarques?|Citation)\s*:/i, '**$1** :');
    });
    if (!definition && lignes.length) definition = lignes[0];
    const nom = titre.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Sans titre';
    const fm = ['---', 'Type: mot', 'Mot: ' + JSON.stringify(titre), 'Classe: ' + JSON.stringify(classe),
      'Définition: ' + JSON.stringify(definition), 'apple-notes-id: ' + JSON.stringify(String(n.id || '')),
      'apple-notes-modifie: ' + JSON.stringify(String(n.modifie || '')), 'locked: true', '---'];
    return { nom, mot: titre, classe, definition,
      contenu: fm.concat(['%% Copie verrouillée d\'Apple Notes (dossier des mots), réécrite à chaque changement : modifiez l\'original. %%', '',
        '# ' + titre, ''], corps.flatMap((p) => [p, '']), []).join('\n') };
  }

  async synchroniserMots(silencieux) {
    if (!obsidian.Platform.isMacOS) return;
    const s = this.settings;
    const source = String(s.motsAppleNotesDossier || '').trim();
    const cible = String(s.motsDossier || '').trim().replace(/^\/+|\/+$/g, '');
    if (!source || !cible) return;
    if (this._motsEnCours) return;
    this._motsEnCours = true;
    try {
      const sortie = await this._osascriptJXA(Ariane.genererJXAMots(source), 120000);
      if (sortie == null) {
        if (!silencieux) new obsidian.Notice(tr("Mots du soir : Apple Notes n'a pas répondu. Autorisez Obsidian à piloter Notes (Réglages système, Confidentialité et sécurité, Automatisation)."), 10000);
        return;
      }
      if (sortie.trim() === '__ABSENT__') {
        if (!silencieux) new obsidian.Notice(tr('Mots du soir : dossier introuvable dans Apple Notes : ') + source, 8000);
        return;
      }
      const notes = JSON.parse(sortie);
      const v = this.app.vault;
      if (!v.getAbstractFileByPath(cible)) { try { await v.createFolder(cible); } catch (e) { /* déjà là */ } }
      // Les copies existantes, par identifiant d'origine.
      const copies = new Map();
      for (const f of v.getMarkdownFiles()) {
        if (!f.path.startsWith(cible + '/')) continue;
        const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        if (fm['apple-notes-id']) {
          copies.set(String(fm['apple-notes-id']), { f, modifie: String(fm['apple-notes-modifie'] || ''), locked: fm.locked === true });
        }
      }
      let crees = 0;
      let majs = 0;
      const pris = new Set();
      for (const n of notes) {
        const m = Ariane.noteMotDepuisApple(n);
        const ex = copies.get(String(n.id));
        copies.delete(String(n.id));
        if (ex) {
          pris.add(ex.f.path);
          // Inchangée et déjà verrouillée : rien à faire.
          if (ex.modifie === String(n.modifie || '') && ex.locked) continue;
          this.marquerEcriture(ex.f.path);
          await v.modify(ex.f, m.contenu);
          majs++;
          continue;
        }
        let chemin = cible + '/' + m.nom + '.md';
        for (let k = 2; v.getAbstractFileByPath(chemin) || pris.has(chemin); k++) chemin = cible + '/' + m.nom + ' (' + k + ').md';
        pris.add(chemin);
        await this.ecrire(chemin, m.contenu);
        crees++;
      }
      // Les mots retirés d'Apple Notes quittent le coffre (corbeille).
      let retires = 0;
      for (const { f } of copies.values()) {
        try { await v.trash(f, true); retires++; } catch (e) { /* déjà parti */ }
      }
      s.motsSynchroLe = Date.now();
      if (!String(s.resumeJourneeMots || '').trim()) s.resumeJourneeMots = cible;
      await this.saveSettings();
      if (!silencieux || crees || retires) {
        new obsidian.Notice(tr('Mots du soir : ') + notes.length + tr(' mots') + (crees ? ', ' + crees + tr(' ajoutés') : '')
          + (majs ? ', ' + majs + tr(' mis à jour') : '') + (retires ? ', ' + retires + tr(' retirés') : '') + '.');
      }
    } catch (e) {
      console.error('[Ariane] mots du soir', e);
      if (!silencieux) new obsidian.Notice(tr('Mots du soir : copie impossible : ') + ((e && e.message) || e), 10000);
    } finally {
      this._motsEnCours = false;
    }
  }

  // Une copie au démarrage, puis toutes les six heures.
  demarrerMotsDuSoir() {
    if (!String(this.settings.motsAppleNotesDossier || '').trim()) return;
    window.setTimeout(() => this.synchroniserMots(true), 20000);
    this.registerInterval(window.setInterval(() => this.synchroniserMots(true), 6 * 3600000));
  }

  //#endregion Ariane · mots du soir
};
