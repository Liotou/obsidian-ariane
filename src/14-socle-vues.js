//#region 14 · Socle des vues
// ═══════════════════════════════════════════════════════════════════════════
//  14 · SOCLE DES VUES
//  Ce que frise et calendrier partagent : identifiants de vue, réglages par
//  défaut de chaque vue de base, svgEl, pile d'annulation et de
//  rétablissement, et la classe MoteurVue dont les deux moteurs héritent.
// ═══════════════════════════════════════════════════════════════════════════

const TYPE_VUE_REFS = 'zfa-references';
const TYPE_VUE_INCOHERENCES = 'zfa-taches-incoherences';
const TYPE_VUE_CHRONOLOGIE = 'ariane-chronologie';
const TYPE_VUE_RELECTURE = 'zfa-relecture';
const TYPE_VUE_BASE_FRISE = 'ariane-frise';
// L'ancienne vue « Graphe », retirée : son identifiant ne sert plus qu'à
// retrouver ses traces dans les .base pour les convertir en canevas.
const TYPE_VUE_BASE_ARTIC = 'ariane-articulation';
const TYPE_VUE_BASE_CALENDRIER = 'ariane-calendrier';

// Valeurs par défaut des réglages d'une frise de base. Ils ne passent plus par
// les réglages d'Ariane : chaque vue d'une base porte les siens.
const DEFAUTS_FRISE = {
  zoom: 'mois', libelleSemaine: 'numero',
  tri: 'date', rowHeight: 'medium', columnSize: null,
  triColonne: null, triColonneSens: 1,
};

// Valeurs par défaut des réglages d'une vue calendrier de base.
const DEFAUTS_CALENDRIER = {
  calMode: 'mois',
  calHeureDebut: '07:00',
  calHeureFin: '21:00',
  calPxHeure: 42,   // hauteur d'une heure en vue semaine (zoom)
  calBandeauH: 66,  // hauteur du bandeau « journée entière » (poignée, vue semaine)
  // Familles de tâches décochées dans le menu « Calendriers à afficher » :
  // leur contenu (créneaux, jalons, cartes journée) ne se dessine pas.
  calCalendriersMasques: [],
  // Colonne des créneaux réels (ActivityWatch) en vue semaine.
  calActiviteReelle: true,
};

function svgEl(nom, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', nom);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  return e;
}

// Annulation et rétablissement partagés par la frise et le
// calendrier : chaque geste qui écrit pousse une PAIRE de fonctions — `annule`
// revient à l'état d'avant, `retablit` rejoue le geste. Ctrl/⌘+Z (sans Maj)
// annule ; ⌘⇧Z ou Ctrl+Y rétablit. Deux piles locales au moteur (survivent aux
// redessins, pas à la fermeture de la vue) ; un geste neuf vide le rétablir.
function _toucheAnnuler(e) {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
    && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ');
}
function _toucheRetablir(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  if (e.key === 'y' || e.key === 'Y' || e.code === 'KeyY') return true;
  return e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ');
}
function poserAnnulation(moteur, fn, fr) {
  (moteur._undo || (moteur._undo = [])).push({ annule: fn, retablit: fr });
  if (moteur._undo.length > 60) moteur._undo.shift();
  moteur._redo = [];
}
async function annulerDernier(moteur) {
  const e = moteur._undo && moteur._undo.pop();
  if (!e) return;
  (moteur._redo || (moteur._redo = [])).push(e);
  try { await e.annule(); } catch (err) { console.error('[Ariane] annulation :', err); }
}
async function refaireDernier(moteur) {
  const e = moteur._redo && moteur._redo.pop();
  if (!e || !e.retablit) return;
  (moteur._undo || (moteur._undo = [])).push(e);
  try { await e.retablit(); } catch (err) { console.error('[Ariane] rétablissement :', err); }
}

// ── Icônes des vues de base ────────────────────────────────────────────────
// Obsidian n'attache qu'une icône par TYPE de vue : toutes les vues « tableau »
// d'une base portent donc la même. Le code du noyau la lit sur l'inscription du
// greffon (« lucide-table » à défaut) au moment de dessiner la barre d'outils
// et le menu des vues. Pour en donner une à chaque vue nommée, il faut la poser
// après lui : d'où l'observateur ci-dessous, qui repeint ce qu'Obsidian vient
// de dessiner. Rien n'est écrit dans le fichier .base, qui reste au noyau.

// La clé d'un réglage d'icône : la base et le nom de la vue.
function basesCleIcone(chemin, nom) {
  return String(chemin || '') + '::' + String(nom || '').trim();
}

// Le nom lucide que porte une icône déjà dessinée, pour savoir la remettre.
function basesIconeOrigine(el) {
  const svg = el && el.querySelector ? el.querySelector('svg') : null;
  const classe = svg ? String(svg.getAttribute('class') || '') : '';
  const m = /lucide-[a-z0-9-]+/.exec(classe);
  return m ? m[0] : '';
}

// L'icône « nom » est-elle bien celle que montre l'élément ? Une icône Lucide
// porte la classe « lucide-nom », une icône ajoutée par un greffon la classe
// « nom » ; un emoji est le texte même de l'élément.
function basesIconePresente(el, nom) {
  if (!el || !nom) return false;
  if (!/^[a-z0-9-]+$/.test(nom)) return el.textContent === nom;
  const svg = el.querySelector ? el.querySelector('svg') : null;
  return !!(svg && svg.classList && (svg.classList.contains('lucide-' + nom) || svg.classList.contains(nom)));
}

// Un élément de menu qui désigne bien une VUE. Le même habillage sert aux
// propriétés (qui portent une case à cocher) et aux formules (qui affichent
// une valeur) : sans ce tri, une propriété homonyme d'une vue changerait
// d'icône elle aussi.
function basesEstItemVue(item) {
  if (!item || !item.querySelector) return false;
  if (item.querySelector('input[type="checkbox"]')) return false;
  if (item.querySelector('.bases-toolbar-menu-item-value')) return false;
  return true;
}

// L'identifiant d'icône que range Iconize, rendu au vocabulaire d'Obsidian.
// Son jeu Lucide s'écrit « LiBookTemplate » ; les emojis se posent tels quels ;
// les autres jeux (Font Awesome, Remix…) ne se dessinent pas avec setIcon, on
// les laisse donc à Iconize plutôt que d'afficher un carré vide.
function basesIconeIconize(valeur) {
  const v = String(valeur || '').trim();
  if (!v) return '';
  const m = /^Li([A-Z][A-Za-z0-9]*)$/.exec(v);
  if (m) {
    return m[1]
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
  }
  return /^\p{Extended_Pictographic}/u.test(v) ? v : '';
}

// L'icône d'un dossier, ou à défaut celle du dossier qui le contient : une
// vue sur « 04 - Livrables/Comptes-rendus de réunions » reprend ainsi l'icône
// de « 04 - Livrables », comme le fait l'explorateur de fichiers à l'oeil.
function basesIconeDeDossier(table, dossier) {
  let d = String(dossier || '');
  while (d) {
    const ic = basesIconeIconize((table || {})[d]);
    if (ic) return ic;
    const i = d.lastIndexOf('/');
    if (i < 0) break;
    d = d.slice(0, i);
  }
  return '';
}

// Les dossiers qu'un filtre de base désigne. Les filtres s'imbriquent en
// and / or / not ; seules les chaînes portent un chemin, on les ramasse
// toutes sans se soucier de la logique : il ne s'agit que de deviner à quel
// dossier une vue se rapporte, pas de rejouer le filtre.
function basesDossiersDepuisFiltres(filtres) {
  const trouves = [];
  const visiter = (n) => {
    if (!n) return;
    if (Array.isArray(n)) { n.forEach(visiter); return; }
    if (typeof n === 'object') { Object.values(n).forEach(visiter); return; }
    if (typeof n !== 'string') return;
    const motifs = [
      /file\.folder\s*==\s*"([^"]+)"/g,
      /file\.folder\.startsWith\(\s*"([^"]+)"/g,
      /file\.path\.startsWith\(\s*"([^"]+)"/g,
      /file\.inFolder\(\s*"([^"]+)"/g,
    ];
    for (const re of motifs) {
      let m;
      while ((m = re.exec(n)) !== null) {
        const d = m[1].replace(/\/+$/, '');
        if (d && !trouves.includes(d)) trouves.push(d);
      }
    }
  };
  visiter(filtres);
  return trouves;
}

class IconesVuesBases extends obsidian.Component {
  constructor(greffon) {
    super();
    this.greffon = greffon;
    this.observateurs = new Map();
    this.baseDuMenu = '';         // la base dont on vient d'ouvrir le menu des vues
    this.iconesDossiers = {};     // ce qu'Iconize a retenu, par chemin
    this.iconizeLu = 0;           // horodatage de cette lecture
    this.basesConnues = new Map();// chemin de base -> dossiers, par vue
    this.basesEnCours = new Set();// lectures en vol, pour ne pas les doubler
    this.iconizeEtat = '';        // ce que la dernière lecture d'Iconize a donné
    this.vuesPeintes = 0;         // ce que la dernière passe a vu, pour le diagnostic
  }

  onload() {
    const espace = this.greffon.app.workspace;
    this.suivre(document);
    this.registerEvent(espace.on('window-open', (_, fenetre) => {
      if (fenetre && fenetre.document) this.suivre(fenetre.document);
    }));
    this.registerEvent(espace.on('window-close', (_, fenetre) => {
      if (fenetre && fenetre.document) this.oublier(fenetre.document);
    }));
    // Le fichier .base dit à quel dossier chaque vue se rapporte : il faut
    // donc le relire quand il change.
    this.registerEvent(this.greffon.app.vault.on('modify', (f) => {
      if (f && f.extension === 'base') this.basesConnues.delete(f.path);
    }));
    espace.onLayoutReady(() => { this.lireIconize(); this.peindre(document); });
  }

  onunload() {
    for (const doc of Array.from(this.observateurs.keys())) this.oublier(doc);
  }

  suivre(doc) {
    if (!doc || !doc.body || this.observateurs.has(doc)) return;
    const fenetre = doc.defaultView || window;
    let attendu = false;
    const obs = new fenetre.MutationObserver(() => {
      if (attendu) return;
      attendu = true;
      fenetre.requestAnimationFrame(() => { attendu = false; this.peindre(doc); });
    });
    obs.observe(doc.body, { childList: true, subtree: true });
    // Un seul écouteur pour tout le document : les barres d'outils et les
    // menus sont redessinés sans cesse, y accrocher des écouteurs un par un
    // reviendrait à les empiler.
    const surContexte = (e) => this.surClicDroit(e);
    doc.addEventListener('contextmenu', surContexte, true);
    // Le menu des vues flotte hors du volet : sa base est celle de la barre
    // sur laquelle on a cliqué pour l'ouvrir. On la retient au moment du
    // geste, avant que le menu ne se dessine.
    const surPointe = (e) => {
      const barre = e.target && e.target.closest ? e.target.closest('.bases-toolbar-views-menu') : null;
      if (barre) this.baseDuMenu = this.cheminDe(barre) || this.baseActive();
    };
    doc.addEventListener('pointerdown', surPointe, true);
    this.observateurs.set(doc, { obs, surContexte, surPointe, doc });
    this.peindre(doc);
  }

  oublier(doc) {
    const suivi = this.observateurs.get(doc);
    if (suivi) {
      try { suivi.obs.disconnect(); } catch (e) { /* fenêtre partie */ }
      try { doc.removeEventListener('contextmenu', suivi.surContexte, true); } catch (e) { /* idem */ }
      try { doc.removeEventListener('pointerdown', suivi.surPointe, true); } catch (e) { /* idem */ }
    }
    this.observateurs.delete(doc);
  }

  // Clic droit sur l'icône d'une vue : dans le menu déroulant comme dans la
  // barre d'outils. Le menu contextuel d'Obsidian est écarté, celui-ci ne
  // proposerait rien d'utile sur une icône.
  surClicDroit(evt) {
    const cible = evt.target;
    if (!cible || !cible.closest) return;
    const item = cible.closest('.bases-toolbar-menu-item');
    if (item && basesEstItemVue(item)) {
      const nomEl = item.querySelector('.bases-toolbar-menu-item-name');
      if (!nomEl) return;
      evt.preventDefault();
      evt.stopPropagation();
      this.ouvrirChoix(this.baseDuMenu || this.baseActive(), nomEl.textContent);
      return;
    }
    const barre = cible.closest('.bases-toolbar-views-menu');
    if (!barre) return;
    const etiquette = barre.querySelector('.text-button-label');
    evt.preventDefault();
    evt.stopPropagation();
    this.ouvrirChoix(this.cheminDe(barre), etiquette ? etiquette.textContent : '');
  }

  ouvrirChoix(chemin, nom) {
    const propre = String(nom || '').trim();
    if (!propre) return;
    const actuelle = this.table()[basesCleIcone(chemin, propre)] || '';
    new ModaleChoixIcone(this.greffon.app, propre, actuelle,
      (icone) => this.definir(chemin, propre, icone)).open();
  }

  table() { return this.greffon.settings.basesIcones || {}; }

  herite() { return this.greffon.settings.basesIconesDossiers !== false; }

  repeindreTout() { for (const doc of this.observateurs.keys()) this.peindre(doc); }

  // Tout relire : le .base, Iconize, et repeindre.
  oublierCaches() {
    this.basesConnues.clear();
    this.iconizeLu = 0;
    this.lireIconize();
    this.repeindreTout();
  }

  // Les icônes de dossier d'Iconize, relues de loin en loin : ce sont les
  // réglages d'un autre greffon, qu'Ariane ne fait que consulter.
  async lireIconize() {
    if (this.iconizeEnCours || Date.now() - this.iconizeLu < 10000) return;
    this.iconizeEnCours = true;
    const chemin = String(this.greffon.manifest.dir || '')
      .replace(/[^/]+$/, 'obsidian-icon-folder') + '/data.json';
    try {
      const brut = await this.greffon.app.vault.adapter.read(chemin);
      const donnees = JSON.parse(brut) || {};
      const table = {};
      for (const [cle, val] of Object.entries(donnees)) {
        if (cle !== 'settings' && typeof val === 'string') table[cle] = val;
      }
      this.iconesDossiers = table;
      this.iconizeEtat = Object.keys(table).length + tr(' icônes lues dans Iconize.');
      this.iconizeLu = Date.now();
    } catch (e) {
      // Iconize absent, ou pas encore écrit ses réglages : on retentera.
      this.iconesDossiers = {};
      this.iconizeEtat = tr('Iconize introuvable : ') + chemin;
      this.iconizeLu = 0;
    }
    this.iconizeEnCours = false;
    this.repeindreTout();
  }

  // Le fichier .base : pour chaque vue, les dossiers de ses filtres, et à
  // défaut ceux du filtre général de la base.
  async lireBase(chemin) {
    if (this.basesConnues.has(chemin) || this.basesEnCours.has(chemin)) return;
    // Un « en cours » séparé du cache : un échec laissait jusqu'ici un cache
    // vide en place, et plus aucune icône ne se posait, pour toujours.
    this.basesEnCours.add(chemin);
    try {
      const f = this.greffon.app.vault.getAbstractFileByPath(chemin);
      if (!f) return;
      const base = obsidian.parseYaml(await this.greffon.app.vault.cachedRead(f)) || {};
      const info = { vues: new Map(), communs: basesDossiersDepuisFiltres(base.filters) };
      for (const v of (base.views || [])) {
        if (v && v.name) info.vues.set(String(v.name).trim(), basesDossiersDepuisFiltres(v.filters));
      }
      this.basesConnues.set(chemin, info);
      this.repeindreTout();
    } catch (e) {
      console.error('[Ariane] base illisible pour les icônes de vue : ' + chemin, e);
    } finally {
      this.basesEnCours.delete(chemin);
    }
  }

  // L'icône d'une vue : celle qu'on lui a posée, sinon celle de son dossier.
  iconeDeVue(chemin, nom) {
    const propre = String(nom || '').trim();
    const explicite = this.table()[basesCleIcone(chemin, propre)];
    if (explicite) return explicite;
    if (!this.herite() || !chemin) return '';
    this.lireIconize();
    if (!this.basesConnues.has(chemin)) { this.lireBase(chemin); return ''; }
    const info = this.basesConnues.get(chemin);
    const dossiers = info.vues.get(propre);
    for (const d of (dossiers && dossiers.length ? dossiers : info.communs)) {
      const ic = basesIconeDeDossier(this.iconesDossiers, d);
      if (ic) return ic;
    }
    return '';
  }

  // Le volet qui contient un élément, pour retrouver le fichier .base affiché.
  cheminDe(el) {
    let trouve = '';
    try {
      this.greffon.app.workspace.iterateAllLeaves((l) => {
        if (trouve) return;
        const c = l && l.view && l.view.containerEl;
        if (c && c.contains(el) && l.view.file) trouve = l.view.file.path;
      });
    } catch (e) { /* rien */ }
    return trouve;
  }

  // Pose une icône, ou remet celle d'Obsidian quand le réglage a disparu.
  poser(el, nom) {
    if (!el) return;
    if (nom) {
      // Déjà posée, et toujours là : Obsidian redessine parfois l'icône d'un
      // élément qu'il garde, sans rien savoir de la nôtre.
      if (el.dataset.zfaIcone === nom && basesIconePresente(el, nom)) return;
      if (el.dataset.zfaIconeOrigine === undefined) el.dataset.zfaIconeOrigine = basesIconeOrigine(el);
      el.empty();
      if (/^[a-z0-9-]+$/.test(nom)) obsidian.setIcon(el, nom); else el.textContent = nom;
      el.dataset.zfaIcone = nom;
    } else if (el.dataset.zfaIcone !== undefined) {
      const origine = el.dataset.zfaIconeOrigine;
      el.empty();
      if (origine) obsidian.setIcon(el, origine);
      delete el.dataset.zfaIcone;
      delete el.dataset.zfaIconeOrigine;
    }
  }

  // Chaque icône est posée à part : une qui résiste ne doit pas emporter les
  // suivantes, faute de quoi une seule ligne fautive laisse tout le menu nu.
  peindre(doc) {
    if (!doc || !doc.querySelectorAll) return;
    let vues = 0;
    for (const barre of Array.from(doc.querySelectorAll('.bases-toolbar-views-menu'))) {
      try {
        // Chaque barre a sa base : celle de son volet. Elle ne dit rien du
        // menu ouvert, qui peut appartenir à une autre base du coffre (c'était
        // la faute : la dernière barre repeinte imposait sa base au menu).
        const chemin = this.cheminDe(barre) || this.baseActive();
        const etiquette = barre.querySelector('.text-button-label');
        const nom = etiquette ? etiquette.textContent : '';
        this.poser(barre.querySelector('.text-button-icon'), this.iconeDeVue(chemin, nom));
      } catch (e) { console.error('[Ariane] icône de barre de base :', e); }
    }
    for (const nomEl of Array.from(doc.querySelectorAll('.bases-toolbar-menu-item-name'))) {
      try {
        const item = nomEl.closest ? nomEl.closest('.bases-toolbar-menu-item') : null;
        if (item && !basesEstItemVue(item)) continue;
        // L'icône est le frère aîné du nom, tous deux dans « …-item-info ».
        const cadre = item || nomEl.parentElement;
        const icone = (cadre && cadre.querySelector('.bases-toolbar-menu-item-info-icon'))
          || nomEl.previousElementSibling;
        if (!icone) continue;
        vues += 1;
        this.poser(icone, this.iconeDeVue(this.baseDuMenu || this.baseActive(), nomEl.textContent));
      } catch (e) { console.error('[Ariane] icône de menu de base :', e); }
    }
    if (vues) this.vuesPeintes = vues;
  }

  // La base sous les yeux, quand le menu flottant n'appartient à aucun volet.
  baseActive() {
    const f = this.greffon.app.workspace.getActiveFile();
    return f && f.extension === 'base' ? f.path : '';
  }

  // La base et la vue sous les yeux, d'après la barre d'outils du volet actif.
  vueActive() {
    const vue = this.greffon.app.workspace.activeLeaf && this.greffon.app.workspace.activeLeaf.view;
    const conteneur = vue && vue.containerEl;
    const barre = conteneur ? conteneur.querySelector('.bases-toolbar-views-menu .text-button-label') : null;
    if (!barre || !vue.file) return null;
    return { chemin: vue.file.path, nom: barre.textContent || '' };
  }

  // Enregistre (ou retire, si l'icône est vide) et repeint aussitôt.
  async definir(chemin, nom, icone) {
    const table = Object.assign({}, this.table());
    const cle = basesCleIcone(chemin, nom);
    if (icone) table[cle] = icone; else delete table[cle];
    this.greffon.settings.basesIcones = table;
    await this.greffon.saveSettings();
    for (const doc of this.observateurs.keys()) this.peindre(doc);
  }
}

// Socle des deux moteurs de vue (frise, calendrier).
//
// Ce qu'ils partagent vraiment : le même quatuor greffon/app/racine/contexte, et
// surtout la fenêtre dans laquelle ils vivent. Le mettre ici n'est pas de la
// cosmétique : la règle du multi-fenêtre est facile à oublier, et une correction
// appliquée à deux moteurs sur trois est exactement le bug qu'on a eu.
class MoteurVue {
  constructor(greffon, racine, contexte) {
    this.greffon = greffon;
    this.app = greffon.app;
    this.racine = racine;
    this.ctx = contexte;
  }

  // Le document de LA VUE, jamais le global : dans un volet détaché, `document`
  // désigne la fenêtre principale, et un nœud né là-bas se greffe mal ici.
  // À utiliser pour tout createElement et tout écouteur de glisser.
  _doc() { return (this.racine && this.racine.ownerDocument) || document; }

  // Idem pour la fenêtre : requestAnimationFrame et minuteries liées à la vue.
  _win() { return this._doc().defaultView || window; }
}

// Suffixe discret sur l'onglet qui héberge une vue Bases d'Ariane : le nom du
// fichier .base reste, celui de la VUE active (« Calendrier », « Frise »…)
// s'ajoute à côté, plus petit et grisé (CSS .zfa-onglet-vue), pour distinguer
// deux onglets d'une même base. Obsidian réécrit le titre de l'onglet à chaque
// updateHeader() en posant un textContent brut, ce qui balaie notre span : un
// MutationObserver le repose. `nomVue` est une fonction (relue à chaque pose,
// donc un renommage de la vue se répercute). Rend la fonction de nettoyage à
// appeler au onunload de la vue.
function marquerOngletVueBase(app, conteneur, nomVue) {
  const vide = () => {};
  if (!app || !conteneur) return vide;
  const nom = typeof nomVue === 'function' ? nomVue : () => String(nomVue || '');
  const CLASSE = 'zfa-onglet-vue';
  let obs = null;
  let titreEl = null;
  let vivant = true;
  let essais = 0;

  const trouverLeaf = () => {
    let leaf = null;
    try {
      app.workspace.iterateAllLeaves((l) => {
        if (leaf) return;
        const c = l && l.view && l.view.containerEl;
        if (c && c.contains(conteneur)) leaf = l;
      });
    } catch (e) { /* rien */ }
    return leaf;
  };

  const poser = () => {
    if (!vivant || !titreEl || !titreEl.isConnected) return;
    const txt = nom() || '';
    let span = titreEl.querySelector('.' + CLASSE);
    if (!txt) { if (span) span.remove(); return; }
    if (span && span.textContent === txt) return;
    if (!span) {
      span = titreEl.ownerDocument.createElement('span');
      span.className = CLASSE;
      titreEl.appendChild(span);
    }
    span.textContent = txt;
  };

  const demarrer = () => {
    if (!vivant) return;
    const leaf = trouverLeaf();
    titreEl = leaf && leaf.tabHeaderInnerTitleEl;
    if (!titreEl) {
      if (++essais < 6) {
        try {
          (conteneur.ownerDocument.defaultView || window).requestAnimationFrame(demarrer);
        } catch (e) { /* rien */ }
      }
      return;
    }
    try {
      const MO = (titreEl.ownerDocument.defaultView || window).MutationObserver;
      obs = new MO(() => poser());
      // childList seul, sans subtree : notre appendChild déclenche le callback,
      // qui retrouve le span en place et ne fait rien — pas de boucle.
      obs.observe(titreEl, { childList: true });
    } catch (e) { obs = null; }
    poser();
  };

  demarrer();

  return () => {
    vivant = false;
    if (obs) { try { obs.disconnect(); } catch (e) { /* rien */ } obs = null; }
    if (titreEl) {
      try { const s = titreEl.querySelector('.' + CLASSE); if (s) s.remove(); }
      catch (e) { /* rien */ }
    }
  };
}

//#endregion 14 · Socle des vues

