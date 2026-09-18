//#region 16 · Vue Articulation
// ═══════════════════════════════════════════════════════════════════════════
//  16 · VUE ARTICULATION
//  Constantes de carte, ancrage magnétique, MoteurArticulation et la
//  fabrique de la vue Bases « ariane-articulation ».
// ═══════════════════════════════════════════════════════════════════════════

const ARTIC_W = 240;
const ARTIC_H = 58;
// Décalage de la pastille indicatrice de repli au-delà du bord droit. Elle
// n'est plus cliquable (le point d'accroche gère tout) — c'est un simple
// compteur / témoin, posé juste à côté de l'accroche.
const REPLI_DX = 14;
// Fenêtre du « double tap » sur un point d'accroche, et délai avant l'action
// du tap simple (le temps de voir venir un second tap).
const DELAI_TAP = 280;
// Rayon des coudes en mode « angulaire » : les tracés gardent des segments
// droits mais les virages sont légèrement adoucis. Lu à l'exécution par les
// statiques de routage de la section 11j (comme ARTIC_H), jamais au chargement.
const R_COUDE_ARTIC = 6;
const GRILLE_ARTIC = 20;   // pas de la grille magnétique
const SEUIL_AIMANT = 7;    // distance d'accrochage à un bord / centre voisin
// Hauteur relative des points d'accroche (et donc des extrémités d'arête)
// dans une carte : la parenté en haut, le blocage en bas.
// Les points d'accroche restent centrés sur la carte, à écart fixe l'un de
// l'autre, quelle que soit la hauteur de la carte : parenté au-dessus du
// centre, blocage en dessous.
const ANCRE_ECART = 22;
function ancreY(h, type) {
  const c = (h || ARTIC_H) / 2;
  return type === 'bloque' ? c + ANCRE_ECART / 2 : c - ANCRE_ECART / 2;
}

class MoteurArticulation extends MoteurVue {
  //#region Articulation · cycle de vie & dessin
  constructor(greffon, racine, ctx) {
    super(greffon, racine, ctx);
    this._vue = { x: 40, y: 40, k: 1 };
    this._selArete = null;
    this._selNoeuds = new Set(); // sélection multiple de cartes (refs)
    this._espace = false;        // barre d'espace tenue -> le glissé du fond fait un pan
    this._mode = 'retracte';
    // Cartes dont l'affichage des propriétés est INVERSÉ par rapport au mode
    // courant (rétracté montre compact ; détaillé montre les propriétés).
    this._cartesInversees = this._cartesInversees || new Set();
    this._plan = { cartes: [] }; // plan de travail (rempli par dessinerVraiment)
    racine.addClass('zfa-artic');
    racine.tabIndex = -1;
    this._surTouche = (e) => this.touche(e);
    racine.addEventListener('keydown', this._surTouche);
    racine.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.code === 'Space') { this._espace = false; this.racine.removeClass('est-espace'); }
    });
    racine.addEventListener('blur', () => { this._espace = false; this.racine.removeClass('est-espace'); });
  }
  detruire() {
    if (this._surTouche) this.racine.removeEventListener('keydown', this._surTouche);
    if (this._tapAccroche) { clearTimeout(this._tapAccroche.timer); this._tapAccroche = null; }
    this.racine.empty();
  }

  dessiner() {
    try { this.dessinerVraiment(); } catch (e) {
      console.error('[Ariane] articulation :', e);
      this.racine.empty();
      this.racine.createDiv({ cls: 'zfa-refs-vide',
        text: tr("L'articulation n'a pas pu se dessiner : ") + (e && e.message ? e.message : e) });
    }
  }

  dessinerVraiment() {
    const c = this.racine;
    const svgAncien = c.querySelector('.zfa-artic-svg');
    c.empty();
    let taches = (this.ctx.taches && this.ctx.taches()) || [];

    // Tri natif de la base : on réordonne le tableau des tâches selon les refs
    // triées. Les tâches hors liste retombent à la fin, dans leur ordre reçu.
    const ordreTri = (this.ctx.triRefs && this.ctx.triRefs()) || [];
    if (ordreTri.length) {
      const rang = new Map(ordreTri.map((r, i) => [r, i]));
      taches.sort((a, b) => (rang.has(a.ref) ? rang.get(a.ref) : 1e9)
        - (rang.has(b.ref) ? rang.get(b.ref) : 1e9));
    }

    const barre = c.createDiv({ cls: 'zfa-artic-barre' });
    this.boutonBarre(barre, 'layout-grid', tr('Re-disposer'), () => this.redisposer());
    this.boutonBarre(barre, 'maximize-2', tr('Ajuster'), () => this.ajuster());
    this.boutonBarre(barre, 'zoom-out', tr('Zoom arrière'), () => this._zoomVers(1 / 1.2));
    this.boutonBarre(barre, 'zoom-in', tr('Zoom avant'), () => this._zoomVers(1.2));
    this.boutonBarre(barre, 'minus', tr('Retirer un niveau de sous-tâches'), () => this._replierNiveau());
    this.boutonBarre(barre, 'plus', tr('Ajouter un niveau de sous-tâches'), () => this._deplierNiveau());
    this.boutonBarre(barre, 'list-plus', tr('Ajouter au plan les tâches du filtre'),
      () => this._ajouterDuFiltre());
    this.boutonBarre(barre, 'eraser', tr('Nettoyer le canvas'), () => this._nettoyerPlan());

    const mode = (this.ctx.lire && this.ctx.lire('modeCarte')) || 'retracte';
    this._mode = mode;
    this.boutonBarre(barre, mode === 'detaille' ? 'rows-3' : 'rows-2',
      mode === 'detaille' ? tr('Détaillé') : tr('Rétracté'), async () => {
        this._cartesInversees.clear();
        await this.ctx.ecrire('modeCarte', mode === 'detaille' ? 'retracte' : 'detaille');
        this.dessiner();
      });

    // --- Plan de travail : on ne dessine QUE les cartes posées. ---
    this._plan = this.ctx.lirePlan ? this.ctx.lirePlan() : { cartes: [] };
    if (this.ctx.migrerCanvasXY && !this._plan._migre && !this._migrationEnCours) {
      this._migrationEnCours = true;
      Promise.resolve(this.ctx.migrerCanvasXY((taches || []).map((t) => t.ref)))
        .then(() => { this._migrationEnCours = false; this.dessiner(); })
        .catch(() => { this._migrationEnCours = false; });
    }

    const toutes = this.greffon.tachesPourGantt();
    const parRef = new Map(toutes.map((t) => [t.ref, t]));

    // Purge des cartes dont la note n'existe plus.
    const nAvant = this._plan.cartes.length;
    this._plan.cartes = this._plan.cartes.filter((cc) => parRef.has(cc.ref));
    if (this._plan.cartes.length !== nAvant && this.ctx.ecrirePlan) this.ctx.ecrirePlan(this._plan);

    const posDe = new Map(this._plan.cartes.map((cc) => [cc.ref, cc]));
    const refsPlan = new Set(posDe.keys());
    this._filtre = new Set((taches || []).map((t) => t.ref)); // loupe

    const grapheAll = Ariane.grapheArticulation(toutes);
    this._aretesToutes = grapheAll.aretes;
    const propAll = Ariane.propagerBlocage(grapheAll.noeuds, grapheAll.aretes);
    this._bloquees = propAll.bloquee;
    this._impactees = propAll.impactee;
    this._avDeriv = Ariane.avancementsDerives(toutes);
    const aretes = Ariane.aretesEntre(grapheAll.aretes, refsPlan);
    const sousSet = toutes.filter((t) => refsPlan.has(t.ref));
    const { noeuds } = Ariane.grapheArticulation(sousSet);
    this._aretes = aretes;
    this._loupe = !!(this.ctx.filtreActif && this.ctx.filtreActif());

    barre.createSpan({ cls: 'zfa-artic-compte',
      text: refsPlan.size + ' ' + (refsPlan.size > 1 ? tr('cartes') : tr('carte')) });

    // Relatifs HORS PLAN, par carte : bloquantes (badge accent) et sous-tâches
    // (badge numéroté). Cliquer un badge les ajoute au plan.
    this._bloqueCaches = new Map();
    this._enfantsHorsPlan = new Map();
    // Relatifs repliables (déjà sur le plan, retirables via le badge « − »).
    this._replierPossible = new Map();
    for (const ref of refsPlan) {
      const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsPlan);
      if (rel.bloquantes.length) this._bloqueCaches.set(ref, rel.bloquantes.length);
      if (rel.sousTaches.length) this._enfantsHorsPlan.set(ref, rel.sousTaches);
      for (const type of ['hier', 'bloque']) {
        const nb = Ariane.replierRelatifs(ref, grapheAll.aretes, refsPlan, type).length;
        if (nb) this._replierPossible.set(ref + '|' + type, nb);
      }
    }

    this._dates = {};
    for (const n of noeuds) {
      const t = parRef.get(n.ref) || {};
      this._dates[n.ref] = { debut: t.debut || '', echeance: t.echeance || '' };
    }

    const cols = (this.ctx.ordre && this.ctx.ordre()) || [];
    const hDe = (n) => (this._estDeplie(n.ref)
      ? ARTIC_H + Math.max(0, cols.length) * 18 + 22 : ARTIC_H);
    for (const n of noeuds) n.h = hDe(n);
    this._noeudsParRef = new Map(noeuds.map((n) => [n.ref, n]));

    // Positions : depuis le plan. Cascade au centre pour une carte non fixée.
    this._pos = new Map();
    let casc = 0;
    let cascEcrit = false;
    for (const n of noeuds) {
      const cc = posDe.get(n.ref);
      let x = cc && Number.isFinite(cc.x) ? cc.x : null;
      let y = cc && Number.isFinite(cc.y) ? cc.y : null;
      if (x == null || y == null) {
        x = 60 + casc * 34; y = 60 + casc * 34; casc++;
        if (cc) { cc.x = x; cc.y = y; cascEcrit = true; }
      }
      this._pos.set(n.ref, { x, y });
    }
    if (cascEcrit && this.ctx.ecrirePlan) this.ctx.ecrirePlan(this._plan);

    const svg = svgEl('svg', { class: 'zfa-artic-svg' });
    c.appendChild(svg);
    this._svg = svg;
    // Pointes de flèche : l'articulation n'a pas d'axe du temps, le sens de
    // chaque contrainte doit être montré.
    const defs = svgEl('defs', {});
    for (const type of ['hier', 'bloque']) {
      const mk = svgEl('marker', {
        id: 'zfa-artic-pointe-' + type, viewBox: '0 0 10 10',
        refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' });
      mk.appendChild(svgEl('path', {
        d: 'M0 0 L10 5 L0 10 z', class: 'zfa-artic-pointe zfa-artic-pointe-' + type }));
      defs.appendChild(mk);
    }
    svg.appendChild(defs);
    const g = svgEl('g', { class: 'zfa-artic-scene' });
    svg.appendChild(g);
    this._scene = g;
    this._reperes = null;

    for (const a of aretes) this.dessinerArete(g, a);
    for (const n of noeuds) this.dessinerNoeud(g, n);

    // Hauteurs réelles des cartes : la formule n'estime que le prévu
    // (ARTIC_H + colonnes × 18), mais le CSS décide — les cartes dépliées
    // sont en height:auto. On mesure une fois posé, on aligne sur la hauteur
    // VISIBLE le foreignObject, les points d'accroche et les badges de
    // relatifs, puis on retrace les arêtes : sinon une bande sous les cartes
    // dépliées ne correspond à rien (zone morte qui ne pan pas) et les
    // accroches flottent sous la carte.
    const mesures = [];
    for (const gn of g.querySelectorAll('.zfa-artic-noeud')) {
      const carte = gn.querySelector('.zfa-artic-carte');
      mesures.push([gn, carte ? carte.offsetHeight : 0]);
    }
    let hChangee = false;
    for (const [gn, h] of mesures) {
      const n = this._noeudsParRef.get(gn.dataset.ref);
      const h0 = (n && n.h) || ARTIC_H;
      if (!h || Math.abs(h - h0) <= 1) continue;
      const hN = Math.max(24, Math.round(h));
      if (n) n.h = hN;
      hChangee = true;
      const fo = gn.querySelector('foreignObject');
      if (fo) fo.setAttribute('height', hN);
      for (const ga of gn.querySelectorAll('.zfa-artic-accroche')) {
        ga.setAttribute('transform',
          'translate(' + ARTIC_W + ',' + ancreY(hN, ga.dataset.type) + ')');
      }
      for (const gb of gn.querySelectorAll('.zfa-artic-repli')) {
        const typeRepli = gb.classList.contains('zfa-artic-repli-bloque') ? 'bloque' : 'hier';
        gb.setAttribute('transform',
          'translate(' + (ARTIC_W + REPLI_DX) + ',' + ancreY(hN, typeRepli) + ')');
      }
    }
    if (hChangee) this._retracerAretes();
    this._poserPonts(g, aretes);

    // Survol d'une carte → ses connexions directes en avant (délégué : les
    // groupes d'arêtes sont reconstruits à chaque retracé).
    g.addEventListener('mouseover', (e) => {
      const gn = e.target.closest && e.target.closest('.zfa-artic-noeud');
      if (gn && gn.dataset.ref) this._survolLiens(gn.dataset.ref);
    });
    g.addEventListener('mouseout', (e) => {
      const gn = e.target.closest && e.target.closest('.zfa-artic-noeud');
      const versDehors = !(e.relatedTarget && e.relatedTarget.closest
        && e.relatedTarget.closest('.zfa-artic-noeud') === gn);
      if (gn && versDehors) this._finSurvolLiens();
    });

    svg.addEventListener('wheel', (e) => this.zoomer(e), { passive: false });
    const surFond = (e) => (e.target === svg
      || (e.target.closest('.zfa-artic-scene') === g
        && !e.target.closest('.zfa-artic-noeud')
        && !e.target.closest('.zfa-artic-arete-groupe')));
    svg.addEventListener('pointerdown', (e) => {
      if (!surFond(e)) return;
      // Prendre le focus clavier pour que la barre d'espace (pan) réponde.
      if (this.racine.focus) this.racine.focus({ preventScroll: true });
      // Clic milieu, Espace + gauche, ou bouton droit : pan.
      if (e.button === 1 || (e.button === 0 && this._espace)) { this.panDepart(e); return; }
      if (e.button === 2) { this._panDroit(e); return; }
      if (e.button !== 0) return;
      this._deselectionnerArete();
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) this._toutDeselectionner();
      this.rubberBand(e);
    });
    // Le menu du fond s'ouvre au relâché (cf. _panDroit), pas ici : on empêche
    // seulement le menu natif.
    svg.addEventListener('contextmenu', (e) => { if (surFond(e)) e.preventDefault(); });
    // Double-clic sur une zone vide : créer une tâche (après choix de la famille).
    svg.addEventListener('dblclick', (e) => {
      if (!surFond(e)) return;
      e.preventDefault();
      const p = this._versScene(e);
      const familles = this.greffon.settings.famillesTaches || [];
      if (!familles.length) { this._creerAuCanvas('', p); return; }
      const items = familles.map((f) => ({ nom: f.nom || f.id, cle: f.id }));
      new ChoixListeModal(this.app, tr('Type de tâche à créer'), items,
        (it) => { if (it && it.cle != null) this._creerAuCanvas(it.cle, p); }).open();
    });
    // Dernière position du curseur sur le fond : cible du collage au clavier.
    svg.addEventListener('pointermove', (e) => { this._dernierePosFond = this._versScene(e); });

    // Glisser des notes sur le canvas : les notes de tâche sont posées telles
    // quelles ; les autres notes deviennent une nouvelle tâche qui les lie.
    // Accepte le glisser multiple (explorateur, panier de notes).
    svg.addEventListener('dragover', (e) => {
      const d = this.app.dragManager && this.app.dragManager.draggable;
      const okTxt = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('text/plain');
      if (!d && !okTxt && !this.greffon.glisseDepuisPanier) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      this.racine.addClass('zfa-artic-survol-drop');
    });
    svg.addEventListener('dragleave', () => this.racine.removeClass('zfa-artic-survol-drop'));
    svg.addEventListener('drop', async (e) => {
      this.racine.removeClass('zfa-artic-survol-drop');
      const noms = this.greffon.notesGlissees(e);
      if (!noms.length) { new obsidian.Notice(tr('Aucune note reconnue dans ce glisser.')); return; }
      e.preventDefault();
      const p = this._versScene(e);
      const taches = [];
      const autres = [];
      for (const nom of noms) {
        const f = this.app.metadataCache.getFirstLinkpathDest(nom, '')
          || this.app.vault.getMarkdownFiles().find((z) => z.basename === nom);
        if (!f) continue;
        const ref = this.greffon.refDeChemin(f.path);
        if (ref) taches.push(ref); else autres.push(f);
      }
      if (taches.length) this._poserRefs(taches, p.x, p.y);
      if (autres.length) {
        await this._creerTacheAvecNotes(autres,
          { x: p.x + taches.length * 26, y: p.y + taches.length * 26 });
      }
    });

    if (!refsPlan.size) {
      c.createDiv({ cls: 'zfa-artic-vide', text: tr('Plan de travail vide. Glissez des notes de tâche ici, ou « Ajouter au plan les tâches du filtre ».') });
    }

    // Cadrer la vue la première fois seulement (si le plan a des cartes).
    if (!svgAncien && refsPlan.size) this.ajuster(); else this.appliquerVue();
  }

  // Boutons de la barre : icône seule, l'intitulé passe en infobulle.
  boutonBarre(parent, icone, texte, action) {
    const b = parent.createEl('button', {
      cls: 'zfa-artic-bouton',
      attr: { type: 'button', 'aria-label': texte, title: texte } });
    obsidian.setIcon(b.createSpan({ cls: 'zfa-artic-bouton-ic' }), icone);
    b.addEventListener('click', action);
    return b;
  }

  //#endregion Articulation · cycle de vie & dessin

  //#region Articulation · cartes & arêtes
  appliquerVue() {
    const v = this._vue;
    this._scene.setAttribute('transform',
      'translate(' + v.x + ',' + v.y + ') scale(' + v.k + ')');
  }

  _pt(ref) { return this._pos.get(ref) || { x: 0, y: 0 }; }

  dessinerNoeud(g, n) {
    const p = this._pt(n.ref);
    const gn = svgEl('g', { class: 'zfa-artic-noeud', transform: 'translate(' + p.x + ',' + p.y + ')' });
    gn.dataset.ref = n.ref;
    if (this._selNoeuds.has(n.ref)) gn.classList.add('est-selectionne');
    if (this._bloquees && this._bloquees.has(n.ref)) gn.classList.add('est-bloquee');
    else if (this._impactees && this._impactees.has(n.ref)) gn.classList.add('est-impactee');
    const fo = svgEl('foreignObject', { width: ARTIC_W, height: n.h || ARTIC_H });
    gn.appendChild(fo);
    const carte = fo.createDiv({ cls: 'zfa-artic-carte' + (n.jalon ? ' est-jalon' : '')
      + (this._loupe && this._filtre && !this._filtre.has(n.ref) ? ' zfa-artic-hors-filtre' : '') });
    carte.dataset.statut = n.statut;
    const fam = this.greffon.familleDe(n.famille);
    carte.style.setProperty('--zfa-fam-couleur', fam.couleur || '#888888');

    // Colonne de gauche : la case « terminée » au-dessus de l'icône de famille.
    const marge = carte.createDiv({ cls: 'zfa-artic-marge' });
    const coche = marge.createEl('input', { type: 'checkbox', cls: 'zfa-artic-coche' });
    coche.checked = n.statut === 'terminée';
    coche.setAttribute('aria-label', tr('Terminée'));
    coche.addEventListener('pointerdown', (e) => e.stopPropagation());
    coche.addEventListener('click', (e) => e.stopPropagation());
    coche.addEventListener('change', async () => {
      await this.greffon.basculerTermine(n.ref, coche.checked);
      this.dessiner();
    });
    const ic = marge.createSpan({ cls: 'zfa-artic-fam' });
    ic.setAttribute('aria-label', fam.nom || n.famille || '');
    obsidian.setIcon(ic, fam.icone || 'circle');

    // Crayon et chevron vivent dans la rangée du bas (cf. plus bas), pour
    // laisser le titre occuper toute la largeur sur deux lignes.
    carte.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Le clic droit sélectionne la carte si elle ne l'est pas déjà.
      if (!this._selNoeuds.has(n.ref)) this.selectionnerNoeud(n.ref, gn, null);
      const sel = [...this._selNoeuds];
      const plur = sel.length > 1;
      const m = new obsidian.Menu();
      m.addItem((i) => i.setTitle(tr('Ouvrir la note')).setIcon('file-text')
        .onClick(() => this.greffon.ouvrirNote(n.ref)));
      m.addItem((i) => i.setTitle(tr('Modifier la tâche…')).setIcon('pencil')
        .onClick(() => new ModaleTache(this.app, this.greffon,
          { ref: n.ref, apres: () => this.dessiner() }).open()));
      if (!plur) {
        m.addItem((i) => i.setTitle(tr('Découper la tâche (IA)…')).setIcon('list-tree')
          .onClick(() => this.greffon.ouvrirDecoupage(n.ref)));
      }
      m.addSeparator();
      m.addItem((i) => i.setTitle(plur ? tr('Copier les ') + sel.length + tr(' tâches') : tr('Copier la tâche'))
        .setIcon('copy').onClick(() => this._copier()));
      const pp = this.greffon._presseArtic;
      if (pp && pp.taches && pp.taches.length) {
        m.addItem((i) => i.setTitle(pp.taches.length > 1
          ? tr('Coller ') + pp.taches.length + tr(' tâches') : tr('Coller la tâche'))
          .setIcon('clipboard-paste').onClick(() => this._coller()));
      }
      m.addSeparator();
      m.addItem((i) => i.setTitle(plur ? tr('Retirer les ') + sel.length + tr(' du plan') : tr('Retirer du plan'))
        .setIcon('minus-circle').onClick(() => this._retirerDuPlan(sel)));
      m.addItem((i) => i.setTitle(plur ? tr('Supprimer les ') + sel.length + tr(' tâches…') : tr('Supprimer la tâche…'))
        .setIcon('trash-2').onClick(() => this._supprimerNoeuds(sel)));
      m.showAtMouseEvent(e);
    });

    // Déplié ou non par carte (inversion du mode de la vue) : le chevron,
    // dans la rangée du bas, montre / masque les propriétés de CETTE carte.
    const deplie = this._estDeplie(n.ref);
    const corps = carte.createDiv({ cls: 'zfa-artic-corps' });
    const titreEl = corps.createDiv({ cls: 'zfa-artic-titre', text: n.intitule });
    titreEl.setAttribute('title', tr('Double-clic pour renommer'));
    titreEl.addEventListener('click', (e) => e.stopPropagation());
    titreEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._editerTitre(titreEl, n);
    });
    const bas = corps.createDiv({ cls: 'zfa-artic-bas' });
    // Impactée (dérivé) : une descendante est bloquée — icône discrète devant
    // le statut.
    if (this._impactees && this._impactees.has(n.ref)) {
      const imp = bas.createSpan({ cls: 'zfa-artic-impactee' });
      imp.setAttribute('aria-label', tr('impactée'));
      obsidian.setIcon(imp, 'arrow-down-to-dot');
    }
    bas.createSpan({ cls: 'zfa-artic-pastille', text: n.statut });
    if (n.echeance) bas.createSpan({ cls: 'zfa-artic-ech', text: n.echeance });
    // Crayon (au survol) : ouvre le formulaire de propriétés de la tâche.
    const crayon = bas.createSpan({ cls: 'zfa-artic-crayon' });
    crayon.setAttribute('aria-label', tr('Modifier la tâche'));
    obsidian.setIcon(crayon, 'pencil');
    crayon.addEventListener('pointerdown', (e) => e.stopPropagation());
    crayon.addEventListener('click', (e) => {
      e.stopPropagation();
      new ModaleTache(this.app, this.greffon, { ref: n.ref, apres: () => this.dessiner() }).open();
    });
    const chev = bas.createSpan({ cls: 'zfa-artic-chevron' });
    obsidian.setIcon(chev, deplie ? 'chevron-down' : 'chevron-right');
    chev.setAttribute('aria-label', deplie
      ? tr('Masquer les propriétés') : tr('Afficher les propriétés'));
    chev.addEventListener('pointerdown', (e) => e.stopPropagation());
    chev.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._cartesInversees.has(n.ref)) this._cartesInversees.delete(n.ref);
      else this._cartesInversees.add(n.ref);
      this.dessiner();
    });
    const av = (this._avDeriv && this._avDeriv.has(n.ref))
      ? this._avDeriv.get(n.ref) : (Number(n.avancement) || 0);
    if (av > 0) {
      const j = corps.createDiv({ cls: 'zfa-artic-jauge' });
      j.createDiv({ cls: 'zfa-artic-jauge-in' }).style.width = Math.min(100, av) + '%';
    }

    if (deplie) {
      // En détaillé, la carte AFFICHE les propriétés cochées (lecture seule).
      // La modification passe par le formulaire (double-clic, crayon, clic droit).
      const cols = (this.ctx.ordre && this.ctx.ordre()) || [];
      if (cols.length) {
        const tb = corps.createDiv({ cls: 'zfa-artic-props' });
        for (const col of cols) {
          const brut = col.valeur ? col.valeur(n.ref) : null;
          const txt = MoteurArticulation.texteValeur(
            brut && typeof brut === 'object' && 'data' in brut ? brut.data : brut);
          const rg = tb.createDiv({ cls: 'zfa-artic-prop' });
          const cle = rg.createSpan({ cls: 'zfa-artic-prop-cle' });
          obsidian.setIcon(cle.createSpan({ cls: 'zfa-artic-prop-ic' }),
            MoteurArticulation._iconeType(col.type, col.id));
          cle.createSpan({ text: col.nom });
          rg.createSpan({ cls: 'zfa-artic-prop-val', text: txt || '—' });
        }
      }
    }

    carte.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.zfa-artic-accroche')) return;
      this.glisserNoeud(e, n.ref, gn);
    });
    // Clic simple : sélectionne la carte. Shift / Cmd / Ctrl + clic :
    // ajoute ou retire de la sélection. ⌫ supprime la sélection.
    // Double-clic : formulaire de modification (le titre garde le sien).
    carte.addEventListener('click', (e) => {
      if (gn.dataset.aGlisse) { delete gn.dataset.aGlisse; return; }
      this.selectionnerNoeud(n.ref, gn, e);
    });
    carte.addEventListener('dblclick', (e) => {
      if (e.target.closest('.zfa-artic-titre')) return;
      e.stopPropagation();
      new ModaleTache(this.app, this.greffon,
        { ref: n.ref, apres: () => this.dessiner() }).open();
    });

    const hN = n.h || ARTIC_H;
    for (const type of ['hier', 'bloque']) {
      const ga = svgEl('g', {
        class: 'zfa-artic-accroche zfa-artic-accroche-' + type,
        transform: 'translate(' + ARTIC_W + ',' + ancreY(hN, type) + ')' });
      ga.dataset.type = type;
      // Cible large invisible pour viser à la souris, puis le demi-cercle
      // toujours visible qui marque le point de connexion, sur le bord de la carte.
      ga.appendChild(svgEl('circle', { r: 11, class: 'zfa-artic-accroche-cible' }));
      ga.appendChild(svgEl('path', {
        d: 'M 0 -5 A 5 5 0 0 1 0 5 Z', class: 'zfa-artic-accroche-pastille' }));
      const nom = type === 'hier' ? tr('sous-tâches') : tr('tâches bloquantes');
      const t = svgEl('title', {});
      t.textContent = tr('Clic : afficher / masquer les ') + nom
        + tr(" (ou en créer une s'il n'y en a pas). Double-clic : nouvelle ")
        + nom + tr('. Maintenir et tirer : relier une tâche existante.');
      ga.appendChild(t);
      ga.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.tirerArete(e, n.ref, type); });
      gn.appendChild(ga);
    }

    // Témoin de repli (NON cliquable — le point d'accroche gère tout) : « n »
    // quand des relatifs sont cachés, « − » quand ils sont dépliés et pliables.
    const temoinRepli = (type) => {
      const caches = type === 'hier'
        ? ((this._enfantsHorsPlan && this._enfantsHorsPlan.get(n.ref)) || []).length
        : ((this._bloqueCaches && this._bloqueCaches.get(n.ref)) || 0);
      const surPlan = (this._replierPossible && this._replierPossible.get(n.ref + '|' + type)) || 0;
      if (!caches && !surPlan) return;
      const gb = svgEl('g', {
        class: 'zfa-artic-repli zfa-artic-repli-' + type
          + (caches ? ' est-repliee' : ' est-depliee'),
        transform: 'translate(' + (ARTIC_W + REPLI_DX) + ',' + ancreY(hN, type) + ')' });
      gb.appendChild(svgEl('circle', { r: 8, class: 'zfa-artic-repli-fond' }));
      const tx = svgEl('text', { x: 0, y: 0, class: 'zfa-artic-repli-txt' });
      tx.textContent = caches ? String(caches) : '−';
      gb.appendChild(tx);
      gn.appendChild(gb);
    };
    temoinRepli('hier');
    temoinRepli('bloque');
    g.appendChild(gn);
  }

  // Icône Obsidian d'une propriété selon son type (ou son identifiant de base).
  static _iconeType(type, id) {
    if (id && String(id).startsWith('formula.')) return 'variable';
    if (id && String(id).startsWith('file.')) return 'file';
    return ({
      text: 'text', number: 'hash', date: 'calendar', datetime: 'clock',
      checkbox: 'check-square', multitext: 'list', tags: 'tags',
      aliases: 'corner-down-right',
    })[type] || 'tag';
  }

  // Réplique locale de VueFriseBase.texteValeur (hors de portée depuis ce
  // module) : stringifie une Value de base sans jamais afficher « [object Object] ».
  static texteValeur(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.map((x) => MoteurArticulation.texteValeur(x)).filter(Boolean).join(', ');
    if (typeof v === 'object') {
      if (typeof v.toString === 'function') {
        const t = v.toString();
        return t === '[object Object]' ? '' : t;
      }
      return '';
    }
    return String(v);
  }

  // Tracé direct d'une arête : courbe (défaut) ou angulaire selon le réglage.
  // Réservé à l'aperçu du tiré d'arête et au repli quand aucun chemin ne
  // contourne les cartes — le routage courant est fait par _traceArete.
  _chemin(x1, y1, x2, y2) {
    const ang = (this.greffon.settings.articulationFleches || 'courbe') === 'angulaire';
    if (ang) {
      const mx = Math.max(x1 + 16, (x1 + x2) / 2);
      return Ariane.cheminPolyligne([{ x: x1, y: y1 }, { x: mx, y: y1 },
        { x: mx, y: y2 }, { x: x2, y: y2 }], R_COUDE_ARTIC);
    }
    return Ariane._cheminFleche(x1, y1, x2, y2);
  }

  // Géométrie complète d'une arête : points d'accroche et tracé. La décision
  // est pure (Ariane.traceFlecheArticulation) : tracé simple s'il est libre,
  // sinon contournement des cartes — le bord droit de la cible n'est plus
  // jamais une entrée, réservé aux sorties (batch 2, idée n° 8).
  _traceArete(deRef, versRef, type) {
    const s = this._pt(deRef);
    const t = this._pt(versRef);
    const hs = ((this._noeudsParRef && this._noeudsParRef.get(deRef)) || {}).h || ARTIC_H;
    const ht = ((this._noeudsParRef && this._noeudsParRef.get(versRef)) || {}).h || ARTIC_H;
    const x1 = s.x + ARTIC_W;
    const y1 = s.y + ancreY(hs, type);
    const obstacles = [];
    for (const n of (this._noeudsParRef ? this._noeudsParRef.values() : [])) {
      if (!n || n.ref === deRef || n.ref === versRef) continue;
      const p = this._pt(n.ref);
      obstacles.push({ x: p.x, y: p.y, w: ARTIC_W, h: n.h || ARTIC_H });
    }
    const r = Ariane.traceFlecheArticulation({
      x1,
      y1,
      source: { x: s.x, y: s.y, w: ARTIC_W, h: hs },
      cible: { x: t.x, y: t.y, w: ARTIC_W, h: ht, ancreGauche: t.y + ancreY(ht, type) },
      obstacles,
      mode: (this.greffon.settings.articulationFleches || 'courbe') === 'angulaire' ? 'angulaire' : 'courbe',
      marge: 12,
      ecart: 22,
    });
    return { x1, y1, x2: r.x2, y2: r.y2, d: r.d, labX: r.labX, labY: r.labY };
  }

  dessinerArete(g, a) {
    const { x1, y1, x2, y2, d, labX, labY } = this._traceArete(a.de, a.vers, a.type);
    const gr = svgEl('g', { class: 'zfa-artic-arete-groupe' });
    gr.dataset.de = a.de; gr.dataset.vers = a.vers; gr.dataset.type = a.type;
    gr.appendChild(svgEl('path', { d, class: 'zfa-artic-arete-cible' }));
    gr.appendChild(svgEl('path', { d, class: 'zfa-artic-arete zfa-artic-' + a.type,
      'marker-end': 'url(#zfa-artic-pointe-' + a.type + ')' }));
    if (a.libelle) {
      const lab = svgEl('text', { x: labX, y: labY, class: 'zfa-artic-arete-lab' });
      lab.textContent = a.libelle;
      gr.appendChild(lab);
    }
    if (this._selArete && this._selArete.de === a.de && this._selArete.vers === a.vers
      && this._selArete.type === a.type) gr.classList.add('est-active');
    gr.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.selectionnerArete(a.de, a.vers, a.type, gr);
    });
    g.appendChild(gr);
  }

  // Survol d'une carte : ses arêtes DIRECTES (amont + aval) et les cartes à
  // l'autre bout passent en avant, tout le reste s'estompe. Purement visuel —
  // ne touche ni à la sélection ni aux statuts dérivés (bloquée / impactée).
  _survolLiens(ref) {
    if (!this._scene || this._survolRef === ref) return;
    this._finSurvolLiens();
    this._survolRef = ref;
    this._scene.classList.add('a-un-survol');
    const lies = new Set([ref]);
    for (const gr of this._scene.querySelectorAll('.zfa-artic-arete-groupe')) {
      if (gr.dataset.de === ref || gr.dataset.vers === ref) {
        gr.classList.add('est-lie');
        lies.add(gr.dataset.de);
        lies.add(gr.dataset.vers);
      }
    }
    for (const gn of this._scene.querySelectorAll('.zfa-artic-noeud')) {
      if (lies.has(gn.dataset.ref)) gn.classList.add('est-lie');
    }
  }

  _finSurvolLiens() {
    this._survolRef = null;
    if (!this._scene) return;
    this._scene.classList.remove('a-un-survol');
    for (const el of this._scene.querySelectorAll('.est-lie')) el.classList.remove('est-lie');
  }

  // Ponts aux croisements : détection des intersections sur les tracés rendus
  // (échantillonnage léger), puis pour l'arête qui saute on réécrit son `d` via
  // Ariane.cheminAvecPonts — qui coupe le tracé D'ORIGINE et recolle par un
  // demi-cercle, sans jamais ré-échantillonner (donc sans escalier). Refait à
  // chaque redessin complet ; ignoré au-delà de 140 arêtes.
  _poserPonts(g, aretes) {
    if (!aretes || aretes.length > 140) return;
    const grs = [...g.querySelectorAll('.zfa-artic-arete-groupe')];
    const echant = [];
    for (let i = 0; i < grs.length; i++) {
      const path = grs[i].querySelector('path.zfa-artic-arete');
      let L = 0;
      try { L = path && path.getTotalLength ? path.getTotalLength() : 0; } catch (e) { L = 0; }
      if (!L) continue;
      const pts = [];
      for (let s = 0; s <= L; s += 6) {
        const p = path.getPointAtLength(Math.min(s, L));
        pts.push({ x: p.x, y: p.y });
      }
      echant.push({ _i: i, type: grs[i].dataset.type || 'hier', pts });
    }
    const ponts = Ariane.pontsAretes(echant, { max: 300 });
    if (!ponts.length) return;
    const parArete = new Map();
    for (const c of ponts) {
      const e = echant[c.sur];
      if (!e) continue;
      if (!parArete.has(e._i)) parArete.set(e._i, []);
      parArete.get(e._i).push({ x: c.x, y: c.y });
    }
    for (const [i, cs] of parArete) {
      const paths = grs[i].querySelectorAll('path');
      const d0 = paths[paths.length - 1] && paths[paths.length - 1].getAttribute('d');
      if (!d0) continue;
      const d1 = Ariane.cheminAvecPonts(d0, cs, 5);
      if (d1) for (const p of paths) p.setAttribute('d', d1);
    }
  }

  //#endregion Articulation · cartes & arêtes

  //#region Articulation · sélection & presse-papiers
  selectionnerArete(de, vers, type, gr) {
    this._deselectionnerArete();
    this._selArete = { de, vers, type };
    if (gr) gr.classList.add('est-active');
    if (this.racine.focus) this.racine.focus({ preventScroll: true });
  }

  _deselectionnerArete() {
    this._selArete = null;
    if (this._svg) {
      for (const el of this._svg.querySelectorAll('.zfa-artic-arete-groupe.est-active')) {
        el.classList.remove('est-active');
      }
    }
  }

  // Sélection multiple. `e` porte les modificateurs : Shift / Cmd / Ctrl +
  // clic bascule une carte dans la sélection ; un clic nu la remplace.
  selectionnerNoeud(ref, gn, e) {
    this._deselectionnerArete();
    const multi = e && (e.shiftKey || e.metaKey || e.ctrlKey);
    if (multi) {
      if (this._selNoeuds.has(ref)) this._selNoeuds.delete(ref);
      else this._selNoeuds.add(ref);
    } else {
      this._selNoeuds = new Set([ref]);
    }
    this._appliquerSelection(this._selNoeuds);
    if (this.racine.focus) this.racine.focus({ preventScroll: true });
  }

  // Reflète un ensemble de refs sur les classes CSS des cartes.
  _appliquerSelection(refs) {
    this._selNoeuds = refs instanceof Set ? refs : new Set(refs);
    if (!this._svg) return;
    for (const el of this._svg.querySelectorAll('.zfa-artic-noeud')) {
      el.classList.toggle('est-selectionne', this._selNoeuds.has(el.dataset.ref));
    }
  }

  _toutDeselectionner() { this._appliquerSelection(new Set()); }

  async _supprimerNoeud(ref) { return this._supprimerNoeuds([ref]); }

  async _supprimerNoeuds(refs) {
    refs = [...new Set((refs || []).filter(Boolean))];
    if (!refs.length) return;
    if (this.greffon.settings.articulationConfirmerSuppression !== false) {
      const n0 = (this._noeudsParRef && this._noeudsParRef.get(refs[0])) || {};
      const msg = refs.length === 1
        ? tr('Supprimer la tâche « ') + (n0.intitule || refs[0]) + tr(' » ? Sa note ira à la corbeille.')
        : tr('Supprimer ') + refs.length + tr(' tâches ? Leurs notes iront à la corbeille.');
      const ok = await new Promise((res) => new ConfirmationRattachement(this.app, msg, res).open());
      if (!ok) return;
    }
    this._selNoeuds = new Set();
    for (const ref of refs) await this.greffon.supprimerTache(ref);
    if (this._plan) {
      const s = new Set(refs);
      this._plan.cartes = this._plan.cartes.filter((c) => !s.has(c.ref));
      this.ctx.ecrirePlan(this._plan);
    }
    this.dessiner();
  }

  async touche(e) {
    const cible = e.target;
    if (cible && (cible.matches('input, textarea, select') || cible.isContentEditable)) return;
    if (_toucheRetablir(e)) { e.preventDefault(); e.stopPropagation(); await refaireDernier(this); return; }
    if (_toucheAnnuler(e)) { e.preventDefault(); e.stopPropagation(); await annulerDernier(this); return; }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      this._espace = true;
      this.racine.addClass('est-espace');
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const k = (e.key || '').toLowerCase();
    if (e.key === 'Escape') {
      this._deselectionnerArete();
      this._toutDeselectionner();
      return;
    }
    if (mod && k === 'a') {
      e.preventDefault();
      this._appliquerSelection(new Set(this._noeudsParRef ? this._noeudsParRef.keys() : []));
      return;
    }
    if (mod && k === 'c') { e.preventDefault(); this._copier(); return; }
    if (mod && k === 'v') { e.preventDefault(); await this._coller(this._dernierePosFond); return; }
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (this._selArete) {
      e.preventDefault();
      const { de, vers, type } = this._selArete;
      this._selArete = null;
      if (type === 'hier') await this.ctx.poserParent(vers, null);
      else await this.greffon.retirerBlocage(de, vers);
      this.dessiner();
      return;
    }
    if (this._selNoeuds.size) {
      e.preventDefault();
      this._retirerDuPlan([...this._selNoeuds]); // ⌫ = retirer du plan, pas supprimer
    }
  }

  // Rectangle de sélection au glissé du fond. Sélectionne toute carte que le
  // rectangle touche (pas seulement celles entièrement dedans).
  rubberBand(ev) {
    ev.preventDefault();
    const base = (ev.shiftKey || ev.metaKey || ev.ctrlKey)
      ? new Set(this._selNoeuds) : new Set();
    const d0 = this._versScene(ev);
    const rect = svgEl('rect', { class: 'zfa-artic-lasso',
      x: d0.x, y: d0.y, width: 0, height: 0 });
    this._scene.appendChild(rect);
    const boites = [...(this._noeudsParRef ? this._noeudsParRef.values() : [])].map((n) => {
      const p = this._pt(n.ref);
      return { ref: n.ref, x: p.x, y: p.y, w: ARTIC_W, h: n.h || ARTIC_H };
    });
    const bouger = (e) => {
      const d = this._versScene(e);
      const r = { x: Math.min(d0.x, d.x), y: Math.min(d0.y, d.y),
        w: Math.abs(d.x - d0.x), h: Math.abs(d.y - d0.y) };
      rect.setAttribute('x', r.x); rect.setAttribute('y', r.y);
      rect.setAttribute('width', r.w); rect.setAttribute('height', r.h);
      const sel = new Set(base);
      for (const ref of Ariane.rectSelection(boites, r)) sel.add(ref);
      this._appliquerSelection(sel);
    };
    const lacher = () => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      rect.remove();
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  // Copie la sélection : entêtes + positions + liens internes, sur le greffon
  // (le moteur est recréé à chaque dessin), + miroir texte du presse-papier.
  _copier() {
    const refs = [...this._selNoeuds];
    if (!refs.length) return;
    const set = new Set(refs);
    const taches = refs.map((r) => {
      const n = (this._noeudsParRef && this._noeudsParRef.get(r)) || {};
      const f = this.app.vault.getMarkdownFiles().find((z) => z.basename === r);
      const fm = f ? Object.assign({}, (this.app.metadataCache.getFileCache(f) || {}).frontmatter) : {};
      const p = this._pt(r);
      return { cle: r, intitule: n.intitule || '', fm, x: p.x, y: p.y };
    });
    const liens = (this._aretes || [])
      .filter((a) => set.has(a.de) && set.has(a.vers))
      .map((a) => ({ de: a.de, vers: a.vers, type: a.type }));
    this.greffon._presseArtic = { taches, liens };
    try { navigator.clipboard.writeText(refs.map((r) => '[[' + r + ']]').join(' ')); } catch (e2) {}
    new obsidian.Notice(refs.length + tr(' tâche(s) copiée(s)'));
  }

  // Colle le presse-papier : une nouvelle tâche par entrée, décalée, avec les
  // liens hier/bloque entre tâches collées reconstitués.
  async _coller(pos) {
    const snap = this.greffon._presseArtic;
    if (!snap || !snap.taches || !snap.taches.length) return;
    const L = (fm, con) => this.greffon._lireT(fm, con);
    const minX = Math.min(...snap.taches.map((t) => t.x));
    const minY = Math.min(...snap.taches.map((t) => t.y));
    const ox = pos ? pos.x - minX : 44;
    const oy = pos ? pos.y - minY : 44;
    const map = new Map();
    for (const t of snap.taches) {
      const chemin = await this.greffon.creerTache({
        intitule: t.intitule || L(t.fm, 'intitule') || '',
        famille: L(t.fm, 'famille') || '',
      });
      const nouv = this.greffon.refDeChemin(chemin);
      if (!nouv) continue;
      map.set(t.cle, nouv);
      const champs = {};
      for (const con of ['statut', 'priorite', 'jalon', 'avancement', 'debut',
        'echeance', 'source', 'livrable', 'fichier']) {
        const v = L(t.fm, con);
        if (v != null && v !== '') champs[con] = v;
      }
      if (Object.keys(champs).length) await this.greffon.majTache(nouv, champs);
      await this.ctx.poserPosition(nouv, Math.round(t.x + ox), Math.round(t.y + oy));
    }
    for (const li of (snap.liens || [])) {
      const de = map.get(li.de);
      const vers = map.get(li.vers);
      if (!de || !vers) continue;
      if (li.type === 'hier') await this.ctx.poserParent(vers, de);
      else await this.greffon.creerBlocage(de, vers);
    }
    this._selNoeuds = new Set(map.values());
    this.dessiner();
    this._appliquerSelection(this._selNoeuds);
    new obsidian.Notice(map.size + tr(' tâche(s) collée(s)'));
  }

  // Coordonnées scène à partir d'un évènement pointeur.
  //#endregion Articulation · sélection & presse-papiers

  //#region Articulation · navigation (pan, zoom, glisser)
  _versScene(ev) {
    const b = this._svg.getBoundingClientRect();
    return {
      x: (ev.clientX - b.left - this._vue.x) / this._vue.k,
      y: (ev.clientY - b.top - this._vue.y) / this._vue.k,
    };
  }

  panDepart(ev) {
    if (ev.button !== 0 && ev.button !== 1) return;
    ev.preventDefault();
    this.racine.addClass('est-pan');
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const vx = this._vue.x;
    const vy = this._vue.y;
    const bouger = (e) => {
      this._vue.x = vx + (e.clientX - x0);
      this._vue.y = vy + (e.clientY - y0);
      this.appliquerVue();
    };
    const lacher = () => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      this.racine.removeClass('est-pan');
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  // Bouton droit sur le fond : glisser = pan ; clic net (sans déplacement)
  // = menu contextuel du fond, ouvert au relâché.
  _panDroit(ev) {
    ev.preventDefault();
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const vx = this._vue.x;
    const vy = this._vue.y;
    let bouge = false;
    this.racine.addClass('est-pan');
    const bouger = (e) => {
      if (Math.abs(e.clientX - x0) > 3 || Math.abs(e.clientY - y0) > 3) bouge = true;
      this._vue.x = vx + (e.clientX - x0);
      this._vue.y = vy + (e.clientY - y0);
      this.appliquerVue();
    };
    const lacher = (e) => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      this.racine.removeClass('est-pan');
      if (!bouge) this._menuFond(e);
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  _menuFond(ev) {
    const p = this._versScene(ev);
    const m = new obsidian.Menu();
    let n = 0;
    if (this._selNoeuds.size) {
      n++;
      m.addItem((i) => i.setTitle(this._selNoeuds.size > 1
        ? tr('Copier les ') + this._selNoeuds.size + tr(' tâches')
        : tr('Copier la tâche')).setIcon('copy').onClick(() => this._copier()));
    }
    const pp = this.greffon._presseArtic;
    if (pp && pp.taches && pp.taches.length) {
      n++;
      m.addItem((i) => i.setTitle(pp.taches.length > 1
        ? tr('Coller ') + pp.taches.length + tr(' tâches')
        : tr('Coller la tâche')).setIcon('clipboard-paste').onClick(() => this._coller(p)));
    }
    if (this._plan && this._plan.cartes.length) {
      n++;
      m.addSeparator();
      m.addItem((i) => i.setTitle(tr('Nettoyer le canvas')).setIcon('eraser')
        .onClick(() => this._nettoyerPlan()));
    }
    if (n) m.showAtMouseEvent(ev);
  }

  zoomer(ev) {
    ev.preventDefault();
    const b = this._svg.getBoundingClientRect();
    this._zoomVers(ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX - b.left, ev.clientY - b.top);
  }

  // Zoom d'un facteur, autour d'un point de l'écran (défaut : centre de la vue).
  // Utilisé par la molette et par les boutons de la barre d'outils.
  _zoomVers(facteur, cx, cy) {
    const b = this._svg.getBoundingClientRect();
    if (cx == null) cx = b.width / 2;
    if (cy == null) cy = b.height / 2;
    const k = Math.max(0.25, Math.min(2.5, this._vue.k * facteur));
    this._vue.x = cx - (cx - this._vue.x) * (k / this._vue.k);
    this._vue.y = cy - (cy - this._vue.y) * (k / this._vue.k);
    this._vue.k = k;
    this.appliquerVue();
  }

  glisserNoeud(ev, ref, gn) {
    ev.preventDefault();
    ev.stopPropagation();
    // Empoigner une carte hors sélection en fait la nouvelle sélection —
    // sauf avec un modificateur (là c'est le clic qui gère l'ajout/retrait).
    const modif = ev.shiftKey || ev.metaKey || ev.ctrlKey;
    if (!this._selNoeuds.has(ref) && !modif) this.selectionnerNoeud(ref, gn, null);
    const refs = (this._selNoeuds.has(ref) && this._selNoeuds.size > 1)
      ? [...this._selNoeuds] : [ref];
    const multi = refs.length > 1;
    const dep = this._versScene(ev);
    const p0 = new Map(refs.map((r) => [r, { ...this._pt(r) }]));
    const gnPar = new Map();
    for (const el of this._svg.querySelectorAll('.zfa-artic-noeud')) gnPar.set(el.dataset.ref, el);
    let bouge = false;
    const bouger = (e) => {
      const s = this._versScene(e);
      if (Math.abs(s.x - dep.x) > 2 || Math.abs(s.y - dep.y) > 2) bouge = true;
      const dx = s.x - dep.x;
      const dy = s.y - dep.y;
      if (!multi) {
        // Aimantation seulement pour une carte seule.
        const a = this._aimanter(ref, p0.get(ref).x + dx, p0.get(ref).y + dy);
        this._pos.set(ref, { x: a.x, y: a.y });
        gn.setAttribute('transform', 'translate(' + a.x + ',' + a.y + ')');
        this.majAretesDe(ref);
        this._tracerReperes(bouge ? a.repères : null);
        return;
      }
      for (const r of refs) {
        const np = { x: Math.round(p0.get(r).x + dx), y: Math.round(p0.get(r).y + dy) };
        this._pos.set(r, np);
        const el = gnPar.get(r);
        if (el) el.setAttribute('transform', 'translate(' + np.x + ',' + np.y + ')');
        this.majAretesDe(r);
      }
    };
    const lacher = async () => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      this._tracerReperes(null);
      if (!bouge) return;
      gn.dataset.aGlisse = '1';
      for (const r of refs) {
        const p = this._pt(r);
        await this.ctx.poserPosition(r, Math.round(p.x), Math.round(p.y));
      }
      if (this.racine && this.racine.focus) this.racine.focus({ preventScroll: true });
      // Annulation / rétablissement : replacer chaque carte où elle était
      // avant le glissé, puis la rejouer vers sa position d'arrivée.
      const depart = [...p0.entries()].map(([r, p]) => [r, { x: Math.round(p.x), y: Math.round(p.y) }]);
      const arrivee = refs.map((r) => { const p = this._pt(r); return [r, { x: Math.round(p.x), y: Math.round(p.y) }]; });
      poserAnnulation(this, async () => {
        for (const [r, p] of depart) {
          this._pos.set(r, { x: p.x, y: p.y });
          await this.ctx.poserPosition(r, p.x, p.y);
        }
        this.dessiner();
      }, async () => {
        for (const [r, p] of arrivee) {
          this._pos.set(r, { x: p.x, y: p.y });
          await this.ctx.poserPosition(r, p.x, p.y);
        }
        this.dessiner();
      });
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  // Redessine les chemins des arêtes touchant un nœud déplacé.
  majAretesDe(ref) { this._retracerAretes(ref); }

  // Retrace les arêtes (celles touchant `ref` s'il est donné) : chemin et
  // libellé. Aussi appelé sans filtre après la mesure des hauteurs de cartes.
  _retracerAretes(ref) {
    if (!this._svg) return;
    for (const gr of this._svg.querySelectorAll('.zfa-artic-arete-groupe')) {
      if (ref && gr.dataset.de !== ref && gr.dataset.vers !== ref) continue;
      const t = this._traceArete(gr.dataset.de, gr.dataset.vers, gr.dataset.type);
      for (const p of gr.querySelectorAll('path')) p.setAttribute('d', t.d);
      const lab = gr.querySelector('.zfa-artic-arete-lab');
      if (lab && t.milieu) {
        lab.setAttribute('x', t.milieu.x);
        lab.setAttribute('y', t.milieu.y - 4);
      }
    }
  }

  // Tap simple sur un point d'accroche : s'il y a des relatifs de ce type,
  // on les replie ou les déplie ; sinon on crée une tâche reliée. Si les
  // relatifs existent mais sont tous déjà montrés et partagés (rien à replier
  // sans arracher une autre carte), le tap ne fait rien.
  _actionAccrocheSimple(ref, type, s0) {
    if (!this._plan) { this._nouvelleTacheReliee(ref, type, s0); return; }
    const graphe = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const rel = Ariane.relativesHorsPlan(ref, graphe.aretes, refsPlan);
    const nbCaches = type === 'hier' ? rel.sousTaches.length : rel.bloquantes.length;
    if (nbCaches) { this._deplierRelatifs(ref, type); return; }
    if (Ariane.replierRelatifs(ref, graphe.aretes, refsPlan, type).length) {
      this._replierRelatifs(ref, type);
      return;
    }
    const aDesRelatifs = (graphe.aretes || []).some((a) => a.type === type
      && (type === 'hier' ? a.de === ref : a.vers === ref));
    if (!aDesRelatifs) this._nouvelleTacheReliee(ref, type, s0);
  }

  // Crée une tâche vierge reliée au nœud « ref » selon le bouton : sous-tâche
  // pour « hier », tâche bloquée pour « bloque ». Utilisé au double tap sur
  // un point d'accroche, ou au tap simple s'il n'y a aucun relatif.
  async _nouvelleTacheReliee(ref, type, s0) {
    const chemin = await this.greffon.creerTache({});
    const nouv = this.greffon.refDeChemin(chemin);
    if (!nouv) return;
    const gigue = () => Math.round((Math.random() - 0.5) * 40);
    await this.ctx.poserPosition(nouv,
      Math.round(s0.x + ARTIC_W + 70) + gigue(),
      Math.round(s0.y + (type === 'hier' ? 20 : 90)) + gigue());
    if (type === 'hier') await this.ctx.poserParent(nouv, ref);
    else await this.greffon.creerBlocage(ref, nouv);
    new obsidian.Notice((type === 'hier'
      ? tr('Sous-tâche créée : ') : tr('Tâche bloquée créée : ')) + nouv);
    this.dessiner();
  }

  // Édition en place du titre de la carte (double-clic). Entrée valide, Échap
  // annule, la perte de focus valide aussi.
  _editerTitre(el, n) {
    if (el.querySelector('input')) return;
    const val0 = n.intitule || '';
    el.empty();
    const inp = el.createEl('input', { type: 'text', cls: 'zfa-artic-titre-edit' });
    inp.value = val0;
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    inp.addEventListener('click', (e) => e.stopPropagation());
    let fait = false;
    const finir = async (garder) => {
      if (fait) return;
      fait = true;
      const v = inp.value.trim();
      if (garder && v && v !== val0 && this.ctx.poserTitre) {
        await this.ctx.poserTitre(n.ref, v);
      }
      this.dessiner();
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finir(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finir(false); }
    });
    inp.addEventListener('blur', () => finir(true));
    inp.focus();
    inp.select();
  }

  tirerArete(ev, ref, type) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const s0 = this._pt(ref);
    const hN = ((this._noeudsParRef && this._noeudsParRef.get(ref)) || {}).h || ARTIC_H;
    const x1 = s0.x + ARTIC_W;
    const y1 = s0.y + ancreY(hN, type);
    const dep = this._versScene(ev);
    const trait = svgEl('path', {
      class: 'zfa-artic-lien-en-cours zfa-artic-lien-en-cours-' + type, d: '',
      'marker-end': 'url(#zfa-artic-pointe-' + type + ')' });
    this._scene.appendChild(trait);
    let cible = null;
    let bouge = false;
    const bouger = (e) => {
      const s = this._versScene(e);
      if (Math.abs(s.x - dep.x) > 4 || Math.abs(s.y - dep.y) > 4) bouge = true;
      trait.setAttribute('d', this._chemin(x1, y1, s.x, s.y));
      // Document de la fenêtre de la vue : en volet détaché, le document
      // global est celui de la fenêtre principale, où les cartes du graphe
      // n'existent pas — le reliage n'y trouvait jamais sa cible.
      const sous = this._doc().elementFromPoint(e.clientX, e.clientY);
      const gn = sous && sous.closest ? sous.closest('.zfa-artic-noeud') : null;
      const r = gn && gn.dataset ? gn.dataset.ref : null;
      const anc = this._svg.querySelector('.zfa-artic-noeud.est-cible');
      if (anc && anc !== gn) anc.classList.remove('est-cible');
      cible = r && r !== ref ? r : null;
      if (cible && gn) gn.classList.add('est-cible');
    };
    const lacher = async () => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      trait.remove();
      const m = this._svg.querySelector('.zfa-artic-noeud.est-cible');
      if (m) m.classList.remove('est-cible');
      // Sans glisser : un « tap » sur le point d'accroche.
      //  · double tap rapide → nouvelle tâche reliée, quoi qu'il arrive ;
      //  · tap simple → replier / déplier les relatifs s'il y en a, sinon
      //    créer une tâche reliée. Différé pour laisser passer le double.
      if (!bouge) {
        const now = Date.now();
        const t = this._tapAccroche;
        if (t && t.ref === ref && t.type === type && now - t.t < DELAI_TAP) {
          clearTimeout(t.timer);
          this._tapAccroche = null;
          await this._nouvelleTacheReliee(ref, type, s0);
          return;
        }
        const timer = setTimeout(() => {
          this._tapAccroche = null;
          this._actionAccrocheSimple(ref, type, s0);
        }, DELAI_TAP);
        this._tapAccroche = { ref, type, t: now, timer };
        return;
      }
      if (!cible) return;
      const ajout = { de: ref, vers: cible, type };
      const v = Ariane.lienValide(this._aretes, this._dates, ajout);
      if (!v.ok) {
        new obsidian.Notice({
          cycle: tr('Ce lien fermerait un cycle.'),
          dates: tr("L'amont s'achève après le début de l'aval."),
          'dates-hier': tr('La tâche mère s\'achèverait avant sa sous-tâche.'),
          soi: tr('Une tâche ne se relie pas à elle-même.'),
        }[v.raison] || tr('Lien refusé.'));
        return;
      }
      if (type === 'hier') await this.ctx.poserParent(cible, ref);
      else await this.greffon.creerBlocage(ref, cible);
      this.dessiner();
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  //#endregion Articulation · navigation (pan, zoom, glisser)

  //#region Articulation · disposition du plan
  ajuster() {
    if (!this._pos || !this._pos.size) return;
    let minx = Infinity; let miny = Infinity; let maxx = -Infinity; let maxy = -Infinity;
    for (const p of this._pos.values()) {
      minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x + ARTIC_W); maxy = Math.max(maxy, p.y + ARTIC_H);
    }
    const b = this._svg.getBoundingClientRect();
    const marge = 40;
    const kx = (b.width - marge * 2) / Math.max(1, maxx - minx);
    const ky = (b.height - marge * 2) / Math.max(1, maxy - miny);
    const k = Math.max(0.25, Math.min(1.2, Math.min(kx, ky)));
    this._vue = { k, x: marge - minx * k, y: marge - miny * k };
    this.appliquerVue();
  }

  // Re-disposer : disposition « au propre » complète (couches + réduction des
  // croisements + redressement + anti-chevauchement + bandes par composante).
  // Les positions manuelles sont ignorées — on replace TOUT.
  redisposer() {
    if (!this._plan || !this._plan.cartes.length) return;
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const sousSet = this.greffon.tachesPourGantt().filter((t) => refsPlan.has(t.ref));
    const { noeuds, aretes } = Ariane.grapheArticulation(sousSet);
    const hDe = (ref) => ((this._noeudsParRef && this._noeudsParRef.get(ref)) || {}).h || ARTIC_H;
    const pos = Ariane.disposerArticulation(noeuds, aretes, { dx: 300, gapY: 36, hauteur: hDe });
    for (const cc of this._plan.cartes) {
      const p = pos.get(cc.ref);
      if (p) { cc.x = Math.round(p.x); cc.y = Math.round(p.y); }
    }
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
    new obsidian.Notice(tr('Disposition recalculée.'));
  }

  // Les propriétés de cette carte sont-elles montrées ? Le mode de la vue
  // donne le défaut ; le chevron de la carte l'inverse individuellement.
  _estDeplie(ref) {
    const parDefaut = this._mode === 'detaille';
    return this._cartesInversees.has(ref) ? !parDefaut : parDefaut;
  }

  // --- Plan de travail : ajout / retrait / dépliage ---

  // Ajoute une ref au plan à (x, y) scène. Si déjà là : recentre + sélectionne.
  _poserRef(ref, x, y) {
    if (!this._plan) this._plan = this.ctx.lirePlan();
    const i = this._plan.cartes.findIndex((c) => c.ref === ref);
    if (i >= 0) {
      const cc = this._plan.cartes[i];
      if (!Number.isFinite(cc.x) || !Number.isFinite(cc.y)) {
        // Carte tout juste ajoutée (pose auto) sans position : on la place ici.
        cc.x = Math.round(x); cc.y = Math.round(y);
        this.ctx.ecrirePlan(this._plan);
        this.dessiner();
      } else {
        const b = this._svg.getBoundingClientRect();
        this._vue.x = b.width / 2 - cc.x * this._vue.k;
        this._vue.y = b.height / 2 - cc.y * this._vue.k;
        this.appliquerVue();
      }
      this._appliquerSelection(new Set([ref]));
      return;
    }
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsFin = new Set(this._plan.cartes.map((c) => c.ref).concat(ref));
    const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsFin);
    this._plan.cartes.push({ ref, x: Math.round(x), y: Math.round(y),
      replie: rel.sousTaches.length > 0 || rel.bloquantes.length > 0 });
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
    this._appliquerSelection(new Set([ref]));
  }

  // Crée une tâche de la famille choisie et la pose à `pos` (coords scène).
  async _creerAuCanvas(familleId, pos) {
    const chemin = await this.greffon.creerTache(familleId ? { famille: familleId } : {});
    const ref = this.greffon.refDeChemin(chemin);
    if (!ref) return;
    this._poserRef(ref, pos.x, pos.y);
  }

  _retirerDuPlan(refs) {
    const s = new Set((refs || []).filter(Boolean));
    if (!s.size || !this._plan) return;
    this._plan.cartes = this._plan.cartes.filter((c) => !s.has(c.ref));
    this.ctx.ecrirePlan(this._plan);
    this._selNoeuds = new Set();
    this.dessiner();
    new obsidian.Notice(s.size + tr(' carte(s) retirée(s) du plan'));
  }

  // Clic sur un badge : ajoute au plan les relatifs hors plan de `ref`.
  _deplierRelatifs(ref, type) {
    if (!this._plan) return;
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsPlan);
    const cibles = type === 'hier' ? rel.sousTaches : rel.bloquantes;
    if (!cibles.length) return;
    const src = this._pt(ref);
    const occupe = this._plan.cartes.map((c) => ({ x: c.x, y: c.y, w: ARTIC_W, h: ARTIC_H }));
    const base = type === 'hier'
      ? { x: src.x - ((cibles.length - 1) * 120), y: src.y + 150 }
      : { x: src.x - 260, y: src.y - ((cibles.length - 1) * 40) };
    const pos = Ariane.grillePlacement(cibles.length, {
      origine: { x: Math.round(base.x), y: Math.round(base.y) },
      pas: { x: 240, y: 120 }, carte: { w: ARTIC_W, h: ARTIC_H }, occupe, parLigne: 3 });
    cibles.forEach((r, k) => this._plan.cartes.push({
      ref: r, x: pos[k].x, y: pos[k].y, replie: false }));
    const ic = this._plan.cartes.findIndex((c) => c.ref === ref);
    if (ic >= 0) {
      const apres = Ariane.relativesHorsPlan(ref, grapheAll.aretes,
        new Set(this._plan.cartes.map((c) => c.ref)));
      this._plan.cartes[ic].replie = apres.sousTaches.length > 0 || apres.bloquantes.length > 0;
    }
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
  }

  // Clic sur un badge « − » : retire du plan les relatifs de `ref` d'un type
  // (sous-arbre hiérarchique, ou chaîne de bloqueurs) qui n'y sont QUE par lui.
  _replierRelatifs(ref, type) {
    if (!this._plan) return;
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const aRetirer = new Set(Ariane.replierRelatifs(ref, grapheAll.aretes, refsPlan, type));
    if (!aRetirer.size) return;
    this._plan.cartes = this._plan.cartes.filter((c) => !aRetirer.has(c.ref));
    this._selNoeuds = new Set([...this._selNoeuds].filter((r) => !aRetirer.has(r)));
    const refsFin = new Set(this._plan.cartes.map((c) => c.ref));
    for (const c of this._plan.cartes) {
      const rel = Ariane.relativesHorsPlan(c.ref, grapheAll.aretes, refsFin);
      c.replie = rel.sousTaches.length > 0 || rel.bloquantes.length > 0;
    }
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
  }

  // « + » : ajoute au plan un niveau de sous-tâches (les enfants directs hors
  // plan de toutes les cartes du plan), en éventail sous chaque parent.
  _deplierNiveau() {
    if (!this._plan) return;
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const parParent = new Map();
    const vus = new Set();
    for (const c of this._plan.cartes) {
      for (const a of grapheAll.aretes) {
        if (a.type === 'hier' && a.de === c.ref && !refsPlan.has(a.vers) && !vus.has(a.vers)) {
          vus.add(a.vers);
          if (!parParent.has(c.ref)) parParent.set(c.ref, []);
          parParent.get(c.ref).push(a.vers);
        }
      }
    }
    if (!vus.size) return;
    const occupe = this._plan.cartes.map((c) => ({ x: c.x, y: c.y, w: ARTIC_W, h: ARTIC_H }));
    for (const [parent, enfants] of parParent) {
      const src = this._pt(parent);
      const pos = Ariane.grillePlacement(enfants.length, {
        origine: { x: Math.round(src.x - ((enfants.length - 1) * 120)), y: Math.round(src.y + 150) },
        pas: { x: 240, y: 120 }, carte: { w: ARTIC_W, h: ARTIC_H }, occupe, parLigne: 4 });
      enfants.forEach((r, k) => {
        this._plan.cartes.push({ ref: r, x: pos[k].x, y: pos[k].y, replie: false });
        occupe.push({ x: pos[k].x, y: pos[k].y, w: ARTIC_W, h: ARTIC_H });
      });
    }
    const refsFin = new Set(this._plan.cartes.map((c) => c.ref));
    for (const c of this._plan.cartes) {
      const rel = Ariane.relativesHorsPlan(c.ref, grapheAll.aretes, refsFin);
      c.replie = rel.sousTaches.length > 0 || rel.bloquantes.length > 0;
    }
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
  }

  // « − » : retire du plan le niveau de sous-tâches le plus profond (feuilles du
  // sous-arbre hiérarchique formé par les cartes du plan).
  _replierNiveau() {
    if (!this._plan || !this._plan.cartes.length) return;
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const parentDe = new Map();
    const aEnfantSurPlan = new Set();
    for (const a of grapheAll.aretes) {
      if (a.type !== 'hier') continue;
      if (refsPlan.has(a.de) && refsPlan.has(a.vers)) { parentDe.set(a.vers, a.de); aEnfantSurPlan.add(a.de); }
    }
    const feuilles = [...refsPlan].filter((r) => parentDe.has(r) && !aEnfantSurPlan.has(r));
    if (!feuilles.length) return;
    const prof = (r) => {
      let d = 0; let x = r; const vus = new Set();
      while (parentDe.has(x) && !vus.has(x)) { vus.add(x); x = parentDe.get(x); d++; }
      return d;
    };
    const dMax = Math.max(...feuilles.map(prof));
    const aRetirer = new Set(feuilles.filter((r) => prof(r) === dMax));
    this._plan.cartes = this._plan.cartes.filter((c) => !aRetirer.has(c.ref));
    const refsFin = new Set(this._plan.cartes.map((c) => c.ref));
    for (const c of this._plan.cartes) {
      const rel = Ariane.relativesHorsPlan(c.ref, grapheAll.aretes, refsFin);
      c.replie = rel.sousTaches.length > 0 || rel.bloquantes.length > 0;
    }
    this._selNoeuds = new Set([...this._selNoeuds].filter((r) => !aRetirer.has(r)));
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
  }

  // Pose d'un coup toutes les tâches du filtre absentes du plan.
  _ajouterDuFiltre() {
    if (!this._plan) return;
    const filtrees = ((this.ctx.taches && this.ctx.taches()) || []).map((t) => t.ref);
    const dejaLa = new Set(this._plan.cartes.map((c) => c.ref));
    const aPoser = filtrees.filter((r) => !dejaLa.has(r));
    if (!aPoser.length) { new obsidian.Notice(tr('Toutes les tâches du filtre sont déjà sur le plan.')); return; }
    const b = this._svg.getBoundingClientRect();
    const centre = { x: (b.width / 2 - this._vue.x) / this._vue.k,
      y: (b.height / 2 - this._vue.y) / this._vue.k };
    const occupe = this._plan.cartes.map((c) => ({ x: c.x, y: c.y, w: ARTIC_W, h: ARTIC_H }));
    const pos = Ariane.grillePlacement(aPoser.length, {
      origine: { x: Math.round(centre.x - 360), y: Math.round(centre.y - 200) },
      pas: { x: 240, y: 150 }, carte: { w: ARTIC_W, h: ARTIC_H }, occupe, parLigne: 4 });
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const refsFin = new Set(this._plan.cartes.map((c) => c.ref).concat(aPoser));
    aPoser.forEach((ref, k) => {
      const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsFin);
      this._plan.cartes.push({ ref, x: pos[k].x, y: pos[k].y,
        replie: rel.sousTaches.length > 0 || rel.bloquantes.length > 0 });
    });
    this.ctx.ecrirePlan(this._plan);
    this.dessiner();
    new obsidian.Notice(aPoser.length + tr(' tâche(s) ajoutée(s) au plan'));
  }

  async _nettoyerPlan() {
    if (!this._plan || !this._plan.cartes.length) return;
    const n = this._plan.cartes.length;
    const ok = await new Promise((res) => new ConfirmationRattachement(this.app,
      tr('Vider le plan de travail ? Les ') + n
        + tr(' cartes sont retirées du canvas. Les notes de tâche ne sont pas supprimées.'),
      res).open());
    if (!ok) return;
    this._plan = { cartes: [], _migre: true };
    this.ctx.ecrirePlan(this._plan);
    this._selNoeuds = new Set();
    this.dessiner();
    new obsidian.Notice(tr('Plan de travail vidé.'));
  }

  // Pose un lot de refs de tâche sur le plan, décalées, en un seul redessin.
  // Celles déjà présentes sont ignorées (une seule -> recentre via _poserRef).
  _poserRefs(refs, x, y) {
    if (!this._plan) this._plan = this.ctx.lirePlan();
    const grapheAll = Ariane.grapheArticulation(this.greffon.tachesPourGantt());
    const surPlan = new Set(this._plan.cartes.map((c) => c.ref));
    const ajoutees = [];
    for (const ref of refs) {
      if (surPlan.has(ref) || ajoutees.includes(ref)) continue;
      const k = ajoutees.length;
      const refsFin = new Set([...surPlan, ...ajoutees, ref]);
      const rel = Ariane.relativesHorsPlan(ref, grapheAll.aretes, refsFin);
      this._plan.cartes.push({ ref, x: Math.round(x + k * 26), y: Math.round(y + k * 26),
        replie: rel.sousTaches.length > 0 || rel.bloquantes.length > 0 });
      ajoutees.push(ref);
    }
    if (ajoutees.length) {
      this.ctx.ecrirePlan(this._plan);
      this.dessiner();
      this._appliquerSelection(new Set(ajoutees));
    } else if (refs.length === 1) {
      this._poserRef(refs[0], x, y);
    }
    return ajoutees;
  }

  // Crée une tâche qui LIE les notes glissées (dans son corps), et la pose.
  async _creerTacheAvecNotes(files, pos) {
    const noms = files.map((f) => f.basename);
    const chemin = await this.greffon.creerTache(
      { intitule: noms.length === 1 ? noms[0] : '' });
    const ref = this.greffon.refDeChemin(chemin);
    if (!ref) return;
    const f = this.app.vault.getAbstractFileByPath(chemin);
    if (f instanceof obsidian.TFile) {
      this.greffon.marquerEcriture(chemin);
      const bloc = tr('Notes liées :') + '\n' + noms.map((n) => '- [[' + n + ']]').join('\n') + '\n';
      const brut = await this.app.vault.read(f);
      const nouv = brut.includes('## Note de travail\n')
        ? brut.replace('## Note de travail\n', '## Note de travail\n\n' + bloc)
        : brut.replace(/\s*$/, '\n\n' + bloc);
      await this.app.vault.modify(f, nouv);
    }
    this._poserRef(ref, pos.x, pos.y);
    new obsidian.Notice(tr('Tâche créée avec ') + noms.length + tr(' note(s) liée(s)'));
  }

  // Accrochage magnétique d'un nœud en cours de glissé : à la grille, et aux
  // bords / centres des autres nœuds. Renvoie la position accrochée et les
  // repères à tracer.
  _aimanter(ref, x, y) {
    const rg = this.greffon.settings || {};
    if (rg.articulationAimant === false) return { x, y, repères: [] };
    const pas = Number.isFinite(rg.articulationGrille) ? rg.articulationGrille : GRILLE_ARTIC;
    const seuil = Number.isFinite(rg.articulationSeuilAimant)
      ? rg.articulationSeuilAimant : SEUIL_AIMANT;
    let sx = pas > 1 ? Math.round(x / pas) * pas : x;
    let sy = pas > 1 ? Math.round(y / pas) * pas : y;
    const repères = [];
    const hMoi = ((this._noeudsParRef && this._noeudsParRef.get(ref)) || {}).h || ARTIC_H;
    let prisX = false;
    let prisY = false;
    for (const [r, p] of (this._pos || new Map())) {
      if (r === ref) continue;
      const hAutre = ((this._noeudsParRef && this._noeudsParRef.get(r)) || {}).h || ARTIC_H;
      if (!prisX) {
        for (const [mien, autre] of [
          [x, p.x], [x + ARTIC_W, p.x + ARTIC_W], [x + ARTIC_W / 2, p.x + ARTIC_W / 2],
        ]) {
          if (Math.abs(mien - autre) < seuil) {
            sx = x + (autre - mien); prisX = true;
            repères.push({ axe: 'x', v: autre });
            break;
          }
        }
      }
      if (!prisY) {
        for (const [mien, autre] of [
          [y, p.y], [y + hMoi, p.y + hAutre], [y + hMoi / 2, p.y + hAutre / 2],
        ]) {
          if (Math.abs(mien - autre) < seuil) {
            sy = y + (autre - mien); prisY = true;
            repères.push({ axe: 'y', v: autre });
            break;
          }
        }
      }
    }
    return { x: sx, y: sy, repères };
  }

  _tracerReperes(repères) {
    if (this._reperes) this._reperes.remove();
    if (!repères || !repères.length || !this._scene) { this._reperes = null; return; }
    const g = svgEl('g', { class: 'zfa-artic-guides' });
    for (const r of repères) {
      g.appendChild(r.axe === 'x'
        ? svgEl('line', { x1: r.v, y1: -4000, x2: r.v, y2: 8000, class: 'zfa-artic-guide' })
        : svgEl('line', { x1: -4000, y1: r.v, x2: 8000, y2: r.v, class: 'zfa-artic-guide' }));
    }
    this._scene.appendChild(g);
    this._reperes = g;
  }
  //#endregion Articulation · disposition du plan
}

function fabriquerVueArticulationBase(greffon) {
  return class VueArticulationBase extends obsidian.BasesView {
    constructor(controleur, conteneur) {
      super(controleur);
      this.type = TYPE_VUE_BASE_ARTIC;
      this.greffon = greffon;
      this.conteneur = conteneur;
    }

    onload() {
      const nomVue = () => {
        try {
          const s = this.config.serialize ? this.config.serialize() : null;
          return (s && s.name) || (this.controller && this.controller.file
            && this.controller.file.basename) || tr('Articulation');
        } catch (e) { return tr('Articulation'); }
      };
      this._nettoyerOnglet = marquerOngletVueBase(this.greffon.app, this.conteneur, nomVue);
      this.moteur = new MoteurArticulation(this.greffon, this.conteneur, {
        taches: () => this.tachesDuGraphe(),
        ordre: () => this.colonnesArtic(),
        triRefs: () => this.refsTriees(),
        lire: (cle) => {
          const v = this.config.get(cle);
          return v === undefined || v === null ? null : v;
        },
        ecrire: async (cle, v) => { this.config.set(cle, v); },
        poserFamille: async (ref, id) => { await this.greffon.majTache(ref, { famille: id }); },
        poserTitre: async (ref, titre) => { await this.greffon.renommerTitreTache(ref, titre); },
        // Le plan de travail (quelles cartes, où, replié) vit dans la config de
        // CETTE vue, en chaîne JSON. Les entêtes des notes n'en portent rien.
        lirePlan: () => {
          let p = null;
          try { p = JSON.parse(this.config.get('arianeArtPlan') || 'null'); } catch (e) { p = null; }
          if (!p || typeof p !== 'object') p = {};
          if (!Array.isArray(p.cartes)) p.cartes = [];
          return p;
        },
        ecrirePlan: (plan) => {
          this.config.set('arianeArtPlan', JSON.stringify(plan || { cartes: [] }));
        },
        migrerCanvasXY: (refsFiltre) => this.migrerCanvasXY(refsFiltre),
        filtreActif: () => {
          try {
            const f = (this.config.serialize() || {}).filters;
            if (!f) return false;
            if (Array.isArray(f)) return f.length > 0;
            if (Array.isArray(f.and)) return f.and.length > 0;
            if (Array.isArray(f.or)) return f.or.length > 0;
            return typeof f === 'object' && Object.keys(f).length > 0;
          } catch (e) { return false; }
        },
        poserPosition: async (ref, x, y) => {
          const plan = this.moteur ? this.moteur._plan : null;
          if (!plan) return;
          const i = plan.cartes.findIndex((c) => c.ref === ref);
          if (x == null) { if (i >= 0) plan.cartes.splice(i, 1); }
          else if (i >= 0) { plan.cartes[i].x = Math.round(x); plan.cartes[i].y = Math.round(y); }
          else { plan.cartes.push({ ref, x: Math.round(x), y: Math.round(y), replie: false }); }
          this.config.set('arianeArtPlan', JSON.stringify(plan));
        },
        poserParent: async (ref, parentRef) => {
          await this.greffon.rattacher(ref, parentRef);
        },
      });
    }

    onunload() {
      if (this._nettoyerOnglet) { this._nettoyerOnglet(); this._nettoyerOnglet = null; }
      if (this.moteur) this.moteur.detruire();
    }

    // Reprise unique des positions canvas-x / canvas-y (jeu filtré courant) vers
    // le plan de la vue, puis nettoyage des entêtes concernés.
    async migrerCanvasXY(refsFiltre) {
      const plan = this.moteur && this.moteur._plan;
      if (!plan || plan._migre) return;
      const dejaLa = new Set(plan.cartes.map((c) => c.ref));
      let reprises = 0;
      for (const ref of (refsFiltre || [])) {
        if (dejaLa.has(ref)) continue;
        const f = this.greffon.fichierDeRef(ref);
        if (!f) continue;
        const fm = (this.greffon.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        const x = Number(fm['canvas-x']);
        const y = Number(fm['canvas-y']);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        plan.cartes.push({ ref, x, y, replie: false });
        reprises++;
        this.greffon.marquerEcriture(f.path);
        await this.greffon.app.fileManager.processFrontMatter(f, (m) => {
          delete m['canvas-x']; delete m['canvas-y'];
        });
      }
      plan._migre = true;
      this.config.set('arianeArtPlan', JSON.stringify(plan));
      if (reprises) console.log('[Ariane] articulation : ' + reprises + ' position(s) canvas reprises dans la vue');
    }

    async onDataUpdated() {
      if (this.greffon.settings.famillesTaches && this.greffon.settings.famillesTaches.length) {
        try { await this.greffon.rattraperProprietesFamilles(); } catch (e) { /* sans gravité */ }
      }
      // Pose auto d'une tâche qui vient d'être créée PENDANT que cette vue est
      // active (bouton natif « Nouveau », commande) : nouvelle ref, absente du
      // plan, note créée il y a moins de 4 s.
      try {
        const refsMaint = new Set();
        for (const e of (this.data && this.data.data) || []) {
          const r = e && e.file ? this.greffon.refDeChemin(e.file.path) : null;
          if (r) refsMaint.add(r);
        }
        const al = this.greffon.app.workspace.activeLeaf;
        const active = al && this.conteneur && this.conteneur.closest
          && al.containerEl && this.conteneur.closest('.workspace-leaf') === al.containerEl;
        if (active && this._refsConnues && this.moteur && this.moteur._plan) {
          const plan = this.moteur._plan;
          const surPlan = new Set(plan.cartes.map((c) => c.ref));
          let ajout = false;
          for (const r of refsMaint) {
            if (this._refsConnues.has(r) || surPlan.has(r)) continue;
            const f = this.greffon.app.vault.getMarkdownFiles().find((z) => z.basename === r);
            if (!(f && f.stat && Date.now() - f.stat.ctime < 4000)) continue;
            plan.cartes.push({ ref: r, x: null, y: null, replie: false });
            ajout = true;
          }
          if (ajout) this.config.set('arianeArtPlan', JSON.stringify(plan));
        }
        this._refsConnues = refsMaint;
      } catch (e) { /* sans gravité */ }
      if (this.moteur) this.moteur.dessiner();
    }
    onResize() { if (this.moteur) this.moteur.dessiner(); }

    // Le jeu filtré par la base, plus la remontée des ancêtres absents pour ne
    // pas casser une arête de hiérarchie. Mêmes règles que la frise.
    tachesDuGraphe() {
      const dedans = new Set();
      for (const e of (this.data && this.data.data) || []) {
        const ref = e && e.file ? this.greffon.refDeChemin(e.file.path) : null;
        if (ref) dedans.add(ref);
      }
      if (!dedans.size) return [];
      const toutes = this.greffon.tachesPourGantt();
      const parRef = new Map(toutes.map((t) => [t.ref, t]));
      const gardes = new Set(dedans);
      for (const ref of dedans) {
        let p = Ariane.refDeLien((parRef.get(ref) || {}).parent || '');
        const vus = new Set([ref]);
        while (p && parRef.has(p) && !vus.has(p)) {
          gardes.add(p); vus.add(p);
          p = Ariane.refDeLien(parRef.get(p).parent || '');
        }
      }
      return toutes.filter((t) => gardes.has(t.ref));
    }

    // Le tri NATIF de la base (menu Trier), multi-critères : liste ordonnée de
    // { property, desc }. Lu dans le sérialisé de la vue, comme la frise.
    sortNatif() {
      let s = [];
      try { s = (this.config.serialize() || {}).sort || (this.config.getSort && this.config.getSort()) || []; }
      catch (e) { s = []; }
      return (Array.isArray(s) ? s : [])
        .filter((x) => x && x.property)
        .map((x) => ({ property: String(x.property),
          desc: String(x.direction || 'ASC').toUpperCase() === 'DESC' }));
    }

    // Les refs du jeu filtré, ordonnées selon le tri natif multi-critères.
    // Vide si aucun tri : le moteur garde alors l'ordre de tachesDuGraphe.
    refsTriees() {
      const crit = this.sortNatif();
      if (!crit.length) return [];
      const parRef = new Map();
      for (const e of (this.data && this.data.data) || []) {
        const ref = e && e.file ? this.greffon.refDeChemin(e.file.path) : null;
        if (ref) parRef.set(ref, e);
      }
      return [...parRef.keys()].sort((ra, rb) => {
        for (const c of crit) {
          const va = this._valTri(parRef.get(ra), c.property);
          const vb = this._valTri(parRef.get(rb), c.property);
          if (va < vb) return c.desc ? 1 : -1;
          if (va > vb) return c.desc ? -1 : 1;
        }
        return 0;
      });
    }

    _valTri(e, prop) {
      let v = null;
      try { v = e ? e.getValue(prop) : null; } catch (err) { v = null; }
      const b = (v && typeof v === 'object' && 'data' in v && v.data != null) ? v.data : v;
      return b == null ? '' : b;
    }

    colonnesArtic() {
      let props = [];
      try { props = this.config.getOrder() || []; } catch (e) { props = []; }
      if (!props.length) props = (this.data && this.data.properties) || [];
      const parRef = new Map();
      for (const en of (this.data && this.data.data) || []) {
        const ref = en && en.file ? this.greffon.refDeChemin(en.file.path) : null;
        if (ref) parRef.set(ref, en);
      }
      return props
        .filter((id) => !String(id).startsWith('file.'))
        .map((id) => {
          let nom = id;
          try { nom = this.greffon.libelleColonne(this.config.getDisplayName(id) || id); } catch (e) { /* garde l'id */ }
          const type = Ariane.typeProprieteBase(this.app.metadataTypeManager, id);
          return { id, nom, type, champ: String(id).replace(/^note\./, ''),
            valeur: (ref) => { const en = parRef.get(ref);
              try { return en ? en.getValue(id) : null; } catch (e) { return null; } } };
        });
    }
  };
}

//#endregion 16 · Vue Articulation

