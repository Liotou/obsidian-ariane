//#region 11 · class Ariane
// ═══════════════════════════════════════════════════════════════════════════
//  11 · CLASS ARIANE  (extends obsidian.Plugin)
//  Le greffon lui-même, assemblé à partir de mixins — un par domaine, un par
//  fragment src/11*.js. Chacun est une fonction (Base) => class extends Base,
//  ce qui laisse les méthodes exactement où elles étaient : même indentation,
//  mêmes appels « this.machin() », mêmes statiques « Ariane.machin() », que
//  l'héritage résout le long de la chaîne.
//
//  L'ordre de composition ci-dessous est aussi la carte de la scission à
//  venir : socle et IA iront dans le paquet « core », les mixins « note »
//  dans ariane-note, les mixins « taches / frise / articulation » dans
//  ariane-task. Chaque greffon composera sa propre chaîne.
//  Conception : docs/superpowers/specs/2026-09-07-scission-revue-design.md
// ═══════════════════════════════════════════════════════════════════════════

// Applique les mixins de gauche à droite : le dernier gagne en cas de méthode
// de même nom — ce qui ne doit pas arriver, et qu'un test interdit.
const composer = (Base, ...mixins) => mixins.reduce((C, m) => m(C), Base);
