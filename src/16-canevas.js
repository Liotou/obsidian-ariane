//#region 16 · Canevas des tâches
// ═══════════════════════════════════════════════════════════════════════════
//  16 · CANEVAS DES TÂCHES
//  Les tâches d'Ariane sur le canevas natif d'Obsidian. Il a remplacé la vue
//  Bases « Graphe » (ariane-articulation), retirée : ses plans deviennent des
//  canevas au démarrage (migrerVuesGraphe).
//
//  Modèle repris d'Operon (« Canvas Task Cards »), réécrit pour Ariane :
//   - une carte est un nœud TEXTE du fichier .canvas portant une métadonnée
//     `arianeTache: { v: 1, ref }` et, en repli, le texte « [[ref]] » — sans
//     Ariane, le canevas reste lisible (un lien vers la note de la tâche) ;
//   - un nœud FICHIER qui pointe sur une note de tâche (glissée depuis
//     l'explorateur) est rendu de la même façon ;
//   - le canevas ne range que la DISPOSITION. Les relations (mère, blocage)
//     vivent dans les propriétés de la tâche, écrites par rattacher /
//     creerBlocage / retirerBlocage — mêmes garde-fous (cycles, blocage
//     dérivé) que partout ailleurs. Une arête n'est qu'un trait tant qu'on ne
//     lui choisit pas une relation dans la barre du canevas ;
//   - un canevas vaut thématique : on en fait un par sujet, ou un seul.
//
//  Tout ce qui touche aux internes non documentés du canevas (nodes, edges,
//  menu, createTextNode, importData, showCreationMenu…) passe par des gardes
//  de type : si une version d'Obsidian les change, l'intégration s'éteint
//  sans casser le canevas. Aucun prototype n'est modifié — seules des
//  propriétés d'INSTANCE sont enveloppées, et restaurées au déchargement.
//
//  Fenêtres secondaires : tout DOM se crée dans le document de la vue, les
//  observateurs et requestAnimationFrame viennent de SA fenêtre.
// ═══════════════════════════════════════════════════════════════════════════

const CANEVAS_CLE = 'arianeTache';
const CANEVAS_LARGEUR_DEFAUT = 280;
const CANEVAS_HAUTEUR_MIN = 64;
const CANEVAS_OPPOSE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
// Couleur native d'arête posée sur les liens de blocage que le canevas trace
// lui-même (« 1 » = rouge dans la palette d'Obsidian).
const CANEVAS_COULEUR_BLOCAGE = '1';

// La vue passée est-elle un canevas dont on sait se servir ?
function canevasVue(v) {
  if (!v || typeof v !== 'object' || typeof v.getViewType !== 'function') return null;
  if (v.getViewType() !== 'canvas' || !v.contentEl) return null;
  const c = v.canvas;
  if (!c || !(c.nodes instanceof Map) || !(c.edges instanceof Map)) return null;
  for (const f of ['createTextNode', 'requestSave', 'selectOnly', 'getData']) {
    if (typeof c[f] !== 'function') return null;
  }
  return v;
}

// Données d'un nœud natif, ou null (jamais d'exception).
function canevasDonnees(noeud) {
  try { return noeud && typeof noeud.getData === 'function' ? noeud.getData() : null; }
  catch (e) { return null; }
}

// Référence de tâche portée par un nœud : métadonnée d'un nœud texte, ou note
// de tâche visée par un nœud fichier.
function canevasRefDuNoeud(greffon, noeud) {
  const d = canevasDonnees(noeud);
  if (!d) return null;
  if (d.type === 'text' && d[CANEVAS_CLE] && typeof d[CANEVAS_CLE].ref === 'string') {
    return d[CANEVAS_CLE].ref.trim() || null;
  }
  if (d.type === 'file' && typeof d.file === 'string' && /\.md$/i.test(d.file)) {
    return greffon.refDeChemin(d.file) || null;
  }
  return null;
}

// Côtés de départ et d'arrivée d'une arête entre deux nœuds : le côté de la
// source qui regarde la cible, et l'entrée opposée sur la cible.
function canevasCotes(a, b) {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const dx = (b.x + b.width / 2) - ax;
  const dy = (b.y + b.height / 2) - ay;
  const horiz = Math.abs(dx) / Math.max(1, (a.width + b.width) / 2)
    > Math.abs(dy) / Math.max(1, (a.height + b.height) / 2);
  const de = horiz ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  return { de, vers: CANEVAS_OPPOSE[de] };
}

// Identifiant d'élément de canevas (16 caractères hexadécimaux, comme les
// identifiants natifs).
function canevasNouvelId() {
  const octets = new Uint8Array(8);
  try { crypto.getRandomValues(octets); }
  catch (e) { for (let i = 0; i < 8; i += 1) octets[i] = Math.floor(Math.random() * 256); }
  return [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// DOM standard dans le document du parent (fenêtres secondaires).
function canevasEl(parent, tag, cls, texte) {
  const e = parent.ownerDocument.createElement(tag);
  if (cls) e.className = cls;
  if (texte != null) e.textContent = texte;
  parent.appendChild(e);
  return e;
}

function canevasInfobulle(el, texte) {
  el.setAttribute('aria-label', texte);
  if (typeof obsidian.setTooltip === 'function') obsidian.setTooltip(el, texte);
  else el.title = texte;
}

// Un clic sur un contrôle de carte ne doit ni sélectionner ni glisser le
// nœud, ni ouvrir le formulaire au double-clic.
function canevasIsoler(el) {
  for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) {
    el.addEventListener(ev, (e) => e.stopPropagation());
  }
}

function canevasBouton(parent, icone, texte, cls) {
  const b = canevasEl(parent, 'button', 'clickable-icon ' + (cls || ''));
  b.type = 'button';
  obsidian.setIcon(b, icone);
  canevasInfobulle(b, texte);
  return b;
}

function canevasDateCourte(iso) {
  const j = Ariane.jourValide(iso);
  if (!j) return String(iso || '');
  const d = new Date(j + 'T00:00:00');
  try {
    return d.toLocaleDateString(LANGUE === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' });
  } catch (e) { return j; }
}

function canevasClose(t) {
  return !!t && (t.statut === 'terminée' || t.statut === 'abandonnée');
}

// ── Intégration : suit les canevas ouverts, tient les données des tâches ────

// Pose des tâches dans le contenu d'un fichier .canvas (sans l'ouvrir) : une
// carte par tâche absente, en grille sous ce qui s'y trouve déjà, et une
// arête par relation entre ces cartes et celles déjà posées.
// relation(a, b, type) dit si `a` est la mère (hier) ou la bloquante (bloque)
// de `b`. Rend { contenu, poses } ; le contenu d'entrée n'est pas modifié.
function canevasAjouterCartes(contenu, refs, relation, largeur) {
  const nodes = Array.isArray(contenu && contenu.nodes) ? contenu.nodes.slice() : [];
  const edges = Array.isArray(contenu && contenu.edges) ? contenu.edges.slice() : [];
  const larg = Number(largeur) || CANEVAS_LARGEUR_DEFAUT;
  const refDe = (n) => (n && n[CANEVAS_CLE] && n[CANEVAS_CLE].ref)
    || (n && n.type === 'text' && /^\[\[([^\]|#]+)\]\]$/.test(String(n.text || '').trim())
      ? String(n.text).trim().slice(2, -2) : null);
  const parRef = new Map();
  for (const n of nodes) { const r = refDe(n); if (r && !parRef.has(r)) parRef.set(r, n); }
  const aPoser = [...new Set((refs || []).filter(Boolean))].filter((r) => !parRef.has(r));
  if (!aPoser.length) return { contenu: { nodes, edges }, poses: [] };
  let x0 = 0;
  let y0 = 0;
  if (nodes.length) {
    x0 = Math.min(...nodes.map((n) => Number(n.x) || 0));
    y0 = Math.max(...nodes.map((n) => (Number(n.y) || 0) + (Number(n.height) || 0))) + 120;
  }
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(aPoser.length))));
  const neufs = [];
  aPoser.forEach((ref, i) => {
    const n = { id: canevasNouvelId(), type: 'text', text: '[[' + ref + ']]',
      x: x0 + (i % cols) * (larg + 60), y: y0 + Math.floor(i / cols) * 170,
      width: larg, height: 110, [CANEVAS_CLE]: { v: 1, ref } };
    nodes.push(n);
    parRef.set(ref, n);
    neufs.push(ref);
  });
  const paires = new Set(edges.map((e) => [e.fromNode, e.toNode].sort().join('|')));
  for (const a of neufs) {
    for (const b of parRef.keys()) {
      if (a === b) continue;
      for (const [de, vers] of [[a, b], [b, a]]) {
        const bloc = relation(de, vers, 'bloque');
        if (!bloc && !relation(de, vers, 'hier')) continue;
        const na = parRef.get(de);
        const nb = parRef.get(vers);
        const cle = [na.id, nb.id].sort().join('|');
        if (paires.has(cle)) continue;
        paires.add(cle);
        const cotes = canevasCotes(na, nb);
        const e = { id: canevasNouvelId(), fromNode: na.id, fromSide: cotes.de, fromEnd: 'none',
          toNode: nb.id, toSide: cotes.vers, toEnd: 'arrow' };
        if (bloc) e.color = CANEVAS_COULEUR_BLOCAGE;
        edges.push(e);
      }
    }
  }
  return { contenu: { nodes, edges }, poses: neufs };
}

// Retire d'un fichier .base les vues de l'ancien type « Graphe »
// (ariane-articulation), en laissant le reste du texte tel quel : une entrée
// court de sa ligne « - type: » à la suivante, ou à la clé suivante.
function canevasSansVuesGraphe(texte) {
  const eol = String(texte).includes('\r\n') ? '\r\n' : '\n';
  const out = [];
  let retrait = null;            // indentation de l'entrée en cours de retrait
  for (const l of String(texte).split(/\r?\n/)) {
    const ind = (l.match(/^\s*/) || [''])[0].length;
    if (retrait != null) {
      if (!l.trim() || ind > retrait) continue;   // corps de l'entrée retirée
      retrait = null;
    }
    const m = l.match(/^(\s*)-\s*type:\s*["']?([^"'\s]+)["']?\s*$/);
    if (m && m[2] === TYPE_VUE_BASE_ARTIC) { retrait = m[1].length; continue; }
    out.push(l);
  }
  return out.join(eol);
}

class IntegrationCanevas extends obsidian.Component {
  //#region Canevas · intégration
  constructor(greffon) {
    super();
    this.greffon = greffon;
    this.app = greffon.app;
    this.surfaces = new Map(); // vue → SurfaceCanevas
    this._version = 0;
    this._cache = null;
  }

  onload() {
    const ws = this.app.workspace;
    const resync = () => this.synchroniser();
    this.registerEvent(ws.on('layout-change', resync));
    this.registerEvent(ws.on('active-leaf-change', resync));
    this.registerEvent(ws.on('file-open', resync));
    ws.onLayoutReady(resync);
    // Toute écriture d'une note de tâche change ce que montrent les cartes.
    const siTache = (chemin) => { if (!chemin || this.greffon.refDeChemin(chemin)) this.invalider(); };
    this.registerEvent(this.app.metadataCache.on('changed', (f) => siTache(f && f.path)));
    this.registerEvent(this.app.vault.on('delete', (f) => siTache(f && f.path)));
    this.registerEvent(this.app.vault.on('create', (f) => siTache(f && f.path)));
    this.registerEvent(this.app.vault.on('rename', (f, ancien) => { siTache(f && f.path); siTache(ancien); }));
    // Menus natifs du canevas, émis par Obsidian sur l'espace de travail.
    this.registerEvent(ws.on('canvas:node-menu', (menu, noeud) => {
      const s = this._surfaceDuNoeud(noeud);
      if (s) s.menuNoeud(menu, noeud);
    }));
    this.registerEvent(ws.on('canvas:node-connection-drop-menu', (menu, noeud, arete) => {
      const s = this._surfaceDuNoeud(noeud);
      if (s) s.menuConnexion(menu, noeud, arete);
    }));
  }

  onunload() { this.surfaces.clear(); }

  // Les données des tâches ont changé (ou les réglages) : chaque surface
  // redessine ce qui a bougé au prochain cadre.
  invalider() {
    this._version += 1;
    this._cache = null;
    for (const s of this.surfaces.values()) s.planifier(true);
  }

  // Instantané des tâches, calculé une fois par version : relations et états
  // dérivés (bloquée, impactée, avancement) partagés par toutes les cartes.
  donnees() {
    const jour = jourIsoDe(new Date());
    if (this._cache && this._cache.v === this._version && this._cache.jour === jour) return this._cache;
    const toutes = this.greffon.tachesPourGantt();
    const parRef = new Map(toutes.map((t) => [t.ref, t]));
    const g = Ariane.grapheArticulation(toutes);
    const prop = Ariane.propagerBlocage(g.noeuds, g.aretes);
    const enfants = new Map();
    const bloquantes = new Map(); // ref → refs qui la bloquent
    const parent = new Map();
    const ajouter = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const a of g.aretes) {
      if (a.type === 'hier') { ajouter(enfants, a.de, a.vers); parent.set(a.vers, a.de); }
      else if (a.type === 'bloque') ajouter(bloquantes, a.vers, a.de);
    }
    this._cache = {
      v: this._version, jour, toutes, parRef, enfants, bloquantes, parent,
      bloquee: prop.bloquee, impactee: prop.impactee,
      av: Ariane.avancementsDerives(toutes),
    };
    return this._cache;
  }

  // `a` est-elle la mère de `b` / `a` bloque-t-elle `b` ?
  relation(d, a, b, type) {
    if (type === 'hier') return d.parent.get(b) === a;
    return (d.bloquantes.get(b) || []).includes(a);
  }

  vues() {
    return this.app.workspace.getLeavesOfType('canvas')
      .map((f) => canevasVue(f.view)).filter(Boolean);
  }

  synchroniser() {
    const vues = new Set(this.vues());
    for (const [vue, s] of this.surfaces) {
      if (!vues.has(vue) || s.canvas !== vue.canvas) { this.removeChild(s); this.surfaces.delete(vue); }
    }
    for (const vue of vues) {
      const s = this.surfaces.get(vue);
      if (s) s.planifier(true);
      else { const nv = new SurfaceCanevas(this, vue); this.surfaces.set(vue, nv); this.addChild(nv); }
    }
  }

  _surfaceDuNoeud(noeud) {
    for (const s of this.surfaces.values()) {
      if (noeud && s.canvas.nodes.get(noeud.id) === noeud) return s;
    }
    return null;
  }

  // Surface du canevas actif (commandes de la palette), ou null.
  surfaceActive() {
    const vue = canevasVue(this.app.workspace.getActiveViewOfType(obsidian.ItemView));
    if (!vue) return null;
    if (!this.surfaces.has(vue)) this.synchroniser();
    return this.surfaces.get(vue) || null;
  }

  // Les canevas de tâches vivent ensemble, dans un sous-dossier « Canevas »
  // du dossier des tâches (un autre dossier se règle dans les réglages) :
  // c'est là qu'on les retrouve, un par thème.
  dossierCanevas() {
    const r = String(this.greffon.settings.canevasDossier || '').trim();
    if (r) return obsidian.normalizePath(r);
    const t = String(this.greffon.settings.dossierTaches || '').trim();
    return obsidian.normalizePath((t ? t + '/' : '') + 'Canevas');
  }

  // Les canevas de ce dossier, le dernier modifié en tête.
  canevasDuDossier() {
    const d = this.dossierCanevas() + '/';
    return this.app.vault.getFiles()
      .filter((f) => f.extension === 'canvas' && f.path.startsWith(d))
      .sort((a, b) => ((b.stat && b.stat.mtime) || 0) - ((a.stat && a.stat.mtime) || 0));
  }

  // Nouveau canevas de tâches : son nom est demandé, il est rangé dans le
  // dossier des canevas et ouvert dans un nouvel onglet.
  creerCanevas() {
    return new Promise((res) => {
      ModaleBarreTexte.demander(this.greffon, {
        titre: 'Nouveau canevas de tâches', bouton: 'Créer',
        champs: [{ cle: 'nom', nom: 'Nom', aide: 'Un canevas par thème : « Thèse, chapitre 1 », « Enseignement »…', valeur: '' }],
      }, async (v) => res(await this._creerCanevas(v && v.nom, { nodes: [], edges: [] }, true)));
    });
  }

  async _creerCanevas(nom, contenu, ouvrir) {
    const dossier = this.dossierCanevas();
    await this.greffon.assurerDossier(dossier);
    const base = String(nom || '').replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || tr('Canevas des tâches');
    let chemin = obsidian.normalizePath(dossier + '/' + base + '.canvas');
    for (let n = 2; this.app.vault.getAbstractFileByPath(chemin); n += 1) {
      chemin = obsidian.normalizePath(dossier + '/' + base + ' ' + n + '.canvas');
    }
    const f = await this.app.vault.create(chemin, JSON.stringify(contenu, null, '\t'));
    if (ouvrir) await this.app.workspace.getLeaf('tab').openFile(f);
    return f;
  }

  // Choisir un canevas du dossier, ou en créer un.
  ouvrirCanevas() {
    const fichiers = this.canevasDuDossier();
    const items = fichiers.map((f, i) => ({ cle: i, nom: f.basename }));
    items.push({ cle: -1, nom: tr('Nouveau canevas de tâches…') });
    new ChoixListeModal(this.app, tr('Canevas de tâches…'), items, (it) => {
      if (!it) return;
      if (it.cle === -1) { this.creerCanevas(); return; }
      this.app.workspace.getLeaf('tab').openFile(fichiers[it.cle]);
    }).open();
  }

  // Pose des tâches sur un canevas donné : par le canevas lui-même s'il est
  // ouvert, sinon dans son fichier. Rend le nombre de cartes posées.
  async poserDansCanevas(fichier, refs) {
    if (!fichier || !refs || !refs.length) return 0;
    this.synchroniser();
    const s = [...this.surfaces.values()].find((x) => x.vue.file && x.vue.file.path === fichier.path);
    if (s && !s.canvas.readonly) {
      const sur = s._refsSurCanevas();
      const neufs = refs.filter((r) => !sur.has(r));
      if (neufs.length) await s.inserer(neufs, s._pointLibre(), {});
      return neufs.length;
    }
    let contenu = {};
    try { contenu = JSON.parse((await this.app.vault.read(fichier)) || '{}') || {}; } catch (e) { contenu = {}; }
    const d = this.donnees();
    const larg = Number(this.greffon.settings.canevasLargeurCarte) || CANEVAS_LARGEUR_DEFAUT;
    const r = canevasAjouterCartes(contenu, refs, (a, b, type) => this.relation(d, a, b, type), larg);
    if (r.poses.length) await this.app.vault.modify(fichier, JSON.stringify(r.contenu, null, '\t'));
    return r.poses.length;
  }

  // Plans des anciennes vues « Graphe » (vue Bases « ariane-articulation »,
  // retirée) : [{ fichier, vue, cartes: [{ref, x, y}] }].
  async plansArticulation() {
    const out = [];
    for (const f of this.app.vault.getFiles()) {
      if (f.extension !== 'base') continue;
      let conf = null;
      try { conf = obsidian.parseYaml(await this.app.vault.cachedRead(f)); } catch (e) { conf = null; }
      for (const v of (conf && Array.isArray(conf.views)) ? conf.views : []) {
        if (!v || v.type !== TYPE_VUE_BASE_ARTIC) continue;
        let plan = null;
        try { plan = typeof v.arianeArtPlan === 'string' ? JSON.parse(v.arianeArtPlan) : v.arianeArtPlan; }
        catch (e) { plan = null; }
        const cartes = (plan && Array.isArray(plan.cartes) ? plan.cartes : [])
          .filter((c) => c && c.ref && Number.isFinite(c.x) && Number.isFinite(c.y));
        out.push({ fichier: f, vue: v.name || tr('Graphe'), cartes });
      }
    }
    return out;
  }

  // Contenu .canvas d'un plan de l'ancienne vue Graphe : une carte par tâche
  // à la même disposition (écarts agrandis : les cartes du canevas sont plus
  // hautes), et une arête par relation entre les tâches du plan.
  canevasDepuisPlan(cartes) {
    const d = this.donnees();
    const larg = Number(this.greffon.settings.canevasLargeurCarte) || CANEVAS_LARGEUR_DEFAUT;
    const haut = 110;
    const sx = (larg + 60) / 300;
    const sy = 2;
    const nodes = [];
    const parRef = new Map();
    for (const c of cartes) {
      if (!d.parRef.has(c.ref) || parRef.has(c.ref)) continue;
      const n = { id: canevasNouvelId(), type: 'text', text: '[[' + c.ref + ']]',
        x: Math.round(c.x * sx), y: Math.round(c.y * sy), width: larg, height: haut,
        [CANEVAS_CLE]: { v: 1, ref: c.ref } };
      nodes.push(n);
      parRef.set(c.ref, n);
    }
    const edges = [];
    const refs = [...parRef.keys()];
    for (const a of refs) {
      for (const b of refs) {
        if (a === b) continue;
        const bloc = this.relation(d, a, b, 'bloque');
        if (!bloc && !this.relation(d, a, b, 'hier')) continue;
        const na = parRef.get(a);
        const nb = parRef.get(b);
        const cotes = canevasCotes(na, nb);
        const e = { id: canevasNouvelId(), fromNode: na.id, fromSide: cotes.de, fromEnd: 'none',
          toNode: nb.id, toSide: cotes.vers, toEnd: 'arrow' };
        if (bloc) e.color = CANEVAS_COULEUR_BLOCAGE;
        edges.push(e);
      }
    }
    return { nodes, edges };
  }

  // La vue Bases « Graphe » n'existe plus : chacune de ses vues encore
  // présente dans un .base devient un canevas du dossier (ses cartes et leurs
  // relations), puis disparaît du .base. Une fois, au démarrage, et sans
  // effet s'il n'y en a plus.
  async migrerVuesGraphe() {
    let plans = [];
    try { plans = await this.plansArticulation(); } catch (e) { return; }
    if (!plans.length) return;
    const parFichier = new Map();
    for (const p of plans) {
      if (p.cartes.length) {
        const contenu = this.canevasDepuisPlan(p.cartes);
        if (contenu.nodes.length) {
          try {
            const f = await this._creerCanevas(p.fichier.basename + ' - ' + p.vue, contenu, false);
            new obsidian.Notice(tr('Vue « ') + p.vue + tr(' » de ') + p.fichier.basename
              + tr(' : devenue le canevas « ') + f.basename + ' ».', 10000);
          } catch (e) { console.error('[Ariane] graphe vers canevas :', e); continue; }
        }
      }
      parFichier.set(p.fichier.path, p.fichier);
    }
    for (const f of parFichier.values()) {
      try {
        const avant = await this.app.vault.read(f);
        const apres = canevasSansVuesGraphe(avant);
        if (apres !== avant) await this.app.vault.modify(f, apres);
      } catch (e) { console.error('[Ariane] retrait de la vue Graphe :', e); }
    }
  }
  //#endregion Canevas · intégration
}

// ── Tracé des liens entre tâches ────────────────────────────────────────────
//  Le canevas trace ses arêtes en courbes. Entre deux tâches, Ariane peut les
//  redessiner comme le faisait l'ancien graphe : à angles droits, en
//  contournant les cartes, coins adoucis, avec un petit pont là où deux
//  liens se croisent. Fonctions pures ; la surface les applique.

// Direction vers l'extérieur de chaque côté d'un nœud.
const CANEVAS_NORMALE = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

// Le point d'attache d'un côté : son milieu, comme le canevas.
function canevasPort(r, cote) {
  if (cote === 'top') return { x: r.x + r.width / 2, y: r.y };
  if (cote === 'bottom') return { x: r.x + r.width / 2, y: r.y + r.height };
  if (cote === 'left') return { x: r.x, y: r.y + r.height / 2 };
  return { x: r.x + r.width, y: r.y + r.height / 2 };
}

// Un segment horizontal ou vertical traverse-t-il l'intérieur d'une boîte ?
// Longer un bord n'est pas traverser.
function canevasSegmentBloque(a, b, boites) {
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  for (const r of boites) {
    const dx = x1 === x2 ? (x1 > r.x1 && x1 < r.x2) : (x1 < r.x2 && x2 > r.x1);
    const dy = y1 === y2 ? (y1 > r.y1 && y1 < r.y2) : (y1 < r.y2 && y2 > r.y1);
    if (dx && dy) return true;
  }
  return false;
}

// Retire les points alignés (et les doublons) d'une ligne brisée.
function canevasSimplifier(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const aligne = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01)
        || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!aligne) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

// Chemin à angles droits du point p1 (côté c1 de la source) au point p2
// (côté c2 de la cible) : il quitte la source et aborde la cible à angle
// droit, ne traverse aucune carte (obstacles : { x, y, width, height }, la
// source et la cible comprises) et préfère peu de coudes. Recherche A* sur
// la grille des bords des cartes voisines. Rend la liste des points.
function canevasRouteOrtho(p1, c1, p2, c2, obstacles, opts) {
  const o = opts || {};
  const M = Number.isFinite(o.marge) ? o.marge : 14;
  const S = Number.isFinite(o.amorce) ? o.amorce : 24;
  const PEN = Number.isFinite(o.coude) ? o.coude : 40;
  const n1 = CANEVAS_NORMALE[c1] || CANEVAS_NORMALE.right;
  const n2 = CANEVAS_NORMALE[c2] || CANEVAS_NORMALE.left;
  const a1 = { x: p1.x + n1[0] * S, y: p1.y + n1[1] * S };
  const a2 = { x: p2.x + n2[0] * S, y: p2.y + n2[1] * S };
  const repli = () => {
    const horiz = n1[0] !== 0;
    const m = horiz ? (a1.x + a2.x) / 2 : (a1.y + a2.y) / 2;
    return canevasSimplifier(horiz
      ? [p1, a1, { x: m, y: a1.y }, { x: m, y: a2.y }, a2, p2]
      : [p1, a1, { x: a1.x, y: m }, { x: a2.x, y: m }, a2, p2]);
  };
  // Seules comptent les cartes proches du trajet : la grille reste petite.
  const E = Number.isFinite(o.voisinage) ? o.voisinage : 400;
  const zx1 = Math.min(a1.x, a2.x) - E;
  const zx2 = Math.max(a1.x, a2.x) + E;
  const zy1 = Math.min(a1.y, a2.y) - E;
  const zy2 = Math.max(a1.y, a2.y) + E;
  const boites = [];
  for (const r of obstacles || []) {
    if (!r || !(r.width > 0) || !(r.height > 0)) continue;
    const b = { x1: r.x - M, y1: r.y - M, x2: r.x + r.width + M, y2: r.y + r.height + M };
    if (b.x2 < zx1 || b.x1 > zx2 || b.y2 < zy1 || b.y1 > zy2) continue;
    boites.push(b);
  }
  const libre = (p) => !boites.some((r) => p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2);
  if (!libre(a1) || !libre(a2)) return repli();
  const tri = (s) => [...s].sort((a, b) => a - b);
  const X = tri(new Set([a1.x, a2.x, (a1.x + a2.x) / 2].concat(...boites.map((b) => [b.x1, b.x2]))));
  const Y = tri(new Set([a1.y, a2.y, (a1.y + a2.y) / 2].concat(...boites.map((b) => [b.y1, b.y2]))));
  const NX = X.length;
  const NY = Y.length;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dirDe = (v) => DIRS.findIndex((d) => d[0] === v[0] && d[1] === v[1]);
  const d0 = dirDe(n1);
  const dFin = dirDe([-n2[0], -n2[1]]);
  const i0 = X.indexOf(a1.x);
  const j0 = Y.indexOf(a1.y);
  const iF = X.indexOf(a2.x);
  const jF = Y.indexOf(a2.y);
  const cle = (i, j, d) => (i * NY + j) * 4 + d;
  const g = new Map();
  const venu = new Map();
  // Tas binaire minimal sur [f, cle].
  const tas = [];
  const pousser = (f, k) => {
    tas.push([f, k]);
    let n = tas.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (tas[p][0] <= tas[n][0]) break;
      [tas[p], tas[n]] = [tas[n], tas[p]];
      n = p;
    }
  };
  const tirer = () => {
    const haut = tas[0];
    const bas = tas.pop();
    if (tas.length) {
      tas[0] = bas;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        const r = l + 1;
        let m = n;
        if (l < tas.length && tas[l][0] < tas[m][0]) m = l;
        if (r < tas.length && tas[r][0] < tas[m][0]) m = r;
        if (m === n) break;
        [tas[m], tas[n]] = [tas[n], tas[m]];
        n = m;
      }
    }
    return haut;
  };
  const h = (i, j) => Math.abs(X[i] - a2.x) + Math.abs(Y[j] - a2.y);
  const k0 = cle(i0, j0, d0);
  g.set(k0, 0);
  pousser(h(i0, j0), k0);
  let fin = null;
  let garde = 0;
  while (tas.length && garde++ < 60000) {
    const [, k] = tirer();
    const d = k % 4;
    const ij = (k - d) / 4;
    const i = Math.floor(ij / NY);
    const j = ij % NY;
    const gk = g.get(k);
    if (i === iF && j === jF) {
      const total = gk + (d === dFin ? 0 : PEN);
      if (!fin || total < fin.cout) fin = { k, cout: total };
      if (d === dFin) break;
      continue;
    }
    for (let nd = 0; nd < 4; nd++) {
      if ((nd ^ 1) === d && (nd >> 1) === (d >> 1)) continue;   // pas de demi-tour
      const ni = i + DIRS[nd][0];
      const nj = j + DIRS[nd][1];
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
      const a = { x: X[i], y: Y[j] };
      const b = { x: X[ni], y: Y[nj] };
      if (!libre(b) || canevasSegmentBloque(a, b, boites)) continue;
      const cout = gk + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (nd === d ? 0 : PEN);
      const nk = cle(ni, nj, nd);
      if (g.has(nk) && g.get(nk) <= cout) continue;
      g.set(nk, cout);
      venu.set(nk, k);
      pousser(cout + h(ni, nj), nk);
    }
  }
  if (!fin) return repli();
  const chemin = [];
  for (let k = fin.k; k != null; k = venu.get(k)) {
    const ij = (k - (k % 4)) / 4;
    chemin.push({ x: X[Math.floor(ij / NY)], y: Y[ij % NY] });
    if (k === k0) break;
  }
  chemin.reverse();
  return canevasSimplifier([p1].concat(chemin, [p2]));
}

// Les ponts d'un lien : là où l'un de ses segments horizontaux croise un
// segment vertical d'un autre lien, c'est lui qui enjambe. Rend [{ seg, x, y }].
function canevasPontsOrtho(pts, autres, rayon) {
  const r = Number.isFinite(rayon) ? rayon : 5;
  const out = [];
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1];
    const b = pts[s];
    if (Math.abs(a.y - b.y) > 0.01 || Math.abs(a.x - b.x) < 0.01) continue;
    const xa = Math.min(a.x, b.x);
    const xb = Math.max(a.x, b.x);
    for (const q of autres || []) {
      for (let t = 1; t < q.length; t++) {
        const c = q[t - 1];
        const d = q[t];
        if (Math.abs(c.x - d.x) > 0.01) continue;
        const x = c.x;
        if (x <= xa + r * 2 || x >= xb - r * 2) continue;
        if (a.y <= Math.min(c.y, d.y) + 1 || a.y >= Math.max(c.y, d.y) - 1) continue;
        if (!out.some((p) => p.seg === s && Math.abs(p.x - x) < r * 2)) out.push({ seg: s, x, y: a.y });
      }
    }
  }
  return out;
}

// Le `d` SVG d'une ligne brisée à angles droits : coins arrondis (rayon
// borné par la moitié des segments voisins), ponts en demi-cercle au-dessus
// des liens enjambés.
function canevasCheminOrtho(pts, rayon, ponts, rPont) {
  if (!pts || pts.length < 2) return '';
  const R = Number.isFinite(rayon) ? rayon : 8;
  const rp = Number.isFinite(rPont) ? rPont : 5;
  const f = (v) => String(Math.round(v * 10) / 10);
  const lg = (a, b) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const dir = (a, b) => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });
  const rc = [0];
  for (let k = 1; k < pts.length - 1; k++) {
    rc.push(Math.max(0, Math.min(R, lg(pts[k - 1], pts[k]) / 2, lg(pts[k], pts[k + 1]) / 2)));
  }
  rc.push(0);
  let d = 'M ' + f(pts[0].x) + ' ' + f(pts[0].y);
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1];
    const b = pts[s];
    const u = dir(a, b);
    const fin = { x: b.x - u.x * rc[s], y: b.y - u.y * rc[s] };
    const sur = (ponts || []).filter((p) => p.seg === s)
      .sort((p, q) => (p.x - q.x) * (u.x || 1));
    for (const p of sur) {
      d += ' L ' + f(p.x - u.x * rp) + ' ' + f(p.y)
        + ' A ' + rp + ' ' + rp + ' 0 0 ' + (u.x > 0 ? 1 : 0) + ' ' + f(p.x + u.x * rp) + ' ' + f(p.y);
    }
    d += ' L ' + f(fin.x) + ' ' + f(fin.y);
    if (s < pts.length - 1 && rc[s] > 0) {
      const v = dir(b, pts[s + 1]);
      d += ' Q ' + f(b.x) + ' ' + f(b.y) + ' ' + f(b.x + v.x * rc[s]) + ' ' + f(b.y + v.y * rc[s]);
    }
  }
  return d;
}

// Le `d` d'une ligne brisée sans arrondi (tracé droit : amorces et diagonale).
function canevasCheminDroit(pts) {
  return (pts || []).map((p, i) => (i ? 'L ' : 'M ') + Math.round(p.x * 10) / 10 + ' ' + Math.round(p.y * 10) / 10).join(' ');
}

// ── Surface : un canevas ouvert ─────────────────────────────────────────────

class SurfaceCanevas extends obsidian.Component {
  //#region Canevas · montage des cartes
  constructor(integration, vue) {
    super();
    this.integration = integration;
    this.greffon = integration.greffon;
    this.app = integration.app;
    this.vue = vue;
    this.canvas = vue.canvas;
    this.cartes = new Map();     // nœud natif → { ref, racine, sig, restaurer }
    this._aAjuster = new Set();  // nœuds dont la hauteur est à recaler
    this._actif = false;
    this._cadre = 0;
    this._complet = false;
    this._interaction = false;
    this._occupe = false;
    this._controles = null;
    this._sigControles = '';
    this.panneau = null;
    this._routes = new Map();    // arête → { cle, pts } : tracé calculé
    this._poses = new Map();     // arête → `d` posé par Ariane
    this._enveloppes = new Map();// arête → restauration de updatePath
  }

  _document() { return this.vue.contentEl.ownerDocument; }
  _fenetre() { return this._document().defaultView || window; }

  onload() {
    this._actif = true;
    const win = this._fenetre();
    const Obs = win.MutationObserver || MutationObserver;
    // Toute mutation hors de NOS éléments (cartes, calque, contrôles) peut
    // avoir déplacé, monté ou démonté un nœud : on se recale au cadre suivant.
    this._obs = new Obs((recs) => {
      let complet = false;
      let utile = false;
      for (const r of recs) {
        const t = r.target;
        if (this._estANous(t)) continue;
        utile = true;
        if (r.type === 'childList' || r.attributeName === 'class') { complet = true; break; }
      }
      if (utile) this.planifier(complet);
    });
    this._obs.observe(this.vue.contentEl, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'd', 'transform'],
    });
    this.register(() => this._obs.disconnect());

    // Geste en cours sur le canevas : pas de recalage de hauteur pendant qu'on
    // glisse ou redimensionne (ce serait se battre avec la main).
    this.registerDomEvent(this.vue.contentEl, 'pointerdown', () => { this._interaction = true; this._finSurvol(); }, true);
    // Au relâché, seules les cartes dont la LARGEUR a changé (redimensionnées)
    // voient leur texte se replier autrement : ce sont les seules à remesurer.
    const relache = () => {
      if (!this._interaction) return;
      this._interaction = false;
      for (const [n, m] of this.cartes) {
        const d = canevasDonnees(n);
        if (d && d.width !== m.largeur) this._aAjuster.add(n);
      }
      this.planifier(true);
    };
    this.registerDomEvent(win, 'pointerup', relache);
    this.registerDomEvent(win, 'pointercancel', relache);
    this.registerDomEvent(win, 'blur', relache);
    this.registerDomEvent(this.vue.contentEl, 'wheel', () => this.planifier(false), { passive: true });

    this._envelopperMenuCreation();
    this._envelopperBarre();
    this.planifier(true);
  }

  onunload() {
    this._actif = false;
    if (this._cadre) { try { this._fenetre().cancelAnimationFrame(this._cadre); } catch (e) { /* fenêtre fermée */ } }
    if (this.panneau) this.panneau.fermer();
    this._retirerControles();
    for (const n of [...this.cartes.keys()]) this._demonter(n);
    if (this._calque) { this._calque.remove(); this._calque = null; }
    if (this._outils) { this._outils.remove(); this._outils = null; }
    this._rendreLiensNatifs();
  }

  _estANous(t) {
    if (!t || !t.closest) return !!(this._calque && t && this._calque.contains(t));
    return !!t.closest('.zfa-cnv-racine, .zfa-cnv-calque, .zfa-cnv-controles, .zfa-cnv-outils');
  }

  // Un seul passage par cadre. `complet` : remonter/rafraîchir les cartes ;
  // sinon seulement le calque des relations et les contrôles.
  planifier(complet) {
    if (!this._actif) return;
    if (complet) this._complet = true;
    if (this._cadre) return;
    this._cadre = this._fenetre().requestAnimationFrame(() => {
      this._cadre = 0;
      const c = this._complet;
      this._complet = false;
      try { this.synchroniser(c); } catch (e) { console.warn('[Ariane] canevas :', e); }
    });
  }

  synchroniser(complet) {
    if (!this._actif || this.vue.canvas !== this.canvas) return;
    const d = this.integration.donnees();
    if (complet) {
      for (const [noeud, m] of this.cartes) {
        const ref = canevasRefDuNoeud(this.greffon, noeud);
        if (this.canvas.nodes.get(noeud.id) !== noeud || ref !== m.ref
          || noeud.isEditing || !noeud.contentEl || !noeud.contentEl.contains(m.racine)) {
          this._demonter(noeud);
        }
      }
      for (const noeud of this.canvas.nodes.values()) {
        if (!noeud || !noeud.nodeEl || !noeud.contentEl || noeud.isEditing) continue;
        const ref = canevasRefDuNoeud(this.greffon, noeud);
        if (!ref) continue;
        let m = this.cartes.get(noeud);
        if (!m) m = this._monter(noeud, ref);
        const sig = this._signature(ref, d);
        if (m.sig !== sig) {
          this._rendreCarte(m, d);
          m.sig = sig;
          this._aAjuster.add(noeud);
        }
      }
      this._ajusterHauteurs();
      this._assurerOutils();
    }
    this._majLiens(d);
    this._majCalque(d);
    this._majControles(d);
    if (this.panneau) this.panneau.rafraichir();
  }

  _monter(noeud, ref) {
    noeud.nodeEl.classList.add('zfa-cnv-noeud');
    const racine = canevasEl(noeud.contentEl, 'div', 'zfa-cnv-racine');
    const m = { ref, racine, sig: '', restaurer: () => {} };
    // Survol : la carte, ses liens directs et les cartes au bout ressortent ;
    // le reste du canevas s'estompe. Purement visuel.
    const entrer = () => this._survolerCarte(noeud);
    const sortir = () => this._finSurvol();
    noeud.nodeEl.addEventListener('mouseenter', entrer);
    noeud.nodeEl.addEventListener('mouseleave', sortir);
    // Double-clic : le formulaire de la tâche, jamais l'édition du texte brut.
    racine.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.modifier(m.ref);
    });
    // Entrée sur une carte sélectionnée passe par startEditing : même sort.
    const desc = Object.getOwnPropertyDescriptor(noeud, 'startEditing');
    const orig = noeud.startEditing;
    if (typeof orig === 'function') {
      let fini = false;
      const nous = (...args) => {
        if (fini || !this._actif) return orig.apply(noeud, args);
        this.modifier(m.ref);
        return undefined;
      };
      noeud.startEditing = nous;
      m.restaurer = () => {
        fini = true;
        if (noeud.startEditing !== nous) return;
        if (desc) Object.defineProperty(noeud, 'startEditing', desc);
        else delete noeud.startEditing;
      };
    }
    const restaurerEdition = m.restaurer;
    m.restaurer = () => {
      restaurerEdition();
      noeud.nodeEl.removeEventListener('mouseenter', entrer);
      noeud.nodeEl.removeEventListener('mouseleave', sortir);
      if (this._survolee === noeud) this._finSurvol();
    };
    this.cartes.set(noeud, m);
    return m;
  }

  _demonter(noeud) {
    const m = this.cartes.get(noeud);
    if (!m) return;
    m.racine.remove();
    m.restaurer();
    if (noeud.nodeEl) noeud.nodeEl.classList.remove('zfa-cnv-noeud');
    this.cartes.delete(noeud);
    this._aAjuster.delete(noeud);
  }

  // Les éléments d'une arête qui se voient : son tracé et sa pointe.
  _elsArete(a) {
    return [a.lineGroupEl, a.lineEndGroupEl].filter((x) => x && x.classList);
  }

  _survolerCarte(noeud) {
    if (this._interaction || !this._actif) return;
    this._finSurvol();
    const hote = this.vue.contentEl;
    this._survolee = noeud;
    const lies = new Set([noeud]);
    for (const a of this.canvas.edges.values()) {
      if (!a || !a.from || !a.to) continue;
      if (a.from.node !== noeud && a.to.node !== noeud) continue;
      for (const el of this._elsArete(a)) el.classList.add('zfa-cnv-est-lie');
      lies.add(a.from.node);
      lies.add(a.to.node);
    }
    for (const n of lies) if (n && n.nodeEl) n.nodeEl.classList.add('zfa-cnv-est-lie');
    if (noeud.nodeEl) noeud.nodeEl.classList.add('zfa-cnv-est-survolee');
    hote.classList.add('zfa-cnv-a-un-survol');
  }

  _finSurvol() {
    this._survolee = null;
    const hote = this.vue.contentEl;
    if (!hote || !hote.querySelectorAll) return;
    hote.classList.remove('zfa-cnv-a-un-survol');
    for (const el of hote.querySelectorAll('.zfa-cnv-est-lie, .zfa-cnv-est-survolee')) {
      el.classList.remove('zfa-cnv-est-lie', 'zfa-cnv-est-survolee');
    }
  }

  // Tout ce que la carte affiche : si rien n'a changé, on ne touche pas au DOM.
  _signature(ref, d) {
    const t = d.parRef.get(ref);
    if (!t) return 'absente:' + ref;
    const fam = this.greffon.familleDe(t.famille);
    return JSON.stringify([ref, t.intitule, t.statut, t.priorite, t.echeance, t.jalon,
      fam.couleur, fam.icone, fam.nom, d.bloquee.has(ref), d.impactee.has(ref),
      d.av.has(ref) ? d.av.get(ref) : t.avancement,
      (d.enfants.get(ref) || []).length, d.jour]);
  }
  //#endregion Canevas · montage des cartes

  //#region Canevas · rendu des cartes
  _rendreCarte(m, d) {
    const ref = m.ref;
    const r = m.racine;
    r.replaceChildren();
    const carte = canevasEl(r, 'div', 'zfa-cnv-carte');
    const t = d.parRef.get(ref);
    if (!t) {
      carte.classList.add('est-introuvable');
      canevasEl(carte, 'div', 'zfa-cnv-titre', tr('Tâche introuvable : ') + ref);
      return;
    }
    const fam = this.greffon.familleDe(t.famille);
    carte.style.setProperty('--zfa-fam-couleur', fam.couleur || '#888888');
    carte.dataset.statut = t.statut;
    const bloquee = d.bloquee.has(ref);
    const impactee = !bloquee && d.impactee.has(ref);
    carte.classList.toggle('est-terminee', t.statut === 'terminée');
    carte.classList.toggle('est-abandonnee', t.statut === 'abandonnée');
    carte.classList.toggle('est-bloquee', bloquee);
    carte.classList.toggle('est-impactee', impactee);

    const tete = canevasEl(carte, 'div', 'zfa-cnv-tete');
    const coche = canevasEl(tete, 'input', 'zfa-cnv-coche task-list-item-checkbox');
    coche.type = 'checkbox';
    coche.checked = t.statut === 'terminée';
    canevasInfobulle(coche, tr('Terminée'));
    canevasIsoler(coche);
    coche.addEventListener('change', async () => {
      await this.greffon.basculerTermine(ref, coche.checked);
      this.integration.invalider();
    });
    const ic = canevasEl(tete, 'span', 'zfa-cnv-fam');
    obsidian.setIcon(ic, fam.icone || 'circle');
    canevasInfobulle(ic, fam.nom || t.famille || '');
    canevasEl(tete, 'span', 'zfa-cnv-ref', ref);
    if (t.jalon) {
      const j = canevasEl(tete, 'span', 'zfa-cnv-etat');
      obsidian.setIcon(j, 'diamond');
      canevasInfobulle(j, tr('Jalon'));
    }
    if (bloquee || impactee) {
      const e = canevasEl(tete, 'span', 'zfa-cnv-etat ' + (bloquee ? 'est-alerte' : 'est-avis'));
      obsidian.setIcon(e, bloquee ? 'octagon-alert' : 'arrow-down-to-dot');
      canevasInfobulle(e, bloquee
        ? tr('Bloquée : une tâche bloquante n’est pas close')
        : tr('Impactée : une sous-tâche est bloquée'));
    }
    const act = canevasEl(tete, 'span', 'zfa-cnv-actions');
    const bMod = canevasBouton(act, 'pencil', tr('Modifier la tâche'));
    canevasIsoler(bMod);
    bMod.addEventListener('click', () => this.modifier(ref));
    const bOuv = canevasBouton(act, 'file-text', tr('Ouvrir la note'));
    canevasIsoler(bOuv);
    bOuv.addEventListener('click', () => this.greffon.ouvrirNote(ref));

    canevasEl(carte, 'div', 'zfa-cnv-titre', t.intitule || ref);

    const pied = canevasEl(carte, 'div', 'zfa-cnv-pied');
    canevasEl(pied, 'span', 'zfa-cnv-pastille', t.statut);
    if (t.priorite) canevasEl(pied, 'span', 'zfa-cnv-priorite', t.priorite);
    if (t.echeance) {
      const e = canevasEl(pied, 'span', 'zfa-cnv-date');
      obsidian.setIcon(canevasEl(e, 'span', 'zfa-cnv-date-ic'), 'calendar-check');
      canevasEl(e, 'span', '', canevasDateCourte(t.echeance));
      const j = Ariane.jourValide(t.echeance);
      if (j && j < d.jour && !canevasClose(t)) {
        e.classList.add('est-depassee');
        canevasInfobulle(e, tr('Échéance dépassée'));
      } else canevasInfobulle(e, tr('Échéance'));
    }
    const nbEnf = (d.enfants.get(ref) || []).length;
    if (nbEnf) {
      const e = canevasEl(pied, 'span', 'zfa-cnv-compte');
      obsidian.setIcon(canevasEl(e, 'span', 'zfa-cnv-date-ic'), 'list-tree');
      canevasEl(e, 'span', '', String(nbEnf));
      canevasInfobulle(e, nbEnf + ' ' + (nbEnf > 1 ? tr('sous-tâches') : tr('sous-tâche')));
    }
    const av = d.av.has(ref) ? d.av.get(ref) : (Number(t.avancement) || 0);
    if (av > 0) {
      const j = canevasEl(carte, 'div', 'zfa-cnv-jauge');
      canevasEl(j, 'div', 'zfa-cnv-jauge-in').style.width = Math.min(100, Math.round(av)) + '%';
      canevasInfobulle(j, tr('Avancement : ') + Math.round(av) + ' %');
    }
  }

  // La hauteur du nœud suit la carte (titre sur plusieurs lignes, jauge…).
  // Jamais pendant un geste, ni sur un canevas en lecture seule.
  _ajusterHauteurs() {
    if (!this._aAjuster.size) return;
    if (this._interaction || this.canvas.readonly || this.vue.saving) return;
    const win = this._fenetre();
    let change = false;
    for (const noeud of this._aAjuster) {
      const m = this.cartes.get(noeud);
      if (!m || this.canvas.nodes.get(noeud.id) !== noeud) continue;
      const carte = m.racine.firstElementChild;
      if (!carte || !carte.offsetHeight) continue; // contenu non monté (zoom lointain)
      const d = canevasDonnees(noeud);
      if (!d) continue;
      const cont = noeud.nodeEl.querySelector('.canvas-node-container');
      let marge = 0;
      if (cont) {
        const st = win.getComputedStyle(cont);
        for (const k of ['borderTopWidth', 'borderBottomWidth', 'paddingTop', 'paddingBottom']) {
          marge += parseFloat(st[k]) || 0;
        }
      }
      const h = Math.max(CANEVAS_HAUTEUR_MIN, Math.ceil(carte.offsetHeight + marge) + 2);
      m.largeur = d.width;
      if (Math.abs((Number(d.height) || 0) - h) > 1) {
        try { noeud.setData(Object.assign({}, d, { height: h })); change = true; }
        catch (e) { /* nœud en cours de destruction */ }
      }
    }
    this._aAjuster.clear();
    if (change) this.canvas.requestSave();
  }
  //#endregion Canevas · rendu des cartes

  //#region Canevas · relations sur les arêtes
  _paireArete(arete, d) {
    if (!arete || !arete.from || !arete.to || !arete.from.node || !arete.to.node) return null;
    if (this.canvas.edges.get(arete.id) !== arete) return null;
    const a = canevasRefDuNoeud(this.greffon, arete.from.node);
    const b = canevasRefDuNoeud(this.greffon, arete.to.node);
    if (!a || !b || a === b || !d.parRef.has(a) || !d.parRef.has(b)) return null;
    return { a, b };
  }

  // Calque des relations : sur chaque arête qui relie deux tâches liées, une
  // pastille du côté de la mère (hiérarchie) et du côté de la bloquante
  // (blocage — rouge tant que la bloquante n'est pas close).
  _majCalque(d) {
    const hote = this.canvas.canvasEl;
    if (!hote) return;
    if (!this._calque || !hote.contains(this._calque)) {
      if (this._calque) this._calque.remove();
      this._calque = canevasEl(hote, 'div', 'zfa-cnv-calque');
      this._calque.setAttribute('aria-hidden', 'true');
      this._sigCalque = '';
    }
    // Un déplacement de la vue ne change ni les tracés ni les relations : on
    // ne reconstruit les pastilles que si la géométrie des arêtes, leurs
    // extrémités ou les données ont bougé. Le zoom passe par une variable CSS
    // (les pastilles gardent leur taille à l'écran).
    let sig = String(d.v);
    let zoom = null;
    for (const arete of this.canvas.edges.values()) {
      const ch = arete && arete.path && arete.path.display;
      if (!ch) continue;
      sig += '|' + arete.id + ':' + (ch.getAttribute('d') || '')
        + ':' + (arete.from && arete.from.node ? canevasRefDuNoeud(this.greffon, arete.from.node) : '')
        + '>' + (arete.to && arete.to.node ? canevasRefDuNoeud(this.greffon, arete.to.node) : '');
      if (zoom == null && ch.isConnected && typeof ch.getScreenCTM === 'function') {
        const m = ch.getScreenCTM();
        if (m) zoom = Math.hypot(m.a, m.b);
      }
    }
    if (zoom && Number.isFinite(zoom)) this._calque.style.setProperty('--zfa-cnv-echelle', String(1 / zoom));
    if (sig === this._sigCalque) return;
    this._sigCalque = sig;
    this._calque.replaceChildren();
    for (const arete of this.canvas.edges.values()) {
      const paire = this._paireArete(arete, d);
      const chemin = arete && arete.path && arete.path.display;
      if (!paire || !chemin || !chemin.isConnected || typeof chemin.getPointAtLength !== 'function') continue;
      const { a, b } = paire;
      const marques = [];
      if (this.integration.relation(d, a, b, 'hier')) marques.push({ type: 'hier', source: true });
      else if (this.integration.relation(d, b, a, 'hier')) marques.push({ type: 'hier', source: false });
      const blAB = this.integration.relation(d, a, b, 'bloque');
      const blBA = this.integration.relation(d, b, a, 'bloque');
      if (blAB || blBA) {
        const bloquante = d.parRef.get(blAB ? a : b);
        marques.push({ type: 'bloque', source: blAB, resolu: canevasClose(bloquante) });
      }
      if (!marques.length) continue;
      try {
        const L = chemin.getTotalLength();
        if (!Number.isFinite(L) || L <= 0) continue;
        const memeCote = marques.length === 2 && marques[0].source === marques[1].source;
        marques.forEach((mq, i) => {
          let f = mq.source ? 0.25 : 0.75;
          if (memeCote) f = mq.source ? (i === 0 ? 0.33 : 0.17) : (i === 0 ? 0.67 : 0.83);
          const p = chemin.getPointAtLength(L * f);
          const el = canevasEl(this._calque, 'span', 'zfa-cnv-marque zfa-cnv-marque-' + mq.type
            + (mq.type === 'bloque' ? (mq.resolu ? ' est-resolu' : ' est-actif') : ''));
          obsidian.setIcon(el, mq.type === 'hier' ? 'git-branch' : 'octagon-x');
          el.style.left = p.x + 'px';
          el.style.top = p.y + 'px';
        });
      } catch (e) { /* chemin détaché : pas de géométrie */ }
    }
  }

  // Écrit ou retire une relation depuis la barre du canevas. La logique
  // (cycles, blocage dérivé) est celle du greffon, partout la même.
  async basculerRelation(type, de, vers, actif) {
    if (this._occupe) return;
    this._occupe = true;
    this._sigControles = '';
    try {
      if (type === 'hier') await this.greffon.rattacher(vers, actif ? '' : de);
      else if (actif) await this.greffon.retirerBlocage(de, vers);
      else await this.greffon.creerBlocage(de, vers);
    } finally {
      this._occupe = false;
      this.integration.invalider();
    }
  }
  //#endregion Canevas · relations sur les arêtes

  //#region Canevas · tracé des liens
  // Forme des liens entre deux tâches : 'courbe' (celle du canevas),
  // 'angulaire' (à angles droits, en contournant les cartes) ou 'droite'.
  _modeLiens() {
    const m = this.greffon.settings.canevasLiens;
    return m === 'courbe' || m === 'droite' ? m : 'angulaire';
  }

  // Ce qu'il faut savoir d'une arête entre deux tâches pour la tracer, ou null.
  _geometrieArete(arete) {
    if (!arete || !arete.from || !arete.to || !arete.from.node || !arete.to.node) return null;
    if (this.canvas.edges.get(arete.id) !== arete) return null;
    if (!canevasRefDuNoeud(this.greffon, arete.from.node) || !canevasRefDuNoeud(this.greffon, arete.to.node)) return null;
    const r1 = canevasDonnees(arete.from.node);
    const r2 = canevasDonnees(arete.to.node);
    if (!r1 || !r2) return null;
    return { r1, r2, c1: arete.from.side || 'right', c2: arete.to.side || 'left' };
  }

  // Les boîtes que les liens contournent (tous les nœuds, sauf les groupes),
  // et leur signature : un tracé n'est recalculé que si elle change.
  _obstacles() {
    const boites = [];
    for (const n of this.canvas.nodes.values()) {
      const r = canevasDonnees(n);
      if (r && r.type !== 'group') boites.push({ x: r.x, y: r.y, width: r.width, height: r.height });
    }
    const sig = this._modeLiens() + '|' + boites.map((r) => r.x + ',' + r.y + ',' + r.width + ',' + r.height).join(';');
    return { boites, sig };
  }

  // Le tracé (points) d'une arête, recalculé seulement si sa géométrie, ou
  // celle des cartes, a changé.
  _route(arete, mode, obs) {
    const g = this._geometrieArete(arete);
    if (!g) { this._routes.delete(arete); return null; }
    const cle = obs.sig + '|' + [g.r1.x, g.r1.y, g.r1.width, g.r1.height, g.c1,
      g.r2.x, g.r2.y, g.r2.width, g.r2.height, g.c2, !!arete.fromLineEnd, !!arete.toLineEnd].join(',');
    const deja = this._routes.get(arete);
    if (deja && deja.cle === cle) return deja.pts;
    // Comme le canevas : là où une pointe se pose, le tracé s'arrête 7 px
    // avant le bord (la pointe fait le reste) ; sinon il part du bord même.
    const decale = (p, c, pointe) => {
      const n = CANEVAS_NORMALE[c] || CANEVAS_NORMALE.right;
      return pointe ? { x: p.x + n[0] * 7, y: p.y + n[1] * 7 } : p;
    };
    const p1 = decale(canevasPort(g.r1, g.c1), g.c1, !!arete.fromLineEnd);
    const p2 = decale(canevasPort(g.r2, g.c2), g.c2, !!arete.toLineEnd);
    let pts;
    if (mode === 'droite') {
      const n1 = CANEVAS_NORMALE[g.c1] || CANEVAS_NORMALE.right;
      const n2 = CANEVAS_NORMALE[g.c2] || CANEVAS_NORMALE.left;
      pts = canevasSimplifier([p1, { x: p1.x + n1[0] * 17, y: p1.y + n1[1] * 17 }, { x: p2.x + n2[0] * 17, y: p2.y + n2[1] * 17 }, p2]);
    } else {
      pts = canevasRouteOrtho(p1, g.c1, p2, g.c2, obs.boites, { amorce: 17 });
    }
    this._routes.set(arete, { cle, pts });
    return pts;
  }

  // Pose le `d` d'Ariane sur le tracé visible et sur la zone cliquable.
  _poserD(arete, d) {
    const p = arete.path;
    if (!p || !p.display || !d) return;
    if (p.display.getAttribute('d') !== d) p.display.setAttribute('d', d);
    if (p.interaction && p.interaction.getAttribute('d') !== d) p.interaction.setAttribute('d', d);
    this._poses.set(arete, d);
  }

  _dDe(arete, mode, pts) {
    if (mode === 'droite') return canevasCheminDroit(pts);
    let ponts = [];
    if (this.greffon.settings.canevasPonts !== false) {
      const autres = [];
      for (const [a, r] of this._routes) if (a !== arete && r && r.pts) autres.push(r.pts);
      ponts = canevasPontsOrtho(pts, autres, 5);
    }
    return canevasCheminOrtho(pts, 10, ponts, 5);
  }

  // Le canevas recalcule le tracé d'une arête quand l'une de ses cartes
  // bouge : on repasse derrière lui, dans le même geste, pour qu'aucune
  // courbe ne s'affiche entre deux images. Propriété d'INSTANCE, rendue au
  // déchargement.
  _envelopperArete(arete) {
    if (this._enveloppes.has(arete) || typeof arete.updatePath !== 'function') return;
    const orig = arete.updatePath;
    const desc = Object.getOwnPropertyDescriptor(arete, 'updatePath');
    const surface = this;
    const nous = function (...args) {
      const r = orig.apply(this, args);
      try {
        const mode = surface._modeLiens();
        if (mode !== 'courbe' && surface._actif) {
          const pts = surface._route(this, mode, surface._obstacles());
          if (pts) surface._poserD(this, surface._dDe(this, mode, pts));
        }
      } catch (e) { /* le tracé natif reste */ }
      return r;
    };
    arete.updatePath = nous;
    this._enveloppes.set(arete, () => {
      if (arete.updatePath !== nous) return;
      if (desc) Object.defineProperty(arete, 'updatePath', desc);
      else delete arete.updatePath;
    });
  }

  // Une passe sur tous les liens : tracés (si la géométrie a changé), ponts,
  // et classes de style selon la relation.
  _majLiens(d) {
    const mode = this._modeLiens();
    const style = this.greffon.settings.canevasStyleRelation !== false;
    for (const [a, rendre] of this._enveloppes) {
      if (this.canvas.edges.get(a.id) !== a) { rendre(); this._enveloppes.delete(a); this._routes.delete(a); this._poses.delete(a); }
    }
    if (mode === 'courbe') { this._rendreLiensNatifs(); }
    const liens = [];
    for (const arete of this.canvas.edges.values()) {
      const paire = this._paireArete(arete, d);
      const type = !paire ? ''
        : (this.integration.relation(d, paire.a, paire.b, 'bloque') || this.integration.relation(d, paire.b, paire.a, 'bloque')) ? 'bloque'
          : (this.integration.relation(d, paire.a, paire.b, 'hier') || this.integration.relation(d, paire.b, paire.a, 'hier')) ? 'hier' : '';
      for (const el of [arete.lineGroupEl, arete.lineEndGroupEl]) {
        if (!el || !el.classList) continue;
        el.classList.toggle('zfa-cnv-lien-hier', style && type === 'hier');
        el.classList.toggle('zfa-cnv-lien-bloque', style && type === 'bloque');
      }
      if (mode === 'courbe') continue;
      this._envelopperArete(arete);
      if (this._geometrieArete(arete)) liens.push(arete);
    }
    if (mode === 'courbe') return;
    // Les tracés d'abord, tous : les ponts se calculent contre les autres.
    const obs = this._obstacles();
    for (const a of liens) this._route(a, mode, obs);
    for (const a of liens) {
      const r = this._routes.get(a);
      if (r) this._poserD(a, this._dDe(a, mode, r.pts));
    }
  }

  // Rend aux liens le tracé du canevas (courbe), et à leurs méthodes leur forme.
  _rendreLiensNatifs() {
    for (const [a, rendre] of this._enveloppes) {
      rendre();
      if (this._poses.has(a) && typeof a.updatePath === 'function') {
        try { a.updatePath(); } catch (e) { /* arête partie */ }
      }
    }
    this._enveloppes.clear();
    this._poses.clear();
    this._routes.clear();
  }
  //#endregion Canevas · tracé des liens

  //#region Canevas · barre de sélection
  // La barre flottante native du canevas se reconstruit à chaque sélection :
  // on s'y greffe après son propre rendu.
  _envelopperBarre() {
    const menu = this.canvas.menu;
    if (!menu || !menu.menuEl || typeof menu.render !== 'function') return;
    const orig = menu.render;
    const desc = Object.getOwnPropertyDescriptor(menu, 'render');
    const surface = this;
    const nous = function (...args) {
      const r = orig.apply(this, args);
      surface._sigControles = '';
      surface.planifier(false);
      return r;
    };
    menu.render = nous;
    this.register(() => {
      if (menu.render !== nous) return;
      if (desc) Object.defineProperty(menu, 'render', desc);
      else delete menu.render;
    });
  }

  _retirerControles() {
    if (this._controles) this._controles.remove();
    this._controles = null;
    this._sigControles = '';
  }

  _majControles(d) {
    const menuEl = this.canvas.menu && this.canvas.menu.menuEl;
    const sel = this.canvas.selection ? [...this.canvas.selection] : [];
    if (!menuEl || !menuEl.isConnected || sel.length !== 1) { this._retirerControles(); return; }
    const el = sel[0];
    const paire = el && el.from && el.to ? this._paireArete(el, d) : null;
    const m = !paire ? this.cartes.get(el) : null;
    if (!paire && !m) { this._retirerControles(); return; }
    const sig = paire
      ? JSON.stringify(['arete', el.id, paire.a, paire.b, d.v, this._occupe, this.canvas.readonly])
      : JSON.stringify(['carte', el.id, m.ref, d.v, this.canvas.readonly]);
    if (sig === this._sigControles && this._controles && this._controles.parentElement === menuEl) return;
    this._retirerControles();
    this._sigControles = sig;
    const zone = canevasEl(menuEl, 'div', 'zfa-cnv-controles');
    this._controles = zone;
    if (paire) this._controlesArete(zone, paire, d);
    else this._controlesCarte(zone, el, m.ref, d);
  }

  _controlesArete(zone, paire, d) {
    const { a, b } = paire;
    const nom = (ref) => { const t = d.parRef.get(ref); return (t && t.intitule) ? ref + ' · ' + t.intitule : ref; };
    const lecture = this.canvas.readonly;
    const boutons = [
      { type: 'hier', de: a, vers: b, icone: 'git-branch', sens: '→',
        lignes: [tr('Mère : ') + nom(a), tr('Sous-tâche : ') + nom(b)] },
      { type: 'hier', de: b, vers: a, icone: 'git-branch', sens: '←',
        lignes: [tr('Mère : ') + nom(b), tr('Sous-tâche : ') + nom(a)] },
      { type: 'bloque', de: a, vers: b, icone: 'octagon-x', sens: '→',
        lignes: [tr('Bloquante : ') + nom(a), tr('Bloquée : ') + nom(b)] },
      { type: 'bloque', de: b, vers: a, icone: 'octagon-x', sens: '←',
        lignes: [tr('Bloquante : ') + nom(b), tr('Bloquée : ') + nom(a)] },
    ];
    for (const x of boutons) {
      const actif = this.integration.relation(d, x.de, x.vers, x.type);
      const bt = canevasEl(zone, 'button', 'clickable-icon zfa-cnv-relation' + (actif ? ' is-active' : ''));
      bt.type = 'button';
      bt.setAttribute('aria-pressed', String(actif));
      obsidian.setIcon(canevasEl(bt, 'span', 'zfa-cnv-relation-ic'), x.icone);
      canevasEl(bt, 'span', 'zfa-cnv-relation-sens', x.sens);
      const titre = (actif ? tr('Relation en place (clic : retirer)') : tr('Ajouter la relation'))
        + '\n' + x.lignes.join('\n');
      canevasInfobulle(bt, titre);
      bt.disabled = lecture || this._occupe;
      canevasIsoler(bt);
      bt.addEventListener('click', () => this.basculerRelation(x.type, x.de, x.vers, actif));
    }
  }

  _controlesCarte(zone, noeud, ref, d) {
    const surCanevas = this._refsSurCanevas();
    const enfantsHors = (d.enfants.get(ref) || []).filter((r) => !surCanevas.has(r));
    const bloqHors = (d.bloquantes.get(ref) || []).filter((r) => !surCanevas.has(r));
    const ajout = (icone, texte, action, desactive) => {
      const b = canevasBouton(zone, icone, texte, 'zfa-cnv-controle');
      b.disabled = !!desactive;
      canevasIsoler(b);
      b.addEventListener('click', action);
    };
    ajout('pencil', tr('Modifier la tâche'), () => this.modifier(ref));
    ajout('file-text', tr('Ouvrir la note'), () => this.greffon.ouvrirNote(ref));
    ajout('list-tree', enfantsHors.length
      ? tr('Poser ses sous-tâches') + ' (' + enfantsHors.length + ')'
      : tr('Aucune sous-tâche hors du canevas'),
    () => this.ajouterRelatives(noeud, 'hier'), !enfantsHors.length || this.canvas.readonly);
    ajout('octagon-alert', bloqHors.length
      ? tr('Poser ses tâches bloquantes') + ' (' + bloqHors.length + ')'
      : tr('Aucune tâche bloquante hors du canevas'),
    () => this.ajouterRelatives(noeud, 'bloque'), !bloqHors.length || this.canvas.readonly);
    ajout('plus-square', tr('Nouvelle sous-tâche…'), () => {
      const p = canevasDonnees(noeud);
      const pt = p ? { x: p.x + p.width / 2, y: p.y + p.height + 150 } : this._centre();
      this.nouvelleTache(pt, { parent: ref, source: noeud, cotes: { de: 'bottom', vers: 'top' } });
    }, this.canvas.readonly);
  }
  //#endregion Canevas · barre de sélection

  //#region Canevas · menus et création
  // Clic droit / double-clic sur le fond : poser une tâche existante ou en
  // créer une à cet endroit.
  _envelopperMenuCreation() {
    const c = this.canvas;
    if (typeof c.showCreationMenu !== 'function') return;
    const orig = c.showCreationMenu;
    const desc = Object.getOwnPropertyDescriptor(c, 'showCreationMenu');
    const surface = this;
    const nous = function (menu, point, ...args) {
      const r = orig.apply(this, [menu, point, ...args]);
      try {
        if (surface._actif && !c.readonly && menu && typeof menu.addItem === 'function') {
          const pt = point && Number.isFinite(point.x) ? { x: point.x, y: point.y } : surface._centre();
          menu.addItem((i) => i.setTitle(tr('Tâche Ariane existante…')).setIcon('list-checks')
            .onClick(() => surface.choisirTache(pt)));
          menu.addItem((i) => i.setTitle(tr('Nouvelle tâche Ariane…')).setIcon('square-plus')
            .onClick(() => surface.nouvelleTache(pt)));
        }
      } catch (e) { /* menu natif changé : on s'efface */ }
      return r;
    };
    c.showCreationMenu = nous;
    this.register(() => {
      if (c.showCreationMenu !== nous) return;
      if (desc) Object.defineProperty(c, 'showCreationMenu', desc);
      else delete c.showCreationMenu;
    });
  }

  // Clic droit sur un nœud.
  menuNoeud(menu, noeud) {
    if (!menu || typeof menu.addItem !== 'function') return;
    const lecture = this.canvas.readonly;
    const ref = canevasRefDuNoeud(this.greffon, noeud);
    const d = canevasDonnees(noeud) || {};
    if (ref) {
      const tache = this.integration.donnees().parRef.get(ref);
      menu.addSeparator();
      menu.addItem((i) => i.setTitle(tr('Modifier la tâche…')).setIcon('pencil')
        .onClick(() => this.modifier(ref)));
      menu.addItem((i) => i.setTitle(tr('Ouvrir la note')).setIcon('file-text')
        .onClick(() => this.greffon.ouvrirNote(ref)));
      if (!lecture) {
        menu.addItem((i) => i.setTitle(tr('Poser ses sous-tâches')).setIcon('list-tree')
          .onClick(() => this.ajouterRelatives(noeud, 'hier')));
        menu.addItem((i) => i.setTitle(tr('Poser ses tâches bloquantes')).setIcon('octagon-alert')
          .onClick(() => this.ajouterRelatives(noeud, 'bloque')));
        menu.addItem((i) => i.setTitle(tr('Retirer ses sous-tâches du canevas')).setIcon('list-collapse')
          .onClick(() => this.retirerSousTaches(noeud)));
        menu.addItem((i) => i.setTitle(tr('Tracer ses relations sur le canevas')).setIcon('waypoints')
          .onClick(() => {
            const n = this.relier([noeud]);
            new obsidian.Notice(n ? n + ' ' + tr('lien(s) tracé(s)') : tr('Aucune relation à tracer.'));
          }));
      }
      if (typeof this.greffon.ouvrirDecoupage === 'function') {
        menu.addItem((i) => i.setTitle(tr('Découper la tâche (IA)…')).setIcon('sparkles')
          .onClick(() => this.greffon.ouvrirDecoupage(ref)));
      }
      if (tache && typeof this.greffon.supprimerTache === 'function') {
        menu.addItem((i) => i.setTitle(tr('Supprimer la tâche…')).setIcon('trash-2')
          .onClick(() => this.supprimerTache(ref, noeud)));
      }
      return;
    }
    if (lecture) return;
    if (d.type === 'text') {
      menu.addSeparator();
      menu.addItem((i) => i.setTitle(tr('Convertir en tâche Ariane…')).setIcon('square-check')
        .onClick(() => this.convertirTexte(noeud)));
      return;
    }
    if (d.type === 'file' && typeof d.file === 'string' && /\.md$/i.test(d.file)) {
      menu.addSeparator();
      menu.addItem((i) => i.setTitle(tr('Créer une tâche liée à cette note…')).setIcon('square-plus')
        .onClick(() => this.tacheDepuisNote(noeud)));
    }
  }

  // Connexion tirée d'un nœud et lâchée dans le vide.
  menuConnexion(menu, noeud, arete) {
    if (!menu || typeof menu.addItem !== 'function' || this.canvas.readonly) return;
    const cx = this._captureConnexion(noeud, arete);
    if (!cx) return;
    const ref = canevasRefDuNoeud(this.greffon, noeud);
    const consommer = () => {
      if (cx.apercu && this.canvas.edges.get(cx.apercu.id) === cx.apercu
        && typeof this.canvas.removeEdge === 'function') {
        try { this.canvas.removeEdge(cx.apercu); } catch (e) { /* déjà retiré */ }
      }
    };
    const base = { source: noeud, cotes: { de: cx.de, vers: cx.vers }, position: cx.vers };
    if (ref) {
      menu.addItem((i) => i.setTitle(tr('Nouvelle sous-tâche…')).setIcon('list-tree')
        .onClick(() => { consommer(); this.nouvelleTache(cx.point, Object.assign({ parent: ref }, base)); }));
      menu.addItem((i) => i.setTitle(tr('Nouvelle tâche bloquée par celle-ci…')).setIcon('octagon-x')
        .onClick(() => { consommer(); this.nouvelleTache(cx.point, Object.assign({ bloquante: ref }, base)); }));
      menu.addItem((i) => i.setTitle(tr('Sous-tâche existante…')).setIcon('list-checks')
        .onClick(() => { consommer(); this.choisirTache(cx.point, Object.assign({ parent: ref }, base)); }));
      return;
    }
    menu.addItem((i) => i.setTitle(tr('Nouvelle tâche Ariane…')).setIcon('square-plus')
      .onClick(() => { consommer(); this.nouvelleTache(cx.point, base); }));
    menu.addItem((i) => i.setTitle(tr('Tâche Ariane existante…')).setIcon('list-checks')
      .onClick(() => { consommer(); this.choisirTache(cx.point, base); }));
  }

  // Extrémité provisoire de la connexion lâchée : sa position (coordonnées du
  // canevas) et les côtés à relier.
  _captureConnexion(noeud, arete) {
    if (!arete || !arete.from || arete.from.node !== noeud || !arete.to || !arete.to.node) return null;
    // L'extrémité d'une connexion lâchée dans le vide est un nœud provisoire,
    // absent du canevas ; un vrai nœud ici, ce n'est pas notre cas.
    if (arete.to.node.id && this.canvas.nodes.has(arete.to.node.id)) return null;
    const x = arete.to.node.x;
    const y = arete.to.node.y;
    const de = arete.from.side;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !CANEVAS_OPPOSE[de]) return null;
    return { point: { x, y }, de, vers: CANEVAS_OPPOSE[de], apercu: arete };
  }

  _centre() {
    try { if (typeof this.canvas.posCenter === 'function') return this.canvas.posCenter(); }
    catch (e) { /* repli */ }
    const b = typeof this.canvas.getViewportBBox === 'function' ? this.canvas.getViewportBBox() : null;
    return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 };
  }

  _largeur() {
    const n = Number(this.greffon.settings.canevasLargeurCarte);
    return Number.isFinite(n) && n >= 180 ? n : CANEVAS_LARGEUR_DEFAUT;
  }

  // ref → nœuds de carte présents sur ce canevas.
  _noeudsParRef() {
    const m = new Map();
    for (const noeud of this.canvas.nodes.values()) {
      const ref = canevasRefDuNoeud(this.greffon, noeud);
      if (!ref) continue;
      if (!m.has(ref)) m.set(ref, []);
      m.get(ref).push(noeud);
    }
    return m;
  }

  _refsSurCanevas() { return new Set(this._noeudsParRef().keys()); }

  // Montre une carte déjà posée plutôt que d'en poser une seconde.
  montrer(noeud) {
    try {
      this.canvas.selectOnly(noeud);
      if (typeof this.canvas.zoomToSelection === 'function') this.canvas.zoomToSelection();
    } catch (e) { /* rien */ }
  }

  // Pose des cartes. `opts` : { source, cotes, position, relier } — une
  // connexion part de `source` vers la première carte posée.
  async inserer(refs, point, opts) {
    const o = opts || {};
    const c = this.canvas;
    if (c.readonly || !refs.length) return [];
    const larg = this._largeur();
    try { if (c.requestPushHistory && typeof c.requestPushHistory.run === 'function') c.requestPushHistory.run(); }
    catch (e) { /* historique indisponible */ }
    try {
      if (c.history && Array.isArray(c.history.data) && !c.history.data.length && typeof c.pushHistory === 'function') {
        c.pushHistory(c.getData());
      }
    } catch (e) { /* historique indisponible */ }
    const noeuds = [];
    const n = refs.length;
    const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
    refs.forEach((ref, i) => {
      const pos = n === 1 ? point : {
        x: point.x + ((i % cols) - (cols - 1) / 2) * (larg + 40),
        y: point.y + Math.floor(i / cols) * 150,
      };
      const opt = { pos, size: { width: larg, height: 110 }, text: '[[' + ref + ']]', save: false, focus: false };
      if (i === 0 && o.position) opt.position = o.position;
      const noeud = c.createTextNode(opt);
      noeud.setData(Object.assign({}, canevasDonnees(noeud), { [CANEVAS_CLE]: { v: 1, ref } }));
      noeuds.push(noeud);
    });
    if (o.source && o.cotes && c.nodes.get(o.source.id) === o.source) {
      this._arete(o.source, noeuds[0], o.cotes, o.couleur);
    }
    if (o.relier !== false && this.greffon.settings.canevasRelierAuto !== false) this.relier(noeuds);
    c.requestSave();
    try { if (typeof c.pushHistory === 'function') c.pushHistory(c.getData()); } catch (e) { /* rien */ }
    if (noeuds.length === 1) c.selectOnly(noeuds[0]);
    this.planifier(true);
    return noeuds;
  }

  _arete(nDe, nVers, cotes, couleur) {
    const c = this.canvas;
    if (typeof c.importData !== 'function') return false;
    const id = canevasNouvelId();
    const a = { id, fromNode: nDe.id, fromSide: cotes.de, fromEnd: 'none',
      toNode: nVers.id, toSide: cotes.vers, toEnd: 'arrow' };
    if (couleur) a.color = couleur;
    try { c.importData({ nodes: [], edges: [a] }, false); }
    catch (e) { return false; }
    return c.edges.has(id);
  }

  // Trace une arête pour chaque relation (mère → sous-tâche, bloquante →
  // bloquée) entre les cartes données et les autres cartes du canevas, sans
  // doubler une arête existante entre les mêmes nœuds. Rend le nombre tracé.
  relier(noeuds, tous) {
    const c = this.canvas;
    if (c.readonly) return 0;
    const d = this.integration.donnees();
    const cartes = [];
    for (const noeud of c.nodes.values()) {
      const ref = canevasRefDuNoeud(this.greffon, noeud);
      if (ref && d.parRef.has(ref)) cartes.push({ noeud, ref });
    }
    const paires = new Set();
    for (const a of c.edges.values()) {
      if (a && a.from && a.to && a.from.node && a.to.node) {
        paires.add([a.from.node.id, a.to.node.id].sort().join('|'));
      }
    }
    const sources = tous ? cartes : cartes.filter((x) => noeuds.includes(x.noeud));
    let n = 0;
    for (const x of sources) {
      for (const y of cartes) {
        if (x.noeud === y.noeud || x.ref === y.ref) continue;
        const cle = [x.noeud.id, y.noeud.id].sort().join('|');
        if (paires.has(cle)) continue;
        let de = null;
        let vers = null;
        let bloc = false;
        if (this.integration.relation(d, x.ref, y.ref, 'bloque')) { de = x; vers = y; bloc = true; }
        else if (this.integration.relation(d, y.ref, x.ref, 'bloque')) { de = y; vers = x; bloc = true; }
        else if (this.integration.relation(d, x.ref, y.ref, 'hier')) { de = x; vers = y; }
        else if (this.integration.relation(d, y.ref, x.ref, 'hier')) { de = y; vers = x; }
        if (!de) continue;
        const dd = canevasDonnees(de.noeud);
        const dv = canevasDonnees(vers.noeud);
        if (!dd || !dv) continue;
        if (this._arete(de.noeud, vers.noeud, canevasCotes(dd, dv), bloc ? CANEVAS_COULEUR_BLOCAGE : '')) {
          paires.add(cle);
          n += 1;
        }
      }
    }
    if (n) c.requestSave();
    return n;
  }

  tracerTout() {
    const n = this.relier([], true);
    new obsidian.Notice(n ? n + ' ' + tr('lien(s) tracé(s)') : tr('Toutes les relations sont déjà tracées.'));
  }

  // Pose les sous-tâches (sous la carte) ou les bloquantes (à sa gauche) qui
  // ne sont pas encore sur le canevas.
  async ajouterRelatives(noeud, type) {
    const ref = canevasRefDuNoeud(this.greffon, noeud);
    const p = canevasDonnees(noeud);
    if (!ref || !p) return;
    const d = this.integration.donnees();
    const sur = this._refsSurCanevas();
    const cibles = ((type === 'hier' ? d.enfants.get(ref) : d.bloquantes.get(ref)) || [])
      .filter((r) => !sur.has(r));
    if (!cibles.length) {
      new obsidian.Notice(type === 'hier' ? tr('Aucune sous-tâche hors du canevas.')
        : tr('Aucune tâche bloquante hors du canevas.'));
      return;
    }
    const larg = this._largeur();
    const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(cibles.length))));
    const lignes = Math.ceil(cibles.length / cols);
    const point = type === 'hier'
      ? { x: p.x + p.width / 2, y: p.y + p.height + 160 }
      : { x: p.x - (larg + 40) * cols / 2 - 80, y: p.y + p.height / 2 - (lignes - 1) * 75 };
    await this.inserer(cibles, point, {});
  }

  // Un point sous tout ce que porte le canevas (centre de la vue s'il est vide).
  _pointLibre() {
    const ds = [...this.canvas.nodes.values()].map(canevasDonnees).filter(Boolean);
    if (!ds.length) return this._centre();
    const x = Math.min(...ds.map((d) => d.x));
    const y = Math.max(...ds.map((d) => d.y + d.height));
    return { x: x + this._largeur() / 2, y: y + 170 };
  }

  // Une étape de l'historique du canevas, pour que ⌘Z défasse le geste entier.
  _historique() {
    const c = this.canvas;
    try { if (typeof c.pushHistory === 'function') c.pushHistory(c.getData()); } catch (e) { /* indisponible */ }
  }

  // Déplace un nœud ; le canevas recale alors ses arêtes.
  _deplacerNoeud(noeud, x, y) {
    try {
      if (typeof noeud.moveTo === 'function') noeud.moveTo({ x, y });
      else noeud.setData(Object.assign({}, canevasDonnees(noeud), { x, y }));
    } catch (e) { /* nœud parti */ }
  }

  // Après un déplacement d'ensemble, chaque arête entre deux tâches repart du
  // côté de sa source qui regarde sa cible.
  _recalerCotes() {
    const c = this.canvas;
    if (typeof c.removeEdge !== 'function' || typeof c.importData !== 'function') return;
    for (const a of [...c.edges.values()]) {
      if (!a || !a.from || !a.to || !a.from.node || !a.to.node) continue;
      if (!canevasRefDuNoeud(this.greffon, a.from.node) || !canevasRefDuNoeud(this.greffon, a.to.node)) continue;
      const dd = canevasDonnees(a.from.node);
      const dv = canevasDonnees(a.to.node);
      const brut = typeof a.getData === 'function' ? a.getData() : null;
      if (!dd || !dv || !brut) continue;
      const cotes = canevasCotes(dd, dv);
      if (brut.fromSide === cotes.de && brut.toSide === cotes.vers) continue;
      try {
        c.removeEdge(a);
        c.importData({ nodes: [], edges: [Object.assign({}, brut, { fromSide: cotes.de, toSide: cotes.vers })] }, false);
      } catch (e) { /* arête laissée telle quelle */ }
    }
  }

  // Re-disposer : les tâches du canevas rangées comme l'était le graphe, la
  // hiérarchie de gauche à droite et les blocages en aval. Les autres nœuds
  // (notes, textes, groupes) ne bougent pas.
  redisposer() {
    const c = this.canvas;
    if (c.readonly) return;
    const d = this.integration.donnees();
    const parRef = this._noeudsParRef();
    const taches = [...parRef.keys()].map((r) => d.parRef.get(r)).filter(Boolean);
    if (taches.length < 2) { new obsidian.Notice(tr('Pas assez de tâches à disposer.')); return; }
    const { noeuds, aretes } = Ariane.grapheArticulation(taches);
    const larg = this._largeur();
    const haut = (ref) => { const x = canevasDonnees((parRef.get(ref) || [])[0]); return (x && x.height) || 110; };
    const pos = Ariane.disposerArticulation(noeuds, aretes, { dx: larg + 120, gapY: 40, gapBande: 120, hauteur: haut });
    const actuels = taches.map((t) => canevasDonnees(parRef.get(t.ref)[0])).filter(Boolean);
    const ox = Math.min(...actuels.map((x) => x.x));
    const oy = Math.min(...actuels.map((x) => x.y));
    const ps = [...pos.values()];
    if (!ps.length) return;
    const px = Math.min(...ps.map((p) => p.x));
    const py = Math.min(...ps.map((p) => p.y));
    this._historique();
    for (const [ref, p] of pos) {
      const n = (parRef.get(ref) || [])[0];
      if (n) this._deplacerNoeud(n, Math.round(ox + p.x - px), Math.round(oy + p.y - py));
    }
    this._recalerCotes();
    c.requestSave();
    this._historique();
    this.planifier(true);
    new obsidian.Notice(tr('Disposition recalculée.'));
  }

  // « + » : pose le niveau suivant de sous-tâches, sous leurs mères.
  async deplierNiveau() {
    if (this.canvas.readonly) return;
    const d = this.integration.donnees();
    const parRef = this._noeudsParRef();
    const meres = [...parRef.keys()].filter((r) => (d.enfants.get(r) || []).some((e) => !parRef.has(e)));
    if (!meres.length) { new obsidian.Notice(tr('Toutes les sous-tâches sont déjà sur le canevas.')); return; }
    for (const r of meres) await this.ajouterRelatives(parRef.get(r)[0], 'hier');
  }

  // « − » : retire du canevas le niveau de sous-tâches le plus profond.
  replierNiveau() {
    if (this.canvas.readonly) return;
    const d = this.integration.donnees();
    const parRef = this._noeudsParRef();
    const mereDe = new Map();
    const aEnfant = new Set();
    for (const r of parRef.keys()) {
      const m = d.parent.get(r);
      if (m && parRef.has(m)) { mereDe.set(r, m); aEnfant.add(m); }
    }
    const feuilles = [...mereDe.keys()].filter((r) => !aEnfant.has(r));
    if (!feuilles.length) { new obsidian.Notice(tr('Aucune sous-tâche à retirer.')); return; }
    const prof = (r) => { let n = 0; const vus = new Set(); while (mereDe.has(r) && !vus.has(r)) { vus.add(r); r = mereDe.get(r); n += 1; } return n; };
    const max = Math.max(...feuilles.map(prof));
    this._retirerRefs(feuilles.filter((r) => prof(r) === max), parRef);
  }

  // Retire du canevas le sous-arbre d'une carte (ce qui n'y tient que par elle).
  retirerSousTaches(noeud) {
    const ref = canevasRefDuNoeud(this.greffon, noeud);
    if (!ref || this.canvas.readonly) return;
    const d = this.integration.donnees();
    const parRef = this._noeudsParRef();
    const refs = Ariane.replierRelatifs(ref, Ariane.grapheArticulation(d.toutes).aretes, new Set(parRef.keys()), 'hier');
    if (!refs.length) { new obsidian.Notice(tr('Aucune sous-tâche à retirer.')); return; }
    this._retirerRefs(refs, parRef);
  }

  // Les cartes s'en vont ; les notes de tâche restent.
  _retirerRefs(refs, parRef) {
    const c = this.canvas;
    if (typeof c.removeNode !== 'function') return;
    this._historique();
    for (const r of refs) for (const n of parRef.get(r) || []) { try { c.removeNode(n); } catch (e) { /* déjà parti */ } }
    c.requestSave();
    this._historique();
    this.planifier(true);
    new obsidian.Notice(refs.length + ' ' + tr('carte(s) retirée(s) du canevas'));
  }

  // Sélecteur de tâches existantes (toutes, les ouvertes d'abord).
  choisirTache(point, opts) {
    const o = opts || {};
    const d = this.integration.donnees();
    const sur = this._noeudsParRef();
    const items = d.toutes
      .filter((t) => t.ref !== o.parent)
      .sort((a, b) => (canevasClose(a) - canevasClose(b)) || String(a.ref).localeCompare(String(b.ref)))
      .map((t) => ({
        cle: t.ref,
        nom: t.ref + ' · ' + (t.intitule || '') + (canevasClose(t) ? '  (' + t.statut + ')' : '')
          + (sur.has(t.ref) ? '  ✓' : ''),
      }));
    if (!items.length) { new obsidian.Notice(tr('Aucune tâche.')); return; }
    new ChoixListeModal(this.app, tr('Tâche à poser sur le canevas…'), items, async (it) => {
      if (!it) return;
      const ref = it.cle;
      if (o.parent) {
        const ok = await this.greffon.rattacher(ref, o.parent);
        if (ok === false) return;
      }
      if (o.bloquante) await this.greffon.creerBlocage(o.bloquante, ref);
      const deja = this._noeudsParRef().get(ref);
      if (deja && deja.length) {
        if (o.source && o.cotes) this._arete(o.source, deja[0], o.cotes, o.bloquante ? CANEVAS_COULEUR_BLOCAGE : '');
        this.canvas.requestSave();
        this.montrer(deja[0]);
        new obsidian.Notice(tr('Cette tâche est déjà sur le canevas.'));
        this.integration.invalider();
        return;
      }
      await this.inserer([ref], point, Object.assign({}, o, { couleur: o.bloquante ? CANEVAS_COULEUR_BLOCAGE : '' }));
      this.integration.invalider();
    }).open();
  }

  // Formulaire de création (pré-rempli), puis carte posée au point voulu.
  nouvelleTache(point, opts) {
    const o = opts || {};
    const defauts = Object.assign({}, o.defauts || {});
    if (o.parent) defauts.parent = o.parent;
    new ModaleTache(this.app, this.greffon, {
      defauts,
      apres: async (ref) => {
        if (o.bloquante) await this.greffon.creerBlocage(o.bloquante, ref);
        if (typeof o.apres === 'function') { await o.apres(ref); return; }
        if (!this._actif || this.vue.canvas !== this.canvas) return;
        await this.inserer([ref], point, Object.assign({}, o, { couleur: o.bloquante ? CANEVAS_COULEUR_BLOCAGE : '' }));
        this.integration.invalider();
      },
    }).open();
  }

  modifier(ref) {
    new ModaleTache(this.app, this.greffon, { ref, apres: () => this.integration.invalider() }).open();
  }

  // Une carte-texte ordinaire devient une tâche : première ligne → intitulé,
  // le reste → note de travail. Le nœud garde sa place et ses arêtes.
  convertirTexte(noeud) {
    const d = canevasDonnees(noeud);
    if (!d || d.type !== 'text') return;
    const lignes = String(d.text || '').split('\n');
    let i = lignes.findIndex((l) => l.trim());
    if (i < 0) i = 0;
    const intitule = String(lignes[i] || '').replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[.\]\s+)?|\d+[.)]\s+)/, '').trim();
    const note = lignes.slice(i + 1).join('\n').trim();
    this.nouvelleTache(null, {
      defauts: { intitule, note },
      apres: (ref) => {
        if (this.canvas.nodes.get(noeud.id) === noeud) {
          const cur = canevasDonnees(noeud) || d;
          noeud.setData(Object.assign({}, cur, { text: '[[' + ref + ']]', [CANEVAS_CLE]: { v: 1, ref } }));
          this.canvas.requestSave();
          this.relier([noeud]);
          this.planifier(true);
        } else {
          this.inserer([ref], { x: d.x + d.width / 2, y: d.y + d.height / 2 }, {});
        }
        this.integration.invalider();
      },
    });
  }

  // Note ordinaire posée sur le canevas → nouvelle tâche qui la cite, posée à
  // droite et reliée par un trait.
  tacheDepuisNote(noeud) {
    const d = canevasDonnees(noeud);
    if (!d || typeof d.file !== 'string') return;
    const nom = d.file.replace(/^.*\//, '').replace(/\.md$/i, '');
    const larg = this._largeur();
    this.nouvelleTache({ x: d.x + d.width + 80 + larg / 2, y: d.y + d.height / 2 }, {
      defauts: { intitule: nom, note: tr('Notes liées :') + '\n- [[' + nom + ']]' },
      source: noeud, cotes: { de: 'right', vers: 'left' },
    });
  }

  async supprimerTache(ref, noeud) {
    const t = this.integration.donnees().parRef.get(ref);
    if (this.greffon.settings.articulationConfirmerSuppression !== false) {
      const msg = tr('Supprimer la tâche « ') + ((t && t.intitule) || ref) + tr(' » ? Sa note ira à la corbeille.');
      const ok = await new Promise((res) => new ConfirmationRattachement(this.app, msg, res).open());
      if (!ok) return;
    }
    await this.greffon.supprimerTache(ref);
    if (noeud && this.canvas.nodes.get(noeud.id) === noeud && typeof this.canvas.removeNode === 'function') {
      try { this.canvas.removeNode(noeud); this.canvas.requestSave(); } catch (e) { /* rien */ }
    }
    this.integration.invalider();
  }
  //#endregion Canevas · menus et création

  //#region Canevas · outils et panneau
  // Les boutons d'Ariane dans les commandes du canevas (colonne de droite) :
  // le panneau des tâches, le traçage des relations, la disposition et les
  // niveaux de sous-tâches.
  _assurerOutils() {
    const hote = this.canvas.canvasControlsEl;
    if (!hote || !hote.isConnected) return;
    if (this._outils && hote.contains(this._outils)) return;
    if (this._outils) this._outils.remove();
    const g = canevasEl(hote, 'div', 'canvas-control-group mod-raised zfa-cnv-outils');
    this._outils = g;
    const b1 = canevasEl(g, 'div', 'canvas-control-item');
    obsidian.setIcon(b1, 'list-todo');
    canevasInfobulle(b1, tr('Tâches Ariane'));
    b1.setAttribute('data-tooltip-position', 'left');
    b1.addEventListener('click', (e) => { e.stopPropagation(); this.basculerPanneau(); });
    const b2 = canevasEl(g, 'div', 'canvas-control-item');
    obsidian.setIcon(b2, 'waypoints');
    canevasInfobulle(b2, tr('Tracer les relations entre les tâches'));
    b2.setAttribute('data-tooltip-position', 'left');
    b2.addEventListener('click', (e) => { e.stopPropagation(); if (!this.canvas.readonly) this.tracerTout(); });
    // Repris de l'ancienne vue Graphe : re-disposer, et un niveau de
    // sous-tâches de plus ou de moins.
    const outil = (icone, texte, action) => {
      const b = canevasEl(g, 'div', 'canvas-control-item');
      obsidian.setIcon(b, icone);
      canevasInfobulle(b, texte);
      b.setAttribute('data-tooltip-position', 'left');
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!this.canvas.readonly) action(); });
    };
    outil('layout-grid', tr('Re-disposer les tâches'), () => this.redisposer());
    outil('list-plus', tr('Ajouter un niveau de sous-tâches'), () => this.deplierNiveau());
    outil('list-minus', tr('Retirer un niveau de sous-tâches'), () => this.replierNiveau());
    this._boutonPanneau = b1;
  }

  basculerPanneau() {
    if (!this.panneau) this.panneau = new PanneauTachesCanevas(this);
    this.panneau.basculer();
  }
  //#endregion Canevas · outils et panneau
}

// ── Panneau des tâches : flottant, pour poser des tâches existantes ────────

class PanneauTachesCanevas {
  //#region Canevas · panneau des tâches
  constructor(surface) {
    this.s = surface;
    this.el = null;
    this.mode = 'afaire';
    this.q = '';
    this.choix = 0;
    this.epingle = false;
    this.point = null;
    this._sig = '';
    this._resultats = [];
    this._nettoyer = [];
  }

  estOuvert() { return !!(this.el && this.el.isConnected); }
  basculer() { if (this.estOuvert()) this.fermer(); else this.ouvrir(); }

  ouvrir() {
    const doc = this.s._document();
    const win = this.s._fenetre();
    this.fermer();
    const el = canevasEl(doc.body, 'div', 'zfa-cnv-panneau');
    el.setAttribute('role', 'dialog');
    this.el = el;
    const tete = canevasEl(el, 'div', 'zfa-cnv-panneau-tete');
    canevasEl(tete, 'span', 'zfa-cnv-panneau-titre', tr('Tâches Ariane'));
    const epingle = canevasBouton(tete, 'pin', tr('Épingler le panneau'));
    const fermer = canevasBouton(tete, 'x', tr('Fermer'));
    epingle.addEventListener('click', () => {
      this.epingle = !this.epingle;
      epingle.classList.toggle('is-active', this.epingle);
      obsidian.setIcon(epingle, this.epingle ? 'pin-off' : 'pin');
    });
    fermer.addEventListener('click', () => this.fermer());
    this._epingleEl = epingle;
    tete.addEventListener('pointerdown', (e) => this._glisserPanneau(e));

    const modes = canevasEl(el, 'div', 'zfa-cnv-panneau-modes');
    for (const [id, lib] of [['afaire', tr('À faire')], ['retard', tr('En retard')],
      ['sansdate', tr('Sans date')], ['terminees', tr('Terminées')]]) {
      const b = canevasEl(modes, 'button', 'zfa-cnv-mode' + (id === this.mode ? ' is-active' : ''), lib);
      b.type = 'button';
      b.addEventListener('click', () => {
        this.mode = id;
        for (const x of modes.children) x.classList.toggle('is-active', x === b);
        this.choix = 0;
        this.rafraichir(true);
      });
    }
    const recherche = canevasEl(el, 'input', 'zfa-cnv-panneau-recherche');
    recherche.type = 'search';
    recherche.placeholder = tr('Rechercher une tâche…');
    recherche.spellcheck = false;
    recherche.value = this.q;
    recherche.addEventListener('input', () => { this.q = recherche.value; this.choix = 0; this.rafraichir(true); });
    recherche.addEventListener('keydown', (e) => this._clavier(e));
    this.liste = canevasEl(el, 'div', 'zfa-cnv-panneau-liste');
    const pied = canevasEl(el, 'div', 'zfa-cnv-panneau-pied');
    this.compte = canevasEl(pied, 'span', 'zfa-cnv-panneau-compte');
    this.boutonTout = canevasEl(pied, 'button', 'zfa-cnv-panneau-tout', tr('Tout poser'));
    this.boutonTout.type = 'button';
    this.boutonTout.addEventListener('click', () => this._toutPoser());

    // Clic ailleurs : fermer, sauf si épinglé. Échap : fermer.
    const dehors = (e) => {
      if (this.epingle || !this.estOuvert()) return;
      const t = e.target;
      if (el.contains(t) || (this.s._outils && this.s._outils.contains(t))) return;
      if (t && t.closest && t.closest('.modal-container, .menu, .suggestion-container')) return;
      this.fermer();
    };
    const echap = (e) => {
      if (e.key !== 'Escape' || !this.estOuvert()) return;
      if (e.target && e.target.closest && e.target.closest('.modal-container')) return;
      e.preventDefault();
      this.fermer();
    };
    doc.addEventListener('pointerdown', dehors, true);
    doc.addEventListener('keydown', echap, true);
    const replacer = () => this._placer();
    win.addEventListener('resize', replacer);
    this._nettoyer.push(() => doc.removeEventListener('pointerdown', dehors, true),
      () => doc.removeEventListener('keydown', echap, true),
      () => win.removeEventListener('resize', replacer));
    this._placer();
    this.rafraichir(true);
    setTimeout(() => recherche.focus({ preventScroll: true }), 0);
  }

  fermer() {
    for (const f of this._nettoyer.splice(0)) { try { f(); } catch (e) { /* rien */ } }
    if (this.el) this.el.remove();
    this.el = null;
    this._sig = '';
  }

  // Près du bouton, dans le canevas, jamais hors de la fenêtre.
  _placer() {
    if (!this.el) return;
    const doc = this.s._document();
    const vw = doc.documentElement.clientWidth;
    const vh = doc.documentElement.clientHeight;
    const cadre = this.s.vue.contentEl.getBoundingClientRect();
    const w = Math.min(340, Math.max(220, cadre.width - 32));
    this.el.style.width = w + 'px';
    this.el.style.maxHeight = Math.max(200, Math.min(cadre.height - 24, vh - 24)) + 'px';
    let x;
    let y;
    if (this.point) { x = this.point.x; y = this.point.y; }
    else {
      const ancre = this.s._boutonPanneau && this.s._boutonPanneau.isConnected
        ? this.s._boutonPanneau.getBoundingClientRect() : null;
      x = ancre ? ancre.left - w - 10 : cadre.right - w - 60;
      y = ancre ? ancre.top : cadre.top + 12;
    }
    x = Math.max(8, Math.min(x, vw - w - 8));
    y = Math.max(8, Math.min(y, vh - this.el.offsetHeight - 8));
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  }

  _glisserPanneau(e) {
    if (e.button !== 0 || (e.target.closest && e.target.closest('button'))) return;
    const doc = this.s._document();
    const r = this.el.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    e.preventDefault();
    const bouger = (m) => {
      this.point = { x: r.left + m.clientX - x0, y: r.top + m.clientY - y0 };
      if (!this.epingle && Math.hypot(m.clientX - x0, m.clientY - y0) > 4) {
        this.epingle = true;
        if (this._epingleEl) { this._epingleEl.classList.add('is-active'); obsidian.setIcon(this._epingleEl, 'pin-off'); }
      }
      this._placer();
    };
    const lacher = () => {
      doc.removeEventListener('pointermove', bouger);
      doc.removeEventListener('pointerup', lacher);
    };
    doc.addEventListener('pointermove', bouger);
    doc.addEventListener('pointerup', lacher);
  }

  _filtrer() {
    const d = this.s.integration.donnees();
    const jour = d.jour;
    const garder = (t) => {
      const clos = canevasClose(t);
      const ech = Ariane.jourValide(t.echeance);
      if (this.mode === 'terminees') return t.statut === 'terminée';
      if (clos) return false;
      if (this.mode === 'retard') return !!ech && ech < jour;
      if (this.mode === 'sansdate') return !ech && !Ariane.jourValide(t.debut);
      return true;
    };
    let liste = d.toutes.filter(garder);
    const q = this.q.trim();
    if (q) {
      const f = obsidian.prepareFuzzySearch(q);
      liste = liste.map((t) => {
        const fam = this.s.greffon.familleDe(t.famille);
        const r = f(t.ref + ' ' + (t.intitule || '') + ' ' + (fam.nom || ''));
        return r ? { t, sc: r.score } : null;
      }).filter(Boolean).sort((a, b) => b.sc - a.sc).map((x) => x.t);
    } else {
      liste.sort((a, b) => {
        const ea = Ariane.jourValide(a.echeance) || '9999';
        const eb = Ariane.jourValide(b.echeance) || '9999';
        return this.mode === 'terminees' ? String(b.ref).localeCompare(String(a.ref))
          : (ea.localeCompare(eb) || String(a.ref).localeCompare(String(b.ref)));
      });
    }
    return liste;
  }

  rafraichir(force) {
    if (!this.estOuvert()) return;
    if (!this.s._actif || this.s.vue.canvas !== this.s.canvas) { this.fermer(); return; }
    const d = this.s.integration.donnees();
    const sur = this.s._refsSurCanevas();
    const res = this._filtrer();
    const sig = JSON.stringify([d.v, d.jour, this.mode, this.q, this.choix, [...sur].sort(), res.length]);
    if (!force && sig === this._sig) return;
    this._sig = sig;
    this._resultats = res;
    const visibles = res.slice(0, 150);
    const defil = this.liste.scrollTop;
    this.liste.replaceChildren();
    if (!visibles.length) canevasEl(this.liste, 'div', 'zfa-cnv-panneau-vide', tr('Aucune tâche.'));
    visibles.forEach((t, i) => this._ligne(t, i, sur.has(t.ref)));
    this.liste.scrollTop = defil;
    const hors = res.filter((t) => !sur.has(t.ref)).length;
    this.compte.textContent = res.length + ' ' + (res.length > 1 ? tr('tâches') : tr('tâche'))
      + (res.length !== hors ? ' · ' + (res.length - hors) + ' ' + tr('sur le canevas') : '');
    this.boutonTout.disabled = !hors || this.s.canvas.readonly;
    this.boutonTout.textContent = tr('Tout poser') + (hors ? ' (' + Math.min(hors, 40) + ')' : '');
  }

  _ligne(t, i, present) {
    const fam = this.s.greffon.familleDe(t.famille);
    const row = canevasEl(this.liste, 'div', 'zfa-cnv-ligne' + (present ? ' est-present' : '')
      + (i === this.choix ? ' is-selected' : ''));
    row.style.setProperty('--zfa-fam-couleur', fam.couleur || '#888888');
    const ic = canevasEl(row, 'span', 'zfa-cnv-ligne-fam');
    obsidian.setIcon(ic, fam.icone || 'circle');
    const txt = canevasEl(row, 'div', 'zfa-cnv-ligne-texte');
    canevasEl(txt, 'div', 'zfa-cnv-ligne-titre', t.intitule || t.ref);
    const meta = canevasEl(txt, 'div', 'zfa-cnv-ligne-meta', t.ref
      + (t.echeance ? ' · ' + canevasDateCourte(t.echeance) : '')
      + (t.statut && t.statut !== 'à faire' ? ' · ' + t.statut : ''));
    const ech = Ariane.jourValide(t.echeance);
    if (ech && ech < this.s.integration.donnees().jour && !canevasClose(t)) meta.classList.add('est-depassee');
    const b = canevasBouton(row, present ? 'locate' : 'plus',
      present ? tr('Montrer sur le canevas') : tr('Poser sur le canevas'), 'zfa-cnv-ligne-bouton');
    b.addEventListener('click', (e) => { e.stopPropagation(); this._poser(t.ref); });
    row.addEventListener('pointerdown', (e) => this._glisserLigne(e, t, row));
    row.addEventListener('mouseenter', () => { this.choix = i; this._marquerChoix(); });
  }

  _marquerChoix() {
    [...this.liste.children].forEach((r, k) => r.classList.toggle('is-selected', k === this.choix));
  }

  _clavier(e) {
    if (e.isComposing) return;
    const n = Math.min(this._resultats.length, 150);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      this.choix = Math.max(0, Math.min(n - 1, this.choix + (e.key === 'ArrowDown' ? 1 : -1)));
      this._marquerChoix();
      const r = this.liste.children[this.choix];
      if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = this._resultats[this.choix];
      if (t) this._poser(t.ref);
    }
  }

  async _poser(ref, point) {
    const deja = this.s._noeudsParRef().get(ref);
    if (deja && deja.length) { this.s.montrer(deja[0]); return; }
    if (this.s.canvas.readonly) return;
    await this.s.inserer([ref], point || this.s._centre(), {});
    this.s.integration.invalider();
    if (!this.epingle) this.fermer();
    else this.rafraichir(true);
  }

  async _toutPoser() {
    const sur = this.s._refsSurCanevas();
    const refs = this._resultats.filter((t) => !sur.has(t.ref)).slice(0, 40).map((t) => t.ref);
    if (!refs.length || this.s.canvas.readonly) return;
    await this.s.inserer(refs, this.s._centre(), {});
    this.s.integration.invalider();
    new obsidian.Notice(refs.length + ' ' + tr('tâche(s) posée(s) sur le canevas'));
    this.rafraichir(true);
  }

  // Glisser une ligne sur le canevas : la carte se pose sous le pointeur.
  _glisserLigne(e, t, row) {
    if (e.button !== 0 || (e.target.closest && e.target.closest('button'))) return;
    const doc = this.s._document();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let fantome = null;
    const bouger = (m) => {
      if (!fantome && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      if (!fantome) {
        fantome = canevasEl(doc.body, 'div', 'zfa-cnv-fantome', t.intitule || t.ref);
        row.classList.add('est-glisse');
      }
      fantome.style.left = (m.clientX + 12) + 'px';
      fantome.style.top = (m.clientY + 12) + 'px';
    };
    const fin = (m) => {
      doc.removeEventListener('pointermove', bouger);
      doc.removeEventListener('pointerup', fin);
      doc.removeEventListener('pointercancel', annuler);
      row.classList.remove('est-glisse');
      if (!fantome) return;
      fantome.remove();
      const cible = doc.elementFromPoint(m.clientX, m.clientY);
      const c = this.s.canvas;
      if (!cible || (this.el && this.el.contains(cible)) || !c.wrapperEl || !c.wrapperEl.contains(cible)
        || (c.canvasControlsEl && c.canvasControlsEl.contains(cible))) return;
      let p = null;
      try { if (typeof c.posFromClient === 'function') p = c.posFromClient({ x: m.clientX, y: m.clientY }); }
      catch (err) { p = null; }
      this._poser(t.ref, p && Number.isFinite(p.x) ? p : null);
    };
    const annuler = () => {
      doc.removeEventListener('pointermove', bouger);
      doc.removeEventListener('pointerup', fin);
      doc.removeEventListener('pointercancel', annuler);
      row.classList.remove('est-glisse');
      if (fantome) fantome.remove();
    };
    doc.addEventListener('pointermove', bouger);
    doc.addEventListener('pointerup', fin);
    doc.addEventListener('pointercancel', annuler);
  }
  //#endregion Canevas · panneau des tâches
}

//#endregion 16 · Canevas des tâches
