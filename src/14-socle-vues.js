//#region 14 · Socle des vues
// ═══════════════════════════════════════════════════════════════════════════
//  14 · SOCLE DES VUES
//  Ce que frise, articulation et calendrier partagent : identifiants de vue,
//  réglages par défaut de chaque vue de base, svgEl, pile d'annulation et de
//  rétablissement, et la classe MoteurVue dont les trois moteurs héritent.
// ═══════════════════════════════════════════════════════════════════════════

const TYPE_VUE_REFS = 'zfa-references';
const TYPE_VUE_INCOHERENCES = 'zfa-taches-incoherences';
const TYPE_VUE_BASE_FRISE = 'ariane-frise';
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
};

function svgEl(nom, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', nom);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  return e;
}

// Annulation et rétablissement partagés par la frise, l'articulation et le
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

// Socle des trois moteurs de vue (frise, articulation, calendrier).
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

//#endregion 14 · Socle des vues

