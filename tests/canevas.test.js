const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const {
  CANEVAS_CLE, canevasCotes, canevasRefDuNoeud, canevasNouvelId,
  canevasAjouterCartes, canevasSansVuesGraphe,
  canevasRouteOrtho, canevasPontsOrtho, canevasCheminOrtho, canevasPort, canevasSegmentBloque,
  canevasCorpsNote,
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

test('redisposer : la mère à gauche de ses sous-tâches, le coin du groupe conservé, une même taille', async () => {
  const { canvas, surface } = monter([tache('T1'), tache('T2', { parent: '[[T1]]' }), tache('T3', { parent: '[[T1]]' })]);
  noeudTache(canvas, 'T2', 500, 500);
  noeudTache(canvas, 'T1', 900, 100);
  noeudTache(canvas, 'T3', 100, 900);
  await surface.redisposer();
  const pos = new Map([...canvas.nodes.values()].map((n) => [n.getData()[CANEVAS_CLE].ref, n.getData()]));
  assert.ok(pos.get('T2').x > pos.get('T1').x && pos.get('T3').x > pos.get('T1').x);
  assert.equal(Math.min(...[...pos.values()].map((d) => d.x)), 100);
  assert.equal(Math.min(...[...pos.values()].map((d) => d.y)), 100);
  assert.equal(new Set([...pos.values()].map((d) => d.width + 'x' + d.height)).size, 1, 'toutes à la même taille');
  assert.equal(pos.get('T1').width, 400);
});

// Le chemin ne traverse aucune boîte (bords compris comme libres).
const traverse = (pts, boites) => {
  const b = boites.map((r) => ({ x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height }));
  for (let i = 1; i < pts.length; i++) if (canevasSegmentBloque(pts[i - 1], pts[i], b)) return true;
  return false;
};
const orthogonal = (pts) => pts.every((p, i) => !i || p.x === pts[i - 1].x || p.y === pts[i - 1].y);

test('liens angulaires : droit au but quand la voie est libre', () => {
  const A = { x: 0, y: 0, width: 200, height: 100 };
  const B = { x: 400, y: 0, width: 200, height: 100 };
  const pts = canevasRouteOrtho(canevasPort(A, 'right'), 'right', canevasPort(B, 'left'), 'left', [A, B], {});
  assert.deepEqual(pts, [{ x: 200, y: 50 }, { x: 400, y: 50 }], 'une seule ligne droite');
});

test('liens angulaires : une carte en travers est contournée, à angles droits', () => {
  const A = { x: 0, y: 0, width: 200, height: 100 };
  const B = { x: 600, y: 0, width: 200, height: 100 };
  const C = { x: 300, y: -40, width: 150, height: 180 };
  const pts = canevasRouteOrtho(canevasPort(A, 'right'), 'right', canevasPort(B, 'left'), 'left', [A, B, C], {});
  assert.ok(orthogonal(pts));
  assert.ok(!traverse(pts, [C]), 'C n\'est pas traversée');
  assert.deepEqual(pts[0], { x: 200, y: 50 });
  assert.deepEqual(pts[pts.length - 1], { x: 600, y: 50 });
  assert.ok(pts.length <= 6, 'peu de coudes : ' + JSON.stringify(pts));
});

test('liens angulaires : on aborde la cible par le côté demandé', () => {
  const A = { x: 0, y: 0, width: 200, height: 100 };
  const B = { x: 300, y: 300, width: 200, height: 100 };
  const pts = canevasRouteOrtho(canevasPort(A, 'bottom'), 'bottom', canevasPort(B, 'top'), 'top', [A, B], {});
  assert.ok(orthogonal(pts));
  const [av, der] = pts.slice(-2);
  assert.equal(av.x, der.x, 'le dernier segment est vertical');
  assert.ok(av.y < der.y, 'il descend sur le haut de la cible');
  assert.ok(!traverse(pts.slice(1, -1), [A, B]));
});

test('ponts : le segment horizontal enjambe le vertical, au bon endroit', () => {
  const h = [{ x: 0, y: 50 }, { x: 200, y: 50 }];
  const v = [{ x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.deepEqual(canevasPontsOrtho(h, [v], 5), [{ seg: 1, x: 100, y: 50 }]);
  assert.deepEqual(canevasPontsOrtho(v, [h], 5), [], 'le vertical ne saute pas');
  assert.deepEqual(canevasPontsOrtho(h, [[{ x: 3, y: 0 }, { x: 3, y: 100 }]], 5), [], 'trop près d\'un bout');
  const d = canevasCheminOrtho(h, 8, canevasPontsOrtho(h, [v], 5), 5);
  assert.equal(d, 'M 0 50 L 95 50 A 5 5 0 0 1 105 50 L 200 50');
});

test('chemin angulaire : coins arrondis, rayon borné par les segments', () => {
  const d = canevasCheminOrtho([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 200, y: 10 }], 8, [], 5);
  assert.equal(d, 'M 0 0 L 95 0 Q 100 0 100 5 L 100 5 Q 100 10 105 10 L 200 10');
});

test('surface : les liens entre tâches prennent le tracé angulaire, et le rendent', () => {
  const { canvas, surface, greffon, integration } = monter([tache('T1'), tache('T2', { parent: '[[T1]]' })]);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  const n2 = noeudTache(canvas, 'T2', 400, 0);
  const attr = () => { const a = {}; return { getAttribute: (k) => a[k], setAttribute: (k, v) => { a[k] = v; } }; };
  const classes = () => { const s = new Set(); return { classList: { toggle: (c, v) => (v ? s.add(c) : s.delete(c)), has: (c) => s.has(c) } }; };
  let natifs = 0;
  const arete = { id: 'e1', from: { node: n1, side: 'right' }, to: { node: n2, side: 'left' },
    toLineEnd: { el: {} }, path: { display: attr(), interaction: attr() },
    lineGroupEl: classes(), lineEndGroupEl: classes(),
    updatePath() { natifs += 1; this.path.display.setAttribute('d', 'NATIF'); } };
  canvas.edges.set('e1', arete);
  surface._actif = true;
  surface._majLiens(integration.donnees());
  assert.equal(arete.path.display.getAttribute('d'), 'M 200 40 L 393 40', 'droit, arrêté avant la pointe');
  assert.equal(arete.path.interaction.getAttribute('d'), 'M 200 40 L 393 40');
  assert.ok(arete.lineGroupEl.classList.has('zfa-cnv-lien-hier'));
  // Le canevas recalcule (une carte bouge) : Ariane repasse derrière lui.
  n2.setData(Object.assign({}, n2.getData(), { y: 300 }));
  arete.updatePath();
  assert.notEqual(arete.path.display.getAttribute('d'), 'NATIF');
  assert.match(arete.path.display.getAttribute('d'), /^M 200 40 L /);
  // Retour à la courbe : le tracé du canevas revient, sa méthode aussi.
  greffon.settings.canevasLiens = 'courbe';
  const avant = natifs;
  surface._majLiens(integration.donnees());
  assert.equal(arete.path.display.getAttribute('d'), 'NATIF');
  assert.ok(natifs > avant);
  // Sans côtés automatiques non plus, l'arête retrouve sa méthode d'origine.
  greffon.settings.canevasCotesAuto = false;
  surface._majLiens(integration.donnees());
  assert.equal(arete.updatePath.name, 'updatePath');
});

test('côtés lisibles : de flanc à flanc côte à côte, de haut en bas empilées, sans basculer au moindre pixel', () => {
  const { canevasCotesLisibles } = Ariane._test;
  const A = { x: 0, y: 0, width: 200, height: 100 };
  assert.deepEqual(canevasCotesLisibles(A, { x: 400, y: 20, width: 200, height: 100 }, null), { de: 'right', vers: 'left' });
  assert.deepEqual(canevasCotesLisibles(A, { x: -400, y: 0, width: 200, height: 100 }, null), { de: 'left', vers: 'right' });
  assert.deepEqual(canevasCotesLisibles(A, { x: 50, y: 300, width: 200, height: 100 }, null), { de: 'bottom', vers: 'top' });
  // Nettement à côté, même loin en dessous : de flanc à flanc (lecture d'une
  // colonne à la suivante).
  const diag = { x: 300, y: 260, width: 200, height: 100 };   // gx 100, gy 160
  assert.deepEqual(canevasCotesLisibles(A, diag, null), { de: 'right', vers: 'left' });
  assert.deepEqual(canevasCotesLisibles(A, { x: 300, y: 900, width: 200, height: 100 }, null), { de: 'right', vers: 'left' });
  // Presque à l'aplomb (gx 40, gy 160) : de haut en bas.
  const aplomb = { x: 240, y: 260, width: 200, height: 100 };
  assert.deepEqual(canevasCotesLisibles(A, aplomb, null), { de: 'bottom', vers: 'top' });
  assert.deepEqual(canevasCotesLisibles(A, { x: 10, y: 10, width: 200, height: 100 }, { de: 'top', vers: 'bottom' }),
    { de: 'top', vers: 'bottom' }, 'cartes superposées : on garde');
});

test('répartition : deux liens sur un même côté s\'y partagent la place, dans l\'ordre de leurs cibles', () => {
  const { canvas, surface } = monter([tache('T1'), tache('T2'), tache('T3')]);
  const n1 = noeudTache(canvas, 'T1', 0, 100);
  const n2 = noeudTache(canvas, 'T2', 400, 0);
  const n3 = noeudTache(canvas, 'T3', 400, 300);
  const a = { id: 'a', from: { node: n1, side: 'right' }, to: { node: n3, side: 'left' } };
  const b = { id: 'b', from: { node: n1, side: 'right' }, to: { node: n2, side: 'left' } };
  const f = surface._repartir([a, b]);
  assert.ok(f.get(b).f1 < f.get(a).f1, 'le lien vers la carte du haut part plus haut');
  assert.equal(f.get(a).f2, 0.5, 'seul sur son côté d\'arrivée : au milieu');
});

test('points d\'accroche : le témoin compte les sous-tâches cachées, le clic les pose puis les replie', async () => {
  const { canvas, surface, integration } = monter([
    tache('T1'), tache('T2', { parent: '[[T1]]' }), tache('T3', { parent: '[[T1]]' }), tache('T4', { bloquePar: ['[[T1]]'] }),
  ]);
  canvas.removeNode = (n) => canvas.nodes.delete(n.id);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  let rel = surface._relatifs('T1', integration.donnees());
  assert.deepEqual(rel.hier, { tous: 2, caches: 2, pliables: 0 });
  assert.deepEqual(rel.bloque, { tous: 0, caches: 0, pliables: 0 }, 'T1 bloque T4, elle n\'est pas bloquée');
  await surface._accroche(n1, 'T1', 'hier', false);
  const refs = () => [...canvas.nodes.values()].map((n) => n.getData()[CANEVAS_CLE].ref).sort();
  assert.deepEqual(refs(), ['T1', 'T2', 'T3'], 'les sous-tâches cachées sont posées');
  rel = surface._relatifs('T1', integration.donnees());
  assert.deepEqual(rel.hier, { tous: 2, caches: 0, pliables: 2 }, 'le témoin passe à « − »');
  await surface._accroche(n1, 'T1', 'hier', false);
  assert.deepEqual(refs(), ['T1'], 'second clic : repliées');
});

test('carte dépliée : la hauteur en décide, le chevron la donne ou la reprend', () => {
  const { canvas, surface } = monter([tache('T1')]);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  surface._majDetails = () => {};
  const m = { ref: 'T1', noeud: n1, hNaturelle: 140 };
  const h = (v) => n1.setData(Object.assign({}, n1.getData(), { height: v }));
  h(200);
  assert.equal(surface._estDepliee(m, n1.getData()), false, 'un peu de marge ne fait pas un détail');
  h(400);
  assert.equal(surface._estDepliee(m, n1.getData()), true, 'agrandie : le détail paraît');
  surface._basculerDetail(m);
  assert.equal(n1.getData().height, 140, 'le chevron referme à la hauteur du contenu');
  surface._basculerDetail(m);
  assert.ok(surface._estDepliee(m, n1.getData()), 'et rouvre avec la place du détail');
  assert.equal(canevasCorpsNote('---\na: 1\n---\n# Titre\n<!-- ariane:creneaux -->\n## Sessions\n<!-- /ariane:creneaux -->\n\n\n\n## Note\nTexte'),
    '## Note\nTexte');
});

test('liens : une seconde passe n\'écrit plus rien (pas de passes sans fin avec l\'observateur)', () => {
  const { canvas, surface, integration } = monter([tache('T1'), tache('T2', { parent: '[[T1]]' }), tache('T3', { parent: '[[T1]]' })]);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  const n2 = noeudTache(canvas, 'T2', 400, -100);
  const n3 = noeudTache(canvas, 'T3', 400, 200);
  let ecritures = 0;
  const attr = () => { const a = {}; return { getAttribute: (k) => a[k], setAttribute: (k, v) => { a[k] = v; ecritures += 1; } }; };
  const classes = () => { const s = new Set(); return { classList: { toggle: (c, v) => (v ? s.add(c) : s.delete(c)), has: (c) => s.has(c) } }; };
  const pointe = () => { const st = {}; return { el: { style: new Proxy(st, { set: (o, k, v) => { o[k] = v; ecritures += 1; return true; } }) } }; };
  const arete = (id, de, vers) => ({ id, from: { node: de, side: 'bottom' }, to: { node: vers, side: 'top' },
    toLineEnd: pointe(), path: { display: attr(), interaction: attr() }, lineGroupEl: classes(), lineEndGroupEl: classes(),
    updatePath() { this.path.display.setAttribute('d', 'NATIF'); this.toLineEnd.el.style.transform = 'natif'; } });
  canvas.edges.set('a', arete('a', n1, n2));
  canvas.edges.set('b', arete('b', n1, n3));
  surface._actif = true;
  surface._majLiens(integration.donnees());
  const a = canvas.edges.get('a');
  assert.equal(a.from.side, 'right', 'côte à côte : de flanc à flanc');
  assert.equal(a.to.side, 'left');
  assert.match(a.toLineEnd.el.style.transform, /rotate\(90deg\)/, 'la pointe entre par la gauche');
  ecritures = 0;
  surface._majLiens(integration.donnees());
  assert.equal(ecritures, 0, 'rien n\'a bougé : rien n\'est réécrit');
});

test('couloirs : un faisceau s\'étage, sans superposition ni croisement', () => {
  const { canevasCouloirs } = Ariane._test;
  // Quatre liens partent du flanc droit (x 400, amorce 417) vers une colonne
  // à x 520 (amorce 503), tous plus bas que leur départ.
  const l = [
    { id: 'a', depart: 100, arrivee: 120, a: 417, b: 503 },
    { id: 'b', depart: 120, arrivee: 300, a: 417, b: 503 },
    { id: 'c', depart: 140, arrivee: 480, a: 417, b: 503 },
    { id: 'd', depart: 160, arrivee: 660, a: 417, b: 503 },
  ];
  const c = canevasCouloirs(l);
  const xs = ['a', 'b', 'c', 'd'].map((k) => c.get(k));
  assert.equal(new Set(xs).size, 4, 'quatre couloirs distincts');
  assert.ok(xs[0] > xs[1] && xs[1] > xs[2] && xs[2] > xs[3], 'le plus haut va le plus loin');
  assert.ok(xs.every((x) => x > 417 && x < 503), 'entre les amorces');
  // Montants : le plus bas va le plus loin.
  const m = canevasCouloirs([
    { id: 'h', depart: 100, arrivee: 10, a: 417, b: 503 },
    { id: 'i', depart: 120, arrivee: 50, a: 417, b: 503 },
  ]);
  assert.ok(m.get('i') > m.get('h'));
  // À niveau : pas de couloir (le lien est droit).
  assert.equal(canevasCouloirs([{ id: 'z', depart: 100, arrivee: 100.5, a: 417, b: 503 }]).size, 0);
});

test('tracé : le couloir imposé est suivi quand rien ne le barre', () => {
  const { canevasRouteOrtho } = Ariane._test;
  const A = { x: 0, y: 0, width: 400, height: 200 };
  const B = { x: 520, y: 400, width: 400, height: 200 };
  const pts = canevasRouteOrtho({ x: 400, y: 80 }, 'right', { x: 520, y: 500 }, 'left', [A, B], { amorce: 17, couloir: 450 });
  assert.ok(pts.some((p) => p.x === 450), 'le segment vertical passe par le couloir');
  assert.equal(pts.length, 4, 'un seul coude par côté');
});

test('disposition : une mère se centre sur ses filles, un enfant unique en face', () => {
  const noeuds = ['M', 'F1', 'F2', 'F3', 'U', 'V'].map((ref) => ({ ref }));
  const aretes = [
    { de: 'M', vers: 'F1', type: 'hier' }, { de: 'M', vers: 'F2', type: 'hier' }, { de: 'M', vers: 'F3', type: 'hier' },
    { de: 'U', vers: 'V', type: 'hier' },
  ];
  const pos = Ariane.disposerArticulation(noeuds, aretes, { dx: 500, gapY: 50, gapBande: 120, hauteur: () => 100 });
  const cy = (r) => pos.get(r).y + 50;
  const milieu = (Math.min(cy('F1'), cy('F2'), cy('F3')) + Math.max(cy('F1'), cy('F2'), cy('F3'))) / 2;
  assert.equal(cy('M'), milieu);
  assert.equal(cy('U'), cy('V'));
});

test('points d\'attache d\'un faisceau : en face de leur carte quand la place le permet, dans l\'ordre, espacés', () => {
  const { canevasFractions } = Ariane._test;
  const f = canevasFractions([-0.7, -0.2, 0.5, 1.4, 2.4], 0.3, 0.9, 0.095);
  assert.equal(f[2], 0.5, 'la carte en face : trait droit');
  assert.ok(f.every((x, i) => i === 0 || x - f[i - 1] >= 0.094), 'espacés');
  assert.ok(f[0] >= 0.3 && f[4] <= 0.9, 'bornés');
});

test('carte repliée : elle épouse son contenu, sans vide sous la jauge ; dépliée, elle garde sa place', () => {
  const { canvas, surface } = monter([tache('T1')]);
  const n1 = noeudTache(canvas, 'T1', 0, 0);
  surface._majDetails = () => {};
  const m = { ref: 'T1', noeud: n1 };
  surface.cartes.set(n1, m);
  surface._hauteurContenu = () => 140;
  const h = (v) => n1.setData(Object.assign({}, n1.getData(), { height: v }));
  h(240);                                   // repliée, avec 100 px de vide
  surface._aAjuster.add(n1);
  surface._ajusterHauteurs();
  assert.equal(n1.getData().height, 140, 'repliée : ramenée à son contenu');
  h(480);                                   // dépliée : on la laisse
  surface._aAjuster.add(n1);
  surface._ajusterHauteurs();
  assert.equal(n1.getData().height, 480);
});
