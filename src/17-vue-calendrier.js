//#region 17 · Vue Calendrier
// ═══════════════════════════════════════════════════════════════════════════
//  17 · VUE CALENDRIER
//  Grille mois (ruban à trois volets) et grille semaine (bande de 43 jours à
//  défilement libre), créneaux horaires déplaçables, jalons et tâches d'un
//  jour dans le bandeau, agenda Apple affiché en fond. MoteurCalendrier et la
//  fabrique de la vue Bases « ariane-calendrier ».
// ═══════════════════════════════════════════════════════════════════════════

class MoteurCalendrier extends MoteurVue {
  //#region Calendrier · cycle de vie & écritures annulables
  constructor(greffon, racine, contexte) {
    super(greffon, racine, contexte);
    this._ancre = new Date().toISOString().slice(0, 10);
    this._fond = [];
    racine.addClass('zfa-cal');
    racine.tabIndex = -1;
    this._surTouche = (e) => {
      const t = e.target;
      if (t && (t.matches && (t.matches('input, textarea, select') || t.isContentEditable))) return;
      if (_toucheRetablir(e)) { e.preventDefault(); e.stopPropagation(); refaireDernier(this); return; }
      if (_toucheAnnuler(e)) { e.preventDefault(); e.stopPropagation(); annulerDernier(this); }
    };
    racine.addEventListener('keydown', this._surTouche);
    (greffon._moteursCalendrier || (greffon._moteursCalendrier = new Set())).add(this);
  }
  // Écriture d'un créneau depuis un geste, avec annulation. `chg` = { avant,
  // debut, fin } comme greffon.majCreneau. L'annulation reconstruit l'état
  // inverse (déplacement/redim → remettre l'ancien ; création → supprimer ;
  // suppression → recréer).
  async _majCreneauU(ref, chg) {
    const av = chg.avant || '';
    const nv = (chg.debut && chg.fin) ? Ariane.formatCreneau(chg.debut, chg.fin) : '';
    const anc = av ? Ariane.parseCreneau(av) : null;
    await this.greffon.majCreneau(ref, chg);
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
    this._coalesce = false;
    this._redessinDiffere = false;
    this._gesteCal = false;
    if (this._surTouche) this.racine.removeEventListener('keydown', this._surTouche);
    if (this.greffon._moteursCalendrier) this.greffon._moteursCalendrier.delete(this);
    this.racine.empty();
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
    el.addEventListener('click', (ev) => { ev.stopPropagation(); this._ouvrirEvenement(e.id); });
    return el;
  }

  //#endregion Calendrier · agenda Apple en fond

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
    this._chargerFond();
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
      for (const t of this._taches) {
        const p = this._enAttente.get(t.ref);
        if (!p) continue;
        const cle = JSON.stringify([t.debut, t.echeance, (t.creneaux || []).slice().sort()]);
        if (cle === JSON.stringify(p.cible)) this._enAttente.delete(t.ref);
        else {
          if (p.debut !== undefined) t.debut = p.debut;
          if (p.echeance !== undefined) t.echeance = p.echeance;
          if (p.creneaux !== undefined) t.creneaux = p.creneaux;
        }
        if (p.debut === undefined && p.echeance === undefined && p.creneaux === undefined) {
          this._enAttente.delete(t.ref);
        }
      }
      const refs = new Set(this._taches.map((t) => t.ref));
      for (const ref of [...this._enAttente.keys()]) {
        if (!refs.has(ref)) this._enAttente.delete(ref);
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
    if (apercu) this._enAttente.set(ref, apercu);
    this.dessiner();
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

    if (ev.source === 'creneau') {
      // Commentaire de session : stocké dans le bloc balisé de la note.
      m.addItem((i) => i.setTitle(tr('Commentaire…')).setIcon('message-square')
        .onClick(async () => {
          const fich = this.app.vault.getMarkdownFiles().find((x) => x.basename === t.ref);
          const coms = fich ? Ariane.commentairesDuBloc(await this.app.vault.cachedRead(fich)) : {};
          new ModaleCommentaire(this.app, {
            valeur: coms[Ariane.cleCommentaire(ev.brut)] || '',
          }, async (txt) => {
            await this.greffon.majCommentaireCreneau(t.ref, ev.brut, txt);
            this.dessiner();
          }).open();
        }));
      // Bloc horaire : on retire le créneau lui-même (la ligne de « Créneaux »).
      m.addItem((i) => i.setTitle(tr('Supprimer ce créneau')).setIcon('trash-2')
        .onClick(async () => {
          await this._majCreneauU(t.ref, { avant: ev.brut, debut: '', fin: '' });
          this._apres(t.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
        }));
    } else if (t.debut || t.echeance) {
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
    const cal = (v) => Math.round(v / (PXH / 4)) * (PXH / 4);
    // Guide de placement : rectangle calé sur le jour + le quart d'heure visés,
    // qui glisse par crans (animation courte) pendant que le bloc, lui, suit
    // librement le curseur. Surligne aussi la colonne du jour d'arrivée.
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
      const nvColCible = inner.querySelector('.zfa-cal-col[data-jour="' + strip[idxJour] + '"]');
      if (nvColCible !== colCible) {
        if (colCible) colCible.classList.remove('zfa-cal-col-cible-jour');
        colCible = nvColCible;
        if (colCible) colCible.classList.add('zfa-cal-col-cible-jour');
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
    const lacher = async (up) => {
      this._doc().removeEventListener('pointermove', bouger);
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
        this._apres(ref, { cible: [undefined, undefined, prevu], creneaux: prevu });
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
        this._apres(ref, { cible: [undefined, undefined, prevu], creneaux: prevu });
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
      this._apres(ref, { cible: [undefined, undefined, prevu], creneaux: prevu });
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
    this._doc().addEventListener('pointercancel', lacher);
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
        if (cr) await this._majCreneauU(d.ref, { avant: d.brut,
          debut: Ariane.decalerJour(cr.debut.slice(0, 10), n) + 'T' + cr.debut.slice(11),
          fin: Ariane.decalerJour(cr.fin.slice(0, 10), n) + 'T' + cr.fin.slice(11) });
        this._apres(d.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
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

    const grille = hote.createDiv({ cls: 'zfa-cal-mois-grille' });
    const ent = grille.createDiv({ cls: 'zfa-cal-jour-entete-ligne' });
    for (const d of ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']) {
      ent.createDiv({ cls: 'zfa-cal-jour-entete', text: tr(d) });
    }

    for (const semaine of g.semaines) {
      const wk = grille.createDiv({ cls: 'zfa-cal-msem' });
      const cells = wk.createDiv({ cls: 'zfa-cal-msem-cells' });
      for (const jour of semaine) {
        const cell = cells.createDiv({ cls: 'zfa-cal-cellule' });
        cell.dataset.jour = jour;
        this._brancherDropCellule(cell);
        if (jour === auj) cell.addClass('est-aujourdhui');
        if (jour.slice(0, 7) !== g.moisDebut.slice(0, 7)) cell.addClass('hors-mois');
        if (this._jourSel === jour) cell.addClass('est-selection');
        const surCarte = (e) => e.target.closest('.zfa-cal-carte, .zfa-cal-pastille, .zfa-cal-jalon, .zfa-cal-evt');
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
        tete.createSpan({ cls: 'zfa-cal-quantieme', text: String(Number(jour.slice(8, 10))) });

        const corps = cell.createDiv({ cls: 'zfa-cal-cellule-corps' });
        for (const t of (jourTaches.get(jour) || [])) {
          this.rendreCarte(corps, t, { source: 'dates', allDay: true },
            { compact: true, avecCoche: true, enRetard: enRetard.has(t.ref) });
        }
        const pj = (pastilles.get(jour) || []).slice()
          .sort((a, b) => (a.ev.debut < b.ev.debut ? -1 : a.ev.debut > b.ev.debut ? 1 : 0));
        for (const { t, ev } of pj) {
          const p = corps.createDiv({ cls: 'zfa-cal-pastille'
            + (enRetard.has(t.ref) ? ' est-retard' : '') });
          p.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
          p.dataset.ref = t.ref;
          p.dataset.brut = ev.brut;
          p.createSpan({ cls: 'zfa-cal-pastille-h', text: ev.debut.slice(11, 16) });
          p.createSpan({ text: ' ' + (t.intitule || t.ref) });
          p.title = t.ref + ' · ' + (t.intitule || '') + '\n'
            + ev.debut.slice(11, 16) + '–' + ev.fin.slice(11, 16);
          this._brancherOuvertureCarte(p, t, ev);
          p.setAttribute('draggable', 'true');
          p.addEventListener('dragstart', (de) => {
            de.dataTransfer.setData('text/x-ariane-cal',
              JSON.stringify({ ref: t.ref, jour, brut: ev.brut }));
            de.dataTransfer.effectAllowed = 'move';
          });
        }
        // Événements Apple réels du jour → chips zfa-cal-evt, clic → Calendar.app.
        const fj = this._fondDuJour(jour);
        for (const e of fj.jour.concat(fj.horaires)) {
          const ch = corps.createDiv({ cls: 'zfa-cal-evt est-compacte' });
          if (e.couleur) ch.style.setProperty('--zfa-cal-coul', e.couleur);
          if (!e.allDay && e.debut && e.debut.length > 15) {
            ch.createSpan({ cls: 'zfa-cal-evt-h', text: e.debut.slice(11, 16) + ' ' });
          }
          ch.createSpan({ text: e.titre || tr('(sans titre)') });
          ch.title = (e.titre || '') + (e.calendrier ? ' · ' + e.calendrier : '');
          ch.addEventListener('click', (ev2) => { ev2.stopPropagation(); this._ouvrirEvenement(e.id); });
        }
      }
    }
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
        col.removeClass('zfa-cal-cible'); this._dropExterne(de, col.dataset.jour, 'mois');
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
          } else {
            this.rendreCarte(col, t, ev, { compact: true, avecCoche: true });
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
          ch.addEventListener('click', (ev) => { ev.stopPropagation(); this._ouvrirEvenement(e.id); });
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
        col.removeClass('zfa-cal-cible'); this._dropExterne(de, col.dataset.jour, 'semaine');
      });
      col.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.zfa-cal-carte')) return;
        this.menuCellule(e, col.dataset.jour);
      });

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
          bloc.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j));
          const poi = bloc.createDiv({ cls: 'zfa-cal-poignee' });
          poi.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j, 'fin'));
          // Même geste par le haut : on tire le début, la fin reste en place.
          const poiHaut = bloc.createDiv({ cls: 'zfa-cal-poignee-haut' });
          poiHaut.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j, 'debut'));
          // Lignée : deux boutons (mères / filles) quand la tâche en a, révélés
          // au survol. Le panneau reste ouvert pour faire glisser plusieurs
          // cartes à la suite ; il ne ferme que sur un nouveau clic sur le
          // bouton, Échap, un changement de fenêtre, ou la fermeture de la vue.
          const infos = this._hier && this._hier.parRef.get(t.ref);
          const nbMeres = infos ? (this._hier.meres.get(t.ref) || []).length - 1 : 0;
          const nbFilles = infos ? (this._hier.filles.get(t.ref) || []).length : 0;
          if (nbMeres > 0 || nbFilles > 0) {
            const btns = bloc.createDiv({ cls: 'zfa-cal-lignee-btns' });
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
        bloc.style.left = 'calc(' + (lay[k].col / lay[k].ncols * 100) + '% + 6px)';
        bloc.style.width = 'calc(' + (100 / lay[k].ncols) + '% - 12px)';
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
    corps.addEventListener('scroll', () => {
      sync();
      this._semScrollTop = corps.scrollTop;
      if (this._enRecalage) return;
      clearTimeout(this._semScrollMinuterie);
      this._semScrollMinuterie = setTimeout(() => {
        if (this._detruit || this._enRecalage) return;
        const idxG = corps.scrollLeft / colW;
        if (idxG < 4 || idxG > TAMPON - 11) {
          const shift = Math.round(idxG) - CENTRE;
          if (shift !== 0) {
            this._enRecalage = true;
            this._recalerSemaine(hote, shift);
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
  _recalerSemaine(hote, shift) {
    if (this._detruit || !hote.isConnected || !hote.parentElement) return;
    this._ancre = Ariane.decalerJour(this._ancre, shift);
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
      this.moteur = new MoteurCalendrier(this.greffon, this.conteneur, {
        taches: () => this.tachesDeLaBase(),
        colonnes: () => this.colonnes(),
        nomVue: () => {
          try {
            const s = this.config.serialize ? this.config.serialize() : null;
            return (s && s.name) || (this.controller && this.controller.file
              && this.controller.file.basename) || tr('Calendrier');
          } catch (e) { return tr('Calendrier'); }
        },
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
    onunload() { if (this.moteur) this.moteur.detruire(); }
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

