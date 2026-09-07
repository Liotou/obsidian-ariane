//#region 11 · class Ariane
// ═══════════════════════════════════════════════════════════════════════════
//  11 · CLASS ARIANE  (extends obsidian.Plugin)
//  Le greffon lui-même, assemblé à partir de mixins — un par domaine, un par
//  fragment src/11*.js. Chacun est une fonction (Base) => class extends Base,
//  ce qui laisse les méthodes exactement où elles étaient : même indentation,
//  mêmes appels « this.machin() », mêmes statiques « Ariane.machin() », que
//  l'héritage résout le long de la chaîne.
//
//  ARIANE RESTE UN SEUL GREFFON (décision du 2026-09-07). Le découpage en
//  mixins n'est donc pas la préparation d'une scission : il existe pour
//  lui-même, parce qu'une classe de 12 000 lignes ne se tient pas en tête —
//  ni celle d'un humain, ni le contexte d'une IA. La conception qui visait
//  trois greffons est archivée, marquée abandonnée.
// ═══════════════════════════════════════════════════════════════════════════

// Applique les mixins de gauche à droite : le dernier gagne en cas de méthode
// de même nom — ce qui ne doit pas arriver, et qu'un test interdit.
const composer = (Base, ...mixins) => mixins.reduce((C, m) => m(C), Base);
