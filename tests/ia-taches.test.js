const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

/* -------------------------- datesDansTexte -------------------------- */

test('datesDansTexte : ISO et JJ/MM/AAAA, ramenées en ISO', () => {
  const s = Ariane.datesDansTexte('rendu le 2026-09-30, réunion 03/10/2026, rien le 32/13/2026');
  assert.ok(s.has('2026-09-30'));
  assert.ok(s.has('2026-10-03'));
  assert.equal(s.has(''), false);
});

/* --------------------------- extraireJson -------------------------- */

test('extraireJson : nu, avec fence, avec bavardage', () => {
  assert.deepEqual(Ariane.extraireJson('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(Ariane.extraireJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(Ariane.extraireJson('Voici :\n[{"a":1}]\nVoilà.'), [{ a: 1 }]);
  assert.equal(Ariane.extraireJson('pas du json'), null);
});

/* ---------------------- normaliserSpecsTaches --------------------- */

const OPTS = {
  familles: new Set(['lecture', 'production', 'action']),
  defaut: 'action',
  dates: new Set(['2026-09-30']),
};

test('normaliserSpecsTaches : familles bornées, booléens, priorité, profondeur', () => {
  const brut = [{
    titre: '  Approfondir  ', famille: 'INCONNUE', jalon: 'oui', priorite: 'BONUS',
    enfants: [{ title: 'Lire X', family: 'lecture', source_pressentie: 'von Bertalanffy' }],
  }];
  const s = Ariane.normaliserSpecsTaches(brut, OPTS);
  assert.equal(s[0].titre, 'Approfondir');
  assert.equal(s[0].famille, 'action');       // inconnue -> défaut
  assert.equal(s[0].jalon, true);
  assert.equal(s[0].priorite, 'basse');
  assert.equal(s[0].enfants[0].famille, 'lecture');
  assert.equal(s[0].enfants[0].source, 'von Bertalanffy');
});

test('normaliserSpecsTaches : aucune date qui ne soit dans le texte source', () => {
  const s = Ariane.normaliserSpecsTaches(
    [{ titre: 'T', echeance: '2026-12-25', debut: '2026-09-30' }], OPTS);
  assert.equal(s[0].echeance, '');            // absente de dates -> jetée
  assert.equal(s[0].debut, '2026-09-30');     // présente -> gardée
});

test('normaliserSpecsTaches : nœuds sans titre ignorés, {taches:[…]} accepté', () => {
  const s = Ariane.normaliserSpecsTaches({ taches: [{ nom: 'A' }, { note: 'orphelin' }] }, OPTS);
  assert.deepEqual(s.map((x) => x.titre), ['A']);
});

/* --------------------------- meilleurTitre ------------------------ */

test('meilleurTitre : trouve la tâche par recouvrement de mots', () => {
  const cand = [
    { ref: 'A', titre: 'Rédiger le chapitre 3' },
    { ref: 'B', titre: 'Lire Morin' },
    { ref: 'C', titre: 'Envoyer le mail à Karine' },
  ];
  assert.equal(Ariane.meilleurTitre('rédaction du chapitre 3', cand).ref, 'A');
  assert.equal(Ariane.meilleurTitre('le mail pour karine', cand).ref, 'C');
});

test('meilleurTitre : rien de probant -> null', () => {
  assert.equal(Ariane.meilleurTitre('acheter du café', [{ ref: 'A', titre: 'Rédiger le chapitre' }]), null);
  assert.equal(Ariane.meilleurTitre('', [{ ref: 'A', titre: 'x' }]), null);
});

/* ------------------- majPlanArticulationTexte -------------------- */

const BASE = [
  'filters:',
  '  and:',
  '    - file.ext == "md"',
  'views:',
  '  - type: table',
  '    name: Liste',
  '  - type: ariane-articulation',
  '    name: Articulation',
  "    arianeArtPlan: '{\"cartes\":[{\"ref\":\"T26-001\",\"x\":-270,\"y\":-90,\"replie\":false}],\"_migre\":true}'",
].join('\n');

test('majPlanArticulationTexte : ajoute des cartes au plan existant', () => {
  const out = Ariane.majPlanArticulationTexte(BASE, 'Articulation', ['T26-002', 'T26-003']);
  assert.ok(out.includes('"ref":"T26-002"'));
  assert.ok(out.includes('"ref":"T26-003"'));
  assert.ok(out.includes('"ref":"T26-001"'));       // l'existant reste
  assert.equal(out.split('arianeArtPlan:').length, 2); // une seule ligne de plan
});

test('majPlanArticulationTexte : crée la ligne plan si absente', () => {
  const base = BASE.split('\n').filter((l) => !l.includes('arianeArtPlan')).join('\n');
  const out = Ariane.majPlanArticulationTexte(base, null, ['T26-009']);
  assert.ok(out.includes('arianeArtPlan:'));
  assert.ok(out.includes('"ref":"T26-009"'));
});

test('majPlanArticulationTexte : pas de vue articulation -> null', () => {
  const base = ['views:', '  - type: table', '    name: X'].join('\n');
  assert.equal(Ariane.majPlanArticulationTexte(base, null, ['T26-001']), null);
});

test('majPlanArticulationTexte : rien à ajouter (déjà présent) -> null', () => {
  assert.equal(Ariane.majPlanArticulationTexte(BASE, 'Articulation', ['T26-001']), null);
});

/* ------- aplatir / reconstruire / déplacer les specs (hiérarchie) ----- */

const ARBRE = () => ([
  { titre: 'A', enfants: [
    { titre: 'A1', enfants: [] },
    { titre: 'A2', enfants: [] },
  ] },
  { titre: 'B', enfants: [] },
  { titre: 'C', enfants: [{ titre: 'C1', enfants: [] }] },
]);

const platTxt = (plat) => plat.map((x) => x.n.titre + x.prof).join(' ');
const titresArbre = (arbre) => Ariane.aplatirSpecsTaches(arbre)
  .map((x) => x.n.titre + x.prof).join(' ');

test('aplatirSpecsTaches / reconstruireSpecsTaches : aller-retour', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  assert.equal(platTxt(plat), 'A0 A11 A21 B0 C0 C11');
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(plat)), 'A0 A11 A21 B0 C0 C11');
});

test('reconstruireSpecsTaches : saut de profondeur ramené sous le parent ouvert', () => {
  const arbre = Ariane.reconstruireSpecsTaches([
    { n: { titre: 'A', enfants: [] }, prof: 0 },
    { n: { titre: 'X', enfants: [] }, prof: 2 },
  ]);
  assert.equal(titresArbre(arbre), 'A0 X1');
});

test('deplacerSpecTaches : remonte une tâche au-dessus d\'un bloc', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  const apres = Ariane.deplacerSpecTaches(plat, 3, 0, 0); // B tout en haut
  assert.equal(platTxt(apres), 'B0 A0 A11 A21 C0 C11');
});

test('deplacerSpecTaches : imbrique C sous A2, la descendance suit', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  assert.equal(Ariane.depotSpecTaches(plat, 4, 3).profMax, 2); // enfant de A2
  const apres = Ariane.deplacerSpecTaches(plat, 4, 3, 2);
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(apres)), 'A0 A11 A21 C2 C13 B0');
});

test('deplacerSpecTaches : remonte un bloc entier avec sa descendance', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  const apres = Ariane.deplacerSpecTaches(plat, 0, 6, 0); // A (et A1, A2) à la fin
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(apres)), 'B0 C0 C11 A0 A11 A21');
});

test('deplacerSpecTaches : interdit de se poser dans sa propre descendance', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  assert.equal(Ariane.depotSpecTaches(plat, 0, 2), null);
  assert.equal(Ariane.deplacerSpecTaches(plat, 0, 1, 0), null);
  assert.equal(Ariane.deplacerSpecTaches(plat, 0, 2, 0), null);
});

test('deplacerSpecTaches : profondeur bornée au voisinage du trou', () => {
  const plat = Ariane.aplatirSpecsTaches(ARBRE());
  // tout en haut : profMax = 0, même si l'on demande 3
  assert.equal(platTxt(Ariane.deplacerSpecTaches(plat, 4, 0, 3)), 'C0 C11 A0 A11 A21 B0');
  // après B (prof 0) : profMax = 1, C1 suit d'autant
  const apres = Ariane.deplacerSpecTaches(plat, 4, 4, 5);
  assert.equal(titresArbre(Ariane.reconstruireSpecsTaches(apres)), 'A0 A11 A21 B0 C1 C12');
});
