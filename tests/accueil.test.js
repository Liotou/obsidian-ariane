// Présentation, profils et tutoriel.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { extraireBlocs, DEFAULT_SETTINGS, PROFILS_ARIANE } = Ariane._test;

test('présentation : deux rédactions, les zones vivantes, aucun tiret long', () => {
  for (const l of ['fr', 'en']) {
    const n = Ariane.noteAccueil(l);
    for (const b of ['ariane-actions', 'ariane-etat', 'ariane-profil']) assert.ok(n.includes('```' + b + '\n```'), l + ' : ' + b);
    assert.ok(!/[–—]/.test(n), l + ' : tiret long');
    assert.ok(n.includes('**' + (l === 'fr' ? 'Tâches' : 'Tasks') + '**'), l + ' : modules');
  }
  assert.match(Ariane.noteAccueil('fr'), /^---\ncssclasses:\n  - ariane-accueil\n---\n# Bienvenue dans Ariane/);
  assert.match(Ariane.noteAccueil('en'), /# Welcome to Ariane/);
});

test('profil courant : reconnu dépendances comprises, sinon personnalisé', () => {
  assert.equal(Ariane.profilCourant(PROFILS_ARIANE.zotero), 'zotero');
  assert.equal(Ariane.profilCourant(['export', 'familles', 'typographie']), 'zotero');
  assert.equal(Ariane.profilCourant(PROFILS_ARIANE.tout), 'tout');
  assert.equal(Ariane.profilCourant(['taches']), '');
});

test('source d’exemple : trois annotations, leurs pages, leurs titres, sans Zotero', () => {
  for (const l of ['fr', 'en']) {
    const blocs = extraireBlocs(Ariane.sourceExemple(l), DEFAULT_SETTINGS);
    assert.deepEqual(blocs.map((b) => [b.cle, b.page]), [['TUTOANN1', '12'], ['TUTOANN2', '47'], ['TUTOANN3', '103']], l);
    assert.ok(blocs.every((b) => b.titre), l + ' : titres');
    assert.ok(Ariane.sourceExemple(l).includes('citationKey: ' + Ariane.CLE_EXEMPLE));
    assert.ok(!/[–—]/.test(Ariane.sourceExemple(l) + Ariane.brouillonExemple(l) + Ariane.noteTutoriel(l)), l + ' : tiret long');
  }
});

test('tutoriel : les étapes se cochent d’après les faits ; l’export facultatif sans pandoc', () => {
  const vide = Ariane.etapesTutoriel({});
  assert.deepEqual(vide.map((e) => e.id), ['atomiser', 'ouvrir', 'citer', 'biblio', 'replier', 'exporter']);
  assert.ok(vide.every((e) => !e.fait));
  assert.equal(vide[5].facultatif, true);
  const plein = Ariane.etapesTutoriel({ annotations: 3, ouverte: true, citation: true, biblio: true, replie: true, export: true, exportPossible: true });
  assert.ok(plein.every((e) => e.fait && !e.facultatif));
  assert.equal(Ariane.etapesTutoriel({ annotations: 2 })[0].fait, false);
});
