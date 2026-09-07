//#region 5 · Notes atomiques
// ═══════════════════════════════════════════════════════════════════════════
//  5 · NOTES ATOMIQUES
//  Détection des notes de données, extraction des blocs d'une source,
//  construction d'une note atomique, parsing des cartes mentales.
// ═══════════════════════════════════════════════════════════════════════════

// Remplace les variables {{var}} d'un modèle par leurs valeurs.
function appliquerModele(modele, vars) {
  return String(modele).replace(/{{\s*(\w+)\s*}}/g, (m, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''
  );
}

// Calcule les plages [from,to] à supprimer pour retirer les définitions de
// notes de bas de page « orphelines » gérées par le plugin (celles dont
// l'appel [^label] a disparu du corps ET dont le bloc contient un lien [[…]]).
// Retire aussi l'en-tête de section s'il ne reste plus aucune définition.
// Fonction pure (testée hors ligne) : ne dépend que de la chaîne du document.
function rangesNotesOrphelines(docStr, titre) {
  const lignes = docStr.split('\n');
  const offsets = [];
  let acc = 0;
  for (const l of lignes) { offsets.push(acc); acc += l.length + 1; }
  const total = docStr.length;
  const lineStart = (i) => offsets[i];
  const lineEndExcl = (i) => (i + 1 < lignes.length ? offsets[i + 1] : total);

  // Appels de note réellement utilisés (on ignore les marqueurs de définition).
  const refs = new Set();
  for (let i = 0; i < lignes.length; i++) {
    const line = lignes[i];
    const re = /\[\^([^\]\s]+)\]/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const after = line.slice(m.index + m[0].length);
      if (after.startsWith(':')) continue; // c'est une définition
      refs.add(m[1]);
    }
  }

  // Définitions et étendue de leur bloc (lignes indentées suivantes).
  const defs = [];
  for (let i = 0; i < lignes.length; i++) {
    const d = lignes[i].match(/^[ \t]*\[\^([^\]]+)\]:/);
    if (!d) continue;
    let j = i;
    while (j + 1 < lignes.length && /^[ \t]/.test(lignes[j + 1])) j++;
    const gere = /\[\[/.test(lignes.slice(i, j + 1).join('\n'));
    defs.push({ label: d[1], i, j, gere });
  }

  const ranges = [];
  for (const dd of defs) {
    if (!(dd.gere && !refs.has(dd.label))) continue;
    let last = dd.j;
    if (dd.j + 1 < lignes.length && lignes[dd.j + 1].trim() === '') last = dd.j + 1;
    ranges.push({ from: lineStart(dd.i), to: lineEndExcl(last) });
  }

  const restantes = defs.filter((dd) => !(dd.gere && !refs.has(dd.label)));
  if (restantes.length === 0 && titre) {
    for (let h = 0; h < lignes.length; h++) {
      if (lignes[h].trim() === '**' + titre + '**') {
        let start = h;
        if (h - 1 >= 0 && lignes[h - 1].trim() === '---') start = h - 1;
        while (start - 1 >= 0 && lignes[start - 1].trim() === '') start--;
        let last = h;
        if (h + 1 < lignes.length && lignes[h + 1].trim() === '') last = h + 1;
        ranges.push({ from: lineStart(start), to: lineEndExcl(last) });
        break;
      }
    }
  }

  ranges.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const r of ranges) {
    if (merged.length && r.from <= merged[merged.length - 1].to) {
      merged[merged.length - 1].to = Math.max(merged[merged.length - 1].to, r.to);
    } else merged.push({ from: r.from, to: r.to });
  }
  return merged;
}

// Couleurs standard de Zotero -> nom lisible (pour la propriété « couleur »).
const COULEURS_ZOTERO = {
  '#ffd400': 'jaune',
  '#ff6666': 'rouge',
  '#5fb236': 'vert',
  '#2ea8e5': 'bleu',
  '#a28ae5': 'violet',
  '#e56eee': 'magenta',
  '#f19837': 'orange',
  '#aaaaaa': 'gris',
};
function nomCouleur(c) {
  if (!c) return '';
  const h = String(c).trim().toLowerCase();
  return COULEURS_ZOTERO[h] || h;
}

// Certains modules de Zotero rangent leurs réglages dans un élément de la
// bibliothèque, qui remonte alors comme une source ordinaire. Ses « notes »
// ne sont pas des notes : ce sont des relevés au format JSON, ou de simples
// clés d'éléments. On refuse de les atomiser plutôt que de fabriquer des notes
// vides d'à peu près tout.
function estNoteDeDonnees(corps) {
  let t = String(corps || '').trim();
  if (!t) return true;
  // Une clé Zotero seule en première ligne ne dit rien : on l'écarte d'abord.
  t = t.replace(/^[A-Z0-9]{6,10}\s*\n/, '').trim();
  if (!t) return true;
  if (/^[[{][\s\S]*[\]}]$/.test(t)) {
    try { JSON.parse(t); return true; } catch (e) { /* pas du JSON : on continue */ }
  }
  // Aucun mot de quatre lettres ou plus : ce n'est pas de la prose.
  return !/[A-Za-zÀ-ÿ]{4,}/.test(t.replace(/[A-Z0-9]{6,10}/g, ' '));
}

// Notes-filles Zotero : celles attachées à la référence entière, non à un
// passage. Zotflow les dépose dans la fiche source, sous « ## Notes », bornées
// par <!-- ZF_NOTE_BEG_<clé> --> … <!-- ZF_NOTE_END_<clé> -->. Contrairement
// aux annotations, elles n'ont ni ancre ni note propre : elles ne pouvaient
// donc être ni citées ni reliées.
function extraireNotesFilles(contenu) {
  const blocs = [];
  const re = /<!--\s*ZF_NOTE_BEG_(\w+)\s*-->([\s\S]*?)<!--\s*ZF_NOTE_END_\1\s*-->/g;
  let m;
  while ((m = re.exec(contenu)) !== null) {
    const cle = m[1];
    // La ligne de métadonnées ne porte que du JSON encodé : elle n'a rien à
    // faire dans la note produite.
    const corps = String(m[2] || '')
      .replace(/<!--\s*ZF_NOTE_META[\s\S]*?-->/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!corps || estNoteDeDonnees(corps)) continue;
    blocs.push({ cle, corps, titre: titreDeNoteFille(corps) });
  }
  return blocs;
}

// Le titre : la première amorce en gras, à défaut la première ligne de texte.
function titreDeNoteFille(corps) {
  for (const ligne of corps.split('\n')) {
    const t = ligne.trim();
    if (!t) continue;
    const gras = t.match(/^\*\*(.+?)\*\*\.?\s*$/);
    if (gras) return gras[1].trim();
    const nu = t.replace(/^[#>*\-\s]+/, '').replace(/<[^>]+>/g, '').trim();
    if (nu) return nu.length > 90 ? nu.slice(0, 87).trim() + '…' : nu;
  }
  return '';
}

// Les citations que zotflow inscrit dans une note-fille sont du HTML portant
// l'URI Zotero de la source et le libellé déjà mis en forme. On les ramène à
// la forme d'Ariane — ([[@clé|libellé]]) — pour qu'elles nourrissent la
// bibliographie de fin de note comme l'export Word.
function citationsZotflowVersAriane(corps, parCleZotero) {
  const texte = String(corps);
  // Le span de citation en contient un autre : une expression paresseuse
  // s'arrêterait sur la balise fermante du span intérieur. On apparie donc à
  // la profondeur, comme on le ferait pour n'importe quelle imbrication.
  const ouvre = /<span\b(?=[^>]*class="citation")[^>]*data-citation="([^"]*)"[^>]*>/g;
  let sortie = '', dernier = 0, m;
  while ((m = ouvre.exec(texte)) !== null) {
    const debutDedans = m.index + m[0].length;
    const apres = finDeSpanApparie(texte, debutDedans);
    if (apres < 0) continue;
    const dedans = texte.slice(debutDedans, apres - '</span>'.length);
    const libelle = dedans.replace(/<[^>]+>/g, '').trim().replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim();
    let cleZot = null;
    try {
      const j = JSON.parse(decodeURIComponent(m[1]));
      const items = (j && j.citationItems) || [];
      const uri = items[0] && items[0].uris && items[0].uris[0];
      const mu = uri && String(uri).match(/items\/(\w+)/);
      if (mu) cleZot = mu[1];
    } catch (e) { /* citation illisible : on la laisse telle quelle */ }
    const citekey = cleZot && parCleZotero ? parCleZotero.get(cleZot) : null;
    const remplacement = (citekey && libelle)
      ? '([[' + citekey + '|' + libelle + ']])'
      : texte.slice(m.index, apres);
    sortie += texte.slice(dernier, m.index) + remplacement;
    dernier = apres;
    ouvre.lastIndex = apres;
  }
  return sortie + texte.slice(dernier);
}

// Indice qui suit le </span> appariant le span ouvert juste avant « depart ».
function finDeSpanApparie(texte, depart) {
  const re = /<span\b[^>]*>|<\/span>/g;
  re.lastIndex = depart;
  let profondeur = 1, m;
  while ((m = re.exec(texte)) !== null) {
    profondeur += (m[0] === '</span>') ? -1 : 1;
    if (profondeur === 0) return m.index + m[0].length;
  }
  return -1;
}

// Extrait tous les blocs d'annotation d'une note source, selon la config.
// Titre de repli pour une annotation dont le commentaire ne porte pas de titre
// reconnu par un profil. On coupe à la première phrase si elle tient dans la
// longueur voulue, sinon au dernier mot entier.
function titreDeRepli(paraphrase, highlight, cle, cfg) {
  const limite = Math.max(10, parseInt(cfg.titreReplLongueur, 10) || 60);
  const surlignageDabord = cfg.titreReplSource === 'surlignage';
  const sources = surlignageDabord ? [highlight, paraphrase] : [paraphrase, highlight];
  let base = '';
  for (const s of sources) {
    base = String(s || '')
      .replace(/!\[\[[^\]]*\]\]/g, ' ')
      .replace(/[*_`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (base) break;
  }
  if (!base) return cle;
  const phrase = base.match(/^[^.!?…]*[.!?…]/);
  if (phrase && phrase[0].trim().length <= limite) {
    return phrase[0].replace(/[.!?…]+$/, '').trim() || cle;
  }
  if (base.length <= limite) return base;
  const coupe = base.slice(0, limite);
  const esp = coupe.lastIndexOf(' ');
  return (esp > limite / 2 ? coupe.slice(0, esp) : coupe).trim() + '…';
}

function extraireBlocs(contenu, cfg) {
  let regexBloc, regexPage, regexImage;
  try {
    regexBloc = new RegExp(cfg.blocRegex, 'g');
    regexPage = new RegExp(cfg.pageRegex, 'g');
    regexImage = new RegExp(cfg.imageRegex, 'g');
  } catch (e) {
    console.error('[Ariane] Regex de base invalide :', e);
    return [];
  }
  const profils = compilerProfils(cfg);
  if (profils.length === 0) return [];

  const sepCit = (cfg.separateurCitations || ';').trim() || ';';
  const blocs = [];
  let m;
  let finBlocPrecedent = 0;
  while ((m = regexBloc.exec(contenu)) !== null) {
    const cle = m[1];
    const brut = m[2] || '';

    // En-tête du callout : tout ce qui sépare la fin du bloc précédent
    // du marqueur BEG courant (page, image, texte surligné).
    const entete = contenu.substring(finBlocPrecedent, m.index);
    finBlocPrecedent = m.index + m[0].length;

    const lignes = brut
      .split('\n')
      .map((l) => l.replace(/^>\s?/, '').trim())
      .filter((l) => l.length > 0);
    if (lignes.length === 0) continue;

    // Normalisation : titre en gras et référence en italique collés sur la
    // même ligne (annotation sans paraphrase) -> on les sépare en deux
    // lignes pour que chacun soit reconnu.
    const colle = lignes[0].match(/^(\*\*.+?\*\*\.?)\s*(\*(?!\*).+?\*)$/);
    if (colle) lignes.splice(0, 1, colle[1], colle[2]);

    // Choix du profil : le premier dont le motif de titre correspond.
    let titre = null;
    let profReference = null;
    let profNom = null;
    // Le titre occupe-t-il la première ligne ? Sinon elle appartient au corps.
    let ligneTitre = true;
    for (const p of profils) {
      const mt = lignes[0].match(p.titre);
      if (mt) {
        titre = (mt[1] !== undefined ? mt[1] : mt[0]).trim();
        profReference = p.reference;
        profNom = p.nom;
        break;
      }
    }
    if (titre === null) {
      // Commentaire sans titre reconnu : annotation écartée par défaut,
      // atomisée avec un titre de repli si l'option est active.
      if (!cfg.titreFacultatif) continue;
      ligneTitre = false;
      titre = ''; // calculé plus bas, la paraphrase étant alors connue
      profReference = profils[0].reference;
      profNom = profils[0].nom;
    }

    // Référence éventuelle : dernière ligne selon le motif du profil.
    const premiere = ligneTitre ? 1 : 0;
    let ligneReference = null;
    let lignesParaphrase = lignes.slice(premiere);
    const derniere = lignes[lignes.length - 1];
    if (profReference && lignes.length > premiere) {
      const mr = derniere.match(profReference);
      if (mr) {
        ligneReference = (mr[1] !== undefined ? mr[1] : mr[0]).trim();
        if (cfg.retirerParentheses) {
          ligneReference = ligneReference.replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim();
        }
        lignesParaphrase = lignes.slice(premiere, -1);
      }
    }
    const paraphrase = lignesParaphrase.join('\n').trim();

    let page = '';
    const pm = [...entete.matchAll(regexPage)];
    if (pm.length > 0) page = pm[pm.length - 1][1].trim();

    // Lien d'ouverture de l'annotation dans le PDF (dernier de l'en-tête).
    let lienAnno = '';
    const am = [...entete.matchAll(/\((obsidian:\/\/zotflow\?type=open-annotation[^)\s]*)\)/g)];
    if (am.length > 0) lienAnno = am[am.length - 1][1].trim();

    let image = '';
    const im = [...entete.matchAll(regexImage)];
    if (im.length > 0) image = im[im.length - 1][1].trim();

    // Texte surligné (citation d'origine) : lignes de blockquote imbriqué
    // « > > ... » de l'en-tête, en excluant les embeds d'image.
    const surligne = [];
    for (const l of entete.split('\n')) {
      const mh = l.match(/^>\s*>\s?(.*)$/);
      if (mh) {
        const t = mh[1].trim();
        if (t && !/^!\[\[/.test(t)) surligne.push(t);
      }
    }
    const highlight = surligne.join(' ').replace(/\s{2,}/g, ' ').trim();

    const refs = [];
    if (ligneReference) {
      let citations;
      try {
        citations = ligneReference.split(new RegExp(echapperRegex(sepCit)));
      } catch (e) {
        citations = ligneReference.split(sepCit);
      }
      for (let c of citations) {
        c = c.replace(/[()]/g, '').trim();
        if (!c) continue;
        const ref = parseNomReference(c, cfg);
        if (ref) {
          refs.push(ref);
        } else {
          // Pas d'année : citation « auteur seul » -> lien direct vers l'auteur.
          const aut = parseAuteurSeul(c, cfg);
          if (aut) refs.push(aut);
        }
      }
    }

    // Couleur de l'annotation : dernier callout « [!zotflow-<type>-<couleur>] » de l'en-tête.
    const cm = [...entete.matchAll(/\[!zotflow-\w+-(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\]/g)];
    const couleur = cm.length ? nomCouleur(cm[cm.length - 1][1]) : '';

    if (!titre) titre = titreDeRepli(paraphrase, highlight, cle, cfg);

    blocs.push({ cle, titre, paraphrase, page, image, highlight, refs, couleur, lienAnno, ordre: blocs.length + 1, profil: profNom });
  }
  return blocs;
}

// Construit le contenu canonique d'une note d'annotation (via modèles).
function construireNote(bloc, sourceBasename, indexZotero, cfg, ctxSource) {
  ctxSource = ctxSource || {};
  let refLinks = [];
  const pagesRef = {}; // cible de lien -> page de la référence citée (propre à l'annotation)
  for (const r of bloc.refs) {
    // Citation « auteur seul » (sans année) : lien(s) direct(s) vers l'auteur,
    // sans note de référence intermédiaire.
    if (r.estAuteurSeul) {
      for (const a of r.auteurs) refLinks.push('[[' + a + ']]');
      continue;
    }
    // Correspondance manuelle mémorisée (désambiguïsation 2005a/2005b) prioritaire.
    // La cible dépend de la source : c'est ce qui permet à un même libellé de
    // désigner deux travaux selon l'article, et de survivre à la ré-atomisation.
    const manuel = cibleDeReference(cfg.correspondancesSuffixe, r.nom, sourceBasename);
    let cibleRef;
    if (manuel) {
      cibleRef = manuel;
    } else {
      const z = cfg.rattachementZotero ? trouverSourceZotero(r, indexZotero) : null;
      // À défaut, la note existante dont l'écriture est équivalente : sans quoi
      // « Castan~er » créerait un lien vers un second fichier.
      const canon = ctxSource.canoniques ? ctxSource.canoniques.get(cleLibelle(r.nom)) : null;
      cibleRef = z || canon || r.nom;
    }
    refLinks.push('[[' + cibleRef + ']]');
    if (r.page) pagesRef[cibleRef] = r.page;
  }
  // Aucune référence citée : par défaut, la source de l'annotation.
  if (refLinks.length === 0 && cfg.referenceParDefautSource) {
    refLinks = ['[[' + sourceBasename + ']]'];
  }
  const liens = refLinks.join(' ; ');

  const vars = {
    title: bloc.titre,
    key: bloc.cle,
    sourceName: sourceBasename,
    image: bloc.image ? '![[' + bloc.image + ']]' : '',
    paraphrase: bloc.paraphrase || '',
    source: '[[' + sourceBasename + '#^' + bloc.cle + ']]',
    page: bloc.page || '',
    pageLine: bloc.page ? cfg.labelPage + bloc.page : '',
    referenceLinks: liens,
    references: refLinks.length > 0 ? cfg.labelReferences + liens : '',
    annotationUrl: bloc.lienAnno || '',
    titleLink: bloc.lienAnno ? '[' + bloc.titre + '](' + bloc.lienAnno + ')' : bloc.titre,
  };

  // Citation du texte surligné, rendue en encadré (callout).
  let citation = '';
  if (cfg.inclureCitation && bloc.highlight) {
    const type = (cfg.calloutCitation || 'quote').trim() || 'quote';
    citation =
      '> [!' + type + ']\n' + bloc.highlight.split('\n').map((l) => '> ' + l).join('\n');
  }
  vars.citation = citation;
  vars.highlight = bloc.highlight || '';

  let corps = appliquerModele(cfg.modeleNote, vars);
  corps = corps
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  const alias = appliquerModele(cfg.aliasTemplate, vars).trim();

  const fm = ['---'];
  if (alias) {
    fm.push('aliases:');
    fm.push('  - ' + JSON.stringify(alias));
  }
  // Classe CSS pour cibler le style des notes d'annotation (ex. titre).
  fm.push('cssclasses:');
  fm.push('  - annotation');
  fm.push('zotflow-anno-key: ' + bloc.cle);
  fm.push('zotflow-source: ' + JSON.stringify('[[' + sourceBasename + ']]'));
  if (typeof bloc.ordre === 'number') fm.push('ordre: ' + bloc.ordre);
  if (bloc.page) fm.push('page: ' + JSON.stringify(bloc.page));
  // Références citées aussi en propriété (liens cliquables) pour les bases.
  if (refLinks.length > 0) {
    fm.push('références-citées:');
    for (const l of refLinks) fm.push('  - ' + JSON.stringify(l));
  }
  const clesPages = Object.keys(pagesRef);
  if (clesPages.length > 0) {
    fm.push('références-pages:');
    for (const k of clesPages) fm.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(String(pagesRef[k])));
  }
  // Collections Zotero (héritées de la source) : filtrage direct dans les Bases.
  const cols = ctxSource.collections;
  if (cols) {
    const liste = (Array.isArray(cols) ? cols : [cols]).map((x) => String(x)).filter(Boolean);
    if (liste.length) {
      fm.push('collections:');
      for (const cc of liste) fm.push('  - ' + JSON.stringify(cc));
    }
  }
  if (bloc.couleur) fm.push('couleur: ' + JSON.stringify(bloc.couleur));
  fm.push('zotflow-auto: true');
  fm.push('zotflow-locked: true');
  fm.push('---');

  return fm.join('\n') + '\n' + corps + '\n';
}

// Analyse une carte : blocs, relations, et problèmes de conformité.
function analyserCarte(data, vocab, sidecar) {
  const relations = (vocab && vocab.relations) || [];
  const types = (vocab && vocab.types) || [];
  const strict = !!(vocab && vocab.strict);
  const map = (sidecar && sidecar.blocs) || {};
  const noeuds = (data && data.nodes) || [];
  const aretes = (data && data.edges) || [];
  const parId = {};
  for (const n of noeuds) parId[n.id] = n;

  const blocs = noeuds
    .filter((n) => n.type !== 'group')
    .map((n) => ({ id: n.id, texte: texteNoeud(n), type: map[n.id] || '', noeud: n }));

  const liens = [];
  const problemes = [];
  for (const e of aretes) {
    const rel = relationDeEtiquette(e.label, relations);
    const src = parId[e.fromNode], dst = parId[e.toNode];
    liens.push({
      id: e.id,
      de: e.fromNode, vers: e.toNode,
      deTexte: texteNoeud(src), versTexte: texteNoeud(dst),
      etiquette: e.label || '',
      relation: rel ? rel.id : '',
      polarite: polariteEtiquette(e.label),
    });
    if (!e.label || !String(e.label).trim()) {
      problemes.push({ gravite: 'info', type: 'lien-muet', id: e.id, texte: (texteNoeud(src) || '?') + ' → ' + (texteNoeud(dst) || '?') });
    } else if (!rel && relations.length) {
      // Vocabulaire vide = aucune norme imposée : on ne signale rien.
      problemes.push({ gravite: strict ? 'erreur' : 'avert', type: 'hors-vocabulaire', id: e.id, texte: '« ' + e.label +' » (' + (texteNoeud(src) || '?') + ' → ' + (texteNoeud(dst) || '?') + ')' });
    } else if (rel.soupape) {
      problemes.push({ gravite: 'info', type: 'soupape', id: e.id, texte: '« ' + rel.nom + ' » à retyper (' + (texteNoeud(src) || '?') + ' → ' + (texteNoeud(dst) || '?') + ')' });
    }
  }
  const idsTypes = new Set((types || []).map((t) => t.id));
  for (const b of blocs) {
    if (!b.texte) continue;
    if (!b.type) problemes.push({ gravite: 'info', type: 'bloc-sans-type', id: b.id, texte: b.texte });
    else if (!idsTypes.has(b.type)) problemes.push({ gravite: 'avert', type: 'type-inconnu', id: b.id, texte: b.texte + ' (« ' + b.type + ' »)' });
  }
  return { blocs, liens, problemes };
}

//#endregion 5 · Notes atomiques

