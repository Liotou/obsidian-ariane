//#region 15 · Vue Frise
// ═══════════════════════════════════════════════════════════════════════════
//  15 · VUE FRISE
//  Gantt des tâches : géométrie et parti graphique, MoteurFrise, fabrique de
//  la vue Bases « ariane-frise » et export d'une page HTML autonome.
//    15a  MoteurFrise         (ce fichier)
//    15b  fabriquerVueFriseBase
//    15c  figage des données + pageFriseHtml
//
//  MOTEURFRISE RESTE UNE SEULE CLASSE, contrairement à class Ariane qui est
//  assemblée de mixins. L'export « frise vivante » sérialise cette classe par
//  MoteurFrise.toString() et réévalue ce texte dans la page produite (15c) :
//  découpée en mixins, seule la classe composée serait sérialisée, et l'export
//  partirait amputé de ses méthodes — sans erreur ici, seulement une page
//  cassée chez l'utilisateur. Les sous-régions « Frise · … » tiennent lieu de
//  découpage. Même raison pour MoteurVue (section 14).
// ═══════════════════════════════════════════════════════════════════════════

/* =========================================================================
 * Frise Gantt des tâches
 *
 * La géométrie et le parti graphique de cette frise sont repris de
 * « Project Manager for Obsidian » de Stepan Kropachev
 * (https://github.com/stepankropachev/obsidian-pm), sous licence MIT :
 * hauteurs de ligne et d'en-tête, largeurs par cran de zoom, bandes de mois
 * alternées, week-ends teintés, barres à deux couches dont le remplissage dit
 * l'avancement, et tracé en SVG plutôt qu'en éléments HTML. La mention de
 * droit d'auteur figure dans le fichier LICENSE.
 * ========================================================================= */

// La hauteur de ligne n'est pas une constante : elle suit le réglage rowHeight
// de la base, comme la vue en tableau. Voir MoteurFrise.hauteurLigne et
// MoteurFrise.hauteurEntete.

// Étendue minimale par cran, pour qu'une frise de trois tâches ne se réduise
// pas à trois traits collés dans un coin.
const JOURS_MINIMUM_GANTT = { jour: 30, semaine: 90, mois: 365, trimestre: 365, 'année': 1095 };

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LETTRES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// Instrument de planification, à l'échelle du trimestre. Ce n'est pas la vue du
// quotidien, qui reste la base « Débloquées » : une frise répond à « quand »,
// pas à « quoi maintenant ».
// Le moteur de la frise, indépendant de l'enveloppe qui l'accueille. Deux
// enveloppes s'en servent : la vue autonome, et la vue de base. Le contexte
// dit d'où viennent les tâches et où se rangent les réglages, ce qui permet à
// la vue de base de les ranger dans le fichier .base, par vue.
class MoteurFrise extends MoteurVue {
  //#region Frise · cycle de vie & état
  constructor(greffon, racine, contexte) {
    super(greffon, racine, contexte);
    this.replies = new Set();
    this._cascade = null;
    this._flecheSelectionnee = null;
    racine.addClass('zfa-gantt');
    // La frise capte le clavier pour supprimer une flèche sélectionnée.
    racine.tabIndex = -1;
    this._surTouche = (e) => this.toucheFrise(e);
    racine.addEventListener('keydown', this._surTouche);
  }
  // Sélection d'une flèche de dépendance au clic. Une seule à la fois.
  selectionnerFleche(de, vers, groupeEl) {
    this._deselectionnerFleche();
    this._flecheSelectionnee = { de, vers };
    if (groupeEl) groupeEl.classList.add('est-active');
    if (this.racine && this.racine.focus) this.racine.focus({ preventScroll: true });
  }

  _deselectionnerFleche() {
    this._flecheSelectionnee = null;
    if (this._svg) {
      for (const el of this._svg.querySelectorAll('.zfa-gantt-fleche-groupe.est-active')) {
        el.classList.remove('est-active');
      }
    }
  }

  // Retour arrière (⌫) sur une flèche sélectionnée : on retire le blocage.
  // Pas la touche Suppr : Monsieur l'a demandé ainsi.
  async toucheFrise(e) {
    const t = e.target;
    if (t && (t.matches('input, textarea, select') || t.isContentEditable)) return;
    if (_toucheRetablir(e)) { e.preventDefault(); e.stopPropagation(); await refaireDernier(this); return; }
    if (_toucheAnnuler(e)) { e.preventDefault(); e.stopPropagation(); await annulerDernier(this); return; }
    if (e.key === 'Escape') { this._deselectionnerFleche(); return; }
    if (e.key !== 'Backspace' || !this._flecheSelectionnee) return;
    e.preventDefault();
    const { de, vers } = this._flecheSelectionnee;
    this._flecheSelectionnee = null;
    if (this.greffon && typeof this.greffon.retirerBlocage === 'function') {
      await this.greffon.retirerBlocage(de, vers);
    }
    this.dessiner();
  }

  get zoom() { return this.ctx.lire('zoom') || 'mois'; }

  // Même clé et même arithmétique que la vue en tableau des bases, pour que la
  // frise s'aligne au pixel près sur les autres vues de la même base.
  // La base de calcul vient du thème, pas d'une valeur écrite en dur.
  // La base vient du thème et se lit UNE FOIS, sur le corps du document.
  // La lire sur la racine de la frise serait une faute : c'est là que la
  // hauteur calculée est écrite, et chaque redessin remultiplierait la valeur
  // déjà multipliée, la ligne enflant sans fin à chaque clic.
  get baseLigne() {
    if (this._baseLigne) return this._baseLigne;
    let base = 30;
    try {
      const v = parseFloat(getComputedStyle(document.body)
        .getPropertyValue('--bases-table-row-height'));
      if (Number.isFinite(v) && v > 0) base = v;
    } catch (e) { /* le thème ne la définit pas : 30 fait l'affaire */ }
    this._baseLigne = base;
    return base;
  }

  // Bases écrit la chaîne vide pour « fine » et ignore ce qu'il ne connaît
  // pas, en retombant sur 1 : les deux valeurs sont donc sûres dans les deux
  // sens, et une liste déroulante à clé vide se comporte mal.
  get hauteurLigne() {
    const cle = String(this.ctx.lire('rowHeight') || '');
    const mult = { '': 1, short: 1, medium: 2, tall: 4, extra: 8 }[cle] || 1;
    return Math.round(this.baseLigne * mult);
  }

  // L'en-tête — et les lignes de regroupement — gardent la hauteur d'une ligne
  // « fine » : elles ne suivent pas le multiplicateur rowHeight, seules les
  // lignes de données s'épaississent, comme dans le tableau des bases.
  get hauteurEntete() {
    return Math.max(28, Math.round(this.baseLigne));
  }

  // Épaisseur de la barre, et ce qu'on peut y écrire. Une barre suit la
  // hauteur de ligne mais cesse de grossir au-delà de 64 px : au-delà elle
  // cesserait d'être une barre. La place gagnée sert alors au texte.
  geometrieBarre(H) {
    const epaisseur = Math.min(64, Math.max(12, Math.round(H * 0.6)));
    const marge = Math.round((H - epaisseur) / 2);
    const lignes = epaisseur >= 54 ? 3 : (epaisseur >= 36 ? 2 : 1);
    return { epaisseur, marge, lignes, rayon: Math.min(9, Math.max(3, Math.round(epaisseur / 3))) };
  }
  get ppj() { return Ariane.ZOOMS_GANTT[this.zoom] || 9; }

  visibles(lignes) {
    const out = [];
    let seuil = -1;
    for (const l of lignes) {
      if (seuil >= 0 && l.niveau > seuil) continue;
      seuil = -1;
      out.push(l);
      if (l.aDesEnfants && this.replies.has(l.ref)) seuil = l.niveau;
    }
    return out;
  }

  ouvrir(ref, nouvelOnglet) {
    const f = this.greffon.fichierDeRef(ref);
    if (f) this.app.workspace.getLeaf(nouvelOnglet === undefined ? true : nouvelOnglet).openFile(f);
  }

  couleur(statut) {
    const c = Ariane.COULEURS_GANTT;
    return c[statut] || c['à faire'];
  }

  // Couleur d'une barre selon le mode choisi (réglage friseBarreCouleur).
  // « racine » lit this._racines (ref → ref racine), calculé à chaque dessin.
  couleurBarre(l) {
    const mode = this.greffon.settings.friseBarreCouleur || 'famille';
    if (mode === 'statut') return this.couleur(l.statut);
    if (mode === 'priorite') {
      return Ariane.COULEURS_PRIORITE[l.priorite] || 'var(--text-faint)';
    }
    if (mode === 'avancement') return Ariane.couleurAvancement(l.avancement);
    if (mode === 'racine') {
      const rac = this._racines && this._racines.get(l.ref);
      return Ariane.couleurRacine(rac || l.ref);
    }
    return this.greffon.familleDe(l.famille).couleur || this.couleur(l.statut);
  }

  /* ------------------------------ Ossature ------------------------------ */

  //#endregion Frise · cycle de vie & état

  //#region Frise · dessin & étendue
  dessiner() {
    try {
      this.dessinerVraiment();
    } catch (e) {
      // Une exception au milieu du tracé laissait la vue à moitié construite,
      // sans rien dire. Mieux vaut l'afficher que de la chercher à l'aveugle.
      console.error('[Ariane] frise :', e);
      this.racine.empty();
      this.racine.createDiv({ cls: 'zfa-refs-vide',
        text: tr('La frise n a pas pu se dessiner : ') + (e && e.message ? e.message : e) });
    }
  }

  dessinerVraiment() {
    const c = this.racine;
    const ancienne = c.querySelector('.zfa-gantt-droite');
    // On ne se fie à l'ancien scroll QUE si l'élément était réellement affiché :
    // un redraw survenu pendant que l'onglet était caché laisse scrollLeft à 0
    // (Chromium n'applique rien sur un display:none), et ce 0 écrasait la
    // position au retour sur l'onglet. Caché → on retombe sur le jour mémorisé.
    const anciennePosee = !!ancienne && ancienne.clientWidth > 1 && ancienne.offsetParent !== null;
    const memeX = anciennePosee ? ancienne.scrollLeft : null;
    const memeY = anciennePosee ? ancienne.scrollTop : null;
    // Étendre une barre déplace l'origine des dates de la frise (marge / span
    // minimum recalculés) : un scrollLeft en pixels ne pointe alors plus sur le
    // même jour. On mémorise le JOUR au bord gauche pour le remettre en place.
    const cfgAv = this._cfg;
    const jourAncre = (cfgAv && cfgAv.debut && cfgAv.ppj && memeX != null)
      ? Ariane.decalerJour(cfgAv.debut, Math.round(memeX / cfgAv.ppj))
      : null;
    c.empty();

    let taches = this.ctx.taches();
    // Une écriture de frontmatter n'apparaît dans l'index qu'après un battement.
    // Sans ce report, la frise redessine d'abord les anciennes dates puis les
    // nouvelles : c'est le rebond qu'on voyait à l'étirement d'une barre.
    // Chaque entrée disparaît d'elle-même dès que l'index l'a rattrapée.
    if (this._enAttente && this._enAttente.size) {
      for (const t of taches) {
        const p = this._enAttente.get(t.ref);
        if (!p) continue;
        if (String(t.debut || '') === p.debut && String(t.echeance || '') === p.echeance) {
          this._enAttente.delete(t.ref);
          continue;
        }
        t.debut = p.debut;
        t.echeance = p.echeance;
      }
    }
    // Priorité : un tri posé sur un en-tête (geste le plus explicite), sinon le
    // tri natif de la base (menu Trier, multi-critères), sinon le repli par date.
    const colTri = this.ctx.lire('triColonne');
    let mode = this.ctx.lire('tri') || 'date';
    let sensTri = 1;
    if (colTri) {
      const col = ((this.ctx.colonnes && this.ctx.colonnes()) || [])
        .find((c) => c.cle === colTri);
      if (colTri === '__arbre') {
        mode = 'intitule';
      } else if (col) {
        // Trier sur la donnée brute quand la colonne l'expose (chaîne ISO pour
        // une date) : son rendu localisé se classerait de travers.
        const cle = col.valeurBrute || col.valeur;
        for (const t of taches) t._cle = cle(t.ref);
        mode = 'cle';
      }
      sensTri = this.ctx.lire('triColonneSens') === -1 ? -1 : 1;
    } else {
      const tn = this.ctx.triNatif ? this.ctx.triNatif() : null;
      if (tn && tn.criteres.length) { tn.preparer(taches); mode = 'multi'; }
    }
    this._H = this.hauteurLigne;
    // L'en-tête reste fixe quelle que soit la hauteur de ligne, comme dans le
    // tableau des bases : seules les lignes de données s'épaississent. On suit
    // la variable d'Obsidian si elle existe, sinon 34 px — assez pour les deux
    // étages (mois puis semaines ou jours), illisibles en dessous de 28.
    this._hEntete = this.hauteurEntete;
    this._bande = Math.round(this._hEntete * 0.52);
    this._basEntete = this._bande + Math.round((this._hEntete - this._bande) / 2) + 1;

    // Regroupement (propre à Ariane, faute d'API Bases) : disposition en arbre
    // par groupe, puis placement en y/h. Une tâche sans date n'est plus mise à
    // l'écart : elle suit le tri actif comme les autres, seule sa ligne reste
    // hachurée (voir dessinerBarres).
    const groupes = this.ctx.groupes ? this.ctx.groupes() : null;
    const groupeDesc = this.ctx.sensGroupe ? this.ctx.sensGroupe() === -1 : false;
    // Colonne de gauche = tableau plat. La hiérarchie ne réordonne les lignes
    // que par défaut (axe chronologique) ; dès qu'un autre tri est actif, les
    // filles ne sont plus regroupées sous leur mère.
    const plat = mode !== 'date';
    this._plat = plat;
    // Tâches en retard : échéance passée, pas encore terminées ni abandonnées.
    // Calculé avant la barre d'outils (qui en montre le compte) et relu par
    // dessinerBarres / dessinerJalon pour le repère sur la barre.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    this._enRetard = Ariane.tachesEnRetard(taches, aujourdhui);
    const brut = Ariane.disposerFriseGroupee(taches, groupes, mode, sensTri, groupeDesc, plat);
    // Retirer les bandes de groupe devenues vides, compter les tâches restantes,
    // et résumer l'étalement dans le temps (min, max, une date par tâche) pour
    // l'aperçu dessiné dans le bandeau — utile surtout quand le groupe est replié.
    const dispo = [];
    for (let i = 0; i < brut.length; i++) {
      const it = brut[i];
      if (it.kind === 'groupe') {
        let n = 0;
        let min = '';
        let max = '';
        for (let j = i + 1; j < brut.length && brut[j].kind !== 'groupe'; j++) {
          n += 1;
          const t = brut[j];
          const d = t.debut || t.echeance;
          const e = t.echeance || t.debut;
          if (d && (!min || d < min)) min = d;
          if (e && (!max || e > max)) max = e;
        }
        if (!n) continue;
        dispo.push(Object.assign({}, it, { n,
          apercu: (min && max) ? { min, max } : null }));
      } else dispo.push(it);
    }
    const planifiees = dispo.filter((x) => x.kind === 'tache');

    // Ref -> cleGroupe des tâches masquées parce que leur groupe est replié.
    // Sert aux badges « flèches masquées » sur les barres visibles.
    this._masqueParGroupe = new Map();
    {
      let gReplie = null;
      for (const it of dispo) {
        if (it.kind === 'groupe') {
          gReplie = this.replies.has(it.cleGroupe) ? it.cleGroupe : null;
        } else if (gReplie) this._masqueParGroupe.set(it.ref, gReplie);
      }
    }

    // Les réglages de la frise passent par « Configurer la vue » de la base ;
    // seule une barre d'outils légère (échelle, aujourd'hui…) reste à l'écran.
    if (this.ctx.echelleReglable) this.dessinerBarreVue(c);
    this.dessinerCascade(c);

    if (!planifiees.length) {
      c.createDiv({ cls: 'zfa-refs-vide',
        text: tr('Aucune tâche. Créez une tâche pour la voir ici.') });
      return;
    }

    const cfg = this.calculerEtendue(planifiees, aujourdhui);
    const place = Ariane.placerLignes(dispo, this._hEntete, this._H, this.replies);
    const lignes = place.lignes;
    // Lignes réellement rendues (avec y/h, sans les bandes de groupe) : c'est sur
    // ces objets que dessinerBarres pose les points d'accroche _anc, et c'est la
    // source du lignage au survol.
    this._lignesRendu = lignes.filter((l) => l.kind === 'tache');
    // Suite complète (bandes de groupe comprises), dans l'ordre affiché : source
    // de l'export XLSX.
    this._lignesExport = lignes;
    this._hauteurTotale = place.hauteurTotale;
    // On pose la variable des bases sur la racine : tout le balisage repris du
    // tableau s'y accroche, et le thème de Monsieur reste maître du reste.
    // La variable est posée ici pour que le balisage repris du tableau s'y
    // accroche. Elle n'est jamais relue depuis cet élément, voir baseLigne.
    c.style.setProperty('--bases-table-row-height', this._H + 'px');
    this._geo = this.geometrieBarre(this._H);
    // decalerSousArbre travaille par ref : on déduplique les tâches multi-groupe.
    this._lignes = [...new Map(planifiees.map((l) => [l.ref, l])).values()];
    // Racine de chaque arborescence, pour le mode de couleur « Tâche parente ».
    this._racines = Ariane.racinesArborescence(this._lignes);
    this._cfg = cfg;
    this._taches = taches;
    // Statuts dérivés (jamais écrits) : « bloquée » = blocage direct + gel
    // descendant ; « impactée » = a une descendante bloquée (remontée d'info).
    // Voir spec 2026-08-31-rattachements-taches-design.md §3 (rév. 2026-09-04).
    {
      const ar = [];
      for (const t of taches) {
        const p = Ariane.refDeLien(t.parent);
        if (p) ar.push({ de: p, vers: t.ref, type: 'hier' });
        for (const b of t.bloquePar || []) {
          const x = Ariane.refDeLien(b);
          if (x) ar.push({ de: x, vers: t.ref, type: 'bloque' });
        }
      }
      const prop = Ariane.propagerBlocage(taches, ar);
      this._bloquees = prop.bloquee;
      this._impactees = prop.impactee;
    }
    // Avancement dérivé : une mère montre la moyenne pondérée de ses filles.
    this._avDeriv = Ariane.avancementsDerives(taches);

    const env = c.createDiv({ cls: 'zfa-gantt-enveloppe' });
    const gauche = env.createDiv({ cls: 'zfa-gantt-gauche' });
    const droite = env.createDiv({ cls: 'zfa-gantt-droite' });
    this._droite = droite;
    this.dessinerColonneGauche(gauche, lignes);

    const hauteur = this._hauteurTotale + 26; // marge basse : date du jour + barre de défilement
    const svg = svgEl('svg', { class: 'zfa-gantt-svg', width: cfg.largeur, height: hauteur });
    droite.appendChild(svg);
    this._svg = svg;
    this._svgLignage = null;
    this._lignage = null;
    // Motif de hachures pour les lignes des tâches sans date.
    {
      const defs = svgEl('defs', {});
      const pat = svgEl('pattern', { id: 'zfa-gantt-hachures', width: 7, height: 7,
        patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 7,
        class: 'zfa-gantt-hachure-trait' }));
      defs.appendChild(pat);
      svg.appendChild(defs);
    }
    // Cliquer ailleurs qu'une flèche la désélectionne.
    svg.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.zfa-gantt-fleche-groupe')) this._deselectionnerFleche();
    });

    this.dessinerFond(svg, cfg, lignes);
    // Les flèches d'abord : les barres et leurs pastilles de liaison passent
    // ainsi par-dessus, et rester cliquables malgré la cible large des flèches.
    this.dessinerFleches(svg, cfg, lignes);
    this.dessinerBarres(svg, cfg, lignes);
    this.dessinerBadgesFleches(svg);
    this.dessinerAujourdhui(svg, cfg, aujourdhui);
    this.dessinerEntete(svg, cfg);
    this.dessinerBorduresFrise(droite, lignes, cfg.largeur);
    // Calque du lignage : un SVG à part, empilé AU-DESSUS des bordures HTML de
    // la frise (z-index) — sinon les traits passeraient derrière la grille.
    const svgL = svgEl('svg', { class: 'zfa-gantt-svg-lignage',
      width: cfg.largeur, height: hauteur });
    droite.appendChild(svgL);
    this._svgLignage = svgL;
    const piste = this.dessinerEntetesGroupes(env, lignes);

    // Les deux colonnes défilent ensemble : sans cet accord, l'arbre et les
    // pistes se décalent dès la trentième ligne et la frise devient illisible.
    // Le tableau de gauche défile avec la frise : c'est le conteneur qui bouge,
    // les lignes étant en position absolue comme chez Bases.
    // La frise joint le bas du volet : quand le contenu est plus court que la
    // place, les deux colonnes s'étalent quand même jusqu'en bas (les barres
    // de défilement restent au bord du volet) ; quand il est plus long, la
    // place disponible garde son défilement interne — même valeur dans les
    // deux cas, donc.
    const dispoH = env.clientHeight || hauteur;
    droite.style.alignSelf = 'flex-start';
    droite.style.height = dispoH + 'px';
    gauche.style.alignSelf = 'flex-start';
    gauche.style.height = dispoH + 'px';

    const table = gauche.querySelector('.zfa-gantt-table');
    droite.addEventListener('scroll', () => {
      // Le lignage est posé en coordonnées contenu : au défilement il se
      // découperait des barres — on l'efface (le survol le reposera).
      this._effacerLignage();
      const y = -droite.scrollTop;
      table.style.top = y + 'px';
      if (piste) piste.style.transform = 'translateY(' + y + 'px)';
      this.recalerEnteteHaut(droite.scrollLeft);
      this.recalerEtiquettes(droite.scrollLeft);
      // Un scroll VENU DE L'UTILISATEUR (pas le calage programmatique ci-dessous)
      // marque la session comme « scrollée » et mémorise le jour au bord gauche,
      // par vue, pour y revenir à la réouverture (2ᵉ fenêtre, retour de focus…).
      if (this._scrollProg) return;
      this._aScrolle = true;
      this._dernierX = droite.scrollLeft;   // position vivante, pour la restauration
      clearTimeout(this._minSauveJour);
      this._minSauveJour = setTimeout(() => {
        try {
          if (this._cfg && this._cfg.debut && this._cfg.ppj) {
            const j = Ariane.decalerJour(this._cfg.debut, Math.round(droite.scrollLeft / this._cfg.ppj));
            if (j && this.ctx.posEcrire) this.ctx.posEcrire(j);
          }
        } catch (e) { /* vue fermée */ }
      }, 400);
    });

    // Le retour sur l'onglet frise ne déclenche PAS toujours un redessin : on
    // guette donc le passage caché → visible de la vue et on y ré-applique la
    // dernière position connue (mémoire de session, sinon jour mémorisé).
    if (this._ioFrise) { try { this._ioFrise.disconnect(); } catch (e) { /* rien */ } }
    const win = this._win();
    if (win.IntersectionObserver) {
      this._ioFrise = new win.IntersectionObserver((entrees) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue;
          const d = this._droite;
          if (!d || !d.isConnected || d.clientWidth < 1) continue;
          let cible = (typeof this._dernierX === 'number') ? this._dernierX : null;
          if (cible == null && this._cfg && this._cfg.debut && this._cfg.ppj && this.ctx.posLire) {
            const jm = Ariane.jourValide && Ariane.jourValide(this.ctx.posLire());
            if (jm) cible = Math.max(0, Ariane.ecartJours(this._cfg.debut, jm) * this._cfg.ppj);
          }
          if (cible != null && cible > 4 && Math.abs(d.scrollLeft - cible) > 2) {
            this._scrollProg = true;
            d.scrollLeft = cible;
            this.recalerEnteteHaut(d.scrollLeft);
            this.recalerEtiquettes(d.scrollLeft);
            win.requestAnimationFrame(() => { this._scrollProg = false; });
          }
        }
      }, { threshold: 0.01 });
      this._ioFrise.observe(this.racine);
    }

    // Cible du calage horizontal : re-ancrage après glissé de barre ; sinon, si
    // l'utilisateur a déjà scrollé dans cette session, on garde sa position ;
    // sinon on reprend au jour mémorisé (par vue) ; sinon on cadre aujourd'hui.
    const jourMem = (Ariane.jourValide && this.ctx.posLire)
      ? Ariane.jourValide(this.ctx.posLire()) : null;
    const xMem = jourMem ? Math.max(0, Ariane.ecartJours(cfg.debut, jourMem) * cfg.ppj) : null;
    // Un memeX à exactement 0 alors qu'on a une position mémorisée ailleurs est
    // presque toujours un artefact (redraw pendant que l'onglet était caché) →
    // on préfère le jour mémorisé.
    const memXsain = memeX !== null && !(memeX === 0 && xMem != null && xMem > 4);
    const cibleX = jourAncre
      ? Math.max(0, Ariane.ecartJours(cfg.debut, jourAncre) * cfg.ppj)
      : (this._aScrolle && memXsain) ? memeX
        : xMem != null ? xMem
          : Math.max(0, Ariane.ecartJours(cfg.debut, aujourdhui) * cfg.ppj - 220);
    const vue = this._win();
    const calerX = (essais) => {
      this._scrollProg = true;
      droite.scrollLeft = cibleX;
      this.recalerEnteteHaut(droite.scrollLeft);
      this.recalerEtiquettes(droite.scrollLeft);
      // Tant que la vue n'a pas de largeur (2ᵉ fenêtre pas encore disposée) ou
      // rien à faire défiler, scrollLeft reste bloqué à 0 → on réessaie.
      const posee = droite.clientWidth > 1 && droite.scrollWidth > droite.clientWidth;
      if (cibleX > 0 && !posee && essais > 0) {
        vue.requestAnimationFrame(() => calerX(essais - 1));
      } else {
        vue.requestAnimationFrame(() => { this._scrollProg = false; });
      }
    };
    calerX(20);
    if (memeY !== null) {
      droite.scrollTop = memeY;
      table.style.top = (-memeY) + 'px';
      if (piste) piste.style.transform = 'translateY(' + (-memeY) + 'px)';
    }
    this.recalerEnteteHaut(droite.scrollLeft);
    this.recalerEtiquettes(droite.scrollLeft);
  }

  // L'étendue part de la première date et va à la dernière, élargie jusqu'au
  // minimum du cran, et calée sur un début de mois hors du cran « jour » pour
  // que les bandes de mois tombent juste.
  calculerEtendue(lignes, aujourdhui) {
    const dates = [aujourdhui];
    for (const l of lignes) {
      if (l.debut) dates.push(l.debut);
      if (l.echeance) dates.push(l.echeance);
    }
    dates.sort();
    let debut = Ariane.decalerJour(dates[0], -7);
    let fin = Ariane.decalerJour(dates[dates.length - 1], 14);
    const mini = JOURS_MINIMUM_GANTT[this.zoom] || 365;
    const etendu = Ariane.ecartJours(debut, fin);
    if (etendu < mini) {
      const extra = Math.ceil((mini - etendu) / 2);
      debut = Ariane.decalerJour(debut, -extra);
      fin = Ariane.decalerJour(fin, extra);
    }
    if (this.zoom !== 'jour') debut = debut.slice(0, 8) + '01';
    const ppj = this.ppj;
    const jours = Ariane.ecartJours(debut, fin);
    return { debut, fin, ppj, jours, largeur: jours * ppj };
  }

  x(cfg, jour) { return Ariane.ecartJours(cfg.debut, jour) * cfg.ppj; }

  moisSuivant(jour) {
    const [a, m] = jour.split('-').map(Number);
    return m === 12 ? (a + 1) + '-01-01' : a + '-' + String(m + 1).padStart(2, '0') + '-01';
  }

  /* ------------------------------- Réglages ------------------------------ */

  //#endregion Frise · dessin & étendue

  //#region Frise · barre d'outils & exports
  bouton(parent, texte, action, actif) {
    const b = parent.createEl('button', {
      cls: 'zfa-ref-action' + (actif ? ' mod-cta' : ''), text: texte });
    b.onclick = (e) => { e.stopPropagation(); action(); };
    return b;
  }

  // Barre d'outils légère pour la vue de base : choix de l'échelle (segmenté),
  // retour à aujourd'hui, export. Le reste des réglages est dans « Configurer la vue ».
  dessinerBarreVue(c) {
    const b = c.createDiv({ cls: 'zfa-gantt-barre-vue' });

    const auj = b.createEl('button', { cls: 'zfa-gantt-bv-bouton', attr: { type: 'button' } });
    obsidian.setIcon(auj.createSpan({ cls: 'zfa-gantt-bv-ic' }), 'locate-fixed');
    auj.createSpan({ text: tr("Aujourd'hui") });
    auj.addEventListener('click', () => this.recentrerAujourdhui());

    const seg = b.createDiv({ cls: 'zfa-gantt-echelle', attr: { role: 'group' } });
    const libs = { jour: tr('Jour'), semaine: tr('Semaine'), mois: tr('Mois'),
                   trimestre: tr('Trimestre'), 'année': tr('Année') };
    for (const z of Object.keys(Ariane.ZOOMS_GANTT)) {
      const o = seg.createEl('button', { cls: 'zfa-gantt-echelle-opt',
        text: libs[z] || z, attr: { type: 'button' } });
      if (z === this.zoom) o.addClass('is-active');
      o.addEventListener('click', async () => {
        if (z === this.zoom) return;
        await this.ctx.ecrire('zoom', z);
        this.dessiner();
      });
    }

    // Réinitialise tous les tris (colonne d'en-tête, tri natif de la base,
    // regroupement natif) pour retrouver la disposition par défaut : la
    // hiérarchie par tâche parente, classée par date. Bouton icône seul :
    // le libellé complet est dans l'info-bulle, la barre reste légère.
    const raz = b.createEl('button', { cls: 'zfa-gantt-bv-bouton zfa-gantt-bv-icone',
      attr: { type: 'button', 'aria-label': tr('Réinitialiser les tris'),
        title: tr('Réinitialiser les tris (hiérarchie par tâche parente)') } });
    obsidian.setIcon(raz.createSpan({ cls: 'zfa-gantt-bv-ic' }), 'rotate-ccw');
    raz.addEventListener('click', async () => {
      let actif = !!this.ctx.lire('triColonne');
      const tn = this.ctx.triNatif ? this.ctx.triNatif() : null;
      if (tn && tn.criteres.length) actif = true;
      if (this.ctx.groupeActuel && this.ctx.groupeActuel()) actif = true;
      if (!actif) return;
      await this.ctx.ecrire('triColonne', null);
      await this.ctx.ecrire('triColonneSens', 1);
      // Soigne un vieux réglage « Ordre des tâches » resté dans le .base.
      if (this.ctx.lire('tri') !== 'date') await this.ctx.ecrire('tri', null);
      const natif = this.ctx.triNatif ? this.ctx.triNatif() : null;
      if (natif) for (const c of natif.criteres) {
        // 'NONE' retire le critère (tout ce qui n'est pas ASC/DESC épure).
        try { this.config.setSortProperty(c.property, 'NONE'); } catch (e) { /* absent */ }
      }
      if (this.ctx.poserGroupe) this.ctx.poserGroupe(null);
      new obsidian.Notice(tr('Tris réinitialisés.'));
      this.dessiner();
    });

    // Mode de couleur des barres : le même réglage que la page Réglages, posé
    // ici pour changer d'un clic (l'écriture passe par saveSettings, partagé
    // par toutes les vues). Même gabarit que le contrôle d'échelle : un
    // conteneur bordé, l'icône à l'intérieur, libellés courts.
    const ctr = b.createDiv({ cls: 'zfa-gantt-bv-couleur' });
    obsidian.setIcon(ctr.createSpan({ cls: 'zfa-gantt-bv-ic' }), 'palette');
    const sel = ctr.createEl('select', { attr: {
      title: tr('Couleur des barres') } });
    for (const [v, , court] of Ariane.MODES_COULEUR_FRISE) {
      sel.createEl('option', { text: tr(court), attr: { value: v } });
    }
    sel.value = this.greffon.settings.friseBarreCouleur || 'famille';
    sel.addEventListener('change', async () => {
      this.greffon.settings.friseBarreCouleur = sel.value;
      await this.greffon.saveSettings();
      this.dessiner();
    });

    // Compte des tâches en retard : un repère discret, cliquable pour ramener la
    // frise sur aujourd'hui. Absent quand il n'y a rien à signaler.
    const nRetard = this._enRetard ? this._enRetard.size : 0;
    if (nRetard) {
      const badge = b.createEl('button', {
        cls: 'zfa-gantt-bv-bouton zfa-gantt-retard-badge',
        attr: { type: 'button', title: tr('Ramener sur aujourd\'hui') } });
      obsidian.setIcon(badge.createSpan({ cls: 'zfa-gantt-bv-ic' }), 'alert-triangle');
      badge.createSpan({ text: nRetard + ' ' + tr('en retard') });
      badge.addEventListener('click', () => this.recentrerAujourdhui());
    }

    // Les boutons d'export n'ont de sens que dans Obsidian : le greffon factice
    // de la page exportée pose estExportHtml pour ne jamais les créer (ils
    // réapparaîtraient à chaque redessin, et leur clic n'y veut rien dire).
    if (!this.greffon.estExportHtml) {
      const exp = b.createEl('button', {
        cls: 'zfa-gantt-bv-bouton zfa-gantt-bv-export',
        attr: { type: 'button', title: tr('Exporter la frise (Excel)') } });
      obsidian.setIcon(exp.createSpan({ cls: 'zfa-gantt-bv-ic' }), 'file-spreadsheet');
      exp.createSpan({ text: tr('Exporter') });
      exp.addEventListener('click', () => this.exporterXlsx());

      // Export HTML « frise vivante » : un fichier autonome qui embarque le
      // vrai moteur — même zoom, mêmes replis, mêmes bulles que la frise.
      const expH = b.createEl('button', {
        cls: 'zfa-gantt-bv-bouton zfa-gantt-bv-export-html',
        attr: { type: 'button', title: tr('Exporter la frise (HTML interactif)') } });
      obsidian.setIcon(expH.createSpan({ cls: 'zfa-gantt-bv-ic' }), 'file-code');
      expH.createSpan({ text: tr('HTML') });
      expH.addEventListener('click', () => this.exporterHtml());
    }
  }

  // Exporte la frise TELLE QU'ELLE EST À L'ÉCRAN dans un .xlsx : mêmes
  // colonnes, même ordre de lignes (tri, regroupement, replis actifs). Écrit
  // dans le dossier de pièces jointes, puis ouvre avec l'application par défaut.
  async exporterXlsx() {
    try {
      const rendu = this._colsRendu || [];
      const lignes = this._lignesExport || [];
      if (!rendu.length || !lignes.length) {
        new obsidian.Notice(tr('Rien à exporter.'));
        return;
      }
      const grouper = !!(this.ctx.groupeActuel && this.ctx.groupeActuel());
      const cleFam = String(this.greffon.cleT('famille') || '').replace(/^note\./, '');
      const cleEch = String(this.greffon.cleT('echeance') || '').replace(/^note\./, '');
      const cleAv = String(this.greffon.cleT('avancement') || '').replace(/^note\./, '');
      const colonnes = [];
      if (grouper) colonnes.push({ titre: tr('Groupe'), largeur: 18 });
      for (const col of rendu) {
        colonnes.push({ titre: col.nom || col.cle, largeur: Math.round((col.largeur || 160) / 7) });
      }
      const estDate = rendu.map((col) => {
        const t = this.typeColonne(col.cle);
        return t === 'date' || t === 'datetime';
      });
      const finalCle = (col) => String(col.cle || '').replace(/^note\./, '');
      const hexFamille = (fam) => {
        const h = String((this.greffon.familleDe(fam) || {}).couleur || '').replace('#', '').slice(0, 6);
        return /^[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : '';
      };
      const lignesXlsx = [];
      const tachesRangee = [];       // objet ligne en regard de chaque rangée
      let groupeCourant = '';
      for (const l of lignes) {
        if (l.kind === 'groupe') { groupeCourant = l.libelle || ''; continue; }
        if (l.kind && l.kind !== 'tache') continue;
        const rangee = [];
        if (grouper) rangee.push({ v: groupeCourant });
        rendu.forEach((col, i) => {
          const brut = col.valeur ? String(col.valeur(l.ref) || '') : '';
          const cle = finalCle(col);
          const c = { v: brut };
          if (estDate[i] && /^\d{4}-\d{2}-\d{2}/.test(brut)) {
            c.t = 'd';
            c.s = { fmt: 'date' };
            if (cle === cleEch && this._enRetard && this._enRetard.has(l.ref)) {
              c.s = { fmt: 'date', color: 'C0392B', b: true };
            }
          } else if (cle === cleAv && brut !== '' && !Number.isNaN(Number(brut))) {
            c.v = Number(brut);
            c.t = 'n';
            c.s = { fmt: 'pourcent' };
          } else if (cle === cleFam && brut) {
            const hx = hexFamille(l.famille);
            if (hx) c.s = { fill: hx, b: true };
          }
          rangee.push(c);
        });
        lignesXlsx.push(rangee);
        tachesRangee.push(l);
      }

      // Damier Gantt : une colonne par période (échelle = zoom de la frise),
      // cellules peintes entre début et échéance. Jalon = une cellule marquée,
      // tâche sans date = rien, tâche en retard = rouge.
      const figerColonnes = colonnes.length;
      let dMin = '';
      let dMax = '';
      for (const l of tachesRangee) {
        for (const v of [l.debut, l.echeance]) {
          const j = Ariane.jourValide(v);
          if (!j) continue;
          if (!dMin || j < dMin) dMin = j;
          if (!dMax || j > dMax) dMax = j;
        }
      }
      const jour = new Date().toISOString().slice(0, 10);
      if (dMin && dMax) {
        const unite = this.zoom === 'jour' ? 'jour'
          : (this.zoom === 'semaine' ? 'semaine' : 'mois');
        const { periodes } = Ariane.periodesGantt(dMin, dMax, unite, 400);
        const idxAuj = periodes.findIndex((p) => jour >= p.debut && jour <= p.fin);
        periodes.forEach((p, i) => {
          const col = { titre: p.label, largeur: 4.5 };
          if (i === idxAuj) {
            col.sEntete = { b: true, color: 'FFFFFF', fill: 'C55A11', bord: 'entete', align: 'center' };
          }
          colonnes.push(col);
        });
        tachesRangee.forEach((l, r) => {
          const a = Ariane.jourValide(l.debut) || Ariane.jourValide(l.echeance);
          const b = Ariane.jourValide(l.echeance) || Ariane.jourValide(l.debut);
          const enRetard = this._enRetard && this._enRetard.has(l.ref);
          const fill = enRetard ? 'E0533D' : (hexFamille(l.famille) || 'B0B0B0');
          periodes.forEach((p, i) => {
            const bord = i === idxAuj ? 'today' : undefined;
            let cell = bord ? { v: '', s: { bord } } : { v: '' };
            if (a && b && a <= p.fin && b >= p.debut) {
              if (l.jalon) {
                if (l.echeance >= p.debut && l.echeance <= p.fin) {
                  cell = { v: '◆', s: bord ? { fill, color: 'FFFFFF', b: true, bord } : { fill, color: 'FFFFFF', b: true } };
                }
              } else {
                cell = { v: '', s: bord ? { fill, bord } : { fill } };
              }
            }
            lignesXlsx[r].push(cell);
          });
        });
      }

      const nomVue = (this.ctx.nomVue && this.ctx.nomVue()) || tr('Frise');
      const base = (nomVue + ' — ' + jour).replace(/[\\/:*?"<>|]+/g, ' ').trim();
      const octets = Ariane.classeurXlsx({
        nom: nomVue, titre: nomVue + '  ·  ' + jour,
        colonnes, lignes: lignesXlsx, figerColonnes,
      });
      let chemin = base + '.xlsx';
      try {
        if (this.app.fileManager.getAvailablePathForAttachment) {
          chemin = await this.app.fileManager.getAvailablePathForAttachment(base + '.xlsx', '');
        }
      } catch (e) { /* repli : racine du coffre */ }
      while (this.app.vault.getAbstractFileByPath(chemin)) {
        chemin = chemin.replace(/(\.xlsx)$/, ' ~' + Date.now() + '$1');
      }
      await this.app.vault.createBinary(chemin, octets.buffer);
      new obsidian.Notice(tr('Frise exportée : ') + chemin);
      if (this.app.openWithDefaultApp) {
        try { this.app.openWithDefaultApp(chemin); } catch (e) { /* mobile / pas d'appli */ }
      }
    } catch (e) {
      console.error('[Ariane] export frise :', e);
      new obsidian.Notice(tr('Export impossible : ') + (e && e.message ? e.message : e));
    }
  }

  // Exporte la frise en un FICHIER HTML UNIQUE « vivant » : le vrai moteur
  // (MoteurFrise, embarqué tel quel via sa source) redessine la frise hors
  // d'Obsidian avec les données figées à l'instant de l'export — zoom, replis,
  // regroupement, tris, bulles et survol de lignée restent fonctionnels. Les
  // écritures (glisser une barre, blocage) ne touchent que l'aperçu : elles
  // ne remontent jamais vers le coffre. Voir pageFriseHtml pour le socle.
  async exporterHtml() {
    try {
      const ctx = this.ctx;
      const taches = ctx.taches();
      const refs = taches.map((t) => t.ref);
      const jour = new Date().toISOString().slice(0, 10);
      const nomVue = (ctx.nomVue && ctx.nomVue()) || tr('Frise');

      // Colonnes : les fermetures de la vue ne peuvent pas partir dans le
      // fichier — valeurs figées par tâche, relues ensuite par dictionnaire.
      // (Régression : le premier jet créait les dictionnaires vides PUIS
      // appelait les fermetures dessus — chaque cellule de propriété partait
      // vide, seule file.name s'en tirant avec la référence en repli.)
      const colonnes = colonnesPourExport(this._colsRendu || ctx.colonnes(), refs);

      // Tri natif de la base : critères + valeur multi-critères précalculée.
      let triNatif = null;
      if (ctx.triNatif) {
        try {
          const tn = ctx.triNatif();
          if (tn && tn.criteres && tn.criteres.length) {
            try { tn.preparer(taches); } catch (e) { /* _multi absent : tri de repli */ }
            const multi = {};
            for (const t of taches) multi[t.ref] = t._multi || null;
            triNatif = { criteres: tn.criteres, multi: multiPourExport(multi) };
          }
        } catch (e) { triNatif = null; }
      }

      // Regroupement : labels par tâche + méta (propriété active, nom, sens).
      let groupes = null;
      try {
        const g = ctx.groupes && ctx.groupes();
        if (g) groupes = JSON.parse(JSON.stringify(Object.fromEntries(g)));
      } catch (e) { groupes = null; }
      const grp = {
        actuel: (ctx.groupeActuel && ctx.groupeActuel()) || null,
        nom: (ctx.nomGroupe && ctx.nomGroupe()) || '',
        sens: (ctx.sensGroupe && ctx.sensGroupe()) || 1,
      };

      // Config figée (clés lues par le moteur) + renommages de colonnes.
      const valeurs = {};
      for (const k of ['zoom', 'tri', 'triColonne', 'triColonneSens', 'rowHeight',
        'columnSize', 'libelleSemaine']) {
        try { valeurs[k] = ctx.lire(k); } catch (e) { valeurs[k] = DEFAUTS_FRISE[k]; }
      }
      const renoms = {};
      for (const col of colonnes) {
        try { renoms[col.cle] = ctx.renomColonne ? (ctx.renomColonne(col.cle) || '') : ''; } catch (e) { /* rien */ }
      }
      let pos = null;
      try { pos = ctx.posLire ? (ctx.posLire() || null) : null; } catch (e) { pos = null; }

      // Familles, clés de propriétés, chemins de notes (pour les liens
      // obsidian:// de la page exportée).
      const familles = {};
      for (const t of taches) {
        const f = t.famille;
        if (f && !familles[f]) {
          try { familles[f] = this.greffon.familleDe(f) || { nom: f }; } catch (e) { familles[f] = { nom: f }; }
        }
      }
      const cleT = {};
      for (const k of ['famille', 'echeance', 'avancement']) {
        try { cleT[k] = this.greffon.cleT(k); } catch (e) { cleT[k] = k; }
      }
      const chemins = {};
      try {
        const notes = this.app.vault.getMarkdownFiles();
        for (const t of taches) {
          const f = notes.find((x) => x.basename === t.ref);
          if (f) chemins[t.ref] = f.path;
        }
      } catch (e) { /* hors coffre : liens inactifs */ }

      // Icônes : markup SVG réel figé (le setIcon d'Obsidian n'existe pas
      // hors du coffre). Superset : liste manuelle + noms littéraux du moteur.
      const icones = {};
      const sonde = document.createElement('span');
      const nomsIcones = new Set(['locate-fixed', 'rotate-ccw', 'palette', 'alert-triangle',
        'file-code', 'info', 'variable', 'text', 'binary', 'square-check', 'calendar', 'clock',
        'list', 'tags', 'forward', 'chevron-down', 'chevron-up', 'chevron-right']);
      // Le moteur hérite de MoteurVue : la page autonome doit recevoir les DEUX
      // sources, sinon « extends MoteurVue » ne se résout nulle part.
      const srcMoteur = MoteurVue.toString() + '\n' + MoteurFrise.toString();
      for (const m of srcMoteur.matchAll(/setIcon\([^,]+?,\s*['"]([\w-]+)['"]/g)) nomsIcones.add(m[1]);
      for (const n of nomsIcones) {
        try { obsidian.setIcon(sonde, n); icones[n] = sonde.innerHTML; } catch (e) { icones[n] = ''; }
      }

      // Styles du greffon + variables de thème résolues au moment de l'export.
      // Le manifeste est celui du GREFFON (exporterHtml vit sur le moteur,
      // qui n'a pas de manifest) — sinon aucune feuille de style dans la page.
      let css = '';
      try {
        const dir = (this.greffon && this.greffon.manifest && this.greffon.manifest.dir)
          || (this.manifest && this.manifest.dir);
        css = await this.app.vault.adapter.read(dir + '/styles.css');
      } catch (e) { css = ''; }
      const nomsVars = new Set(['--bases-table-row-height', '--font-ui-smaller', '--font-ui-small',
        '--font-interface', '--font-text', '--font-monospace', '--background-primary',
        '--background-secondary', '--background-secondary-alt', '--background-modifier-border',
        '--background-modifier-hover', '--text-normal', '--text-muted', '--text-faint',
        '--text-accent', '--interactive-accent']);
      for (const m of css.matchAll(/--[A-Za-z][\w-]*/g)) nomsVars.add(m[0]);

      // Le moteur tel quel + les fonctions pures (statiques de la classe).
      const ariane = { fns: {}, data: {} };
      for (const k of Object.getOwnPropertyNames(Ariane)) {
        if (k === 'length' || k === 'name' || k === 'prototype') continue;
        let v;
        try { v = Ariane[k]; } catch (e) { continue; }
        if (typeof v === 'function') {
          try { ariane.fns[k] = v.toString(); } catch (e) { /* source indisponible */ }
        } else {
          try { ariane.data[k] = JSON.parse(JSON.stringify(v)); } catch (e) { /* non sérialisable */ }
        }
      }
      // Les couleurs du moteur (barres selon le statut, avancement…) sont des
      // variables du THÈME d'Obsidian (var(--color-green)…) — absentes de
      // styles.css : les relever ici aussi, sinon barres et repères invisibles.
      for (const m of srcMoteur.matchAll(/var\((--[A-Za-z][\w-]*)/g)) nomsVars.add(m[1]);
      for (const k in ariane.fns) {
        for (const m of ariane.fns[k].matchAll(/var\((--[A-Za-z][\w-]*)/g)) nomsVars.add(m[1]);
      }
      const vars = {};
      try {
        const cs = getComputedStyle(document.body);
        for (const v of nomsVars) { const x = cs.getPropertyValue(v).trim(); if (x) vars[v] = x; }
      } catch (e) { /* pas grave : replis CSS */ }

      // Constantes de module que le moteur lit directement (la garde des
      // tests énumère les identifiants libres du moteur — si un nouveau nom
      // apparaît ici, il faut l'ajouter à ce dictionnaire ET au socle).
      const constantes = { JOURS_MINIMUM_GANTT, MOIS_COURTS, MOIS_LETTRES };

      // Copie blanche : les tâches vivantes portent le TFile (circulaire) et
      // ne doivent jamais partir telles quelles dans le fichier HTML.
      const tachesFigees = tachesPourExport(taches);

      const d = {
        langue: LANGUE, textes: TEXTES, defauts: DEFAUTS_FRISE, typeVue: TYPE_VUE_BASE_FRISE,
        constantes,
        nomVue, jour, moteur: srcMoteur, ariane, icones, css, vars,
        taches: tachesFigees, colonnes, valeurs, renoms, pos, triNatif, groupes, grp,
        cleT, familles, chemins,
        coffre: (this.app.vault.getName && this.app.vault.getName()) || '',
        barreCouleur: (this.greffon.settings || {}).friseBarreCouleur,
        lignageSurvol: (this.greffon.settings || {}).friseLignageSurvol,
        entete: tr('Frise exportée le ') + jour + ' · Obsidian' + ' · ' + tr('aperçu lecture seule'),
      };

      const base = (nomVue + ' — ' + jour).replace(/[\\/:*?"<>|]+/g, ' ').trim();
      let chemin = base + '.html';
      try {
        if (this.app.fileManager.getAvailablePathForAttachment) {
          chemin = await this.app.fileManager.getAvailablePathForAttachment(base + '.html', '');
        }
      } catch (e) { /* repli : racine du coffre */ }
      while (this.app.vault.getAbstractFileByPath(chemin)) {
        chemin = chemin.replace(/(\.html)$/, ' ~' + Date.now() + '$1');
      }
      const pageTexte = pageFriseHtml(d);
      try { await this.app.vault.create(chemin, pageTexte); }
      catch (e) { await this.app.vault.adapter.write(chemin, pageTexte); }
      new obsidian.Notice(tr('Frise exportée : ') + chemin);
      if (this.app.openWithDefaultApp) {
        try { this.app.openWithDefaultApp(chemin); } catch (e) { /* mobile / pas d'appli */ }
      }
    } catch (e) {
      console.error('[Ariane] export HTML de la frise :', e);
      new obsidian.Notice(tr('Export impossible : ') + (e && e.message ? e.message : e));
    }
  }

  // Ramène la frise sur la colonne d'aujourd'hui, centrée dans la fenêtre.
  recentrerAujourdhui() {
    if (!this._droite || !this._cfg) return;
    const auj = new Date().toISOString().slice(0, 10);
    const x = Ariane.ecartJours(this._cfg.debut, auj) * this._cfg.ppj;
    const cible = Math.max(0, x - this._droite.clientWidth / 2);
    if (this._droite.scrollTo) this._droite.scrollTo({ left: cible, behavior: 'smooth' });
    else this._droite.scrollLeft = cible;
  }

  dessinerCascade(c) {
    if (!this._cascade) return;
    const { ref, jours, bloquants } = this._cascade;
    const d = c.createDiv({ cls: 'zfa-gantt-cascade' });
    d.createSpan({ text: tr('Ce décalage contredit un blocage de ') + ref + '. ' });
    this.bouton(d, tr('Décaler l aval de ') + jours + tr(' jour(s)'), async () => {
      const ch = Ariane.cascadeAval(this._lignes, bloquants, ref, jours)
        .filter((x) => x.ref !== ref);
      await this.greffon.ecrireDatesTaches(ch);
      this._cascade = null; this.dessiner();
    }, true);
    this.bouton(d, tr('Laisser'), () => { this._cascade = null; this.dessiner(); });
  }

  // Clic droit sur la ligne d'une tâche sans date : une petite modale pour
  // saisir début et/ou échéance (le glisser direct sur la bande hachurée trace
  // la barre sans fenêtre — voir saisirSansDate). À l'enregistrement, la tâche
  // reprend sa place datée.
  ouvrirModaleDate(ligne) {
    new ModaleDaterTache(this.app, ligne, async ({ debut, echeance }) => {
      await this.greffon.ecrireDatesTaches([{ ref: ligne.ref, debut, echeance }]);
      this.dessiner();
    }).open();
  }

  /* ---------------------------- Colonne gauche --------------------------- */

  // Icône d'en-tête selon le type de la propriété, comme le fait le tableau
  // des bases. On interroge le gestionnaire de types d'Obsidian plutôt que de
  // deviner d'après le nom.
  //#endregion Frise · barre d'outils & exports

  //#region Frise · colonne gauche (tableau)
  typeColonne(id) {
    return Ariane.typeProprieteBase(this.app.metadataTypeManager, id);
  }

  // Le contenu d'une cellule, dans le balisage qu'emploie le tableau des bases :
  // une valeur qui désigne une note devient un vrai lien interne, coloré et
  // cliquable, avec l'aperçu au survol. Le reste est du texte.
  contenuCellule(cellule, col, ligne) {
    const texte = String(col.valeur(ligne.ref) || '');
    const liens = [];
    if (col.cle === 'file.name') {
      liens.push({ cible: ligne.ref, libelle: texte || ligne.ref });
    } else {
      const re = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
      let m;
      while ((m = re.exec(texte))) liens.push({ cible: m[1].trim(), libelle: (m[2] || m[1]).trim() });
    }
    // Hors colonnes de liens : on confie la cellule au widget de type
    // d'Obsidian (le même que le panneau de propriétés et le tableau des
    // bases). Une date sort au format des propriétés, avec le sélecteur de
    // calendrier ; une case devient une vraie case ; un nombre est aligné.
    // L'édition écrit dans l'entête de la note via majTache. Le repli
    // textuel reste derrière si le widget manque ou lève.
    if (!liens.length) {
      if (this.rendreCelluleTypee(cellule, col, ligne)) return;
      cellule.createSpan({ cls: 'zfa-gantt-valeur', text: texte });
      return;
    }
    const enveloppe = cellule.createDiv({ cls: 'metadata-link zfa-gantt-liens' });
    liens.forEach((l, i) => {
      if (i) enveloppe.createSpan({ cls: 'zfa-gantt-separe', text: ', ' });
      const a = enveloppe.createEl('a', {
        cls: 'internal-link metadata-link-inner', text: l.libelle,
        attr: { href: l.cible, 'data-href': l.cible },
      });
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.app.workspace.openLinkText(l.cible, '', e.metaKey || e.ctrlKey);
      });
      // L'aperçu au survol, comme sur n'importe quel lien du coffre.
      a.addEventListener('mouseover', (e) => {
        this.app.workspace.trigger('hover-link', {
          event: e, source: TYPE_VUE_BASE_FRISE, hoverParent: this, targetEl: a,
          linktext: l.cible,
        });
      });
    });
  }

  // Rend une cellule avec le widget de type d'Obsidian. Renvoie true si le
  // widget a pris la main, false s'il n'y en a pas pour ce type ou s'il a levé.
  rendreCelluleTypee(cellule, col, ligne) {
    const cle = String(col.cle || '');
    if (cle.startsWith('file.') || cle.startsWith('formula.')) return false;
    const type = this.typeColonne(cle);
    const widgets = this.app.metadataTypeManager
      && this.app.metadataTypeManager.registeredTypeWidgets;
    const widget = widgets && widgets[type];
    if (!widget || typeof widget.render !== 'function') return false;

    const champ = cle.replace(/^note\./, '');
    const brut = col.valeurBrute ? col.valeurBrute(ligne.ref) : col.valeur(ligne.ref);
    const ctx = {
      app: this.app,
      key: champ,
      sourcePath: (col.chemin && col.chemin(ligne.ref)) || (ligne.ref + '.md'),
      blur: () => {},
      onChange: (v) => {
        if (this.greffon && typeof this.greffon.majTache === 'function') {
          this.greffon.majTache(ligne.ref, { [champ]: v });
        }
      },
    };
    try {
      widget.render(cellule, brut == null ? '' : brut, ctx);
      cellule.addClass('bases-metadata-value', 'metadata-property-value');
      return true;
    } catch (e) {
      cellule.empty();
      cellule.removeClass('bases-metadata-value', 'metadata-property-value');
      return false;
    }
  }

  iconeColonne(id) {
    if (String(id).startsWith('file.')) return 'info';
    if (String(id).startsWith('formula.')) return 'variable';
    const type = Ariane.typeProprieteBase(this.app.metadataTypeManager, id);
    return {
      text: 'text', number: 'binary', checkbox: 'square-check', date: 'calendar',
      datetime: 'clock', multitext: 'list', tags: 'tags', aliases: 'forward',
    }[type] || 'text';
  }

  // Largeur d'une colonne de propriété. La clé columnSize est celle du tableau
  // des bases : les deux vues d'une même base partagent donc leurs largeurs, et
  // en redimensionner une redimensionne l'autre.
  largeurColonne(id) {
    const t = this.ctx.lire('columnSize');
    const v = t && typeof t === 'object' ? Number(t[id]) : NaN;
    return Number.isFinite(v) && v > 40 ? v : 160;
  }

  async poserLargeurColonne(id, px) {
    const t = this.ctx.lire('columnSize');
    const table = (t && typeof t === 'object') ? Object.assign({}, t) : {};
    table[id] = Math.round(px);
    await this.ctx.ecrire('columnSize', table);
  }

  // Repositionne en-tête et cellules après un changement de largeur, et cale la
  // largeur du panneau gauche sur la somme des colonnes. Toute la frise se
  // décale d'autant : sans retour vivant, on croit que rien ne se passe.
  _appliquerLargeurs(cols, gauche, table) {
    let x = 0;
    for (const c of cols) { c.gauche = x; x += c.largeur; }
    for (const cel of table.querySelectorAll('.bases-td')) {
      const c = cols.find((y) => y.cle === cel.dataset.colonne);
      if (!c) continue;
      cel.style.left = c.gauche + 'px';
      cel.style.width = c.largeur + 'px';
    }
    table.style.width = x + 'px';
    gauche.style.width = x + 'px';
  }

  // Fait suivre une largeur de colonne à la souris pendant un glisser, puis la
  // persiste au relâchement. Partagé par la poignée d'en-tête et le séparateur.
  _glisserLargeur(col, evtDepart, cols, gauche, table, marqueur) {
    if (evtDepart.button !== 0) return;
    evtDepart.preventDefault();
    evtDepart.stopPropagation();
    if (marqueur) marqueur.addClass('is-active');
    const x0 = evtDepart.clientX;
    const large0 = col.largeur;
    const bouger = (ev) => {
      col.largeur = Math.max(60, Math.min(600, large0 + ev.clientX - x0));
      this._appliquerLargeurs(cols, gauche, table);
      if (this._placerSeparateur) this._placerSeparateur();
    };
    const lacher = async () => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      if (marqueur) marqueur.removeClass('is-active');
      await this.poserLargeurColonne(col.cle, col.largeur);
      this.dessiner();
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  // Poignée de redimensionnement, au même endroit et de la même classe que
  // celle du tableau des bases, pour qu'elle en reçoive le style et le curseur.
  poserResizer(cellule, col, cols, gauche, table) {
    const r = cellule.createDiv({ cls: 'bases-table-header-resizer' });
    r.addEventListener('pointerdown',
      (e) => this._glisserLargeur(col, e, cols, gauche, table, r));
    return r;
  }

  // Séparateur pleine hauteur entre le panneau gauche et la frise : il tombe
  // sur le bord droit du panneau et pilote la largeur de la dernière colonne,
  // donc celle du panneau. La poignée d'en-tête ne se prenait qu'en haut.
  poserSeparateurVertical(gauche, table, cols) {
    if (!cols.length) return;
    const env = gauche.parentElement;
    if (!env) return;
    const sep = env.createDiv({ cls: 'zfa-gantt-separateur-v' });
    sep.style.height = this._hauteurTotale + 'px';
    const derniere = cols[cols.length - 1];
    this._placerSeparateur = () => {
      sep.style.left = (gauche.offsetLeft + gauche.offsetWidth) + 'px';
    };
    this._placerSeparateur();
    sep.addEventListener('pointerdown',
      (e) => this._glisserLargeur(derniere, e, cols, gauche, table, sep));
  }

  // Le tri par en-tête, comme dans le tableau : un clic range en ordre
  // croissant, un deuxième inverse, un troisième rend la main au tri courant.
  async basculerTriColonne(col) {
    const actuel = this.ctx.lire('triColonne');
    const sens = this.ctx.lire('triColonneSens');
    if (actuel !== col.cle) {
      await this.ctx.ecrire('triColonne', col.cle);
      await this.ctx.ecrire('triColonneSens', 1);
    } else if (sens !== -1) {
      await this.ctx.ecrire('triColonneSens', -1);
    } else {
      await this.ctx.ecrire('triColonne', null);
    }
    this.dessiner();
  }

  // Tri direct d'une colonne dans un sens donné (depuis le menu d'en-tête).
  async trierColonneVers(col, sens) {
    await this.ctx.ecrire('triColonne', col.cle);
    await this.ctx.ecrire('triColonneSens', sens === -1 ? -1 : 1);
    this.dessiner();
  }

  // Déplace la colonne `src` juste avant `cible` dans l'ordre natif de la base
  // (glisser-déposer d'en-tête, comme dans un tableau Bases).
  async reordonnerColonnes(src, cible) {
    if (!this.ctx.reordonner || !this.ctx.ordreColonnes) return;
    const ordre = this.ctx.ordreColonnes();
    if (!ordre.includes(src)) return;
    const sans = ordre.filter((x) => x !== src);
    let b = sans.indexOf(cible);
    if (b < 0) b = sans.length;
    sans.splice(b, 0, src);
    await this.ctx.reordonner(sans);
    this.dessiner();
  }

  // Menu contextuel d'un en-tête de colonne, à l'image de celui du tableau des
  // bases. Bases ne l'expose pas ; on le reconstruit sur ce qui est réellement
  // câblable. Les libellés de tri suivent le type de la colonne.
  menuEntete(e, col) {
    e.preventDefault();
    e.stopPropagation();
    const cle = String(col.cle || '');
    const type = this.typeColonne(cle);
    const paires = {
      number: ['1 → 9', '9 → 1'],
      date: [tr('ancien → récent'), tr('récent → ancien')],
      datetime: [tr('ancien → récent'), tr('récent → ancien')],
    }[type] || ['A → Z', 'Z → A'];
    const triActif = this.ctx.lire('triColonne') === cle;
    const sensActif = this.ctx.lire('triColonneSens') === -1 ? -1 : 1;
    const groupeActif = this.ctx.groupeActuel && this.ctx.groupeActuel() === cle;

    const menu = new obsidian.Menu();
    if (this.ctx.masquerColonne) {
      menu.addItem((i) => i.setTitle(tr('Masquer la colonne')).setIcon('eye-off')
        .onClick(async () => { await this.ctx.masquerColonne(cle); this.dessiner(); }));
    }
    if (this.ctx.poserGroupe) {
      menu.addItem((i) => i
        .setTitle(groupeActif ? tr('Ne plus regrouper par cette propriété')
                              : tr('Regrouper par cette propriété'))
        .setIcon('rows-3')
        .onClick(() => {
          this.ctx.poserGroupe(groupeActif ? null : cle);
          this.dessiner();
        }));
    }

    menu.addSeparator();
    menu.addItem((i) => i.setTitle(tr('Trier') + ' ' + paires[0]).setIcon('arrow-down-a-z')
      .setChecked(triActif && sensActif === 1).onClick(() => this.trierColonneVers(col, 1)));
    menu.addItem((i) => i.setTitle(tr('Trier') + ' ' + paires[1]).setIcon('arrow-up-a-z')
      .setChecked(triActif && sensActif === -1).onClick(() => this.trierColonneVers(col, -1)));
    if (triActif) {
      menu.addItem((i) => i.setTitle(tr('Effacer le tri')).setIcon('x')
        .onClick(async () => { await this.ctx.ecrire('triColonne', null); this.dessiner(); }));
    }

    menu.addSeparator();
    menu.addItem((i) => i.setTitle(tr('Modifier la propriété…')).setIcon('pencil')
      .onClick(() => this._popoverColonne(cle, col, e)));
    menu.showAtMouseEvent(e);
  }

  // Popover « Modifier la propriété », calqué sur celui des bases natives :
  // nom d'affichage (propre à cette frise) + type de propriété.
  _popoverColonne(cle, col, evt) {
    if (this._colPop) { this._colPop.remove(); this._colPop = null; }
    const fichier = cle.startsWith('file.') || cle.startsWith('formula.');
    const nomProp = cle.replace(/^note\./, '');
    const cible = evt && evt.target && evt.target.closest
      ? evt.target.closest('.bases-td') : null;
    // Document DE LA FENÊTRE de la vue : en volet détaché, le popover doit
    // vivre, se placer et se fermer dans le document de la frise — pas dans
    // celui de la fenêtre principale. DOM standard (createElement), car les
    // aides createDiv/createEl d'Obsidian ne sont garanties que dans le
    // royaume principal (même parti que le panneau de lignée du calendrier).
    const doc = this._doc();

    const pop = doc.createElement('div');
    pop.className = 'zfa-col-pop';
    doc.body.appendChild(pop);
    this._colPop = pop;
    const titre = doc.createElement('div');
    titre.className = 'zfa-col-pop-titre';
    titre.textContent = tr('Modifier ') + nomProp;
    pop.appendChild(titre);

    const lbl = (txt) => {
      const d = doc.createElement('div');
      d.className = 'zfa-col-pop-lbl';
      d.textContent = txt;
      pop.appendChild(d);
    };
    lbl(tr('Nom d\'affichage'));
    const inp = doc.createElement('input');
    inp.type = 'text';
    inp.value = (col && col.nom) || nomProp;
    pop.appendChild(inp);

    const mtm = this.app.metadataTypeManager;
    let sel = null;
    if (!fichier && mtm && typeof mtm.setType === 'function') {
      lbl(tr('Type de propriété'));
      sel = doc.createElement('select');
      sel.className = 'dropdown';
      const TYPES = [['text', tr('Texte')], ['number', tr('Nombre')], ['date', tr('Date')],
        ['datetime', tr('Date & heure')], ['checkbox', tr('Case à cocher')], ['multitext', tr('Liste')]];
      for (const [t, lib] of TYPES) {
        const o = doc.createElement('option');
        o.value = t; o.textContent = lib;
        sel.appendChild(o);
      }
      sel.value = this.typeColonne(cle) || 'text';
      sel.onchange = async () => { try { await mtm.setType(nomProp, sel.value); } catch (e) { /* rien */ } };
    }

    const r = pop.getBoundingClientRect();
    const b = cible ? cible.getBoundingClientRect() : null;
    let x = b ? b.left : (evt ? evt.clientX : 120);
    let y = b ? b.bottom + 4 : (evt ? evt.clientY : 120);
    // Viewport de la fenêtre qui héberge la vue (clientWidth == innerWidth).
    const vw = doc.documentElement.clientWidth || window.innerWidth;
    const vh = doc.documentElement.clientHeight || window.innerHeight;
    x = Math.max(8, Math.min(x, vw - r.width - 8));
    y = Math.max(8, Math.min(y, vh - r.height - 8));
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';

    let clos = false;
    const fermer = async () => {
      if (clos) return;
      clos = true;
      doc.removeEventListener('pointerdown', hors, true);
      doc.removeEventListener('keydown', touche, true);
      if (this.ctx.renommer) await this.ctx.renommer(cle, inp.value.trim());
      pop.remove();
      this._colPop = null;
      this.dessiner();
    };
    const hors = (ev) => { if (!pop.contains(ev.target)) fermer(); };
    const touche = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); fermer(); }
      else if (ev.key === 'Enter' && ev.target === inp) { ev.preventDefault(); fermer(); }
    };
    setTimeout(() => {
      doc.addEventListener('pointerdown', hors, true);
      doc.addEventListener('keydown', touche, true);
      inp.focus();
      inp.select();
    }, 0);
  }

  // La partie gauche est un vrai tableau de base : mêmes classes, même
  // imbrication, mêmes variables. Le style vient donc d'Obsidian lui-même, et
  // suivra ses évolutions comme celles des thèmes de Monsieur.
  // Les cellules sont en position absolue, comme chez lui, la largeur de chaque
  // colonne étant posée par le script.
  dessinerColonneGauche(gauche, lignes) {
    const colonnes = (this.ctx.colonnes && this.ctx.colonnes()) || [];
    const H = this._H;
    const hEntete = this._hEntete;
    this._placerSeparateur = null;

    const conteneur = gauche.createDiv({ cls: 'bases-table-container zfa-gantt-table' });
    const table = conteneur.createDiv({ cls: 'bases-table' });

    // Géométrie des colonnes : l'arbre d'abord, puis les propriétés.
    // La hiérarchie s'accroche à la PREMIÈRE colonne, quelle qu'elle soit :
    // c'est là qu'Obsidian met le nom, et c'est là qu'on attend les chevrons.
    // Sans aucune colonne, il n'y a pas de panneau du tout.
    const cols = colonnes.map((c, i) => ({
      cle: c.cle, nom: c.nom, icone: this.iconeColonne(c.cle),
      type: this.typeColonne(c.cle),
      largeur: this.largeurColonne(c.cle), valeur: c.valeur,
      valeurBase: c.valeurBase, valeurBrute: c.valeurBrute, chemin: c.chemin,
      arbre: i === 0,
    }));
    this._colsRendu = cols;                 // repris tel quel par l'export XLSX
    if (!cols.length) { gauche.style.width = '0px'; gauche.addClass('zfa-gantt-sans-colonnes'); return; }
    let total = 0;
    for (const c of cols) { c.gauche = total; total += c.largeur; }
    gauche.style.width = total + 'px';
    table.style.width = total + 'px';

    const thead = table.createDiv({ cls: 'bases-thead' });
    thead.style.height = hEntete + 'px';
    for (const c of cols) {
      const td = thead.createDiv({ cls: 'bases-td' });
      td.dataset.colonne = c.cle;
      td.style.left = c.gauche + 'px';
      td.style.width = c.largeur + 'px';
      td.style.height = hEntete + 'px';
      const entete = td.createDiv({ cls: 'bases-table-header' });
      entete.style.height = hEntete + 'px';
      entete.style.alignItems = 'center';
      const label = entete.createDiv({ cls: 'bases-table-header-label' });
      const ic = label.createSpan({ cls: 'bases-table-header-icon' });
      obsidian.setIcon(ic, c.icone);
      label.createSpan({ cls: 'bases-table-header-name', text: c.nom });
      const trie = this.ctx.lire('triColonne') === c.cle;
      const sens = this.ctx.lire('triColonneSens') === -1 ? 'desc' : 'asc';
      if (trie) td.dataset.sort = sens;
      const fleche = entete.createDiv({ cls: 'bases-table-header-sort' });
      obsidian.setIcon(fleche, sens === 'desc' ? 'chevron-down' : 'chevron-up');
      if (!trie) fleche.addClass('zfa-gantt-tri-latent');
      td.addEventListener('click', (e) => {
        if (e.target.closest('.bases-table-header-resizer')) return;
        this.basculerTriColonne(c);
      });
      td.addEventListener('contextmenu', (e) => this.menuEntete(e, c));
      this.poserResizer(td, c, cols, gauche, table);

      // Glisser l'en-tête pour réordonner (via setOrder de la base).
      label.setAttribute('draggable', 'true');
      label.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/x-zfa-col', c.cle);
        ev.dataTransfer.effectAllowed = 'move';
        td.addClass('zfa-gantt-col-glisse');
      });
      label.addEventListener('dragend', () => td.removeClass('zfa-gantt-col-glisse'));
      td.addEventListener('dragover', (ev) => {
        if (!ev.dataTransfer.types.includes('text/x-zfa-col')) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        td.addClass('zfa-gantt-col-cible');
      });
      td.addEventListener('dragleave', () => td.removeClass('zfa-gantt-col-cible'));
      td.addEventListener('drop', (ev) => {
        td.removeClass('zfa-gantt-col-cible');
        const src = ev.dataTransfer.getData('text/x-zfa-col');
        if (!src) return;
        ev.preventDefault();
        if (src !== c.cle) this.reordonnerColonnes(src, c.cle);
      });
    }

    const tbody = table.createDiv({ cls: 'bases-tbody zfa-gantt-gauche-corps' });
    tbody.style.height = (this._hauteurTotale - this._hEntete) + 'px';
    lignes.forEach((l) => {
      // Les bandes de groupe sont dessinées à part, en surcouche pleine largeur.
      if (l.kind === 'groupe') return;
      // Surtout ne pas nommer cette variable « tr » : ce nom est celui de la
      // fonction de traduction du greffon, et le masquer faisait lever une
      // exception au premier libellé, ce qui interrompait tout le dessin.
      const rangee = tbody.createDiv({ cls: 'bases-tr zfa-gantt-libelle' });
      rangee.dataset.ref = l.ref;
      rangee.style.top = (l.y - this._hEntete) + 'px';
      rangee.style.height = l.h + 'px';
      rangee.addEventListener('contextmenu', (e) => this.menuTache(e, l));
      // Source de glissé vers le calendrier : déposer la ligne sur un jour de la
      // vue semaine y pose un créneau, sur la vue mois y cale les dates.
      rangee.setAttribute('draggable', 'true');
      rangee.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/x-ariane-tache', l.ref);
        ev.dataTransfer.setData('text/plain', '[[' + l.ref + ']]');
        ev.dataTransfer.effectAllowed = 'copy';
      });

      for (const c of cols) {
        const td = rangee.createDiv({ cls: 'bases-td' });
        td.dataset.colonne = c.cle;
        td.style.left = c.gauche + 'px';
        td.style.width = c.largeur + 'px';
        td.style.height = l.h + 'px';
        const cellule = td.createDiv({ cls: 'bases-table-cell' });
        if (c.type) cellule.dataset.propertyType = c.type;
        this.contenuCellule(cellule, c, l);
        // Colonne de gauche = tableau plat : toutes les lignes traitées pareil,
        // aucun retrait ni chevron de repli. La hiérarchie et les blocages se
        // lisent à droite (sur le graphe) ou via les tris et filtres.
        td.title = c.arbre
          ? l.ref + ' · ' + l.intitule
          : c.nom + ' : ' + String(c.valeur(l.ref) || '');
      }
    });

    this.poserSeparateurVertical(gauche, table, cols);
  }

  // Bandes d'en-tête de groupe : une par ligne kind:'groupe', repliables.
  // Le libellé (bande HTML) tient sur la largeur du panneau de gauche, de la
  // même couleur que le rect SVG qui prolonge la bande sur les dates ; les
  // bordures fortes et le fond SVG assurent la continuité visuelle. Renvoie la
  // piste défilante que le gestionnaire de scroll fait suivre.
  dessinerEntetesGroupes(env, lignes) {
    const groupes = lignes.filter((l) => l.kind === 'groupe');
    if (!groupes.length) return null;
    const nomProp = (this.ctx.nomGroupe && this.ctx.nomGroupe()) || '';
    const gaucheEl = env.querySelector('.zfa-gantt-gauche');
    const largeurListe = gaucheEl ? gaucheEl.offsetWidth : 0;
    const cadre = env.createDiv({ cls: 'zfa-gantt-bandes' });
    cadre.style.top = this._hEntete + 'px';
    if (largeurListe) cadre.style.width = largeurListe + 'px';
    const piste = cadre.createDiv({ cls: 'zfa-gantt-bandes-piste' });
    for (const l of groupes) {
      const b = piste.createDiv({ cls: 'zfa-gantt-bande-groupe' });
      b.style.top = (l.y - this._hEntete) + 'px';
      b.style.height = l.h + 'px';
      const replie = this.replies.has(l.cleGroupe);
      b.createSpan({ cls: 'zfa-gantt-chevron', text: replie ? '▸' : '▾' });
      const nom = l.libelle === Ariane.SANS_GROUPE
        ? (tr('(sans ') + (nomProp || tr('valeur')) + ')')
        : String(l.libelle);
      b.createSpan({ cls: 'zfa-gantt-bande-nom', text: nom });
      b.createSpan({ cls: 'zfa-gantt-bande-compte', text: ' (' + (l.n || 0) + ')' });
      b.addEventListener('click', () => {
        if (this.replies.has(l.cleGroupe)) this.replies.delete(l.cleGroupe);
        else this.replies.add(l.cleGroupe);
        this.dessiner();
      });
    }
    return piste;
  }

  /* ------------------------------- Le fond ------------------------------- */

  //#endregion Frise · colonne gauche (tableau)

  //#region Frise · grille & en-têtes de temps
  dessinerFond(svg, cfg, lignes) {
    const g = svgEl('g', {});
    const haut = this._hEntete;
    const bas = this._hauteurTotale;
    for (let i = 0; i <= cfg.jours; i++) {
      const jour = Ariane.decalerJour(cfg.debut, i);
      const [a, m, j] = jour.split('-').map(Number);
      const js = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
      const x = i * cfg.ppj;
      if ((js === 0 || js === 6) && cfg.ppj >= 8) {
        g.appendChild(svgEl('rect', { x, y: haut, width: cfg.ppj,
          height: bas - haut, class: 'zfa-gantt-weekend' }));
      }
      const fort = this.zoom === 'jour' ? true
        : (this.zoom === 'semaine' ? js === 1 : j === 1);
      if (fort) {
        g.appendChild(svgEl('line', { x1: x, y1: haut, x2: x, y2: bas,
          class: 'zfa-gantt-grille-v' }));
      } else if (this.zoom === 'semaine') {
        // Vue semaine : un quadrillage plus léger pour chaque jour.
        g.appendChild(svgEl('line', { x1: x, y1: haut, x2: x, y2: bas,
          class: 'zfa-gantt-grille-v zfa-gantt-grille-v-jour' }));
      }
    }
    // Fond des bandes de groupe, sous les barres et les flèches (qui passent
    // donc au-dessus). Les bordures horizontales, elles, ne sont PAS tracées
    // ici : elles sont posées en HTML par dessinerBorduresFrise, avec le CSS
    // exact des lignes du tableau — seul moyen d'un calage au pixel près.
    for (const l of lignes) {
      if (l.kind !== 'groupe') continue;
      g.appendChild(svgEl('rect', { x: 0, y: l.y, width: cfg.largeur, height: l.h,
        class: 'zfa-gantt-bande-groupe-fond' }));
      // Aperçu de l'étalement du groupe : une barre d'ensemble de l'échéance la
      // plus ancienne à la plus lointaine. Neutre, discret.
      if (l.apercu) {
        const yc = l.y + l.h / 2;
        const xa = this.x(cfg, l.apercu.min);
        const xb = this.x(cfg, Ariane.decalerJour(l.apercu.max, 1));
        g.appendChild(svgEl('rect', { x: xa, y: yc - 2,
          width: Math.max(2, xb - xa), height: 4, rx: 2,
          class: 'zfa-gantt-apercu-barre' }));
      }
    }
    svg.appendChild(g);
  }

  // Bordures horizontales de la frise, en HTML, avec exactement le CSS des
  // lignes du tableau de gauche : elles tombent alors au même sous-pixel.
  dessinerBorduresFrise(droite, lignes, largeur) {
    const cont = droite.createDiv({ cls: 'zfa-gantt-bordures' });
    cont.style.width = largeur + 'px';
    cont.style.height = this._hauteurTotale + 'px';
    const ent = cont.createDiv({ cls: 'zfa-gantt-bordure-entete' });
    ent.style.height = this._hEntete + 'px';
    for (const l of lignes) {
      const d = cont.createDiv({
        cls: l.kind === 'groupe' ? 'zfa-gantt-bordure-groupe' : 'zfa-gantt-bordure-ligne',
      });
      d.style.top = l.y + 'px';
      d.style.height = l.h + 'px';
    }
    return cont;
  }

  /* ------------------------------ L'en-tête ------------------------------ */

  dessinerEntete(svg, cfg) {
    const g = svgEl('g', { class: 'zfa-gantt-entete' });
    g.appendChild(svgEl('rect', { x: 0, y: 0, width: cfg.largeur,
      height: this._hEntete, class: 'zfa-gantt-entete-fond' }));
    // Libellés du haut (mois, ou année en vue année) : mémorisés pour qu'ils
    // « collent » au bord gauche pendant le défilement, afin qu'on sache
    // toujours de quel mois relèvent les jours visibles. Voir recalerEnteteHaut.
    this._enteteHaut = [];

    // Bandeau supérieur : les mois, en bandes alternées pour qu'on les
    // distingue d'un coup d'oeil sans avoir à compter les traits.
    let mois = cfg.debut.slice(0, 8) + '01';
    let rang = 0;
    while (mois <= cfg.fin) {
      const [a, m] = mois.split('-').map(Number);
      const suivant = this.moisSuivant(mois);
      const x1 = Math.max(0, this.x(cfg, mois));
      const x2 = Math.min(cfg.largeur, this.x(cfg, suivant));
      // Bande teintée sur TOUTE la hauteur de l'en-tête : sans ça, la limite
      // haute/basse des étages laissait un filet horizontal à mi-en-tête que la
      // liste, elle, n'a pas — d'où l'impression de bordures différentes.
      // En vue année, la teinte et le libellé viennent de enteteAnnees (par
      // année, pas par mois) ; ici on ne garde que le filet vertical mensuel.
      if (this.zoom !== 'année') {
        g.appendChild(svgEl('rect', { x: x1, y: 0, width: Math.max(0, x2 - x1),
          height: this._hEntete,
          class: rang % 2 ? 'zfa-gantt-bande-impaire' : 'zfa-gantt-bande-paire' }));
        // Le mois occupe l'étage du haut (collant) en vues jour / semaine /
        // mois. En vue trimestre c'est le trimestre qui y va, le mois passant
        // en bas ; en vue année c'est l'année.
        if (this.zoom !== 'trimestre' && x2 - x1 > 34) {
          const t = svgEl('text', { x: x1 + 6, y: this._bande - 5, class: 'zfa-gantt-entete-mois' });
          // Vue semaine : on préfixe le numéro du mois (09 sept. 26).
          t.textContent = (this.zoom === 'semaine' ? String(m).padStart(2, '0') + ' ' : '')
            + MOIS_COURTS[m - 1] + ' ' + String(a).slice(2);
          g.appendChild(t);
          this._enteteHaut.push({ el: t, x1: x1 + 6, x2 });
        }
      }
      g.appendChild(svgEl('line', { x1, y1: 0, x2: x1, y2: this._hEntete,
        class: 'zfa-gantt-entete-trait' }));
      mois = suivant;
      rang += 1;
    }

    if (this.zoom === 'jour') this.enteteJours(g, cfg);
    else if (this.zoom === 'semaine') this.enteteSemaines(g, cfg);
    else if (this.zoom === 'mois') this.enteteMois(g, cfg);
    else if (this.zoom === 'année') this.enteteAnnees(g, cfg);
    else this.enteteTrimestres(g, cfg);

    svg.appendChild(g);
  }

  // Fait « coller » chaque libellé du haut au bord gauche visible tant que sa
  // plage l'englobe : on ne perd plus le mois (ou l'année) en défilant.
  recalerEnteteHaut(sx) {
    for (const it of this._enteteHaut || []) {
      let w = 0;
      try { w = it.el.getComputedTextLength(); } catch (e) { w = 0; }
      if (!w) w = it.el.textContent.length * 6;
      const xmin = it.x1;
      const xmax = Math.max(xmin, it.x2 - w - 6);
      it.el.setAttribute('x', Math.min(xmax, Math.max(xmin, sx + 6)));
    }
  }

  // Même idée pour les libellés portés par les barres : le titre (et, selon la
  // hauteur de ligne, les dates et le statut) reste calé au bord gauche visible,
  // glisse avec le défilement et finit par disparaître dans l'extrémité droite
  // de la barre (détourage par la barre, voir dessinerBarres).
  recalerEtiquettes(sx) {
    for (const it of this._etiquettesMobiles || []) {
      it.el.setAttribute('x', Math.min(it.x2, Math.max(it.x1, sx + 9)));
    }
  }

  // Intitulé de barre tronqué (« … ») : au survol, le texte complet prend la
  // place du tronqué et défile doucement en aller-retour dans la barre — le
  // clipPath posé par dessinerBarres détourne déjà le débord. Le décalage
  // passe par transform (animation CSS), jamais par x : recalerEtiquettes
  // écrit x pendant le défilement horizontal, et les deux doivent composer.
  _survolDefile(groupe, el, contenu, texte, dispo) {
    const arreter = () => {
      el.classList.remove('est-defile');
      el.textContent = contenu;
      el.style.removeProperty('--defile-x');
      el.style.removeProperty('--defile-duree');
    };
    groupe.addEventListener('mouseenter', () => {
      arreter();
      el.textContent = texte;
      let mesure = 0;
      try { mesure = el.getComputedTextLength(); } catch (e) { mesure = texte.length * 7.2; }
      const d = Ariane.defileEtiquette(mesure, dispo);
      if (!d) return; // l'estimation en caractères était pessimiste : ça tient
      el.style.setProperty('--defile-x', d.x + 'px');
      el.style.setProperty('--defile-duree', d.duree + 'ms');
      el.classList.add('est-defile');
    });
    groupe.addEventListener('mouseleave', arreter);
  }

  enteteJours(g, cfg) {
    const lettres = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    for (let i = 0; i < cfg.jours; i++) {
      const jour = Ariane.decalerJour(cfg.debut, i);
      const [a, m, j] = jour.split('-').map(Number);
      const js = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
      const x = i * cfg.ppj;
      if (js === 0 || js === 6) {
        g.appendChild(svgEl('rect', { x, y: this._bande, width: cfg.ppj,
          height: this._hEntete - this._bande, class: 'zfa-gantt-weekend-entete' }));
      }
      const t = svgEl('text', { x: x + cfg.ppj / 2, y: this._basEntete,
        class: 'zfa-gantt-entete-jour' });
      t.textContent = lettres[js] + ' ' + j;
      g.appendChild(t);
    }
  }

  enteteSemaines(g, cfg) {
    const mode = this.ctx.lire('libelleSemaine') || 'numero';
    const lettres = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const avecJour = cfg.ppj >= 16;
    for (let i = 0; i < cfg.jours; i += 1) {
      const jour = Ariane.decalerJour(cfg.debut, i);
      const [a, m, j] = jour.split('-').map(Number);
      const js = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
      const x = i * cfg.ppj;
      // Étage du bas : les jours de la semaine (lettre + quantième), avec la
      // teinte du week-end, comme en vue jour mais à l'échelle de la semaine.
      if (js === 0 || js === 6) {
        g.appendChild(svgEl('rect', { x, y: this._bande, width: cfg.ppj,
          height: this._hEntete - this._bande, class: 'zfa-gantt-weekend-entete' }));
      }
      const tj = svgEl('text', { x: x + cfg.ppj / 2, y: this._basEntete,
        class: 'zfa-gantt-entete-jour' });
      tj.textContent = avecJour ? lettres[js] + j : lettres[js];
      g.appendChild(tj);
      // Filet de jour dans l'étage du bas (le lundi porte déjà le trait plein).
      if (js !== 1) {
        g.appendChild(svgEl('line', { x1: x, y1: this._bande, x2: x, y2: this._hEntete,
          class: 'zfa-gantt-entete-trait zfa-gantt-entete-trait-jour' }));
        continue;
      }
      // Lundi : trait de semaine + numéro (et/ou plage) dans l'étage du haut.
      const nb = Math.min(7, cfg.jours - i);
      const fin = Ariane.decalerJour(jour, nb - 1);
      const num = 'S' + Ariane.semaineIso(jour);
      const plage = j + '–' + Number(fin.slice(8, 10));
      const ts = svgEl('text', { x: x + 3, y: this._bande - 5,
        class: 'zfa-gantt-entete-semaine zfa-gantt-entete-semaine-haut' });
      ts.textContent = mode === 'numero' ? num : (mode === 'dates' ? plage : num + ' · ' + plage);
      g.appendChild(ts);
      g.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: this._hEntete,
        class: 'zfa-gantt-entete-trait' }));
    }
  }

  // Vue mois : le mois est déjà l'étage du haut (collant). En bas, le numéro
  // de semaine plutôt qu'un mois répété.
  enteteMois(g, cfg) {
    for (let i = 0; i < cfg.jours; i += 1) {
      const jour = Ariane.decalerJour(cfg.debut, i);
      const [a, m, j] = jour.split('-').map(Number);
      if (new Date(Date.UTC(a, m - 1, j)).getUTCDay() !== 1) continue;
      const nb = Math.min(7, cfg.jours - i);
      const x = i * cfg.ppj;
      const w = nb * cfg.ppj;
      if (w > 20) {
        const t = svgEl('text', { x: x + w / 2, y: this._basEntete,
          class: 'zfa-gantt-entete-semaine' });
        t.textContent = 'S' + Ariane.semaineIso(jour);
        g.appendChild(t);
      }
      g.appendChild(svgEl('line', { x1: x, y1: this._bande, x2: x, y2: this._hEntete,
        class: 'zfa-gantt-entete-trait' }));
    }
  }

  // Vue année, dans la hauteur d'en-tête ordinaire : l'année en haut (bande
  // teintée + libellé), les mois en une lettre en bas. Les traits de trimestre
  // sont plus marqués que ceux des mois, ceux d'année encore davantage.
  enteteAnnees(g, cfg) {
    const finA = Number(cfg.fin.slice(0, 4));
    let idx = 0;
    for (let a = Number(cfg.debut.slice(0, 4)); a <= finA; a += 1, idx += 1) {
      const x1 = Math.max(0, this.x(cfg, a + '-01-01'));
      const x2 = Math.min(cfg.largeur, this.x(cfg, (a + 1) + '-01-01'));
      g.appendChild(svgEl('rect', { x: x1, y: 0, width: Math.max(0, x2 - x1),
        height: this._hEntete,
        class: idx % 2 ? 'zfa-gantt-bande-impaire' : 'zfa-gantt-bande-paire' }));
      if (x2 - x1 > 22) {
        const t = svgEl('text', { x: x1 + 6, y: this._bande - 4,
          class: 'zfa-gantt-entete-annee' });
        t.textContent = String(a);
        g.appendChild(t);
        this._enteteHaut.push({ el: t, x1: x1 + 6, x2 });
      }
      g.appendChild(svgEl('line', { x1, y1: 0, x2: x1, y2: this._hEntete,
        class: 'zfa-gantt-entete-trait-fort' }));
    }
    let ya = Number(cfg.debut.slice(0, 4));
    let m = Math.floor((Number(cfg.debut.slice(5, 7)) - 1) / 3) * 3 + 1;
    while (ya + '-' + String(m).padStart(2, '0') + '-01' <= cfg.fin) {
      const jour = ya + '-' + String(m).padStart(2, '0') + '-01';
      const am = m + 3 > 12 ? ya + 1 : ya;
      const mm = m + 3 > 12 ? m - 9 : m + 3;
      const x1 = Math.max(0, this.x(cfg, jour));
      g.appendChild(svgEl('line', { x1, y1: this._bande, x2: x1, y2: this._hEntete,
        class: 'zfa-gantt-entete-trait-fort' }));
      ya = am; m = mm;
    }
    let mo = cfg.debut.slice(0, 8) + '01';
    while (mo <= cfg.fin) {
      const mm = Number(mo.slice(5, 7));
      const suivant = this.moisSuivant(mo);
      const x1 = Math.max(0, this.x(cfg, mo));
      const x2 = Math.min(cfg.largeur, this.x(cfg, suivant));
      if (x2 - x1 > 7) {
        const t = svgEl('text', { x: x1 + (x2 - x1) / 2, y: this._basEntete,
          class: 'zfa-gantt-entete-mois-lettre' });
        t.textContent = MOIS_LETTRES[mm - 1];
        g.appendChild(t);
      }
      mo = suivant;
    }
  }

  // Vue trimestre : le trimestre occupe l'étage du haut (collant, on le voit
  // en permanence), le mois passe en bas, fixe sur sa colonne.
  enteteTrimestres(g, cfg) {
    let a = Number(cfg.debut.slice(0, 4));
    let m = Math.floor((Number(cfg.debut.slice(5, 7)) - 1) / 3) * 3 + 1;
    while (a + '-' + String(m).padStart(2, '0') + '-01' <= cfg.fin) {
      const jour = a + '-' + String(m).padStart(2, '0') + '-01';
      const am = m + 3 > 12 ? a + 1 : a;
      const mm = m + 3 > 12 ? m - 9 : m + 3;
      const suivant = am + '-' + String(mm).padStart(2, '0') + '-01';
      const x1 = Math.max(0, this.x(cfg, jour));
      const x2 = Math.min(cfg.largeur, this.x(cfg, suivant));
      const t = svgEl('text', { x: x1 + 6, y: this._bande - 5,
        class: 'zfa-gantt-entete-mois' });
      t.textContent = 'T' + (Math.floor((m - 1) / 3) + 1) + ' ' + a;
      g.appendChild(t);
      this._enteteHaut.push({ el: t, x1: x1 + 6, x2 });
      g.appendChild(svgEl('line', { x1, y1: 0, x2: x1, y2: this._hEntete,
        class: 'zfa-gantt-entete-trait-fort' }));
      a = am; m = mm;
    }
    let mo = cfg.debut.slice(0, 8) + '01';
    while (mo <= cfg.fin) {
      const mm = Number(mo.slice(5, 7));
      const suivant = this.moisSuivant(mo);
      const x1 = Math.max(0, this.x(cfg, mo));
      const x2 = Math.min(cfg.largeur, this.x(cfg, suivant));
      if (x2 - x1 > 22) {
        const t = svgEl('text', { x: x1 + (x2 - x1) / 2, y: this._basEntete,
          class: 'zfa-gantt-entete-titre' });
        t.textContent = MOIS_COURTS[mm - 1];
        g.appendChild(t);
      }
      mo = suivant;
    }
  }

  /* ------------------------------ Les barres ----------------------------- */

  //#endregion Frise · grille & en-têtes de temps

  //#region Frise · barres, jalons, flèches, lignage
  dessinerBarres(svg, cfg, lignes) {
    const g = svgEl('g', {});
    // Libellés qui « collent » au bord gauche visible pendant le défilement.
    // Chaque libellé est détouré par la barre : en défilant, il glisse et
    // finit par disparaître dans l'extrémité droite.
    this._etiquettesMobiles = [];
    const defsEt = svgEl('defs', {});
    g.appendChild(defsEt);
    let clipN = 0;
    lignes.forEach((l) => {
      if (l.kind === 'groupe') return;
      const yLigne = l.y;
      g.appendChild(svgEl('rect', { x: 0, y: yLigne, width: cfg.largeur,
        height: l.h, class: 'zfa-gantt-survol' }));
      // Tâche sans date : pas de barre, une bande hachurée. Un glisser y trace
      // la barre (dates posées au relâcher) ; le clic droit garde la saisie par
      // fenêtre ; un simple clic ouvre la note, comme sur une barre.
      if (l.sansDate) {
        const bande = svgEl('rect', { x: 0, y: yLigne + 2, width: cfg.largeur,
          height: Math.max(2, l.h - 4), class: 'zfa-gantt-sansdate-bande',
          fill: 'url(#zfa-gantt-hachures)' });
        bande.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.ouvrirModaleDate(l);
        });
        bande.addEventListener('pointerdown', (e) => this.saisirSansDate(e, l, cfg));
        const bulle = svgEl('title', {});
        bulle.textContent = l.ref + ' · ' + l.intitule + '\n' + tr('sans date') + ' — '
          + tr('glissez pour dater · clic droit pour saisir les dates');
        bande.appendChild(bulle);
        // Accroche pour la lignée : sans dates, la tâche n'a pas de point dans
        // le temps — on la retient au bord gauche VISIBLE de la frise (le
        // calque défile avec le contenu ; _montrerLignage rafraîchit xg).
        l._anc = { xg: 0, xd: cfg.largeur, cy: yLigne + l.h / 2 };
        bande.dataset.ref = l.ref;
        g.appendChild(bande);
        return;
      }
      if (l.jalon) { this.dessinerJalon(g, cfg, l); return; }
      const debut = l.debut || l.echeance;
      const fin = l.echeance || l.debut;
      if (!debut || !fin) return;
      // Une échéance au jour E occupe le jour E : le bord droit tombe donc au
      // début de E+1, faute de quoi une tâche d'un jour n'aurait pas d'épaisseur.
      const x = Math.max(0, this.x(cfg, debut));
      const x2 = Math.min(cfg.largeur, this.x(cfg, Ariane.decalerJour(fin, 1)));
      const w = Math.max(8, x2 - x);
      const geo = this._geo;
      const y = yLigne + geo.marge;
      const h = geo.epaisseur;
      const couleur = this.couleurBarre(l);
      const groupe = svgEl('g', { class: 'zfa-gantt-groupe' });
      groupe.dataset.ref = l.ref;
      if (this._bloquees && this._bloquees.has(l.ref)) groupe.classList.add('zfa-gantt-bloquee');
      else if (this._impactees && this._impactees.has(l.ref)) groupe.classList.add('zfa-gantt-impactee');
      // Points d'accroche pour les liens de lignée (survol).
      l._anc = { xg: x, xd: x + w, cy: y + h / 2 };
      // Géométrie des dates PROPRES (pour recalculer l'enveloppe d'une mère en
      // direct pendant qu'on glisse une fille — voir _apercuAscendants).
      if (l.propre && (l.propre.debut || l.propre.echeance)) {
        const pd = l.propre.debut || l.propre.echeance;
        const pf = l.propre.echeance || l.propre.debut;
        l._ancPropre = {
          xg: Math.max(0, this.x(cfg, pd)),
          xd: Math.min(cfg.largeur, this.x(cfg, Ariane.decalerJour(pf, 1))),
        };
      }
      groupe.addEventListener('pointerenter', () => this._montrerLignage(l.ref));
      groupe.addEventListener('pointerleave', () => this._effacerLignage());

      // Barre « enveloppe » : en mode par défaut, une tâche mère s'étend sur ses
      // filles (fond plus dense). En mode « tri actif » (plat), plus d'agrégat :
      // chaque tâche montre ses propres dates. Le redimensionnement, lui, est
      // toujours permis — il agit sur les dates propres (voir appliquerGeste),
      // que la barre affichée soit l'enveloppe ou non.
      const meta = l.aDesEnfants && !this._plat;
      // Avancement affiché : dérivé (moyenne pondérée des filles) pour une mère,
      // propre pour une feuille.
      const av = (this._avDeriv && this._avDeriv.has(l.ref))
        ? this._avDeriv.get(l.ref) : (Number(l.avancement) || 0);
      const fond = svgEl('rect', {
        x, y, width: w, height: h,
        rx: geo.rayon, ry: geo.rayon,
        class: 'zfa-gantt-barre-tache' + (meta ? ' zfa-gantt-meta' : '') });
      fond.style.fill = couleur;
      fond.style.opacity = meta ? '0.5' : '0.35';
      groupe.appendChild(fond);

      if (av > 0) {
        const rempli = svgEl('rect', { x, y,
          width: Math.max(2, w * Math.min(100, av) / 100), height: h,
          rx: geo.rayon, ry: geo.rayon, class: 'zfa-gantt-rempli' });
        rempli.style.fill = couleur;
        rempli.style.opacity = '0.9';
        groupe.appendChild(rempli);
      }
      // Tâche bloquée (dérivé) : voile hachuré par-dessus la barre.
      if (this._bloquees && this._bloquees.has(l.ref)) {
        groupe.appendChild(svgEl('rect', { x, y, width: w, height: h,
          rx: geo.rayon, ry: geo.rayon, class: 'zfa-gantt-bloquee-voile',
          fill: 'url(#zfa-gantt-hachures)' }));
      }
      // Tâche en retard (échéance passée, pas terminée) : liseré et pastille « ! »
      // au bord droit de la barre.
      if (this._enRetard && this._enRetard.has(l.ref)) {
        groupe.classList.add('zfa-gantt-retard');
        this._marqueRetard(groupe, Math.min(cfg.largeur - 3, x + w), y - 1);
      }
      // Plus la ligne est haute, plus la barre en dit. À une ligne, l'intitulé
      // seul ; à deux, les dates ; à trois, le statut et l'avancement. On
      // n'écrit jamais ce qui ne tient pas, la troncature étant plus pénible
      // qu'une information absente.
      if (w > 55) {
        const textes = [l.intitule];
        if (geo.lignes >= 2) textes.push(debut + '  →  ' + fin);
        if (geo.lignes >= 3) {
          textes.push(l.statut + (av ? '  ·  ' + av + ' %' : ''));
        }
        const hauteurTexte = 13;
        const depart = y + h / 2 - ((textes.length - 1) * hauteurTexte) / 2;
        const clipId = 'zfa-et-clip-' + (clipN += 1);
        const cp = svgEl('clipPath', { id: clipId });
        cp.appendChild(svgEl('rect', { x, y, width: w, height: h }));
        defsEt.appendChild(cp);
        const grpEt = svgEl('g', { 'clip-path': 'url(#' + clipId + ')' });
        groupe.appendChild(grpEt);
        textes.forEach((texte, i) => {
          const max = Math.max(4, Math.floor((w - 18) / (i ? 6.4 : 7.2)));
          if (texte.length > max && i) return;
          const t = svgEl('text', { x: x + 9, y: depart + i * hauteurTexte,
            class: 'zfa-gantt-etiquette' + (i ? ' zfa-gantt-etiquette-menue' : '') });
          const contenu = texte.length > max ? texte.slice(0, max - 1) + '…' : texte;
          t.textContent = contenu;
          grpEt.appendChild(t);
          this._etiquettesMobiles.push({ el: t, x1: x + 9, x2: x + w });
          // Intitulé tronqué : au survol, le texte complet défile dans la barre.
          if (i === 0 && contenu !== texte) {
            this._survolDefile(groupe, t, contenu, texte, w - 18);
          }
        });
      }
      const bulle = svgEl('title', {});
      bulle.textContent = l.ref + ' · ' + l.intitule + '\n' + debut + ' → ' + fin
        + (av ? '  ·  ' + av + ' %' : '')
        + (this._bloquees && this._bloquees.has(l.ref) ? '\n' + tr('bloquée')
          : this._impactees && this._impactees.has(l.ref) ? '\n' + tr('impactée') : '');
      groupe.appendChild(bulle);

      fond.addEventListener('pointerdown', (e) => this.saisir(e, groupe, l, 'deplacer', { x, w }));
      groupe.addEventListener('contextmenu', (e) => this.menuTache(e, l));
      // Le glissé « frise → calendrier » part de la ligne de la colonne de
      // gauche (div HTML fiable) ; les barres SVG ne sont plus draggables :
      // saisir() fait preventDefault sur leur pointerdown, le dragstart ne
      // partait jamais, et <g draggable> est de toute façon inerte sous Electron.
      // Poignées de redimensionnement sur toutes les barres, mères comprises :
      // elles éditent les dates propres de la tâche.
      for (const cote of ['gauche', 'droite']) {
        const p = svgEl('rect', {
          x: cote === 'gauche' ? x : x + w - 7, y, width: 7, height: h,
          class: 'zfa-gantt-poignee' });
        p.addEventListener('pointerdown', (ev) => this.saisir(ev, groupe, l, cote, { x, w }));
        groupe.appendChild(p);
      }
      // Pastilles de liaison, hors de la barre pour ne pas gêner l'étirement.
      // On tire depuis celle de droite vers la tâche que l'on veut bloquer.
      for (const [cx, sens] of [[x - 7, -1], [x + w + 7, 1]]) {
        const rond = svgEl('circle', { cx, cy: yLigne + this._H / 2, r: 5,
          class: 'zfa-gantt-connecteur' });
        rond.addEventListener('pointerdown', (ev) => this.tirerLien(ev, l, cx, sens));
        groupe.appendChild(rond);
      }
      g.appendChild(groupe);
    });
    svg.appendChild(g);
  }

  // Tirer un lien d'une barre vers une autre. Le trait suit le pointeur, et
  // c'est la barre sous le pointeur au lâcher qui reçoit le blocage.
  tirerLien(e, ligne, cx, sens) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = this._svg;
    const boite = svg.getBoundingClientRect();
    const cy = Number(e.target.getAttribute('cy'));
    const trait = svgEl('path', { class: 'zfa-gantt-lien-en-cours', d: '' });
    svg.appendChild(trait);
    let cible = null;
    const bouger = (ev) => {
      const px = ev.clientX - boite.left;
      const py = ev.clientY - boite.top;
      trait.setAttribute('d', 'M ' + cx + ' ' + cy + ' C ' + (cx + sens * 40) + ' ' + cy
        + ', ' + (px - sens * 40) + ' ' + py + ', ' + px + ' ' + py);
      // Le document DE LA FENÊTRE de la vue : dans un volet détaché sur un
      // autre écran, le document global est celui de la fenêtre principale,
      // où nos barres n'existent pas — le lien ne trouvait jamais de cible.
      const sous = this._doc().elementFromPoint(ev.clientX, ev.clientY);
      const g = sous && sous.closest
        ? sous.closest('.zfa-gantt-groupe, .zfa-gantt-jalon-groupe') : null;
      const ref = g && g.dataset ? g.dataset.ref : null;
      if (cible && cible !== ref) {
        const anc = svg.querySelector('.zfa-gantt-cible');
        if (anc) anc.classList.remove('zfa-gantt-cible');
      }
      cible = ref && ref !== ligne.ref ? ref : null;
      if (cible && g) g.classList.add('zfa-gantt-cible');
    };
    const lacher = async () => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      trait.remove();
      const marque = svg.querySelector('.zfa-gantt-cible');
      if (marque) marque.classList.remove('zfa-gantt-cible');
      if (!cible) return;
      // Tirer depuis la droite : cette tâche bloque celle qu'on vise.
      // Depuis la gauche : c'est l'inverse, on déclare ce qui la bloque.
      const fait = sens > 0
        ? await this.greffon.creerBlocage(ligne.ref, cible)
        : await this.greffon.creerBlocage(cible, ligne.ref);
      if (fait) this.dessiner();
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  // Le clic droit donne accès à ce qui se règle sans ouvrir la note. Les
  // valeurs proposées sont celles du schéma, pas des inventions du moment.
  menuTache(e, ligne) {
    e.preventDefault();
    e.stopPropagation();
    const m = new obsidian.Menu();
    const tache = (this._taches || []).find((t) => t.ref === ligne.ref) || {};
    const poser = async (champs) => {
      await this.greffon.majTache(ligne.ref, champs);
      this.dessiner();
    };

    m.addItem((i) => i.setTitle(tr('Ouvrir la note')).setIcon('file-text')
      .onClick(() => this.ouvrir(ligne.ref)));
    m.addItem((i) => i.setTitle(tr('Modifier la tâche…')).setIcon('pencil')
      .onClick(() => new ModaleTache(this.app, this.greffon, {
        ref: ligne.ref, apres: () => this.dessiner(),
      }).open()));
    m.addItem((i) => i.setTitle(tr('Découper la tâche (IA)…')).setIcon('list-tree')
      .onClick(() => this.greffon.ouvrirDecoupage(ligne.ref)));
    m.addSeparator();

    for (const st of ['à faire', 'en cours', 'en attente', 'terminée', 'abandonnée']) {
      m.addItem((i) => i.setTitle(tr('Statut : ') + st)
        .setChecked(tache.statut === st)
        .onClick(() => poser({ statut: st })));
    }
    m.addSeparator();

    for (const v of [0, 25, 50, 75, 100]) {
      m.addItem((i) => i.setTitle(tr('Avancement : ') + v + ' %')
        .setChecked(Number(tache.avancement) === v)
        .onClick(() => poser({ avancement: v })));
    }
    m.addSeparator();

    for (const [libelle, valeur] of [[tr('(aucune)'), ''], [tr('basse'), 'basse'],
                                     [tr('moyenne'), 'moyenne'], [tr('haute'), 'haute']]) {
      m.addItem((i) => i.setTitle(tr('Priorité : ') + libelle)
        .setChecked(String(tache.priorite || '') === valeur)
        .onClick(() => poser({ priorite: valeur })));
    }
    m.addSeparator();

    m.addItem((i) => i.setTitle(ligne.jalon ? tr('Redevenir une tâche') : tr('Faire un jalon'))
      .setIcon('diamond')
      .onClick(() => poser(ligne.jalon ? { jalon: false } : { jalon: true, debut: '' })));
    m.addItem((i) => i.setTitle(tr('Retirer les dates')).setIcon('calendar-off')
      .onClick(() => poser({ debut: '', echeance: '' })));

    const bloquants = (tache.bloquePar || []).map((b) => Ariane.refDeLien(b));
    if (bloquants.length) {
      m.addSeparator();
      for (const b of bloquants) {
        const t = (this._taches || []).find((x) => x.ref === b);
        m.addItem((i) => i.setTitle(tr('Retirer le blocage par ') + (t ? t.intitule : b))
          .setIcon('unlink')
          .onClick(async () => {
            await this.greffon.retirerBlocage(b, ligne.ref);
            this.dessiner();
          }));
      }
    }
    m.showAtMouseEvent(e);
  }

  // Pastille « ! » sur fond triangulaire, posée au coin haut-droit d'une barre
  // (ou d'un losange) pour signaler une tâche en retard.
  _marqueRetard(hote, ax, ay) {
    hote.appendChild(svgEl('path', {
      d: 'M ' + ax + ' ' + (ay - 11) + ' L ' + (ax + 6) + ' ' + (ay + 1)
         + ' L ' + (ax - 6) + ' ' + (ay + 1) + ' Z',
      class: 'zfa-gantt-retard-alerte' }));
    const bang = svgEl('text', { x: ax, y: ay, class: 'zfa-gantt-retard-bang' });
    bang.textContent = '!';
    hote.appendChild(bang);
  }

  // Pas de marque visuelle « impactée » sur la frise (demande de Monsieur) :
  // l'état ne se lit qu'au survol (bulle) ; la classe zfa-gantt-impactee
  // reste posée sur le groupe comme crochet de style utilisateur.

  dessinerJalon(g, cfg, l) {
    if (!l.echeance) return;
    const x = this.x(cfg, l.echeance) + cfg.ppj / 2;
    const y = l.y + l.h / 2;
    l._anc = { xg: x - 9, xd: x + 9, cy: y };
    // Tout le jalon (trait, losange, titre) dans un même groupe : c'est lui
    // qu'on translate pendant le glissé.
    const grp = svgEl('g', { class: 'zfa-gantt-jalon-groupe' });
    grp.dataset.ref = l.ref;
    if (this._bloquees && this._bloquees.has(l.ref)) grp.classList.add('zfa-gantt-bloquee');
    else if (this._impactees && this._impactees.has(l.ref)) grp.classList.add('zfa-gantt-impactee');
    grp.appendChild(svgEl('line', { x1: x, y1: this._hEntete, x2: x,
      y2: this._hauteurTotale,
      class: 'zfa-gantt-jalon-trait' }));
    const d = svgEl('path', {
      d: 'M ' + x + ' ' + (y - 9) + ' L ' + (x + 9) + ' ' + y
         + ' L ' + x + ' ' + (y + 9) + ' L ' + (x - 9) + ' ' + y + ' Z',
      class: 'zfa-gantt-losange' });
    d.dataset.ref = l.ref;
    const bulle = svgEl('title', {});
    bulle.textContent = l.ref + ' · ' + l.intitule + '\n' + l.echeance
      + (this._bloquees && this._bloquees.has(l.ref) ? '\n' + tr('bloquée')
        : this._impactees && this._impactees.has(l.ref) ? '\n' + tr('impactée') : '');
    d.appendChild(bulle);
    d.addEventListener('contextmenu', (e) => this.menuTache(e, l));
    d.addEventListener('pointerenter', () => this._montrerLignage(l.ref));
    d.addEventListener('pointerleave', () => this._effacerLignage());
    d.addEventListener('pointerdown', (e) => this.saisirJalon(e, grp, l, x, y));
    grp.appendChild(d);
    // Pastilles de liaison, comme sur une barre : tirer depuis la droite pose
    // « ce jalon bloque… », depuis la gauche « ce jalon est bloqué par… ».
    for (const [cx, sens] of [[x - 16, -1], [x + 16, 1]]) {
      const rond = svgEl('circle', { cx, cy: y, r: 5, class: 'zfa-gantt-connecteur' });
      rond.addEventListener('pointerdown', (ev) => this.tirerLien(ev, l, cx, sens));
      grp.appendChild(rond);
    }
    if (this._enRetard && this._enRetard.has(l.ref)) {
      d.classList.add('zfa-gantt-retard');
      this._marqueRetard(grp, x + 11, y - 6);
    }
    if (cfg.ppj >= 8) {
      const t = svgEl('text', { x: x + 14, y: y + 4, class: 'zfa-gantt-jalon-titre' });
      t.textContent = l.intitule;
      grp.appendChild(t);
    }
    g.appendChild(grp);
  }

  // Glisser un losange de jalon le long de la frise : n'écrit que l'échéance
  // (un jalon n'a pas de durée). Un appui sans mouvement reste un clic qui
  // ouvre la note.
  saisirJalon(e, grp, ligne, x, y) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const ppj = this._cfg.ppj;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let bouge = false;
    grp.classList.add('zfa-gantt-glisse');
    const jours = (ev) => Math.round((ev.clientX - x0) / ppj);
    const bouger = (ev) => {
      if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3) bouge = true;
      const dx = jours(ev) * ppj;
      grp.setAttribute('transform', 'translate(' + dx + ',0)');
      this._bougerFleches(ligne.ref, dx);
      this._bougerLignage(ligne.ref, dx);
      this._apercuAscendants(ligne.ref, x + dx, x + dx);
    };
    const lacher = async (ev) => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      grp.classList.remove('zfa-gantt-glisse');
      const n = jours(ev);
      if (!bouge) {
        this.ouvrir(ligne.ref, ev.metaKey || ev.ctrlKey);
        this.dessiner();
        return;
      }
      if (!n) { this.dessiner(); return; }
      await this.appliquerGeste(ligne, 'jalon', n);
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  dessinerAujourdhui(svg, cfg, aujourdhui) {
    const n = Ariane.ecartJours(cfg.debut, aujourdhui);
    if (n < 0 || n > cfg.jours) return;
    const x = n * cfg.ppj;
    const bas = this._hauteurTotale;
    const g = svgEl('g', {});
    g.appendChild(svgEl('line', { x1: x, y1: this._hEntete, x2: x, y2: bas,
      class: 'zfa-gantt-aujourdhui' }));
    g.appendChild(svgEl('path', {
      d: 'M ' + x + ' ' + (this._hEntete - 1) + ' l 5 -7 l -10 0 z',
      class: 'zfa-gantt-aujourdhui-pointe' }));
    // La date du jour sous la dernière ligne, même couleur que le repère.
    const [aa, mm, jj] = aujourdhui.split('-').map(Number);
    const t = svgEl('text', { x, y: bas + 13, class: 'zfa-gantt-aujourdhui-date' });
    t.textContent = jj + ' ' + (MOIS_COURTS[mm - 1] || '') + ' ' + String(aa).slice(2);
    g.appendChild(t);
    svg.appendChild(g);
  }

  /* ------------------------------ Les flèches ---------------------------- */

  // Dessinées, jamais tracées ici : le canvas seul crée les liens, et un même
  // geste ne doit pas exister à deux endroits.
  dessinerFleches(svg, cfg, lignes) {
    // Première occurrence de chaque tâche (une tâche multi-groupe est dupliquée).
    const parRef = new Map();
    for (const l of lignes) {
      if (l.kind === 'tache' && !parRef.has(l.ref)) parRef.set(l.ref, l);
    }
    const dates = {};
    const aretes = [];
    for (const t of this._taches || []) {
      dates[t.ref] = { debut: t.debut, echeance: t.echeance };
      for (const b of t.bloquePar || []) {
        aretes.push({ de: Ariane.refDeLien(b), vers: t.ref,
          libelle: (String(b).match(/\|(.*)\]\]$/) || [null, ''])[1] });
      }
    }
    const fautives = new Set(Ariane.datesIncoherentes(aretes, dates)
      .map((i) => i.de + ' ' + i.vers));
    const g = svgEl('g', { class: 'zfa-gantt-fleches' });
    // Pas de pointe : une dépendance va toujours du passé vers l'avenir, le
    // sens est implicite. Seul le tracé pointillé compte.
    // Mémorisées pour que le glissé d'une barre les fasse suivre en direct :
    // voir _bougerFleches, appelé depuis saisir.
    this._fleches = [];
    // Comptes de flèches masquées par un groupe replié, par barre visible.
    const masque = this._masqueParGroupe || new Map();
    const badges = new Map(); // ref visible -> { d: {n, groupes:Set}, g: {…} }
    const tallier = (ref, cote, gcle) => {
      let e = badges.get(ref);
      if (!e) { e = { d: null, g: null }; badges.set(ref, e); }
      if (!e[cote]) e[cote] = { n: 0, groupes: new Set() };
      e[cote].n += 1;
      e[cote].groupes.add(gcle);
    };
    for (const a of aretes) {
      const src = parRef.get(a.de);
      const cib = parRef.get(a.vers);
      if (!src && !cib) continue;
      if (!src || !cib) {
        // Un bout est masqué par son groupe : badge du côté des liaisons.
        if (src && !cib && masque.has(a.vers)) tallier(a.de, 'd', masque.get(a.vers));
        else if (cib && !src && masque.has(a.de)) tallier(a.vers, 'g', masque.get(a.de));
        continue;
      }
      const finSrc = src.echeance || src.debut;
      const debCib = cib.debut || cib.echeance;
      if (!finSrc || !debCib) continue;
      // Un jalon n'a pas de bord : le trait part / arrive sur la pointe du
      // losange (centré au milieu du jour de l'échéance, demi-largeur 9).
      const x1 = src.jalon
        ? this.x(cfg, src.echeance) + cfg.ppj / 2 + 9
        : this.x(cfg, Ariane.decalerJour(finSrc, 1));
      const y1 = src.y + src.h / 2;
      const x2 = cib.jalon
        ? this.x(cfg, cib.echeance) + cfg.ppj / 2 - 9
        : this.x(cfg, debCib);
      const y2 = cib.y + cib.h / 2;
      const rouge = fautives.has(a.de + ' ' + a.vers);
      const d = this._cheminFleche(x1, y1, x2, y2);
      // Un groupe : le trait visible plus un trait large invisible qui offre
      // une cible cliquable, une flèche fine étant impossible à viser.
      const grFleche = svgEl('g', { class: 'zfa-gantt-fleche-groupe' });
      grFleche.dataset.de = a.de;
      grFleche.dataset.vers = a.vers;
      const cible = svgEl('path', { d, class: 'zfa-gantt-fleche-cible' });
      const chemin = svgEl('path', { d,
        class: 'zfa-gantt-fleche' + (rouge ? ' zfa-gantt-rouge' : '') });
      grFleche.appendChild(cible);
      grFleche.appendChild(chemin);
      grFleche.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        this.selectionnerFleche(a.de, a.vers, grFleche);
      });
      if (this._flecheSelectionnee && this._flecheSelectionnee.de === a.de
        && this._flecheSelectionnee.vers === a.vers) {
        grFleche.classList.add('est-active');
        // Poignées aux deux bouts : les glisser sur une autre barre repointe
        // la dépendance (retire l'ancienne, pose la nouvelle).
        for (const [px, py, bout] of [[x1, y1, 'de'], [x2, y2, 'vers']]) {
          const p = svgEl('circle', { cx: px, cy: py, r: 5,
            class: 'zfa-gantt-fleche-poignee' });
          p.addEventListener('pointerdown', (ev) => this.repointerFleche(ev, a, bout));
          grFleche.appendChild(p);
        }
      }
      g.appendChild(grFleche);
      let etiquette = null;
      if (a.libelle) {
        etiquette = svgEl('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 4,
          class: 'zfa-gantt-fleche-libelle' });
        etiquette.textContent = a.libelle;
        if (Math.abs(x2 - x1) <= 60) etiquette.style.display = 'none';
        g.appendChild(etiquette);
      }
      this._fleches.push({ de: a.de, vers: a.vers, chemin, cible, groupe: grFleche,
        etiquette, x1, y1, x2, y2 });
    }
    svg.appendChild(g);

    // Position des badges de flèches masquées, dessinés après les barres.
    this._badgesFleches = [];
    for (const [ref, e] of badges) {
      const row = parRef.get(ref);
      if (!row) continue;
      const cy = row.y + row.h / 2;
      if (e.d) {
        const fin = row.echeance || row.debut;
        this._badgesFleches.push({ x: this.x(cfg, Ariane.decalerJour(fin, 1)) + 13,
          y: cy, n: e.d.n, groupes: e.d.groupes });
      }
      if (e.g) {
        const deb = row.debut || row.echeance;
        this._badgesFleches.push({ x: this.x(cfg, deb) - 13, y: cy,
          n: e.g.n, groupes: e.g.groupes });
      }
    }
  }

  // Petits ronds numérotés indiquant, sur une barre, des dépendances dont
  // l'autre bout est dans un groupe replié. Un clic déplie ce(s) groupe(s).
  dessinerBadgesFleches(svg) {
    if (!this._badgesFleches || !this._badgesFleches.length) return;
    const g = svgEl('g', { class: 'zfa-gantt-badges' });
    for (const b of this._badgesFleches) {
      const gr = svgEl('g', { class: 'zfa-gantt-badge-masque' });
      gr.appendChild(svgEl('circle', { cx: b.x, cy: b.y, r: 8 }));
      const t = svgEl('text', { x: b.x, y: b.y + 3 });
      t.textContent = String(b.n);
      gr.appendChild(t);
      const bulle = svgEl('title', {});
      bulle.textContent = b.n + ' ' + tr('flèche(s) vers un groupe replié — cliquer pour déplier');
      gr.appendChild(bulle);
      gr.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        for (const cle of b.groupes) this.replies.delete(cle);
        this.dessiner();
      });
      g.appendChild(gr);
    }
    svg.appendChild(g);
  }

  // Repointe un bout d'une flèche sélectionnée. Le bout opposé reste ancré ;
  // on suit le pointeur, et la barre sous le curseur au lâcher devient la
  // nouvelle extrémité. Retire l'ancienne dépendance, pose la nouvelle.
  repointerFleche(e, arete, bout) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = this._svg;
    const boite = svg.getBoundingClientRect();
    const f = (this._fleches || []).find((x) => x.de === arete.de && x.vers === arete.vers);
    if (!f) return;
    const ancre = bout === 'de' ? { x: f.x2, y: f.y2 } : { x: f.x1, y: f.y1 };
    const autre = bout === 'de' ? arete.vers : arete.de;
    const trait = svgEl('path', { class: 'zfa-gantt-lien-en-cours', d: '' });
    svg.appendChild(trait);
    let cible = null;
    const bouger = (ev) => {
      const px = ev.clientX - boite.left;
      const py = ev.clientY - boite.top;
      const sens = px >= ancre.x ? 1 : -1;
      trait.setAttribute('d', 'M ' + ancre.x + ' ' + ancre.y + ' C '
        + (ancre.x + sens * 40) + ' ' + ancre.y + ', ' + (px - sens * 40) + ' ' + py
        + ', ' + px + ' ' + py);
      const sous = this._doc().elementFromPoint(ev.clientX, ev.clientY);
      const gg = sous && sous.closest ? sous.closest('.zfa-gantt-groupe') : null;
      const ref = gg && gg.dataset ? gg.dataset.ref : null;
      const anc = svg.querySelector('.zfa-gantt-cible');
      if (anc && anc !== gg) anc.classList.remove('zfa-gantt-cible');
      cible = ref && ref !== autre ? ref : null;
      if (cible && gg) gg.classList.add('zfa-gantt-cible');
    };
    const lacher = async () => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      trait.remove();
      const marque = svg.querySelector('.zfa-gantt-cible');
      if (marque) marque.classList.remove('zfa-gantt-cible');
      if (!cible) return;
      const g = this.greffon;
      await g.retirerBlocage(arete.de, arete.vers);
      if (bout === 'de') {
        await g.creerBlocage(cible, arete.vers);
        this._flecheSelectionnee = { de: cible, vers: arete.vers };
      } else {
        await g.creerBlocage(arete.de, cible);
        this._flecheSelectionnee = { de: arete.de, vers: cible };
      }
      this.dessiner();
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  _cheminFleche(x1, y1, x2, y2) { return Ariane._cheminFleche(x1, y1, x2, y2); }

  // Fait suivre en direct, pendant le glissé d'une barre, les flèches qui la
  // touchent : seul le bout accroché à la tâche déplacée bouge, de dx pixels.
  _bougerFleches(ref, dx) {
    for (const f of this._fleches || []) {
      if (f.de !== ref && f.vers !== ref) continue;
      const x1 = f.x1 + (f.de === ref ? dx : 0);
      const x2 = f.x2 + (f.vers === ref ? dx : 0);
      const d = this._cheminFleche(x1, f.y1, x2, f.y2);
      f.chemin.setAttribute('d', d);
      if (f.cible) f.cible.setAttribute('d', d);
      if (f.etiquette) {
        f.etiquette.setAttribute('x', (x1 + x2) / 2);
        f.etiquette.setAttribute('y', (f.y1 + f.y2) / 2 - 4);
        f.etiquette.style.display = Math.abs(x2 - x1) > 60 ? '' : 'none';
      }
    }
  }

  /* ------------------------ Lignée révélée au survol -------------------- */

  // Survol d'une barre : on atténue le reste, on met en valeur la famille
  // entière (ancêtres, sœurs et sous-tâches), reliée par un trait plein.
  // Rien n'est écrit ni permanent : _effacerLignage remet tout en place.
  _montrerLignage(ref) {
    if (this.greffon.settings.friseLignageSurvol === false) return;
    if (!this._svg || (this._lignage && this._lignage.ref === ref)) return;
    // Pas pendant qu'on glisse une barre : le lignage en cours suit déjà.
    if (this._svg.querySelector('.zfa-gantt-glisse')) return;
    const parRef = new Map();
    for (const l of this._lignesRendu || []) {
      if (!parRef.has(l.ref)) parRef.set(l.ref, l); // 1re occurrence (multi-groupe)
    }
    if (!parRef.has(ref)) return;
    // Les tâches sans date sont accrochées au bord gauche VISIBLE de la frise :
    // leur ancre suit le défilement, on la rafraîchit à chaque survol.
    const gxBord = this._droite ? this._droite.scrollLeft : 0;
    for (const l of parRef.values()) {
      if (l.sansDate && l._anc) l._anc.xg = gxBord;
    }
    // Lignée = la famille entière (Ariane.ligneeDe) : que l'on survole la
    // mère ou une fille, le trait se pose sur toutes les filles.
    const lignee = Ariane.ligneeDe(ref, parRef);
    // Ni parent ni enfant : on ne fait presque rien, juste un léger focus.
    if (lignee.size < 2) {
      const seul = this._elLignee(ref);
      if (seul) seul.classList.add('zfa-gantt-lignee-focus');
      this._lignage = { ref, gl: null, brackets: [] };
      return;
    }
    this._svg.classList.add('zfa-gantt-lignage-actif');
    for (const r of lignee) {
      const el = this._elLignee(r);
      if (el) el.classList.add(r === ref ? 'zfa-gantt-lignee-focus' : 'zfa-gantt-lignee');
    }
    // Liens parent -> enfants en accolade : une épine verticale dégagée à
    // gauche des barres (géométrie dans Ariane._cheminAccolade), la mère et
    // chaque fille raccordées AU CENTRE de l'extrémité gauche de leur barre.
    // Un bracket par parent présent dans la lignée.
    const gl = svgEl('g', { class: 'zfa-gantt-lignage' });
    const DEGAGE = 7; // écart latéral entre l'épine et le début des barres
    const parParent = new Map();
    for (const r of lignee) {
      const l = parRef.get(r);
      if (!l || !l.parent || !lignee.has(l.parent)) continue;
      const p = parRef.get(l.parent);
      if (!p || !p._anc || !l._anc) continue;
      if (!parParent.has(l.parent)) parParent.set(l.parent, []);
      parParent.get(l.parent).push(r);
    }
    const brackets = [];
    for (const [pr, kidsRefs] of parParent) {
      const p = parRef.get(pr);
      const kids = kidsRefs.map((kr) => ({
        ref: kr, xg: parRef.get(kr)._anc.xg, cy: parRef.get(kr)._anc.cy,
        sansDate: !!parRef.get(kr).sansDate,
      }));
      const b = { parentRef: pr, mx: p._anc.xg, pCy: p._anc.cy,
        kids, degage: DEGAGE };
      const path = svgEl('path', { d: this._cheminBracket(b, 0, null),
        class: 'zfa-gantt-lignage-lien' });
      gl.appendChild(path);
      b.path = path;
      // Nœuds de jonction : à chaque angle son point, et la connexion se lit
      // aussi SUR la barre. Trois familles : celui de la mère à son propre
      // raccordement (centre de son bord gauche) ; un sur l'épine au sommet
      // de l'angle de chaque fille ; un à l'arrivée, au centre du bord gauche
      // de la barre fille, pour que le trait se pose visiblement sur elle.
      const sx = Ariane._epineAccolade(b, 0, null);
      const points = [[b.mx, b.pCy, { surLaMere: true }]];
      for (const k of kids) {
        points.push([sx, k.cy, { surRail: true }]);
        points.push([k.xg, k.cy, { ref: k.ref, xg: k.xg }]);
      }
      b.dots = points.map((pt) => {
        const c = svgEl('circle', { cx: pt[0], cy: pt[1], r: 2.4,
          class: 'zfa-gantt-lignage-noeud' });
        gl.appendChild(c);
        return Object.assign({ el: c }, pt[2]);
      });
      brackets.push(b);
    }
    (this._svgLignage || this._svg).appendChild(gl);
    this._lignage = { ref, gl, brackets };
  }

  // `d` de l'accolade de lignée : géométrie pure dans Ariane._cheminAccolade
  // (éprouvée hors d'Obsidian par les tests).
  _cheminBracket(b, dx, refBouge) {
    return Ariane._cheminAccolade(b, dx, refBouge);
  }

  _elLignee(ref) {
    return this._svg.querySelector(
      '.zfa-gantt-groupe[data-ref="' + ref + '"], .zfa-gantt-losange[data-ref="' + ref + '"]'
      + ', .zfa-gantt-sansdate-bande[data-ref="' + ref + '"]');
  }

  _effacerLignage() {
    if (!this._svg || !this._lignage) return;
    // Pendant le glissé d'une barre reliée, on garde la lignée affichée : ses
    // traits suivent le mouvement (voir _bougerLignage). Le lâcher redessine.
    if (this._svg.querySelector('.zfa-gantt-glisse')) return;
    if (this._lignage.gl) this._lignage.gl.remove();
    this._svg.classList.remove('zfa-gantt-lignage-actif');
    for (const el of this._svg.querySelectorAll('.zfa-gantt-lignee, .zfa-gantt-lignee-focus')) {
      el.classList.remove('zfa-gantt-lignee', 'zfa-gantt-lignee-focus');
    }
    this._lignage = null;
  }

  // Fait suivre les accolades de lignée quand on glisse une des barres reliées.
  _bougerLignage(ref, dx) {
    if (!this._lignage || !this._lignage.brackets) return;
    for (const b of this._lignage.brackets) {
      if (b.parentRef !== ref && !b.kids.some((k) => k.ref === ref)) continue;
      b.path.setAttribute('d', this._cheminBracket(b, dx, ref));
      const sx = Ariane._epineAccolade(b, dx, ref);
      for (const dot of b.dots || []) {
        // La mère ne bouge pas pendant un glissé de fille ; le point d'épine
        // suit le rail (sx bouge) ; celui d'arrivée suit SA barre, et elle
        // seule — les autres filles restent en place.
        if (dot.surLaMere) dot.el.setAttribute('cx', b.mx);
        else if (dot.ref) {
          dot.el.setAttribute('cx', dot.xg + (dot.ref === ref ? (dx || 0) : 0));
        } else dot.el.setAttribute('cx', sx);
      }
    }
  }

  // Aperçu en direct : pendant qu'on glisse ou étire une barre, l'enveloppe de
  // chaque mère au-dessus se redessine pour rester l'union de ses dates propres
  // et de ses filles. `xgProv`/`xdProv` : géométrie provisoire de la barre tirée.
  // Le lâcher redessine tout ; c'est purement visuel.
  _apercuAscendants(refDrag, xgProv, xdProv) {
    if (!this._svg || !this._lignesRendu) return;
    const parRef = new Map();
    for (const l of this._lignesRendu) if (!parRef.has(l.ref)) parRef.set(l.ref, l);
    const geoProv = new Map([[refDrag, { xg: xgProv, xd: xdProv }]]);
    const vus = new Set([refDrag]);
    let ref = (parRef.get(refDrag) || {}).parent;
    while (ref && parRef.has(ref) && !vus.has(ref)) {
      vus.add(ref);
      const mere = parRef.get(ref);
      let xg = mere._ancPropre ? mere._ancPropre.xg : Infinity;
      let xd = mere._ancPropre ? mere._ancPropre.xd : -Infinity;
      for (const k of this._lignesRendu) {
        // Une fille sans date n'a pas de dates : elle ne participe pas à
        // l'enveloppe de sa mère.
        if (k.parent !== ref || k.sansDate) continue;
        const g = geoProv.get(k.ref) || (k._anc ? { xg: k._anc.xg, xd: k._anc.xd } : null);
        if (!g) continue;
        if (g.xg < xg) xg = g.xg;
        if (g.xd > xd) xd = g.xd;
      }
      if (!isFinite(xg) || !isFinite(xd) || xd <= xg) break;
      geoProv.set(ref, { xg, xd });
      const gEl = this._svg.querySelector('.zfa-gantt-groupe[data-ref="' + ref + '"]');
      const fond = gEl && gEl.querySelector('.zfa-gantt-barre-tache');
      if (fond) { fond.setAttribute('x', xg); fond.setAttribute('width', xd - xg); }
      ref = mere.parent;
    }
  }

  /* ------------------------------- Les gestes ---------------------------- */

  // Un seul geste, trois modes. L'écriture n'a lieu qu'au lâcher : écrire
  // pendant le glissé ferait cent passes de frontmatter pour un déplacement.
  //#endregion Frise · barres, jalons, flèches, lignage

  //#region Frise · gestes d'édition
  saisir(e, groupe, ligne, mode, geo) {
    // Seul le bouton principal saisit. Sans ce garde-fou, un clic droit
    // installait le glissé, et comme le menu contextuel avale le relâchement,
    // la barre suivait ensuite la souris sans qu'on ait rien demandé.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const ppj = this._cfg.ppj;
    const x0 = e.clientX;
    const fond = groupe.querySelector('.zfa-gantt-barre-tache');
    const rempli = groupe.querySelector('.zfa-gantt-rempli');
    groupe.classList.add('zfa-gantt-glisse');
    const y0 = e.clientY;
    let bouge = false;
    const jours = (ev) => Math.round((ev.clientX - x0) / ppj);
    const bouger = (ev) => {
      if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3) bouge = true;
      const d = jours(ev) * ppj;
      if (mode === 'deplacer') {
        groupe.setAttribute('transform', 'translate(' + d + ',0)');
        this._bougerFleches(ligne.ref, d);
        this._bougerLignage(ligne.ref, d);
        this._apercuAscendants(ligne.ref, geo.x + d, geo.x + geo.w + d);
      } else if (mode === 'gauche') {
        const w = Math.max(ppj, geo.w - d);
        const nx = geo.x + geo.w - w;
        fond.setAttribute('x', nx);
        fond.setAttribute('width', w);
        if (rempli) rempli.setAttribute('x', nx);
        this._apercuAscendants(ligne.ref, nx, nx + w);
        this._guideEtir(nx, 'gauche');
      } else {
        const w = Math.max(ppj, geo.w + d);
        fond.setAttribute('width', w);
        this._apercuAscendants(ligne.ref, geo.x, geo.x + w);
        this._guideEtir(geo.x + w, 'droite');
      }
    };
    const lacher = async (ev) => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      this._effacerGuideEtir();
      groupe.classList.remove('zfa-gantt-glisse');
      const n = jours(ev);
      // Un appui qui n'a pas bougé est un clic, et un clic sur une barre ouvre
      // la note : c'est ce qu'on attend d'une barre, et il ne se passait rien.
      if (!bouge && mode === 'deplacer') {
        this.ouvrir(ligne.ref, ev.metaKey || ev.ctrlKey);
        this.dessiner();
        return;
      }
      if (!n) { this.dessiner(); return; }
      await this.appliquerGeste(ligne, mode, n);
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  // Glisser sur la bande hachurée d'une tâche sans date : un aperçu de barre
  // suit la souris, du jour d'appui au jour visé (guide d'étirement sur le bord
  // qui bouge) ; au relâcher, la tâche est datée — début = premier jour,
  // échéance = dernier. Un appui immobile reste un clic et ouvre la note, comme
  // sur une barre. Même cheminement d'écriture qu'appliquerGeste (ascendants
  // étendus, annulation posée, dates anticipées).
  saisirSansDate(e, ligne, cfg) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = this._svg;
    if (!svg) return;
    const ppj = cfg.ppj;
    const x0 = e.clientX;
    const y0 = e.clientY;
    // Jour sous le pointeur : la bande vit dans l'espace du SVG, qui défile
    // avec le contenu — rect.left est déjà décalé du défilement.
    const jourDe = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(Math.round(cfg.largeur / ppj) - 1,
        Math.floor((clientX - rect.left) / ppj)));
      return Ariane.decalerJour(cfg.debut, i);
    };
    let apercu = null;
    let bouge = false;
    const tracer = (d1, d2) => {
      const x1 = Math.max(0, this.x(cfg, d1));
      const x2 = Math.min(cfg.largeur, this.x(cfg, Ariane.decalerJour(d2, 1)));
      const geo = this._geo;
      if (!apercu) {
        apercu = svgEl('rect', { class: 'zfa-gantt-apercu-cree',
          rx: geo.rayon, ry: geo.rayon });
        svg.appendChild(apercu);
      }
      apercu.setAttribute('x', Math.min(x1, x2));
      apercu.setAttribute('width', Math.max(ppj, Math.abs(x2 - x1)));
      apercu.setAttribute('y', (ligne.y || 0) + geo.marge);
      apercu.setAttribute('height', geo.epaisseur);
      return { x1, x2 };
    };
    const bouger = (ev) => {
      if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3) bouge = true;
      if (!bouge) return;
      const a = jourDe(x0);
      const b = jourDe(ev.clientX);
      if (!a || !b) return;
      const { x1, x2 } = tracer(a < b ? a : b, a < b ? b : a);
      // Le guide suit le bord qui bouge, comme pour l'étirement d'une barre.
      if (a < b) this._guideEtir(x2, 'droite'); else this._guideEtir(x1, 'gauche');
    };
    const lacher = async (ev) => {
      this._doc().removeEventListener('pointermove', bouger);
      this._doc().removeEventListener('pointerup', lacher);
      this._effacerGuideEtir();
      if (apercu) { apercu.remove(); apercu = null; }
      if (!bouge) {
        this.ouvrir(ligne.ref, ev.metaKey || ev.ctrlKey);
        this.dessiner();
        return;
      }
      const a = jourDe(x0);
      const b = jourDe(ev.clientX);
      const debut = a && b && a < b ? a : b;
      const echeance = a && b && a < b ? b : a;
      if (!debut || !echeance) { this.dessiner(); return; }
      const changements = [{ ref: ligne.ref, debut, echeance }];
      this._etendreAscendants(ligne, changements);
      // État d'avant (dates PROPRES de chaque tâche touchée), pour l'annulation.
      const avant = changements.map((c) => {
        const l = (this._lignes || []).find((x) => x.ref === c.ref);
        const p = (l && l.propre) || {};
        return { ref: c.ref, debut: p.debut || '', echeance: p.echeance || '' };
      });
      const ecrites = await this.greffon.ecrireDatesTaches(changements);
      if (!ecrites) { this.dessiner(); return; }
      if (this.racine && this.racine.focus) this.racine.focus({ preventScroll: true });
      if (!this._enAttente) this._enAttente = new Map();
      for (const c of changements) {
        this._enAttente.set(c.ref, { debut: c.debut || '', echeance: c.echeance || '' });
      }
      poserAnnulation(this, async () => {
        await this.greffon.ecrireDatesTaches(avant);
        if (!this._enAttente) this._enAttente = new Map();
        for (const c of avant) this._enAttente.set(c.ref, { debut: c.debut, echeance: c.echeance });
        this._cascade = null;
        this.dessiner();
      }, async () => {
        await this.greffon.ecrireDatesTaches(changements);
        if (!this._enAttente) this._enAttente = new Map();
        for (const c of changements) this._enAttente.set(c.ref, { debut: c.debut, echeance: c.echeance });
        this._cascade = null;
        this.dessiner();
      });
      this.dessiner();
    };
    this._doc().addEventListener('pointermove', bouger);
    this._doc().addEventListener('pointerup', lacher);
  }

  // Pendant l'étirement d'une barre (poignées gauche / droite) : un guide
  // vertical en pointillé suit le bord tiré, de la barre jusqu'à l'en-tête des
  // dates, et la colonne du jour visé s'allume dans cet en-tête.
  _guideEtir(x, cote) {
    const svg = this._svg;
    if (!svg) return;
    if (!this._guideEtirElems) {
      const ligne = svgEl('line', { y1: 0, class: 'zfa-gantt-guide-etir' });
      const jour = svgEl('rect', { y: 0, height: this._hEntete,
        class: 'zfa-gantt-guide-jour' });
      svg.appendChild(ligne);
      svg.appendChild(jour);
      this._guideEtirElems = { ligne, jour };
    }
    const e = this._guideEtirElems;
    e.ligne.setAttribute('x1', x);
    e.ligne.setAttribute('x2', x);
    e.ligne.setAttribute('y2', this._hauteurTotale);
    const i = Ariane.colonneGuideEtir(x, this._cfg.ppj, cote);
    e.jour.setAttribute('x', i * this._cfg.ppj);
    e.jour.setAttribute('width', this._cfg.ppj);
  }

  _effacerGuideEtir() {
    if (!this._guideEtirElems) return;
    this._guideEtirElems.ligne.remove();
    this._guideEtirElems.jour.remove();
    this._guideEtirElems = null;
  }

  // Une fille sortie des bornes de sa mère fait s'étendre la mère (dates
  // propres réécrites), puis la grand-mère, etc.
  _etendreAscendants(ligne, changements) {
    const bougee = changements.find((c) => c.ref === ligne.ref) || changements[0];
    if (!bougee) return;
    for (const ch of Ariane.datesAscendants(this._lignes, ligne.parent,
      { debut: bougee.debut || '', echeance: bougee.echeance || '' })) {
      changements.push(ch);
    }
  }

  async appliquerGeste(ligne, mode, n) {
    const J = Ariane;
    let changements;
    if (mode === 'deplacer') {
      changements = J.decalerSousArbre(this._lignes, ligne.ref, n);
    } else if (mode === 'jalon') {
      changements = [{ ref: ligne.ref, debut: '', echeance: J.decalerJour(ligne.echeance, n) }];
    } else if (mode === 'gauche') {
      const fin = ligne.propre.echeance || ligne.propre.debut;
      let debut = J.decalerJour(ligne.propre.debut || fin, n);
      if (debut && fin && debut > fin) debut = fin;
      changements = [{ ref: ligne.ref, debut, echeance: fin }];
    } else {
      const debut = ligne.propre.debut || ligne.propre.echeance;
      let fin = J.decalerJour(ligne.propre.echeance || debut, n);
      if (fin && debut && fin < debut) fin = debut;
      changements = [{ ref: ligne.ref, debut, echeance: fin }];
    }
    this._etendreAscendants(ligne, changements);
    // État d'avant (dates PROPRES de chaque tâche touchée), pour l'annulation.
    const avant = changements.map((c) => {
      const l = (this._lignes || []).find((x) => x.ref === c.ref);
      const p = (l && l.propre) || {};
      return { ref: c.ref, debut: p.debut || '', echeance: p.echeance || '' };
    });
    const ecrites = await this.greffon.ecrireDatesTaches(changements);
    if (!ecrites) { this.dessiner(); return; }
    if (this.racine && this.racine.focus) this.racine.focus({ preventScroll: true });
    if (!this._enAttente) this._enAttente = new Map();
    for (const c of changements) {
      this._enAttente.set(c.ref, { debut: c.debut || '', echeance: c.echeance || '' });
    }
    poserAnnulation(this, async () => {
      await this.greffon.ecrireDatesTaches(avant);
      if (!this._enAttente) this._enAttente = new Map();
      for (const a of avant) this._enAttente.set(a.ref, { debut: a.debut, echeance: a.echeance });
      this._cascade = null;
      this.dessiner();
    }, async () => {
      await this.greffon.ecrireDatesTaches(changements);
      if (!this._enAttente) this._enAttente = new Map();
      for (const c of changements) this._enAttente.set(c.ref, { debut: c.debut, echeance: c.echeance });
      this._cascade = null;
      this.dessiner();
    });
    this.proposerCascade(ligne.ref, n);
    this.dessiner();
  }

  // Après un décalage qui contredit un blocage, on ne corrige rien d'office :
  // propager un retard est une décision, pas une conséquence.
  proposerCascade(ref, n) {
    const bloquants = [];
    const dates = {};
    for (const t of this.greffon.tachesPourGantt()) {
      dates[t.ref] = { debut: t.debut, echeance: t.echeance };
      for (const b of t.bloquePar || []) {
        bloquants.push({ de: Ariane.refDeLien(b), vers: t.ref });
      }
    }
    const fautives = Ariane.datesIncoherentes(bloquants, dates)
      .filter((i) => i.de === ref || i.vers === ref);
    this._cascade = fautives.length ? { ref, jours: n, bloquants } : null;
  }

  detruire() {
    if (this._colPop) { this._colPop.remove(); this._colPop = null; }
    if (this._ioFrise) { try { this._ioFrise.disconnect(); } catch (e) { /* rien */ } this._ioFrise = null; }
    if (this._surTouche) this.racine.removeEventListener('keydown', this._surTouche);
    clearTimeout(this._minSauveJour);
    this.racine.empty();
  }
  //#endregion Frise · gestes d'édition
}

