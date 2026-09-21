const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const { correcteurMasquer, correcteurBlocs, correcteurFautes, correcteurCleIgnore,
  correcteurZonesExclues } = Ariane._test;

test('masquer : la longueur ne change jamais, les positions restent exactes', () => {
  const lignes = [
    '## Titre avec `du code` et un [[lien|alias]] puis ![[image.png]]',
    '- [ ] tâche à [lire](https://exemple.org/a?b=1) avec #étiquette et **gras** ==surligné==',
    '> [!note] Une citation avec $x^2$ et <span class="a">balise</span> %%commentaire%%',
    'Une note_avec_soulignés et un _mot_ en italique, note[^1] fin ^bloc-id',
  ];
  for (const l of lignes) assert.equal(correcteurMasquer(l).length, l.length, l);
});

test('masquer : la prose reste, le reste devient des espaces', () => {
  const m = correcteurMasquer('- [ ] Voir [le guide](https://x.org) et `code` puis [[Note]] fin');
  assert.ok(m.includes('Voir'));
  assert.ok(m.includes('le guide'));
  assert.ok(m.includes('fin'));
  assert.ok(!/https|code|Note|\[|\]|\(|\)/.test(m), m);
  const t = correcteurMasquer('Un mot #tag/sous et un_mot_composé');
  assert.ok(!t.includes('#tag'));
  assert.ok(t.includes('un_mot_composé'), 'les soulignés au cœur d\'un mot sont gardés');
});

test('blocs : entête YAML, code et formules sont sautés, les positions sont absolues', () => {
  const texte = [
    '---', 'titre: Un titre', '---',
    'Première ligne.',
    '```js', 'const trucEnCode = 1;', '```',
    '',
    '$$', 'E = mc^2', '$$',
    '- Une puce',
    '![[image.png]]',
  ].join('\n');
  const blocs = correcteurBlocs(texte);
  assert.deepEqual(blocs.map((b) => b.texte.trim()), ['Première ligne.', 'Une puce']);
  for (const b of blocs) assert.equal(texte.substr(b.from, b.texte.length).trim().length > 0, true);
  assert.equal(texte.substr(blocs[0].from, 15), 'Première ligne.');
  assert.equal(texte.substr(blocs[1].from, 10), '- Une puce');
});

test('blocs : un fichier sans entête, fins de ligne Windows comprises', () => {
  const texte = 'Bonjour le monde.\r\nDeuxième ligne.\r\n';
  const blocs = correcteurBlocs(texte);
  assert.equal(blocs.length, 2);
  assert.equal(blocs[1].from, 'Bonjour le monde.\r\n'.length);
});

test('fautes : positions absolues, genres demandés, fautes ignorées', () => {
  const blocs = [{ from: 10, texte: 'a' }, { from: 50, texte: 'b' }];
  const cache = new Map([
    ['a', [{ from: 3, length: 4, kind: 'grammar', word: 'abcd', replace: ['x'], message: 'm', category: 'c' }]],
    ['b', [{ from: 0, length: 2, kind: 'spelling', word: 'zz', replace: [] }]],
  ]);
  const tout = correcteurFautes(blocs, cache, new Set(), { grammar: true, spelling: true });
  assert.deepEqual(tout.map((f) => [f.from, f.to, f.kind]), [[13, 17, 'grammar'], [50, 52, 'spelling']]);
  const gram = correcteurFautes(blocs, cache, new Set(), { grammar: true, spelling: false });
  assert.equal(gram.length, 1);
  const ign = correcteurFautes(blocs, cache, new Set([correcteurCleIgnore(cache.get('a')[0])]), { grammar: true, spelling: true });
  assert.deepEqual(ign.map((f) => f.kind), ['spelling']);
});

test('fautes : la relecture prime, une même ligne répétée est signalée partout', () => {
  // Deux lignes de même texte : le cache ne sert qu'une fois, les deux
  // soulignements se posent quand même, chacun à sa place.
  const blocs = [{ from: 0, texte: 'x' }, { from: 100, texte: 'x' }];
  const cache = new Map([['x', [{ from: 2, length: 5, kind: 'grammar', word: 'testé', replace: ['tester'], message: 'm', category: 'Forme du verbe' }]]]);
  const f = correcteurFautes(blocs, cache, new Set(), { grammar: true, spelling: true });
  assert.deepEqual(f.map((x) => x.from), [2, 102]);
  assert.deepEqual(f[0].replace, ['tester']);
  assert.equal(f[1].category, 'Forme du verbe');
});

test('fautes : une ligne que le démon n\'a pas encore vue ne produit rien', () => {
  const blocs = [{ from: 0, texte: 'jamais vue' }];
  assert.deepEqual(correcteurFautes(blocs, new Map(), new Set(), { grammar: true, spelling: true }), []);
});

// Un document minimal : le strict nécessaire à construireBulle, pour éprouver
// la bulle sans dépendre d'un vrai navigateur.
function faussesBalises() {
  const creer = (tag) => {
    const e = {
      tag, className: '', textContent: '', enfants: [], attributs: {}, ecoutes: {}, style: {},
      appendChild(x) { this.enfants.push(x); x.parent = this; return x; },
      setAttribute(k, v) { this.attributs[k] = v; },
      addEventListener(nom, f) { (this.ecoutes[nom] = this.ecoutes[nom] || []).push(f); },
      contains() { return false; },
      classList: {
        toggle(c, oui) {
          const l = String(e.className).split(' ').filter((x) => x && x !== c);
          if (oui) l.push(c);
          e.className = l.join(' ');
        },
      },
    };
    return e;
  };
  const corps = creer('body');
  const fenetre = {
    innerWidth: 1200, innerHeight: 800,
    addEventListener() {}, removeEventListener() {},
  };
  return { createElement: creer, body: corps, defaultView: fenetre };
}

function bulleDe(faute, reglages) {
  const centre = new (Ariane._test.CorrecteurApple)({ settings: reglages || {} });
  const envois = [];
  const vue = { dom: { ownerDocument: faussesBalises() }, dispatch: (s) => envois.push(s) };
  return { racine: centre.construireBulle(vue, faute), envois };
}

const parClasse = (el, classe) => {
  const trouves = [];
  const descendre = (e) => { if (String(e.className).split(' ').includes(classe)) trouves.push(e); e.enfants.forEach(descendre); };
  descendre(el);
  return trouves;
};

test('bulle : catégorie, explication, propositions, actions', () => {
  const { racine, envois } = bulleDe({
    from: 34, to: 38, kind: 'grammar', word: 'elle', replace: ['elles'],
    message: 'Ici, le pronom « elles » doit être utilisé à la place de « elle ».', category: 'Pronom',
  });
  assert.equal(parClasse(racine, 'zfa-corr-categorie')[0].textContent, 'Pronom');
  assert.match(parClasse(racine, 'zfa-corr-texte')[0].textContent, /pronom « elles »/);
  const choix = parClasse(racine, 'zfa-corr-choix');
  assert.deepEqual(choix.map((b) => b.textContent), ['elles']);
  assert.match(choix[0].attributs['aria-label'], /Remplacer/);
  // Une seule action pour la grammaire : ignorer. Pas de dictionnaire.
  assert.equal(parClasse(racine, 'zfa-corr-action').length, 1);
  choix[0].ecoutes.mousedown[0]({ preventDefault() {} });
  assert.deepEqual(envois, [{ changes: { from: 34, to: 38, insert: 'elles' } }]);
});

test('bulle : orthographe, propositions en retrait après la première', () => {
  const { racine } = bulleDe({ from: 0, to: 8, kind: 'spelling', word: 'xyzzyque',
    replace: ['xyloque', 'xystique', 'xyste', 'xyris', 'de trop'], message: '', category: '' });
  assert.equal(parClasse(racine, 'zfa-corr-categorie')[0].textContent, 'Orthographe');
  assert.match(parClasse(racine, 'zfa-corr-texte')[0].textContent, /dictionnaire/);
  const choix = parClasse(racine, 'zfa-corr-choix');
  assert.equal(choix.length, 4, 'quatre propositions au plus');
  assert.ok(choix.every((b) => b.className === 'zfa-corr-choix'), 'toutes de même allure');
  // Orthographe : dictionnaire et ignorer.
  assert.equal(parClasse(racine, 'zfa-corr-action').length, 2);
});

test('bulle : sans proposition, la rangée le dit au lieu de rester vide', () => {
  const { racine } = bulleDe({ from: 0, to: 3, kind: 'spelling', word: 'zzz', replace: [], message: '', category: '' });
  assert.equal(parClasse(racine, 'zfa-corr-choix').length, 0);
  assert.equal(parClasse(racine, 'zfa-corr-aucune')[0].textContent, 'Aucune proposition');
});

test('bulle : l\'explication se coupe par réglage, la correction reste', () => {
  const faute = { from: 34, to: 38, kind: 'grammar', word: 'elle', replace: ['elles'],
    message: 'Ici, le pronom « elles » doit être utilisé à la place de « elle ».', category: 'Pronom' };
  assert.equal(parClasse(bulleDe(faute).racine, 'zfa-corr-texte').length, 1);
  const { racine } = bulleDe(faute, { correcteurExplication: false });
  assert.equal(parClasse(racine, 'zfa-corr-texte').length, 0, 'plus une ligne d\'explication');
  assert.equal(parClasse(racine, 'zfa-corr-categorie')[0].textContent, 'Pronom', 'la catégorie reste');
  assert.deepEqual(parClasse(racine, 'zfa-corr-choix').map((b) => b.textContent), ['elles']);
});

// ── Relecture guidée ────────────────────────────────────────────────────────
// Le panneau ne garde pas de liste à lui : il lit celle de l'éditeur. On lui
// donne donc un faux éditeur, dont l'état change vraiment quand il l'édite.
function fauxEditeur(texte, fautes) {
  const vue = {
    _texte: texte,
    _fautes: fautes.slice(),
    _visee: undefined,
    _montre: [],
    dom: { ownerDocument: faussesBalises(), contains: () => false },
    scrollDOM: { addEventListener() {}, removeEventListener() {} },
    coordsAtPos: () => null,
    // Comme CodeMirror : la liste des fautes est un champ d'état.
    state: { doc: { sliceString: (a, b) => vue._texte.slice(a, b) }, field: () => ({ fautes: vue._fautes }) },
    dispatch(spec) {
      if (spec.changes) {
        const cs = [].concat(spec.changes).sort((a, b) => b.from - a.from);
        for (const ch of cs) {
          const ecart = ch.insert.length - (ch.to - ch.from);
          vue._texte = vue._texte.slice(0, ch.from) + ch.insert + vue._texte.slice(ch.to);
          // Comme CodeMirror : la faute touchée disparaît, les suivantes suivent.
          vue._fautes = vue._fautes
            .filter((f) => !(ch.from <= f.to && ch.to >= f.from))
            .map((f) => (f.from >= ch.to ? Object.assign({}, f, { from: f.from + ecart, to: f.to + ecart }) : f));
        }
      }
      for (const ef of [].concat(spec.effects || [])) {
        if (ef && ef.genre === 'poser') vue._fautes = ef.valeur;
        if (ef && ef.genre === 'viser') vue._visee = ef.valeur;
        if (ef && ef.genre === 'montrer') vue._montre.push(ef.valeur);
      }
    },
  };
  return vue;
}

function guideeSur(texte, fautes, reglages) {
  const centre = new (Ariane._test.CorrecteurApple)({ settings: reglages || {} });
  const vue = fauxEditeur(texte, fautes);
  centre._champ = true;
  centre._poser = { of: (v) => ({ genre: 'poser', valeur: v }) };
  centre._viser = { of: (v) => ({ genre: 'viser', valeur: v }) };
  centre._scroller = (p) => ({ genre: 'montrer', valeur: p });
  centre.actif = () => true;
  centre.guidee.vue = vue;
  centre.guidee._construire();
  centre.guidee.afficher();
  return { centre, vue, g: centre.guidee, lire: (c) => parClasse(centre.guidee.el, c).map((e) => e.textContent) };
}

const PHRASE = 'Ceci est une note pour testé la validité du correceur qui marchaient bien.';
const FAUTES = () => [
  { from: 23, to: 28, kind: 'grammar', word: 'testé', replace: ['tester'], message: 'Le verbe tester.', category: 'Verbe' },
  { from: 44, to: 53, kind: 'spelling', word: 'correceur', replace: ['correcteur'], message: '', category: 'Orthographe' },
  { from: 58, to: 68, kind: 'grammar', word: 'marchaient', replace: ['marchait'], message: 'Le verbe marchait.', category: 'Forme du verbe' },
];

test('relecture guidée : compte, original, suggestion, passage visé', () => {
  const { g, vue, lire } = guideeSur(PHRASE, FAUTES());
  assert.deepEqual(lire('zfa-relecture-compte'), ['1 sur 3']);
  assert.deepEqual(lire('zfa-relecture-mot'), ['testé']);
  assert.deepEqual(lire('zfa-relecture-mot-propose'), ['tester']);
  assert.deepEqual(lire('zfa-relecture-cat'), [' (Verbe)']);
  assert.deepEqual(lire('zfa-relecture-texte'), ['Le verbe tester.']);
  assert.deepEqual(vue._visee, { from: 23, to: 28 }, 'la faute est surlignée dans le texte');
  assert.deepEqual(vue._montre, [23], 'et amenée sous les yeux');
  void g;
});

test('relecture guidée : navigation en boucle, dans l\'ordre du texte', () => {
  const { g, lire } = guideeSur(PHRASE, FAUTES());
  g.aller(1);
  assert.deepEqual(lire('zfa-relecture-compte'), ['2 sur 3']);
  assert.deepEqual(lire('zfa-relecture-mot'), ['correceur']);
  g.aller(1); g.aller(1);
  assert.deepEqual(lire('zfa-relecture-compte'), ['1 sur 3'], 'après la dernière, on revient à la première');
  g.aller(-1);
  assert.deepEqual(lire('zfa-relecture-mot'), ['marchaient'], 'et en arrière depuis la première');
});

test('relecture guidée : accepter corrige le texte et passe à la suivante', () => {
  const { g, vue, lire } = guideeSur(PHRASE, FAUTES());
  g.accepter();
  assert.match(vue._texte, /pour tester la validité/);
  assert.deepEqual(lire('zfa-relecture-compte'), ['1 sur 2']);
  assert.deepEqual(lire('zfa-relecture-mot'), ['correceur'], 'la suivante prend la place, décalée par la correction');
  g.accepter();
  assert.match(vue._texte, /du correcteur qui/);
  assert.deepEqual(lire('zfa-relecture-mot'), ['marchaient']);
});

test('relecture guidée : ignorer retire la faute sans toucher au texte', () => {
  const { g, vue, centre, lire } = guideeSur(PHRASE, FAUTES());
  g.ignorer();
  assert.equal(vue._texte, PHRASE, 'le texte est intact');
  assert.deepEqual(lire('zfa-relecture-compte'), ['1 sur 2']);
  assert.equal(centre.ignores.size, 1, 'et la remarque ne reviendra pas');
});

test('relecture guidée : tout accepter applique chaque correction, une seule fois', () => {
  const { g, vue } = guideeSur(PHRASE, FAUTES());
  g.toutAccepter();
  assert.equal(vue._texte, 'Ceci est une note pour tester la validité du correcteur qui marchait bien.');
  assert.equal(g.el, null, 'le panneau se referme quand il n\'y a plus rien à voir');
});

test('relecture guidée : une faute sans proposition se montre, mais ne s\'accepte pas', () => {
  const { g, vue, lire } = guideeSur('Le mot xyzzyque ici.', [
    { from: 7, to: 15, kind: 'spelling', word: 'xyzzyque', replace: [], message: '', category: 'Orthographe' },
  ]);
  assert.deepEqual(lire('zfa-relecture-mot'), ['xyzzyque']);
  assert.deepEqual(lire('zfa-relecture-mot-propose'), []);
  g.accepter();
  assert.equal(vue._texte, 'Le mot xyzzyque ici.', 'rien ne bouge');
});

test('relecture guidée : sans explication, le panneau garde le mot et la suggestion', () => {
  const { lire } = guideeSur(PHRASE, FAUTES(), { correcteurExplication: false });
  assert.deepEqual(lire('zfa-relecture-texte'), ['']);
  assert.deepEqual(lire('zfa-relecture-mot'), ['testé']);
  assert.deepEqual(lire('zfa-relecture-mot-propose'), ['tester']);
});

// Les actions partagées par le panneau flottant et le volet latéral.
function centreSur(texte, fautes, reglages) {
  const centre = new (Ariane._test.CorrecteurApple)({ settings: reglages || {} });
  const vue = fauxEditeur(texte, fautes);
  centre._champ = true;
  centre._poser = { of: (v) => ({ genre: 'poser', valeur: v }) };
  centre._viser = { of: (v) => ({ genre: 'viser', valeur: v }) };
  centre._scroller = (p) => ({ genre: 'montrer', valeur: p });
  return { centre, vue };
}

test('actions : accepter rend vrai, et faux sans proposition', () => {
  const { centre, vue } = centreSur(PHRASE, FAUTES());
  assert.equal(centre.accepter(vue, centre.fautesDe(vue)[0]), true);
  assert.match(vue._texte, /pour tester la/);
  assert.equal(centre.accepter(vue, { from: 0, to: 4, replace: [] }), false, 'rien à appliquer');
  assert.equal(centre.accepter(vue, null), false);
});

test('actions : les volets sont prévenus à chaque changement', () => {
  const { centre, vue } = centreSur(PHRASE, FAUTES());
  let appels = 0;
  centre.abonnes.add(() => { appels += 1; });
  centre.accepter(vue, centre.fautesDe(vue)[0]);
  centre.ignorer(vue, centre.fautesDe(vue)[0]);
  assert.equal(appels, 2);
  // Un volet qui lève une erreur n'empêche pas les autres d'être prévenus.
  centre.abonnes.add(() => { throw new Error('volet cassé'); });
  centre.accepterTout(vue);
  assert.equal(appels, 3);
});

test('actions : viser surligne et fait défiler, viser rien efface le surlignage', () => {
  const { centre, vue } = centreSur(PHRASE, FAUTES());
  const f = centre.fautesDe(vue)[2];
  centre.viser(vue, f);
  assert.deepEqual(vue._visee, { from: f.from, to: f.to });
  assert.deepEqual(vue._montre, [f.from]);
  centre.viser(vue, null);
  assert.equal(vue._visee, null);
});

test('actions : tout accepter rend le nombre appliqué, zéro s\'il n\'y a rien', () => {
  const { centre, vue } = centreSur(PHRASE, FAUTES());
  assert.equal(centre.accepterTout(vue), 3);
  assert.equal(vue._texte, 'Ceci est une note pour tester la validité du correcteur qui marchait bien.');
  assert.equal(centre.accepterTout(vue), 0);
});

test('actions : tout accepter écarte un passage qui en chevauche un autre', () => {
  const { centre, vue } = centreSur('Les acteur public agissent.', [
    { from: 4, to: 17, kind: 'grammar', word: 'acteur public', replace: ['acteurs publics'], message: '', category: '' },
    { from: 11, to: 17, kind: 'spelling', word: 'public', replace: ['publics'], message: '', category: '' },
  ]);
  assert.equal(centre.accepterTout(vue), 1, 'la seconde recouvre la première : écartée');
  assert.equal(vue._texte, 'Les acteurs publics agissent.');
});

// ── Zones exclues ───────────────────────────────────────────────────────────

test('zones exclues : paires de balises, titres avec ou sans dièses', () => {
  const z = correcteurZonesExclues([
    '%% ariane:biblio %% -> %% /ariane:biblio %%',
    '## Bibliographie',
    'Annexes',
    '  ',
    '// une remarque, pas une zone',
    'debut → fin',
  ].join('\n'));
  assert.deepEqual(z.paires, [
    { debut: '%% ariane:biblio %%', fin: '%% /ariane:biblio %%' },
    { debut: 'debut', fin: 'fin' },
  ]);
  assert.deepEqual(z.titres, [{ texte: 'bibliographie', rang: 2 }, { texte: 'annexes', rang: 0 }]);
});

test('zones exclues : la bibliographie d\'Ariane est sautée, le reste est relu', () => {
  const note = [
    'Une phrase avant.',
    '%% ariane:biblio %%',
    '',
    '---',
    '## Bibliographie',
    '- Gill, J. C. Hazard interactions in natural hazard assessment.',
    '%% /ariane:biblio %%',
    'Une phrase après.',
  ].join('\n');
  const zones = correcteurZonesExclues('%% ariane:biblio %% -> %% /ariane:biblio %%');
  assert.deepEqual(correcteurBlocs(note, zones).map((b) => b.texte.trim()),
    ['Une phrase avant.', 'Une phrase après.']);
  // Sans le réglage, tout est relu, bibliographie comprise.
  assert.equal(correcteurBlocs(note).length, 4);
});

test('zones exclues : une section va jusqu\'au titre de rang égal ou supérieur', () => {
  const note = [
    '# Note',
    'Texte du début.',
    '## Bibliographie',
    'Une référence anglaise.',
    '### Sous-partie de la bibliographie',
    'Encore une référence.',
    '## Suite',
    'Texte de la suite.',
    '# Autre partie',
    'Dernier texte.',
  ].join('\n');
  const vus = correcteurBlocs(note, correcteurZonesExclues('## Bibliographie')).map((b) => b.texte.trim());
  assert.deepEqual(vus, ['Note', 'Texte du début.', 'Suite', 'Texte de la suite.', 'Autre partie', 'Dernier texte.']);
});

test('zones exclues : un titre sans dièse vaut à tous les niveaux', () => {
  const note = ['### Annexes', 'À ne pas relire.', '### Après', 'À relire.'].join('\n');
  assert.deepEqual(correcteurBlocs(note, correcteurZonesExclues('Annexes')).map((b) => b.texte.trim()),
    ['Après', 'À relire.']);
});

test('zones exclues : une paire jamais refermée coupe jusqu\'à la fin', () => {
  const note = ['Avant.', 'DEBUT', 'Dedans.', 'Encore dedans.'].join('\n');
  assert.deepEqual(correcteurBlocs(note, correcteurZonesExclues('DEBUT -> FIN')).map((b) => b.texte.trim()), ['Avant.']);
});

test('zones exclues : les positions restent celles du texte entier', () => {
  const note = ['Avant.', '%% a %%', 'Caché.', '%% /a %%', 'Après.'].join('\n');
  const blocs = correcteurBlocs(note, correcteurZonesExclues('%% a %% -> %% /a %%'));
  assert.equal(note.substr(blocs[1].from, 6), 'Après.');
});

test('tableaux : laissés de côté par défaut, relus si on le demande', () => {
  const note = [
    'Une phrase avant le tableau.',
    '',
    '| Terme | Traduction |',
    '| --- | --- |',
    '| institutionnelle | institutional |',
    '| confiance | confidence |',
    '',
    'Une phrase après le tableau.',
  ].join('\n');
  assert.deepEqual(correcteurBlocs(note, { tableaux: false }).map((b) => b.texte.trim()),
    ['Une phrase avant le tableau.', 'Une phrase après le tableau.']);
  const avec = correcteurBlocs(note, { tableaux: true }).map((b) => b.texte.trim());
  assert.equal(avec.length, 5, 'les quatre lignes de contenu, plus les deux phrases, moins le séparateur');
  assert.ok(avec.some((t) => t.includes('institutionnelle')));
  assert.ok(!avec.some((t) => t.includes('---')), 'la ligne de séparation n\'est pas de la prose');
});

test('tableaux : les barres deviennent des espaces, les positions tiennent', () => {
  const ligne = '| institutionnelle | institutional |';
  const m = correcteurMasquer(ligne);
  assert.equal(m.length, ligne.length);
  assert.ok(!m.includes('|'));
  assert.equal(m.indexOf('institutionnelle'), ligne.indexOf('institutionnelle'));
});
