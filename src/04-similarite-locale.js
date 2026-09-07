//#region 4 · Similarité locale (TF-IDF & vecteurs)
// ═══════════════════════════════════════════════════════════════════════════
//  4 · SIMILARITÉ LOCALE (TF-IDF & VECTEURS)
//  Tokenisation, TF-IDF, similarité cosinus — utilisées par les suggestions
//  de voisinage locales.
// ═══════════════════════════════════════════════════════════════════════════

// Mots vides FR + EN, écartés à l'indexation.
const MOTS_VIDES = new Set(
  ('au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me '
    + 'meme mes moi mon ne nos notre nous on ont ou par pas pour qu que qui quoi sa se ses '
    + 'son sur ta te tes toi ton tu un une vos votre vous est sont ete etre avoir fait plus '
    + 'tres cette comme donc car ainsi alors entre aussi peut selon dont chez sans sous '
    + 'the and or of to in is are was were be been for on at by with as that this these those '
    + 'it its from not but they their them we you he she his her also can may such into which '
    + 'what when where who whom how than then so if there here more most other some any each')
    .split(/\s+/)
);

// Normalise (minuscules, sans accents) et découpe un texte en jetons
// signifiants : longueur >= 3, hors mots vides, dépluralisation légère.
function tokeniser(texte) {
  if (!texte) return [];
  const norm = String(texte)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const jetons = [];
  for (let mot of norm.split(/[^a-z0-9]+/)) {
    if (mot.length < 3 || MOTS_VIDES.has(mot)) continue;
    if (mot.length > 4 && (mot.endsWith('s') || mot.endsWith('x'))) mot = mot.slice(0, -1);
    jetons.push(mot);
  }
  return jetons;
}

// Fréquence des termes : Map(terme -> compte).
function frequenceTermes(jetons) {
  const m = new Map();
  for (const j of jetons) m.set(j, (m.get(j) || 0) + 1);
  return m;
}

// IDF d'un corpus (liste de Map tf) : Map(terme -> idf lissé).
function calculerIdf(docsTf) {
  const df = new Map();
  for (const tf of docsTf) for (const terme of tf.keys()) df.set(terme, (df.get(terme) || 0) + 1);
  const n = docsTf.length || 1;
  const idf = new Map();
  for (const [terme, d] of df) idf.set(terme, Math.log(1 + n / d));
  return idf;
}

// Vecteur TF-IDF (Map terme->poids) + norme euclidienne.
function vecteurTfIdf(tf, idf) {
  const vec = new Map();
  let somme = 0;
  for (const [terme, c] of tf) {
    const poids = (1 + Math.log(c)) * (idf.get(terme) || 0);
    if (poids > 0) { vec.set(terme, poids); somme += poids * poids; }
  }
  return { vec, norme: Math.sqrt(somme) || 1 };
}

// Cosinus entre deux vecteurs creux (itère sur le plus petit).
function cosinusTfIdf(vReq, nReq, vDoc, nDoc) {
  let a = vReq, b = vDoc;
  if (a.size > b.size) { a = vDoc; b = vReq; }
  let dot = 0;
  for (const [terme, p] of a) { const q = b.get(terme); if (q) dot += p * q; }
  return dot / (nReq * nDoc);
}

// Empreinte compacte et stable d'un texte (djb2), pour le cache d'embeddings.
function hacherTexte(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + s.length;
}

// Normalise un vecteur (norme L2 = 1) ; renvoie un Float32Array.
function normaliserVecteur(arr) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) n += arr[i] * arr[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / n;
  return out;
}

// Cosinus entre deux vecteurs déjà normalisés (= produit scalaire).
function cosinusVecteurs(a, b) {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += a[i] * b[i];
  return d;
}

//#endregion 4 · Similarité locale (TF-IDF & vecteurs)

