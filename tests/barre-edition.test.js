// Barre d'édition (section 21) : les transformations de texte. Elles sont
// pures, donc tout s'éprouve ici, sans Obsidian ni DOM. Le dessin de la
// barre, lui, ne se vérifie qu'à l'usage.
const test = require('node:test');
const assert = require('node:assert');
const T = require('./obsidian-factice.js')._test;

// ── Entourages, titres, citations ────────────────────────────────────────

test('entourer : pose la marque, la repasse pour l\'enlever', () => {
  assert.equal(T.barreEntourer('mot', '**'), '**mot**');
  assert.equal(T.barreEntourer('**mot**', '**'), 'mot');
  assert.equal(T.barreEntourer('mot', '<u>', '</u>'), '<u>mot</u>');
  assert.equal(T.barreEntourer('<u>mot</u>', '<u>', '</u>'), 'mot');
  assert.equal(T.barreEntourer('', '**'), '****', 'sans texte, les deux marques restent');
  assert.equal(T.barreEntourer('*a*', '**'), '***a***',
    'un italique déjà là n\'est pas confondu avec un gras');
});

test('titre : bascule le niveau, garde l\'indentation', () => {
  assert.equal(T.barreTitreLigne('Mon titre', 2), '## Mon titre');
  assert.equal(T.barreTitreLigne('## Mon titre', 2), 'Mon titre', 'le même niveau enlève');
  assert.equal(T.barreTitreLigne('## Mon titre', 3), '### Mon titre', 'un autre niveau remplace');
  assert.equal(T.barreTitreLigne('  ## Titre', 0), '  Titre');
  assert.equal(T.barreTitreLigne('   Texte', 1), '   # Texte');
  assert.equal(T.barreTitreLigne('#sansespace', 1), '# #sansespace',
    'un croisillon collé n\'est pas un titre Markdown');
});

test('citation : bascule le chevron', () => {
  assert.equal(T.barreCitationLigne('Texte'), '> Texte');
  assert.equal(T.barreCitationLigne('> Texte'), 'Texte');
  assert.equal(T.barreCitationLigne('  > Texte'), '  Texte');
});

// ── Listes ───────────────────────────────────────────────────────────────

test('lire une ligne de liste : puce, numéro, coche, rien', () => {
  assert.deepEqual(T.barreLireLigneListe('- a'),
    { indent: '', genre: 'puce', marque: '-', coche: '', texte: 'a' });
  assert.deepEqual(T.barreLireLigneListe('  * [x] a'),
    { indent: '  ', genre: 'puce', marque: '*', coche: '[x] ', texte: 'a' });
  assert.deepEqual(T.barreLireLigneListe('3) a'),
    { indent: '', genre: 'numero', marque: '3)', coche: '', texte: 'a' });
  assert.equal(T.barreLireLigneListe('du texte').genre, '');
});

test('cycler une liste : texte, puce, case à cocher, texte', () => {
  assert.equal(T.barreCyclerListe('a'), '- a');
  assert.equal(T.barreCyclerListe('- a'), '- [ ] a');
  assert.equal(T.barreCyclerListe('- [ ] a'), 'a');
  assert.equal(T.barreCyclerListe('- [x] a'), 'a', 'une case cochée revient aussi au texte');
  assert.equal(T.barreCyclerListe('  - a'), '  - [ ] a', 'l\'indentation est gardée');
  assert.equal(T.barreCyclerListe(''), '', 'une ligne vide n\'est pas transformée en puce');
});

test('renuméroter : par niveau, et remis à zéro par une ligne vide', () => {
  assert.equal(T.barreRenumeroter('1. a\n5. b\n9. c'), '1. a\n2. b\n3. c');
  assert.equal(T.barreRenumeroter('1. a\n  1. x\n  4. y\n2. b'), '1. a\n  1. x\n  2. y\n2. b');
  assert.equal(T.barreRenumeroter('1. a\n2. b\n\n7. c'), '1. a\n2. b\n\n1. c',
    'une ligne vide sépare deux listes');
  assert.equal(T.barreRenumeroter('3) a\n3) b'), '1) a\n2) b', 'la parenthèse est gardée');
  assert.equal(T.barreRenumeroter('- a\n- b'), '- a\n- b', 'les puces ne sont pas touchées');
});

// ── Opérations sur les lignes ────────────────────────────────────────────

test('lignes vides : intercaler, puis retirer', () => {
  assert.equal(T.barreLignesVides('a\nb\nc', 'ajouter'), 'a\n\nb\n\nc');
  assert.equal(T.barreLignesVides('a\n\nb', 'ajouter'), 'a\n\nb', 'pas de doublement');
  assert.equal(T.barreLignesVides('a\n\n\nb', 'retirer'), 'a\nb');
});

test('couper et recoller les lignes', () => {
  assert.equal(T.barreScinderLignes('a, b, c', ', '), 'a\nb\nc');
  assert.equal(T.barreScinderLignes('un deux  trois', ''), 'un\ndeux\ntrois');
  assert.equal(T.barreFusionnerLignes('a\nb\nc', ' '), 'a b c');
  assert.equal(T.barreFusionnerLignes('a\nb\n\nc\nd', ' '), 'a b\n\nc d',
    'les paragraphes restent séparés');
});

test('dédoublonner : la première occurrence reste, l\'ordre aussi', () => {
  assert.equal(T.barreDedoublonnerLignes('a\nb\na\nc\nb'), 'a\nb\nc');
  assert.equal(T.barreDedoublonnerLignes('a\n\nb\n\n'), 'a\n\nb\n\n',
    'les lignes vides ne comptent pas comme des doublons');
});

test('envelopper et numéroter les lignes', () => {
  assert.equal(T.barreEnvelopperLignes('a\nb', '« ', ' »'), '« a »\n« b »');
  assert.equal(T.barreEnvelopperLignes('a\n\nb', '- ', ''), '- a\n\n- b',
    'les lignes vides sont laissées telles quelles');
  assert.equal(T.barreNumeroterLignes('a\nb', '{n}. ', 1), '1. a\n2. b');
  assert.equal(T.barreNumeroterLignes('a\nb', '[{n}] {t}', 5), '[5] a\n[6] b');
  assert.equal(T.barreNumeroterLignes('a\n\nb', '{n}. ', 1), '1. a\n\n2. b',
    'une ligne vide ne consomme pas de numéro');
});

test('espaces : les fins de ligne, les doublons, ou tous', () => {
  assert.equal(T.barreEspaces('a  \nb\t', 'bouts'), 'a\nb');
  assert.equal(T.barreEspaces('  a    b', 'compresser'), '  a b',
    'l\'indentation de tête est préservée');
  assert.equal(T.barreEspaces('a b\tc', 'tout'), 'abc');
  assert.equal(T.barreEspaces('a b', 'tout'), 'ab', 'les insécables aussi');
});

test('trier : alphabet français, lignes vides en place', () => {
  assert.equal(T.barreTrierLignes('banane\névier\nabricot'), 'abricot\nbanane\névier');
  assert.equal(T.barreTrierLignes('b\n\na'), 'a\n\nb');
  assert.equal(T.barreTrierLignes('b\na', 'descendant'), 'b\na');
});

// ── Casse et typographie ─────────────────────────────────────────────────

test('casse : les quatre formes', () => {
  assert.equal(T.barreCasse('un été', 'majuscules'), 'UN ÉTÉ');
  assert.equal(T.barreCasse('UN ÉTÉ', 'minuscules'), 'un été');
  assert.equal(T.barreCasse('le chien de la voisine', 'capitales'),
    'Le Chien de la Voisine', 'les mots outils restent en bas de casse');
  assert.equal(T.barreCasse('bonjour. et voilà', 'phrase'), 'Bonjour. Et voilà');
});

test('casse : le cycle passe de bas en haut puis en capitales', () => {
  assert.equal(T.barreCasseSuivante('un mot'), 'majuscules');
  assert.equal(T.barreCasseSuivante('UN MOT'), 'capitales');
  assert.equal(T.barreCasseSuivante('Un Mot'), 'minuscules');
  assert.equal(T.barreCasseSuivante('1234'), 'minuscules', 'sans lettre, on repart en bas');
});

test('typographie française : ponctuation, guillemets, apostrophe', () => {
  assert.equal(T.barreTypographieFr('Vraiment ?'), 'Vraiment ?');
  assert.equal(T.barreTypographieFr('Note : ceci'), 'Note : ceci');
  assert.equal(T.barreTypographieFr('l\'eau'), 'l’eau');
  assert.equal(T.barreTypographieFr('il dit "oui" ici'), 'il dit « oui » ici');
  assert.equal(T.barreTypographieFr('et donc...'), 'et donc…');
});

test('typographie française : le code et les liens sont épargnés', () => {
  assert.equal(T.barreTypographieFr('voir `a:b` ici'), 'voir `a:b` ici');
  assert.equal(T.barreTypographieFr('https://exemple.fr/a?b=1'), 'https://exemple.fr/a?b=1');
  assert.equal(T.barreTypographieFr('[lien](http://x.fr/a?b)'), '[lien](http://x.fr/a?b)');
  assert.equal(T.barreTypographieFr('```\nx : y\n```'), '```\nx : y\n```');
});

test('typographie neutre : le chemin inverse', () => {
  assert.equal(T.barreTypographieNeutre('Vraiment ?'), 'Vraiment?');
  assert.equal(T.barreTypographieNeutre('l’eau'), "l'eau");
  assert.equal(T.barreTypographieNeutre('« oui »'), '"oui"');
  assert.equal(T.barreTypographieNeutre('donc…'), 'donc...');
});

// ── Nettoyage ────────────────────────────────────────────────────────────

test('effacer la mise en forme : les marques partent, le texte reste', () => {
  assert.equal(T.barreEffacerFormat('**gras** et *italique*'), 'gras et italique');
  assert.equal(T.barreEffacerFormat('==surligné== ~~barré~~'), 'surligné barré');
  assert.equal(T.barreEffacerFormat('<u>souligné</u>'), 'souligné');
  assert.equal(T.barreEffacerFormat('<span style="color: red;">rouge</span>'), 'rouge');
  assert.equal(T.barreEffacerFormat('## Titre'), 'Titre');
  assert.equal(T.barreEffacerFormat('> cité'), 'cité');
});

test('texte nu : liens résolus, listes et tableaux aplatis', () => {
  assert.equal(T.barreTexteBrut('[Dauphine](https://x.fr)'), 'Dauphine');
  assert.equal(T.barreTexteBrut('[[Note|le titre]]'), 'le titre');
  assert.equal(T.barreTexteBrut('[[Note]]'), 'Note');
  assert.equal(T.barreTexteBrut('- un\n- deux'), 'un\ndeux');
  assert.equal(T.barreTexteBrut('| a | b |\n| --- | --- |\n| c | d |'), 'a b\n\nc d');
});

// ── Alignement et couleurs ───────────────────────────────────────────────

test('aligner : enveloppe, remplace, puis retire', () => {
  assert.equal(T.barreAligner('x', 'centre'), '<div style="text-align: center;">x</div>');
  assert.equal(T.barreAligner('<div style="text-align: center;">x</div>', 'centre'), 'x',
    'le même sens retire l\'enveloppe');
  assert.equal(T.barreAligner('<div style="text-align: center;">x</div>', 'droite'),
    '<div style="text-align: right;">x</div>', 'un autre sens remplace au lieu d\'empiler');
});

test('colorer : texte et fond, sans empilement', () => {
  assert.equal(T.barreColorer('x', '#D83931', 'texte'),
    '<span style="color: #D83931;">x</span>');
  assert.equal(T.barreColorer('<span style="color: #D83931;">x</span>', '#D83931', 'texte'), 'x');
  assert.equal(T.barreColorer('<span style="color: #D83931;">x</span>', '#245BDB', 'texte'),
    '<span style="color: #245BDB;">x</span>');
  assert.equal(T.barreColorer('<span style="color: #D83931;">x</span>', '', 'texte'), 'x',
    'une couleur vide déshabille');
  assert.equal(T.barreColorer('x', 'var(--color-red)', 'fond'),
    '<span style="background: var(--color-red);">x</span>');
});

// ── Listes, tableaux, extraction ─────────────────────────────────────────

test('liste vers tableau : les enfants deviennent des colonnes', () => {
  assert.equal(T.barreListeVersTableau('- a\n  - b\n- c\n  - d'),
    '| a | b |\n| --- | --- |\n| c | d |');
  assert.equal(T.barreListeVersTableau('- seul\n- autre'),
    '| seul |\n| --- |\n| autre |');
});

test('tableau vers liste : la rangée de tirets est ignorée', () => {
  assert.equal(T.barreTableauVersListe('| a | b |\n| --- | --- |\n| c | d |'),
    '- a\n  - b\n- c\n  - d');
  assert.equal(T.barreTableauVersListe('du texte'), 'du texte',
    'sans tableau, le texte revient intact');
});

test('extraire entre deux repères : une trouvaille par ligne', () => {
  assert.equal(T.barreExtraireEntre('a[x]b[y]c', '[', ']'), 'x\ny');
  assert.equal(T.barreExtraireEntre('a[x]b', '[', ']', true), '[x]');
  assert.equal(T.barreExtraireEntre('rien ici', '[', ']'), '');
  assert.equal(T.barreExtraireEntre('abc', '', ''), 'abc', 'sans repère, rien ne bouge');
});

// ── Pinceau ──────────────────────────────────────────────────────────────

test('pinceau : relève les marques qui entourent la sélection', () => {
  // « **mot** » : la sélection porte sur « mot », de 2 à 5.
  assert.deepEqual(T.barreMarquesAutour('**mot**', 2, 5), { avant: '**', apres: '**' });
  assert.deepEqual(T.barreMarquesAutour('***mot***', 3, 6), { avant: '***', apres: '***' });
  assert.deepEqual(T.barreMarquesAutour('==**mot**==', 4, 7), { avant: '==**', apres: '**==' },
    'les marques imbriquées se relèvent de l\'intérieur vers l\'extérieur');
  assert.deepEqual(T.barreMarquesAutour('<u>mot</u>', 3, 6), { avant: '<u>', apres: '</u>' });
  assert.deepEqual(T.barreMarquesAutour('mot', 0, 3), { avant: '', apres: '' });
  assert.deepEqual(T.barreMarquesAutour('<span style="color: red;">x</span>', 26, 27),
    { avant: '<span style="color: red;">', apres: '</span>' });
});

// ── La disposition et le catalogue ───────────────────────────────────────

test('catalogue : des identifiants uniques, un nom et une icône chacun', () => {
  const vus = new Set();
  for (const c of T.BARRE_COMMANDES) {
    assert.ok(c.id && !vus.has(c.id), 'identifiant en double ou absent : ' + c.id);
    vus.add(c.id);
    assert.ok(c.nom, c.id + ' n\'a pas de nom de palette');
    assert.ok(c.icone, c.id + ' n\'a pas d\'icône');
    assert.equal(typeof c.sur, 'function', c.id + ' n\'a pas de geste');
  }
  assert.ok(vus.size >= 30, 'le catalogue s\'est vidé');
});

test('disposition par défaut : des entrées bien formées, et nos commandes existent', () => {
  const connues = new Set(T.BARRE_COMMANDES.map((c) => 'obsidian-ariane:' + c.id));
  // Les autres commandes d'Ariane sont enregistrées une à une dans
  // _enregistrerCommandes : on relit leur identifiant à la source, pour
  // qu'une faute de frappe dans la disposition ne passe pas.
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', '11z-ariane.js'), 'utf8');
  const arianeHorsBarre = new Set([...src.matchAll(/^ {6}id: '([a-z0-9-]+)',$/gm)]
    .map((m) => 'obsidian-ariane:' + m[1]));
  assert.ok(arianeHorsBarre.has('obsidian-ariane:citations-basculer'), 'relecture de la source ratée');
  let boutons = 0;
  const verifier = (liste, profondeur) => {
    for (const e of liste) {
      if (e.separateur) continue;
      if (e.groupe) {
        assert.ok(profondeur === 0, 'un groupe dans un groupe : le menu ne sait pas le rendre');
        assert.ok(Array.isArray(e.elements) && e.elements.length, 'groupe vide : ' + e.groupe);
        verifier(e.elements, profondeur + 1);
        continue;
      }
      assert.ok(e.cmd, 'une entrée sans commande ni séparateur ni groupe');
      boutons += 1;
      if (!e.cmd.startsWith('obsidian-ariane:')) {
        assert.ok(e.cmd.startsWith('editor:'),
          'commande étrangère inattendue dans la disposition : ' + e.cmd);
        continue;
      }
      assert.ok(connues.has(e.cmd) || arianeHorsBarre.has(e.cmd),
        'la disposition pointe vers une commande Ariane qui n\'existe pas : ' + e.cmd);
    }
  };
  verifier(T.barreDefaut(), 0);
  assert.ok(boutons >= 30, 'la disposition par défaut s\'est vidée');
});

// ── Repli de la barre ────────────────────────────────────────────────────

test('repli : un seul réglage, appliqué à toutes les barres, avec animation', async () => {
  const appels = [];
  let sauvegardes = 0;
  const chef = Object.create(T.BarreEdition.prototype);
  chef.greffon = { settings: { barreRepliee: false }, saveSettings: async () => { sauvegardes += 1; } };
  chef.barres = new Map([
    ['volet gauche', { appliquerRepli: (anime) => appels.push(['gauche', anime]) }],
    ['volet droit', { appliquerRepli: (anime) => appels.push(['droit', anime]) }],
  ]);
  await chef.basculerRepli();
  assert.equal(chef.greffon.settings.barreRepliee, true);
  assert.deepEqual(appels, [['gauche', true], ['droit', true]],
    'chaque barre ouverte se replie, et en s\'animant');
  assert.equal(sauvegardes, 1, 'l\'état est retenu pour les notes ouvertes ensuite');
  await chef.basculerRepli();
  assert.equal(chef.greffon.settings.barreRepliee, false, 'la seconde bascule déplie');
});

test('relecture Apple Intelligence : Mac seulement, et seulement sur une sélection', () => {
  const c = T.BARRE_COMMANDES.find((x) => x.id === 'ai-relecture');
  assert.ok(c, 'la commande a disparu du catalogue');
  assert.equal(c.mac, true, 'hors Mac, les outils d\'écriture n\'existent pas');
  assert.equal(c.selection, true, 'sans sélection, macOS n\'a rien à relire');
  const dispo = JSON.stringify(T.barreDefaut());
  assert.ok(dispo.includes('obsidian-ariane:ai-relecture'), 'le bouton n\'est plus dans la barre');
});
