// Export Word : préparation du markdown pour pandoc (notes intégrées,
// filets, guillemets, titres).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { deplierIntegrations, preparerMarkdownExport } = Ariane._test;

const NOTES = {
  'NC-1': '---\naliases:\n  - Phénomène\n---\n# Phénomène\nUn fait observable.\n\n## Nuance\nTexte nuancé. ^b1\n\n---\n## Bibliographie\n%% ariane:biblio %%\n- Réf.\n%% /ariane:biblio %%\n',
  T1: '---\nType: tache\n---\n# Plan\n\n<!-- ariane:creneaux -->\n## Sessions\n| a | b |\n<!-- /ariane:creneaux -->\n\n## Note de travail\n\nDeux pistes ![[NC-1#^b1]]\n',
  Boucle: 'Avant ![[Boucle]] après',
};
const lire = async (c) => (c in NOTES ? NOTES[c] : null);

test('export : une note intégrée est dépliée sous le titre qui l’accueille', async () => {
  const s = await deplierIntegrations('### Phénomène organisationnel\n![[NC-1|Phénomène]]\n', lire);
  assert.ok(!s.includes('![['), 'plus d’intégration brute');
  assert.ok(s.includes('Un fait observable.'));
  assert.ok(!/^# Phénomène/m.test(s), 'le titre de la note intégrée ne double pas celui de la section');
  assert.match(s, /^#### Nuance$/m, 'ses titres se rangent sous le « ### »');
  assert.ok(!/Bibliographie|Réf\./.test(s), 'sans la bibliographie d’Ariane');
});

test('export : intégrations de tâche, de bloc, imbriquées, absentes et en boucle', async () => {
  const s = await deplierIntegrations('## Plan\n![[T1]]\n', lire);
  assert.ok(!/Sessions|\| a \|/.test(s), 'sans les blocs que tient Ariane');
  assert.match(s, /^### Note de travail$/m);
  assert.match(s, /Deux pistes \nTexte nuancé\.\s*\n/, 'le bloc intégré, sans son ancre');
  assert.equal((await deplierIntegrations('Voir ![[Inconnue|la note]].', lire)).trim(), 'Voir la note.');
  assert.ok((await deplierIntegrations('![[Boucle]]', lire)).includes('Avant Boucle après'), 'pas de boucle sans fin');
  assert.equal((await deplierIntegrations('![[NC-1#Nuance]]', lire)).trim(), 'Texte nuancé. ^b1');
  assert.equal(await deplierIntegrations('```\n![[NC-1]]\n```', lire), '```\n![[NC-1]]\n```', 'le code reste tel quel');
  const img = await deplierIntegrations('![[schema.png]]', lire, async (c) => '/coffre/' + c);
  assert.equal(img.trim(), '![](</coffre/schema.png>)');
});

test('export : ni filet, ni guillemets droits, ni point final aux titres', () => {
  const s = preparerMarkdownExport('# Titre\n\n## Ordre du jour.\n\nidée de "prospection"\n\n---\n\n## Suite...\n\n<span class="x">a</span>\n\n| a |\n|---|\n| b |\n', () => null, {});
  assert.ok(!/^-{3,}$/m.test(s), 'le filet tombe');
  assert.match(s, /^# Ordre du jour$/m);
  assert.match(s, /^# Suite\.\.\.$/m, 'les points de suspension restent');
  assert.ok(s.includes('« prospection »'));
  assert.ok(s.includes('class="x"'), 'les attributs gardent leurs guillemets');
  assert.ok(s.includes('|---|'), 'les tableaux gardent leur ligne de séparation');
});

test('clic droit : l’application Office d’un document', () => {
  assert.equal(Ariane.appliOffice('DOCX').appli, 'Microsoft Word');
  assert.equal(Ariane.appliOffice('pptx').nom, 'PowerPoint');
  assert.equal(Ariane.appliOffice('csv').nom, 'Excel');
  assert.equal(Ariane.appliOffice('md'), null);
});

/* --------------------- Citation narrative « Auteur (année) » ---------------------- */

test('narratifDepuisLibelle : l’année et ce qui la suit passent dans la parenthèse', () => {
  const { narratifDepuisLibelle: n } = Ariane._test;
  assert.equal(n('Ackoff et al., 2006, p. 12'), 'Ackoff et al. (2006, p. 12)');
  assert.equal(n('Ackoff et Magidson, 2006'), 'Ackoff et Magidson (2006)');
  assert.equal(n('Beck, 1992, cité dans Aven, 2016, p. 3'), 'Beck (1992, cité dans Aven, 2016, p. 3)');
  assert.equal(n('Aven, 2016a ; Renn, 2008, p. 4'), 'Aven (2016a) ; Renn (2008, p. 4)');
  assert.equal(n('INERIS, s. d.'), 'INERIS (s. d.)');
  assert.equal(n('Sans année'), 'Sans année');
});

test('estLibelleNarratif : le libellé ordinaire ne finit pas par une parenthèse', () => {
  const { estLibelleNarratif: e } = Ariane._test;
  assert.equal(e('Ackoff (2006, p. 12)'), true);
  assert.equal(e('Ackoff, 2006, p. 12'), false);
  assert.equal(e('Aven, 2016 ⟨2⟩'), false);
});

test('insertionNarrative : jamais dans un mot ni dans un lien, espaces au besoin', () => {
  const { insertionNarrative: ins } = Ariane._test;
  const L = '[[K|Ackoff (2006)]]';
  // Au milieu de « montre » : recule au début du mot, espace après.
  assert.deepEqual(ins('Comme montre la note.', 8, [L]), { off: 6, insert: L + ' ' });
  // Après un mot sans espace : espace avant.
  assert.deepEqual(ins('Ainsi,', 6, [L]), { off: 6, insert: ' ' + L + ' ' });
  // Avant une virgule : pas d'espace après.
  assert.deepEqual(ins('selon , x', 6, [L]), { off: 6, insert: L });
  // Dans un lien existant : après lui.
  const t = 'Voir [[A|Adner, 2017]] ici';
  assert.equal(ins(t, 10, [L]).off, 22);
  // Ligne vide : une espace après, pour enchaîner.
  assert.deepEqual(ins('', 0, [L]), { off: 0, insert: L + ' ' });
  // Avant une espace : pas de seconde espace.
  assert.deepEqual(ins('a b', 1, [L]), { off: 1, insert: ' ' + L });
  // En début de ligne.
  assert.deepEqual(ins('montre que', 0, [L]), { off: 0, insert: L + ' ' });
});

test('rafraichirLibelles : une citation narrative garde sa forme', () => {
  const { rafraichirLibelles } = Ariane._test;
  const r = rafraichirLibelles('[[K1|Ackoff (2005)]] montre, et ([[K1|Ackoff, 2005]]).',
    () => 'Ackoff et al., 2006, p. 12', () => true);
  assert.equal(r.texte, '[[K1|Ackoff et al. (2006, p. 12)]] montre, et ([[K1|Ackoff et al., 2006, p. 12]]).');
});

test('export : la citation narrative devient « @cle [p. X] », la parenthèse reste une grappe', () => {
  const { citationsNarrativesVersPandoc: c } = Ariane._test;
  const resoudre = (k) => ({
    K1: [{ cle: 'ackoff2006', page: '12' }],
    K2: [{ cle: 'aven2016', page: '3', travaux: ['Beck, 1992'] }],
    S: ['@renn2008'],
  }[k] || null);
  assert.equal(c('[[K1|Ackoff (2006, p. 12)]] montre que', resoudre), '@ackoff2006 [p. 12] montre que');
  assert.equal(c('[[S|Renn (2008)]] dit', resoudre), '@renn2008 dit');
  // Seconde main : pas d'équivalent simple, le texte reste.
  assert.equal(c('[[K2|Beck (1992, cité dans Aven, 2016, p. 3)]]', resoudre), '[[K2|Beck (1992, cité dans Aven, 2016, p. 3)]]');
  // Une citation entre parenthèses n'est pas concernée.
  assert.equal(c('([[K1|Ackoff, 2006, p. 12]])', resoudre), '([[K1|Ackoff, 2006, p. 12]])');
});

test('toucheStyleGlisser : quatre touches de modification, Maj par défaut', () => {
  assert.deepEqual(Ariane.toucheStyleGlisser('alt', true), { prop: 'altKey', nom: 'Option' });
  assert.deepEqual(Ariane.toucheStyleGlisser('meta', true), { prop: 'metaKey', nom: 'Commande' });
  // Sous Windows, les touches portent leur nom de Windows.
  assert.deepEqual(Ariane.toucheStyleGlisser('alt', false), { prop: 'altKey', nom: 'Alt' });
  assert.deepEqual(Ariane.toucheStyleGlisser('meta', false), { prop: 'metaKey', nom: 'Windows' });
  assert.deepEqual(Ariane.toucheStyleGlisser(undefined), { prop: 'shiftKey', nom: 'Maj' });
  assert.deepEqual(Ariane.toucheStyleGlisser('a'), { prop: 'shiftKey', nom: 'Maj' });
});

test('glisser sur une ligne vide : « Auteur (année) » par défaut, la touche inverse', () => {
  const doc = (t) => { const l = t.split('\n'); return { lines: l.length, line: (n) => ({ text: l[n - 1] }) }; };
  const vide = (t, n) => Ariane.prototype.ligneVideDeposable.call({}, doc(t), n);
  assert.equal(vide('Texte\n\nSuite', 2), true);
  assert.equal(vide('Texte\nSuite', 2), false);
  assert.equal(vide('---\ntype: x\n\n---\n', 3), false);          // dans l'entête
  assert.equal(vide('```\n\n```', 2), false);                     // dans un bloc de code
  assert.equal(vide('Texte[^1]\n\n[^1]: note\n\n', 4), false);    // zone des notes
  const style = (vide, inverse) => Ariane.prototype.styleGlisser.call(
    { glisserCitable: () => true, _styleInverse: inverse }, {}, vide);
  assert.equal(style(true, false), 'narratif');
  assert.equal(style(true, true), 'parenthese');
  assert.equal(style(false, false), 'parenthese');
  assert.equal(style(false, true), 'narratif');
});

test('cleDepuisCharge : un lien de Claudian « app://obsidian.md/… » donne le nom de la note', () => {
  const f = (x) => Ariane.prototype.cleDepuisCharge.call({}, x);
  assert.equal(f('app://obsidian.md/@valkokariBusinessInnovationKnowledge2015'), '@valkokariBusinessInnovationKnowledge2015');
  assert.equal(f('app://obsidian.md/03%20-%20Notes/NC-1.md'), '03 - Notes/NC-1');
});

test('lireChargeZotflow : clés et pages des annotations glissées du lecteur', () => {
  const brut = JSON.stringify({ type: 'zotflow-citation', libraryID: 1, key: 'ITEMKEY1',
    annotations: [{ id: 'ANNOKEY1', pageLabel: '21', text: 'x' }, { id: 'ANNOKEY2', pageLabel: null }] });
  assert.deepEqual(Ariane.lireChargeZotflow(brut), { key: 'ITEMKEY1',
    annotations: [{ id: 'ANNOKEY1', page: '21' }, { id: 'ANNOKEY2', page: '' }] });
  assert.equal(Ariane.lireChargeZotflow('{"type":"autre","key":"K"}'), null);
  assert.equal(Ariane.lireChargeZotflow('pas du JSON'), null);
  // Une source glissée de l'arborescence de ZotFlow : la clé de sa fiche, sans annotation.
  assert.deepEqual(Ariane.lireChargeZotflow(JSON.stringify({ type: 'zotflow-citation', libraryID: 1, key: 'ITEMKEY2' })),
    { key: 'ITEMKEY2', annotations: [] });
});

test('sourceDeZotflow : sans clé d’élément ni lien de source, aucune note n’est désignée', () => {
  const app = { vault: { getMarkdownFiles: () => [{ path: 'x.md' }] },
    metadataCache: { getFileCache: () => ({ frontmatter: { citationKey: 'x' } }), getFirstLinkpathDest: () => null } };
  assert.equal(Ariane.prototype.sourceDeZotflow.call({ app }, { key: '', annotations: [] }, ''), null);
});

test('tableaux : cellules d’une ligne, rangée vers ligne source, insertion avec barre échappée', () => {
  const { cellulesDeLigne, ligneDeRangee, insertionCellule, rafraichirLibelles } = Ariane._test;
  const L = '| Concept | Définition | Source |';
  const c = cellulesDeLigne(L);
  assert.deepEqual(c.map((x) => L.slice(x.debut, x.fin).trim()), ['Concept', 'Définition', 'Source']);
  // Une barre échappée ne sépare pas ; sans barres d'encadrement aussi.
  const E = 'a | [[K\\|Lib]] | c';
  assert.deepEqual(cellulesDeLigne(E).map((x) => E.slice(x.debut, x.fin).trim()), ['a', '[[K\\|Lib]]', 'c']);
  assert.equal(ligneDeRangee(0), 0);
  assert.equal(ligneDeRangee(1), 2);   // la ligne de séparation est sautée
  const lien = '[[K1|Adner, 2017, p. 3]]';
  const T = '| Écosystème | Une structure. |  |';
  const cs = cellulesDeLigne(T);
  // Entre parenthèses, avant le point final.
  let r = insertionCellule(T, cs[1], [lien], false);
  assert.equal(T.slice(0, r.off) + r.insert + T.slice(r.off), '| Écosystème | Une structure ([[K1\\|Adner, 2017, p. 3]]). |  |');
  // Cellule vide : la citation seule, encadrée d'espaces.
  r = insertionCellule(T, cs[2], ['[[K1|Adner (2017, p. 3)]]'], true);
  assert.equal(T.slice(0, r.off) + r.insert + T.slice(r.off), '| Écosystème | Une structure. | [[K1\\|Adner (2017, p. 3)]] |');
  // Le rafraîchissement garde la barre échappée.
  const f = rafraichirLibelles('| x | [[K1\\|Adner, 2016]] |', () => 'Adner, 2017', () => true);
  assert.equal(f.texte, '| x | [[K1\\|Adner, 2017]] |');
});

test('clesDepuisZotflow : une source glissée de l’arborescence cite sa note de référence', async () => {
  const fichiers = [{ path: '98/@valkokari2015.md', basename: '@valkokari2015' }];
  const app = { vault: { getMarkdownFiles: () => fichiers },
    metadataCache: { getFileCache: () => ({ frontmatter: { citationKey: 'valkokari2015', 'zotero-key': 'ITEMKEY2' } }), getFirstLinkpathDest: () => null } };
  const ctx = { app, sourceDeZotflow: Ariane.prototype.sourceDeZotflow };
  assert.deepEqual(await Ariane.prototype.clesDepuisZotflow.call(ctx, { key: 'ITEMKEY2', annotations: [] }, 'Business, Innovation…'), ['@valkokari2015']);
  assert.deepEqual(await Ariane.prototype.clesDepuisZotflow.call(ctx, { key: 'INCONNUE', annotations: [] }, ''), []);
});

test('compatibilité : chemins des outils et lecture ZIP sans outil externe', () => {
  const { dossiersOutils, lireEntreeZip, argumentCmd } = Ariane._test;
  const win = dossiersOutils('win32', { APPDATA: 'C:\\U\\AppData\\Roaming', ProgramFiles: 'C:\\Program Files' });
  assert.ok(win.some((d) => /npm$/.test(d)) && win.some((d) => /Pandoc$/.test(d)), 'npm et Pandoc sous Windows');
  assert.ok(!win.some((d) => d.startsWith('/opt')), 'aucun dossier du Mac sous Windows');
  assert.ok(dossiersOutils('darwin').includes('/opt/homebrew/bin'));
  assert.equal(argumentCmd('a "b" c'), '"a ""b"" c"');
  // Une archive ZIP construite par Ariane (stockée) relue sans unzip.
  const zip = Buffer.from(Ariane.zipStored([{ nom: 'META-INF/container.xml', donnees: '<x full-path="a.opf"/>' }]));
  assert.equal(lireEntreeZip(zip, 'META-INF/container.xml').toString('utf8'), '<x full-path="a.opf"/>');
  assert.equal(lireEntreeZip(zip, 'absent.txt'), null);
});
