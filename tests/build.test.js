// Garde-fou de construction : main.js est un fichier PRODUIT. Ces tests le
// rappellent au premier qui l'éditera à la main — ou qui ajoutera un fragment
// dans src/ sans le déclarer dans src/ordre.json.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const SRC = path.join(RACINE, 'src');
const ORDRE = JSON.parse(fs.readFileSync(path.join(SRC, 'ordre.json'), 'utf8'));

test('main.js est exactement la concaténation des fragments de src/', () => {
  const attendu = Buffer.concat(ORDRE.map((f) => fs.readFileSync(path.join(SRC, f))));
  const actuel = fs.readFileSync(path.join(RACINE, 'main.js'));
  assert.ok(actuel.equals(attendu),
    'main.js diverge de src/ — soit il a été édité à la main (éditer le fragment '
    + 'à la place), soit la construction n\'a pas été relancée : npm run build');
});

test('ordre.json déclare tous les fragments de src/, et rien d\'autre', () => {
  const surDisque = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual([...ORDRE].sort(), surDisque,
    'src/ordre.json et le contenu de src/ divergent : un fragment ajouté doit y '
    + 'être déclaré, à sa place dans l\'ordre de concaténation');
  assert.equal(new Set(ORDRE).size, ORDRE.length, 'un fragment est listé deux fois');
});

test('chaque fragment est du JavaScript valide au premier niveau', () => {
  // La concaténation partageant une seule portée, rien n'oblige un fragment à
  // se suffire — mais s'il ne se suffit pas, « node --check src/*.js » cesse
  // d'être un garde-fou et une coupure mal placée ne se voit qu'au chargement
  // du greffon, chez l'utilisateur.
  for (const f of ORDRE) {
    const source = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.doesNotThrow(() => new vm.Script(source, { filename: 'src/' + f }),
      'src/' + f + ' ne se compile pas seul : la coupure tombe au milieu d\'une '
      + 'construction, la déplacer à une frontière de premier niveau');
  }
});

test('les octets NUL des chaînes sentinelles survivent à la construction', () => {
  // 'SANS_GROUPE' vaut '\0sans', la clé d'arête d'articulation en contient
  // aussi. Un outil qui les mange (sed -i) casse le regroupement en silence.
  const brut = fs.readFileSync(path.join(RACINE, 'main.js'));
  let n = 0;
  for (const o of brut) if (o === 0) n++;
  assert.ok(n >= 7, 'octets NUL perdus (' + n + ' < 7) : contrôler l\'outil qui a '
    + 'réécrit un fragment — tr -cd \'\\000\' < main.js | wc -c');
});

test('main.js porte l\'avertissement « fichier produit »', () => {
  const tete = fs.readFileSync(path.join(RACINE, 'main.js'), 'utf8').slice(0, 2000);
  assert.ok(tete.includes('FICHIER PRODUIT'),
    'l\'en-tête doit dire que main.js se construit depuis src/');
});
