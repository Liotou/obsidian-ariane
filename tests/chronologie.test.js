// Chronologie d'activité : sources de capture, genre d'un chemin, extraits de
// modification, périodes, filtres, comptes et carte de chaleur.
process.env.TZ = 'Europe/Paris';
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('compilerSourcesCapture : nom, icône facultative, plusieurs dossiers', () => {
  assert.deepEqual(Ariane.compilerSourcesCapture([
    'Raindrop (bookmark) = Raindrop/',
    'MacWhisper = Transcripts, Audio/Notes',
    '# commentaire',
    'sans dossier =',
  ].join('\n')), [
    { nom: 'Raindrop', icone: 'bookmark', dossiers: ['Raindrop'] },
    { nom: 'MacWhisper', icone: 'bookmark', dossiers: ['Transcripts', 'Audio/Notes'] },
  ]);
});

test('genreChrono : note, capture, canevas, extraits, exclusions, fichiers cachés', () => {
  const cfg = {
    exclus: ['9 - Journal du temps', 'Archives'],
    extraits: ['Snippets'],
    sources: Ariane.compilerSourcesCapture('Raindrop (bookmark) = Raindrop'),
  };
  assert.deepEqual(Ariane.genreChrono('Wiki/Note.md', 'md', cfg), { genre: 'note' });
  assert.equal(Ariane.genreChrono('Raindrop/Lien.md', 'md', cfg).source.nom, 'Raindrop');
  assert.deepEqual(Ariane.genreChrono('Plans/Carte.canvas', 'canvas', cfg), { genre: 'canevas' });
  assert.deepEqual(Ariane.genreChrono('Snippets/x.md', 'md', cfg), { genre: 'canevas' });
  assert.equal(Ariane.genreChrono('Archives/vieux.md', 'md', cfg), null);
  assert.equal(Ariane.genreChrono('9 - Journal du temps/2026-10-06.md', 'md', cfg), null);
  assert.equal(Ariane.genreChrono('.trash/x.md', 'md', cfg), null);
  assert.equal(Ariane.genreChrono('Images/a.png', 'png', cfg), null);
});

test('corpsSansEntete et extraitDebut', () => {
  const t = '---\ntitre: X\n---\n# Titre\n\n> Premier passage **gras**\nSuite [[Cible|alias]]\nTroisième';
  assert.equal(Ariane.corpsSansEntete(t), '# Titre\n\n> Premier passage **gras**\nSuite [[Cible|alias]]\nTroisième');
  assert.equal(Ariane.extraitDebut(t), 'Premier passage gras\nSuite alias');
  assert.equal(Ariane.extraitDebut('a'.repeat(400), 20).length, 20);
});

test('extraitModification : entête seule → null ; zone modifiée et lignes touchées', () => {
  const avant = '---\ntemps-passe: 3\n---\nUn\nDeux\nTrois';
  assert.equal(Ariane.extraitModification(avant, avant.replace('3', '8')), null);
  const d = Ariane.extraitModification(avant, '---\ntemps-passe: 3\n---\nUn\nDeux modifiée\nAjout\nTrois');
  assert.deepEqual(d, { n: 2, extrait: 'Deux modifiée\nAjout', retrait: false });
  const r = Ariane.extraitModification(avant, '---\ntemps-passe: 3\n---\nUn\nTrois');
  assert.deepEqual(r, { n: 1, extrait: 'Deux', retrait: true });
  // Lignes vides seulement : pas une activité.
  assert.equal(Ariane.extraitModification('Un\nDeux', 'Un\n\nDeux'), null);
});

test('bornesPeriode et decalerPeriode', () => {
  assert.deepEqual(Ariane.bornesPeriode('jour', '2026-10-06'), { debut: '2026-10-06', fin: '2026-10-07' });
  assert.deepEqual(Ariane.bornesPeriode('semaine', '2026-10-06'), { debut: '2026-10-05', fin: '2026-10-12' });
  assert.deepEqual(Ariane.bornesPeriode('semaine', '2026-10-11'), { debut: '2026-10-05', fin: '2026-10-12' });
  assert.deepEqual(Ariane.bornesPeriode('mois', '2026-12-15'), { debut: '2026-12-01', fin: '2027-01-01' });
  assert.deepEqual(Ariane.bornesPeriode('annee', '2026-10-06'), { debut: '2026-01-01', fin: '2027-01-01' });
  assert.equal(Ariane.decalerPeriode('semaine', '2026-10-06', -1), '2026-09-28');
  assert.equal(Ariane.decalerPeriode('mois', '2026-03-31', -1), '2026-02-01');
  assert.equal(Ariane.decalerPeriode('mois', '2026-10-06', 1), '2026-11-01');
  assert.equal(Ariane.decalerPeriode('jour', '2026-10-06', -1), '2026-10-05');
  assert.equal(Ariane.decalerPeriode('annee', '2026-10-06', -1), '2025-01-01');
});

const evt = (iso, type, chemin) => ({ t: new Date(iso).getTime(), type, chemin });

test('filtrerChrono et comptesChrono', () => {
  const e = [
    evt('2026-10-06T09:00', 'capture', 'Raindrop/a.md'),
    evt('2026-10-06T08:40', 'tache-terminee', '8 - Tâches/T1.md'),
    evt('2026-10-05T17:05', 'tache-abandonnee', '8 - Tâches/T2.md'),
    evt('2026-10-05T11:02', 'note-modifiee', 'Wiki/n.md'),
    evt('2026-10-05T10:00', 'note-modifiee', 'racine.md'),
  ];
  assert.equal(Ariane.filtrerChrono(e, 'taches', '').length, 2);
  assert.equal(Ariane.filtrerChrono(e, 'tout', 'Wiki').length, 1);
  assert.equal(Ariane.filtrerChrono(e, 'notes', '').length, 2);
  assert.deepEqual(Ariane.comptesChrono(e), {
    'note-modifiee': 2, 'note-creee': 0, capture: 1,
    'tache-terminee': 1, 'tache-abandonnee': 1, canevas: 0,
  });
});

test('carteChaleur : dix colonnes du lundi au dimanche, futur vide, niveaux relatifs', () => {
  const e = [
    evt('2026-10-06T09:00', 'capture', 'a'),
    evt('2026-10-06T10:00', 'capture', 'a'),
    evt('2026-10-06T11:00', 'capture', 'a'),
    evt('2026-10-06T12:00', 'capture', 'a'),
    evt('2026-10-05T12:00', 'capture', 'a'),
    evt('2026-07-01T12:00', 'capture', 'a'),     // hors fenêtre
  ];
  const c = Ariane.carteChaleur(e, '2026-10-06', 10);
  assert.equal(c.depart, '2026-08-03');
  assert.equal(c.colonnes.length, 10);
  const der = c.colonnes[9];
  assert.deepEqual(der[0], { jour: '2026-10-05', n: 1, niveau: 1 });
  assert.deepEqual(der[1], { jour: '2026-10-06', n: 4, niveau: 4 });
  assert.equal(der[2], null);
  assert.equal(c.colonnes[0][0].n, 0);
});

test('TYPES_CHRONO : chaque type a sa pastille de filtre', () => {
  const filtres = new Set(['notes', 'taches', 'captures', 'canevas']);
  for (const d of Ariane.TYPES_CHRONO) assert.ok(filtres.has(d.filtre), d.type);
  assert.equal(Ariane.typeChrono('inconnu').type, 'note-modifiee');
});
