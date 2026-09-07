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
// Björnsdóttir, Ylönen, Méric, Santaló : sans cette normalisation, une simple
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

// Regroupe les entrées d'une même source : deux annotations d'un même travail
// ne font qu'une citation, et leurs pages se cumulent dans un seul suffixe.
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

//#endregion 2 · Utilitaires génériques

