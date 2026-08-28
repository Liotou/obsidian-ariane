const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const canvas = () => ({
  nodes: [
    { id: 'a', type: 'file', file: '8 - Tâches/T26-001.md', x: 0, y: 0, width: 300, height: 200 },
    { id: 'b', type: 'file', file: '8 - Tâches/T26-002.md', x: 500, y: 0, width: 300, height: 200 },
  ],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'suite' }],
});

test('un nœud prend la couleur de son statut', () => {
  const r = Ariane.majCanvas(canvas(), { 'T26-001': { statut: 'terminée' } }, [], '6');
  assert.ok(r.change);
  assert.equal(r.json.nodes.find((n) => n.id === 'a').color, '4');
});

test('un statut à faire laisse le nœud sans couleur', () => {
  const c = canvas();
  c.nodes[0].color = '4';
  const r = Ariane.majCanvas(c, { 'T26-001': { statut: 'à faire' } }, [], '6');
  assert.ok(!r.json.nodes.find((n) => n.id === 'a').color);
});

test('la position et la taille ne bougent pas', () => {
  const r = Ariane.majCanvas(canvas(), { 'T26-001': { statut: 'terminée' } }, [], '6');
  const n = r.json.nodes.find((x) => x.id === 'a');
  assert.equal(n.x, 0);
  assert.equal(n.width, 300);
});

test('le canvas d origine n est pas modifié en place', () => {
  const c = canvas();
  Ariane.majCanvas(c, { 'T26-001': { statut: 'terminée' } }, [], '6');
  assert.ok(!c.nodes[0].color);
});

test('une arête fautive passe au rouge', () => {
  const r = Ariane.majCanvas(canvas(), {}, [{ de: 'T26-001', vers: 'T26-002' }], '6');
  assert.equal(r.json.edges[0].color, '1');
});

test('le libellé d une arête devenue rouge est conservé', () => {
  const r = Ariane.majCanvas(canvas(), {}, [{ de: 'T26-001', vers: 'T26-002' }], '6');
  assert.equal(r.json.edges[0].label, 'suite');
});

test('une arête redevenue cohérente perd son rouge', () => {
  const c = canvas();
  c.edges[0].color = '1';
  const r = Ariane.majCanvas(c, {}, [], '6');
  assert.ok(!r.json.edges[0].color);
});

test('une arête de composition ne se fait pas rougir par mégarde', () => {
  const c = canvas();
  c.edges[0].color = '6';
  const r = Ariane.majCanvas(c, {}, [{ de: 'T26-001', vers: 'T26-002' }], '6');
  assert.equal(r.json.edges[0].color, '6');
});

test('une couleur posée à la main sur une arête de blocage est respectée', () => {
  const c = canvas();
  c.edges[0].color = '3';
  const r = Ariane.majCanvas(c, {}, [], '6');
  assert.equal(r.json.edges[0].color, '3');
  assert.equal(r.change, false);
});

test('sans rien à changer le canvas n est pas réécrit', () => {
  assert.equal(Ariane.majCanvas(canvas(), {}, [], '6').change, false);
});

test('un statut inconnu laisse le nœud tranquille', () => {
  const r = Ariane.majCanvas(canvas(), { 'T26-001': { statut: 'brouillon' } }, [], '6');
  assert.equal(r.change, false);
});

test('une couleur choisie à la main n est pas écrasée par le rougissement', () => {
  const c = canvas();
  c.edges[0].color = '3';
  const r = Ariane.majCanvas(c, {}, [{ de: 'T26-001', vers: 'T26-002' }], '6');
  assert.equal(r.json.edges[0].color, '3');
  assert.equal(r.change, false);
});
