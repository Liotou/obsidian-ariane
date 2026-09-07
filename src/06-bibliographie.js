//#region 6 · Bibliographie
// ═══════════════════════════════════════════════════════════════════════════
//  6 · BIBLIOGRAPHIE
//  Marqueurs de bloc biblio, formatage d'une entrée, construction et
//  injection de la bibliographie, composition d'une citation.
// ═══════════════════════════════════════════════════════════════════════════

/* ------------------------ Citations repliables ---------------------------
 * Une citation a la forme « ([[CLE|Libellé]] ; [[CLE2|Libellé2]]) ». Repliée,
 * elle laisse une pastille portant le nombre de références.
 * ------------------------------------------------------------------------ */

// Un groupe entre parenthèses fait de liens internes séparés par « ; ».
// La parenthèse ne doit contenir aucune parenthèse imbriquée, ce qui écarte
// les incises ordinaires du texte.
const ZFA_RE_CITATION = /\((\s*\[\[[^[\]\n]+\]\](?:\s*;\s*\[\[[^[\]\n]+\]\])*\s*)\)/g;

function citationsDuTexte(texte) {
  const out = [];
  // L'expression est réutilisée : la recompiler à chaque appel coûtait cher,
  // cette fonction étant appelée à chaque frappe et à chaque défilement.
  const re = ZFA_RE_CITATION;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(texte)) !== null) {
    const n = (m[1].match(/\[\[/g) || []).length;
    out.push({ index: m.index, longueur: m[0].length, nombre: n });
  }
  return out;
}

const ZFA_BIBLIO_DEBUT = '%% ariane:biblio %%';
const ZFA_BIBLIO_FIN = '%% /ariane:biblio %%';

// « Céline Kermisch » -> « Kermisch, C. » ; « Kermisch, Céline » aussi.
function auteurBiblio(nom) {
  const t = sansLien(String(nom || '')).trim();
  if (!t) return '';
  let famille, prenoms;
  if (t.includes(',')) {
    famille = t.split(',')[0].trim();
    prenoms = t.split(',').slice(1).join(' ').trim();
  } else {
    const parts = t.split(/\s+/).filter(Boolean);
    famille = parts.length > 1 ? parts[parts.length - 1] : t;
    prenoms = parts.slice(0, -1).join(' ');
  }
  const initiales = prenoms
    .split(/[\s-]+/).filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + '.')
    .join(' ');
  return initiales ? famille + ', ' + initiales : famille;
}

function listeAuteursBiblio(creators) {
  const noms = (Array.isArray(creators) ? creators : (creators ? [creators] : []))
    .map(auteurBiblio).filter(Boolean);
  if (!noms.length) return '';
  if (noms.length === 1) return noms[0];
  return noms.slice(0, -1).join(', ') + ' & ' + noms[noms.length - 1];
}

// Une entrée de bibliographie à partir du frontmatter d'une note source.
function entreeBiblio(cle, fm, modele) {
  const val = (x) => String(x == null ? '' : x).replace(/^["']|["']$/g, '').trim();
  const annee = (val(fm.year) || val(fm.date)).match(/\d{4}/);
  const vars = {
    auteurs: listeAuteursBiblio(fm.creators),
    auteursComplets: (Array.isArray(fm.creators) ? fm.creators : (fm.creators ? [fm.creators] : []))
      .map((x) => sansLien(String(x)).trim()).filter(Boolean).join(', '),
    annee: annee ? annee[0] : '',
    titre: val(fm.title),
    publication: val(fm.publication),
    doi: val(fm.doi),
    url: val(fm.url),
    type: val(fm.itemType),
    cle: cle,
  };
  let out = appliquerModele(modele || '{{auteurs}} ({{annee}}). {{titre}}. *{{publication}}*.', vars);
  // Retire les fragments restés vides : « (). », « ** », doubles espaces…
  out = out
    .replace(/\*\s*\*/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*\.\s*(?=\.)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,;]+/, '')
    .replace(/[\s,;]+$/, '')
    .trim();
  if (out && !/[.!?]$/.test(out)) out += '.';
  return out;
}

// Une entrée rendue par Zotero peut porter une numérotation de style (IEEE :
// « [1] », Vancouver : « 1. »). On la retire, et on neutralise les caractères
// qui casseraient un alias de lien.
function nettoyerEntreeBiblio(texte) {
  return String(texte == null ? '' : texte)
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+\.)\s*/, '')
    .trim();
}

// Le renvoi vers la note source est ajouté APRÈS la référence, et non autour :
// dans un alias de lien, Obsidian ne rend pas le markdown, si bien que les
// italiques du style bibliographique resteraient des astérisques littérales.
function entreeCliquable(texte, cle, marqueur) {
  const t = String(texte == null ? '' : texte).replace(/\s+$/, '');
  if (!cle) return t;
  const m = String(marqueur == null || marqueur === '' ? '↗' : marqueur);
  return t + ' [[' + cle + '|' + m + ']]';
}

// Bloc complet, encadré par des marqueurs pour un remplacement idempotent.
function construireBibliographie(entrees, titre) {
  const out = [ZFA_BIBLIO_DEBUT];
  // Ligne vide indispensable : sans elle, « texte + --- » forme un titre
  // souligné (syntaxe setext) et le marqueur serait rendu comme un titre.
  out.push('');
  out.push('---');
  out.push('## ' + (titre || 'Bibliographie'));
  if (entrees.length) {
    for (const e of entrees) out.push('- ' + e);
  } else {
    out.push('*Aucune source citée.*');
  }
  out.push(ZFA_BIBLIO_FIN);
  return out.join('\n');
}

// Remplace le bloc s'il existe, sinon l'ajoute en fin de note.
function injecterBibliographie(contenu, bloc) {
  const texte = String(contenu == null ? '' : contenu);
  const i = texte.indexOf(ZFA_BIBLIO_DEBUT);
  const j = texte.indexOf(ZFA_BIBLIO_FIN);
  if (i !== -1 && j !== -1 && j > i) {
    return texte.slice(0, i) + bloc + texte.slice(j + ZFA_BIBLIO_FIN.length);
  }
  return texte.replace(/\s*$/, '') + '\n\n' + bloc + '\n';
}

// Texte de la note privé de son frontmatter et de ses blocs synchronisés,
// pour ne repérer que les citations réellement écrites dans le corps.
// Le plus long début commun à des noms de fichiers, arrêté sur un séparateur.
// « NP-260826-07 » et « NP-260727-06 » donnent « NP- ». Un début qui n'est pas
// suivi d'un séparateur ne serait pas un préfixe mais une coïncidence.
function prefixeCommun(noms) {
  const l = (noms || []).filter(Boolean);
  if (l.length < 2) return '';
  let commun = l[0];
  for (const n of l.slice(1)) {
    let i = 0;
    while (i < commun.length && i < n.length && commun[i] === n[i]) i++;
    commun = commun.slice(0, i);
    if (!commun) return '';
  }
  const m = commun.match(/^(.*?[-_ ])/);
  const p = m ? m[1] : '';
  return p.length >= 2 && p.length <= 12 ? p : '';
}

// Une valeur de propriété destinée à Word : les liens d'Obsidian n'y ont pas
// leur place. « [[Chabane Mazri]] » devient « Chabane Mazri », « [[cible|nom]] »
// devient « nom », « [texte](url) » devient « texte ». Le reste est intact.
function valeurLisible(texte) {
  return String(texte == null ? '' : texte)
    .replace(/\[\[([^\]\n]*?)\\?\|([^\]\n]+)\]\]/g, '$2')       // [[cible|alias]]
    .replace(/\[\[([^\]|#\n]+)\]\]/g,
      (m, t) => String(t).split('/').pop().replace(/^@/, '').trim())  // [[cible]]
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '$1')                  // [texte](url)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function corpsCitable(contenu) {
  let t = String(contenu == null ? '' : contenu).replace(/^---\n[\s\S]*?\n---\n?/, '');
  const coupe = (deb, fin) => {
    const i = t.indexOf(deb), j = t.indexOf(fin);
    if (i !== -1 && j !== -1 && j > i) t = t.slice(0, i) + t.slice(j + fin.length);
  };
  coupe(ZFA_BIBLIO_DEBUT, ZFA_BIBLIO_FIN);
  coupe(ZFA_SCHEMA_DEBUT, ZFA_SCHEMA_FIN);
  return t;
}

/* ---- Conversion entre notes de bas de page et citations classiques ------ */

// Réécrit l'alias des citations « [[clé|libellé]] » du corps, sans toucher au
// frontmatter ni aux blocs synchronisés (bibliographie, contenu de schéma) —
// où le lien « ↗ » doit rester tel quel.
function rafraichirLibelles(contenu, libelle, citable) {
  const texte = String(contenu == null ? '' : contenu);
  const zones = [];
  const mfm = texte.match(/^---\n[\s\S]*?\n---\n?/);
  if (mfm) zones.push([0, mfm[0].length]);
  for (const [d, f] of [[ZFA_BIBLIO_DEBUT, ZFA_BIBLIO_FIN], [ZFA_SCHEMA_DEBUT, ZFA_SCHEMA_FIN]]) {
    const i = texte.indexOf(d), j = texte.indexOf(f);
    if (i !== -1 && j !== -1 && j > i) zones.push([i, j + f.length]);
  }
  const protege = (pos) => zones.some(([a, b]) => pos >= a && pos < b);

  let n = 0;
  const out = texte.replace(/\[\[([^\]|#\n]+)\|([^\]\n]*)\]\]/g, (tout, cle, alias, pos) => {
    if (protege(pos)) return tout;
    const k = cleDeLien(cle);
    if (!citable(k)) return tout;
    const neuf = libelle(k);
    if (!neuf || neuf === alias) return tout;
    n++;
    return '[[' + k + '|' + neuf + ']]';
  });
  return { texte: out, n };
}

// Où insérer un groupe de citations « (…) » à la position visée, et sous
// quelle forme : nouveau groupe, ou ajout dans le groupe déjà présent.
// Renvoie null si rien à insérer. Fonction pure, donc testable.
function composerCitation(docStr, pos, entrees, sep) {
  const separateur = sep || ' ; ';
  const avant = String(docStr).slice(0, pos);
  const groupe = avant.match(/\(([^()]*\[\[[^()]*)\)\s*$/);
  const dedans = groupe ? groupe[1] : '';
  const retenues = (entrees || []).filter((e) => {
    const cle = (e.match(/^\[\[([^|\]]+)/) || [])[1];
    return cle ? dedans.indexOf('[[' + cle) === -1 : true;
  });
  if (!retenues.length) return null;
  if (groupe) {
    const iFerme = avant.lastIndexOf(')');
    return { from: iFerme, to: iFerme, insert: separateur + retenues.join(separateur) };
  }
  const espace = /\s$/.test(avant) || avant === '' ? '' : ' ';
  return { from: pos, to: pos, insert: espace + '(' + retenues.join(separateur) + ')' };
}

//#endregion 6 · Bibliographie

