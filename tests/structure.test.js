// Garde-fou de structure : le balisage //#region de main.js est la carte du
// fichier. Plusieurs IA éditent ce fichier à tour de rôle ; sans ce test, les
// bornes se dépareillent et la carte de l'en-tête ment silencieusement.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const LIGNES = SRC.split('\n');

// Niveau 1 : //#region N · Titre en colonne 0.
function regionsNiveau1() {
  const out = [];
  LIGNES.forEach((l, i) => {
    const o = l.match(/^\/\/#region (\d+) · (.+)$/);
    const f = l.match(/^\/\/#endregion (\d+) · (.+)$/);
    if (o) out.push({ sens: 'ouvre', n: Number(o[1]), titre: o[2], ligne: i + 1 });
    if (f) out.push({ sens: 'ferme', n: Number(f[1]), titre: f[2], ligne: i + 1 });
  });
  return out;
}

// Niveau 2 : //#region Prefixe · domaine, indenté de deux espaces.
function regionsNiveau2() {
  const out = [];
  LIGNES.forEach((l, i) => {
    const o = l.match(/^ {2}\/\/#region ([A-Za-zÀ-ÿ]+) · (.+)$/);
    const f = l.match(/^ {2}\/\/#endregion ([A-Za-zÀ-ÿ]+) · (.+)$/);
    if (o) out.push({ sens: 'ouvre', prefixe: o[1], titre: o[2], ligne: i + 1 });
    if (f) out.push({ sens: 'ferme', prefixe: f[1], titre: f[2], ligne: i + 1 });
  });
  return out;
}

test('régions de niveau 1 : appariées, dans l\'ordre, sans trou', () => {
  const r = regionsNiveau1();
  assert.ok(r.length >= 2, 'aucune région trouvée dans main.js');
  const pile = [];
  const ouvertes = [];
  for (const b of r) {
    if (b.sens === 'ouvre') { pile.push(b); ouvertes.push(b); continue; }
    const o = pile.pop();
    assert.ok(o, `#endregion ${b.n} · ${b.titre} (ligne ${b.ligne}) ferme une région jamais ouverte`);
    assert.equal(o.n, b.n, `ligne ${b.ligne} : #endregion ${b.n} ferme #region ${o.n}`);
    assert.equal(o.titre, b.titre,
      `ligne ${b.ligne} : titre de fermeture « ${b.titre} » ≠ ouverture « ${o.titre} »`);
  }
  assert.equal(pile.length, 0,
    'région(s) jamais fermée(s) : ' + pile.map((x) => x.n + ' · ' + x.titre).join(', '));
  // Numérotation : 1, 2, 3… sans saut ni doublon.
  ouvertes.forEach((o, i) => {
    assert.equal(o.n, i + 1,
      `numérotation : la région « ${o.titre} » porte le numéro ${o.n}, attendu ${i + 1}`);
  });
});

test('régions de niveau 2 : appariées par préfixe et titre', () => {
  const r = regionsNiveau2();
  assert.ok(r.length >= 2, 'aucune sous-région trouvée');
  const pile = [];
  for (const b of r) {
    if (b.sens === 'ouvre') { pile.push(b); continue; }
    const o = pile.pop();
    assert.ok(o, `sous-région fermée sans ouverture (ligne ${b.ligne})`);
    assert.equal(o.prefixe + ' · ' + o.titre, b.prefixe + ' · ' + b.titre,
      `ligne ${b.ligne} : fermeture « ${b.prefixe} · ${b.titre} » ≠ ouverture « ${o.prefixe} · ${o.titre} »`);
  }
  assert.equal(pile.length, 0,
    'sous-région(s) jamais fermée(s) : ' + pile.map((x) => x.prefixe + ' · ' + x.titre).join(', '));
});

test('les grosses classes portent bien des sous-régions', () => {
  const prefixes = new Set(regionsNiveau2().map((b) => b.prefixe));
  for (const p of ['Ariane', 'Frise', 'Articulation', 'Calendrier']) {
    assert.ok(prefixes.has(p), `aucune sous-région « ${p} · … » : la classe a perdu son balisage`);
  }
});

test('la carte de l\'en-tête liste exactement les régions du fichier', () => {
  const titres = regionsNiveau1().filter((b) => b.sens === 'ouvre').map((b) => b.titre);
  const entete = SRC.slice(0, SRC.indexOf('const obsidian = require'));
  for (let i = 0; i < titres.length; i++) {
    const num = String(i + 1).padStart(2, ' ');
    const re = new RegExp('^ \\*\\s+' + num.trim() + ' · ' + titres[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm');
    assert.ok(re.test(entete),
      `la CARTE DU FICHIER ne mentionne pas « ${i + 1} · ${titres[i]} » — mettre l'en-tête à jour`);
  }
});

test('les trois moteurs de vue héritent du socle, sans _doc() local', () => {
  for (const c of ['MoteurFrise', 'MoteurArticulation', 'MoteurCalendrier']) {
    assert.ok(SRC.includes('class ' + c + ' extends MoteurVue {'),
      c + ' doit hériter de MoteurVue : c\'est là que vivent _doc() et _win()');
  }
  // Un seul _doc() dans tout le fichier : celui du socle. Le redéfinir dans un
  // moteur, c'est reprendre le risque qu'une correction en oublie un.
  const defs = LIGNES.filter((l) => /^ {2}_doc\(\)/.test(l)).length;
  assert.equal(defs, 1, 'un _doc() local est réapparu : il doit rester dans MoteurVue seul');
});

// class Ariane est assemblée par composer(obsidian.Plugin, avecSocle, …) :
// chaque mixin vit dans son src/11*.js. La composition applique les mixins de
// gauche à droite, donc deux mixins qui définiraient la même méthode se
// masqueraient l'un l'autre — en silence, et le vainqueur dépendrait de
// l'ordre de src/ordre.json.
function mixinsAriane() {
  const dir = path.join(__dirname, '..', 'src');
  const out = new Map(); // fichier -> Set de noms de membres
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/^11[b-z]-.*\.js$/.test(f)) continue;
    const membres = new Set();
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const m = l.match(/^ {2}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(/);
      if (m && m[1] !== 'if' && m[1] !== 'for' && m[1] !== 'while'
        && m[1] !== 'switch' && m[1] !== 'catch' && m[1] !== 'return') membres.add(m[1]);
    }
    out.set(f, membres);
  }
  return out;
}

test('les mixins de class Ariane ne se masquent pas entre eux', () => {
  const parFichier = mixinsAriane();
  assert.ok(parFichier.size >= 10, 'les fragments src/11*.js sont introuvables');
  const vu = new Map(); // nom -> premier fichier qui le définit
  const collisions = [];
  for (const [f, membres] of parFichier) {
    for (const nom of membres) {
      if (vu.has(nom)) collisions.push(nom + ' : ' + vu.get(nom) + ' et ' + f);
      else vu.set(nom, f);
    }
  }
  assert.deepEqual(collisions, [],
    'membres définis dans deux mixins — le dernier composé gagne en silence :\n  '
    + collisions.join('\n  '));
});

test('chaque mixin de class Ariane est déclaré dans la composition', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const declares = [...src.matchAll(/^const (avec[A-Za-z]+) = \(Base\) => class extends Base \{$/gm)]
    .map((m) => m[1]);
  assert.ok(declares.length >= 10, 'aucun mixin déclaré : le découpage a été défait');
  const compo = src.match(/class Ariane extends composer\(obsidian\.Plugin,\n([\s\S]*?)\) \{/);
  assert.ok(compo, 'class Ariane n\'est plus assemblée par composer()');
  const composes = compo[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(composes, declares,
    'un mixin est déclaré mais pas composé (ou dans un autre ordre) : ses méthodes '
    + 'seraient absentes du greffon');
});

test('pas de document/window global pour les gestes des vues', () => {
  // Dans un volet détaché, le document global est celui de la fenêtre
  // principale : les moteurs de vue doivent passer par _doc().
  const fautifs = [];
  LIGNES.forEach((l, i) => {
    if (/document\.(add|remove)EventListener\(\s*['"]pointer(move|up)['"]/.test(l)) {
      fautifs.push(i + 1);
    }
  });
  assert.deepEqual(fautifs, [],
    'écouteurs de glisser posés sur le document global (lignes ' + fautifs.join(', ')
    + ') — utiliser this._doc()');
});
