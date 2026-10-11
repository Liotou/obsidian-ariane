const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const {
  CANEVAS_CLE, canevasCotes, canevasRefDuNoeud, canevasNouvelId,
  canevasAjouterCartes, canevasSansVuesGraphe,
  IntegrationCanevas, SurfaceCanevas,
} = Ariane._test;

// Canevas factice : juste ce que l'intégration touche (nœuds, arêtes,
// createTextNode, importData, requestSave, selectOnly).
function fauxCanvas() {
  const c = {
    nodes: new Map(), edges: new Map(), readonly: false, sauvegardes: 0, choisi: null,
    createTextNode(o) {
      const id = 'n' + (c.nodes.size + 1);
      let data = { id, type: 'text', text: o.text, x: o.pos.x, y: o.pos.y,
        width: o.size.width, height: o.size.height };
      const n = { id, getData: () => data, setData: (d) => { data = d; } };
      c.nodes.set(id, n);
      return n;
    },
    importData(d) {
      for (const e of d.edges || []) {
        c.edges.set(e.id, { id: e.id, from: { node: c.nodes.get(e.fromNode), side: e.fromSide },
          to: { node: c.nodes.get(e.toNode), side: e.toSide }, brut: e });
      }
    },
    requestSave() { c.sauvegardes += 1; },
    selectOnly(n) { c.choisi = n; },
    getData() { return { nodes: [], edges: [] }; },
  };
  return c;
}

function noeudTache(c, ref, x, y) {
  const n = c.createTextNode({ pos: { x, y }, size: { width: 200, height: 80 }, text: '[[' + ref + ']]' });
  n.setData(Object.assign({}, n.getData(), { [CANEVAS_CLE]: { v: 1, ref } }));
  return n;
}

function tache(ref, champs) {
  return Object.assign({ ref, intitule: ref, parent: '', bloquePar: [], statut: 'à faire',
    avancement: 0, debut: '', echeance: '', famille: 'action' }, champs || {});
}

function monter(taches, reglages) {
  const greffon = {
    app: {},
    settings: Object.assign({ canevasRelierAuto: true }, reglages || {}),
    tachesPourGantt: () => taches,
    refDeChemin: (p) => { const m = /^08 - Tâches\/(T\d+)\.md$/.exec(p); return m ? m[1] : null; },
    familleDe: () => ({ couleur: '#888', icone: 'circle', nom: 'x' }),
  };
  const integration = new IntegrationCanevas(greffon);
  const canvas = fauxCanvas();
  const surface = new SurfaceCanevas(integration, { canvas, contentEl: {} });
  return { greffon, integration, canvas, surface };
}

test('canevasCotes : le côté qui regarde la cible, l\'entrée opposée', () => {
  const a = { x: 0, y: 0, width: 100, height: 60 };
  assert.deepEqual(canevasCotes(a, { x: 300, y: 0, width: 100, height: 60 }), { de: 'right', vers: 'left' });
  assert.deepEqual(canevasCotes(a, { x: -300, y: 0, width: 100, height: 60 }), { de: 'left', vers: 'right' });
  assert.deepEqual(canevasCotes(a, { x: 0, y: 300, width: 100, height: 60 }), { de: 'bottom', vers: 'top' });
  assert.deepEqual(canevasCotes(a, { x: 0, y: -300, width: 100, height: 60 }), { de: 'top', vers: 'bottom' });
});

test('canevasCotes : en diagonale, la distance rapportée à la taille décide', () => {
  // 150 px à droite pour 100 px de large, 150 px plus bas pour 60 px de haut :
  // c'est l'écart vertical qui compte le plus.
  const a = { x: 0, y: 0, width: 100, height: 60 };
  assert.equal(canevasCotes(a, { x: 150, y: 150, width: 100, height: 60 }).de, 'bottom');
});

test('canevasRefDuNoeud : métadonnée d\'un nœud texte, ou note de tâche d\'un nœud fichier', () => {
  const g = { refDeChemin: (p) => (p === '08 - Tâches/T021.md' ? 'T021' : null) };
  const n = (data) => ({ getData: () => data });
  assert.equal(canevasRefDuNoeud(g, n({ type: 'text', text: '[[T021]]', [CANEVAS_CLE]: { v: 1, ref: 'T021' } })), 'T021');
  assert.equal(canevasRefDuNoeud(g, n({ type: 'text', text: '[[T021]]' })), null, 'le texte seul ne suffit pas');
  assert.equal(canevasRefDuNoeud(g, n({ type: 'file', file: '08 - Tâches/T021.md' })), 'T021');
  assert.equal(canevasRefDuNoeud(g, n({ type: 'file', file: '03 - Notes/Idée.md' })), null);
  assert.equal(canevasRefDuNoeud(g, n({ type: 'file', file: 'Schéma.png' })), null);
  assert.equal(canevasRefDuNoeud(g, { getData: () => { throw new Error('détruit'); } }), null);
  assert.equal(canevasRefDuNoeud(g, null), null);
});

test('canevasNouvelId : 16 caractères hexadécimaux, jamais deux fois le même', () => {
  const vus = new Set();
  for (let i = 0; i < 200; i += 1) {
    const id = canevasNouvelId();
    assert.match(id, /^[0-9a-f]{16}$/);
    vus.add(id);
  }
  assert.equal(vus.size, 200);
});

test('relation : mère et blocage lus dans les propriétés, pas dans le dessin', () => {
  const { integration } = monter([
    tache('T1'), tache('T2', { parent: '[[T1]]', bloquePar: ['[[T3]]'] }), tache('T3'),
  ]);
  const d = integration.donnees();
  assert.equal(integration.relation(d, 'T1', 'T2', 'hier'), true);
  assert.equal(integration.relation(d, 'T2', 'T1', 'hier'), false);
  assert.equal(integration.relation(d, 'T3', 'T2', 'bloque'), true);
  assert.equal(integration.relation(d, 'T2', 'T3', 'bloque'), false);
});

test('relier : trace une arête par relation, sans doubler une arête existante', () => {
  const { canvas, surface } = monter([
    tache('T1'), tache('T2', { parent: '[[T1]]', bloquePar: ['[[T3]]'] }), tache('T3'), tache('T4'),
  ]);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  const n2 = noeudTache(canvas, 'T2', 0, 300);
  const n3 = noeudTache(canvas, 'T3', -400, 300);
  noeudTache(canvas, 'T4', 600, 0);
  // T1 et T2 sont déjà reliés (dans l'autre sens, peu importe) : pas de doublon.
  canvas.importData({ edges: [{ id: 'x', fromNode: n2.id, fromSide: 'top', toNode: n1.id, toSide: 'bottom' }] });
  const n = surface.relier([], true);
  assert.equal(n, 1, 'seul le blocage T3 → T2 manquait');
  const nouvelle = [...canvas.edges.values()].find((e) => e.id !== 'x');
  assert.equal(nouvelle.brut.fromNode, n3.id, 'l\'arête part de la bloquante');
  assert.equal(nouvelle.brut.toNode, n2.id);
  assert.equal(nouvelle.brut.color, '1', 'un blocage tracé par le canevas est rouge');
  assert.equal(nouvelle.brut.fromSide, 'right');
  assert.equal(surface.relier([], true), 0, 'une seconde passe ne trace rien');
});

test('relier : sur un canevas en lecture seule, rien ne s\'écrit', () => {
  const { canvas, surface } = monter([tache('T1'), tache('T2', { parent: '[[T1]]' })]);
  noeudTache(canvas, 'T1', 0, 0);
  noeudTache(canvas, 'T2', 0, 300);
  canvas.readonly = true;
  assert.equal(surface.relier([], true), 0);
  assert.equal(canvas.edges.size, 0);
});

test('inserer : cartes texte à métadonnée, repli [[ref]], liens tracés d\'office', async () => {
  const { canvas, surface } = monter([tache('T1'), tache('T2', { parent: '[[T1]]' })]);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  const [n2] = await surface.inserer(['T2'], { x: 0, y: 400 }, {});
  assert.equal(n2.getData().text, '[[T2]]', 'sans Ariane, la carte reste un lien vers la note');
  assert.deepEqual(n2.getData()[CANEVAS_CLE], { v: 1, ref: 'T2' });
  assert.equal(canvas.edges.size, 1, 'la mère déjà posée est reliée à la nouvelle carte');
  const e = [...canvas.edges.values()][0];
  assert.equal(e.brut.fromNode, n1.id);
  assert.equal(e.brut.toNode, n2.id);
  assert.equal(canvas.choisi, n2, 'la carte posée est sélectionnée');
  assert.ok(canvas.sauvegardes > 0);
});

test('inserer : réglage « tracer à la pose » éteint → aucune arête automatique', async () => {
  const { canvas, surface } = monter([tache('T1'), tache('T2', { parent: '[[T1]]' })],
    { canevasRelierAuto: false });
  noeudTache(canvas, 'T1', 0, 0);
  await surface.inserer(['T2'], { x: 0, y: 400 }, {});
  assert.equal(canvas.edges.size, 0);
});

test('inserer : connexion tirée d\'une carte → arête depuis la source vers la carte posée', async () => {
  const { canvas, surface } = monter([tache('T1'), tache('T9')]);
  const src = noeudTache(canvas, 'T1', 0, 0);
  const [n] = await surface.inserer(['T9'], { x: 0, y: 400 },
    { source: src, cotes: { de: 'bottom', vers: 'top' }, position: 'top' });
  assert.equal(canvas.edges.size, 1);
  const e = [...canvas.edges.values()][0];
  assert.equal(e.brut.fromNode, src.id);
  assert.equal(e.brut.toNode, n.id);
  assert.equal(e.brut.fromSide, 'bottom');
  assert.equal(e.brut.toSide, 'top');
});

test('inserer : plusieurs cartes se rangent en grille, sans se superposer', async () => {
  const { canvas, surface } = monter(['T1', 'T2', 'T3', 'T4'].map((r) => tache(r)));
  const ns = await surface.inserer(['T1', 'T2', 'T3', 'T4'], { x: 0, y: 0 }, { relier: false });
  const pos = ns.map((n) => n.getData().x + ',' + n.getData().y);
  assert.equal(new Set(pos).size, 4);
  assert.equal(canvas.choisi, null, 'une pose multiple ne sélectionne rien');
});

test('inserer : canevas en lecture seule → rien n\'est posé', async () => {
  const { canvas, surface } = monter([tache('T1')]);
  canvas.readonly = true;
  assert.deepEqual(await surface.inserer(['T1'], { x: 0, y: 0 }, {}), []);
  assert.equal(canvas.nodes.size, 0);
});

test('canevasDepuisPlan : le plan de l\'ancienne vue Graphe devient un canevas, relations comprises', () => {
  const { integration } = monter([
    tache('T1'), tache('T2', { parent: '[[T1]]' }), tache('T3', { bloquePar: ['[[T2]]'] }),
  ]);
  const plan = [
    { ref: 'T1', x: 0, y: 0 }, { ref: 'T2', x: 300, y: 0 }, { ref: 'T3', x: 300, y: 100 },
    { ref: 'T2', x: 900, y: 900 },     // doublon : ignoré
    { ref: 'T99', x: 50, y: 50 },      // tâche disparue : ignorée
  ];
  const { nodes, edges } = integration.canevasDepuisPlan(plan);
  assert.deepEqual(nodes.map((n) => n[CANEVAS_CLE].ref), ['T1', 'T2', 'T3']);
  assert.ok(nodes.every((n) => n.type === 'text' && n.text === '[[' + n[CANEVAS_CLE].ref + ']]'));
  const [n1, n2, n3] = nodes;
  assert.ok(n2.x > n1.x, 'l\'ordre gauche-droite est conservé');
  assert.ok(n3.y - n2.y >= 150, 'les écarts verticaux s\'agrandissent : les cartes ne se chevauchent pas');
  assert.equal(edges.length, 2);
  const hier = edges.find((e) => e.fromNode === n1.id);
  assert.equal(hier.toNode, n2.id);
  assert.equal(hier.color, undefined);
  const bloc = edges.find((e) => e.fromNode === n2.id);
  assert.equal(bloc.toNode, n3.id);
  assert.equal(bloc.color, '1');
});

test('canevasSansVuesGraphe : la vue Graphe quitte le .base, le reste est intact', () => {
  const base = [
    'filters:',
    '  and:',
    '    - file.ext == "md"',
    'views:',
    '  - type: table',
    '    name: Liste',
    '  - type: ariane-articulation',
    '    name: Graphe',
    '    order:',
    '      - file.name',
    "    arianeArtPlan: '{\"cartes\":[]}'",
    '  - type: ariane-calendrier',
    '    name: Calendrier',
    '',
  ].join('\n');
  const r = canevasSansVuesGraphe(base);
  assert.ok(!r.includes('ariane-articulation') && !r.includes('arianeArtPlan') && !r.includes('Graphe'));
  assert.ok(r.includes('  - type: table\n    name: Liste\n  - type: ariane-calendrier\n    name: Calendrier'));
  assert.ok(r.startsWith('filters:\n  and:\n    - file.ext == "md"\nviews:'));
  assert.equal(canevasSansVuesGraphe('views:\n  - type: table\n'), 'views:\n  - type: table\n');
});

test('canevasAjouterCartes : cartes neuves sous le contenu, relations tracées, sans doublon', () => {
  const rel = (a, b, type) => (type === 'hier' && a === 'T1' && b === 'T2') || (type === 'bloque' && a === 'T2' && b === 'T3');
  const contenu = { nodes: [{ id: 'a', type: 'text', text: '[[T1]]', x: 10, y: 0, width: 280, height: 100 },
    { id: 'n', type: 'file', file: 'x.md', x: 400, y: 50, width: 200, height: 300 }], edges: [] };
  const { contenu: c, poses } = canevasAjouterCartes(contenu, ['T1', 'T2', 'T3', 'T2'], rel, 280);
  assert.deepEqual(poses, ['T2', 'T3'], 'T1 est déjà là (en texte simple), T2 n\'est posée qu\'une fois');
  const n2 = c.nodes.find((n) => n[CANEVAS_CLE] && n[CANEVAS_CLE].ref === 'T2');
  assert.ok(n2.y >= 350 + 120 && n2.x === 10, 'sous tout ce que porte le canevas, aligné à gauche');
  assert.equal(c.edges.length, 2);
  const hier = c.edges.find((e) => e.fromNode === 'a');
  assert.equal(hier.toNode, n2.id);
  assert.equal(hier.color, undefined);
  assert.equal(c.edges.find((e) => e.fromNode === n2.id).color, '1');
  assert.equal(contenu.nodes.length, 2, 'le contenu d\'origine n\'est pas modifié');
  assert.deepEqual(canevasAjouterCartes(c, ['T1'], rel, 280).poses, []);
});

test('replierNiveau et retirerSousTaches : les cartes partent, les notes restent', () => {
  const { canvas, surface } = monter([
    tache('T1'), tache('T2', { parent: '[[T1]]' }), tache('T3', { parent: '[[T2]]' }), tache('T4', { parent: '[[T1]]' }),
  ]);
  canvas.removeNode = (n) => canvas.nodes.delete(n.id);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  noeudTache(canvas, 'T2', 0, 200);
  noeudTache(canvas, 'T3', 0, 400);
  noeudTache(canvas, 'T4', 300, 200);
  surface.replierNiveau();
  const refs = () => [...canvas.nodes.values()].map((n) => n.getData()[CANEVAS_CLE].ref).sort();
  assert.deepEqual(refs(), ['T1', 'T2', 'T4'], 'seul le niveau le plus profond s\'en va');
  surface.retirerSousTaches(n1);
  assert.deepEqual(refs(), ['T1']);
});

test('redisposer : la mère à gauche de ses sous-tâches, le coin du groupe conservé', () => {
  const { canvas, surface } = monter([tache('T1'), tache('T2', { parent: '[[T1]]' }), tache('T3', { parent: '[[T1]]' })]);
  noeudTache(canvas, 'T2', 500, 500);
  noeudTache(canvas, 'T1', 900, 100);
  noeudTache(canvas, 'T3', 100, 900);
  surface.redisposer();
  const pos = new Map([...canvas.nodes.values()].map((n) => [n.getData()[CANEVAS_CLE].ref, n.getData()]));
  assert.ok(pos.get('T2').x > pos.get('T1').x && pos.get('T3').x > pos.get('T1').x);
  assert.equal(Math.min(...[...pos.values()].map((d) => d.x)), 100);
  assert.equal(Math.min(...[...pos.values()].map((d) => d.y)), 100);
});
