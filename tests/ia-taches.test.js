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
