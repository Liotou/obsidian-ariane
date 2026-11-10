//#region 2 · Utilitaires génériques
// ═══════════════════════════════════════════════════════════════════════════
//  2 · UTILITAIRES GÉNÉRIQUES
//  Petits helpers chaîne / date / format sans domaine propre, partagés par
//  plusieurs sections.
// ═══════════════════════════════════════════════════════════════════════════

function echapperRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nom complet de l'auteur tel qu'utilisé dans Zotero, normalisé en
// « Prénom Nom » (accepte aussi « Nom, Prénom »).
// Retire un éventuel balisage de lien [[...]] (et son alias) d'un nom d'auteur.
// Les « creators » des notes source ZotFlow sont désormais des liens, il faut
// donc les dé-baliser avant de nommer les fiches auteurs ou de comparer.
function sansLien(s) {
  return String(s == null ? '' : s)
    .replace(/^\s*!?\[\[/, '')
    .replace(/\]\]\s*$/, '')
    .replace(/\|.*$/, '')
    .trim();
}

// Normalise un DOI : minuscule, sans préfixe URL ni « doi: ».
// Þórvaldsdóttir, Ylvänen, Mérivel, Santaúl : sans cette normalisation, une simple
// mise en minuscules laisse les diacritiques et l'appariement échoue dès que
// les deux graphies diffèrent d'un accent.
function sansAccents(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normDoi(s) {
  if (!s) return '';
  return String(s)
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    // Tirets Unicode (‐ ‑ ‒ – — −) -> tiret ASCII : Crossref en renvoie parfois,
    // ce qui empêchait la correspondance avec un DOI Zotero écrit normalement.
    .replace(/[‐‑‒–—−]/g, '-')
    .trim()
    .toLowerCase();
}

// Les symboles des touches du Mac dans un texte d'aide, dits à la manière
// du système hors du Mac : « ⌘Z » devient « Ctrl Z », « ⇧↵ » « Maj ↵ ».
function touchesSysteme(t, mac) {
  const surMac = mac !== undefined ? mac : !!(typeof obsidian !== 'undefined' && obsidian.Platform && obsidian.Platform.isMacOS);
  if (surMac) return String(t);
  const maj = typeof LANGUE !== 'undefined' && LANGUE === 'en' ? 'Shift' : 'Maj';
  return String(t).replace(/⌘\s?/g, 'Ctrl ').replace(/⌥\s?/g, 'Alt ').replace(/⇧\s?/g, maj + ' ');
}

function jourIsoDe(d) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Horodatage AAAAMMJJhhmm à partir d'un temps (ms), pour NC-AAAAMMJJhhmm.
function horodatageNC(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes())
  );
}

// « 95 » -> « 1 h 35 ». Les minutes seules restent lisibles jusqu'à 59.
function dureeLisible(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + ' h ' + String(r).padStart(2, '0') : h + ' h';
}

// « a, b et c ». Le dernier terme est amené par « et », ce qui marque la fin
// de l'énumération sans recourir au point-virgule.
function enumererFrancais(liste) {
  if (liste.length <= 1) return liste.join('');
  return liste.slice(0, -1).join(', ') + ' et ' + liste[liste.length - 1];
}

// Dans un tableau, Obsidian échappe la barre verticale du lien :
// « [[@clé\|libellé]] ». La clé capturée emporte alors l'antislash, la note
// n'est plus retrouvée, et la référence disparaissait à la fois de la
// bibliographie de fin de note et des champs Zotero de l'export Word.
function cleDeLien(x) {
  return String(x == null ? '' : x).replace(/\\+$/, '').trim();
}

// Neutralise le contenu des liens [[…]] en conservant la longueur du texte :
// les points d'une citation (« p. 2 ») ne doivent pas passer pour des fins de
// phrase. Les positions calculées restent donc valables sur le texte d'origine.
function masquerLiens(texte) {
  return String(texte).replace(/\[\[[^\]]*\]\]/g, (m) => '·'.repeat(m.length));
}

// Fin de la phrase contenant l'offset (index juste après le point/? /! ).
// Sert au dépôt « par phrase » : place l'appel de note en fin de phrase.
function finDePhrase(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  re.lastIndex = Math.max(0, Math.min(off, texte.length));
  const m = re.exec(masquerLiens(texte));
  return m ? m.index + 1 : texte.length;
}

// Début de la phrase contenant l'offset : index juste après le dernier
// point/? /! qui précède l'offset, espaces de tête ignorés.
// Comme finDePhrase, mais renvoie l'index DE la ponctuation finale (donc juste
// avant le point), afin de poser l'appel de note avant celui-ci.
function finDePhraseAvantPonct(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  re.lastIndex = Math.max(0, Math.min(off, texte.length));
  const m = re.exec(masquerLiens(texte));
  if (!m) return texte.length;
  // Typographie française : « … frontière ? » garde son espace avant le point
  // d'interrogation. On remonte donc avant l'espace qui précède la ponctuation.
  let i = m.index;
  while (i > 0 && /[ \t\u00a0\u202f]/.test(texte[i - 1])) i--;
  return i;
}

function debutPhrase(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  const masque = masquerLiens(texte);
  let start = 0, m;
  while ((m = re.exec(masque)) !== null) {
    if (m.index + 1 <= off) start = m.index + 1;
    else break;
  }
  while (start < texte.length && /\s/.test(texte[start])) start++;
  return start;
}

// ── Ponctuation insécable ──
//  En texte justifié, le navigateur coupait une ligne entre une parenthèse
//  et son mot : « ( » seule en fin de ligne quand une espace la suivait,
//  « ) » seule en début de ligne après un mot en italique (les astérisques
//  masqués de l'éditeur lui laissent un point de coupure). On soude donc la
//  ponctuation au mot qu'elle touche.

const PONCT_FERMANTE = ')»”;:!?.,…';
const PONCT_OUVRANTE = '(«“';
const ESPACE_LIGNE = /[ \t\u00a0\u202f]/;

// Les plages d'une ligne de source à ne jamais couper. Seuls les cas où une
// coupure est possible sont retenus : une espace entre la ponctuation et
// son mot, ou une marque de mise en forme ou de lien (« *éco*) »,
// « ([[clé|Auteur… »). Les plages qui se touchent sont réunies ; une plage
// trop longue, ou qui contient une intégration ou des mathématiques, est
// laissée : mieux vaut une coupure qu'une ligne qui déborde.
function plagesInsecables(ligne) {
  const t = String(ligne == null ? '' : ligne);
  const marqueAvant = /[*_~=`\]>]/;
  const marqueApres = /[*_~=`[<]/;
  const brutes = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (PONCT_FERMANTE.includes(c)) {
      let k = i;
      while (k > 0 && ESPACE_LIGNE.test(t[k - 1])) k--;
      if (k === 0) continue;
      if (k === i && !marqueAvant.test(t[k - 1])) continue;
      let d = k;
      while (d > 0 && !/\s/.test(t[d - 1])) d--;
      if (k - d > 60) d = k - 1;
      let f = i + 1;
      while (f < t.length && PONCT_FERMANTE.includes(t[f])) f++;
      brutes.push([d, f]);
      i = f - 1;
    } else if (PONCT_OUVRANTE.includes(c)) {
      let k = i + 1;
      while (k < t.length && ESPACE_LIGNE.test(t[k])) k++;
      if (k >= t.length) continue;
      if (k === i + 1 && !marqueApres.test(t[k])) continue;
      let f = k;
      while (f < t.length && !/\s/.test(t[f])) f++;
      if (f - k > 60) f = k + 1;
      brutes.push([i, f]);
    }
  }
  brutes.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of brutes) {
    const der = out[out.length - 1];
    if (der && a <= der[1]) der[1] = Math.max(der[1], b);
    else out.push([a, b]);
  }
  return out.filter(([a, b]) => b - a <= 120 && !/!\[\[|\$/.test(t.slice(a, b)));
}

// Le même principe pour un texte déjà rendu (mode lecture) : l'espace qui
// sépare une ponctuation de son mot devient insécable.
function souderPonctuation(texte) {
  return String(texte == null ? '' : texte)
    .replace(/([(«“])[ \t]+(?=\S)/g, '$1\u00a0')
    .replace(/(?<=\S)[ \t]+(?=[)»”;:!?…])/g, '\u00a0');
}

// ── Numérotation des titres ──
//  « ## » vaut 1., « ### » 1.1., « #### » 1.1.1., et ainsi de suite. Les
//  numéros sont écrits dans la note (« ## 1.1. Titre ») et tenus à jour par
//  Ariane ; l'éditeur les grise et les protège de la frappe. Une
//  numérotation saisie à la main (« 1) », « 2.3 », « II - ») est remplacée.
//  Une note sans « ## » part de son plus haut niveau de titre ; un niveau
//  sauté compte zéro. Restent hors numérotation : le code, le titre de la
//  bibliographie d'Ariane et les notes qui portent « numérotation: false ».

// Numérotation en tête d'un texte de titre, saisie à la main ou posée par
// Ariane, collée ou non au texte (« 1.Cadrage »). « 2026 : bilan » ou
// « 3 questions » n'en sont pas.
const RE_NUMERO_TITRE = /^(?:(?:\d+(?:\.\d+)+\.?|\d+[.)])[ \t]*|[IVXLC]+[ \t]*[.)\-\u2013\u2014][ \t]+)(?=\S)/;

// Les titres numérotables d'une note : [{ ligne, niveau, texte }], ou null
// si la note s'en dispense.
function releverTitres(lignes) {
  const l = Array.isArray(lignes) ? lignes : String(lignes == null ? '' : lignes).split('\n');
  let i = 0;
  if (l[0] !== undefined && l[0].trim() === '---') {
    let j = 1;
    while (j < l.length && l[j].trim() !== '---') {
      if (/^num[ée]rotation\s*:\s*["']?(false|non|no)["']?\s*$/i.test(l[j])) return null;
      j++;
    }
    if (j < l.length) i = j + 1;
  }
  const titres = [];
  let cloture = '';
  for (; i < l.length; i++) {
    const t = l[i];
    const f = t.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!cloture) cloture = f[1][0];
      else if (f[1][0] === cloture) cloture = '';
      continue;
    }
    if (cloture) continue;
    const m = t.match(/^(#{2,6})[ \t]+(\S.*)$/);
    if (!m) continue;
    // Le titre que tient Ariane au-dessus de sa bibliographie.
    let k = i + 1;
    while (k < l.length && !l[k].trim()) k++;
    if (k < l.length && l[k].trim() === ZFA_BIBLIO_DEBUT) continue;
    titres.push({ ligne: i, niveau: m[1].length, texte: m[2] });
  }
  return titres;
}

// Le numéro de chaque titre, par indice de ligne (0 en tête).
function numerosTitres(lignes) {
  return numerosDepuisTitres(releverTitres(lignes));
}

// Les images d'une note, dans l'ordre : « ![[image.png|Légende]] » (la
// légende est ce qui n'est pas une largeur, « |300 » ou « |300x200 ») et
// « ![Légende](image.png) ». Hors propriétés et blocs de code. Une image
// seule sur sa ligne, ou au bout d'une ligne de texte (Obsidian l'affiche
// alors sous le texte, « … du bruit.![[schéma.svg]] »), est une FIGURE,
// légendée ou non : elle reçoit un numéro. Une image suivie de texte reste
// dans la phrase. (Une image glissée dans la note en devient une d'emblée, sa
// légende s'ajoute ensuite). Rend [{ ligne, legende, figure, numero }]
// (numero : 0 hors figure).
const ZFA_REPERE_FIGURE = /(?:[ \t]+\^([\w-]+)|[ \t]*\{#([\w-]+)\})[ \t]*$/;

function imagesDeNote(lignes) {
  const l = lignes || [];
  const out = [];
  let i = 0;
  if (l[0] === '---') { const f = l.indexOf('---', 1); i = f > 0 ? f + 1 : 0; }
  let dansCode = false;
  let numero = 0;
  const legende = (parts) => parts.map((a) => a.trim()).filter((a) => a && !/^\d+(x\d+)?$/.test(a)).join(' | ');
  for (; i < l.length; i += 1) {
    const t = String(l[i] || '');
    if (/^\s*(?:```|~~~)/.test(t)) { dansCode = !dansCode; continue; }
    if (dansCode || !t.includes('![')) continue;
    const re = /!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
    const trouvees = [];
    let m;
    while ((m = re.exec(t))) {
      if (m[1] != null) {
        const [cible, ...alias] = m[1].split('|');
        if (!ZFA_EXT_IMAGE.test(cible.split('#')[0].trim())) continue;
        trouvees.push({ brut: m[0], legende: legende(alias), fichier: cible.split('#')[0].trim() });
      } else {
        const url = m[3].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0];
        trouvees.push({ brut: m[0], legende: legende(m[2].split('|')), fichier: (() => { try { return decodeURI(url); } catch (e) { return url; } })() });
      }
    }
    // Le repère de bloc d'Obsidian (« ^fig-cycle ») ou l'identifiant
    // pandoc (« {#fig-cycle} ») au bout de la ligne : l'image reste seule.
    const r = ZFA_REPERE_FIGURE.exec(t);
    const id = r ? (r[1] || r[2]) : '';
    const corps = r ? t.slice(0, r.index) : t;
    const derniere = trouvees[trouvees.length - 1];
    const auBout = !!derniere && corps.trimEnd().endsWith(derniere.brut);
    for (const x of trouvees) {
      const figure = auBout && x === derniere;
      if (figure) numero += 1;
      out.push({ ligne: i, legende: x.legende, fichier: x.fichier, figure, numero: figure ? numero : 0, id: figure ? id : '' });
    }
  }
  return out;
}

function figuresDeNote(lignes) {
  return imagesDeNote(lignes).filter((x) => x.figure);
}

// Le renvoi à une figure est un lien vers le fichier de son image,
// « [[base-actants.png]] » : stable, quelle que soit la légende, et rien
// n'est à écrire dans la note (un repère de bloc « ^… » aurait visé tout le
// paragraphe qui suit l'image, faute de ligne vide entre eux). Rend la
// figure de la note dont l'image est `cible` (même nom de fichier), ou null.
function figureDeFichier(lignes, cible) {
  const nom = (x) => String(x || '').split('#')[0].split('/').pop().trim().toLowerCase();
  const n = nom(cible);
  if (!n || !ZFA_EXT_IMAGE.test(n)) return null;
  return figuresDeNote(lignes).find((f) => nom(f.fichier) === n) || null;
}

// L'identifiant d'une figure dans le document Word : son repère s'il en a
// un, sinon le nom de son fichier (« fig-base-actants »).
function idFigure(fig) {
  if (fig.id) return fig.id;
  const nom = String(fig.fichier || '').split('/').pop().replace(/\.[^.]+$/, '');
  return 'fig-' + (nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
    || String(fig.numero));
}

// Les figures d'une note par repère : { id -> numero }.
function numerosFiguresParRepere(lignes) {
  const m = new Map();
  for (const f of figuresDeNote(lignes)) if (f.id) m.set(f.id, f.numero);
  return m;
}

// La ligne d'une figure, sa légende remplacée : la largeur (« |300 »)
// reste, après elle. Les caractères qui casseraient le lien s'effacent.
// C'est la dernière image de la ligne, celle qui la termine, qui est visée.
function ligneAvecLegende(ligne, legende) {
  const leg = String(legende || '').replace(/[|[\]\n]/g, ' ').replace(/\s+/g, ' ').trim();
  const taille = (parts) => parts.map((a) => a.trim()).filter((a) => /^\d+(x\d+)?$/.test(a));
  const motif = /!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
  let fin = null;
  let m;
  while ((m = motif.exec(String(ligne)))) fin = m;
  if (!fin) return String(ligne);
  const avant = String(ligne).slice(0, fin.index);
  const apres = String(ligne).slice(fin.index + fin[0].length);
  return avant + fin[0].replace(/!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(([^)\n]+)\)/, (m, wiki, alt, url) => {
    if (wiki != null) {
      const [cible, ...alias] = wiki.split('|');
      return '![[' + [cible].concat(leg ? [leg] : [], taille(alias)).join('|') + ']]';
    }
    return '![' + (leg ? [leg] : []).concat(taille(alt.split('|'))).join('|') + '](' + url + ')';
  }) + apres;
}

// Le calcul lui-même, sur des titres relevés ({ ligne, niveau }).
function numerosDepuisTitres(liste) {
  const titres = (liste || []).filter((x) => x && x.niveau >= 2 && x.niveau <= 6);
  const out = new Map();
  if (!titres.length) return out;
  const base = Math.min(...titres.map((x) => x.niveau));
  const c = [0, 0, 0, 0, 0];
  for (const { ligne, niveau } of titres) {
    const k = niveau - base;
    c[k] += 1;
    for (let j = k + 1; j < c.length; j++) c[j] = 0;
    out.set(ligne, c.slice(0, k + 1).join('.') + '.');
  }
  return out;
}

// Réécrit les titres d'une note avec leur numéro. Rend { texte,
// changements: [{ ligne, ancien, nouveau }] } (textes de titre, pour
// reporter le changement dans les liens « [[note#titre]] »).
function renumeroterTitres(texte) {
  const src = String(texte == null ? '' : texte);
  const lignes = src.split('\n');
  const titres = releverTitres(lignes);
  if (!titres) return { texte: src, changements: [] };
  const numeros = numerosDepuisTitres(titres);
  const changements = [];
  for (const t of titres) {
    const n = numeros.get(t.ligne);
    if (!n) continue;
    const m = lignes[t.ligne].match(/^(#{2,6}[ \t]+)(.*)$/);
    const ancien = m[2];
    const nouveau = n + ' ' + ancien.replace(RE_NUMERO_TITRE, '');
    if (nouveau === ancien) continue;
    lignes[t.ligne] = m[1] + nouveau;
    changements.push({ ligne: t.ligne, ancien: ancien.trim(), nouveau: nouveau.trim() });
  }
  return { texte: changements.length ? lignes.join('\n') : src, changements };
}

// Le numéro posé en tête d'une ligne de titre : { debut, fin } (espaces
// suivantes comprises), ou null.
function numeroDeLigneTitre(ligne) {
  const m = String(ligne || '').match(/^(#{2,6}[ \t]+)(\d+(?:\.\d+)*\.)[ \t]+/);
  return m ? { debut: m[1].length, fin: m[0].length } : null;
}

// Reporte le nouveau texte d'un titre dans les liens qui le visent :
// « [[Note#1.2. Ancien]] », « ![[Note#…|alias]] », et « [[#…]] » quand le
// lien est dans la note même (`memeNote`). `nom` : le nom de la note visée.
function majLiensTitre(texte, nom, ancien, nouveau, memeNote) {
  const re = new RegExp('(!?\\[\\[)([^\\]|#\\n]*)#' + echapperRegex(ancien) + '(?=[\\]|])', 'g');
  return String(texte).replace(re, (tout, ouv, cible) => {
    const c = cible.trim();
    const vise = c ? c.split('/').pop().replace(/\.md$/i, '') === nom : !!memeNote;
    return vise ? ouv + cible + '#' + nouveau : tout;
  });
}

// ── Programmes externes : Mac, Windows et Linux ──
//  Obsidian lancé depuis le Dock ou le menu Démarrer ne voit pas toujours le
//  PATH du terminal : on y ajoute les dossiers usuels de chaque système, avec
//  le séparateur du système (« : » ailleurs, « ; » sous Windows). Sous
//  Windows, un programme installé par npm est un « .cmd », qu'execFile ne
//  sait pas lancer seul : il passe alors par cmd.exe, arguments entre
//  guillemets.

// Les dossiers où chercher un programme, selon le système.
function dossiersOutils(plateforme, env) {
  const path = require('path');
  const os = require('os');
  const e = env || process.env;
  const p = plateforme || process.platform;
  const home = os.homedir();
  if (p === 'win32') {
    return [
      path.join(home, '.local', 'bin'),
      e.APPDATA && path.join(e.APPDATA, 'npm'),
      e.LOCALAPPDATA && path.join(e.LOCALAPPDATA, 'Pandoc'),
      e.LOCALAPPDATA && path.join(e.LOCALAPPDATA, 'Programs', 'Python', 'Launcher'),
      e.ProgramFiles && path.join(e.ProgramFiles, 'Pandoc'),
      e.ProgramFiles && path.join(e.ProgramFiles, 'nodejs'),
      e.ProgramFiles && path.join(e.ProgramFiles, 'Git', 'cmd'),
    ].filter(Boolean);
  }
  if (p === 'darwin') return [path.join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  return [path.join(home, '.local', 'bin'), '/usr/local/bin', '/usr/bin', '/bin'];
}

// L'environnement d'un programme externe : le PATH complété, le reste tel
// quel. `ajouts` : variables en plus (LUA_PATH…).
function envOutils(ajouts) {
  const path = require('path');
  const cle = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const actuel = String(process.env[cle] || '').split(path.delimiter).filter(Boolean);
  const tout = dossiersOutils().concat(actuel).filter((d, i, t) => t.indexOf(d) === i);
  return Object.assign({}, process.env, { [cle]: tout.join(path.delimiter) }, ajouts || {});
}

// Le chemin complet d'un programme d'après le PATH de `env`, ou ''. Sous
// Windows, les extensions de PATHEXT sont essayées (.exe, .cmd…).
function trouverExecutable(nom, env) {
  const path = require('path');
  const fs = require('fs');
  const e = env || envOutils();
  if (!nom) return '';
  if (path.isAbsolute(nom)) return fs.existsSync(nom) ? nom : '';
  const cle = Object.keys(e).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const win = process.platform === 'win32';
  const exts = win && !path.extname(nom)
    ? String(e.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const d of String(e[cle] || '').split(path.delimiter)) {
    if (!d) continue;
    for (const x of exts) {
      const c = path.join(d, nom + x);
      try { if (fs.statSync(c).isFile()) return c; } catch (err) { /* absent */ }
    }
  }
  return '';
}

// L'application draw.io, là où ses installeurs la posent, ou dans le PATH
// (« drawio » sous Linux). Rend son chemin, ou ''.
function trouverDrawio(env) {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const e = env || process.env;
  const candidats = process.platform === 'darwin'
    ? ['/Applications/draw.io.app/Contents/MacOS/draw.io',
      path.join(os.homedir(), 'Applications', 'draw.io.app', 'Contents', 'MacOS', 'draw.io')]
    : process.platform === 'win32'
      ? [e.ProgramFiles && path.join(e.ProgramFiles, 'draw.io', 'draw.io.exe'),
        e.LOCALAPPDATA && path.join(e.LOCALAPPDATA, 'Programs', 'draw.io', 'draw.io.exe')]
      : [];
  for (const c of candidats.filter(Boolean)) { try { if (fs.statSync(c).isFile()) return c; } catch (err) { /* absent */ } }
  return trouverExecutable('drawio', env) || trouverExecutable('draw.io', env);
}

// Un SVG que Word affiche mal : ses textes sont du HTML (« foreignObject »,
// ce qu'écrit draw.io), que Word remplace par une version de secours
// (retours à la ligne perdus, formules en LaTeX brut). `diagramme` : il
// porte aussi son schéma draw.io, que l'application sait rendre.
function svgPourWord(texte) {
  const t = String(texte || '');
  return {
    aRendre: /<foreignObject\b/i.test(t),
    diagramme: /<svg\b[^>]*\scontent="[^"]*mxfile/i.test(t) || /<svg\b[^>]*\scontent="/i.test(t),
  };
}

// Un PNG dont la résolution est inscrite (bloc pHYs) : rendu trois fois
// plus fin, il garde dans Word la taille du schéma, pandoc la déduisant de
// la résolution. `png` : Uint8Array ; rend un Uint8Array.
function pngAvecResolution(png, dpi) {
  const o = png instanceof Uint8Array ? png : new Uint8Array(png);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (o.length < 33 || sig.some((b, i) => o[i] !== b)) return o;
  const u32 = (a, i) => ((a[i] << 24) >>> 0) + (a[i + 1] << 16) + (a[i + 2] << 8) + a[i + 3];
  const crc = (octets) => {
    let c = 0xffffffff;
    for (const b of octets) {
      c ^= b;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const ppm = Math.round(dpi / 0.0254);
  const donnees = new Uint8Array(9);
  const dv = new DataView(donnees.buffer);
  dv.setUint32(0, ppm); dv.setUint32(4, ppm); donnees[8] = 1;
  const type = [112, 72, 89, 115]; // « pHYs »
  const bloc = new Uint8Array(21);
  const bv = new DataView(bloc.buffer);
  bv.setUint32(0, 9);
  bloc.set(type, 4);
  bloc.set(donnees, 8);
  bv.setUint32(17, crc([...type, ...donnees]));
  // Les blocs d'origine, sans leur éventuel pHYs ; le nôtre après IHDR.
  const morceaux = [o.slice(0, 8)];
  let i = 8;
  while (i + 8 <= o.length) {
    const lg = u32(o, i);
    const nom = String.fromCharCode(o[i + 4], o[i + 5], o[i + 6], o[i + 7]);
    const fin = i + 12 + lg;
    if (nom !== 'pHYs') morceaux.push(o.slice(i, fin));
    if (nom === 'IHDR') morceaux.push(bloc);
    i = fin;
  }
  const tout = new Uint8Array(morceaux.reduce((s, m) => s + m.length, 0));
  let p = 0;
  for (const m of morceaux) { tout.set(m, p); p += m.length; }
  return tout;
}

// Un argument pour cmd.exe : entre guillemets, ceux du texte doublés.
function argumentCmd(a) {
  return '"' + String(a).replace(/"/g, '""') + '"';
}

// execFile, mais pour tout système : le PATH complété, et un « .cmd » ou un
// « .bat » de Windows lancé par cmd.exe. Même signature, même valeur rendue
// (le processus enfant).
function executer(bin, args, opts, rappel) {
  const cp = require('child_process');
  const o = Object.assign({ env: envOutils() }, opts || {});
  if (process.platform === 'win32') {
    const plein = trouverExecutable(bin, o.env) || bin;
    if (/\.(cmd|bat)$/i.test(plein)) {
      const ligne = '"' + [plein].concat(args || []).map(argumentCmd).join(' ') + '"';
      return cp.execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ligne],
        Object.assign({ windowsVerbatimArguments: true, windowsHide: true }, o), rappel);
    }
    return cp.execFile(plein, args || [], Object.assign({ windowsHide: true }, o), rappel);
  }
  return cp.execFile(bin, args || [], o, rappel);
}

// Python 3 : « python3 » sur Mac et Linux ; sous Windows, le lanceur « py »
// (avec -3), à défaut « python ». Rend { bin, prefixe } ou null.
let _pythonTrouve;
function commandePython() {
  if (_pythonTrouve !== undefined) return _pythonTrouve;
  const env = envOutils();
  const essais = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]];
  _pythonTrouve = null;
  for (const [nom, prefixe] of essais) {
    const plein = trouverExecutable(nom, env);
    if (plein) { _pythonTrouve = { bin: plein, prefixe }; break; }
  }
  return _pythonTrouve;
}

// Lance un script Python ; même rappel qu'execFile. Sans Python : l'erreur
// le dit, en clair.
function executerPython(args, opts, rappel) {
  const py = commandePython();
  if (!py) {
    const err = new Error(tr('Python 3 introuvable : installez-le (python.org), puis relancez Obsidian.'));
    setTimeout(() => rappel && rappel(err, '', err.message), 0);
    return null;
  }
  // UTF-8 partout : sous Windows, Python écrirait sinon sa sortie dans la page
  // de code du système, qu'Ariane lirait de travers.
  const o = Object.assign({}, opts || {});
  o.env = Object.assign({}, o.env || envOutils(), { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' });
  return executer(py.bin, py.prefixe.concat(args || []), o, rappel);
}

// Une entrée d'une archive ZIP (EPUB, DOCX), lue sans outil externe : le
// répertoire central donne sa place, zlib la décompresse. Rend un Buffer, ou
// null si l'entrée manque ou si l'archive est illisible.
function lireEntreeZip(octets, nom) {
  const b = octets;
  if (!b || b.length < 22) return null;
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) return null;
  const nb = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  for (let k = 0; k < nb && p + 46 <= b.length; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) return null;
    const methode = b.readUInt16LE(p + 10);
    const taille = b.readUInt32LE(p + 20);
    const lgNom = b.readUInt16LE(p + 28);
    const lgExtra = b.readUInt16LE(p + 30);
    const lgCom = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const n = b.toString('utf8', p + 46, p + 46 + lgNom);
    if (n === nom) {
      if (b.readUInt32LE(local) !== 0x04034b50) return null;
      const debut = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      const donnees = b.subarray(debut, debut + taille);
      try {
        if (methode === 0) return Buffer.from(donnees);
        if (methode === 8) return require('zlib').inflateRawSync(donnees);
      } catch (e) { return null; }
      return null;
    }
    p += 46 + lgNom + lgExtra + lgCom;
  }
  return null;
}

//#endregion 2 · Utilitaires génériques

