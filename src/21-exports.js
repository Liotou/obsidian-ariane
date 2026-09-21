//#region 21 · Exports
// ═══════════════════════════════════════════════════════════════════════════
//  21 · EXPORTS
//  Points d'entrée CommonJS : la classe du greffon et la surface _test
//  des fonctions pures pour la suite de tests.
// ═══════════════════════════════════════════════════════════════════════════

module.exports = Ariane;

// Exposition des fonctions pures pour les tests.
module.exports._test = {
  DEFAULT_SETTINGS,
  MoteurArticulation, // prototype : _traceArete s'éprouve avec un moteur factice
  // Canevas : logique éprouvée sur un faux canevas (nœuds, arêtes, importData).
  CANEVAS_CLE,
  canevasCotes,
  canevasRefDuNoeud,
  canevasNouvelId,
  IntegrationCanevas,
  SurfaceCanevas,
  // Correcteur Apple : découpage, masquage et assemblage des fautes.
  correcteurMasquer,
  correcteurZonesExclues,
  correcteurBlocs,
  correcteurFautes,
  correcteurCleIgnore,
  CorrecteurApple,
  echapperRegex,
  nomCompletAuteur,
  appliquerModele,
  parseNomReference,
  parseAuteurSeul,
  compilerProfils,
  extraireBlocs,
  trouverSourceZotero,
  appariementSource,
  candidatsSource,
  surnamesReference,
  construireNote,
  construireReference,
  normaliserConjAuteurs,
  horodatageNC,
  rangesNotesOrphelines,
  normDoi,
  nomFamille,
  refsDepuisCrossref,
  refsDepuisOpenAlexWorks,
  tokeniser,
  frequenceTermes,
  calculerIdf,
  vecteurTfIdf,
  cosinusTfIdf,
  hacherTexte,
  normaliserVecteur,
  cosinusVecteurs,
  normNom,
  surnameKey,
  memePersonne,
  clustersDoublons,
  meilleurCanonique,
  _toucheAnnuler,
  _toucheRetablir,
  poserAnnulation,
  annulerDernier,
  refaireDernier,
  pageFriseHtml,
  tachesPourExport,
  multiPourExport,
  colonnesPourExport,
};

//#endregion 21 · Exports
