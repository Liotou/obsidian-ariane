//#region 17 · Vue Calendrier
// ═══════════════════════════════════════════════════════════════════════════
//  17 · VUE CALENDRIER
//  Grille mois (ruban à trois volets) et grille semaine (bande de 43 jours à
//  défilement libre), créneaux horaires déplaçables, jalons et tâches d'un
//  jour dans le bandeau, agenda Apple affiché en fond. MoteurCalendrier et la
//  fabrique de la vue Bases « ariane-calendrier ».
// ═══════════════════════════════════════════════════════════════════════════

// Durée pendant laquelle un créneau que l'on vient de déplacer ou de
// redimensionner garde sa géométrie ANTICIPÉE à chaque redessin, quoi que dise
// encore la base. Une écriture de créneau touche deux fois la note (entête, puis
// bloc « Sessions ») ; Bases émet alors une rafale de onDataUpdated, dont
// certains tombent APRÈS la fenêtre de coalescence, pendant que le cache de
// métadonnées est un bref instant en retard. Sans ce verrou, le bloc repassait à
// son ancienne place pendant quelques images avant de se recaler.
const MS_PIN_CRENEAU = 1800;

class MoteurCalendrier extends MoteurVue {
  //#region Calendrier · cycle de vie & écritures annulables
  constructor(greffon, racine, contexte) {
    super(greffon, racine, contexte);
    // La semaine (ou le mois) consultée et le défilement des heures vivent
    // dans une mémoire du greffon, par vue : voir _memoire. Ici, on ne pose
    // aujourd'hui que si cette vue n'a encore rien retenu.
    this._cleMemoire = (contexte && typeof contexte.cle === 'function' && contexte.cle()) || '';
    if (!this._memoire().ancre) this._ancre = new Date().toISOString().slice(0, 10);
    this._fond = [];
    this._activite = new Map();   // jour ISO → créneaux réels (ActivityWatch)
    racine.addClass('zfa-cal');
    racine.tabIndex = -1;
    this._surTouche = (e) => {
      const t = e.target;
      if (t && (t.matches && (t.matches('input, textarea, select') || t.isContentEditable))) return;
      if (_toucheRetablir(e)) { e.preventDefault(); e.stopPropagation(); refaireDernier(this); return; }
      if (_toucheAnnuler(e)) { e.preventDefault(); e.stopPropagation(); annulerDernier(this); }
    };
    racine.addEventListener('keydown', this._surTouche);
    // Survoler un créneau met en avant tous les créneaux visibles de la même
    // tâche, comme s'ils étaient survolés ensemble. Délégation sur la racine :
    // elle survit aux redessins, qui reconstruisent les cartes.
    this._surSurvol = (e) => {
      const c = e.target.closest && e.target.closest('[data-ref][data-brut]');
      const ref = c ? c.dataset.ref : '';
      if (ref === this._refSurvolee) return;
      this._marquerSoeurs('');
      if (ref) this._marquerSoeurs(ref);
    };
    this._surSortie = (e) => {
      const v = e.relatedTarget;
      const c = v && v.closest ? v.closest('[data-ref][data-brut]') : null;
      if (!c || c.dataset.ref !== this._refSurvolee) this._marquerSoeurs('');
    };
    racine.addEventListener('mouseover', this._surSurvol);
    racine.addEventListener('mouseout', this._surSortie);
    (greffon._moteursCalendrier || (greffon._moteursCalendrier = new Set())).add(this);
    // La barre « maintenant » est posée au rendu : sans ce battement elle
    // resterait figée tant que la vue reste ouverte sans interaction.
    this._horloge = this._win().setInterval(() => this._tickMaintenant(), 30000);
  }
  // Mémoire de la vue, hors du moteur. Obsidian recrée la vue Bases, et donc
  // ce moteur, dès que le fichier .base change ; or plusieurs gestes du
  // calendrier y écrivent (réafficher la famille d'une tâche qu'on vient de
  // poser, le zoom, les calendriers cochés). Rangées dans le moteur, la
  // période consultée et la position de défilement repartaient alors de zéro :
  // chaque modification dans le passé ramenait sur la semaine du jour. Clé :
  // le fichier .base et le nom de la vue ; la mémoire dure le temps de la
  // session, et une réouverture d'Obsidian repart d'aujourd'hui.
  _memoire() {
    const g = this.greffon;
    if (!g) return this._memoireLocale || (this._memoireLocale = {});
    const toutes = g._memoireCalendriers || (g._memoireCalendriers = new Map());
    let m = toutes.get(this._cleMemoire || '');
    if (!m) { m = {}; toutes.set(this._cleMemoire || '', m); }
    return m;
  }

  get _ancre() { return this._memoire().ancre; }
  set _ancre(v) { this._memoire().ancre = v; }
  get _semScrollTop() { return this._memoire().defilement; }
  set _semScrollTop(v) { this._memoire().defilement = v; }

  // Écriture d'un créneau depuis un geste, avec annulation. `chg` = { avant,
  // debut, fin } comme greffon.majCreneau. L'annulation reconstruit l'état
  // inverse (déplacement/redim → remettre l'ancien ; création → supprimer ;
  // suppression → recréer).
  async _majCreneauU(ref, chg) {
    const av = chg.avant || '';
    const nv = (chg.debut && chg.fin) ? Ariane.formatCreneau(chg.debut, chg.fin) : '';
    const anc = av ? Ariane.parseCreneau(av) : null;
    const ok = await this.greffon.majCreneau(ref, chg);
    // majCreneau rend false quand la réf ne retombe sur aucune note de tâche
    // (index pas encore à jour, ou glissé cross-fenêtre dont on n'a pu tirer
    // qu'un identifiant approché) : sans ce garde-fou l'échec était muet.
    if (ok === false) {
      new obsidian.Notice(tr('Créneau : tâche « {r} » introuvable.').replace('{r}', String(ref)));
      return;
    }
    // Création d'un créneau : la famille de la tâche redevient affichée
    // (« recoche » de son calendrier), sinon la carte posée resterait cachée.
    if (!av) this._montrerFamilleDe(ref);
    if (this.racine && this.racine.focus) this.racine.focus({ preventScroll: true });
    poserAnnulation(this, async () => {
      await this.greffon.majCreneau(ref, {
        avant: nv, debut: anc ? anc.debut : '', fin: anc ? anc.fin : '',
      });
      this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
    }, async () => {
      await this.greffon.majCreneau(ref, chg);
      this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
    });
  }

  // Idem pour un geste qui écrit début/échéance (barres « jour » de la vue mois).
  async _ecrireDatesU(changements) {
    const avant = (changements || []).map((c) => {
      const t = (this._taches || []).find((x) => x.ref === c.ref) || {};
      return { ref: c.ref, debut: t.debut || '', echeance: t.echeance || '' };
    });
    await this.greffon.ecrireDatesTaches(changements);
    if (this.racine && this.racine.focus) this.racine.focus({ preventScroll: true });
    poserAnnulation(this, async () => {
      await this.greffon.ecrireDatesTaches(avant);
      const cible = avant[0] ? { cible: [avant[0].debut, avant[0].echeance, []] } : { cible: [undefined, undefined, null] };
      this._apres(avant[0] ? avant[0].ref : (changements[0] && changements[0].ref), cible);
    }, async () => {
      await this.greffon.ecrireDatesTaches(changements);
      const cible = changements[0] ? { cible: [changements[0].debut, changements[0].echeance, []] } : { cible: [undefined, undefined, null] };
      this._apres(changements[0] ? changements[0].ref : null, cible);
    });
  }

  lire(cle) {
    const v = this.ctx.lire ? this.ctx.lire(cle) : undefined;
    return v === undefined || v === null ? DEFAUTS_CALENDRIER[cle] : v;
  }
  get mode() { return this.lire('calMode') === 'semaine' ? 'semaine' : 'mois'; }

  // Familles décochées dans le menu « Calendriers à afficher » (calendriers de
  // créneaux) : ensemble des ids masqués.
  _masqueFamilles() {
    const v = this.lire('calCalendriersMasques');
    return new Set(Array.isArray(v) ? v.map(String) : []);
  }

  // Recoche le calendrier d'une tâche : retire sa famille du masque. Sans effet
  // (et sans écriture) si elle y figure déjà.
  _montrerFamilleDe(ref) {
    const t = (this._tachesBrutes || this._taches || []).find((x) => x.ref === ref);
    const fam = (t && t.famille) || '';
    const masque = this._masqueFamilles();
    if (!masque.has(fam)) return;
    masque.delete(fam);
    this.ctx.ecrire('calCalendriersMasques', [...masque]);
  }

  detruire() {
    this._detruit = true;
    this._enRecalage = false;
    this._fermerLignee();
    clearTimeout(this._wheelMinuterie);
    clearTimeout(this._calageMinuterie);
    clearTimeout(this._semScrollMinuterie);
    clearTimeout(this._figeMinuterie);
    if (this._horloge) { this._win().clearInterval(this._horloge); this._horloge = null; }
    this._coalesce = false;
    this._redessinDiffere = false;
    this._gesteCal = false;
    if (this._pose) this._pose.finir();
    this._fermerJourMois();
    for (const o of (this._observateursMois || [])) { try { o.disconnect(); } catch (e) { /* rien */ } }
    this._observateursMois = [];
    if (this._surTouche) this.racine.removeEventListener('keydown', this._surTouche);
    if (this._surSurvol) this.racine.removeEventListener('mouseover', this._surSurvol);
    if (this._surSortie) this.racine.removeEventListener('mouseout', this._surSortie);
    if (this.greffon._moteursCalendrier) this.greffon._moteursCalendrier.delete(this);
    this.racine.empty();
  }

  // Battement de la barre « maintenant » (vue semaine) : on la reglisse sans
  // rien reconstruire. Si le jour a changé depuis le dernier rendu, la colonne
  // du jour et le surlignage « aujourd'hui » du mois sont périmés : là, on
  // redessine. Un geste en cours (déplacement / redimensionnement) est laissé
  // tranquille.
  _tickMaintenant() {
    if (this._detruit || this._gesteCal) return;
    const auj = new Date().toISOString().slice(0, 10);
    if (auj !== this._jourRendu) { this.dessiner(); return; }
    if (this.mode !== 'semaine') return;
    const barres = this.racine.querySelectorAll('.zfa-cal-now');
    if (!barres.length) return;
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    const pxh = this._pxHeure || 42;
    const hDeb = this._hDeb || 0;
    barres.forEach((nl) => { nl.style.top = ((nowH - hDeb) * pxh) + 'px'; });
  }

  // Fenêtre large autour de la période visible pour l'agenda de fond.
  //#endregion Calendrier · cycle de vie & écritures annulables

  //#region Calendrier · agenda Apple en fond
  _bornesFond() {
    if (this.mode === 'semaine') {
      return { debut: Ariane.decalerJour(this._ancre, -21),
               fin: Ariane.decalerJour(this._ancre, 28) };
    }
    const g = Ariane.grilleMois(this._ancre);
    const sem = g.semaines;
    return { debut: sem[0][0], fin: sem[sem.length - 1][6] };
  }

  // Charge l'agenda de fond une fois par (mode, fenêtre) ; au retour, redessine.
  _chargerFond() {
    if (!this.greffon || !this.greffon.evenementsFond) { this._fond = this._fond || []; return; }
    const b = this._bornesFond();
    const cle = this.mode + '|' + b.debut + '|' + b.fin;
    if (cle === this._fondCle) return;
    this._fondCle = cle;
    this.greffon.evenementsFond(b.debut, b.fin).then((data) => {
      if (this._detruit || cle !== this._fondCle) return;
      const nv = data || [];
      const avant = this._fond || [];
      this._fond = nv;
      // Jalons liés à un événement : réaligner sur l'événement fraîchement lu
      // (le redessin suit, déclenché par les écritures ou par la ligne ci-dessous).
      this._reconcilierJalonsEvenements().catch(() => { /* rien */ });
      if (nv.length || avant.length) this.dessiner();
    }).catch(() => { /* macOS indisponible */ });
  }

  // Événements de fond d'un jour ISO : horaires (démarrant ce jour) et journée
  // entière, prêts à fusionner avec les créneaux.
  _fondDuJour(jourISO) {
    const horaires = [];
    const jour = [];
    for (const e of (this._fond || [])) {
      if (e.allDay) {
        if (e.debut.slice(0, 10) <= jourISO && jourISO < (e.fin || e.debut).slice(0, 10)) jour.push(e);
        else if (e.debut.slice(0, 10) === jourISO) jour.push(e);
      } else if (e.debut.slice(0, 10) === jourISO) {
        horaires.push(e);
      }
    }
    return { horaires, jour };
  }

  _ouvrirEvenement(id) {
    if (!id) return;
    const url = 'ical://ekevent/' + encodeURIComponent(id) + '?method=show&options=more';
    try {
      const shell = require('electron').shell;
      if (shell && shell.openExternal) { shell.openExternal(url); return; }
    } catch (e) { /* pas d'accès electron */ }
    try { window.open(url); } catch (e2) { /* schéma indisponible */ }
  }

  // Note d'un événement Apple : celle qui existe s'ouvre, sinon elle se crée
  // puis s'ouvre. Un seul geste, qu'on soit passé là pour la première fois ou
  // pour la dixième.
  async _noteEvenement(e) {
    const existante = e && e.id ? this.greffon.noteDeEvenement(e.id) : null;
    if (existante) { await this.app.workspace.getLeaf(false).openFile(existante); return; }
    const jour = String((e && e.debut) || '').slice(0, 10);
    const nom = String((e && e.titre) || '').trim() || (tr('Événement ') + (jour || ''));
    const chemin = await this.greffon.creerNoteEvenement({
      intitule: nom, date: jour, evenementId: (e && e.id) || '' });
    const f = this.app.vault.getAbstractFileByPath(chemin);
    if (f) await this.app.workspace.getLeaf(false).openFile(f);
  }

  // Clic (note de l'événement) + clic droit (menu) sur un bloc d'événement
  // Apple. Posé par les trois endroits qui rendent un événement (vue semaine et
  // les deux formats de la vue mois). Calendar.app est passé au clic droit : le
  // geste courant, c'est la note, pas le retour vers l'application d'origine.
  _brancherEvenement(el, e) {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._noteEvenement(e).catch((err) => {
        new obsidian.Notice(tr('Note d’événement impossible : ') + (err && err.message ? err.message : err));
      });
    });
    el.addEventListener('contextmenu', (ev) => this.menuEvenement(ev, e));
  }

  // Menu contextuel d'un événement Apple : l'ouvrir dans Calendrier, ou en
  // dériver un jalon (même titre, premier jour de l'événement) lié dynamiquement
  // à l'événement d'origine (`Événement ID` dans la note).
  menuEvenement(ev, e) {
    ev.preventDefault(); ev.stopPropagation();
    const jour = String(e.debut || '').slice(0, 10);
    const m = new obsidian.Menu();
    if (e.id) {
      m.addItem((i) => i.setTitle(tr('Ouvrir dans Calendrier')).setIcon('external-link')
        .onClick(() => this._ouvrirEvenement(e.id)));
    }
    // Ce qui existe déjà s'ouvre ; seul ce qui manque se crée. Sans cela, le
    // menu proposait de recréer une note ou un jalon à chaque clic droit, et
    // le coffre se remplissait de doublons.
    const jalonExistant = e.id ? this.greffon.jalonDeEvenement(e.id) : null;
    const noteExistante = e.id ? this.greffon.noteDeEvenement(e.id) : null;
    if (jalonExistant) {
      m.addItem((i) => i.setTitle(tr('Ouvrir le jalon de cet événement')).setIcon('diamond')
        .onClick(() => this.ouvrir(jalonExistant.ref, false)));
    } else {
    m.addItem((i) => i.setTitle(tr('Créer un jalon à partir de cet événement')).setIcon('diamond')
      .onClick(async () => {
        if (!jour) { new obsidian.Notice(tr('Événement sans date exploitable.')); return; }
        const nom = String(e.titre || '').trim() || (tr('Jalon ') + jour);
        const chemin = await this.greffon.creerTache({
          jalon: true, famille: 'action', debut: jour, echeance: jour, intitule: nom });
        if (!chemin) return;
        const ref = chemin.split('/').pop().replace(/\.md$/, '');
        if (e.id) await this.greffon.majTache(ref, { 'Événement ID': e.id });
        this.dessiner();
        this.ouvrir(ref, false);
      }));
    }
    m.addItem((i) => i
      .setTitle(noteExistante ? tr('Ouvrir la note de cet événement')
                              : tr('Créer une note associée à cet événement'))
      .setIcon(noteExistante ? 'file-text' : 'file-plus')
      .onClick(() => { this._noteEvenement(e).catch(() => { /* rien */ }); }));
    m.showAtMouseEvent(ev);
  }

  // Aligne les jalons liés à un événement Apple (clé `Événement ID`) sur cet
  // événement : premier jour et titre. Tourne quand l'agenda de fond vient
  // d'être (re)chargé ; n'écrit que sur un vrai écart, et ne supprime jamais un
  // jalon dont l'événement est absent (il peut simplement être hors fenêtre).
  async _reconcilierJalonsEvenements() {
    const parId = new Map();
    for (const e of (this._fond || [])) if (e && e.id) parId.set(String(e.id), e);
    if (!parId.size || !this.greffon.tachesPourGantt) return;
    for (const t of this.greffon.tachesPourGantt()) {
      if (!t.jalon || !t.fichier) continue;
      const fm = (this.app.metadataCache.getFileCache(t.fichier) || {}).frontmatter || {};
      const eid = String(fm['Événement ID'] || '').trim();
      if (!eid) continue;
      const e = parId.get(eid);
      if (!e) continue;
      const jour = String(e.debut || '').slice(0, 10);
      const titre = String(e.titre || '').trim();
      if (jour && (t.echeance || '') !== jour) {
        await this.greffon.majTache(t.ref, { debut: jour, echeance: jour });
      }
      if (titre && (t.intitule || '') !== titre) {
        await this.greffon.renommerTitreTache(t.ref, titre);
      }
    }
  }

  // Carte d'un événement Apple réel (agenda de fond) : barre verticale gauche à
  // la couleur du calendrier, pas de coche, non déplaçable, clic → Calendar.app.
  _rendreEvenement(hote, e, maxLignes) {
    const el = hote.createDiv({ cls: 'zfa-cal-evt' });
    if (e.couleur) el.style.setProperty('--zfa-cal-coul', e.couleur);
    if (!e.allDay && e.debut && e.debut.length > 15) {
      el.createDiv({ cls: 'zfa-cal-evt-h', text: e.debut.slice(11, 16) });
    }
    const tt = el.createDiv({ cls: 'zfa-cal-evt-t', text: e.titre || tr('(sans titre)') });
    if (maxLignes && maxLignes >= 2) tt.style.webkitLineClamp = String(Math.min(maxLignes, 3));
    el.title = (e.titre || '') + (e.calendrier ? ' · ' + e.calendrier : '');
    this._brancherEvenement(el, e);
    return el;
  }

  //#endregion Calendrier · agenda Apple en fond

  //#region Calendrier · activité réelle
  // Créneaux réels lus par le greffon dans ActivityWatch : une mince colonne
  // à gauche de chaque jour de la vue semaine, en lecture seule.
  _activiteVisible() {
    return this.mode === 'semaine' && !!(this.greffon && this.greffon.activiteDisponible
      && this.greffon.activiteDisponible()) && this.lire('calActiviteReelle') !== false;
  }

  // Jours à lire, les plus proches de l'ancre d'abord : la semaine affichée
  // arrive vite, la marge de défilement suit. Rien après aujourd'hui.
  _joursActivite() {
    const auj = jourIsoDe(new Date());
    const proches = [];
    const reste = [];
    for (let i = -18; i <= 18; i++) {
      const j = Ariane.decalerJour(this._ancre, i);
      if (!j || j > auj) continue;
      (i >= -1 && i <= 7 ? proches : reste).push(j);
    }
    reste.sort((a, b) => Math.abs(Ariane.ecartJours(this._ancre, a)) - Math.abs(Ariane.ecartJours(this._ancre, b)));
    return [proches, reste];
  }

  // Charge les créneaux réels une fois par (fenêtre, tranche de deux minutes) ;
  // ne redessine que si quelque chose a changé.
  _chargerActivite() {
    if (!this._activiteVisible()) return;
    const vagues = this._joursActivite();
    const tous = vagues[0].concat(vagues[1]);
    const cle = tous.slice().sort().join(',') + '|' + Math.floor(Date.now() / 120000);
    if (cle === this._activiteCle) return;
    this._activiteCle = cle;
    (async () => {
      for (const jours of vagues) {
        if (!jours.length) continue;
        const m = await this.greffon.activitePlage(jours);
        if (this._detruit || cle !== this._activiteCle) return;
        let change = false;
        for (const [j, blocs] of m) {
          if (JSON.stringify(this._activite.get(j) || []) !== JSON.stringify(blocs)) change = true;
          this._activite.set(j, blocs);
        }
        // Un bloc tenu à la main ne doit pas voir le DOM se reconstruire sous
        // lui : le dessin attend alors la fin du geste.
        if (change) { if (this._gesteCal) this._coalesceRedessin(200); else this.dessiner(); }
      }
    })().catch((e) => console.warn('[Ariane] activité réelle :', e));
  }

  // Colonne des créneaux réels d'un jour. `mn` convertit « …THH:MM » en
  // minutes depuis minuit.
  _rendreActivite(col, jour, hDeb, PXH, mn) {
    for (const b of (this._activite.get(jour) || [])) {
      const d = mn(b.debut);
      const f = b.fin.slice(0, 10) === jour ? mn(b.fin) : 24 * 60;
      if (f <= d) continue;
      const el = col.createDiv({ cls: 'zfa-cal-reel' });
      el.style.top = ((d / 60 - hDeb) * PXH) + 'px';
      el.style.height = Math.max(3, ((f - d) / 60) * PXH) + 'px';
      el.style.setProperty('--zfa-cal-coul', b.couleur);
      // Infobulle d'Obsidian : l'attribut title du navigateur n'apparaît pas
      // dans la grille (seul le curseur changeait).
      const bulle = Ariane.infobulleActivite(b);
      if (obsidian.setTooltip) obsidian.setTooltip(el, bulle, { placement: 'right', classes: ['zfa-bulle-lignes'] });
      else el.setAttribute('aria-label', bulle);
      if (b.ia && b.ia.personnel) el.addClass('est-personnel');
      if (b.ia) el.addClass('est-resume');
      // La colonne réagit au clic (sélection, création) : la piste, non.
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('dblclick', (e) => e.stopPropagation());
      // Un clic ouvre la fiche du créneau : contenu, résumé, et de quoi le
      // rattacher à une tâche.
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        new ModaleActiviteReelle(this.greffon, { jour, bloc: b,
          surRattacher: () => this._rattacherActivite(jour, b) }).open();
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        const m = new obsidian.Menu();
        m.addItem((i) => i.setTitle(b.ia ? tr('Résumer à nouveau ce créneau (IA)') : tr('Résumer ce créneau (IA)'))
          .setIcon('sparkles').onClick(() => this.greffon.resumerActivite(jour, { cle: b.cle })));
        m.addItem((i) => i.setTitle(tr('Résumer la journée (IA)')).setIcon('calendar-check')
          .onClick(() => this.greffon.resumerActivite(jour)));
        m.addItem((i) => i.setTitle(tr('Rattacher à une tâche…')).setIcon('link')
          .onClick(() => this._rattacherActivite(jour, b)));
        if (b.ia) {
          m.addItem((i) => i.setTitle(tr('Oublier ce résumé')).setIcon('eraser')
            .onClick(() => this.greffon.oublierResumesActivite(b.cle)));
        }
        m.showAtMouseEvent(e);
      });
    }
  }

  // Le temps réel d'un créneau devient un créneau de tâche, aux mêmes bornes :
  // on choisit la tâche comme pour un créneau tracé à la main.
  _rattacherActivite(jour, b) {
    const ecrire = async (ref) => {
      await this._majCreneauU(ref, { avant: '', debut: b.debut, fin: b.fin });
      this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
    };
    const echec = (err) => new obsidian.Notice(tr('Créneau non écrit : ') + (err && err.message ? err.message : err));
    const jl = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const horaire = jl.charAt(0).toUpperCase() + jl.slice(1) + ' · ' + b.debut.slice(11, 16) + ' → ' + b.fin.slice(11, 16)
      + (b.ia && b.ia.resume ? ' · ' + b.ia.resume : '');
    const taches = this._tachesBrutes || this._taches
      || (this.greffon.tachesPourGantt ? this.greffon.tachesPourGantt() : []);
    new ModaleTacheDuCreneau(this.app, this.greffon, {
      taches, jour, horaire,
      surChoix: (ref) => { ecrire(ref).catch(echec); },
      surAbandon: () => {},
      surNouvelle: (texte) => {
        new ModaleTache(this.app, this.greffon, {
          defauts: { intitule: texte || (b.ia && b.ia.resume) || '' },
          apres: (ref) => { ecrire(ref).catch(echec); },
        }).open();
      },
    }).open();
  }

  //#endregion Calendrier · activité réelle

  //#region Calendrier · dessin & barre d'outils
  dessiner() {
    // Pendant la retombée d'un geste (écriture d'un créneau), les demandes de
    // redessin sont mémorisées au lieu d'être exécutées : voir _coalesceRedessin.
    if (this._coalesce) { this._redessinDiffere = true; return; }
    try { this.dessinerVraiment(); } catch (e) {
      console.error('[Ariane] calendrier :', e);
      this.racine.empty();
      this.racine.createDiv({ cls: 'zfa-refs-vide',
        text: tr('Le calendrier n’a pas pu se dessiner : ') + (e && e.message ? e.message : e) });
    }
  }

  dessinerVraiment() {
    if (this._detruit) return;
    // Une bulle « +N » ouverte montrerait un contenu périmé après redessin.
    this._fermerJourMois();
    for (const o of (this._observateursMois || [])) { try { o.disconnect(); } catch (e) { /* rien */ } }
    this._observateursMois = [];
    this._jourRendu = new Date().toISOString().slice(0, 10);
    this._chargerFond();
    this._chargerActivite();
    if (this.greffon && this.greffon._relancerReleveAgenda) this.greffon._relancerReleveAgenda(1500);
    const c = this.racine;
    c.empty();
    this._taches = (this.ctx.taches && this.ctx.taches()) || [];
    this._colonnes = (this.ctx.colonnes && this.ctx.colonnes()) || [];
    // Masque des familles décochées : filtre du SEUL affichage. La liste brute
    // reste sous la main (menu « Calendriers », recoche à la création).
    this._tachesBrutes = this._taches;
    const masque = this._masqueFamilles();
    if (masque.size) this._taches = this._taches.filter((t) => !masque.has(t.famille || ''));
    // Hiérarchie du coffre (boutons de lignée sur les créneaux, panneaux) :
    // calculée une fois par dessin sur la liste complète.
    try { this._hier = Ariane.hierarchiesTaches(this.greffon.tachesPourGantt()); }
    catch (e) { this._hier = { parRef: new Map(), meres: new Map(), filles: new Map() }; }
    const tn = this.ctx.triNatif && this.ctx.triNatif();
    if (tn && tn.preparer) { try { tn.preparer(this._taches); } catch (e) { /* tri optionnel */ } }
    if (this._enAttente && this._enAttente.size) {
      const maintenant = Date.now();
      const dessinees = new Set((this._tachesBrutes || this._taches).map((x) => x.ref));
      for (const t of this._taches) {
        const p = this._enAttente.get(t.ref);
        if (!p) continue;
        const age = maintenant - (p._t0 || 0);
        // Comparaison SÉLECTIVE : on ne confronte à la base que les champs
        // réellement anticipés. Un créneau posé sur une tâche datée garde son
        // échéance — la comparer ici empêchait l'entrée de retomber (fuite).
        const memeCr = p.creneaux === undefined
          || JSON.stringify((t.creneaux || []).slice().sort())
             === JSON.stringify((p.creneaux || []).slice().sort());
        const memeDeb = p.debut === undefined || (t.debut || '') === (p.debut || '');
        const memeEch = p.echeance === undefined || (t.echeance || '') === (p.echeance || '');
        const rien = p.creneaux === undefined && p.debut === undefined && p.echeance === undefined;
        const aJour = memeCr && memeDeb && memeEch;
        // On lâche l'anticipation quand : rien à anticiper ; ou la base a
        // rattrapé ET le geste est retombé depuis assez longtemps pour qu'aucun
        // onDataUpdated en retard ne puisse plus repeindre l'ancienne géométrie ;
        // ou, garde-fou anti-fantôme, l'entrée traîne depuis bien trop longtemps
        // (écriture qui a échoué).
        if (rien || (aJour && age > MS_PIN_CRENEAU) || age > MS_PIN_CRENEAU * 4) {
          this._enAttente.delete(t.ref);
          continue;
        }
        // Dans la fenêtre : on impose la géométrie anticipée à CHAQUE redessin,
        // même si la base semble déjà d'accord — c'est ce qui neutralise le
        // redessin tardif nourri d'un cache de métadonnées un instant périmé.
        if (p.creneaux !== undefined) t.creneaux = p.creneaux;
        if (p.debut !== undefined) t.debut = p.debut;
        if (p.echeance !== undefined) t.echeance = p.echeance;
      }
      for (const ref of [...this._enAttente.keys()]) {
        if (dessinees.has(ref)) continue;
        const p = this._enAttente.get(ref);
        if (maintenant - (p._t0 || 0) > MS_PIN_CRENEAU) this._enAttente.delete(ref);
      }
    }
    this.dessinerBarreOutils(c);
    this._ruban = null;
    if (this.mode === 'semaine') {
      // Une seule grille : bande de 21 jours à défilement natif horizontal (au
      // jour près) et vertical (les heures). Pas de ruban.
      const grille = c.createDiv({ cls: 'zfa-cal-grille zfa-cal-semaine' });
      this.dessinerSemaine(grille);
      return;
    }
    // Vue mois : ruban à 3 grilles qui cale au mois. Le translateX porte sur la
    // piste (300 %), PAS sur le cadre qui rogne — un translateX en % se résout
    // sur la propre largeur de l'élément.
    const cadre = c.createDiv({ cls: 'zfa-cal-cadre' });
    const ruban = cadre.createDiv({ cls: 'zfa-cal-ruban' });
    this._cadre = cadre;
    this._ruban = ruban;
    this._decalGeste = 0;
    const grilles = {};
    for (const sens of [-1, 1, 0]) {
      // _doc() et non `document` : dans un volet détaché, la grille doit naître
      // dans le document de SA fenêtre, sinon on greffe un nœud étranger.
      const gg = this._doc().createElement('div');
      gg.className = 'zfa-cal-grille zfa-cal-mois';
      gg.dataset.sens = String(sens);
      this._rendreGrille(gg, Ariane.ancreCarrousel(this._ancre, this.mode, sens));
      grilles[sens] = gg;
    }
    ruban.appendChild(grilles[-1]);
    ruban.appendChild(grilles[0]);
    ruban.appendChild(grilles[1]);
    ruban.style.transform = 'translateX(calc(-100% / 3))';
    this._brancherCarrousel(cadre, ruban);
  }

  _rendreGrille(hote, ancre) {
    const prev = this._ancre;
    this._ancre = ancre;
    try {
      if (this.mode === 'semaine') this.dessinerSemaine(hote);
      else this.dessinerMois(hote);
    } finally { this._ancre = prev; }
  }

  dessinerBarreOutils(c) {
    const b = c.createDiv({ cls: 'zfa-cal-barre' });
    const nav = (sens) => this.naviguer(sens); // Task 6 fournit naviguer(); ici : voir Step 2

    const gauche = b.createDiv({ cls: 'zfa-cal-barre-gauche' });
    const bPrec = gauche.createEl('button', { cls: 'zfa-cal-nav', attr: { 'aria-label': tr('Précédent') } });
    obsidian.setIcon(bPrec, 'chevron-left');
    bPrec.onclick = () => nav(-1);
    const bAuj = gauche.createEl('button', { cls: 'zfa-cal-nav zfa-cal-nav-auj', text: tr('Aujourd\'hui') });
    const versAujourdhui = () => {
      const a = new Date().toISOString().slice(0, 10);
      this._ancre = this.mode === 'semaine' ? Ariane.grilleSemaine(a).lundi : a;
      this._semScrollTop = null;
      this.dessiner();
    };
    bAuj.onclick = versAujourdhui;
    const bSuiv = gauche.createEl('button', { cls: 'zfa-cal-nav', attr: { 'aria-label': tr('Suivant') } });
    obsidian.setIcon(bSuiv, 'chevron-right');
    bSuiv.onclick = () => nav(1);

    const titre = b.createSpan({ cls: 'zfa-cal-titre', text: this.titrePeriode() });
    titre.setAttribute('role', 'button');
    titre.onclick = versAujourdhui;

    const droite = b.createDiv({ cls: 'zfa-cal-barre-droite' });
    if (this.mode === 'semaine') {
      const zoom = droite.createDiv({ cls: 'zfa-cal-zoom' });
      const bMoins = zoom.createEl('button', { cls: 'zfa-cal-nav', attr: { 'aria-label': tr('Dézoomer') } });
      obsidian.setIcon(bMoins, 'minus');
      bMoins.onclick = () => this._zoomerSemaine(-8);
      const bPlus = zoom.createEl('button', { cls: 'zfa-cal-nav', attr: { 'aria-label': tr('Zoomer') } });
      obsidian.setIcon(bPlus, 'plus');
      bPlus.onclick = () => this._zoomerSemaine(8);
    }
    // Bouton « Calendriers à afficher » : familles de tâches (calendriers de
    // créneaux) et, si l'intégration Apple est active, calendriers d'événements.
    const bCal = droite.createEl('button', { cls: 'zfa-cal-nav', attr: { 'aria-label': tr('Calendriers à afficher') } });
    obsidian.setIcon(bCal, 'eye');
    bCal.onclick = (ev) => this._menuCalendriers(ev);
    const seg = droite.createDiv({ cls: 'zfa-cal-mode-seg' });
    for (const m of ['mois', 'semaine']) {
      const o = seg.createEl('button', {
        cls: 'zfa-cal-mode' + (this.mode === m ? ' is-active' : ''),
        text: m === 'mois' ? tr('Mois') : tr('Semaine') });
      o.onclick = async () => { await this.ctx.ecrire('calMode', m); this.dessiner(); };
    }
    const neuf = droite.createEl('button', { cls: 'zfa-cal-neuf', attr: { 'aria-label': tr('Nouvelle tâche') } });
    obsidian.setIcon(neuf, 'plus');
    neuf.createSpan({ text: tr('Nouveau') });
    neuf.onclick = () => this._surNouveau();
  }

  _pxHeureCourant() {
    return Math.max(20, Math.min(160, Number(this.lire('calPxHeure')) || 42));
  }

  // Menu « Calendriers à afficher » : les calendriers de créneaux (une famille
  // de tâches = un calendrier) puis, si l'intégration Apple est active, les
  // calendriers d'événements Apple. Un clic bascule la coche ; le menu se
  // referme (limite de l'API) — il se rouvre d'un clic sur l'œil.
  _menuCalendriers(ev) {
    const menu = new obsidian.Menu();
    // Familles présentes dans les données (la liste brute, pas le filtrage).
    const familles = [];
    const vues = new Set();
    for (const t of (this._tachesBrutes || this._taches || [])) {
      const f = t.famille || '';
      if (!vues.has(f)) { vues.add(f); familles.push(f); }
    }
    const masque = this._masqueFamilles();
    menu.addItem((mi) => { mi.setTitle(tr('Calendriers de tâches')).setDisabled(true); });
    for (const id of familles) {
      const f = this.greffon.familleDe(id);
      const cal = id ? this.greffon.agendaCalendrierDe(id) : '';
      menu.addItem((mi) => mi
        .setTitle(cal ? f.nom + '  ·  ' + cal : f.nom)
        .setIcon(f.icone || 'circle')
        .setChecked(!masque.has(id))
        .onClick(async () => {
          const m = this._masqueFamilles();
          if (m.has(id)) m.delete(id); else m.add(id);
          await this.ctx.ecrire('calCalendriersMasques', [...m]);
          this.dessiner();
        }));
    }
    // Calendriers d'événements Apple (fond, lecture seule).
    const greffon = this.greffon;
    if (greffon.settings && greffon.settings.agendaActif) {
      if (greffon._agendas === undefined && obsidian.Platform.isMacOS) {
        greffon.chargerAgendas().catch(() => {}); // liste prête au prochain clic
      }
      const agendas = Array.isArray(greffon._agendas) ? greffon._agendas : [];
      // Les calendriers de sessions (cibles de la synchro, déjà proposés dans
      // « Calendriers de tâches ») ne sont pas listés une seconde fois.
      const sessions = new Set(greffon._agendasSurveilles().map((c) => c.toLowerCase()));
      const fond = agendas.filter((n) => !sessions.has(String(n).toLowerCase()));
      if (fond.length) {
        menu.addSeparator();
        menu.addItem((mi) => { mi.setTitle(tr('Événements Apple')).setDisabled(true); });
        const coches = greffon._agendasCoches().map((c) => c.toLowerCase());
        for (const nom of fond) {
          menu.addItem((mi) => mi
            .setTitle(nom)
            .setIcon('calendar')
            .setChecked(coches.includes(nom.toLowerCase()))
            .onClick(async () => {
              const co = greffon._agendasCoches();
              const i = co.findIndex((c) => c.toLowerCase() === nom.toLowerCase());
              greffon.settings.agendaCalendriersAffiches =
                i >= 0 ? co.filter((c) => c.toLowerCase() !== nom.toLowerCase()) : co.concat([nom]);
              await greffon.saveSettings();
              greffon._rafraichirFond();
            }));
        }
      }
    }
    // Activité réelle (ActivityWatch) : la colonne fine de la vue semaine.
    if (greffon.activiteDisponible && greffon.activiteDisponible()) {
      menu.addSeparator();
      menu.addItem((mi) => mi
        .setTitle(tr('Activité réelle (ActivityWatch)'))
        .setIcon('activity')
        .setChecked(this.lire('calActiviteReelle') !== false)
        .onClick(async () => {
          await this.ctx.ecrire('calActiviteReelle', this.lire('calActiviteReelle') === false);
          this._activiteCle = null;
          this.dessiner();
        }));
    }
    menu.showAtMouseEvent(ev);
  }

  _hBandeauCourant() {
    return Ariane.clampHauteurBandeau(this.lire('calBandeauH'));
  }

  async _zoomerSemaine(delta) {
    const cur = this._pxHeureCourant();
    const nv = Math.max(20, Math.min(160, cur + delta));
    if (nv === cur) return;
    if (this._semScrollTop != null) this._semScrollTop = this._semScrollTop * (nv / cur);
    await this.ctx.ecrire('calPxHeure', nv);
    this.dessiner();
  }

  naviguer(sens) {
    if (this.mode === 'semaine') {
      this._ancre = Ariane.decalerJour(this._ancre, sens * 7);
      this.dessiner();
      return;
    }
    if (this._ruban && sens) this._calerCarrousel(sens);
    else { this._ancre = Ariane.ancreCarrousel(this._ancre, this.mode, sens); this.dessiner(); }
  }

  _brancherCarrousel(cadre, ruban) {
    const largeur = () => cadre.clientWidth || 1;
    const appliquer = () => {
      ruban.style.transition = 'none';
      ruban.style.transform = 'translateX(calc(-100% / 3 + ' + this._decalGeste + 'px))';
    };
    const finDeGeste = () => {
      const w = largeur();
      const sens = this._decalGeste <= -w / 4 ? 1 : (this._decalGeste >= w / 4 ? -1 : 0);
      this._calerCarrousel(sens);
    };
    cadre.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical : laisser défiler
      e.preventDefault();
      this._decalGeste -= e.deltaX;
      appliquer();
      clearTimeout(this._wheelMinuterie);
      this._wheelMinuterie = setTimeout(finDeGeste, 140);
    }, { passive: false });

    cadre.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.zfa-cal-carte, .zfa-cal-cellule, .zfa-cal-bloc, .zfa-cal-poignee, .zfa-cal-bandeau-jour, .zfa-cal-bandeau-plus, .zfa-cal-bandeau-chevron, button')) return;
      const x0 = e.clientX;
      let bouge = false;
      const move = (mv) => {
        const d = mv.clientX - x0;
        if (Math.abs(d) > 4) bouge = true;
        if (bouge) { this._decalGeste = d; appliquer(); }
      };
      const up = () => {
        this._doc().removeEventListener('pointermove', move);
        this._doc().removeEventListener('pointerup', up);
        if (bouge) finDeGeste();
      };
      this._doc().addEventListener('pointermove', move);
      this._doc().addEventListener('pointerup', up);
    });
  }

  // Anime le ruban jusqu'à la grille voisine (sens ±1) ou le recentre (0),
  // puis réancre et redessine.
  _calerCarrousel(sens) {
    const ruban = this._ruban;
    if (!ruban || this._enCalage) return;
    this._enCalage = true;
    const cible = sens === 1 ? 'calc(-200% / 3)' : (sens === -1 ? '0%' : 'calc(-100% / 3)');
    ruban.style.transition = 'transform 180ms ease-out';
    ruban.style.transform = 'translateX(' + cible + ')';
    let fait = false;
    const apres = (e) => {
      if (e && (e.target !== ruban || e.propertyName !== 'transform')) return;
      if (fait) return;
      fait = true;
      ruban.removeEventListener('transitionend', apres);
      clearTimeout(this._calageMinuterie);
      this._calageMinuterie = null;
      this._enCalage = false;
      this._decalGeste = 0;
      if (sens) this._ancre = Ariane.ancreCarrousel(this._ancre, this.mode, sens);
      this.dessiner();
    };
    ruban.addEventListener('transitionend', apres);
    this._calageMinuterie = setTimeout(() => apres(), 250);
  }

  //#endregion Calendrier · dessin & barre d'outils

  //#region Calendrier · cartes, menus & lignée
  _bornesPeriode() {
    if (this.mode === 'semaine') {
      return { debut: this._ancre, fin: Ariane.decalerJour(this._ancre, 6) };
    }
    const g = Ariane.grilleMois(this._ancre);
    // moisDebut = 1er du mois ; fin = dernier jour du mois courant
    const dernier = Ariane.decalerJour(Ariane.moisSuivantN(g.moisDebut, 1), -1);
    return { debut: g.moisDebut, fin: dernier };
  }

  async _surNouveau() {
    try {
      const auj = new Date().toISOString().slice(0, 10);
      const { debut, fin } = this._bornesPeriode();
      const jour = Ariane.jourSeme(this._jourSel || '', debut, fin, auj);
      const chemin = await this.greffon.creerTache({ debut: jour, echeance: jour });
      if (chemin) this.ouvrir(chemin.split('/').pop().replace(/\.md$/, ''), false);
    } catch (e) {
      new obsidian.Notice(tr('Création impossible : ') + (e && e.message ? e.message : e));
    }
  }

  titrePeriode() {
    if (this.mode === 'mois') {
      const [a, m] = this._ancre.split('-').map(Number);
      return (MOIS_COURTS[m - 1] || m) + ' ' + a;
    }
    const [a0, m0, d0] = this._ancre.split('-').map(Number);
    const [a6, m6, d6] = Ariane.decalerJour(this._ancre, 6).split('-').map(Number);
    if (m0 === m6) return d0 + '–' + d6 + ' ' + (MOIS_COURTS[m0 - 1] || '') + ' ' + a0;
    return d0 + ' ' + (MOIS_COURTS[m0 - 1] || '') + ' – '
      + d6 + ' ' + (MOIS_COURTS[m6 - 1] || '') + ' ' + a6;
  }

  ouvrir(ref, nouveau) {
    const f = this.greffon.fichierDeRef(ref);
    if (f) this.app.workspace.getLeaf(!!nouveau).openFile(f);
  }
  // Couleur d'un créneau : suit le réglage de la frise pour les modes
  // « statut » et « famille » ; les autres modes (racine, priorité,
  // avancement) retombent sur la couleur de famille, faute de place.
  couleurTache(t) {
    if ((this.greffon.settings.friseBarreCouleur || 'famille') === 'statut') {
      return Ariane.COULEURS_GANTT[t.statut] || 'var(--text-faint)';
    }
    return (this.greffon.familleDe(t.famille) || {}).couleur || 'var(--text-faint)';
  }
  // Une carte d'événement : ligne 1 = heure + intitulé ; lignes suivantes =
  // propriétés visibles de la base (Task 3), coupées à opts.maxLignes selon la
  // hauteur disponible. Survol → aperçu de page natif. Retour : l'élément.
  rendreCarte(hote, t, ev, opts) {
    const o = opts || {};
    const carte = hote.createDiv({ cls: 'zfa-cal-carte'
      + (ev.allDay ? ' est-jour' : ' est-horaire')
      + (o.compact ? ' est-compacte' : '')
      + (o.enRetard ? ' est-retard' : '') });
    carte.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
    carte.dataset.ref = t.ref;
    if (ev.source === 'creneau') carte.dataset.brut = ev.brut;

    const fini = t.statut === 'terminée' || t.terminee === true;
    if (fini) carte.addClass('est-terminee');

    // Ligne 1 : coche + intitulé, sur une rangée (façon day-planner).
    const l1 = carte.createDiv({ cls: 'zfa-cal-carte-l1' });
    if (o.avecCoche) {
      const cb = l1.createEl('input', { type: 'checkbox', cls: 'zfa-cal-carte-coche' });
      cb.checked = fini;
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('pointerdown', (e) => e.stopPropagation());
      cb.addEventListener('change', async () => {
        await this.greffon.majTache(t.ref, { statut: cb.checked ? 'terminée' : 'à faire' });
        this.dessiner();
      });
    }
    const heureAPart = !o.compact && o.avecHeure && !ev.allDay && ev.fin && (o.maxLignes || 1) >= 2;
    const prefixe = (!o.compact && o.avecHeure && !ev.allDay && !heureAPart)
      ? ev.debut.slice(11, 16) + '  ' : '';
    l1.createSpan({ cls: 'zfa-cal-carte-titre', text: prefixe + (t.intitule || t.ref) });
    if (heureAPart) {
      carte.createDiv({ cls: 'zfa-cal-carte-heure',
        text: ev.debut.slice(11, 16) + ' – ' + ev.fin.slice(11, 16) });
    }

    const paires = this._pairesProps(t.ref);
    if (!o.compact) {
      const lignes = Ariane.lignesProprietes(
        paires, t.intitule, Math.max(0, (o.maxLignes || 1) - 1));
      for (const li of lignes) {
        const row = carte.createDiv({ cls: 'zfa-cal-carte-prop' });
        row.createSpan({ cls: 'zfa-cal-carte-prop-nom', text: li.nom + ' ' });
        row.createSpan({ cls: 'zfa-cal-carte-prop-val', text: li.valeur });
      }
    }

    // title= = toutes les propriétés, même quand la carte n'en montre qu'une.
    const toutes = Ariane.lignesProprietes(paires, t.intitule, 99);
    carte.title = t.ref + ' · ' + (t.intitule || '')
      + (toutes.length ? '\n' + toutes.map((x) => x.nom + ' : ' + x.valeur).join('\n') : '');

    carte.addEventListener('mouseover', (e) => {
      this.app.workspace.trigger('hover-link', { event: e, source: 'zfa-calendrier',
        hoverParent: this, targetEl: carte, linktext: t.ref, sourcePath: '' });
    });
    carte.addEventListener('click', (e) => { e.stopPropagation();
      this.ouvrir(t.ref, e.metaKey || e.ctrlKey); });
    carte.addEventListener('contextmenu', (e) => this.menuCarte(e, t, ev));
    return carte;
  }
  // Paires { cle, nom, valeur } d'une tâche, pour rendreCarte (Task 4).
  _pairesProps(ref) {
    return (this._colonnes || []).map((c) => ({
      cle: c.cle, nom: c.nom, valeur: c.valeur ? c.valeur(ref) : '',
    }));
  }
  // Une écriture de geste (déplacement / redimensionnement d'un créneau) fait
  // réagir Bases à CHAQUE écriture de la note (frontmatter, puis bloc
  // « Sessions ») : onDataUpdated → dessiner, plusieurs fois en quelques
  // dizaines de ms, dont au moins une avec les données d'avant — le bloc
  // clignotait et repassait brièvement à son ancienne place. Pendant la
  // fenêtre, les demandes ne font que lever un drapeau (voir dessiner) et un
  // seul dessin repart quand ça retombe — nourri du créneau anticipé de
  // _creneauxAnticipes, donc à la bonne place même si les données de la base
  // n'ont pas encore suivi. Un geste en cours repousse la retombée : jamais de
  // reconstruction pendant qu'on tient un bloc.
  _coalesceRedessin(ms) {
    this._coalesce = true;
    // Le DOM du bloc a été retaillé à la main pendant le geste : un dessin est
    // dû quoi qu'il arrive (le bloc glissé garde transform + pointer-events:none).
    this._redessinDiffere = true;
    clearTimeout(this._figeMinuterie);
    const retombee = () => {
      if (this._gesteCal) {
        this._figeMinuterie = setTimeout(retombee, 200);
        return;
      }
      this._coalesce = false;
      if (this._redessinDiffere) {
        this._redessinDiffere = false;
        this.dessiner();
      }
    };
    this._figeMinuterie = setTimeout(retombee, ms || 450);
  }

  // Liste de créneaux attendue APRÈS l'écriture d'un geste (l'ancien retiré,
  // le nouveau ajouté, triés et dédoublonnés comme majCreneau les range) :
  // sert de valeur anticipée dans _enAttente, pour que les redessins qui
  // partent avant la propagation de l'écriture affichent déjà la nouvelle
  // géométrie au lieu de revenir à l'ancienne.
  _creneauxAnticipes(ref, avant, debut, fin) {
    const t = (this._tachesBrutes || this._taches || []).find((x) => x.ref === ref);
    const liste = [].concat((t && t.creneaux) || []).map(String)
      .filter((x) => x.trim() !== String(avant || '').trim());
    const nv = (debut && fin) ? Ariane.formatCreneau(debut, fin) : '';
    if (nv) liste.push(nv);
    // Même ordre que la comparaison de _enAttente (tri lexicographique du brut).
    return Ariane.creneauxDeTache(liste).map((c) => c.brut).sort();
  }

  async _apres(ref, apercu) {
    if (!this._enAttente) this._enAttente = new Map();
    // _t0 : instant du geste. dessinerVraiment maintient la géométrie anticipée
    // jusqu'à MS_PIN_CRENEAU après cet instant (voir là-bas). Un nouveau geste
    // sur le même créneau réarme la fenêtre.
    if (apercu) this._enAttente.set(ref, Object.assign({ _t0: Date.now() }, apercu));
    // L'écriture est FINIE ici (on est après le await qui la précède toujours) :
    // c'est le bon moment pour lever la coalescence, pas le minuteur à durée
    // fixe de _coalesceRedessin. Ce minuteur ne reste qu'un filet de sécurité
    // si _apres n'est jamais atteint (écriture qui lève une exception) ; le
    // laisser seul décider faisait courir deux horloges différentes — la
    // sienne et la vraie durée de l'écriture (entête + bloc « Sessions ») —
    // et quand l'écriture dépassait les 450 ms, le minuteur redessinait le
    // premier avec un cache de métadonnées pas encore à jour : un clignotement
    // visible avant que le recalage (voir _enAttente) ne rattrape l'affichage.
    clearTimeout(this._figeMinuterie);
    this._coalesce = false;
    this._redessinDiffere = false;
    this.dessiner();
  }

  // Ouvre la modale de commentaire d'un créneau (bouton de survol et menu
  // contextuel partagent ce chemin). Le commentaire vit dans le bloc « ##
  // Sessions » balisé de la note, indexé par le brut du créneau.
  async _ouvrirCommentaire(t, ev) {
    const fich = this.greffon.fichierDeRef ? this.greffon.fichierDeRef(t.ref) : null;
    const coms = fich ? Ariane.commentairesDuBloc(await this.app.vault.cachedRead(fich)) : {};
    new ModaleCommentaire(this.app, {
      valeur: coms[Ariane.cleCommentaire(ev.brut)] || '',
    }, async (txt) => {
      await this.greffon.majCommentaireCreneau(t.ref, ev.brut, txt);
      this.dessiner();
    }).open();
  }

  menuCarte(e, t, ev) {
    e.preventDefault(); e.stopPropagation();
    const m = new obsidian.Menu();
    const poser = async (champs) => { await this.greffon.majTache(t.ref, champs); this.dessiner(); };

    m.addItem((i) => i.setTitle(tr('Ouvrir')).setIcon('file-text').onClick(() => this.ouvrir(t.ref, false)));
    m.addItem((i) => i.setTitle(tr('Ouvrir dans un nouveau volet')).setIcon('separator-vertical')
      .onClick(() => this.ouvrir(t.ref, true)));
    m.addSeparator();

    for (const st of ['à faire', 'en cours', 'en attente', 'terminée', 'abandonnée']) {
      m.addItem((i) => i.setTitle(tr('Statut : ') + st).setChecked(t.statut === st)
        .onClick(() => poser({ statut: st })));
    }
    m.addItem((i) => i.setTitle(tr('Marquer terminée')).setIcon('check')
      .onClick(() => poser({ statut: 'terminée' })));
    m.addSeparator();
    for (const [lib, val] of [[tr('(aucune)'), ''], [tr('basse'), 'basse'],
                              [tr('moyenne'), 'moyenne'], [tr('haute'), 'haute']]) {
      m.addItem((i) => i.setTitle(tr('Priorité : ') + lib).setChecked(String(t.priorite || '') === val)
        .onClick(() => poser({ priorite: val })));
    }
    m.addSeparator();
    m.addItem((i) => i.setTitle(tr('Créer une tâche fille…')).setIcon('corner-down-right')
      .onClick(() => this.greffon.ajouterTacheLiee(t.ref, 'fille', () => this.dessiner())));
    m.addItem((i) => i.setTitle(tr('Créer une tâche mère…')).setIcon('corner-left-up')
      .onClick(() => this.greffon.ajouterTacheLiee(t.ref, 'mere', () => this.dessiner())));
    m.addSeparator();

    if (ev.source === 'creneau') {
      // Commentaire de session : stocké dans le bloc balisé de la note.
      m.addItem((i) => i.setTitle(tr('Commentaire…')).setIcon('message-square')
        .onClick(() => this._ouvrirCommentaire(t, ev)));
      const blocMenu = e.target && e.target.closest ? e.target.closest('.zfa-cal-bloc') : null;
      if (blocMenu && this.mode === 'semaine') {
        m.addItem((i) => i.setTitle(tr('Dupliquer ce créneau')).setIcon('copy-plus')
          .onClick(() => this._dupliquerCreneau(t, ev, blocMenu, e)));
      }
      // Bloc horaire : on retire le créneau lui-même (la ligne de « Créneaux »).
      m.addItem((i) => i.setTitle(tr('Supprimer ce créneau')).setIcon('trash-2')
        .onClick(async () => {
          await this._majCreneauU(t.ref, { avant: ev.brut, debut: '', fin: '' });
          this._apres(t.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
        }));
    } else if (t.debut || t.echeance) {
      // Jalon lié à un événement Apple (créé depuis un clic droit sur l'événement) :
      // raccourci pour rouvrir cet événement dans Calendrier.
      const fj = this.greffon.fichierDeRef && this.greffon.fichierDeRef(t.ref);
      const eid = fj ? String(((this.app.metadataCache.getFileCache(fj) || {}).frontmatter
        || {})['Événement ID'] || '').trim() : '';
      if (eid) {
        m.addItem((i) => i.setTitle(tr('Ouvrir l\'événement Apple')).setIcon('external-link')
          .onClick(() => this._ouvrirEvenement(eid)));
      }
      // Carte de dates (jalon / tâche d'une journée) : on efface début + échéance.
      m.addItem((i) => i.setTitle(tr('Effacer début et échéance')).setIcon('calendar-off')
        .onClick(async () => {
          await this._ecrireDatesU([{ ref: t.ref, debut: '', echeance: '' }]);
          this._apres(t.ref, { debut: '', echeance: '', cible: ['', '', []] });
        }));
    }
    m.showAtMouseEvent(e);
  }

  // --- Panneau de lignée d'un créneau -------------------------------------
  // Un seul panneau ouvert à la fois. Posé sur le document en position fixe,
  // il SURVIT aux redessins de la vue : on peut y ouvrir la liste et faire
  // glisser plusieurs cartes vers le calendrier l'une après l'autre. Fermeture
  // volontairement limitée : re-bascule du même bouton, Échap, perte de focus
  // de la fenêtre, destruction de la vue — jamais un simple clic ailleurs.
  _basculeLignee(ref, sens, btn) {
    const cle = ref + '|' + sens;
    if (this._panneauLignee && this._panneauLignee.cle === cle) {
      this._fermerLignee();
      return;
    }
    this._montrerLignee(ref, sens, btn, cle);
  }

  _montrerLignee(ref, sens, btn, cle) {
    this._fermerLignee();
    const hier = this._hier || Ariane.hierarchiesTaches(this.greffon.tachesPourGantt());
    const parRef = hier.parRef;
    let arbre = [];
    if (sens === 'filles') {
      arbre = hier.filles.get(ref) || [];
    } else {
      // La chaîne des mères sans la tâche elle-même, racine en tête ;
      // l'ancre conclut la liste (repère visuel).
      arbre = (hier.meres.get(ref) || []).slice(0, -1).map((r) => ({ ref: r, filles: [] }));
    }
    if (!arbre.length) return;
    const doc = btn.ownerDocument || document;
    const pan = doc.createElement('div');
    pan.className = 'zfa-cal-lignee-panneau';
    const tete = doc.createElement('div');
    tete.className = 'zfa-cal-lignee-tete';
    tete.textContent = sens === 'filles' ? tr('Tâches filles') : tr('Tâches mères');
    pan.appendChild(tete);
    const corps = doc.createElement('div');
    corps.className = 'zfa-cal-lignee-corps';
    const ligne = (r, prof, ancre) => {
      const t = parRef.get(r) || {};
      const row = doc.createElement('div');
      row.className = 'zfa-cal-lignee-ligne' + (ancre ? ' est-ancre' : '');
      row.style.paddingLeft = (4 + prof * 13) + 'px';
      row.title = r;
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        // Payload prioritaire de _refDepuisDrop : la carte se pose comme créneau.
        e.dataTransfer.setData('text/x-ariane-tache', r);
        e.dataTransfer.setData('text/plain', '[[' + r + ']]');
        // Repli quand ce dépôt vise un calendrier d'une autre fenêtre (le
        // dataTransfer n'y survit pas) : voir la même ligne côté frise.
        if (this.greffon) this.greffon._sourceGlissee = r;
      });
      const ic = doc.createElement('span');
      ic.className = 'zfa-cal-lignee-ic';
      obsidian.setIcon(ic, this.greffon.familleDe(t.famille).icone || 'circle');
      ic.style.color = this.couleurTache(t);
      row.appendChild(ic);
      const nom = doc.createElement('span');
      nom.className = 'zfa-cal-lignee-nom';
      nom.textContent = t.intitule || r;
      row.appendChild(nom);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ouvrir(r, e.metaKey || e.ctrlKey);
      });
      corps.appendChild(row);
    };
    const parcourir = (noeuds, prof) => {
      for (const nd of noeuds || []) {
        ligne(nd.ref, prof, false);
        parcourir(nd.filles, prof + 1);
      }
    };
    parcourir(arbre, 0);
    if (sens === 'meres') ligne(ref, arbre.length, true);
    pan.appendChild(corps);
    doc.body.appendChild(pan);
    // Place le panneau près du bouton, sans sortir de la fenêtre.
    const r = btn.getBoundingClientRect();
    const pw = pan.offsetWidth || 260;
    const ph = pan.offsetHeight || 180;
    const vw = doc.documentElement.clientWidth || 1200;
    const vh = doc.documentElement.clientHeight || 800;
    const x = (r.right + pw + 8 > vw) ? Math.max(8, r.left - pw - 6) : r.right + 6;
    pan.style.left = x + 'px';
    pan.style.top = Math.max(8, Math.min(r.top, vh - ph - 8)) + 'px';
    const surEchap = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this._fermerLignee(); }
    };
    doc.addEventListener('keydown', surEchap, true);
    const surFlou = () => this._fermerLignee();
    const win = doc.defaultView || window;
    win.addEventListener('blur', surFlou);
    btn.classList.add('est-active');
    this._panneauLignee = { cle, el: pan, doc, win, surEchap, surFlou, btn };
    // Animation d'ouverture (la classe pose opacité + translation finale).
    window.requestAnimationFrame(() => pan.classList.add('est-ouvert'));
  }

  _fermerLignee() {
    const p = this._panneauLignee;
    if (!p) return;
    this._panneauLignee = null;
    p.doc.removeEventListener('keydown', p.surEchap, true);
    if (p.win) p.win.removeEventListener('blur', p.surFlou);
    if (p.btn && p.btn.isConnected) p.btn.classList.remove('est-active');
    if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
  }

  menuCellule(e, jourISO) {
    e.preventDefault(); e.stopPropagation();
    const m = new obsidian.Menu();
    m.addItem((i) => i.setTitle(tr('Nouvelle tâche ce jour-là')).setIcon('plus')
      .onClick(async () => {
        const chemin = await this.greffon.creerTache({ debut: jourISO, echeance: jourISO });
        if (chemin) this.ouvrir(chemin.split('/').pop().replace(/\.md$/, ''), false);
      }));
    m.addItem((i) => i.setTitle(tr('Coller le lien en créneau')).setIcon('clipboard-paste')
      .onClick(async () => {
        let txt = '';
        try { txt = await navigator.clipboard.readText(); } catch (err) { txt = ''; }
        const ref = this._refDepuisDrop({ getData: (k) => (k === 'text/plain' ? txt : '') });
        if (!ref) { new obsidian.Notice(tr('Aucun lien de tâche dans le presse-papier.')); return; }
        const cr = Ariane.creneauDepuisDrop({ yRel: 0, hauteurHeure: this._pxHeure || 42,
          heureDebut: this._hDeb || 9, jourISO, dureeMin: 60 })
          || { debut: jourISO + 'T09:00', fin: jourISO + 'T10:00' };
        await this._majCreneauU(ref, { avant: '', debut: cr.debut, fin: cr.fin });
        this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
      }));
    m.showAtMouseEvent(e);
  }

  // Résout la tâche déposée depuis l'extérieur : charge utile propre de la frise,
  // sinon lien wiki « [[T-…]] », sinon nom de fichier « …/T-….md », sinon chemin
  // de note reconnu comme tâche. Rend '' si rien ne colle.
  // Résout une réf de tâche depuis une source de glissé. On tente, dans l'ordre :
  // la charge propre « text/x-ariane-tache », le texte du lien (« [[T…]] » /
  // « …/T….md »), puis la source de glissé mémorisée par le greffon
  // (`_sourceGlissee`, posée en capture sur tout `dragstart` de lien interne) —
  // ce dernier repli survit au passage d'un volet à l'autre, contrairement au
  // dataTransfer. Le lien peut désigner une tâche du coffre même si le
  // calendrier ne l'affiche pas (frise et calendrier = deux bases).
  //#endregion Calendrier · cartes, menus & lignée

  //#region Calendrier · glisser-déposer & gestes
  _refDepuisDrop(dt) {
    const g = this.greffon;
    const essais = [];
    if (dt) {
      const d = (dt.getData('text/x-ariane-tache') || '').trim();
      if (d) return d;
      for (const type of ['text/plain', 'text/uri-list', 'text/x-moz-url']) {
        const v = (dt.getData(type) || '').trim();
        if (v) essais.push(v);
      }
    }
    // Glisser natif d'Obsidian (vue Bases, explorateur, résultats de
    // recherche) : le dragManager est porté par l'objet `app` partagé entre
    // toutes les fenêtres, il franchit donc la frontière là où le dataTransfer
    // se vide. C'est la voie fiable quand la cible est un calendrier détaché.
    const dm = this.app.dragManager && this.app.dragManager.draggable;
    if (dm) {
      if (dm.file && dm.file.path) essais.push(dm.file.path);
      for (const arr of [dm.files, dm.items]) {
        if (Array.isArray(arr)) for (const f of arr) if (f && f.path) essais.push(f.path);
      }
      for (const k of ['linktext', 'link', 'title', 'name']) {
        if (typeof dm[k] === 'string' && dm[k]) essais.push(dm[k]);
      }
    }
    if (g._sourceGlissee) essais.push(String(g._sourceGlissee).trim());

    // Résout une chaîne quelconque : lien wiki, chemin de coffre, nom de note,
    // ou URL Obsidian « obsidian://open?…&file=<chemin sans extension> ».
    const resoudre = (brut) => {
      if (!brut) return '';
      let s = brut.split(/[\r\n]/)[0].trim();
      const mf = s.match(/[?&]file=([^&]+)/);
      if (mf) { try { s = decodeURIComponent(mf[1]); } catch (e) { s = mf[1]; } }
      s = s.replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/^\/+/, '').trim();
      if (!s) return '';
      const base = s.split(/[/\\]/).pop().replace(/\.md$/i, '');
      for (const c of [base, s, s + '.md']) {
        if (this._taches.some((t) => t.ref === c)) return c;
        let f = null;
        try { f = this.app.metadataCache.getFirstLinkpathDest(c, ''); } catch (e) { f = null; }
        if (!f) f = this.app.vault.getMarkdownFiles()
          .find((x) => x.basename === c || x.path === c || x.path === c + '.md') || null;
        if (f && g.refDeChemin && g.refDeChemin(f.path)) return g.refDeChemin(f.path);
      }
      return (g.refDeChemin && (g.refDeChemin(s + '.md') || g.refDeChemin(s))) || '';
    };

    for (const e of essais) { const r = resoudre(e); if (r) return r; }
    return '';
  }

  // Un jalon ou une tâche sans créneau du bandeau, lâché quelque part dans la
  // vue semaine. Rend true s'il s'agissait bien de l'un d'eux (le glissé est
  // alors traité ici).
  //  · sur le bandeau : il change de jour, ses dates décalées d'autant ;
  //  · dans la grille des heures : il reçoit un créneau d'une heure à
  //    l'endroit visé (un jalon cesse alors d'en être un) ; son échéance
  //    recule jusqu'à ce jour si elle le précédait.
  _dropJalon(ev, jourISO, ou) {
    let d = null;
    try { d = JSON.parse(ev.dataTransfer.getData('text/x-ariane-cal') || 'null'); } catch (e) { d = null; }
    if (!d || !(d.jalon || d.dates) || !d.ref) return false;
    ev.preventDefault();
    const t = (this._taches || []).find((x) => x.ref === d.ref);
    if (!t) return true;
    // La position se lit maintenant : après le premier await, l'événement est
    // retombé et currentTarget ne vaut plus rien.
    const cr = ou === 'grille' ? Ariane.creneauDepuisDrop({
      yRel: ev.clientY - ev.currentTarget.getBoundingClientRect().top,
      hauteurHeure: this._pxHeure, heureDebut: this._hDeb, jourISO }) : null;
    (async () => {
      if (ou === 'bandeau') {
        const n = Ariane.ecartJours(d.jour, jourISO);
        if (!n) return;
        const nd = (!d.jalon && t.debut) ? Ariane.decalerJour(t.debut, n) : '';
        const ne = t.echeance ? Ariane.decalerJour(t.echeance, n) : jourISO;
        await this._ecrireDatesU([{ ref: d.ref, debut: nd, echeance: ne }]);
        this._apres(d.ref, { debut: nd, echeance: ne, cible: [nd, ne, []] });
        return;
      }
      if (!cr) return;
      const champs = d.jalon ? { jalon: false } : {};
      if (!t.echeance || t.echeance < jourISO) champs.echeance = jourISO;
      if (Object.keys(champs).length) await this.greffon.majTache(d.ref, champs);
      await this._majCreneauU(d.ref, { avant: '', debut: cr.debut, fin: cr.fin });
      this._apres(d.ref, { cible: [undefined, undefined, null], creneaux: undefined });
    })().catch((e) => console.error('[Ariane] jalon déplacé :', e));
    return true;
  }

  async _dropExterne(ev, jourISO, mode) {
    const ref = this._refDepuisDrop(ev.dataTransfer);
    if (!ref) { new obsidian.Notice(tr('Aucune tâche reconnue dans ce glissé.')); return; }
    ev.preventDefault();
    if (mode === 'mois') {
      // Déposer un lien de tâche en vue mois = poser un créneau ce jour-là
      // (09:00, 1 h par défaut). On ne touche jamais début/échéance ici.
      await this._majCreneauU(ref, { avant: '',
        debut: jourISO + 'T09:00', fin: jourISO + 'T10:00' });
      this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
      return;
    }
    const r = ev.currentTarget.getBoundingClientRect();
    const cr = Ariane.creneauDepuisDrop({ yRel: ev.clientY - r.top,
      hauteurHeure: this._pxHeure, heureDebut: this._hDeb, jourISO });
    if (!cr) return;
    await this._majCreneauU(ref, { avant: '', debut: cr.debut, fin: cr.fin });
    this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
  }

  _saisirBloc(e, bloc, ref, brut, jourCol, mode) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    // Geste en cours : la retombée d'un dessin coalescé l'attend (jamais de
    // reconstruction du DOM pendant qu'on tient un bloc).
    this._gesteCal = true;
    const PXH = this._pxHeure;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const topDep = parseFloat(bloc.style.top) || 0;
    const hDep = parseFloat(bloc.style.height) || 20;
    // Déplacement horizontal (jour) : autorisé seulement pour le geste « bouger »
    // (pas pour les redimensionnements, qui figent l'autre extrémité), et
    // seulement en vue semaine où l'on connaît la largeur d'une colonne et la
    // bande de jours.
    const colW = this._semColW || 0;
    const strip = Array.isArray(this._semStrip) ? this._semStrip : [];
    const idxDep = strip.indexOf(jourCol);
    const peutChangerJour = !mode && colW > 0 && idxDep >= 0;
    const inner = bloc.closest('.zfa-cal-sem-inner');
    let bouge = false;
    let dxDer = 0;
    let dyDer = 0;
    let guide = null;
    let colCible = null;
    let idxJourGuide = null;
    const cal = (v) => Math.round(v / (PXH / 4)) * (PXH / 4);
    // Guide de placement : rectangle calé sur le jour + le quart d'heure visés,
    // qui glisse par crans (animation courte) pendant que le bloc, lui, suit
    // librement le curseur. Surligne aussi la colonne du jour d'arrivée.
    // La recherche de colonne (querySelector) ne coûte qu'au changement DE
    // JOUR, pas à chaque pointermove : sur un geste vertical pur (la grande
    // majorité), idxJour ne bouge jamais et on ne la refait donc jamais.
    const poserGuide = (topSnap, idxJour) => {
      if (!inner) return;
      if (!guide) {
        guide = inner.createDiv({ cls: 'zfa-cal-bloc-guide' });
        guide.style.transition = 'none';
        window.requestAnimationFrame(() => { if (guide) guide.style.transition = ''; });
      }
      guide.style.left = (idxJour * colW) + 'px';
      guide.style.width = colW + 'px';
      guide.style.top = topSnap + 'px';
      guide.style.height = (parseFloat(bloc.style.height) || PXH) + 'px';
      if (idxJour !== idxJourGuide) {
        idxJourGuide = idxJour;
        const nvColCible = inner.querySelector('.zfa-cal-col[data-jour="' + strip[idxJour] + '"]');
        if (nvColCible !== colCible) {
          if (colCible) colCible.classList.remove('zfa-cal-col-cible-jour');
          colCible = nvColCible;
          if (colCible) colCible.classList.add('zfa-cal-col-cible-jour');
        }
      }
    };
    const nettoyerGuide = () => {
      if (guide) { guide.remove(); guide = null; }
      if (colCible) { colCible.classList.remove('zfa-cal-col-cible-jour'); colCible = null; }
    };
    const bouger = (mv) => {
      const d = mv.clientY - y0;
      const dx = mv.clientX - x0;
      dxDer = dx; dyDer = d;
      if ((Math.abs(d) > 3 || Math.abs(dx) > 3) && !bouge) {
        bouge = true;
        // Après un glissé, le navigateur émet un « click » de synthèse sur le
        // bloc → ça ouvrait la note. On l'absorbe une fois, en capture.
        bloc.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); },
          { capture: true, once: true });
      }
      if (mode === 'fin') { bloc.style.height = Math.max(PXH / 4, cal(hDep + d)) + 'px'; return; }
      if (mode === 'debut') {
        // Le haut suit le curseur, le bas reste en place : jamais moins de
        // 15 min, jamais au-dessus du début de la grille.
        const nt = Math.max(0, Math.min(topDep + hDep - PXH / 4, cal(topDep + d)));
        bloc.style.top = nt + 'px';
        bloc.style.height = (topDep + hDep - nt) + 'px';
        return;
      }
      // Geste « bouger » : le bloc se décroche et suit librement le curseur sur
      // les deux axes (sans calage). Un guide par crans montre où il se posera ;
      // le recalage effectif se fait au lâcher.
      bloc.classList.add('zfa-cal-bloc-flotte');
      bloc.style.transform = 'translate(' + dx + 'px,' + d + 'px)';
      const topSnap = Math.max(0, cal(topDep + d));
      let dJ = 0;
      if (peutChangerJour) {
        dJ = Math.max(-idxDep, Math.min(strip.length - 1 - idxDep, Math.round(dx / colW)));
      }
      poserGuide(topSnap, idxDep + dJ);
    };
    // Le navigateur peut livrer bien plus d'un pointermove par image (souris
    // haute fréquence, trackpad) ; sans throttle, chaque geste rejouait tout
    // le travail de bouger() (styles, guide) plusieurs fois par frame pour un
    // résultat identique à l'œil — la source du geste peu réactif. On ne
    // garde que le DERNIER événement reçu et on l'applique une fois par
    // requestAnimationFrame.
    let mvEnAttente = null;
    let rafId = null;
    const appliquerMouvementEnAttente = () => {
      rafId = null;
      if (mvEnAttente) { bouger(mvEnAttente); mvEnAttente = null; }
    };
    const bougerThrottle = (mv) => {
      mvEnAttente = mv;
      if (rafId == null) rafId = this._win().requestAnimationFrame(appliquerMouvementEnAttente);
    };
    const lacher = async (up) => {
      // Un dernier pointermove peut être encore en attente d'image quand le
      // pointeur se relâche : on l'applique tout de suite pour que dxDer/dyDer
      // et la géométrie du bloc reflètent bien la position au lâcher, pas
      // celle d'une image en retard.
      if (rafId != null) { this._win().cancelAnimationFrame(rafId); rafId = null; }
      appliquerMouvementEnAttente();
      this._doc().removeEventListener('pointermove', bougerThrottle);
      this._doc().removeEventListener('pointerup', lacher);
      this._doc().removeEventListener('pointercancel', lacher);
      this._gesteCal = false;
      nettoyerGuide();
      if (!bouge) {
        bloc.classList.remove('zfa-cal-bloc-flotte');
        bloc.style.transform = '';
        return;
      }
      const dx = (up && up.clientX != null) ? up.clientX - x0 : dxDer;
      const dy = (up && up.clientY != null) ? up.clientY - y0 : dyDer;
      const haut = parseFloat(bloc.style.height) || PXH;
      if (mode === 'fin') {
        const top = parseFloat(bloc.style.top) || 0;
        const cr0 = Ariane.creneauDepuisDrop({ yRel: top, hauteurHeure: PXH,
          heureDebut: this._hDeb, jourISO: jourCol, dureeMin: Math.max(15, (haut / PXH) * 60) });
        if (!cr0) { this.dessiner(); return; }
        // Fenêtre de coalescence + valeur anticipée : pas de rafale de
        // redessins ni de retour bref à l'ancienne place pendant que
        // l'écriture se propage (voir _coalesceRedessin).
        this._coalesceRedessin();
        const prevu = this._creneauxAnticipes(ref, brut, cr0.debut, cr0.fin);
        await this._majCreneauU(ref, { avant: brut, debut: cr0.debut, fin: cr0.fin });
        this._apres(ref, { creneaux: prevu });
        return;
      }
      if (mode === 'debut') {
        // Le haut a bougé : nouveau début recalé au quart d'heure ; la fin
        // d'origine est conservée telle quelle (elle peut être un autre jour).
        const nt = parseFloat(bloc.style.top) || 0;
        const cr0 = Ariane.creneauDepuisDrop({ yRel: nt, hauteurHeure: PXH,
          heureDebut: this._hDeb, jourISO: jourCol, dureeMin: 15 });
        const fin0 = Ariane.parseCreneau(brut);
        if (!cr0 || !fin0 || cr0.debut >= fin0.fin) { this.dessiner(); return; }
        this._coalesceRedessin();
        const prevu = this._creneauxAnticipes(ref, brut, cr0.debut, fin0.fin);
        await this._majCreneauU(ref, { avant: brut, debut: cr0.debut, fin: fin0.fin });
        this._apres(ref, { creneaux: prevu });
        return;
      }
      const top = Math.max(0, cal(topDep + dy));
      let dJours = 0;
      if (peutChangerJour) {
        dJours = Math.max(-idxDep,
          Math.min(strip.length - 1 - idxDep, Math.round(dx / colW)));
      }
      // On ne remet PAS le bloc à sa position d'origine : on l'y laisse glisser
      // doucement jusqu'à l'emplacement visé (mêmes coordonnées que le redraw
      // qui suivra) et l'ombre / l'opacité de « flottement » se résorbent en
      // même temps, pour que l'échange soit invisible — pas de saut / clignotement.
      bloc.style.transition = 'transform 120ms ease, box-shadow 150ms ease, opacity 150ms ease';
      bloc.classList.remove('zfa-cal-bloc-flotte');
      bloc.style.zIndex = '25';
      bloc.style.pointerEvents = 'none';
      bloc.style.transform = 'translate(' + (dJours * colW) + 'px,' + (top - topDep) + 'px)';
      const jourCible = dJours ? strip[idxDep + dJours] : jourCol;
      const cr = Ariane.creneauDepuisDrop({ yRel: top, hauteurHeure: PXH,
        heureDebut: this._hDeb, jourISO: jourCible, dureeMin: Math.max(15, (haut / PXH) * 60) });
      if (!cr) { this.dessiner(); return; }
      this._coalesceRedessin();
      const prevu = this._creneauxAnticipes(ref, brut, cr.debut, cr.fin);
      await this._majCreneauU(ref, { avant: brut, debut: cr.debut, fin: cr.fin });
      this._apres(ref, { creneaux: prevu });
    };
    this._doc().addEventListener('pointermove', bougerThrottle);
    this._doc().addEventListener('pointerup', lacher);
    this._doc().addEventListener('pointercancel', lacher);
  }

  // Duplication d'un créneau (vue semaine). Une copie de la carte se met à
  // suivre la souris ; le guide du déplacement montre où elle se posera (jour
  // surligné, haut calé au quart d'heure) ; un clic la pose : c'est un NOUVEAU
  // créneau de la même tâche, de même durée, l'original ne bouge pas. Échap,
  // clic droit ou clic hors de la grille : on repose la copie. ⌥ au clic : la
  // copie reste en main pour en poser une autre.
  // Le guide et la grille sont relus à chaque image plutôt que retenus : un
  // redessin (l'horloge, une écriture) peut remplacer la grille en cours de
  // route, et la copie doit continuer de viser juste.
  _dupliquerCreneau(t, ev, bloc, e0) {
    if (this._pose) this._pose.finir();
    const doc = this._doc();
    const win = this._win();
    const PXH = this._pxHeure;
    const duree = Ariane.dureeCreneauMin(ev.debut, ev.fin);
    const r0 = bloc.getBoundingClientRect();
    const larg = r0.width;
    const haut = Math.max(PXH / 4, (duree / 60) * PXH);
    // La carte est tenue par le haut, à la façon d'une fiche qu'on prend
    // entre deux doigts : le pointeur désigne l'heure de début.
    const PRISE = Math.min(12, haut / 2);

    const fantome = bloc.cloneNode(true);
    fantome.querySelectorAll('.zfa-cal-lignee-btns, .zfa-cal-poignee, .zfa-cal-poignee-haut')
      .forEach((x) => x.remove());
    fantome.classList.remove('zfa-cal-bloc-flotte');
    fantome.classList.add('zfa-cal-fantome');
    fantome.removeAttribute('tabindex');
    fantome.style.left = '0px';
    fantome.style.top = '0px';
    fantome.style.width = larg + 'px';
    fantome.style.height = haut + 'px';
    doc.body.appendChild(fantome);
    doc.body.classList.add('zfa-cal-pose-en-cours');

    let x = e0.clientX;
    let y = e0.clientY;
    let cible = null;          // { jour, top } sous le pointeur, ou null
    let guide = null;
    let innerGuide = null;
    let colCible = null;
    let rafId = null;
    let pose = null;

    const oterGuide = () => {
      if (guide) { guide.remove(); guide = null; }
      if (colCible) { colCible.classList.remove('zfa-cal-col-cible-jour'); colCible = null; }
    };
    const viser = () => {
      rafId = null;
      fantome.style.transform = 'translate(' + Math.round(x - larg / 2) + 'px,'
        + Math.round(y - PRISE) + 'px)';
      const inner = this.racine.querySelector('.zfa-cal-sem-inner');
      if (inner !== innerGuide) { oterGuide(); innerGuide = inner; }
      const colW = this._semColW || 0;
      const strip = Array.isArray(this._semStrip) ? this._semStrip : [];
      // Le pointeur doit être SUR la grille visible, pas seulement dans son
      // rectangle : la grille déborde, rognée par son défilement.
      const sous = inner ? doc.elementFromPoint(x, y) : null;
      const r = inner ? inner.getBoundingClientRect() : null;
      const p = r && sous && inner.contains(sous) ? Ariane.poseCreneau({
        xRel: x - r.left, yRel: y - r.top, prise: PRISE, colW,
        nbJours: strip.length, pxHeure: PXH, hauteur: r.height }) : null;
      if (!p) {
        cible = null;
        oterGuide();
        fantome.classList.add('est-hors-grille');
        return;
      }
      fantome.classList.remove('est-hors-grille');
      cible = { jour: strip[p.idx], top: p.top };
      if (!guide) {
        guide = inner.createDiv({ cls: 'zfa-cal-bloc-guide' });
        guide.style.transition = 'none';
        win.requestAnimationFrame(() => { if (guide) guide.style.transition = ''; });
      }
      guide.style.left = (p.idx * colW) + 'px';
      guide.style.width = colW + 'px';
      guide.style.top = p.top + 'px';
      guide.style.height = haut + 'px';
      const col = inner.querySelector('.zfa-cal-col[data-jour="' + cible.jour + '"]');
      if (col !== colCible) {
        if (colCible) colCible.classList.remove('zfa-cal-col-cible-jour');
        colCible = col;
        if (colCible) colCible.classList.add('zfa-cal-col-cible-jour');
      }
    };
    const planifier = () => { if (rafId == null) rafId = win.requestAnimationFrame(viser); };
    const surMouvement = (m) => { x = m.clientX; y = m.clientY; planifier(); };
    // Le clic qui pose (ou qui abandonne) ne doit rien déclencher d'autre :
    // ni ouvrir la carte survolée, ni ouvrir le menu de la cellule.
    const absorber = (a) => { a.stopPropagation(); a.preventDefault(); };
    const surAppui = (a) => {
      absorber(a);
      doc.addEventListener(a.button === 2 ? 'contextmenu' : 'click', absorber,
        { capture: true, once: true });
      x = a.clientX; y = a.clientY;
      if (rafId != null) { win.cancelAnimationFrame(rafId); rafId = null; }
      viser();
      if (a.button !== 0 || !cible) { pose.finir(); return; }
      poser(cible, a.altKey);
    };
    const surTouche = (k) => { if (k.key === 'Escape') { absorber(k); pose.finir(); } };

    const poser = async (c, garder) => {
      const cr = Ariane.creneauDepuisDrop({ yRel: c.top, hauteurHeure: PXH,
        heureDebut: this._hDeb, jourISO: c.jour, dureeMin: duree });
      if (!cr) return;
      // Poser la copie pile sur un créneau existant de la tâche n'ajouterait
      // rien : on le dit, et la copie reste en main.
      const nv = Ariane.formatCreneau(cr.debut, cr.fin);
      const tache = (this._tachesBrutes || this._taches || []).find((x2) => x2.ref === t.ref) || t;
      if (Ariane.creneauxDeTache([].concat(tache.creneaux || [])).some((c2) => c2.brut === nv)) {
        new obsidian.Notice(tr('Ce créneau existe déjà à cet endroit.'));
        return;
      }
      if (!garder) pose.finir(true);
      this._coalesceRedessin();
      const prevu = this._creneauxAnticipes(t.ref, '', cr.debut, cr.fin);
      await this._majCreneauU(t.ref, { avant: '', debut: cr.debut, fin: cr.fin });
      this._apres(t.ref, { creneaux: prevu });
      // La grille vient d'être redessinée : le guide se recale sans attendre
      // que la souris bouge.
      if (garder && this._pose === pose) planifier();
    };

    pose = {
      // `pose` vrai : la copie rejoint le guide avant de s'effacer, pour que
      // l'œil la suive jusqu'à sa place ; sinon elle s'évanouit sur place.
      finir: (posee) => {
        if (this._pose !== pose) return;
        this._pose = null;
        if (rafId != null) { win.cancelAnimationFrame(rafId); rafId = null; }
        doc.removeEventListener('pointermove', surMouvement, true);
        doc.removeEventListener('pointerdown', surAppui, true);
        doc.removeEventListener('keydown', surTouche, true);
        doc.removeEventListener('scroll', planifier, true);
        doc.body.classList.remove('zfa-cal-pose-en-cours');
        const rg = posee && guide ? guide.getBoundingClientRect() : null;
        oterGuide();
        if (rg) {
          fantome.classList.add('est-posee');
          fantome.style.width = rg.width - 12 + 'px';
          fantome.style.transform = 'translate(' + Math.round(rg.left + 6) + 'px,'
            + Math.round(rg.top) + 'px)';
        } else {
          fantome.classList.add('est-lachee');
        }
        win.setTimeout(() => fantome.remove(), 220);
      },
    };
    this._pose = pose;
    doc.addEventListener('pointermove', surMouvement, true);
    doc.addEventListener('pointerdown', surAppui, true);
    doc.addEventListener('keydown', surTouche, true);
    // La molette fait défiler la grille sous la copie : le guide suit.
    doc.addEventListener('scroll', planifier, true);
    viser();
  }

  // Ce qui n'est PAS du vide dans une colonne : un créneau, un événement, une
  // poignée. Tracer ou double-cliquer là ne crée rien.
  _estVideDeColonne(cible) {
    return !(cible && cible.closest && cible.closest(
      '.zfa-cal-carte, .zfa-cal-evt, .zfa-cal-bloc, .zfa-cal-lignee-btns, .zfa-cal-bloc-guide'));
  }

  // Un créneau vierge dans une colonne : le rectangle qu'on trace, avec ses
  // heures. Positionné en pixels de colonne (0 = minuit, comme les créneaux).
  _brouillonCreneau(col, haut, bas) {
    let el = col.querySelector('.zfa-cal-brouillon');
    if (!el) {
      el = col.createDiv({ cls: 'zfa-cal-brouillon' });
      el.createDiv({ cls: 'zfa-cal-brouillon-heures' });
    }
    el.style.top = haut + 'px';
    el.style.height = (bas - haut) + 'px';
    const PXH = this._pxHeure;
    const hm = (px) => {
      const min = Math.round((px / PXH + (this._hDeb || 0)) * 60);
      return String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
    };
    el.firstChild.textContent = hm(haut) + ' → ' + hm(bas);
    return el;
  }

  // Cliquer-glisser verticalement dans le vide d'une journée : un créneau
  // vierge se dessine, calé au quart d'heure, dans un sens ou dans l'autre.
  // Un simple clic ne fait rien (le double-clic a son propre geste).
  _tracerCreneau(e, col, jour) {
    if (e.button !== 0 || !this._estVideDeColonne(e.target) || this._pose) return;
    const PXH = this._pxHeure;
    const quart = PXH / 4;
    const doc = this._doc();
    const win = this._win();
    const y0 = e.clientY - col.getBoundingClientRect().top;
    const yc0 = e.clientY;
    let brouillon = null;
    let haut = 0;
    let bas = 0;
    let rafId = null;
    let yc = yc0;
    const suivre = () => {
      rafId = null;
      // Relu à chaque image : la molette peut faire défiler la grille pendant
      // le geste, et la colonne avec.
      const r = col.getBoundingClientRect();
      const y = Math.max(0, Math.min(r.height, yc - r.top));
      haut = Math.floor(Math.min(y0, y) / quart) * quart;
      bas = Math.max(haut + quart, Math.ceil(Math.max(y0, y) / quart) * quart);
      brouillon = this._brouillonCreneau(col, haut, bas);
    };
    const bouger = (m) => {
      yc = m.clientY;
      if (!brouillon && Math.abs(yc - yc0) < 5) return;
      if (!brouillon) this._gesteCal = true;
      m.preventDefault();
      if (rafId == null) rafId = win.requestAnimationFrame(suivre);
    };
    const lacher = () => {
      doc.removeEventListener('pointermove', bouger);
      doc.removeEventListener('pointerup', lacher);
      doc.removeEventListener('pointercancel', lacher);
      if (rafId != null) { win.cancelAnimationFrame(rafId); rafId = null; }
      if (!brouillon) return;
      suivre();
      this._gesteCal = false;
      // Le « click » de synthèse qui suit un glissé ne doit rien déclencher.
      doc.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); },
        { capture: true, once: true });
      const cr = Ariane.creneauDepuisDrop({ yRel: haut, hauteurHeure: PXH, heureDebut: this._hDeb,
        jourISO: jour, dureeMin: Math.round(((bas - haut) / PXH) * 60) });
      if (!cr) { brouillon.remove(); return; }
      this._associerCreneau(jour, cr, brouillon);
    };
    doc.addEventListener('pointermove', bouger);
    doc.addEventListener('pointerup', lacher);
    doc.addEventListener('pointercancel', lacher);
  }

  // Double-clic dans le vide d'une journée : un créneau vierge d'une heure,
  // qui commence au quart d'heure cliqué.
  _creneauAuDoubleClic(e, col, jour) {
    if (!this._estVideDeColonne(e.target) || this._pose) return;
    e.preventDefault(); e.stopPropagation();
    const PXH = this._pxHeure;
    const quart = PXH / 4;
    const r = col.getBoundingClientRect();
    const haut = Math.min(Math.floor((e.clientY - r.top) / quart) * quart, r.height - PXH);
    const brouillon = this._brouillonCreneau(col, Math.max(0, haut), Math.max(0, haut) + PXH);
    const cr = Ariane.creneauDepuisDrop({ yRel: Math.max(0, haut), hauteurHeure: PXH,
      heureDebut: this._hDeb, jourISO: jour, dureeMin: 60 });
    if (!cr) { brouillon.remove(); return; }
    this._associerCreneau(jour, cr, brouillon);
  }

  // Le créneau vierge est tracé : on demande sa tâche. Choisie, le créneau
  // s'écrit (annulable comme tout geste) ; « Nouvelle tâche » ouvre le
  // formulaire, et le créneau s'attache à la tâche créée ; abandon : le
  // créneau vierge s'efface.
  _associerCreneau(jour, cr, brouillon) {
    brouillon.classList.add('est-en-attente');
    const oter = () => { if (brouillon.isConnected) brouillon.remove(); };
    const ecrire = async (ref) => {
      this._coalesceRedessin();
      const prevu = this._creneauxAnticipes(ref, '', cr.debut, cr.fin);
      await this._majCreneauU(ref, { avant: '', debut: cr.debut, fin: cr.fin });
      this._apres(ref, { creneaux: prevu });
    };
    const echec = (err) => {
      oter();
      new obsidian.Notice(tr('Créneau non écrit : ') + (err && err.message ? err.message : err));
    };
    const jourLisible = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long' });
    const horaire = jourLisible.charAt(0).toUpperCase() + jourLisible.slice(1)
      + ' · ' + cr.debut.slice(11, 16) + ' → ' + cr.fin.slice(11, 16);
    // Les tâches de CETTE base, celles que la vue montre : on propose ce sur
    // quoi l'on travaille ici, pas tout le coffre.
    const taches = this._tachesBrutes || this._taches
      || (this.greffon.tachesPourGantt ? this.greffon.tachesPourGantt() : []);
    new ModaleTacheDuCreneau(this.app, this.greffon, {
      taches, jour, horaire,
      surChoix: (ref) => { ecrire(ref).catch(echec); },
      surAbandon: oter,
      surNouvelle: (texte) => {
        let creee = false;
        const m = new ModaleTache(this.app, this.greffon, {
          defauts: { intitule: texte },
          apres: (ref) => { creee = true; ecrire(ref).catch(echec); },
        });
        // Le formulaire se ferme puis appelle `apres` : un tour plus tard, on
        // sait s'il a créé la tâche ou s'il a été abandonné.
        const fermer = m.onClose.bind(m);
        m.onClose = () => { fermer(); setTimeout(() => { if (!creee) oter(); }, 0); };
        m.open();
      },
    }).open();
  }

  // Câble dragover/drop sur une cellule de la vue mois : lien externe → créneau
  // ce jour ; charge interne « x-ariane-cal » → déplacement du créneau, ou
  // décalage des dates du span de tâche.
  _brancherDropCellule(cell) {
    cell.addEventListener('dragover', (de) => { de.preventDefault(); cell.addClass('zfa-cal-cible'); });
    cell.addEventListener('dragleave', () => cell.removeClass('zfa-cal-cible'));
    cell.addEventListener('drop', async (de) => {
      cell.removeClass('zfa-cal-cible');
      const cible = cell.dataset.jour;
      const brut = de.dataTransfer.getData('text/x-ariane-cal');
      if (!brut) return this._dropExterne(de, cible, 'mois');
      de.preventDefault();
      const d = JSON.parse(brut);
      const n = Ariane.ecartJours(d.jour, cible);
      if (!n) return;
      const t = this._taches.find((x) => x.ref === d.ref);
      if (!t) return;
      if (d.brut) {
        const cr = Ariane.parseCreneau(d.brut);
        if (!cr) return;
        const nDeb = Ariane.decalerJour(cr.debut.slice(0, 10), n) + 'T' + cr.debut.slice(11);
        const nFin = Ariane.decalerJour(cr.fin.slice(0, 10), n) + 'T' + cr.fin.slice(11);
        this._coalesceRedessin();
        const prevu = this._creneauxAnticipes(d.ref, d.brut, nDeb, nFin);
        await this._majCreneauU(d.ref, { avant: d.brut, debut: nDeb, fin: nFin });
        this._apres(d.ref, { creneaux: prevu });
        return;
      }
      const nd = t.debut ? Ariane.decalerJour(t.debut, n) : '';
      const ne = t.echeance ? Ariane.decalerJour(t.echeance, n) : '';
      if (nd || ne) {
        await this._ecrireDatesU([{ ref: d.ref, debut: nd, echeance: ne }]);
        this._apres(d.ref, { debut: nd, echeance: ne, cible: [nd, ne, []] });
      }
    });
  }

  // Clic (ouvrir), clic droit (menuCarte), survol (aperçu de page) sur une barre
  // ou une pastille de la vue mois.
  _brancherOuvertureCarte(el, t, ev) {
    el.addEventListener('click', (e) => { e.stopPropagation();
      this.ouvrir(t.ref, e.metaKey || e.ctrlKey); });
    el.addEventListener('contextmenu', (e) => this.menuCarte(e, t, ev));
    el.addEventListener('mouseover', (e) => {
      this.app.workspace.trigger('hover-link', { event: e, source: 'zfa-calendrier',
        hoverParent: this, targetEl: el, linktext: t.ref, sourcePath: '' });
    });
  }

  // Vue mois : les tâches non-créneaux sont des BARRES fines continues jusqu'à
  // l'échéance (packing en lignes, coins arrondis seulement aux vraies
  // extrémités) ; les jalons, un losange dans l'en-tête de la case ; les
  // créneaux, une pastille compacte « HH:MM titre » dans la case.
  // Vue mois : jalons en losange dans l'en-tête de la case ; tâches d'une seule
  // journée (pas de début, ou début == échéance) en petites cases ; créneaux en
  // pastilles. Pas de barre multi-jours.
  //#endregion Calendrier · glisser-déposer & gestes

  //#region Calendrier · grilles mois & semaine
  dessinerMois(hote) {
    const g = Ariane.grilleMois(this._ancre);
    const auj = new Date().toISOString().slice(0, 10);
    const enRetard = Ariane.tachesEnRetard(this._taches, auj);

    const jourTaches = new Map();  // jour ISO → [t]  (tâche d'une journée)
    const pastilles = new Map();   // jour ISO → [{ t, ev }]  (créneaux)
    const jalons = new Map();      // jour ISO → [t]
    const pousser = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const t of this._taches) {
      if (t.jalon) {
        const ech = Ariane.jourValide(t.echeance);
        if (ech) pousser(jalons, ech, t);
        continue;
      }
      const crs = Ariane.creneauxDeTache(t);
      if (crs.length) {
        for (const c of crs) {
          pousser(pastilles, c.debut.slice(0, 10), { t, ev: { source: 'creneau',
            debut: c.debut, fin: c.fin, allDay: false, brut: c.brut } });
        }
        continue;
      }
      const ech = Ariane.jourValide(t.echeance);
      if (!ech) continue;
      const deb = Ariane.jourValide(t.debut);
      if (!deb || deb === ech) pousser(jourTaches, ech, t);
      // début != échéance (plage multi-jours) : non affiché en vue mois.
    }

    // Une journée : tâches du jour, créneaux et événements Apple, mêlés dans
    // un seul ordre (la journée entière d'abord, puis l'heure).
    const elementsDu = (jour) => {
      const l = [];
      for (const t of (jourTaches.get(jour) || [])) l.push({ genre: 'tache', t, allDay: true, debut: '' });
      for (const x of (pastilles.get(jour) || [])) {
        l.push({ genre: 'creneau', t: x.t, ev: x.ev, debut: x.ev.debut });
      }
      const fj = this._fondDuJour(jour);
      for (const e of fj.jour) l.push({ genre: 'evt', e, allDay: true, debut: e.debut });
      for (const e of fj.horaires) l.push({ genre: 'evt', e, debut: e.debut });
      return Ariane.trierElementsJour(l);
    };
    this._enRetardMois = enRetard;
    this._elementsMois = elementsDu;

    // Une seule grille CSS de 7 colonnes égales : en-tête et semaines partagent
    // les mêmes pistes, donc tout s'aligne, et rien ne déborde à droite. Les
    // rangées se partagent la hauteur : une journée chargée ne pousse plus sa
    // semaine, elle se replie en « +N de plus » (_replierCellulesMois).
    const grille = hote.createDiv({ cls: 'zfa-cal-mois-grille' });
    grille.style.setProperty('--zfa-cal-semaines', String(g.semaines.length));
    const ent = grille.createDiv({ cls: 'zfa-cal-jour-entete-ligne' });
    ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach((d, i) => {
      ent.createDiv({ cls: 'zfa-cal-jour-entete' + (i >= 5 ? ' est-weekend' : ''), text: tr(d) });
    });
    const moisCourt = (jour) => new Date(jour + 'T12:00:00')
      .toLocaleDateString('fr-FR', { month: 'short' }).replace(/\.$/, '');

    for (const semaine of g.semaines) {
      const wk = grille.createDiv({ cls: 'zfa-cal-msem' });
      const cells = wk.createDiv({ cls: 'zfa-cal-msem-cells' });
      semaine.forEach((jour, di) => {
        const cell = cells.createDiv({ cls: 'zfa-cal-cellule' });
        cell.dataset.jour = jour;
        this._brancherDropCellule(cell);
        if (di >= 5) cell.addClass('est-weekend');
        if (jour === auj) cell.addClass('est-aujourdhui');
        if (jour.slice(0, 7) !== g.moisDebut.slice(0, 7)) cell.addClass('hors-mois');
        if (this._jourSel === jour) cell.addClass('est-selection');
        const surCarte = (e) => e.target.closest(
          '.zfa-cal-carte, .zfa-cal-pastille, .zfa-cal-jalon, .zfa-cal-evt, .zfa-cal-plus, .zfa-cal-quantieme');
        cell.addEventListener('click', (e) => {
          if (surCarte(e)) return;
          this._jourSel = (this._jourSel === jour) ? '' : jour;
          this.dessiner();
        });
        cell.addEventListener('contextmenu', (e) => {
          if (surCarte(e)) return;
          this.menuCellule(e, jour);
        });

        const tete = cell.createDiv({ cls: 'zfa-cal-tete' });
        for (const t of (jalons.get(jour) || [])) {
          const jd = tete.createSpan({ cls: 'zfa-cal-jalon'
            + (enRetard.has(t.ref) ? ' est-retard' : '') });
          obsidian.setIcon(jd, 'diamond');
          jd.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
          jd.dataset.ref = t.ref;
          jd.title = t.ref + ' · ' + (t.intitule || '');
          this._brancherOuvertureCarte(jd, t, { source: 'dates', allDay: true });
        }
        // Le numéro du jour ouvre sa semaine. Le 1er porte le nom du mois :
        // la frontière entre deux mois se lit d'un coup d'œil.
        const num = Number(jour.slice(8, 10));
        const q = tete.createSpan({ cls: 'zfa-cal-quantieme'
          + (jour === auj ? ' est-aujourdhui' : '') + (num === 1 ? ' est-premier' : ''),
          text: num === 1 ? '1 ' + moisCourt(jour) : String(num) });
        q.title = tr('Voir cette semaine');
        q.addEventListener('click', async (e) => {
          e.stopPropagation();
          this._ancre = Ariane.grilleSemaine(jour).lundi;
          await this.ctx.ecrire('calMode', 'semaine');
          this.dessiner();
        });

        const corps = cell.createDiv({ cls: 'zfa-cal-cellule-corps' });
        for (const x of elementsDu(jour)) this._elementMois(corps, x, jour);
      });
    }
    // Le repli se mesure une fois la grille posée : c'est la hauteur réelle
    // de chaque case qui dit combien d'éléments y tiennent. Et il se remesure
    // à chaque changement de taille : une grille dessinée cachée (onglet en
    // arrière-plan, volet pas encore affiché) mesure zéro, et n'aurait jamais
    // eu son « +N » une fois montrée.
    const win = this._win();
    win.requestAnimationFrame(() => this._replierCellulesMois(grille));
    if (win.ResizeObserver) {
      let attendu = false;
      const obs = new win.ResizeObserver(() => {
        if (!grille.isConnected) { obs.disconnect(); return; }
        if (attendu) return;
        attendu = true;
        win.requestAnimationFrame(() => { attendu = false; this._replierCellulesMois(grille); });
      });
      obs.observe(grille);
      (this._observateursMois || (this._observateursMois = [])).push(obs);
    }
  }

  // Un élément d'une journée de la vue mois (ou de sa bulle « +N ») : une
  // ligne, heure en tête, à la couleur de sa tâche ou de son calendrier.
  _elementMois(hote, x, jour) {
    const enRetard = this._enRetardMois || new Set();
    if (x.genre === 'tache') {
      const c = this.rendreCarte(hote, x.t, { source: 'dates', allDay: true },
        { compact: true, avecCoche: true, enRetard: enRetard.has(x.t.ref) });
      if (c) c.classList.add('zfa-cal-m-el');
      return c;
    }
    if (x.genre === 'creneau') {
      const { t, ev } = x;
      const p = hote.createDiv({ cls: 'zfa-cal-pastille zfa-cal-m-el'
        + (enRetard.has(t.ref) ? ' est-retard' : '') });
      p.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
      p.dataset.ref = t.ref;
      p.dataset.brut = ev.brut;
      p.createSpan({ cls: 'zfa-cal-pastille-h', text: ev.debut.slice(11, 16) });
      p.createSpan({ cls: 'zfa-cal-m-titre', text: t.intitule || t.ref });
      p.title = t.ref + ' · ' + (t.intitule || '') + '\n'
        + ev.debut.slice(11, 16) + ' → ' + ev.fin.slice(11, 16);
      this._brancherOuvertureCarte(p, t, ev);
      p.setAttribute('draggable', 'true');
      p.addEventListener('dragstart', (de) => {
        de.dataTransfer.setData('text/x-ariane-cal', JSON.stringify({ ref: t.ref, jour, brut: ev.brut }));
        de.dataTransfer.effectAllowed = 'move';
        this._fermerJourMois();
      });
      return p;
    }
    const e = x.e;
    const ch = hote.createDiv({ cls: 'zfa-cal-evt est-compacte zfa-cal-m-el' });
    if (e.couleur) ch.style.setProperty('--zfa-cal-coul', e.couleur);
    if (!e.allDay && e.debut && e.debut.length > 15) {
      ch.createSpan({ cls: 'zfa-cal-evt-h', text: e.debut.slice(11, 16) });
    }
    ch.createSpan({ cls: 'zfa-cal-m-titre', text: e.titre || tr('(sans titre)') });
    ch.title = (e.titre || '') + (e.calendrier ? ' · ' + e.calendrier : '');
    this._brancherEvenement(ch, e);
    return ch;
  }

  // Une case trop pleine garde ce qui tient et replie le reste derrière
  // « +N de plus », qui ouvre la journée entière. Rien n'est plus tassé
  // jusqu'à l'illisible.
  _replierCellulesMois(grille) {
    if (this._detruit || !grille.isConnected) return;
    for (const corps of Array.from(grille.querySelectorAll('.zfa-cal-cellule-corps'))) {
      corps.querySelectorAll('.zfa-cal-plus').forEach((x) => x.remove());
      const enfants = Array.from(corps.children);
      enfants.forEach((c) => c.classList.remove('est-replie'));
      if (corps.scrollHeight <= corps.clientHeight + 1) continue;
      const cell = corps.closest('.zfa-cal-cellule');
      const jour = cell && cell.dataset.jour;
      const plus = corps.createDiv({ cls: 'zfa-cal-plus' });
      let caches = 0;
      for (let i = enfants.length - 1; i >= 0 && corps.scrollHeight > corps.clientHeight + 1; i -= 1) {
        enfants[i].classList.add('est-replie');
        caches += 1;
        plus.textContent = tr('+{n} de plus').replace('{n}', String(caches));
      }
      plus.addEventListener('click', (e) => {
        e.stopPropagation();
        if (jour) this._ouvrirJourMois(jour, cell);
      });
    }
  }

  // La journée entière, dans une bulle posée sur sa case : tout y est, et
  // chaque élément garde ses gestes (ouvrir, menu, glisser vers un autre jour).
  _ouvrirJourMois(jour, cell) {
    this._fermerJourMois();
    const doc = this._doc();
    const bulle = doc.createElement('div');
    bulle.className = 'zfa-cal-jour-bulle';
    const tete = bulle.createDiv({ cls: 'zfa-cal-jour-bulle-tete' });
    const lisible = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long' });
    tete.createSpan({ text: lisible.charAt(0).toUpperCase() + lisible.slice(1) });
    const semaine = tete.createEl('button', { cls: 'zfa-cal-jour-bulle-semaine', text: tr('Semaine') });
    semaine.addEventListener('click', async () => {
      this._fermerJourMois();
      this._ancre = Ariane.grilleSemaine(jour).lundi;
      await this.ctx.ecrire('calMode', 'semaine');
      this.dessiner();
    });
    const corps = bulle.createDiv({ cls: 'zfa-cal-jour-bulle-corps' });
    for (const x of (this._elementsMois ? this._elementsMois(jour) : [])) this._elementMois(corps, x, jour);
    doc.body.appendChild(bulle);

    // Posée sur la case, élargie, et gardée dans la fenêtre.
    const r = cell.getBoundingClientRect();
    const larg = Math.max(r.width + 24, 260);
    const vue = doc.documentElement;
    const x = Math.min(Math.max(8, r.left - 12), vue.clientWidth - larg - 8);
    bulle.style.width = larg + 'px';
    bulle.style.left = x + 'px';
    const h = bulle.getBoundingClientRect().height;
    bulle.style.top = Math.max(8, Math.min(r.top - 6, vue.clientHeight - h - 8)) + 'px';

    const dehors = (e) => { if (!bulle.contains(e.target)) this._fermerJourMois(); };
    const echap = (e) => { if (e.key === 'Escape') this._fermerJourMois(); };
    this._win().setTimeout(() => {
      doc.addEventListener('pointerdown', dehors, true);
      doc.addEventListener('keydown', echap, true);
    }, 0);
    this._bulleJour = { bulle, fermer: () => {
      doc.removeEventListener('pointerdown', dehors, true);
      doc.removeEventListener('keydown', echap, true);
      bulle.remove();
    } };
  }

  _fermerJourMois() {
    if (!this._bulleJour) return;
    const b = this._bulleJour;
    this._bulleJour = null;
    try { b.fermer(); } catch (e) { /* fenêtre partie */ }
  }

  _plageHoraire() {
    const h = (s, def) => {
      const m = String(this.lire(s) || '').match(/^(\d{1,2}):(\d{2})$/);
      return m ? Number(m[1]) + Number(m[2]) / 60 : def;
    };
    let d = h('calHeureDebut', 7);
    let f = h('calHeureFin', 21);
    if (f <= d) { d = 7; f = 21; }
    return { debut: d, fin: f };
  }

  // Vue semaine façon Apple Calendar : une bande de 21 jours (7 visibles) à
  // défilement natif horizontal (au jour près, sans calage à la semaine) et
  // vertical (les heures). En-tête et bandeau « tout le jour » suivent le
  // défilement horizontal ; l'axe des heures reste collé à gauche.
  dessinerSemaine(hote) {
    const auj = new Date().toISOString().slice(0, 10);
    const enRetard = Ariane.tachesEnRetard(this._taches, auj);
    // Journée entière (0 h → 24 h) : le défilement vertical parcourt toutes les
    // heures ; on se place au début de la plage réglée à l'ouverture.
    const hDeb = 0;
    const hFin = 24;
    const hVue = this._plageHoraire().debut;
    const PXH = this._pxHeureCourant();
    const AXE = 52;
    const TAMPON = 43;   // 7 visibles + ~18 jours de marge de chaque côté
    const CENTRE = 21;   // index de _ancre dans la bande
    const jours = Array.from({ length: TAMPON }, (_, i) => Ariane.decalerJour(this._ancre, i - CENTRE));
    this._pxHeure = PXH; this._hDeb = hDeb; this._joursSemaine = jours.slice(CENTRE, CENTRE + 7);
    const dispo = hote.clientWidth || this.racine.clientWidth || 900;
    const colW = Math.max(64, Math.floor((dispo - AXE) / 7));
    this._semStrip = jours; this._semColW = colW;
    const jourNom = (j) => tr(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][
      (new Date(j + 'T12:00:00').getDay() + 6) % 7]).toLowerCase() + '.';

    // Créneaux → blocs horaires. Bandeau « tout le jour » : SEULEMENT les jalons
    // et les tâches d'une seule journée (pas de début, ou début == échéance).
    // Les plages multi-jours ne s'affichent pas ici pour l'instant.
    const horaire = new Map(jours.map((j) => [j, []]));
    const toutJour = new Map(jours.map((j) => [j, []]));
    for (const t of this._taches) {
      const crs = Ariane.creneauxDeTache(t);
      if (crs.length) {
        for (const c of crs) {
          const j = c.debut.slice(0, 10);
          if (horaire.has(j)) horaire.get(j).push({ t, ev: { source: 'creneau',
            debut: c.debut, fin: c.fin, allDay: false, brut: c.brut } });
        }
        continue;
      }
      const ech = Ariane.jourValide(t.echeance);
      if (!ech || !toutJour.has(ech)) continue;
      const deb = Ariane.jourValide(t.debut);
      if (t.jalon || !deb || deb === ech) {
        toutJour.get(ech).push({ t, ev: { source: 'dates', debut: ech,
          fin: Ariane.decalerJour(ech, 1), allDay: true, jalon: !!t.jalon } });
      }
    }

    // --- En-tête des jours ---
    const tete = hote.createDiv({ cls: 'zfa-cal-sem-tete' });
    tete.createDiv({ cls: 'zfa-cal-sem-gout' });
    const teteDefil = tete.createDiv({ cls: 'zfa-cal-sem-defil' });
    const tetePiste = teteDefil.createDiv({ cls: 'zfa-cal-sem-piste' });
    tetePiste.style.width = (jours.length * colW) + 'px';
    for (const j of jours) {
      const cel = tetePiste.createDiv({ cls: 'zfa-cal-sem-jour'
        + (j === auj ? ' est-aujourdhui' : '') + (this._jourSel === j ? ' est-selection' : '') });
      cel.style.width = colW + 'px';
      cel.createSpan({ cls: 'zfa-cal-sem-jour-nom', text: jourNom(j) });
      cel.createSpan({ cls: 'zfa-cal-sem-jour-num', text: String(Number(j.slice(8, 10))) });
      cel.addEventListener('click', () => {
        this._jourSel = (this._jourSel === j) ? '' : j; this.dessiner();
      });
    }

    // --- Bandeau « tout le jour » (toujours présent, sans repli) ---
    const bandeau = hote.createDiv({ cls: 'zfa-cal-bandeau' });
    bandeau.style.height = this._hBandeauCourant() + 'px';
    bandeau.createDiv({ cls: 'zfa-cal-sem-gout' });
    const bDefil = bandeau.createDiv({ cls: 'zfa-cal-sem-defil' });
    const bPiste = bDefil.createDiv({ cls: 'zfa-cal-sem-piste' });
    bPiste.style.width = (jours.length * colW) + 'px';
    const PLAFOND = 3;
    for (const j of jours) {
      const col = bPiste.createDiv({ cls: 'zfa-cal-bandeau-jour'
        + (j === auj ? ' est-aujourdhui' : '') });
      col.dataset.jour = j;
      col.style.width = colW + 'px';
      if (this._jourSel === j) col.addClass('est-selection');
      col.addEventListener('click', (e) => {
        if (e.target.closest('.zfa-cal-carte, .zfa-cal-bjalon')) return;
        this._jourSel = (this._jourSel === j) ? '' : j; this.dessiner();
      });
      col.addEventListener('dragover', (de) => { de.preventDefault(); col.addClass('zfa-cal-cible'); });
      col.addEventListener('dragleave', () => col.removeClass('zfa-cal-cible'));
      col.addEventListener('drop', (de) => {
        col.removeClass('zfa-cal-cible');
        if (this._dropJalon(de, col.dataset.jour, 'bandeau')) return;
        this._dropExterne(de, col.dataset.jour, 'mois');
      });
      const liste = toutJour.get(j).slice().sort(Ariane.comparerEmpilement);
      let deplie = false;
      const rendre = () => {
        col.findAll('.zfa-cal-carte, .zfa-cal-bjalon, .zfa-cal-bandeau-plus, .zfa-cal-evt').forEach((n) => n.remove());
        const { montres, reste } = deplie
          ? { montres: liste, reste: 0 } : Ariane.replierListe(liste, PLAFOND);
        for (const { t, ev } of montres) {
          if (ev.jalon) {
            const jp = col.createDiv({ cls: 'zfa-cal-bjalon'
              + (enRetard.has(t.ref) ? ' est-retard' : '') });
            jp.dataset.ref = t.ref;
            jp.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
            const ic = jp.createSpan({ cls: 'zfa-cal-bjalon-ic' });
            obsidian.setIcon(ic, 'diamond');
            jp.createSpan({ cls: 'zfa-cal-bjalon-t', text: t.intitule || t.ref });
            jp.title = t.ref + ' · ' + (t.intitule || '');
            this._brancherOuvertureCarte(jp, t, ev);
            // Glissable : vers un autre jour du bandeau (le jalon change de
            // date) ou dans la grille des heures (il devient une tâche avec
            // un créneau à cet endroit).
            jp.setAttribute('draggable', 'true');
            jp.addEventListener('dragstart', (de) => {
              de.dataTransfer.setData('text/x-ariane-cal', JSON.stringify({ ref: t.ref, jour: j, brut: '', jalon: true }));
              de.dataTransfer.setData('text/x-ariane-tache', t.ref);
              de.dataTransfer.effectAllowed = 'move';
            });
          } else {
            const carte = this.rendreCarte(col, t, ev, { compact: true, avecCoche: true });
            // Tâche sans créneau, portée par ses dates : glissable comme un
            // jalon (vers un autre jour, ou dans la grille pour lui donner un
            // créneau).
            if (carte && !ev.brut) {
              carte.setAttribute('draggable', 'true');
              carte.addEventListener('dragstart', (de) => {
                de.dataTransfer.setData('text/x-ariane-cal', JSON.stringify({ ref: t.ref, jour: j, brut: '', dates: true }));
                de.dataTransfer.setData('text/x-ariane-tache', t.ref);
                de.dataTransfer.effectAllowed = 'move';
              });
            }
          }
        }
        if (reste) {
          const plus = col.createDiv({ cls: 'zfa-cal-bandeau-plus', text: '+' + reste });
          plus.onclick = (e) => { e.stopPropagation(); deplie = true; rendre(); };
        }
        // Événements Apple « journée entière » du jour → chips zfa-cal-evt.
        for (const e of this._fondDuJour(j).jour) {
          const ch = col.createDiv({ cls: 'zfa-cal-evt est-jour' });
          if (e.couleur) ch.style.setProperty('--zfa-cal-coul', e.couleur);
          ch.createDiv({ cls: 'zfa-cal-evt-t', text: e.titre || tr('(sans titre)') });
          ch.title = (e.titre || '') + (e.calendrier ? ' · ' + e.calendrier : '');
          this._brancherEvenement(ch, e);
        }
      };
      rendre();
    }

    // Poignée de redimensionnement : bande fine sur le bord bas du bandeau, grip
    // visible à gauche (au-dessus de la gouttière). ownerDocument → fonctionne
    // aussi dans une 2ᵉ fenêtre Obsidian.
    const poignee = bandeau.createDiv({ cls: 'zfa-cal-bandeau-poignee' });
    poignee.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const doc = poignee.ownerDocument;
      const h0 = bandeau.getBoundingClientRect().height;
      const y0 = e.clientY;
      const bouger = (mv) => {
        bandeau.style.height = Ariane.clampHauteurBandeau(h0 + (mv.clientY - y0)) + 'px';
      };
      const lacher = () => {
        doc.removeEventListener('pointermove', bouger);
        doc.removeEventListener('pointerup', lacher);
        this.ctx.ecrire('calBandeauH',
          Ariane.clampHauteurBandeau(bandeau.getBoundingClientRect().height));
      };
      doc.addEventListener('pointermove', bouger);
      doc.addEventListener('pointerup', lacher);
    });

    // --- Bas : axe des heures (fixe) + grille des jours (défilement X + Y) ---
    const hauteurInner = (hFin - hDeb) * PXH;
    const bas = hote.createDiv({ cls: 'zfa-cal-sem-bas' });
    const axe = bas.createDiv({ cls: 'zfa-cal-sem-axe' });
    const axeInner = axe.createDiv({ cls: 'zfa-cal-sem-axe-inner' });
    axeInner.style.height = hauteurInner + 'px';
    for (let h = Math.ceil(hDeb) + 1; h < hFin; h += 1) {
      const l = axeInner.createDiv({ cls: 'zfa-cal-axe-heure', text: h + ' h' });
      l.style.top = ((h - hDeb) * PXH) + 'px';
    }
    const corps = bas.createDiv({ cls: 'zfa-cal-sem-corps' });
    const inner = corps.createDiv({ cls: 'zfa-cal-sem-inner' });
    inner.style.width = (jours.length * colW) + 'px';
    inner.style.height = hauteurInner + 'px';
    // Quadrillage dynamique : heures pleines, plus les demies quand on est un
    // peu zoomé, plus les quarts quand on l'est beaucoup.
    const poserTrait = (heure, cls) => {
      const tr2 = inner.createDiv({ cls: 'zfa-cal-trait' + (cls ? ' ' + cls : '') });
      tr2.style.top = ((heure - hDeb) * PXH) + 'px';
    };
    for (let h = Math.ceil(hDeb) + 1; h < hFin; h += 1) poserTrait(h, '');
    if (PXH >= 54) for (let h = Math.ceil(hDeb); h < hFin; h += 1) poserTrait(h + 0.5, 'demi');
    if (PXH >= 96) {
      for (let h = Math.ceil(hDeb); h < hFin; h += 1) { poserTrait(h + 0.25, 'quart'); poserTrait(h + 0.75, 'quart'); }
    }
    // Ctrl/⌘ + molette : zoom vertical de la grille.
    corps.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this._zoomerSemaine(e.deltaY < 0 ? 8 : -8);
    }, { passive: false });
    jours.forEach((j, di) => {
      const col = inner.createDiv({ cls: 'zfa-cal-col'
        + (j === auj ? ' est-aujourdhui' : '') + (this._jourSel === j ? ' est-selection' : '') });
      col.dataset.jour = j;
      col.style.left = (di * colW) + 'px';
      col.style.width = colW + 'px';
      col.addEventListener('dragover', (de) => { de.preventDefault(); col.addClass('zfa-cal-cible'); });
      col.addEventListener('dragleave', () => col.removeClass('zfa-cal-cible'));
      col.addEventListener('drop', (de) => {
        col.removeClass('zfa-cal-cible');
        if (this._dropJalon(de, col.dataset.jour, 'grille')) return;
        this._dropExterne(de, col.dataset.jour, 'semaine');
      });
      col.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.zfa-cal-carte')) return;
        this.menuCellule(e, col.dataset.jour);
      });
      // Tracer un créneau vierge : cliquer-glisser dans le vide d'une journée,
      // ou double-cliquer (une heure). Au lâcher, on choisit sa tâche.
      col.addEventListener('pointerdown', (e) => this._tracerCreneau(e, col, j));
      col.addEventListener('dblclick', (e) => this._creneauAuDoubleClic(e, col, j));

      const fondJour = this._fondDuJour(j);
      // Créneaux + événements Apple réels : une même liste, placés côte à côte
      // par disposerBlocsJour quand ils se chevauchent.
      const elems = horaire.get(j).map((x) => ({ kind: 'creneau', t: x.t, ev: x.ev,
        cle: x.ev.debut }))
        .concat(fondJour.horaires.map((e) => ({ kind: 'evt', e, cle: e.debut })))
        .sort((a, b) => (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
      const mn = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
      const blocs = elems.map((it) => {
        const dISO = it.kind === 'creneau' ? it.ev.debut : it.e.debut;
        const fISO = it.kind === 'creneau' ? it.ev.fin : it.e.fin;
        const d = mn(dISO);
        let f = (fISO && fISO.slice(0, 10) === j) ? mn(fISO) : 24 * 60;
        if (f <= d) f = d + 15;
        return { deb: d, fin: f };
      });
      const lay = Ariane.disposerBlocsJour(blocs);
      // Activité réelle : sa colonne occupe la marge gauche, que les blocs
      // cèdent pour ne pas la recouvrir.
      const reel = this._activiteVisible();
      if (reel) this._rendreActivite(col, j, hDeb, PXH, mn);
      const mg = reel ? 16 : 6;
      elems.forEach((it, k) => {
        const y0 = (blocs[k].deb / 60 - hDeb) * PXH;
        const y1 = (blocs[k].fin / 60 - hDeb) * PXH;
        const haut = Math.max(16, y1 - Math.max(0, y0));
        const maxLignes = Math.max(1, Math.floor((haut - 6) / 16));
        let bloc;
        if (it.kind === 'creneau') {
          const t = it.t;
          const ev = it.ev;
          bloc = this.rendreCarte(col, t, ev,
            { maxLignes, avecHeure: true, avecCoche: true, enRetard: enRetard.has(t.ref) });
          bloc.classList.add('zfa-cal-bloc');
          // Début canonique du créneau : sert aux traits de lignée (reliage
          // des tâches parentes / bloquantes présentes sur la vue).
          bloc.dataset.debut = ev.debut;
          bloc.dataset.fin = ev.fin || '';
          bloc.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j));
          const poi = bloc.createDiv({ cls: 'zfa-cal-poignee' });
          poi.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j, 'fin'));
          // Même geste par le haut : on tire le début, la fin reste en place.
          const poiHaut = bloc.createDiv({ cls: 'zfa-cal-poignee-haut' });
          poiHaut.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j, 'debut'));
          // Bandeau d'actions révélé au survol : commentaire (toujours), puis
          // lignée (mères / filles) quand la tâche en a. Le panneau de lignée
          // reste ouvert pour faire glisser plusieurs cartes à la suite ; il ne
          // ferme que sur un nouveau clic sur le bouton, Échap, un changement
          // de fenêtre, ou la fermeture de la vue.
          const btns = bloc.createDiv({ cls: 'zfa-cal-lignee-btns' });
          const btDup = btns.createDiv({ cls: 'zfa-cal-lignee-btn',
            attr: { 'aria-label': tr('Dupliquer ce créneau'), title: tr('Dupliquer ce créneau') } });
          obsidian.setIcon(btDup, 'copy-plus');
          btDup.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
          btDup.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            this._dupliquerCreneau(t, ev, bloc, e);
          });
          const btCom = btns.createDiv({ cls: 'zfa-cal-lignee-btn',
            attr: { 'aria-label': tr('Commentaire…'), title: tr('Commentaire…') } });
          obsidian.setIcon(btCom, 'message-square');
          btCom.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
          btCom.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            this._ouvrirCommentaire(t, ev);
          });
          const infos = this._hier && this._hier.parRef.get(t.ref);
          const nbMeres = infos ? (this._hier.meres.get(t.ref) || []).length - 1 : 0;
          const nbFilles = infos ? (this._hier.filles.get(t.ref) || []).length : 0;
          for (const [sens, icone, nb, label] of [
            ['meres', 'chevrons-up', nbMeres, tr('Tâches mères')],
            ['filles', 'chevrons-down', nbFilles, tr('Tâches filles')],
          ]) {
            if (nb <= 0) continue;
            const bt = btns.createDiv({ cls: 'zfa-cal-lignee-btn',
              attr: { 'aria-label': label + ' (' + nb + ')', title: label + ' (' + nb + ')' } });
            obsidian.setIcon(bt, icone);
            bt.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            bt.addEventListener('click', (e) => {
              e.stopPropagation(); e.preventDefault();
              this._basculeLignee(t.ref, sens, bt);
            });
          }
          bloc.tabIndex = 0;
          bloc.addEventListener('keydown', async (de) => {
            if (de.key === 'Delete' || de.key === 'Backspace') {
              de.preventDefault();
              await this._majCreneauU(t.ref, { avant: ev.brut, debut: '', fin: '' });
              this._apres(t.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
            }
          });
        } else {
          bloc = this._rendreEvenement(col, it.e, maxLignes);
          bloc.classList.add('zfa-cal-bloc');
        }
        bloc.style.top = Math.max(0, y0) + 'px';
        bloc.style.height = haut + 'px';
        // Retrait (6 px de chaque côté) : les blocs ne touchent pas les filets
        // de colonne, comme dans obsidian-day-planner — et il reste de l'air
        // entre deux colonnes pour que les courbes de lignée respirent.
        bloc.style.left = 'calc(' + (lay[k].col / lay[k].ncols * 100) + '% + ' + mg + 'px)';
        bloc.style.width = 'calc(' + (100 / lay[k].ncols) + '% - ' + (mg + 6) + 'px)';
        if (y0 < 0) bloc.classList.add('zfa-cal-bloc-tronque-haut');
        if (y1 > hauteurInner) bloc.classList.add('zfa-cal-bloc-tronque-bas');
      });

      if (j === auj) {
        const now = new Date();
        const nowH = now.getHours() + now.getMinutes() / 60;
        if (nowH >= hDeb && nowH <= hFin) {
          const nl = col.createDiv({ cls: 'zfa-cal-now' });
          nl.style.top = ((nowH - hDeb) * PXH) + 'px';
        }
      }
    });

    // Traits de lignée au survol : passer la souris sur un créneau révèle les
    // traits qui relient TOUS ses créneaux à ceux des tâches liées (mère/fille,
    // bloquante/bloquée) présentes sur la vue — gris = parenté, accent =
    // blocage, nœuds aux extrémités, comme la lignée de la frise. Rien au
    // repos. Délégation sur la grille : les blocs sont reconstruits à chaque
    // rendu, inutile de poser un écouteur sur chacun.
    inner.addEventListener('mouseover', (e) => {
      const c = e.target.closest('.zfa-cal-bloc.est-horaire');
      if (c && c.dataset.ref) this._montrerLigneeSemaine(inner, c.dataset.ref);
    });
    inner.addEventListener('mouseout', (e) => {
      const c = e.target.closest('.zfa-cal-bloc.est-horaire');
      const v = e.relatedTarget;
      if (c && !(v && v.closest && v.closest('.zfa-cal-bloc.est-horaire') === c)) {
        this._effacerLigneeSemaine(inner);
      }
    });

    this._peindreTravailReel(inner);

    // Clic droit : un seul gestionnaire délégué sur la grille (fiable même si un
    // écouteur par élément a été avalé). Carte/jalon → menu de la tâche ;
    // sinon, la colonne/jour sous le curseur → menu de cellule.
    hote.addEventListener('contextmenu', (e) => {
      const carte = e.target.closest('.zfa-cal-carte, .zfa-cal-bjalon');
      if (carte && carte.dataset.ref) {
        const t = this._taches.find((x) => x.ref === carte.dataset.ref);
        if (t) return this.menuCarte(e, t,
          { source: carte.dataset.brut ? 'creneau' : 'dates', brut: carte.dataset.brut || '' });
      }
      const jc = e.target.closest('[data-jour]');
      if (jc && jc.dataset.jour) this.menuCellule(e, jc.dataset.jour);
    });

    // --- Synchronisation du défilement + recalage au bord du tampon ---
    // Le calage sur un jour « au propre » est natif (scroll-snap CSS), fluide au
    // relâchement. Le tampon de 43 jours laisse ~18 jours de marge : on ne
    // recale l'ancre (reconstruction hors écran) qu'au vrai bord, avec un
    // verrou anti-emballement pour ne pas enchaîner les recalages sous l'inertie.
    const sync = () => {
      tetePiste.style.transform = 'translateX(' + (-corps.scrollLeft) + 'px)';
      bPiste.style.transform = 'translateX(' + (-corps.scrollLeft) + 'px)';
      axeInner.style.transform = 'translateY(' + (-corps.scrollTop) + 'px)';
    };
    // Le jour de référence (_ancre) suit la PREMIÈRE COLONNE VISIBLE, à chaque
    // défilement. Il ne bougeait qu'au bord de la bande : un redessin (et toute
    // modification en provoque un) replaçait alors en tête le jour d'ouverture,
    // c'est-à-dire aujourd'hui, et renvoyait au présent quiconque travaillait
    // dans le passé. Précédent / suivant partent aussi de ce que l'on voit.
    let idxVu = CENTRE;
    corps.addEventListener('scroll', () => {
      sync();
      this._semScrollTop = corps.scrollTop;
      const idx = Math.max(0, Math.min(TAMPON - 1, Math.round(corps.scrollLeft / colW)));
      if (idx !== idxVu && !this._detruit) {
        idxVu = idx;
        this._ancre = jours[idx];
        const titre = this.racine.querySelector('.zfa-cal-titre');
        if (titre) titre.textContent = this.titrePeriode();
      }
      if (this._enRecalage) return;
      clearTimeout(this._semScrollMinuterie);
      this._semScrollMinuterie = setTimeout(() => {
        if (this._detruit || this._enRecalage) return;
        const idxG = corps.scrollLeft / colW;
        if (idxG < 4 || idxG > TAMPON - 11) {
          const shift = Math.round(idxG) - CENTRE;
          if (shift !== 0) {
            this._enRecalage = true;
            this._recalerSemaine(hote);
            setTimeout(() => { this._enRecalage = false; }, 450);
          }
        }
      }, 320);
    });
    sync();
    corps.scrollLeft = CENTRE * colW;
    corps.scrollTop = this._semScrollTop != null ? this._semScrollTop : (hVue * PXH);
  }

  // Traits de lignée de la vue semaine, révélés au survol d'un créneau : une
  // surcouche SVG sur la grille relie TOUS les créneaux de la tâche survolée à
  // TOUS ceux de chaque tâche liée directe — mère→fille en gris,
  // bloqueur→bloquée en accent — présents sur la vue (portée d'une vue de
  // 7 jours). Même langage que la lignée de la frise ; rien au repos. La
  // surcouche ne capte aucun pointeur : colonnes, menus et glissés restent
  // intacts.
  // Le travail réel, relevé par le compteur de temps, peint par-dessus la
  // vue semaine sans la reconstruire : une jauge dans chaque créneau entamé
  // (le temps passé sur sa tâche pendant sa durée), et un liseré au bord de
  // chaque jour (toutes les sessions, à la couleur de la tâche travaillée).
  // Repeint chaque minute par le greffon, et à chaque dessin.
  // `inner` : la grille à peindre ; sans elle, toutes celles de la vue (un
  // recalage en construit une seconde hors écran avant l'échange).
  _peindreTravailReel(inner) {
    if (this._detruit || this.mode !== 'semaine') return;
    if (!inner) {
      for (const i of this.racine.querySelectorAll('.zfa-cal-sem-inner')) this._peindreTravailReel(i);
      return;
    }
    for (const x of inner.querySelectorAll('.zfa-cal-presence, .zfa-cal-jauge, .zfa-cal-jauge-val')) x.remove();
    const g = this.greffon;
    if (g.settings.calTravailReel === false || !g.sessionsTravail) return;
    const sessions = g.sessionsTravail();
    if (!sessions.length) return;
    const PXH = this._pxHeure;
    const hDeb = this._hDeb || 0;
    const parRef = new Map(this._taches.map((t) => [t.ref, t]));
    const cheminsDe = new Map();
    const refsDeChemin = new Map();
    for (const t of this._taches) {
      const f = t.fichier || (g.fichierDeRef && g.fichierDeRef(t.ref));
      if (!f) continue;
      const ch = [f.path].concat(g._cheminsLiesTache(Object.assign({}, t, { fichier: f })));
      cheminsDe.set(t.ref, ch);
      for (const c of ch) {
        if (!refsDeChemin.has(c)) refsDeChemin.set(c, []);
        refsDeChemin.get(c).push(t.ref);
      }
    }
    const duree = (m) => (m < 60 ? m + ' min'
      : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''));
    const maintenant = Ariane.instantSession(new Date());

    // B · la jauge des créneaux entamés.
    const creneaux = [];
    for (const bloc of inner.querySelectorAll('.zfa-cal-bloc[data-ref][data-brut]')) {
      const { ref, debut, fin } = bloc.dataset;
      if (!debut || !fin) continue;
      creneaux.push({ ref, debut, fin });
      if (debut > maintenant) continue;
      const fait = Ariane.minutesTravaillees(debut, fin, sessions, cheminsDe.get(ref) || []);
      if (fait <= 0) continue;
      const prevu = Ariane.dureeCreneauMin(debut, fin);
      const j = bloc.createDiv({ cls: 'zfa-cal-jauge' });
      j.style.height = Math.min(100, Math.round(fait / prevu * 100)) + '%';
      const lib = duree(fait) + ' / ' + duree(prevu);
      j.setAttribute('aria-label', tr('Travail réel : ') + lib);
      // Au bout de la ligne des heures, jamais par-dessus : un créneau trop
      // court pour montrer ses heures ne montre que la jauge.
      const heure = bloc.querySelector('.zfa-cal-carte-heure');
      if (heure) heure.createSpan({ cls: 'zfa-cal-jauge-val', text: ' · ' + duree(fait) + tr(' faites') });
    }

    // D · le liseré de présence.
    for (const col of inner.querySelectorAll('.zfa-cal-col[data-jour]')) {
      for (const x of Ariane.sessionsDuJour(col.dataset.jour, sessions, 1)) {
        const refs = refsDeChemin.get(x.chemin) || [];
        // Une note partagée par plusieurs tâches va à celle qui avait un
        // créneau à ce moment-là, sinon à la première.
        const ref = refs.find((r) => creneaux.some((c) => c.ref === r
          && c.debut < x.fin && c.fin > x.debut)) || refs[0];
        const t = ref ? parRef.get(ref) : null;
        const el = col.createDiv({ cls: 'zfa-cal-presence' + (t ? '' : ' est-hors-tache') });
        el.style.top = ((x.a / 60 - hDeb) * PXH) + 'px';
        el.style.height = Math.max(3, (x.b - x.a) / 60 * PXH) + 'px';
        if (t) el.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
        const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0');
        el.setAttribute('aria-label', hm(x.a) + ' → ' + hm(x.b) + ' · ' + duree(Math.round(x.b - x.a))
          + '\n' + String(x.chemin).split('/').pop().replace(/\.md$/, '')
          + (t ? '\n' + t.ref + ' · ' + (t.intitule || '') : ''));
        el.setAttribute('data-tooltip-position', 'left');
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        el.addEventListener('dblclick', (e) => e.stopPropagation());
      }
    }
  }

  // Pose (ref non vide) ou retire la classe de survol partagé. Seulement
  // s'il existe au moins un autre créneau de la tâche sur la vue.
  _marquerSoeurs(ref) {
    for (const el of this.racine.querySelectorAll('.est-survol-soeur')) {
      el.classList.remove('est-survol-soeur');
    }
    this._refSurvolee = '';
    if (!ref) return;
    const soeurs = [...this.racine.querySelectorAll('[data-ref][data-brut]')]
      .filter((el) => el.dataset.ref === ref);
    this._refSurvolee = ref;
    if (soeurs.length < 2) return;
    for (const el of soeurs) el.classList.add('est-survol-soeur');
  }

  _montrerLigneeSemaine(inner, ref) {
    if (this._detruit || !this._hier || !ref) return;
    // Déjà affiché pour cette tâche : ne pas reconstruire (le survol balade le
    // pointeur à l'intérieur d'une même carte).
    if (this._ligneeRef === ref && inner.querySelector('.zfa-cal-lignee-svg')) return;
    this._effacerLigneeSemaine(inner);
    const rect = inner.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Un point par bloc de créneau (les événements Apple, sans lignée, ne
    // portent pas est-horaire). Coordonnées relatives à la grille, en pixels.
    const points = [];
    const parPoint = new Map();
    for (const el of inner.findAll('.zfa-cal-bloc.est-horaire')) {
      const r = el.dataset.ref;
      const debut = String(el.dataset.debut || '');
      if (!r || debut.length < 16) continue;
      const b = el.getBoundingClientRect();
      const i = points.push({ ref: r, quand: debut,
        x: b.left - rect.left, y: b.top - rect.top, w: b.width, h: b.height }) - 1;
      if (!parPoint.has(r)) parPoint.set(r, []);
      parPoint.get(r).push(i);
    }
    if (points.length < 2) return;
    const connus = new Map(this._taches.map((t) => [t.ref, t]));
    const avecBlocs = [];
    for (const r of parPoint.keys()) {
      const t = connus.get(r);
      if (t) avecBlocs.push(t);
    }
    // Seules les paires qui touchent la tâche survolée sont tracées.
    const paires = Ariane.pairesLigneeCalendrier(avecBlocs, this._hier)
      .filter((p) => p.de === ref || p.vers === ref);
    if (!paires.length) return;
    const liens = Ariane.liensLigneeCalendrier(points, paires, 6);
    if (!liens.length) return;
    const svg = svgEl('svg', { class: 'zfa-cal-lignee-svg',
      width: Math.round(rect.width), height: Math.round(rect.height) });
    for (const l of liens) {
      const c = Ariane.cheminLienCalendrier(points[l.a], points[l.b]);
      const g = svgEl('g', { class: l.genre === 'bloque'
        ? 'zfa-cal-lignee-bloque' : 'zfa-cal-lignee-hier' });
      g.appendChild(svgEl('path', { d: c.d, class: 'zfa-cal-lignee-lien' }));
      g.appendChild(svgEl('circle', { cx: c.ax, cy: c.ay, r: 2.4, class: 'zfa-cal-lignee-noeud' }));
      g.appendChild(svgEl('circle', { cx: c.bx, cy: c.by, r: 2.4, class: 'zfa-cal-lignee-noeud' }));
      svg.appendChild(g);
    }
    inner.appendChild(svg);
    this._ligneeRef = ref;
  }

  // Efface la surcouche de lignée (sortie du survol, redraw, destruction).
  _effacerLigneeSemaine(inner) {
    this._ligneeRef = '';
    const ancien = inner.querySelector('.zfa-cal-lignee-svg');
    if (ancien) ancien.remove();
  }

  // Recale la bande de jours quand on approche de son bord. Reconstruction HORS
  // ÉCRAN puis échange atomique : aucune trame vide, les 7 jours visibles ne
  // bougent pas, la barre d'outils n'est pas touchée.
  // L'ancre est déjà la première colonne visible (le défilement la tient à
  // jour) : la nouvelle bande se centre dessus, et les jours à l'écran restent
  // les mêmes.
  _recalerSemaine(hote) {
    if (this._detruit || !hote.isConnected || !hote.parentElement) return;
    // La bande se recentre sur d'autres jours : la marge de jours déjà lus
    // dans ActivityWatch ne la couvre peut-être plus.
    this._chargerActivite();
    const r = hote.getBoundingClientRect();
    // _doc() et non `document` : le recalage tourne à chaque bord de bande, et
    // dans un volet détaché un nœud du document principal se greffe mal.
    const nv = this._doc().createElement('div');
    nv.className = 'zfa-cal-grille zfa-cal-semaine';
    nv.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;'
      + 'width:' + r.width + 'px;height:' + r.height + 'px;';
    hote.parentElement.appendChild(nv);
    this.dessinerSemaine(nv);
    nv.style.cssText = '';
    hote.replaceWith(nv);
  }
  //#endregion Calendrier · grilles mois & semaine
}

function fabriquerVueCalendrierBase(greffon) {
  return class VueCalendrierBase extends obsidian.BasesView {
    constructor(controleur, conteneur) {
      super(controleur);
      this.type = TYPE_VUE_BASE_CALENDRIER;
      this.greffon = greffon;
      this.conteneur = conteneur;
    }
    onload() {
      const nomVue = () => {
        try {
          const s = this.config.serialize ? this.config.serialize() : null;
          return (s && s.name) || (this.controller && this.controller.file
            && this.controller.file.basename) || tr('Calendrier');
        } catch (e) { return tr('Calendrier'); }
      };
      this._nettoyerOnglet = marquerOngletVueBase(this.greffon.app, this.conteneur, nomVue);
      this.moteur = new MoteurCalendrier(this.greffon, this.conteneur, {
        taches: () => this.tachesDeLaBase(),
        colonnes: () => this.colonnes(),
        nomVue,
        // Identité de la vue pour la mémoire du moteur (période consultée,
        // défilement) : elle doit survivre à la recréation de la vue.
        cle: () => ((this.controller && this.controller.file && this.controller.file.path) || '')
          + '::' + nomVue(),
        triNatif: () => {
          const criteres = this.sortNatif();
          if (!criteres.length) return null;
          return {
            criteres,
            preparer: (taches) => {
              for (const t of taches) {
                const e = this._parRef && this._parRef.get(t.ref);
                t._multi = criteres.map((c) => {
                  let v = null;
                  try { v = e ? e.getValue(c.property) : null; } catch (err) { v = null; }
                  const brut = (v && typeof v === 'object' && 'data' in v && v.data != null)
                    ? v.data : v;
                  return { v: brut == null ? '' : brut, s: c.desc ? -1 : 1 };
                });
              }
            },
          };
        },
        lire: (cle) => {
          const v = this.config.get(cle);
          return v === undefined || v === null ? DEFAUTS_CALENDRIER[cle] : v;
        },
        ecrire: async (cle, v) => { this.config.set(cle, v); },
      });
    }

    static texteValeur(v) {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) return v.map((x) => VueCalendrierBase.texteValeur(x)).filter(Boolean).join(', ');
      if (typeof v === 'object') {
        if (typeof v.toString === 'function') {
          const t = v.toString();
          return t === '[object Object]' ? '' : t;
        }
        return '';
      }
      return String(v);
    }

    sortNatif() {
      let s = [];
      try { s = (this.config.serialize() || {}).sort || this.config.getSort() || []; }
      catch (e) { s = []; }
      return (Array.isArray(s) ? s : [])
        .filter((x) => x && x.property)
        .map((x) => ({ property: String(x.property),
          desc: String(x.direction || 'ASC').toUpperCase() === 'DESC' }));
    }

    colonnes() {
      let props = [];
      try { props = this.config.getOrder() || []; } catch (e) { props = []; }
      if (!props.length) props = (this.data && this.data.properties) || [];
      let renoms = {};
      try { renoms = this.config.get('renoms') || {}; } catch (e) { renoms = {}; }
      const out = [];
      for (const id of props) {
        let nom = renoms[id] || '';
        if (!nom) {
          try { nom = this.greffon.libelleColonne(this.config.getDisplayName(id) || id); } catch (e) { nom = id; }
        }
        if (!nom) nom = id;
        const valeurDe = (ref) => {
          const e = this._parRef ? this._parRef.get(ref) : null;
          if (!e) return null;
          try { return e.getValue(id); } catch (err) { return null; }
        };
        out.push({
          cle: id,
          nom,
          chemin: (ref) => {
            const e = this._parRef ? this._parRef.get(ref) : null;
            return e && e.file ? e.file.path : '';
          },
          valeurBase: (ref) => valeurDe(ref),
          valeur: (ref) => {
            try { return VueCalendrierBase.texteValeur(valeurDe(ref)); } catch (err) { return ''; }
          },
          valeurBrute: (ref) => {
            const v = valeurDe(ref);
            if (v == null) return '';
            if (typeof v === 'object' && 'data' in v && v.data != null) return v.data;
            return VueCalendrierBase.texteValeur(v);
          },
        });
      }
      return out;
    }

    tachesDeLaBase() {
      const dedans = new Set();
      this._parRef = new Map();
      for (const e of (this.data && this.data.data) || []) {
        const chemin = e && e.file ? e.file.path : null;
        const ref = chemin ? this.greffon.refDeChemin(chemin) : null;
        if (!ref) continue;
        dedans.add(ref);
        this._parRef.set(ref, e);
      }
      const toutes = this.greffon.tachesPourGantt();
      // On garde les tâches du filtre de la base, PLUS toute tâche qui porte un
      // créneau : un créneau posé doit rester visible sur le calendrier même si
      // la tâche sort du filtre (p. ex. une fois cochée « terminée »).
      const garde = (t) => dedans.has(t.ref) || (t.creneaux || []).length > 0;
      if (!dedans.size && !toutes.some((t) => (t.creneaux || []).length > 0)) return [];
      return toutes.filter(garde);
    }
    onunload() {
      if (this._nettoyerOnglet) { this._nettoyerOnglet(); this._nettoyerOnglet = null; }
      if (this.moteur) this.moteur.detruire();
    }
    onResize() { if (this.moteur) this.moteur.dessiner(); }
    async onDataUpdated() {
      if (this.greffon.settings.famillesTaches && this.greffon.settings.famillesTaches.length) {
        try { await this.greffon.rattraperProprietesFamilles(); } catch (e) { /* rien */ }
      }
      if (this.moteur) this.moteur.dessiner();
    }
  };
}

//#endregion 17 · Vue Calendrier

