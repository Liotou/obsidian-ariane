
// ── avecTaches ────────────────────────────────────────────────────────────
// Domaine : tâches (frise, articulation, calendrier).
// Lecture et écriture des notes de tâche, index ref→fichier, temps de travail,
// synchronisation Apple (Rappels et Agenda).
const avecTaches = (Base) => class extends Base {
  //#region Ariane · tâches
  // ── tâches ───────────────────────────────────────────────────────────────

  // Index « référence → fichier » des notes de tâche.
  //
  // Sans lui, chaque accès aux tâches balayait TOUT le coffre : sur un coffre
  // de quatre mille notes pour quarante tâches, c'est cent fois trop de travail,
  // et tachesPourGantt() est appelée depuis une trentaine d'endroits, dont le
  // redessin de chaque vue. L'appartenance d'une note aux tâches se lit sur son
  // seul CHEMIN (voir Ariane.refDepuisChemin) : l'index ne dépend donc pas du
  // contenu et ne se périme qu'à la création, la suppression ou le renommage
  // d'un fichier — ni à chaque frappe, ni à chaque écriture d'entête.
  _indexTaches() {
    if (this._idxTaches) return this._idxTaches;
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const ref = this.refDeChemin(f.path);
      if (ref) m.set(ref, f);
    }
    this._idxTaches = m;
    return m;
  }

  // À appeler dès qu'un chemin bouge, ou que le dossier des tâches change.
  _invaliderIndexTaches() { this._idxTaches = null; }

  // Le fichier d'une référence de tâche, en temps constant. Remplace les
  // « getMarkdownFiles().find(x => x.basename === ref) » qui parcouraient tout
  // le coffre — et vise la vraie note de tâche plutôt que le premier homonyme
  // rencontré ailleurs dans le coffre.
  fichierDeRef(ref) {
    const r = String(ref == null ? '' : ref).trim();
    if (!r) return null;
    const f = this._indexTaches().get(r);
    return (f && !f.deleted) ? f : null;
  }

  // Les tâches du coffre, dans la forme qu'attend disposerGantt. Les objets
  // sont reconstruits à chaque appel : plusieurs vues les annotent au vol
  // (aperçu d'un glissé), un objet partagé ferait fuiter ces retouches.
  tachesPourGantt() {
    const out = [];
    for (const f of this._indexTaches().values()) {
      const ref = this.refDeChemin(f.path);
      if (!ref) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const alias = [].concat(fm.aliases || []).map(String).filter(Boolean);
      const nx = Number(fm['canvas-x']);
      const ny = Number(fm['canvas-y']);
      const fmFam = Object.assign({}, fm, {
        famille: this._lireT(fm, 'famille'),
        source: this._lireT(fm, 'source'),
        livrable: this._lireT(fm, 'livrable'),
        fichier: this._lireT(fm, 'fichier'),
      });
      out.push({
        ref,
        intitule: alias[0] || ref,
        parent: this._lireT(fm, 'parent') || '',
        bloquePar: [].concat(this._lireT(fm, 'bloque-par') || []).map(String),
        debut: this._lireT(fm, 'debut') || '',
        echeance: this._lireT(fm, 'echeance') || '',
        heure: String(this._lireT(fm, 'heure') || '').trim(),
        creneaux: [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean),
        statut: this._lireT(fm, 'statut') || 'à faire',
        priorite: this._lireT(fm, 'priorite') || '',
        avancement: Number(this._lireT(fm, 'avancement')) || 0,
        jalon: this._lireT(fm, 'jalon') === true,
        famille: Ariane.familleTache(fmFam, this.settings.famillesTaches, this.settings.familleTacheDefaut),
        x: Number.isFinite(nx) ? nx : null,
        y: Number.isFinite(ny) ? ny : null,
        fichier: f,
      });
    }
    return out;
  }

  // La définition d'une famille par son id, ou un repli gris/rond pour une
  // famille inconnue ou supprimée. Jamais null : les dessinateurs s'appuient
  // dessus sans garde.
  familleDe(id) {
    const liste = Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [];
    return liste.find((f) => f && f.id === id)
      || { id: id || '', nom: id || tr('(sans famille)'), couleur: '#888888', icone: 'circle', proprietes: [] };
  }

  // Nom de liste Apple Rappels pour une tâche : celle de sa famille, sinon la
  // liste par défaut des réglages.
  listeRappelsDe(familleId) {
    const f = this.familleDe(familleId);
    return String((f && f.listeRappels) || this.settings.listeRappelsDefaut || '').trim();
  }

  // Toutes les listes Apple Rappels surveillées (familles + défaut).
  _listesSurveillees() {
    const s = new Set();
    for (const f of (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])) {
      if (f && f.id) { const l = this.listeRappelsDe(f.id); if (l) s.add(l); }
    }
    const d = String(this.settings.listeRappelsDefaut || '').trim();
    if (d) s.add(d);
    return [...s];
  }

  // Famille dont la liste Apple Rappels correspond à `nom` (sinon défaut).
  _familleParListe(nom) {
    const n = String(nom || '').trim().toLowerCase();
    for (const f of (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])) {
      if (f && f.id && String(this.listeRappelsDe(f.id)).trim().toLowerCase() === n) return f.id;
    }
    return this.settings.familleTacheDefaut || 'action';
  }

  // Nom du calendrier Apple pour une tâche : celui de sa famille, sinon le
  // calendrier par défaut des réglages. Miroir de listeRappelsDe.
  agendaCalendrierDe(familleId) {
    const f = this.familleDe(familleId);
    return String((f && f.agendaCalendrier) || this.settings.agendaCalendrierDefaut || '').trim();
  }

  // Calendriers Apple liés à la synchro (cibles de push, suivis à la relève) :
  // union des calendriers de familles + le calendrier par défaut.
  _agendasSurveilles() {
    const s = new Set();
    for (const f of (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])) {
      if (f && f.id) { const c = this.agendaCalendrierDe(f.id); if (c) s.add(c); }
    }
    const d = String(this.settings.agendaCalendrierDefaut || '').trim();
    if (d) s.add(d);
    return [...s];
  }

  // Calendriers affichés en fond de la vue calendrier : ceux de la synchro, plus
  // ceux cochés dans « Calendriers à afficher » (lecture seule, Apple → Obsidian,
  // jamais poussés ni relevés).
  _agendasCoches() {
    const brut = this.settings.agendaCalendriersAffiches;
    return Array.isArray(brut)
      ? brut.map((n) => String(n).trim()).filter(Boolean)
      : String(brut || '').split(',').map((n) => n.trim()).filter(Boolean);
  }

  // Calendriers affichés en fond = UNIQUEMENT ceux cochés dans « Calendriers à
  // afficher ». Les calendriers de famille sont des cibles d'écriture pour les
  // créneaux : on n'en relit pas les événements (le créneau les représente déjà
  // — les relire créait des doublons).
  _agendasAffiches() {
    return this._agendasCoches().filter((n) => !this._agendasSurveilles()
      .some((c) => c.toLowerCase() === n.toLowerCase()));
  }

  _osascriptJXA(script, ms) {
    return new Promise((res) => {
      require('child_process').execFile('osascript', ['-l', 'JavaScript', '-e', script],
        { timeout: ms || 60000, maxBuffer: 1 << 20 },
        (err, out, errOut) => {
          if (err) {
            console.warn('[Ariane] osascript a échoué :', err.code, err.killed ? '(timeout)' : '',
              String(errOut || '').trim());
          }
          res(err ? null : String(out == null ? '' : out));
        });
    });
  }

  // Charge (et met en cache) les noms de listes Apple Rappels connus de l'API.
  async chargerListesRappels() {
    if (!obsidian.Platform.isMacOS) { this._listesRappels = []; return []; }
    const s = await this._osascriptJXA(Ariane.genererJXAListes(), 30000);
    this._listesRappels = (s == null ? [] : s.split('\n').map((x) => x.trim()).filter(Boolean));
    return this._listesRappels;
  }

  // Noms des calendriers Apple (entité événements) connus de l'API, mis en cache
  // pour alimenter la liste à cocher des réglages. Garde de 30 s. Mémorise aussi
  // le statut d'accès Calendriers (this._agendaStatut : 3 = OK, 2 = refusé, …).
  async chargerAgendas() {
    if (!obsidian.Platform.isMacOS) { this._agendas = []; this._agendaStatut = -1; return []; }
    if (this._agendasChargeLe && Date.now() - this._agendasChargeLe < 30000) return this._agendas || [];
    const s = await this._osascriptJXA(Ariane.genererJXAAgendas(), 30000);
    let d = null;
    try { d = s ? JSON.parse(s) : null; } catch (e) { d = null; }
    this._agendaStatut = d ? Number(d.statut) : (s == null ? -2 : -1);
    this._agendas = (d && Array.isArray(d.calendriers)) ? d.calendriers.filter(Boolean) : [];
    this._agendasChargeLe = Date.now();
    if (this._agendaStatut === 2 || this._agendaStatut === 1) this._avertirAccesAgenda();
    // Couleurs des calendriers via AppleScript (impossible en JXA — SIGBUS).
    // Peut demander l'accès « Automatisation » à Calendar une première fois ;
    // en cas d'échec, les événements de fond gardent la couleur de repli.
    if (this._agendaStatut === 3) {
      try {
        const cs = await this._osascriptAS(Ariane.genererASCouleursAgendas(), 20000);
        this._agendaCouleurs = Ariane.parseCouleursAgendas(cs);
      } catch (e) { /* couleurs indisponibles */ }
    }
    return this._agendas;
  }

  _osascriptAS(script, ms) {
    return new Promise((res) => {
      require('child_process').execFile('osascript', ['-e', script],
        { timeout: ms || 30000, maxBuffer: 1 << 20 },
        (err, out) => res(err ? null : String(out == null ? '' : out)));
    });
  }

  // Statut d'accès Calendriers : chaîne lisible pour un message.
  _libelleStatutAgenda(st) {
    return ({ 3: 'accès complet', 4: 'écriture seule (lecture refusée)',
      2: 'refusé', 1: 'restreint', 0: 'non demandé', '-1': 'erreur',
      '-2': 'osascript indisponible' })[st] || ('statut ' + st);
  }

  _avertirAccesAgenda() {
    const st = this._agendaStatut;
    if (this._accesAgendaAverti === st) return;
    this._accesAgendaAverti = st;
    new obsidian.Notice(tr('Apple Agenda : ') + this._libelleStatutAgenda(st) + '. '
      + tr("Autorisez « Calendriers » pour Obsidian dans Réglages système → Confidentialité et sécurité."), 8000);
  }

  // Événements réels des calendriers surveillés, pour l'affichage en fond de la
  // vue calendrier. Cache mémoire 60 s, clé sur la fenêtre demandée. Exclut les
  // événements déjà représentés par un créneau (leur id figure dans un
  // agenda-id de tâche) pour ne pas les afficher deux fois.
  async evenementsFond(debutISO, finISO) {
    if (!obsidian.Platform.isMacOS || !this.settings.agendaActif) return [];
    const cle = String(debutISO) + '|' + String(finISO);
    const c = this._fondCache;
    if (c && c.cle === cle && Date.now() - c.le < 60000) return c.data;
    if (!this._agendaCouleurs) { try { await this.chargerAgendas(); } catch (e) { /* couleurs plus tard */ } }
    const cals = this._agendasAffiches();
    if (!cals.length) { this._fondCache = { cle, le: Date.now(), data: [] }; return []; }
    const connus = new Set();
    const refsConnues = new Set();
    for (const t of this.tachesPourGantt()) {
      refsConnues.add(t.ref);
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      for (const id of [].concat(this._lireT(fm, 'agenda-id') || [])) if (id) connus.add(String(id));
    }
    // Un événement est « à nous » si son id est un agenda-id connu OU si son
    // titre porte entre crochets la référence d'une tâche existante ([T010] …).
    // Le repli par le titre couvre les décalages d'identifiant EventKit et les
    // événements poussés avant cette correction.
    const aNous = (e) => {
      if (connus.has(e.id)) return true;
      const m = String(e.titre || '').match(/\[([^\]]+)\]/);
      return !!(m && refsConnues.has(m[1].trim()));
    };
    const s = await this._osascriptJXA(
      Ariane.genererJXAEvenementsFond(cals, debutISO, finISO), 30000);
    if (s && s.startsWith('__ACCES__')) {
      this._agendaStatut = Number(s.split('\t')[1]);
      this._avertirAccesAgenda();
      this._fondCache = { cle, le: Date.now(), data: [] };
      return [];
    }
    const couleurs = this._agendaCouleurs || {};
    const data = (s == null ? [] : s.split('\n').filter(Boolean).map((l) => {
      const p = l.split('\t');
      const cal = p[5] || '';
      return { id: p[0], titre: p[1] || '', debut: p[2] || '', fin: p[3] || '',
               allDay: p[4] === '1', couleur: couleurs[cal] || '', calendrier: cal };
    })).filter((e) => e.id && e.debut && !aNous(e));
    if (s == null) return [];              // échec dur : ne pas cacher, ne pas marquer l'accès OK
    this._agendaStatut = 3;
    this._fondCache = { cle, le: Date.now(), data };
    return data;
  }

  // Invalide le cache de l'agenda de fond et redemande à chaque vue calendrier
  // ouverte de le recharger (après un push, ou un changement de réglage).
  _rafraichirFond() {
    this._fondCache = null;
    for (const m of (this._moteursCalendrier || [])) {
      try { m._fondCle = null; if (m._chargerFond) m._chargerFond(); } catch (e) { /* vue fermée */ }
    }
  }

  // Instantané « dernier état synchronisé » d'une tâche, pour arbitrer les
  // conflits à la relève : échéance|heure|statut. (Côté Agenda : Ariane.instantAgenda.)
  _instantRappel(t) { return [t.echeance || '', t.heure || '', t.statut || ''].join('|'); }

  // Tâches concernées par un rappel : une échéance, ou déjà un rappel-id.
  _tachesRappel() {
    const out = [];
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const rid = String(this._lireT(fm, 'rappel-id') || '').trim();
      const snap = String(fm['rappel-sync'] || '');
      if (!t.echeance && !rid) continue;
      if ((t.statut === 'terminée' || t.statut === 'abandonnée') && !rid) continue;
      out.push(Object.assign({}, t, { _rid: rid, _snap: snap, _fm: fm }));
    }
    return out;
  }

  // Pousse toutes les tâches éligibles vers Apple Rappels (création / mise à
  // jour), puis mémorise le rappel-id et l'instantané dans chaque note.
  //
  // Verrou : deux osascript de push concurrents (modifs très rapprochées, flush
  // au blur pendant qu'un push tourne…) créaient des DOUBLONS — le rappel-id
  // pas encore écrit relu vide par le second push, qui recrée. Même piège et
  // même parti qu'Apple Agenda : on sérialise ; si un push est demandé pendant
  // qu'un autre tourne, on en relance UN seul après.
  async pousserRappels(silencieux) {
    if (this._rappelsPushEnCours) { this._rappelsPushRedemande = true; return 0; }
    this._rappelsPushEnCours = true;
    try {
      return await this._pousserRappelsImpl(silencieux);
    } finally {
      this._rappelsPushEnCours = false;
      if (this._rappelsPushRedemande) {
        this._rappelsPushRedemande = false;
        setTimeout(() => this.pousserRappels(true), 400);
      }
    }
  }

  async _pousserRappelsImpl(silencieux) {
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Rappels : disponible sur macOS uniquement.'));
      return 0;
    }
    if (this.settings.rappelsActif === false) return 0;
    const vault = this.app.vault.getName();
    const cibles = this._tachesRappel();
    if (!cibles.length) { if (!silencieux) new obsidian.Notice(tr('Aucune tâche à synchroniser.')); return 0; }
    const charge = [];
    for (const t of cibles) {
      let note = '';
      try { note = await this.lireNoteTache(t.ref); } catch (e) { /* rien */ }
      const lien = 'obsidian://open?vault=' + encodeURIComponent(vault)
        + '&file=' + encodeURIComponent(t.fichier.path.replace(/\.md$/, ''));
      const titre = Ariane.formatModele(
        this.settings.rappelsFormatTitre || '[{ref}] - {intitule}',
        { ref: t.ref, intitule: t.intitule, famille: (this.familleDe(t.famille) || {}).nom || '' });
      charge.push({
        ref: t.ref, id: t._rid, titre,
        // Le dédoublonnage JXA ne balaie que si la référence se lit dans le
        // titre du rappel : sans {ref} dans le gabarit, impossible d'identifier
        // un homonyme sans risque d'en supprimer un legitime.
        dedup: titre.indexOf(t.ref) >= 0,
        notes: (note ? note.slice(0, 500).trim() + '\n\n' : '') + lien,
        liste: this.listeRappelsDe(t.famille),
        echeance: t.echeance || '', heure: t.heure || '',
        priorite: t.priorite || '', termine: t.statut === 'terminée',
      });
    }
    const avis = silencieux ? null : new obsidian.Notice(tr('Synchronisation Apple Rappels…'), 0);
    const sortie = await this._osascriptJXA(Ariane.genererJXARappels(charge));
    if (avis) avis.hide();
    if (sortie == null) {
      if (!silencieux) new obsidian.Notice(tr('Apple Rappels a refusé (autorisation d\'automatisation dans Réglages système ?).'));
      return 0;
    }
    const parRef = new Map(cibles.map((t) => [t.ref, t]));
    let n = 0;
    for (const l of sortie.split('\n')) {
      const [ref, id] = l.split('\t');
      const t = ref && parRef.get(ref);
      if (!t || !id) continue;
      const champs = {};
      if (id && id !== t._rid) champs['rappel-id'] = id;
      const f = t.fichier;
      if (Object.keys(champs).length) {
        // marquerEcriture fait taire l'écoute metadataCache : sans lui, chaque
        // push qui re-mémorise un rappel-id relançait un push (echo).
        if (f) this.marquerEcriture(f.path);
        await this.majTache(ref, champs);
      }
      // L'instantané ne s'écrit que s'il change : réécrire à l'identique fait
      // un écho metadataCache au-delà de la fenêtre d'anti-écho (parti Agenda).
      if (f && this._instantRappel(t) !== t._snap) {
        this.marquerEcriture(f.path);
        await this.app.fileManager.processFrontMatter(f, (x) => {
          x['rappel-sync'] = this._instantRappel(t);
        });
      }
      n += 1;
    }
    if (!silencieux) new obsidian.Notice(n + tr(' rappel(s) synchronisé(s).'));
    return n;
  }

  // Relève : un rappel coché → tâche terminée ; échéance changée dans Rappels →
  // répercutée (sauf si la note a bougé, elle fait foi) ; un rappel ajouté à la
  // main dans une liste surveillée, sans référence connue → nouvelle tâche.
  async releverRappels(silencieux) {
    if (!obsidian.Platform.isMacOS || this.settings.rappelsActif === false) return 0;
    const listes = this._listesSurveillees();
    const avecId = [];
    const idsConnus = new Set();
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const rid = String(this._lireT(fm, 'rappel-id') || '').trim();
      if (rid) {
        idsConnus.add(rid);
        avecId.push(Object.assign({}, t, { _rid: rid, _snap: String(fm['rappel-sync'] || '') }));
      }
    }
    if (!avecId.length && !listes.length) return 0;
    const avis = silencieux ? null : new obsidian.Notice(tr('Relève Apple Rappels…'), 0);
    const sortie = await this._osascriptJXA(
      Ariane.genererJXAReleve(avecId.map((t) => ({ ref: t.ref, id: t._rid })), listes));
    if (avis) avis.hide();
    if (sortie == null) return 0;
    const parRef = new Map(avecId.map((t) => [t.ref, t]));
    const refsTaches = new Set(this.tachesPourGantt().map((x) => x.ref));
    let n = 0;
    for (const l of sortie.split('\n')) {
      const parts = l.split('\t');
      if (parts[0] === 'NOUVEAU') {
        const id = parts[1];
        const nom = String(parts[2] || '').trim();
        const coche = parts[3] === '1';
        const dueIso = parts[4] || '';
        const listeNom = parts[5] || '';
        if (!id || idsConnus.has(id)) continue;
        // Le titre du rappel porte-t-il la référence d'une tâche existante ? On
        // relie au lieu de recréer. Sans supposer de forme : un jeton entre
        // crochets qui est une réf connue, sinon une réf connue en sous-chaîne.
        const refLiee = Ariane.refDansTexte(nom, refsTaches);
        if (refLiee) {
          await this.majTache(refLiee, { 'rappel-id': id });
          idsConnus.add(id); n += 1; continue;
        }
        const d = dueIso.slice(0, 10);
        const h = dueIso.length > 10 ? dueIso.slice(11, 16) : '';
        const chemin = await this.creerTache({
          intitule: nom || tr('Sans titre'),
          echeance: d, heure: h === '00:00' ? '' : h,
          statut: coche ? 'terminée' : 'à faire',
          liste: listeNom,
          famille: this._familleParListe(listeNom),
        });
        const ref = this.refDeChemin(chemin);
        if (ref) {
          await this.majTache(ref, { 'rappel-id': id });
          const f2 = this.fichierDeRef(ref);
          if (f2) {
            this.marquerEcriture(f2.path);
            await this.app.fileManager.processFrontMatter(f2, (x) => {
              x['rappel-sync'] = [d, h === '00:00' ? '' : h, coche ? 'terminée' : 'à faire'].join('|');
            });
          }
          idsConnus.add(id); n += 1;
        }
        continue;
      }
      const t = parts[0] && parRef.get(parts[0]);
      if (!t) continue;
      if (parts[1] === 'MANQUANT') continue;
      const coche = parts[1] === '1';
      const dueIso = parts[2] || '';
      const noteInstant = this._instantRappel(t);
      const noteBougee = t._snap && noteInstant !== t._snap;
      const champs = {};
      // Complétion : le rappel coché termine la tâche (si la note n'a pas changé de statut).
      if (coche && t.statut !== 'terminée' && !noteBougee) {
        champs.statut = 'terminée';
        champs.terminee = true;
      }
      // Échéance : reportée seulement si la note n'a pas bougé.
      if (dueIso && !noteBougee) {
        const d = dueIso.slice(0, 10);
        const h = dueIso.length > 10 ? dueIso.slice(11, 16) : '';
        const hNote = h === '00:00' ? '' : h;
        if (d !== t.echeance || (hNote || '') !== (t.heure || '')) {
          champs.echeance = d;
          champs.heure = hNote;
        }
      }
      if (Object.keys(champs).length) {
        await this.majTache(t.ref, champs);
        if (t.fichier) {
          const maj2 = Object.assign({ echeance: t.echeance, heure: t.heure, statut: t.statut }, champs);
          this.marquerEcriture(t.fichier.path);
          await this.app.fileManager.processFrontMatter(t.fichier, (x) => {
            x['rappel-sync'] = [maj2.echeance || '', maj2.heure || '', maj2.statut || ''].join('|');
          });
        }
        n += 1;
      }
    }
    if (!silencieux && n) new obsidian.Notice(n + tr(' tâche(s) mise(s) à jour depuis Rappels.'));
    return n;
  }

  /* ---- Apple Rappels : orchestration -------------------------------- */

  // La synchro automatique Rappels doit-elle tourner ? (macOS, activée, auto.)
  _rappelsAutoActif() {
    return obsidian.Platform.isMacOS && !!this.settings.rappelsActif && !!this.settings.rappelsAuto;
  }

  // Programme un push automatique (note de tâche modifiée, nouvelle tâche…).
  // Antirebondi ; le verrou de pousserRappels gère les recouvrements.
  _relancerPushRappels(delai) {
    if (!this._rappelsAutoActif()) return;
    this._rappelsPushEnAttente = true;
    this.antirebond('rappels:push', async () => {
      try { await this.pousserRappels(true); } finally { this._rappelsPushEnAttente = false; }
    }, delai || 2000);
  }

  // Programme une relève automatique (retour de focus…), antirebondie et
  // espacée d'au moins 15 s des précédentes ; sautée si un push est en attente.
  _relancerReleveRappels(delai) {
    if (!this._rappelsAutoActif() || this._rappelsPushEnAttente) return;
    if (this._rappelsDerniereReleve && Date.now() - this._rappelsDerniereReleve < 15000) return;
    this.antirebond('rappels:releve', async () => {
      this._rappelsDerniereReleve = Date.now();
      await this.releverRappels(true);
    }, delai || 700);
  }

  /* ---- Apple Agenda : orchestration -------------------------------- */

  // La synchro automatique Agenda doit-elle tourner ? (macOS, activée, auto, et
  // l'accès Calendriers n'est pas refusé/restreint.)
  _agendaAutoActif() {
    return obsidian.Platform.isMacOS && !!this.settings.agendaActif
      && this.settings.agendaAuto !== false
      && this._agendaStatut !== 2 && this._agendaStatut !== 1;
  }

  // Programme un push automatique (créneau modifié depuis la vue calendrier,
  // note de tâche sauvegardée…). Antirebondi ; le verrou de pousserAgenda gère
  // les recouvrements.
  _relancerPushAgenda(delai) {
    if (!this._agendaAutoActif()) return;
    this._agendaPushEnAttente = true;
    this.antirebond('agenda:push', async () => {
      try { await this.pousserAgenda(true); } finally { this._agendaPushEnAttente = false; }
    }, delai || 2000);
  }

  // Programme une relève automatique (retour de focus, ouverture de la vue…),
  // antirebondie et espacée d'au moins 15 s des précédentes.
  _relancerReleveAgenda(delai) {
    if (!this._agendaAutoActif() || this._agendaPushEnAttente) return;
    if (this._agendaDerniereReleve && Date.now() - this._agendaDerniereReleve < 15000) return;
    this.antirebond('agenda:releve', async () => {
      this._agendaDerniereReleve = Date.now();
      await this.releverAgenda(true);
    }, delai || 800);
  }

  // Pousse les créneaux des tâches éligibles vers Apple Calendar (un EKEvent par
  // créneau), supprime les événements des créneaux disparus, mémorise agenda-id
  // (liste alignée sur les créneaux) et agenda-sync dans la note.
  //
  // Verrou : deux osascript de push concurrents (modif très rapprochée, flush au
  // blur pendant un push en cours…) créaient des doublons. On sérialise ; si un
  // push est demandé pendant qu'un autre tourne, on en relance UN seul après.
  async pousserAgenda(silencieux) {
    if (this._pushEnCours) { this._pushRedemande = true; return 0; }
    this._pushEnCours = true;
    try {
      return await this._pousserAgendaImpl(silencieux);
    } finally {
      this._pushEnCours = false;
      if (this._pushRedemande) {
        this._pushRedemande = false;
        setTimeout(() => this.pousserAgenda(true), 400);
      }
    }
  }

  async _pousserAgendaImpl(silencieux) {
    if (!silencieux) console.info('[Ariane] Apple Agenda — push manuel demandé.');
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return 0;
    }
    if (!this.settings.agendaActif) {
      if (!silencieux) new obsidian.Notice(tr("Apple Agenda est désactivé (Réglages → Tâches → Apple Agenda → Activer)."), 8000);
      return 0;
    }
    const vault = this.app.vault.getName();
    const cibles = [];
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const ids = [].concat(this._lireT(fm, 'agenda-id') || []).map(String);
      const crs = Ariane.creneauxDeTache(t);
      const cal = this.agendaCalendrierDe(t.famille);
      if (!(crs.length && cal) && !ids.some((x) => x)) continue;
      cibles.push(Object.assign({}, t, { _fm: fm, _ids: ids, _crs: crs, _cal: cal }));
    }
    if (!cibles.length) {
      if (!silencieux) {
        new obsidian.Notice(tr("Aucune tâche à synchroniser : il faut au moins un créneau ET un calendrier Apple sur la famille (ou le calendrier par défaut)."), 9000);
      }
      return 0;
    }
    const charge = [];
    for (const t of cibles) {
      let note = '';
      try { note = await this.lireNoteTache(t.ref); } catch (e) { /* rien */ }
      const lien = 'obsidian://open?vault=' + encodeURIComponent(vault)
        + '&file=' + encodeURIComponent(t.fichier.path.replace(/\.md$/, ''));
      // Le lien vers la note va dans le champ « URL » de l'événement (pas dans
      // les notes) ; les notes ne portent que l'extrait de la note de travail.
      const notes = note ? note.slice(0, 500).trim() : '';
      const titreBase = Ariane.formatModele(
        this.settings.agendaFormatTitre || '[{ref}] - {intitule}',
        { ref: t.ref, intitule: t.intitule, famille: (this.familleDe(t.famille) || {}).nom || '' });
      const prefixe = t.statut === 'terminée' ? '✅ ' : '';
      const plusieurs = t._crs.length > 1;
      const relie = t._crs.length && t._cal;
      if (relie) {
        t._crs.forEach((c, i) => {
          charge.push({
            ref: t.ref, idx: i, id: t._ids[i] || '',
            titre: prefixe + titreBase + (plusieurs ? ' (session ' + (i + 1) + ')' : ''),
            notes, lien, calendrier: t._cal, debut: c.debut, fin: c.fin,
            // Fenêtre élargie pour le rattrapage anti-doublon : si un créneau a
            // été déplacé de quelques jours entre deux push, on retrouve quand
            // même l'événement existant au lieu d'en créer un nouveau.
            scanDebut: Ariane.decalerJour(c.debut.slice(0, 10), -3),
            scanFin: Ariane.decalerJour(c.fin.slice(0, 10), 3),
          });
        });
      }
      // agenda-id sans créneau correspondant (créneau retiré, ou tâche devenue
      // inéligible) → suppression de l'EKEvent.
      const garde = relie ? t._crs.length : 0;
      t._ids.forEach((id, i) => {
        if (id && i >= garde) charge.push({ ref: t.ref, idx: i, id, supprimer: true });
      });
    }
    if (!charge.length) {
      if (!silencieux) new obsidian.Notice(tr('Rien à pousser vers Apple Agenda.'));
      return 0;
    }
    const avis = silencieux ? null : new obsidian.Notice(tr('Synchronisation Apple Agenda…'), 0);
    const sortie = await this._osascriptJXA(Ariane.genererJXAEvenementsPush(charge));
    if (avis) avis.hide();
    if (sortie == null) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda a refusé (autorisation d\'automatisation dans Réglages système ?).'));
      return 0;
    }
    if (sortie.startsWith('__ACCES__')) {
      this._agendaStatut = Number(sortie.split('\t')[1]);
      if (silencieux) this._avertirAccesAgenda();
      else {
        new obsidian.Notice(tr('Apple Agenda : ') + this._libelleStatutAgenda(this._agendaStatut)
          + '. ' + tr("Autorisez « Calendriers » pour Obsidian dans Réglages système → Confidentialité et sécurité."), 10000);
      }
      return 0;
    }
    const recu = new Map();
    const erreurs = [];
    for (const l of sortie.split('\n')) {
      const p = l.split('\t');
      const [ref, idxS, val] = p;
      if (!ref || idxS === undefined) continue;
      if (val === 'ERREUR') { erreurs.push(ref + ' #' + idxS + ' : ' + (p[3] || '?')); continue; }
      if (!recu.has(ref)) recu.set(ref, []);
      recu.get(ref)[Number(idxS)] = (val && val !== 'SUPPRIME') ? val : '';
    }
    if (erreurs.length) console.warn('[Ariane] Apple Agenda — échecs de push :\n' + erreurs.join('\n'));
    let n = 0;
    let liens = 0;
    for (const t of cibles) {
      const arr = recu.get(t.ref) || [];
      const liste = [];
      let confirme = true; // chaque créneau a reçu un identifiant du push
      for (let i = 0; i < t._crs.length; i += 1) {
        if (!arr[i]) confirme = false; // échec : ancien lien conservé, mais pas de « à jour »
        liste.push(arr[i] || t._ids[i] || '');
      }
      liens += liste.filter(Boolean).length;
      if (JSON.stringify(liste) !== JSON.stringify(t._ids)) {
        if (t.fichier) this.marquerEcriture(t.fichier.path); // pas de push en écho
        await this.majTache(t.ref, { 'agenda-id': liste });
      }
      // agenda-sync n'est écrit QUE si tous les créneaux ont bien un événement
      // lié — sinon la relève pourrait croire la note « à jour » et retirer le
      // lien d'un créneau que le push n'a pas réussi à créer.
      const complet = t._crs.length ? (confirme && liste.every(Boolean)) : true;
      // Et il n'est réécrit QUE s'il change : une réécriture à l'identique
      // relance la file du metadataCache, dont l'écho peut dépasser la fenêtre
      // d'anti-écho (2,5 s des deux côtés) et déclencher un push sans fin.
      const instant = Ariane.instantAgenda(t);
      if (t.fichier && complet && String(t._fm['agenda-sync'] || '') !== instant) {
        this.marquerEcriture(t.fichier.path);
        await this.app.fileManager.processFrontMatter(t.fichier, (x) => {
          x['agenda-sync'] = instant;
        });
      }
      n += 1;
    }
    this._rafraichirFond();
    console.info('[Ariane] Apple Agenda — push ' + (silencieux ? 'auto' : 'manuel')
      + ' : ' + liens + ' lien(s), ' + erreurs.length + ' échec(s).');
    if (!silencieux) {
      new obsidian.Notice(liens + tr(' événement(s) liés dans Apple Agenda')
        + (erreurs.length ? tr(', ') + erreurs.length + tr(' échec(s) — voir la console') : '') + '.', 8000);
    }
    return n;
  }

  // Diagnostic Apple Agenda : statut d'accès + calendriers vus + comptage des
  // tâches éligibles. Affiche un résumé et détaille dans la console.
  async diagnostiquerAgenda() {
    if (!obsidian.Platform.isMacOS) {
      new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return;
    }
    const avis = new obsidian.Notice(tr('Diagnostic Apple Agenda…'), 0);
    const s = await this._osascriptJXA(Ariane.genererJXAAgendas(), 30000);
    avis.hide();
    let d = null;
    try { d = s ? JSON.parse(s) : null; } catch (e) { d = null; }
    if (!d) {
      new obsidian.Notice(tr('Diagnostic : osascript n\'a rien renvoyé (voir la console).'), 8000);
      console.warn('[Ariane] diagnostic agenda — sortie brute :', s);
      return;
    }
    this._agendaStatut = Number(d.statut);
    this._agendas = Array.isArray(d.calendriers) ? d.calendriers : [];
    this._agendasChargeLe = Date.now();
    let elig = 0;
    for (const t of this.tachesPourGantt()) {
      const crs = Ariane.creneauxDeTache(t);
      if (crs.length && this.agendaCalendrierDe(t.famille)) elig += 1;
    }
    const lignes = [
      tr('Accès Calendriers : ') + this._libelleStatutAgenda(d.statut)
        + (d.statutAvant !== d.statut ? tr(' (demandé à l\'instant)') : ''),
      tr('Calendriers vus : ') + (d.calendriers.length ? d.calendriers.join(', ') : '—'),
      tr('Calendrier par défaut : ') + (d.defaut || '—'),
      tr('Calendriers surveillés (synchro) : ') + (this._agendasSurveilles().join(', ') || '—'),
      tr('Calendriers cochés (affichage) : ') + (this._agendasCoches().join(', ') || '—'),
      tr('Tâches éligibles au push : ') + elig,
      tr('Intégration activée : ') + (this.settings.agendaActif ? tr('oui') : tr('non')),
    ];
    console.info('[Ariane] diagnostic Apple Agenda\n' + lignes.join('\n'));
    new obsidian.Notice(lignes.join('\n'), 15000);
  }

  // Ménage : supprime des calendriers de synchro les événements « à Ariane »
  // (URL obsidian:// ou titre « [ref] … ») qui ne sont plus reliés à aucun
  // créneau — les doublons laissés par une course entre deux push.
  async nettoyerAgenda(silencieux) {
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return 0;
    }
    if (!this.settings.agendaActif) {
      if (!silencieux) new obsidian.Notice(tr("Apple Agenda est désactivé (Réglages → Tâches → Apple Agenda → Activer)."), 8000);
      return 0;
    }
    const cals = this._agendasSurveilles();
    if (!cals.length) return 0;
    const ids = {};
    const refs = [];
    for (const t of this.tachesPourGantt()) {
      refs.push(t.ref);
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      for (const id of [].concat(this._lireT(fm, 'agenda-id') || [])) if (id) ids[String(id)] = 1;
    }
    const avis = silencieux ? null : new obsidian.Notice(tr('Nettoyage Apple Agenda…'), 0);
    const sortie = await this._osascriptJXA(Ariane.genererJXAEvenementsMenage(
      cals, ids, refs, this.settings.agendaFenetreJours || 120));
    if (avis) avis.hide();
    if (sortie == null || sortie.startsWith('__ACCES__')) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : nettoyage impossible (voir la console).'));
      return 0;
    }
    const n = sortie.split('\n').filter((l) => l.startsWith('SUPPRIME')).length;
    if (n) { console.info('[Ariane] Apple Agenda — doublons supprimés :\n' + sortie); this._rafraichirFond(); }
    if (!silencieux) new obsidian.Notice(n + tr(' doublon(s) supprimé(s) d\'Apple Agenda.'), 6000);
    return n;
  }

  // Relève : pour chaque EKEvent lié, horaires changés dans Calendar → réécriture
  // de l'entrée de créneau ; événement supprimé → retrait du créneau. Aucun
  // import d'événement inconnu. La note fait foi si elle a bougé (agenda-sync).
  async releverAgenda(silencieux) {
    if (!obsidian.Platform.isMacOS) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : disponible sur macOS uniquement.'));
      return 0;
    }
    if (!this.settings.agendaActif) {
      if (!silencieux) new obsidian.Notice(tr("Apple Agenda est désactivé (Réglages → Tâches → Apple Agenda → Activer)."), 8000);
      return 0;
    }
    const avecId = [];
    for (const t of this.tachesPourGantt()) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const ids = [].concat(this._lireT(fm, 'agenda-id') || []).map(String);
      if (!ids.some((x) => x)) continue;
      avecId.push(Object.assign({}, t, { _ids: ids,
        _crs: Ariane.creneauxDeTache(t), _snap: String(fm['agenda-sync'] || '') }));
    }
    if (!avecId.length) {
      if (!silencieux) new obsidian.Notice(tr("Aucun événement lié à relever (lancez d'abord la synchro vers Apple Agenda)."), 8000);
      return 0;
    }
    const paires = [];
    for (const t of avecId) t._ids.forEach((id, i) => { if (id) paires.push({ ref: t.ref, idx: i, id }); });
    const avis = silencieux ? null : new obsidian.Notice(tr('Relève Apple Agenda…'), 0);
    const sortie = await this._osascriptJXA(
      Ariane.genererJXAEvenementsReleve(paires, this.settings.agendaFenetreJours || 120));
    if (avis) avis.hide();
    if (sortie == null) {
      if (!silencieux) new obsidian.Notice(tr('Apple Agenda : la relève a échoué (voir la console).'), 8000);
      return 0;
    }
    if (sortie.startsWith('__ACCES__')) {
      this._agendaStatut = Number(sortie.split('\t')[1]);
      if (silencieux) this._avertirAccesAgenda();
      else new obsidian.Notice(tr('Apple Agenda : ') + this._libelleStatutAgenda(this._agendaStatut)
        + '. ' + tr("Autorisez « Calendriers » pour Obsidian dans Réglages système → Confidentialité et sécurité."), 10000);
      return 0;
    }
    const parRef = new Map(avecId.map((t) => [t.ref, t]));
    let n = 0;
    for (const l of sortie.split('\n')) {
      const p = l.split('\t');
      const t = p[0] && parRef.get(p[0]);
      if (!t) continue;
      if (t._snap && Ariane.instantAgenda(t) !== t._snap) continue; // la note a bougé
      const idx = Number(p[1]);
      const cr = t._crs[idx];
      if (!cr) continue;
      if (p[2] === 'MANQUANT') {
        // Événement introuvable : ça peut être une vraie suppression, mais aussi
        // un simple raté de résolution d'identifiant (latence iCloud). On NE
        // supprime PAS le créneau — on efface seulement le lien, le prochain
        // push recréera l'événement.
        const ids = t._ids.slice();
        if (ids[idx]) { ids[idx] = ''; await this.majTache(t.ref, { 'agenda-id': ids }); n += 1; }
        continue;
      }
      const isoD = p[2] || '';
      const isoF = p[3] || '';
      if (isoD && isoF && (isoD !== cr.debut || isoF !== cr.fin)) {
        await this.majCreneau(t.ref, { avant: cr.brut, debut: isoD, fin: isoF });
        n += 1;
      }
    }
    if (n) this.antirebond('agenda:push', () => this.pousserAgenda(true), 1500);
    if (!silencieux && n) new obsidian.Notice(n + tr(' créneau(x) mis à jour depuis Apple Agenda.'));
    return n;
  }

  _labelConcept(concept) { return Ariane.libelleConcept(concept); }

  cleT(concept) {
    return Ariane.cleTache(concept, {
      prefixe: this.settings.prefixeTaches || '',
      cles: this.settings.clesTaches,
    });
  }

  // Intitulé d'une colonne / propriété affichée : sans le préfixe des tâches si
  // l'option est active (les vues frise et articulation).
  libelleColonne(nom) {
    if (this.settings.masquerPrefixeAffichage === false) return nom;
    const pre = this.settings.prefixeTaches || '';
    if (pre && typeof nom === 'string' && nom.startsWith(pre)) return nom.slice(pre.length);
    return nom;
  }

  // Lit un concept dans un entête, en acceptant l'ancienne clé par défaut le
  // temps que les notes soient migrées.
  _lireT(fm, concept) {
    if (!fm) return undefined;
    const k = this.cleT(concept);
    if (k in fm) return fm[k];
    // Repli sur d'autres formes le temps que les notes soient migrées :
    // concept nu, nom lisible, clé personnalisée — chacun avec/sans préfixe.
    const pre = this.settings.prefixeTaches || '';
    const perso = String((this.settings.clesTaches || {})[concept] || '').trim();
    for (const base of [concept, Ariane.libelleConcept(concept), perso]) {
      if (!base) continue;
      if (base in fm) return fm[base];
      if (pre && (pre + base) in fm) return fm[pre + base];
    }
    return undefined;
  }

  // Intitulé affiché d'une propriété générique dans le formulaire (toujours
  // l'intitulé lisible ; la clé de frontmatter réelle est un détail).
  libelleGen(cle) {
    const d = Ariane.PROPS_GENERIQUES.find((p) => p.cle === cle);
    return d ? tr(d.defaut) : cle;
  }

  // « Une tâche de la famille X porte les champs de X » : on complète les
  // entêtes qui ne les ont pas encore. Une seule passe, silencieuse, et jamais
  // d'écriture si rien ne manque.
  async rattraperProprietesFamilles() {
    const liste = Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [];
    if (!liste.length) return 0;
    let touchees = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.refDeChemin(f.path)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const fVal = this._lireT(fm, 'famille');
      const id = fVal ? String(fVal).trim() : '';
      if (!id) continue;
      const fam = liste.find((x) => x && x.id === id);
      if (!fam) continue;
      const manquantes = Ariane.proprietesManquantes(fm, fam);
      if (!manquantes.length) continue;
      await this.app.fileManager.processFrontMatter(f, (m) => {
        for (const p of manquantes) if (!(p.cle in m)) m[p.cle] = '';
      });
      touchees += 1;
    }
    return touchees;
  }

  // Écrit un blocage dans l'entête de la tâche bloquée. Le frontmatter est la
  // seule source : plus de registre canvas. Un cycle est refusé avant écriture.
  // Toutes les arêtes de rattachement du coffre : composition (parent -> fille)
  // ET blocage (bloqueur -> bloquée), pour valider un nouveau lien contre le
  // graphe FUSIONNÉ (un cycle peut n'apparaître qu'en mêlant les deux).
  _aretesRattachement() {
    const ar = [];
    for (const t of this.tachesPourGantt()) {
      const p = Ariane.refDeLien(t.parent);
      if (p) ar.push({ de: p, vers: t.ref, type: 'hier' });
      for (const b of t.bloquePar || []) {
        const x = Ariane.refDeLien(b);
        if (x) ar.push({ de: x, vers: t.ref, type: 'bloque' });
      }
    }
    return ar;
  }

  // Le lien `ajout` ({de, vers, type}) fermerait-il un cycle du graphe fusionné ?
  _lienFermeCycle(ajout) {
    const r = Ariane.lienValide(this._aretesRattachement(), new Map(), ajout);
    return !r.ok && (r.raison === 'cycle' || r.raison === 'soi');
  }

  // Rattache une tâche à une mère (ou détache si parentRef vide). Un
  // rattachement qui fermerait un cycle (rattachements + blocages) est refusé
  // d'emblée — aucune vue d'incohérences à consulter ensuite.
  async rattacher(enfantRef, parentRef) {
    if (!enfantRef) return false;
    if (parentRef && parentRef !== enfantRef
      && this._lienFermeCycle({ de: parentRef, vers: enfantRef, type: 'hier' })) {
      new obsidian.Notice(tr('Ce rattachement fermerait un cycle (rattachements + blocages) : refusé.'));
      return false;
    }
    return this.majTache(enfantRef, { parent: parentRef ? '[[' + parentRef + ']]' : '' });
  }

  /* ---- IA : structuration de tâches -------------------------------- */

  // Appel LLM (fournisseur configuré dans les réglages) qui rend du JSON parsé.
  async genererIA(prompt, jetons) {
    this._diagIA = '';
    const brut = await this.genererJsonRefs(prompt, jetons || 1800);
    if (!brut) {
      const f = this.settings.refsFournisseur || 'ollama';
      new obsidian.Notice(tr('IA (') + f + ') : ' + (this._diagIA
        || tr('aucune réponse. Réglages → Tâches → Assistant IA.')), 10000);
      return null;
    }
    const j = Ariane.extraireJson(brut);
    if (!j) {
      new obsidian.Notice(tr('Réponse de l\'IA illisible (JSON attendu) : ')
        + String(brut).replace(/\s+/g, ' ').slice(0, 160), 10000);
    }
    return j;
  }

  famillesIA() {
    return (Array.isArray(this.settings.famillesTaches) ? this.settings.famillesTaches : [])
      .filter((f) => f && f.id);
  }

  // Bloc de contexte « familles » commun à toutes les invites tâches.
  _blocFamilles() {
    const l = ['Familles de tâches disponibles (choisir l\'id EXACT) :'];
    for (const f of this.famillesIA()) {
      l.push('- ' + f.id + ' (« ' + (f.nom || f.id) + ' ») : '
        + (String(f.description || '').replace(/\s+/g, ' ').trim() || 'pas de description.'));
    }
    l.push('Famille par défaut si hésitation : ' + (this.settings.familleTacheDefaut || 'action') + '.');
    return l.join('\n');
  }

  promptStructuration(texte) {
    return [
      'Tu structures un brouillon de tâches en un arbre JSON.',
      this._blocFamilles(),
      '',
      'RÈGLES :',
      '- L\'indentation du brouillon = hiérarchie parent/enfant (champ "enfants").',
      '- « Jalon : … », ou une échéance de type présentation / soutenance / rendu → "jalon": true.',
      '- « BONUS », « si le temps », « optionnel » → "priorite": "basse" et le mets aussi en "note".',
      '- Une parenthèse ou une remarque (ex. « pas le temps pour X ») → "note", ne la perds jamais.',
      '- « Lire <ouvrage> » → famille lecture, et mets le titre de l\'ouvrage dans "source".',
      '- N\'INVENTE AUCUNE DATE. "debut"/"echeance" uniquement si une date explicite est écrite dans le brouillon, au format AAAA-MM-JJ, sinon "".',
      '- Reformule les intitulés en style bref, verbe à l\'infinitif, sans redondance.',
      '',
      'Réponds UNIQUEMENT par un tableau JSON. Chaque nœud :',
      '{"titre": "...", "famille": "id", "jalon": false, "priorite": "", "debut": "", "echeance": "", "note": "", "source": "", "enfants": []}',
      '',
      'BROUILLON :',
      String(texte || '').trim(),
    ].join('\n');
  }

  // Insère un texte de note sous « ## Note de travail » d'une tâche.
  async ajouterNoteTache(ref, texte) {
    const t = String(texte || '').trim();
    if (!t) return;
    const f = this.fichierDeRef(ref);
    if (!f) return;
    this.marquerEcriture(f.path);
    const lignes = (await this.app.vault.read(f)).split('\n');
    const i = lignes.findIndex((l) => /^##\s+Note de travail\s*$/.test(l));
    if (i >= 0) lignes.splice(i + 1, 0, '', t);
    else { lignes.push('', t); }
    await this.app.vault.modify(f, lignes.join('\n'));
  }

  // Corps (sans le titre) de la section « ## Note de travail » d'une tâche.
  async lireNoteTache(ref) {
    const f = this.fichierDeRef(ref);
    if (!f) return '';
    const lignes = (await this.app.vault.read(f)).split('\n');
    const i = lignes.findIndex((l) => /^##\s+Note de travail\s*$/.test(l));
    if (i < 0) return '';
    let j = i + 1;
    while (j < lignes.length && !/^##\s+/.test(lignes[j])) j += 1;
    return lignes.slice(i + 1, j).join('\n').trim();
  }

  // Remplace le corps de « ## Note de travail » (crée la section si absente).
  async ecrireNoteTache(ref, texte) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const corps = String(texte == null ? '' : texte).replace(/\s+$/, '');
    const lignes = (await this.app.vault.read(f)).split('\n');
    const i = lignes.findIndex((l) => /^##\s+Note de travail\s*$/.test(l));
    let sortie;
    if (i < 0) {
      let k = 0;
      if (lignes[0] === '---') { const fin = lignes.indexOf('---', 1); k = fin >= 0 ? fin + 1 : 0; }
      while (k < lignes.length && (lignes[k].trim() === '' || /^# /.test(lignes[k]))) k += 1;
      sortie = lignes.slice(0, k).concat(['## Note de travail', '', corps, ''], lignes.slice(k));
    } else {
      let j = i + 1;
      while (j < lignes.length && !/^##\s+/.test(lignes[j])) j += 1;
      sortie = lignes.slice(0, i + 1).concat(['', corps, ''], lignes.slice(j));
    }
    const texteSortie = sortie.join('\n');
    const avant = await this.app.vault.read(f);
    if (texteSortie === avant) return false;
    this.marquerEcriture(f.path);
    await this.app.vault.modify(f, texteSortie);
    return true;
  }

  // Crée un arbre de specs (déjà normalisées). Renvoie la liste des réfs créées.
  // opts.vue = { fichier, nom } d'une vue articulation où poser les cartes.
  async creerArbreTaches(specs, opts) {
    const o = opts || {};
    const crees = [];
    const poser = async (spec, parentRef) => {
      const chemin = await this.creerTache({
        intitule: spec.titre,
        famille: spec.famille,
        jalon: spec.jalon,
        priorite: spec.priorite,
        debut: spec.debut,
        echeance: spec.echeance,
        source: spec.famille === 'lecture' ? spec.source : undefined,
      });
      const ref = this.refDeChemin(chemin);
      if (!ref) return;
      crees.push(ref);
      if (spec.note) { try { await this.ajouterNoteTache(ref, spec.note); } catch (e) { /* rien */ } }
      if (parentRef) { try { await this.rattacher(ref, parentRef); } catch (e) { /* rien */ } }
      for (const e of spec.enfants || []) await poser(e, ref);
    };
    for (const s of specs || []) await poser(s, o.parentRef || null);
    if (o.vue && o.vue.fichier && crees.length) {
      try {
        const fv = this.app.vault.getAbstractFileByPath(o.vue.fichier);
        if (fv) {
          const txt = await this.app.vault.read(fv);
          const out = Ariane.majPlanArticulationTexte(txt, o.vue.nom || null, crees);
          if (out && out !== txt) await this.app.vault.modify(fv, out);
        }
      } catch (e) { console.debug('[Ariane] pose sur vue', e); }
    }
    return crees;
  }

  // Vues « ariane-articulation » trouvées dans les .base du coffre.
  async vuesArticulation() {
    const out = [];
    for (const f of this.app.vault.getFiles().filter((x) => x && x.extension === 'base')) {
      let base;
      try { base = obsidian.parseYaml(await this.app.vault.read(f)) || {}; } catch (e) { continue; }
      for (const v of (Array.isArray(base.views) ? base.views : [])) {
        if (v && v.type === 'ariane-articulation') {
          out.push({ fichier: f.path, nom: v.name || f.basename });
        }
      }
    }
    return out;
  }

  // Ouvre la modale de découpage pour une tâche donnée.
  ouvrirDecoupage(ref) {
    const t = this.tachesPourGantt().find((x) => x.ref === ref);
    if (!t) { new obsidian.Notice(tr('Tâche introuvable.')); return; }
    const enfants = this.tachesPourGantt()
      .filter((x) => Ariane.refDeLien(x.parent) === ref)
      .map((x) => x.intitule);
    new ModaleStructurerTaches(this, {
      decouper: { ref, titre: t.intitule, famille: t.famille || (this.settings.familleTacheDefaut || 'action'), enfants },
    }).open();
  }

  promptDecoupage(tache, contexte) {
    return [
      'Propose des sous-tâches concrètes pour découper la tâche ci-dessous, en JSON.',
      this._blocFamilles(),
      'Tâche à découper : « ' + tache.titre + ' » (famille ' + tache.famille + ').',
      (tache.enfants && tache.enfants.length)
        ? 'Sous-tâches déjà présentes (ne pas répéter) : ' + tache.enfants.join(' ; ') + '.' : '',
      contexte ? ('Consignes : ' + contexte) : '',
      'RÈGLES : 3 à 8 sous-tâches, intitulés brefs à l\'infinitif, pas de dates, "jalon" seulement pour une étape de validation. Imbrication possible via "enfants".',
      'Réponds UNIQUEMENT par un tableau JSON de nœuds {"titre","famille","jalon":false,"priorite":"","note":"","source":"","enfants":[]}.',
    ].filter(Boolean).join('\n');
  }

  // Passe en lots : réécrit les intitulés en style cohérent. Rend
  // [{ ref, avant, apres }] pour les seuls qui changent.
  async normaliserIntitules(refs) {
    const g = this.tachesPourGantt();
    const parRef = new Map(g.map((t) => [t.ref, t]));
    const cibles = ((refs && refs.length) ? refs : g.map((t) => t.ref))
      .map((r) => parRef.get(r)).filter(Boolean);
    const out = [];
    const LOT = 35;
    for (let i = 0; i < cibles.length; i += LOT) {
      const bout = cibles.slice(i, i + LOT);
      const avis = new obsidian.Notice(tr('Normalisation… ') + (i + bout.length) + '/' + cibles.length, 0);
      const prompt = [
        'Réécris ces intitulés de tâches en style cohérent : verbe à l\'infinitif en tête, bref, sans redondance ni article superflu. Garde le sens et les noms propres, ne traduis pas.',
        'Réponds par un tableau JSON [{"ref":"...","titre":"..."}] ; n\'inclus QUE les intitulés qui changent.',
        '',
        bout.map((t) => t.ref + ' :: ' + t.intitule).join('\n'),
      ].join('\n');
      let j;
      try { j = await this.genererIA(prompt, 1400); } finally { avis.hide(); }
      const arr = Array.isArray(j) ? j : (j && Array.isArray(j.taches) ? j.taches : []);
      for (const e of arr) {
        const ref = String((e && (e.ref || e.id)) || '').trim();
        const titre = String((e && (e.titre || e.title)) || '').trim();
        const t = parRef.get(ref);
        if (t && titre && titre !== t.intitule) out.push({ ref, avant: t.intitule, apres: titre });
      }
    }
    return out;
  }

  // Passe en lots : famille la mieux adaptée d'après l'intitulé + descriptions.
  // Rend [{ ref, avant, apres, titre }] pour les seuls écarts.
  async verifierFamilles(refs) {
    const g = this.tachesPourGantt();
    const parRef = new Map(g.map((t) => [t.ref, t]));
    const ids = new Set(this.famillesIA().map((f) => f.id));
    const cibles = ((refs && refs.length) ? refs : g.map((t) => t.ref))
      .map((r) => parRef.get(r)).filter(Boolean);
    const out = [];
    const LOT = 35;
    for (let i = 0; i < cibles.length; i += LOT) {
      const bout = cibles.slice(i, i + LOT);
      const avis = new obsidian.Notice(tr('Vérification… ') + (i + bout.length) + '/' + cibles.length, 0);
      const prompt = [
        'Pour chaque tâche, indique la famille la plus adaptée d\'après son intitulé et les descriptions ci-dessous.',
        this._blocFamilles(),
        'Réponds par un tableau JSON [{"ref":"...","famille":"id"}], UNIQUEMENT les tâches où ta famille diffère de celle entre crochets.',
        '',
        bout.map((t) => t.ref + ' :: [' + t.famille + '] ' + t.intitule).join('\n'),
      ].join('\n');
      let j;
      try { j = await this.genererIA(prompt, 1200); } finally { avis.hide(); }
      const arr = Array.isArray(j) ? j : [];
      for (const e of arr) {
        const ref = String((e && (e.ref || e.id)) || '').trim();
        const fam = String((e && (e.famille || e.family)) || '').trim().toLowerCase();
        const t = parRef.get(ref);
        if (t && ids.has(fam) && fam !== t.famille) {
          out.push({ ref, avant: t.famille, apres: fam, titre: t.intitule });
        }
      }
    }
    return out;
  }

  // Une phrase -> une tâche créée (famille + dates si écrites + blocage déduit).
  async ajouterTacheLN(phrase) {
    const p = String(phrase || '').trim();
    if (!p) return null;
    const prompt = [
      'Extrais UNE tâche de cette phrase, en JSON : {"titre","famille","debut","echeance","bloque_par"}.',
      this._blocFamilles(),
      '- debut / echeance : AAAA-MM-JJ, uniquement si une date ou une échéance explicite est donnée, sinon "".',
      '- bloque_par : le titre approximatif d\'une tâche existante à finir avant celle-ci, sinon "".',
      '- titre : bref, verbe à l\'infinitif.',
      'Phrase : ' + p,
    ].join('\n');
    const j = await this.genererIA(prompt, 500);
    if (!j) return null;
    const specs = Ariane.normaliserSpecsTaches([j], {
      familles: new Set(this.famillesIA().map((f) => f.id)),
      defaut: this.settings.familleTacheDefaut || 'action',
      dates: Ariane.datesDansTexte(p),
    });
    if (!specs.length) return null;
    const s = specs[0];
    const chemin = await this.creerTache({
      intitule: s.titre, famille: s.famille, debut: s.debut, echeance: s.echeance,
      source: s.famille === 'lecture' ? s.source : undefined,
    });
    const ref = this.refDeChemin(chemin);
    const bp = String((j.bloque_par || j.bloquePar || '')).trim();
    if (ref && bp) {
      const cand = this.tachesPourGantt().filter((t) => t.ref !== ref)
        .map((t) => ({ ref: t.ref, titre: t.intitule }));
      const m = (await this.meilleurTitreSem(bp, cand)) || Ariane.meilleurTitre(bp, cand);
      if (m) await this.creerBlocage(m.ref, ref);
    }
    return ref;
  }

  // Résout les sources en clair des tâches « lecture » vers un [[@citekey]] du
  // coffre. Rend [{ ref, avant, apres, titre }] à passer à ModaleRevueLot.
  async resoudreSourcesLecture(refs) {
    const g = this.tachesPourGantt();
    const parRef = new Map(g.map((t) => [t.ref, t]));
    const cibles = ((refs && refs.length) ? refs : g.map((t) => t.ref))
      .map((r) => parRef.get(r))
      .filter((t) => t && t.famille === 'lecture');
    // Candidats : notes du coffre dont le nom commence par « @ ».
    const cand = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.basename.startsWith('@')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const al = [].concat(fm.aliases || []).map(String).filter(Boolean);
      cand.push({ ref: f.basename, titre: (al[0] || f.basename) + ' ' + f.basename });
    }
    if (!cand.length) return [];
    const out = [];
    for (const t of cibles) {
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const src = String(this._lireT(fm, 'source') || '').trim();
      if (!src || /\[\[.*\]\]/.test(src)) continue;
      const m = (await this.meilleurTitreSem(src, cand, 0.5)) || Ariane.meilleurTitre(src, cand, 0.3);
      if (m) out.push({ ref: t.ref, avant: src, apres: '[[' + m.ref + ']]', titre: t.intitule });
    }
    return out;
  }

  // Correspondance SÉMANTIQUE d'un titre parmi des candidats {ref, titre}, via
  // le moteur d'embeddings déjà en place. Encodage à la demande (pas d'index
  // persistant pour l'instant). Rend { ref, score } ou null.
  async meilleurTitreSem(cible, candidats, seuil) {
    if (!candidats || !candidats.length) return null;
    if ((this.settings.suggMoteur || 'hybride') === 'lexical') return null;
    let vs;
    try { vs = await this.encoderTextes([cible].concat(candidats.map((c) => c.titre))); }
    catch (e) { return null; }
    if (!vs || vs.length !== candidats.length + 1) return null;
    let best = null;
    for (let i = 0; i < candidats.length; i += 1) {
      const s = cosinusVecteurs(vs[0], vs[i + 1]);
      if (!best || s > best.score) best = { ref: candidats[i].ref, score: s };
    }
    return (best && best.score >= (seuil == null ? 0.55 : seuil)) ? best : null;
  }

  // Dernier état SAIN de « parent » / « bloque-par » par tâche, pour pouvoir y
  // revenir si une modif manuelle ferme un cycle.
  _rattachDe(ref) {
    const f = this.fichierDeRef(ref);
    const fm = f ? ((this.app.metadataCache.getFileCache(f) || {}).frontmatter || {}) : {};
    return {
      parent: this._lireT(fm, 'parent') || '',
      bloque: [].concat(this._lireT(fm, 'bloque-par') || []),
    };
  }

  semerRattachOk() {
    this._rattachOk = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const ref = this.refDeChemin(f.path);
      if (ref) this._rattachOk.set(ref, this._rattachDe(ref));
    }
  }

  // Rattrape « Sans échéance » sur les tâches qui ne l'ont pas encore (coffres
  // d'avant l'introduction de la propriété) ou dont la valeur a divergé. Après
  // un premier passage, tout est en phase et la boucle n'écrit plus rien.
  async semerSansEcheance() {
    const kSE = this.cleT('sans-echeance');
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.refDeChemin(f.path)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const v = Ariane.sansEcheanceAEcrire(this._lireT(fm, 'echeance'), this._lireT(fm, 'sans-echeance'));
      if (v === null) continue;
      this.marquerEcriture(f.path);
      try {
        await this.app.fileManager.processFrontMatter(f, (x) => {
          x[kSE] = v;
          x.modifie = new Date().toISOString().slice(0, 10);
        });
      } catch (e) { /* note verrouillée : au prochain passage */ }
    }
  }

  // Complète les propriétés du « noyau » (Ariane.defautsNoyau) sur les notes de
  // tâches qui n'en portent pas encore la clé. Une seule passe, silencieuse,
  // idempotente : jamais d'écriture si rien ne manque, jamais d'écrasement d'une
  // valeur existante, pas de bump de « modifie » (c'est un rattrapage de schéma,
  // pas une modification de sens). Lancée au démarrage — donc toute propriété
  // ajoutée au plugin est rattrapée — et via la commande dédiée. Renvoie le
  // nombre de notes complétées.
  async semerConceptsTache() {
    const defauts = Ariane.defautsNoyau();
    let touchees = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.refDeChemin(f.path)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const manque = Ariane.conceptsAAmorcer(defauts,
        (c) => this._lireT(fm, c), (c) => this.cleT(c));
      const cles = Object.keys(manque);
      if (!cles.length) continue;
      this.marquerEcriture(f.path);
      try {
        await this.app.fileManager.processFrontMatter(f, (x) => {
          for (const k of cles) if (!(k in x)) x[k] = manque[k];
        });
        touchees += 1;
      } catch (e) { /* note verrouillée : au prochain passage */ }
    }
    return touchees;
  }

  async veillerRattachements(fichier, ref) {
    const actuel = this._rattachDe(ref);
    // Écriture du greffon (déjà validée) : on mémorise et on sort.
    if (this.ecritePlugin(fichier.path)) { this._rattachOk.set(ref, actuel); return; }
    const cycles = Ariane.cyclesDe(this._aretesRattachement());
    const enCycle = cycles.some((c) => c.includes(ref));
    const bon = this._rattachOk.get(ref);
    if (enCycle && bon
      && JSON.stringify([bon.parent, bon.bloque]) !== JSON.stringify([actuel.parent, actuel.bloque])) {
      this.marquerEcriture(fichier.path);
      const kP = this.cleT('parent');
      const kB = this.cleT('bloque-par');
      await this.app.fileManager.processFrontMatter(fichier, (x) => {
        x[kP] = bon.parent;
        x[kB] = bon.bloque;
        x.modifie = new Date().toISOString().slice(0, 10);
      });
      new obsidian.Notice(tr('Modification annulée : ce lien fermait un cycle (rattachements + blocages).'));
      return;
    }
    if (!enCycle) this._rattachOk.set(ref, actuel);
  }

  async creerBlocage(deRef, versRef) {
    if (!deRef || !versRef || deRef === versRef) return false;
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === versRef);
    if (!f) return false;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const kBP = this.cleT('bloque-par');
    const deja = [].concat(this._lireT(fm, 'bloque-par') || []).map(String);
    if (deja.some((v) => Ariane.refDeLien(v) === deRef)) return false;
    if (this._lienFermeCycle({ de: deRef, vers: versRef, type: 'bloque' })) {
      new obsidian.Notice(tr('Ce lien fermerait un cycle (rattachements + blocages) : refusé.'));
      return false;
    }
    const derive = Ariane.blocageDerive(this._aretesRattachement(), deRef, versRef);
    if (derive) {
      new obsidian.Notice(tr('Blocage dérivé : cette tâche est déjà bloquée par ')
        + derive + tr(' — les filles d’une mère bloquante bloquent avec elle.'));
      return false;
    }
    await this.app.fileManager.processFrontMatter(f, (x) => {
      x[kBP] = deja.concat(['[[' + deRef + ']]']);
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    return true;
  }

  async retirerBlocage(deRef, versRef) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === versRef);
    if (!f) return false;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const kBP = this.cleT('bloque-par');
    const reste = [].concat(this._lireT(fm, 'bloque-par') || []).map(String)
      .filter((v) => Ariane.refDeLien(v) !== deRef);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      x[kBP] = reste;
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    return true;
  }

  // Les incohérences des tâches, lues dans le frontmatter (plus dans les
  // canvas) : cycles de blocage ou de composition, échéances qui se
  // contredisent, liens vers une note absente.
  recalculerIncoherences() {
    const taches = this.tachesPourGantt();
    const refs = new Set(taches.map((t) => t.ref));
    const bloquants = [];
    const compositions = [];
    const dates = {};
    const morts = new Set();
    for (const t of taches) {
      dates[t.ref] = { debut: t.debut || '', echeance: t.echeance || '' };
      const p = Ariane.refDeLien(t.parent || '');
      if (p) {
        if (refs.has(p)) compositions.push({ de: p, vers: t.ref });
        else morts.add(p);
      }
      for (const b of t.bloquePar || []) {
        const x = Ariane.refDeLien(b);
        if (!x) continue;
        if (refs.has(x)) bloquants.push({ de: x, vers: t.ref });
        else morts.add(x);
      }
    }
    const cycles = Ariane.cyclesDe(bloquants).concat(Ariane.cyclesDe(compositions));
    this._incoherencesTaches = {
      cycles,
      dates: Ariane.datesIncoherentes(bloquants, dates),
      conflits: [],
      morts: [...morts],
    };
    return this._incoherencesTaches;
  }

  // Écrit quelques propriétés d'une tâche, sans toucher au reste.
  async majTache(ref, champs) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const conc = new Set(Ariane.CONCEPTS_TACHE);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      for (const [k, v] of Object.entries(champs)) {
        x[conc.has(k) ? this.cleT(k) : k] = v;
      }
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    return true;
  }

  // Valeur ACTUELLE d'un concept de tâche, lue dans le frontmatter (chaîne,
  // '' si absente). Sert aux thématiques des zones d'articulation, qui doivent
  // connaître la valeur d'avant un geste pour l'annulation.
  lireConceptTache(ref, concept) {
    const f = this.fichierDeRef(ref);
    if (!f) return '';
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const v = this._lireT(fm, concept);
    return v == null ? '' : String(v);
  }

  // Le titre d'une tâche EST son premier alias (c'est ce qu'affichent la frise
  // et l'articulation). On aligne aussi le titre H1 du corps s'il existe, pour
  // que la note ne se contredise pas.
  async renommerTitreTache(ref, titre) {
    const t = String(titre == null ? '' : titre).trim();
    if (!t) return false;
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      x.aliases = [t];
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    const avant = await this.app.vault.read(f);
    const lignes = avant.split('\n');
    for (let i = 0; i < lignes.length; i += 1) {
      if (/^# /.test(lignes[i])) { lignes[i] = '# ' + t; break; }
    }
    const apres = lignes.join('\n');
    if (apres !== avant) {
      this.marquerEcriture(f.path);
      await this.app.vault.modify(f, apres);
    }
    return true;
  }

  // Coche / décoche « terminée » : statut et case écrits ensemble.
  async basculerTermine(ref, coche) {
    return this.majTache(ref, coche
      ? { statut: 'terminée', terminee: true }
      : { statut: 'à faire', terminee: false });
  }

  // Met la note d'une tâche à la corbeille et nettoie les renvois des autres
  // tâches vers elle (parent, bloque-par) pour ne pas laisser de liens morts.
  async supprimerTache(ref) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    for (const t of this.tachesPourGantt()) {
      if (t.ref === ref) continue;
      const champs = {};
      if (Ariane.refDeLien(t.parent || '') === ref) champs.parent = '';
      const bp = (t.bloquePar || []).filter((b) => Ariane.refDeLien(b) !== ref);
      if (bp.length !== (t.bloquePar || []).length) champs['bloque-par'] = bp;
      if (Object.keys(champs).length) await this.majTache(t.ref, champs);
    }
    this.marquerEcriture(f.path);
    await this.app.fileManager.trashFile(f);
    return true;
  }

  // Écrit en une passe les dates rendues par decalerSousArbre ou cascadeAval.
  async ecrireDatesTaches(changements) {
    const parRef = new Map(this.tachesPourGantt().map((t) => [t.ref, t.fichier]));
    let n = 0;
    for (const c of changements || []) {
      const f = parRef.get(c.ref);
      if (!f) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const kD = this.cleT('debut');
      const kE = this.cleT('echeance');
      if (String(this._lireT(fm, 'debut') || '') === c.debut
        && String(this._lireT(fm, 'echeance') || '') === c.echeance) continue;
      await this.app.fileManager.processFrontMatter(f, (x) => {
        x[kD] = c.debut ? c.debut : null;
        x[kE] = c.echeance ? c.echeance : null;
        x.modifie = new Date().toISOString().slice(0, 10);
      });
      n += 1;
    }
    return n;
  }

  // La référence d'une tâche, déduite du chemin : toute note du dossier des
  // tâches, plus les anciennes références « T26-xxx » où qu'elles soient.
  refDeChemin(chemin) {
    return Ariane.refDepuisChemin(chemin, this.dossierT);
  }

  // Les fiches Zotero du coffre, prêtes pour une recherche approchée. On les
  // reconnaît à leur clé de citation plutôt qu'à leur dossier, qui varie.
  sourcesZoteroPourChoix() {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // Une fiche de source se reconnaît largement : nom en « @… », ou l'une
      // des clés d'identification Zotero, quel que soit le format.
      const estSource = f.basename.charAt(0) === '@'
        || fm.citationKey != null || fm['citation-key'] != null
        || fm.citekey != null || fm['zotero-key'] != null
        || fm.type === 'source' || fm.type === 'reference';
      if (!estSource) continue;
      const alias = [].concat(fm.aliases || []).map(String).filter(Boolean);
      out.push({
        nom: Ariane.libelleSource(fm, f.basename) + (alias.length ? '  ⟨' + alias.join(' · ') + '⟩' : ''),
        cle: f.basename,
      });
    }
    out.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return out;
  }

  // Interroge Spotlight pour les deux dates d'un fichier externe. mdls est
  // fourni par macOS et ne demande aucune installation. Avec -raw les valeurs
  // sont séparées par un octet nul ; un fichier absent ou non indexé ne rend
  // rien qui ressemble à une date, et le filtre le laisse tomber.
  async metadonneesFichier(chemin) {
    const abs = chemin.startsWith('~/')
      ? require('os').homedir() + chemin.slice(1)
      : chemin.replace(/^file:\/\//, '');
    return new Promise((resolve) => {
      require('child_process').execFile('mdls', [
        '-raw', '-name', 'kMDItemContentModificationDate',
        '-name', 'kMDItemLastUsedDate', abs,
      ], (err, sortie) => {
        if (err || !sortie) return resolve(null);
        const dates = String(sortie).split('\0')
          .map((x) => x.trim())
          .map((x) => (/^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : ''));
        if (!dates[0] && !dates[1]) return resolve(null);
        resolve({ modifie: dates[0] || '', ouvert: dates[1] || '' });
      });
    });
  }

  // Rassemble ce que le bloc a besoin de savoir et que seule l'application
  // connaît : les deux URI d'une lecture, les deux dates d'un fichier externe.
  // Le calcul des URI réemploie cleAttachement, déjà écrite pour le volet des
  // références : la clé de la pièce jointe ne se déduit pas de la clé de
  // citation, elle se lit dans la fiche.
  async accesTache(fm) {
    const c = Ariane.champTache(fm);
    if (c.retenu === 'fichier') return this.metadonneesFichier(String(fm.fichier).trim());
    if (c.retenu !== 'source') return null;
    const base = String(fm.source).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === base);
    if (!f) return null;
    const fms = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const out = {};
    const cle = await this.cleAttachement(f);
    if (cle) {
      out.uriPdf = 'obsidian://zotflow?type=open-attachment&libraryID='
        + encodeURIComponent(fms['library-id'] || '') + '&key=' + encodeURIComponent(cle);
    }
    if (fms['zotero-key']) {
      out.uriZotero = 'zotero://select/library/items/' + String(fms['zotero-key']).trim();
    }
    return (out.uriPdf || out.uriZotero) ? out : null;
  }

  // Réécrit le bloc marqué de la note. Il se pose sous le titre s'il n'existe
  // pas encore, et disparaît si la tâche cesse de désigner quoi que ce soit.
  async majBlocTache(file) {
    if (!this.refDeChemin(file.path)) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const fmBrut = (cache && cache.frontmatter) || {};
    const fm = Object.assign({}, fmBrut, {
      source: this._lireT(fmBrut, 'source'),
      livrable: this._lireT(fmBrut, 'livrable'),
      fichier: this._lireT(fmBrut, 'fichier'),
    });
    const meta = await this.accesTache(fm);
    const interieur = Ariane.blocTache(fm, meta);
    const bloc = interieur ? ZFA_TACHE_DEBUT + '\n' + interieur + '\n' + ZFA_TACHE_FIN : '';
    const avant = await this.app.vault.read(file);
    let texte = avant;
    const debut = texte.indexOf(ZFA_TACHE_DEBUT);
    const fin = texte.indexOf(ZFA_TACHE_FIN);
    if (debut !== -1 && fin > debut) {
      texte = texte.slice(0, debut) + bloc + texte.slice(fin + ZFA_TACHE_FIN.length);
    } else if (bloc) {
      texte = texte.replace(/^(# .*\n)/m, '$1\n' + bloc + '\n');
    }
    // Ne rien écrire quand rien ne change : c'est ce qui empêche l'écoute qui
    // appelle cette méthode de se rappeler elle-même sans fin.
    if (texte === avant) return false;
    await this.app.vault.modify(file, texte);
    return true;
  }

  // Édite la liste des créneaux d'une tâche. { avant } = chaîne de l'entrée
  // ciblée (vide = ajout). { debut, fin } nuls = suppression de `avant`.
  async majCreneau(ref, { avant, debut, fin }) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const cle = this.cleT('creneaux');
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    let liste = [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean);
    const nouv = (debut && fin) ? Ariane.formatCreneau(debut, fin) : '';
    if (avant) {
      liste = liste.filter((x) => x.trim() !== String(avant).trim());
      if (nouv) liste.push(nouv);
    } else if (nouv) {
      liste.push(nouv);
    }
    // Dédoublonnage + tri par début.
    liste = Ariane.creneauxDeTache(liste).map((c) => c.brut);
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      if (liste.length) x[cle] = liste; else delete x[cle];
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    // Le commentaire d'une session déplacée la suit ; celui d'une session
    // supprimée disparaît (majBlocCreneaux recueille et re-place).
    await this.majBlocCreneaux(f, { de: avant, vers: nouv });
    // marquerEcriture ci-dessus fait taire l'écoute metadataCache.changed → il
    // faut relancer le push explicitement pour que les gestes de la vue
    // calendrier (glisser / redimensionner / créer un créneau) se synchronisent.
    if (this._relancerPushAgenda) this._relancerPushAgenda(1500);
    return true;
  }

  // Réécrit la section « ## Sessions » balisée de la note (idempotent, sur le
  // modèle de majBlocTache). Se pose sous le bloc d'accès s'il existe, sinon
  // sous le # Titre ; disparaît quand la tâche n'a plus de créneau.
  // opts : { de, vers } fait suivre le commentaire d'une session déplacée
  // (vers vide = session supprimée) ; { coms } remplace la carte complète.
  async majBlocCreneaux(file, opts) {
    if (!this.refDeChemin(file.path)) return false;
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const liste = [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean);
    const stats = Ariane.statsCreneaux(liste, new Date().toISOString());
    // Commentaires relus de l'ancien bloc AVANT réécriture, puis ajustés.
    const avant = await this.app.vault.read(file);
    const coms = Ariane.commentairesDuBloc(avant);
    const o = opts || {};
    if (o.coms) {
      for (const k of Object.keys(coms)) delete coms[k];
      Object.assign(coms, o.coms);
    }
    if (o.de) {
      const deCle = Ariane.cleCommentaire(o.de);
      const versCle = o.vers ? Ariane.cleCommentaire(o.vers) : '';
      if (deCle && deCle !== versCle && coms[deCle] !== undefined) {
        const txt = coms[deCle];
        delete coms[deCle];
        if (versCle) coms[versCle] = txt;
      }
    }
    const interieur = Ariane.blocCreneaux(liste, stats, coms);
    const bloc = interieur ? ZFA_CRENEAUX_DEBUT + '\n' + interieur + '\n' + ZFA_CRENEAUX_FIN : '';
    let texte = avant;
    const d = texte.indexOf(ZFA_CRENEAUX_DEBUT);
    const f = texte.indexOf(ZFA_CRENEAUX_FIN);
    if (d !== -1 && f > d) {
      texte = texte.slice(0, d) + bloc + texte.slice(f + ZFA_CRENEAUX_FIN.length);
      // Bloc vidé : retirer aussi la ligne blanche résiduelle.
      if (!bloc) texte = texte.replace(/\n{3,}/g, '\n\n');
    } else if (bloc) {
      // Après le bloc d'accès s'il existe, sinon après le # Titre.
      if (texte.indexOf(ZFA_TACHE_FIN) !== -1) {
        texte = texte.replace(ZFA_TACHE_FIN, ZFA_TACHE_FIN + '\n\n' + bloc);
      } else {
        texte = texte.replace(/^(# .*\n)/m, '$1\n' + bloc + '\n');
      }
    }
    if (texte === avant) return false;
    this.marquerEcriture(file.path);
    await this.app.vault.modify(file, texte);
    return true;
  }

  // Écrit le commentaire d'une session (cleCommentaire), ou l'efface quand le
  // texte est vide. Ne touche qu'au bloc balisé, pas au frontmatter.
  async majCommentaireCreneau(ref, brut, texte) {
    const f = this.fichierDeRef(ref);
    if (!f) return false;
    const cle = Ariane.cleCommentaire(brut);
    if (!cle) return false;
    const avant = await this.app.vault.read(f);
    const coms = Ariane.commentairesDuBloc(avant);
    const t = String(texte || '').trim();
    if (t) coms[cle] = t; else delete coms[cle];
    return this.majBlocCreneaux(f, { coms });
  }

  // --- Affichage des tâches : habillage des notes de tâche ouvertes (visuel),
  // et harmonisation ponctuelle des noms de colonnes dans les .base. ---
  installerAffichageTaches() {
    let minuteur = null;
    const planifier = () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        try { this.habillerNotesTache(); } catch (e) { /* sans gravité */ }
      }, 150);
    };
    for (const ev of ['layout-change', 'active-leaf-change', 'file-open']) {
      this.registerEvent(this.app.workspace.on(ev, planifier));
    }
    this.registerEvent(this.app.metadataCache.on('resolved', planifier));
    const cont = this.app.workspace.containerEl;
    if (cont && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(planifier);
      obs.observe(cont, { childList: true, subtree: true });
      this.register(() => obs.disconnect());
    }
    this.app.workspace.onLayoutReady(planifier);
    this.app.workspace.onLayoutReady(() => {
      this.harmoniserNomsColonnesBases().catch(() => { /* sans gravité */ });
    });
  }

  // Pose, dans chaque fichier .base du coffre, un `displayName` sans préfixe
  // pour les colonnes de propriété de tâche préfixées. Écrit le fichier une
  // seule fois (idempotent), n'écrase jamais un displayName choisi à la main,
  // et ne touche qu'au bloc `properties:` (le reste du .base reste octet pour
  // octet — indispensable pour arianeArtPlan et consorts).
  async harmoniserNomsColonnesBases() {
    const pre = this.settings.prefixeTaches || '';
    if (!pre) return;
    const fichiers = this.app.vault.getFiles().filter((f) => f && f.extension === 'base');
    for (const f of fichiers) {
      let texte;
      try { texte = await this.app.vault.read(f); } catch (e) { continue; }
      let base;
      try { base = obsidian.parseYaml(texte) || {}; } catch (e) { continue; }
      const plan = Ariane.planHarmonisationBase(base, pre);
      if (!plan.ajouts.length) continue;
      const sortie = Ariane.insererProprietesBase(texte, plan.ajouts);
      if (!sortie || sortie === texte) continue;
      try { await this.app.vault.modify(f, sortie); } catch (e) { /* sans gravité */ }
    }
  }

  // Ajoute la classe zfa-note-tache au conteneur d'une note de tâche ouverte,
  // pour l'habillage CSS optionnel des propriétés + contenu. Vaut aussi pour
  // les fenêtres de survol (« page preview »), qui ne sont pas des vues.
  habillerNotesTache() {
    const masquer = this.settings.masquerPrefixeAffichage !== false;
    const skin = this.settings.styleNoteTache === true;
    // Toutes les formes possibles d'une clé de propriété -> concept (minuscule,
    // Obsidian normalise data-property-key en minuscule).
    const pre = this.settings.prefixeTaches || '';
    const parCle = new Map();
    for (const con of Ariane.CONCEPTS_TACHE) {
      const lab = Ariane.libelleConcept(con);
      for (const v of [this.cleT(con), con, lab, pre + con, pre + lab]) {
        if (v) parCle.set(String(v).toLowerCase(), con);
      }
    }
    const clesFamille = new Set();
    for (const f of (this.settings.famillesTaches || [])) {
      for (const p of (f && f.proprietes) || []) {
        if (p && p.cle) clesFamille.add(String(p.cle).toLowerCase());
      }
    }
    const ctx = { masquer, skin, parCle, clesFamille };

    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const vue = leaf && leaf.view;
      if (!vue || !vue.contentEl) continue;
      const estTache = !!(vue.file && this.refDeChemin(vue.file.path));
      this._habillerConteneur(vue.contentEl, estTache, ctx);
    }
    // Fenêtres de survol : pas de fichier accessible, on reconnaît la tâche à
    // son entête (type: tache, ou au moins deux propriétés de tâche).
    for (const pop of document.querySelectorAll('.hover-popover, .popover')) {
      const cont = pop.querySelector(
        '.markdown-reading-view, .markdown-preview-view, .markdown-source-view') || pop;
      this._habillerConteneur(cont, this._conteneurEstTache(cont, parCle), ctx);
    }
  }

  // Le conteneur ressemble-t-il à une note de tâche ? (utilisé quand on n'a
  // pas le chemin du fichier, p. ex. une fenêtre de survol.)
  _conteneurEstTache(el, parCle) {
    const rows = el.querySelectorAll('.metadata-property');
    if (!rows.length) return false;
    let n = 0;
    for (const row of rows) {
      const k = String(row.dataset.propertyKey || '').toLowerCase();
      if (k === 'type') {
        const v = row.querySelector('.metadata-property-value');
        const t = v ? String(v.textContent || '').trim().toLowerCase() : '';
        if (t === 'tache' || t === 'tâche') return true;
      }
      if (parCle.has(k)) { n += 1; if (n >= 2) return true; }
    }
    return false;
  }

  // Applique (ou retire) l'habillage tâche sur un conteneur : classes, tags de
  // concept sur les lignes de propriété, icônes, regroupement en zones.
  _habillerConteneur(contEl, estTache, ctx) {
    contEl.toggleClass('zfa-note-tache', estTache);
    contEl.toggleClass('zfa-note-tache-skin', estTache && ctx.skin);
    if (!estTache) return;
    for (const row of contEl.querySelectorAll('.metadata-property')) {
      let cle = String(row.dataset.propertyKey || '').toLowerCase();
      if (!ctx.parCle.has(cle)) {
        const kel = row.querySelector('.metadata-property-key-input, .metadata-property-key');
        const txt = kel ? String(kel.value || kel.textContent || '').trim().toLowerCase() : '';
        if (txt && ctx.parCle.has(txt)) cle = txt;
      }
      const con = ctx.parCle.get(cle);
      if (!con) { if (row.dataset.zfaConcept) delete row.dataset.zfaConcept; continue; }
      row.dataset.zfaConcept = con;
      const cleEl = row.querySelector('.metadata-property-key');
      if (cleEl) {
        if (ctx.masquer) cleEl.dataset.zfaLabel = this.libelleColonne(this.cleT(con));
        else if (cleEl.dataset.zfaLabel) delete cleEl.dataset.zfaLabel;
      }
      const icEl = row.querySelector('.metadata-property-icon');
      if (icEl && icEl.dataset.zfaIc !== con) {
        try { obsidian.setIcon(icEl, Ariane.iconeConcept(con)); } catch (e) { /* rien */ }
        icEl.dataset.zfaIc = con;
      }
    }
    if (ctx.skin) {
      for (const cont of contEl.querySelectorAll('.metadata-properties')) {
        try { this._grouperProprietes(cont, ctx.clesFamille); } catch (e) { /* rien */ }
      }
    }
  }

  // Range les lignes de propriétés en zones (via `order`) et insère un en-tête
  // par zone présente. `famille` en tête (distinct). Les champs apportés par la
  // famille en fin, dans un volet dédié.
  _grouperProprietes(cont, clesFamille) {
    const groupes = Ariane.GROUPES_TACHE;
    const NOM_FAMILLE = 'Propriétés de la famille';
    const rang = new Map();
    groupes.forEach((g, gi) => g.concepts.forEach((cpt, ci) => rang.set(cpt, (gi + 1) * 100 + ci)));
    const presents = new Set();
    let aFamille = false;
    for (const row of cont.querySelectorAll('.metadata-property')) {
      const cpt = row.dataset.zfaConcept || '';
      const cleBrute = String(row.dataset.propertyKey || '').toLowerCase();
      row.classList.toggle('zfa-note-tache-cle', cpt === 'famille');
      if (cpt === 'famille') { row.style.order = '0'; continue; }
      if (rang.has(cpt)) {
        row.style.order = String(rang.get(cpt));
        // L'heure est l'heure de l'échéance : on la rattache visuellement
        // juste sous elle, en ligne fine.
        row.classList.toggle('zfa-note-tache-sous', cpt === 'heure');
        const g = groupes.find((x) => x.concepts.includes(cpt));
        if (g) presents.add(g.id);
        continue;
      }
      const estFamille = ['source', 'livrable', 'fichier'].includes(cpt)
        || (clesFamille && clesFamille.has(cleBrute));
      if (estFamille) { row.style.order = '700'; row.dataset.zfaGroupe = 'famille'; aFamille = true; continue; }
      row.style.order = '950';
    }
    const attendus = [...groupes.filter((g) => presents.has(g.id)).map((g) => g.id)];
    if (aFamille) attendus.push('famille');
    const vus = new Set();
    for (const h of cont.querySelectorAll(':scope > .zfa-note-tache-groupe')) {
      if (!attendus.includes(h.dataset.zfaGroupe)) h.remove();
      else vus.add(h.dataset.zfaGroupe);
    }
    groupes.forEach((g, gi) => {
      if (!presents.has(g.id) || vus.has(g.id)) return;
      const h = cont.createDiv({ cls: 'zfa-note-tache-groupe', text: tr(g.nom) });
      h.dataset.zfaGroupe = g.id;
      h.style.order = String((gi + 1) * 100 - 1);
    });
    if (aFamille && !vus.has('famille')) {
      const h = cont.createDiv({ cls: 'zfa-note-tache-groupe', text: tr(NOM_FAMILLE) });
      h.dataset.zfaGroupe = 'famille';
      h.style.order = '699';
    }
  }

  // Feuille de style personnelle (réglage). Injectée / mise à jour dans <head>.
  appliquerCssPersonnalise() {
    let el = document.getElementById('zfa-css-perso');
    const css = this.settings.cssPersonnalise || '';
    if (!css.trim()) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('style');
      el.id = 'zfa-css-perso';
      document.head.appendChild(el);
      this.register(() => el && el.remove());
    }
    el.textContent = css;
  }

  // Les notes que Monsieur peut désigner comme livrable. On écarte ce qui est
  // matière documentaire plutôt que production : fiches Zotero, annotations,
  // notes-filles, références en attente, bibliographies, et les tâches elles-mêmes.
  notesPourChoix() {
    const s = this.settings;
    const exclus = [s.dossierAnnotations, s.dossierNotesLecture, s.dossierReferences,
                    s.dossierBibliographies, s.dossierZotero, this.dossierT]
      .map((d) => String(d || '').trim()).filter(Boolean);
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.basename.charAt(0) === '@') continue;
      if (exclus.some((d) => f.path.startsWith(d + '/'))) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      out.push({ nom: Ariane.libelleNote(fm, f.basename), cle: f.basename });
    }
    out.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return out;
  }

  // Écrit une note de tâche neuve et rend son chemin. La référence se calcule
  // sur les notes déjà présentes, ce qui garantit l'unicité sans compteur
  // conservé dans les réglages, lequel se désynchroniserait du coffre.
  async creerTache(champs) {
    const dossier = this.dossierT;
    await this.assurerDossier(dossier);
    const noms = this.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'))
      .map((f) => f.basename);
    let reference = Ariane.referenceTacheSuivante(noms, this.settings.refGabarit);
    while (this.app.vault.getAbstractFileByPath(dossier + '/' + reference + '.md')) {
      reference = Ariane.incrementerRef(reference);
    }
    const chemin = dossier + '/' + reference + '.md';
    const jour = new Date().toISOString().slice(0, 10);
    const cles = {};
    for (const con of Ariane.CONCEPTS_TACHE) cles[con] = this.cleT(con);
    await this.ecrire(chemin, Ariane.corpsNouvelleTache(Object.assign({}, champs, {
      aujourdhui: jour, cles,
      liste: (champs && champs.liste) || this.settings.listeRappelsDefaut,
    })));
    // ecrire() marque l'écriture : l'écoute metadataCache est muette → relancer
    // le push explicitement, pour qu'une tâche créée avec une échéance parte
    // vers Rappels sans attendre la relève périodique.
    this._relancerPushRappels(1500);
    return chemin;
  }

  //#endregion Ariane · tâches

  //#region Ariane · temps de travail
  // ── temps de travail ─────────────────────────────────────────────────────

  // Le compteur s'appuie sur la note active et sur l'activité du clavier et de
  // la souris. Il ne mesure donc pas la présence devant l'écran, mais le temps
  // de travail effectif, ce qui est plus honnête pour un journal de thèse.
  demarrerCompteurTemps() {
    if (!this.settings.tempsActif) return;

    this._tempsSecondes = new Map();   // chemin -> secondes non encore reportées
    this._tempsDerniereActivite = Date.now();
    this._tempsCheminCourant = '';
    this._tempsDernierJour = jourIsoDe(new Date());

    // Toute action de l'utilisateur repousse l'inactivité. Le passage en
    // capture évite qu'un panneau tiers n'intercepte l'événement avant nous.
    const marquer = () => { this._tempsDerniereActivite = Date.now(); };
    const surDocument = (doc) => {
      for (const ev of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) {
        this.registerDomEvent(doc, ev, marquer, { capture: true, passive: true });
      }
    };
    // Les fenêtres détachées déjà ouvertes au chargement doivent être écoutées
    // elles aussi : sans cela, taper dans l'une d'elles ne repoussait jamais
    // l'inactivité, et le compteur s'y arrêtait au bout du délai.
    const docsEcoutes = new WeakSet();
    const ecouter = (doc) => {
      if (!doc || docsEcoutes.has(doc)) return;
      docsEcoutes.add(doc);
      surDocument(doc);
    };
    ecouter(document);
    try {
      this.app.workspace.iterateAllLeaves((feuille) => {
        const c = feuille && feuille.view && feuille.view.containerEl;
        if (c && c.ownerDocument) ecouter(c.ownerDocument);
      });
    } catch (e) {
      console.warn('[Ariane] fenêtres non parcourues pour le compteur :', e);
    }
    this.registerEvent(this.app.workspace.on('window-open', (_w, win) => {
      if (win && win.document) ecouter(win.document);
    }));

    // Un battement court : la précision du compte vaut mieux qu'une économie
    // de quelques réveils, et le calcul se résume à une comparaison de dates.
    this.registerInterval(window.setInterval(() => this.battementTemps(), 5000));

    if (this.settings.tempsBarreEtat) {
      this._tempsBarre = this.addStatusBarItem();
      this._tempsBarre.addClass('zfa-temps-barre');
      this._tempsBarre.addEventListener('click', () => this.ouvrirBilanTemps());
    }

    // Report en propriété à intervalle régulier, et non à chaque seconde :
    // écrire dans le fichier agite la synchronisation et les sauvegardes.
    this.registerInterval(window.setInterval(
      () => this.reporterTemps(),
      Math.max(60, this.settings.tempsEcritureSec || 300) * 1000
    ));
  }

  // La note actuellement chronométrée, ou '' si aucune ne l'est.
  noteChronometrable() {
    const feuille = this.app.workspace.activeLeaf;
    const vue = feuille && feuille.view;
    if (!vue || vue.getViewType() !== 'markdown') return '';
    // Mode lecture : on ne chronomètre que ce qui est modifiable.
    if (typeof vue.getMode === 'function' && vue.getMode() !== 'source') return '';
    const f = vue.file;
    if (!f || f.extension !== 'md') return '';

    if (Ariane.sousDossier(f.path, String(this.settings.tempsDossiersExclus || '').split(/[\n,]+/))) {
      return '';
    }
    if (this.settings.tempsIgnorerVerrouillees !== false) {
      const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
      if (fm.locked === true) return '';
    }
    return f.path;
  }

  battementTemps() {
    if (!this.settings.tempsActif || !this._tempsSecondes) return;

    // Changement de jour : on clôt la veille avant de continuer.
    const jour = jourIsoDe(new Date());
    if (jour !== this._tempsDernierJour) {
      this.reporterTemps();
      const veille = this._tempsDernierJour;
      this._tempsDernierJour = jour;
      if (this.settings.tempsJournalAuto) {
        this.ecrireJournalTemps(veille).catch((e) => console.error('[Ariane] journal du temps', e));
      }
    }

    const chemin = this.noteChronometrable();
    const inactifDepuis = (Date.now() - this._tempsDerniereActivite) / 1000;
    const seuil = Math.max(10, this.settings.tempsInactiviteSec || 120);
    // Le focus doit être jugé sur la fenêtre qui porte la note. Interroger le
    // document principal revenait à déclarer en pause tout travail mené dans
    // une fenêtre détachée, sur un second écran par exemple.
    const enPause = !chemin || inactifDepuis > seuil || !this.fenetreNoteActive();

    if (!enPause) {
      this._tempsSecondes.set(chemin, (this._tempsSecondes.get(chemin) || 0) + 5);
      // Le relevé cumule des SECONDES : arrondir en minutes à chaque battement
      // accumulait une erreur de plusieurs pour cent sur une journée.
      const h = this.settings.tempsHistorique || (this.settings.tempsHistorique = {});
      const dujour = h[jour] || (h[jour] = {});
      dujour[chemin] = (dujour[chemin] || 0) + 5;
    }

    // Quitter une note reporte aussitôt son temps : on ne perd rien si
    // Obsidian se ferme brutalement.
    if (chemin !== this._tempsCheminCourant) {
      const precedent = this._tempsCheminCourant;
      this._tempsCheminCourant = chemin;
      if (precedent) this.reporterTemps(precedent);
    }

    this.rafraichirBarreTemps(chemin, enPause);
  }

  // La fenêtre portant la note active a-t-elle le focus ? On interroge son
  // propre document : chaque fenêtre détachée a le sien.
  fenetreNoteActive() {
    const feuille = this.app.workspace.activeLeaf;
    const c = feuille && feuille.view && feuille.view.containerEl;
    const doc = (c && c.ownerDocument) || document;
    try {
      return typeof doc.hasFocus === 'function' ? doc.hasFocus() : true;
    } catch (e) {
      return true;
    }
  }

  rafraichirBarreTemps(chemin, enPause) {
    if (!this._tempsBarre) return;
    if (!chemin) { this._tempsBarre.setText(''); return; }
    const totaux = this.settings.tempsTotalSecondes || {};
    const base = totaux[chemin] != null ? totaux[chemin] / 60 : this.tempsTotalDe(chemin);
    const total = base + (this._tempsSecondes.get(chemin) || 0) / 60;
    this._tempsBarre.setText((enPause ? '○ ' : '● ') + dureeLisible(total));
    this._tempsBarre.setAttr('aria-label',
      (enPause ? 'Compteur en pause — ' : 'Compteur actif — ') + chemin.split('/').pop());
  }

  // Total déjà inscrit dans la note, en minutes.
  tempsTotalDe(chemin) {
    const f = this.app.vault.getAbstractFileByPath(chemin);
    if (!(f instanceof obsidian.TFile)) return 0;
    const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
    return Number(fm[this.settings.tempsPropriete || 'temps-passe']) || 0;
  }

  // Reporte en propriété les secondes accumulées. Sans argument, pour toutes
  // les notes en attente.
  async reporterTemps(cheminVoulu) {
    if (!this._tempsSecondes || !this._tempsSecondes.size) return;
    const prop = this.settings.tempsPropriete || 'temps-passe';
    const chemins = cheminVoulu ? [cheminVoulu] : Array.from(this._tempsSecondes.keys());

    const totaux = this.settings.tempsTotalSecondes || (this.settings.tempsTotalSecondes = {});

    for (const chemin of chemins) {
      const secondes = this._tempsSecondes.get(chemin) || 0;
      if (secondes < 30) continue; // sous la demi-minute, on attend
      const f = this.app.vault.getAbstractFileByPath(chemin);
      if (!(f instanceof obsidian.TFile)) { this._tempsSecondes.delete(chemin); continue; }
      try {
        // Amorçage : une note déjà porteuse d'un total le conserve.
        if (totaux[chemin] == null) totaux[chemin] = Math.round(this.tempsTotalDe(chemin) * 60);
        totaux[chemin] += secondes;
        const minutes = Math.round(totaux[chemin] / 60);
        this.marquerEcriture(f.path);
        await this.app.fileManager.processFrontMatter(f, (fm) => { fm[prop] = minutes; });
        this._tempsSecondes.delete(chemin);
      } catch (e) {
        console.error('[Ariane] report du temps impossible :', chemin, e);
      }
    }
    await this.saveSettings();
  }

  /* ------------------------- Journal quotidien --------------------------- */

  async ecrireJournalTemps(jour) {
    const j = jour || jourIsoDe(new Date());
    await this.reporterTemps();
    const releve = (this.settings.tempsHistorique || {})[j] || {};
    const lignes = Object.entries(releve)
      .map(([chemin, secondes]) => [chemin, secondes / 60])
      .filter(([, m]) => m >= 1)
      .sort((a, b) => b[1] - a[1]);

    if (!lignes.length) {
      new obsidian.Notice(tr('Aucun temps enregistré pour le ') + j + '.');
      return '';
    }

    const dossier = (this.settings.tempsDossierJournal || '9 - Journal du temps').replace(/\/+$/, '');
    if (!this.app.vault.getAbstractFileByPath(dossier)) {
      try { await this.app.vault.createFolder(dossier); } catch (e) { /* déjà là */ }
    }

    const total = lignes.reduce((s, [, m]) => s + m, 0);
    const out = ['---', 'type: journal-temps', 'date: ' + j,
      'total-minutes: ' + Math.round(total), '---',
      '# Temps de travail du ' + j, '',
      '**Total : ' + dureeLisible(total) + '** sur ' + lignes.length + ' note(s).', '',
      '| Note | Temps |', '| --- | --- |'];
    for (const [chemin, m] of lignes) {
      const nom = chemin.replace(/\.md$/, '');
      out.push('| [[' + nom + ']] | ' + dureeLisible(m) + ' |');
    }
    out.push('');

    const chemin = dossier + '/' + j + '.md';
    const existant = this.app.vault.getAbstractFileByPath(chemin);
    if (existant instanceof obsidian.TFile) {
      this.marquerEcriture(chemin);
      await this.app.vault.modify(existant, out.join('\n'));
    } else {
      await this.ecrire(chemin, out.join('\n'));
    }
    return chemin;
  }

  async ouvrirBilanTemps() {
    const chemin = await this.ecrireJournalTemps();
    if (!chemin) return;
    await this.app.workspace.openLinkText(chemin.replace(/\.md$/, ''), '', false);
  }

  // Écarte les relevés trop anciens, pour que le fichier de réglages ne gonfle
  // pas indéfiniment.
  elaguerHistoriqueTemps() {
    const h = this.settings.tempsHistorique || {};
    const garder = Math.max(7, this.settings.tempsRetenirJours || 120);
    const limite = jourIsoDe(new Date(Date.now() - garder * 24 * 3600 * 1000));
    let retires = 0;
    for (const j of Object.keys(h)) {
      if (j < limite) { delete h[j]; retires++; }
    }
    return retires;
  }

  //#endregion Ariane · temps de travail
};
