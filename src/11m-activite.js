// ── avecActivite ──────────────────────────────────────────────────────────
// Domaine : activité réelle hors d'Obsidian (calendrier).
// Lecture d'ActivityWatch (serveur local), classement des fenêtres par
// règles, agrégation en créneaux « réels » pour la vue semaine du calendrier.
//
// ActivityWatch enregistre l'application au premier plan, le titre de sa
// fenêtre, l'absence du clavier et, avec son extension, l'adresse de l'onglet
// actif. Ariane ne stocke rien de tout cela : les événements bruts restent en
// mémoire le temps de la session, et seuls les créneaux agrégés s'affichent.
const avecActivite = (Base) => class extends Base {
  //#region Ariane · static · activité réelle
  // ── static · activité réelle ─────────────────────────────────────────────

  // Choisit les seaux (« buckets ») utiles parmi ceux du serveur. Fenêtres et
  // absence doivent venir de la MÊME machine, sinon on croiserait l'activité
  // d'un ordinateur avec le clavier d'un autre : on prend l'hôte courant s'il
  // est connu du serveur, sinon celui dont le seau de fenêtres a bougé en
  // dernier. Les seaux du navigateur portent souvent un hôte « unknown » : on
  // les prend tous.
  static choisirBucketsAW(tous, hote) {
    const liste = Object.values(tous || {}).filter((b) => b && b.id);
    const deType = (t) => liste.filter((b) => b.type === t);
    const fen = deType('currentwindow');
    let h = hote && fen.some((b) => b.hostname === hote) ? hote : '';
    if (!h && fen.length) {
      const recent = fen.slice().sort((a, b) =>
        String(b.last_updated || '').localeCompare(String(a.last_updated || '')))[0];
      h = recent.hostname || '';
    }
    const deHote = (bs) => bs.filter((b) => !h || b.hostname === h).map((b) => b.id);
    return {
      hote: h,
      fenetre: deHote(fen),
      afk: deHote(deType('afkstatus')),
      web: deType('web.tab.current').map((b) => b.id),
    };
  }

  // Trie et fusionne des intervalles [début, fin] (ms) qui se touchent.
  static fusionnerIntervalles(iv) {
    const tri = (iv || []).filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a, b] of tri) {
      const der = out[out.length - 1];
      if (der && a <= der[1]) der[1] = Math.max(der[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  // Parties de [a, b] couvertes par une liste d'intervalles triés et fusionnés.
  static couperParIntervalles(a, b, actifs) {
    const out = [];
    for (const [x, y] of actifs) {
      if (y <= a) continue;
      if (x >= b) break;
      out.push([Math.max(a, x), Math.min(b, y)]);
    }
    return out;
  }

  // Segments d'activité d'une journée [d0, d1[ : chaque événement de fenêtre,
  // rogné à la journée, restreint aux plages où le clavier ou la souris ont
  // servi, et (pour un navigateur) découpé selon l'onglet actif, dont il
  // reprend l'adresse. Sans seau d'absence (afk === null), tout compte.
  static segmentsActivite(fenetres, afk, web, d0, d1) {
    const iv = (e) => {
      const a = Date.parse(e && e.timestamp);
      if (!Number.isFinite(a)) return [0, 0];
      const b = a + (Number(e.duration) || 0) * 1000;
      return [Math.max(a, d0), Math.min(b, d1)];
    };
    const actifs = afk ? Ariane.fusionnerIntervalles(afk
      .filter((e) => e && e.data && e.data.status === 'not-afk').map(iv)) : null;
    const onglets = (web || []).map((e) => {
      const [a, b] = iv(e);
      const d = (e && e.data) || {};
      return { a, b, url: String(d.url || ''), titre: String(d.title || '') };
    }).filter((w) => w.b > w.a).sort((x, y) => x.a - y.a);
    const navigateur = /chrome|chromium|safari|firefox|arc\b|brave|edge|vivaldi|opera|orion|zen\b/i;
    const out = [];
    for (const e of (fenetres || [])) {
      const [a, b] = iv(e);
      if (b <= a) continue;
      const d = (e && e.data) || {};
      const app = String(d.app || '');
      const titre = String(d.title || '');
      // Sur macOS, le relevé des fenêtres lit lui-même l'adresse de l'onglet
      // de Safari ou de Chrome (avec l'autorisation « Automatisation ») :
      // c'est la seule source pour Safari, qui n'a pas d'extension.
      const urlFenetre = String(d.url || '');
      const morceaux = actifs ? Ariane.couperParIntervalles(a, b, actifs) : [[a, b]];
      for (const [x, y] of morceaux) {
        if (!onglets.length || !navigateur.test(app)) {
          out.push({ deb: x, fin: y, app, titre, url: urlFenetre });
          continue;
        }
        let cur = x;
        for (const w of onglets) {
          if (w.b <= cur) continue;
          if (w.a >= y) break;
          const s = Math.max(cur, w.a);
          const t = Math.min(y, w.b);
          if (s > cur) out.push({ deb: cur, fin: s, app, titre, url: urlFenetre });
          out.push({ deb: s, fin: t, app, titre: w.titre || titre, url: w.url });
          cur = t;
        }
        if (cur < y) out.push({ deb: cur, fin: y, app, titre, url: urlFenetre });
      }
    }
    return out.sort((p, q) => p.deb - q.deb);
  }

  // Motifs d'une règle, séparés par des virgules. Un motif est un fragment de
  // texte (casse indifférente) ou une expression /…/ ; un préfixe app:,
  // titre: ou url: le restreint à ce champ.
  static motifsActivite(corps) {
    const s = String(corps || '');
    const out = [];
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      if (i >= s.length) break;
      let champ = '';
      const mp = /^(app|titre|title|url)\s*:\s*/i.exec(s.slice(i));
      if (mp) {
        champ = mp[1].toLowerCase() === 'title' ? 'titre' : mp[1].toLowerCase();
        i += mp[0].length;
      }
      if (s[i] === '/') {
        let j = i + 1;
        let echap = false;
        while (j < s.length && (echap || s[j] !== '/')) { echap = !echap && s[j] === '\\'; j++; }
        if (j < s.length) {
          let k = j + 1;
          while (k < s.length && /[a-z]/i.test(s[k])) k++;
          const drapeaux = s.slice(j + 1, k).replace(/[^msu]/g, '') + 'i';
          try { out.push({ champ, re: new RegExp(s.slice(i + 1, j), drapeaux) }); } catch (e) { /* motif invalide : ignoré */ }
          i = k;
          continue;
        }
      }
      let j = s.indexOf(',', i);
      if (j < 0) j = s.length;
      const txt = s.slice(i, j).trim().toLowerCase();
      if (txt) out.push({ champ, txt });
      i = j;
    }
    return out;
  }

  // Règles de classement, une par ligne : « Catégorie #couleur = motif, … ».
  // La couleur est facultative. La catégorie « - » écarte ce qui correspond.
  // Les lignes vides et celles qui commencent par # sont ignorées. La
  // première règle qui correspond l'emporte.
  static compilerReglesActivite(texte) {
    const regles = [];
    for (const brute of String(texte || '').split('\n')) {
      const l = brute.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i <= 0) continue;
      let tete = l.slice(0, i).trim();
      let couleur = '';
      const mc = tete.match(/\s(#[0-9a-fA-F]{3,8})$/);
      if (mc) { couleur = mc[1]; tete = tete.slice(0, mc.index).trim(); }
      if (!tete) continue;
      const motifs = Ariane.motifsActivite(l.slice(i + 1));
      if (!motifs.length) continue;
      const ignorer = tete === '-';
      regles.push({ categorie: ignorer ? '' : tete, couleur, ignorer, motifs });
    }
    return regles;
  }

  // Les règles et les catégories restent rangées en texte dans les réglages
  // (lisible, exportable) ; l'éditeur des réglages les manipule en lignes.
  static lignesReglesActivite(texte) {
    const out = [];
    for (const brute of String(texte || '').split('\n')) {
      const l = brute.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i <= 0) continue;
      let tete = l.slice(0, i).trim();
      let couleur = '';
      const mc = tete.match(/\s(#[0-9a-fA-F]{3,8})$/);
      if (mc) { couleur = mc[1]; tete = tete.slice(0, mc.index).trim(); }
      out.push({ categorie: tete, couleur, motifs: l.slice(i + 1).trim() });
    }
    return out;
  }

  static texteReglesActivite(lignes) {
    return (lignes || []).filter((r) => String(r.categorie || '').trim() && String(r.motifs || '').trim())
      .map((r) => r.categorie.trim() + (r.couleur && r.categorie.trim() !== '-' ? ' ' + r.couleur : '')
        + ' = ' + r.motifs.trim()).join('\n');
  }

  static texteCategoriesIA(cats) {
    return (cats || []).filter((c) => String(c.nom || '').trim())
      .map((c) => c.nom.trim().replace(/[#:]/g, ' ').replace(/\s+/g, ' ')
        + (c.couleur ? ' ' + c.couleur : '') + (String(c.description || '').trim() ? ' : ' + c.description.trim() : ''))
      .join('\n');
  }

  // Règle qui s'applique à un segment : la règle, null si elle l'écarte,
  // undefined si aucune ne correspond.
  static classerActivite(seg, regles) {
    const champs = { app: String(seg.app || ''), titre: String(seg.titre || ''), url: String(seg.url || '') };
    const tout = champs.app + '\n' + champs.titre + '\n' + champs.url;
    const toutBas = tout.toLowerCase();
    for (const r of (regles || [])) {
      for (const m of r.motifs) {
        const cible = m.champ ? champs[m.champ] : tout;
        const ok = m.re ? m.re.test(cible)
          : (m.champ ? cible.toLowerCase() : toutBas).includes(m.txt);
        if (ok) return r.ignorer ? null : r;
      }
    }
    return undefined;
  }

  // Ce qui décrit un segment dans l'infobulle : le domaine pour une page web,
  // sinon l'application et le titre de sa fenêtre.
  static libelleActivite(seg) {
    if (seg.url) {
      const m = String(seg.url).match(/^[a-z][\w+.-]*:\/\/([^/?#]+)/i);
      if (m) return m[1].replace(/^www\./, '');
    }
    const t = String(seg.titre || '').trim();
    const l = t ? (seg.app ? seg.app + ' · ' + t : t) : String(seg.app || '');
    return l.length > 80 ? l.slice(0, 79) + '…' : l;
  }

  // Couleur stable d'une catégorie sans couleur déclarée.
  static couleurActivite(nom) {
    const pal = ['#4a7fd6', '#4f9d69', '#c08a2e', '#b5527a', '#7c5cbf', '#2a9d8f', '#d1603d', '#6c8ead'];
    let h = 0;
    for (const ch of String(nom || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return pal[h % pal.length];
  }

  // « AAAA-MM-JJTHH:MM » en heure locale, la forme des créneaux du calendrier.
  // Les onglets de Safari relevés par Ariane ({ debut, fin, url, titre }, en
  // millisecondes) en événements au format des seaux de navigateur
  // d'ActivityWatch, rognés à la journée [d0, d1[ : segmentsActivite les
  // traite alors comme ceux d'une extension.
  static ongletsEnEvenements(releves, d0, d1) {
    const out = [];
    for (const r of (releves || [])) {
      const a = Math.max(Number(r && r.debut) || 0, d0);
      const b = Math.min(Number(r && r.fin) || 0, d1);
      if (!(b > a) || !r.url) continue;
      out.push({ timestamp: new Date(a).toISOString(), duration: (b - a) / 1000,
        data: { url: String(r.url), title: String(r.titre || '') } });
    }
    return out;
  }

  // Une ligne du relevé de Safari : « T \t ms \t url \t titre » (onglet vu)
  // ou « - \t ms » (Safari fermé), « E \t REFUS » (autorisation refusée).
  static lireLigneSafari(ligne) {
    const p = String(ligne || '').split('\t');
    if (p[0] === 'E') return { erreur: p[1] || '' };
    const ms = Number(p[1]);
    if (!Number.isFinite(ms)) return null;
    if (p[0] === '-') return { ms, url: '' };
    if (p[0] === 'T') return { ms, url: p[2] || '', titre: p.slice(3).join('\t') };
    return null;
  }

  static isoLocalMinute(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return jourIsoDe(d) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // Agrège les segments d'une journée [d0, d1[ en créneaux réels. La journée
  // est découpée en grains (5 min par défaut) ; chaque grain prend la
  // catégorie qui l'a le plus occupé, s'il a été actif au moins un cinquième
  // du temps. Les grains voisins de même catégorie forment un créneau, borné
  // par la première et la dernière activité réelle ; un trou d'un grain au
  // plus ne le coupe pas. Les créneaux dont le temps ACTIF est trop court sont
  // écartés, puis leurs voisins de même catégorie se rejoignent : quatre
  // minutes de courriel au milieu d'une lecture ne la coupent pas en deux.
  static agregerActivite(segments, regles, opts) {
    const o = opts || {};
    const d0 = Number(o.d0);
    const d1 = Number(o.d1);
    const B = Math.max(1, Number(o.grainMin) || 5) * 60000;
    const tolerance = B;
    const dureeMin = Math.max(0, Number(o.dureeMin) || 0) * 60000;
    const autre = String(o.autre || '').trim();
    const grains = new Map(); // indice → Map(catégorie → { ms, a, b, couleur, det: Map(libellé → ms) })
    for (const s of (segments || [])) {
      let r = Ariane.classerActivite(s, regles);
      if (r === null) continue;
      if (r === undefined) {
        if (!autre) continue;
        r = { categorie: autre, couleur: '#8a8a8a' };
      }
      const lib = Ariane.libelleActivite(s);
      const deb = Math.max(s.deb, d0);
      const fin = Math.min(s.fin, d1);
      for (let k = Math.floor((deb - d0) / B); d0 + k * B < fin; k++) {
        const a = Math.max(deb, d0 + k * B);
        const b = Math.min(fin, d0 + (k + 1) * B);
        if (b <= a) continue;
        if (!grains.has(k)) grains.set(k, new Map());
        const g = grains.get(k);
        if (!g.has(r.categorie)) g.set(r.categorie, { ms: 0, a, b, couleur: r.couleur, det: new Map() });
        const c = g.get(r.categorie);
        c.ms += b - a;
        c.a = Math.min(c.a, a);
        c.b = Math.max(c.b, b);
        c.det.set(lib, (c.det.get(lib) || 0) + (b - a));
      }
    }
    const fusionnerDet = (m1, m2) => { for (const [l, v] of m2) m1.set(l, (m1.get(l) || 0) + v); };
    const rejoindre = (liste) => {
      const out = [];
      for (const b of liste) {
        const der = out[out.length - 1];
        if (der && der.categorie === b.categorie && b.deb - der.fin <= tolerance) {
          der.fin = b.fin;
          der.actif += b.actif;
          fusionnerDet(der.det, b.det);
        } else {
          out.push(b);
        }
      }
      return out;
    };
    const bruts = [];
    for (const k of [...grains.keys()].sort((a, b) => a - b)) {
      const g = grains.get(k);
      let total = 0;
      let meilleur = null;
      for (const [cat, c] of g) {
        total += c.ms;
        if (!meilleur || c.ms > meilleur[1].ms) meilleur = [cat, c];
      }
      if (total < B / 5) continue;
      bruts.push({ categorie: meilleur[0], couleur: meilleur[1].couleur, actif: meilleur[1].ms,
        deb: meilleur[1].a, fin: meilleur[1].b, det: new Map(meilleur[1].det) });
    }
    const blocs = rejoindre(rejoindre(bruts).filter((b) => b.actif >= dureeMin));
    return blocs.map((b) => ({
      categorie: b.categorie,
      couleur: b.couleur || Ariane.couleurActivite(b.categorie),
      debut: Ariane.isoLocalMinute(b.deb),
      fin: Ariane.isoLocalMinute(b.fin),
      actifMin: Math.round(b.actif / 60000),
      details: [...b.det].sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([libelle, ms]) => ({ libelle, min: Math.round(ms / 60000) })),
    }));
  }

  // ── résumés par l'IA : fonctions pures ─────────────────────────────────

  // Les catégories de l'IA, une par ligne : « Nom #couleur : description ».
  // La couleur et la description sont facultatives ; la description dit à
  // l'IA ce que la catégorie recouvre. Une ligne commençant par # est un
  // commentaire.
  static compilerCategoriesIA(texte) {
    const out = [];
    for (const brut of String(texte || '').split('\n')) {
      const l = brut.trim();
      if (!l || l.startsWith('#')) continue;
      const m = /^([^#:]+?)\s*(#[0-9a-f]{3,8})?\s*(?::\s*(.*))?$/i.exec(l);
      if (!m) continue;
      const nom = m[1].trim();
      if (!nom || out.some((c) => c.nom === nom)) continue;
      out.push({ nom, couleur: m[2] || Ariane.couleurActivite(nom), description: (m[3] || '').trim() });
    }
    return out;
  }

  // Ce qui a occupé un créneau [debMs, finMs[, regroupé par application,
  // titre et site, du plus long au plus court : la matière que l'IA résume.
  static contenuActivite(segments, debMs, finMs, max) {
    const parCle = new Map();
    for (const s of (segments || [])) {
      const a = Math.max(s.deb, debMs);
      const b = Math.min(s.fin, finMs);
      if (!(b > a)) continue;
      const m = String(s.url || '').match(/^[a-z][\w+.-]*:\/\/([^/?#]+)/i);
      const domaine = m ? m[1].replace(/^www\./, '') : '';
      const titre = String(s.titre || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const cle = s.app + '\u0001' + titre + '\u0001' + domaine;
      const x = parCle.get(cle) || { app: String(s.app || ''), titre, domaine, ms: 0 };
      x.ms += b - a;
      parCle.set(cle, x);
    }
    return [...parCle.values()].sort((x, y) => y.ms - x.ms).slice(0, max || 15)
      .map((x) => ({ app: x.app, titre: x.titre, domaine: x.domaine, min: Math.max(1, Math.round(x.ms / 60000)) }));
  }

  // L'invite : qui est Monsieur, les catégories avec leur portée, puis les
  // créneaux avec ce qui les a occupés. L'IA rend, pour chacun, une catégorie
  // de la liste et un résumé factuel.
  static promptResumeActivite(blocs, categories, contexte) {
    const l = [];
    l.push('Tu résumes le travail réel d\'une journée, créneau par créneau, à partir du relevé automatique d\'ActivityWatch (application au premier plan, titre de la fenêtre, site web).');
    if (contexte) l.push('Contexte : ' + contexte);
    l.push('');
    l.push('CATÉGORIES (choisis le nom EXACT de l\'une d\'elles) :');
    for (const c of categories) l.push('- ' + c.nom + (c.description ? ' : ' + c.description : ''));
    l.push('');
    l.push('RÈGLES :');
    l.push('- Une seule catégorie par créneau : celle qui domine le temps passé.');
    l.push('- Vie privée et distractions (la catégorie de la liste qui les recouvre) : tout ce qui n\'a rien à voir avec le travail, même bref s\'il domine : achats en ligne, vidéos de divertissement, réseaux sociaux, actualités générales, loisirs, messages privés. Juge sur le titre et le site, pas sur l\'application : une vidéo YouTube de conférence scientifique est du travail, une vidéo de divertissement non.');
    l.push('- Un titre de fenêtre Safari commençant par « Personnel — » vient du profil Safari personnel : indice fort, mais pas une preuve, de navigation privée.');
    l.push('- « loginwindow » est l\'écran verrouillé : ce n\'est pas une activité.');
    l.push('- resume : une phrase factuelle en français, 140 caractères au plus, qui dit ce qui a été fait (par exemple « Animation du TD1 Atelier IA sur Teams, échanges avec les groupes 1 à 6 »). Reprends les noms propres, sigles et intitulés tels qu\'ils apparaissent. N\'invente rien qui ne soit dans le relevé. Pas de tiret cadratin ni demi-cadratin.');
    l.push('- personnel : true si le créneau relève de la vie privée ou de la distraction, sinon false.');
    l.push('');
    l.push('Réponds UNIQUEMENT par un tableau JSON, une entrée par créneau :');
    l.push('[{"id": 1, "categorie": "…", "resume": "…", "personnel": false}]');
    l.push('');
    l.push('CRÉNEAUX :');
    for (const b of blocs) {
      l.push('');
      l.push('id ' + b.id + ' · ' + b.debut.slice(11, 16) + ' à ' + b.fin.slice(11, 16) + ' · ' + b.actifMin + ' min actives');
      for (const x of (b.contenu || [])) {
        l.push('  ' + x.min + ' min | ' + x.app + (x.titre && x.titre !== x.app ? ' | ' + x.titre : '')
          + (x.domaine ? ' | ' + x.domaine : ''));
      }
    }
    return l.join('\n');
  }

  // La réponse de l'IA, vérifiée : une catégorie de la liste (casse et accents
  // près), un résumé nettoyé. Rend Map(id → { categorie, couleur, resume,
  // personnel }) ; une entrée invalide est ignorée.
  static lireResumesActivite(reponse, categories) {
    const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const liste = Array.isArray(reponse) ? reponse
      : (reponse && Array.isArray(reponse.creneaux) ? reponse.creneaux : []);
    const out = new Map();
    for (const r of liste) {
      if (!r || r.id == null) continue;
      const cat = (categories || []).find((c) => norm(c.nom) === norm(r.categorie));
      if (!cat) continue;
      const resume = String(r.resume || '').replace(/\s*[—–]\s*/g, ' : ').replace(/\s+/g, ' ').trim().slice(0, 200);
      out.set(Number(r.id), { categorie: cat.nom, couleur: cat.couleur, resume,
        personnel: r.personnel === true || /^true$/i.test(String(r.personnel)) });
    }
    return out;
  }

  // ── rattachement à des tâches : fonctions pures ─────────────────────────

  // Minutes de recouvrement entre deux intervalles « AAAA-MM-JJTHH:MM ».
  static recouvrementMin(a0, a1, b0, b1) {
    const ms = (x) => new Date(x).getTime();
    return Math.max(0, Math.round((Math.min(ms(a1), ms(b1)) - Math.max(ms(a0), ms(b0))) / 60000));
  }

  // Les tâches dont un créneau PRÉVU recouvre le créneau réel : le
  // rapprochement évident, sans IA. Rend [{ ref, min, raison }].
  static candidatsParCreneauPrevu(bloc, taches) {
    const out = [];
    for (const t of (taches || [])) {
      let min = 0;
      for (const c of Ariane.creneauxDeTache([].concat(t.creneaux || []))) {
        min += Ariane.recouvrementMin(bloc.debut, bloc.fin, c.debut, c.fin);
      }
      if (min >= 5) out.push({ ref: t.ref, min: Math.min(min, bloc.actifMin), raison: tr('créneau prévu à ce moment-là') });
    }
    return out.sort((a, b) => b.min - a.min);
  }

  // L'invite des suggestions de rattachement : les créneaux réels avec leur
  // contenu, et les tâches actives. L'IA rend, pour chaque créneau, zéro à
  // trois tâches avec la part du temps qui leur revient.
  static promptRattachement(blocs, taches, contexte) {
    const l = [];
    l.push('Tu rattaches des créneaux de travail réel (relevés hors d\'Obsidian par ActivityWatch) aux tâches de Monsieur.');
    if (contexte) l.push('Contexte : ' + contexte);
    l.push('');
    l.push('RÈGLES :');
    l.push('- Pour chaque créneau, propose de 0 à 3 tâches de la liste (référence EXACTE), celles auxquelles ce temps a servi.');
    l.push('- part : la fraction du temps actif du créneau qui revient à cette tâche (entre 0 et 1) ; la somme des parts d\'un créneau ne dépasse pas 1.');
    l.push('- raison : en quelques mots, l\'indice qui justifie (titre de fenêtre, site, document, intitulé qui correspond).');
    l.push('- Ne propose une tâche que sur un indice réel. Un créneau de courriels, de messagerie générale ou d\'organisation sans lien net reste sans tâche : rends une liste vide. N\'invente rien.');
    l.push('');
    l.push('Réponds UNIQUEMENT par un tableau JSON :');
    l.push('[{"id": 1, "taches": [{"ref": "T054", "part": 0.6, "raison": "…"}]}]');
    l.push('');
    l.push('TÂCHES ACTIVES :');
    for (const t of taches) {
      l.push('- ' + t.ref + ' : ' + (t.intitule || '') + (t.famille ? ' [' + t.famille + ']' : '')
        + (t.echeance ? ' (échéance ' + t.echeance + ')' : ''));
    }
    l.push('');
    l.push('CRÉNEAUX :');
    for (const b of blocs) {
      l.push('');
      l.push('id ' + b.id + ' · ' + b.debut.slice(0, 10) + ' ' + b.debut.slice(11, 16) + ' à ' + b.fin.slice(11, 16)
        + ' · ' + b.actifMin + ' min actives' + (b.ia && b.ia.resume ? ' · résumé : ' + b.ia.resume : ''));
      for (const x of (b.contenu || [])) {
        l.push('  ' + x.min + ' min | ' + x.app + (x.titre && x.titre !== x.app ? ' | ' + x.titre : '')
          + (x.domaine ? ' | ' + x.domaine : ''));
      }
    }
    return l.join('\n');
  }

  // La réponse vérifiée : seules les références connues, des parts bornées et
  // dont la somme ne dépasse pas 1. Rend Map(id → [{ ref, part, raison }]).
  static lireRattachements(reponse, refsConnues) {
    const connues = new Set(refsConnues || []);
    const liste = Array.isArray(reponse) ? reponse
      : (reponse && Array.isArray(reponse.creneaux) ? reponse.creneaux : []);
    const out = new Map();
    for (const r of liste) {
      if (!r || r.id == null) continue;
      const vus = new Set();
      let taches = (Array.isArray(r.taches) ? r.taches : [])
        .filter((x) => x && connues.has(String(x.ref)) && !vus.has(String(x.ref)) && vus.add(String(x.ref)))
        .slice(0, 3)
        .map((x) => ({ ref: String(x.ref), part: Math.min(1, Math.max(0, Number(x.part) || 0)),
          raison: String(x.raison || '').replace(/\s*[—–]\s*/g, ' : ').trim().slice(0, 140) }))
        .filter((x) => x.part > 0);
      const somme = taches.reduce((s, x) => s + x.part, 0);
      if (somme > 1) taches = taches.map((x) => Object.assign(x, { part: x.part / somme }));
      out.set(Number(r.id), taches);
    }
    return out;
  }

  // Infobulle d'un créneau réel.
  static infobulleActivite(b) {
    const ia = b.ia;
    const lignes = [(ia ? ia.categorie + tr(' (IA)') : b.categorie) + ' · '
      + b.debut.slice(11, 16) + ' → ' + b.fin.slice(11, 16),
      tr('Actif : ') + dureeLisible(b.actifMin)];
    if (ia && ia.resume) lignes.splice(1, 0, ia.resume);
    for (const d of (b.details || [])) {
      if (d.min > 0) lignes.push('• ' + d.libelle + ' (' + dureeLisible(d.min) + ')');
    }
    return lignes.join('\n');
  }

  //#endregion Ariane · static · activité réelle

  //#region Ariane · activité réelle (ActivityWatch)
  // ── activité réelle (ActivityWatch) ──────────────────────────────────────

  // ActivityWatch tourne en local : rien à interroger sur mobile.
  activiteDisponible() {
    return !!(this.settings.activiteActif && obsidian.Platform.isDesktopApp);
  }

  async _awGet(chemin) {
    const base = String(this.settings.activiteUrl || 'http://localhost:5600').trim().replace(/\/+$/, '');
    const rep = await obsidian.requestUrl({ url: base + chemin, method: 'GET', throw: false });
    if (rep.status !== 200) throw new Error('HTTP ' + rep.status);
    return rep.json;
  }

  // Seaux du serveur, gardés cinq minutes.
  async _awBuckets(force) {
    const c = this._awBucketsCache;
    if (!force && c && Date.now() - c.le < 300000) return c.data;
    let hote = '';
    try { hote = require('os').hostname(); } catch (e) { /* pas de module os */ }
    const data = Ariane.choisirBucketsAW(await this._awGet('/api/0/buckets/'), hote);
    this._awBucketsCache = { le: Date.now(), data };
    return data;
  }

  // Segments bruts d'un jour local. Un jour passé ne change plus : il reste en
  // mémoire pour la session. Le jour courant est relu au plus toutes les deux
  // minutes. Un jour futur n'a rien.
  async _segmentsDuJour(jour) {
    const auj = jourIsoDe(new Date());
    if (jour > auj) return [];
    const cache = this._activiteSegments || (this._activiteSegments = new Map());
    const c = cache.get(jour);
    if (c && (jour < auj || Date.now() - c.le < 120000)) return c.segs;
    const d0 = new Date(jour + 'T00:00:00').getTime();
    const d1 = new Date(Ariane.decalerJour(jour, 1) + 'T00:00:00').getTime();
    const b = await this._awBuckets();
    const plage = '/events?limit=-1&start=' + encodeURIComponent(new Date(d0).toISOString())
      + '&end=' + encodeURIComponent(new Date(d1).toISOString());
    const lire = async (ids) => {
      const lots = await Promise.all(ids.map((id) =>
        this._awGet('/api/0/buckets/' + encodeURIComponent(id) + plage)));
      return [].concat(...lots.map((l) => (Array.isArray(l) ? l : [])));
    };
    const [fen, afk, web] = await Promise.all([lire(b.fenetre), lire(b.afk), lire(b.web)]);
    // Safari n'a pas d'extension : ses onglets viennent du relevé d'Ariane.
    const safari = Ariane.ongletsEnEvenements(this.ongletsSafari(), d0, d1);
    const segs = Ariane.segmentsActivite(fen, b.afk.length ? afk : null, web.concat(safari), d0, d1);
    cache.set(jour, { le: Date.now(), segs });
    return segs;
  }

  // Signature des réglages dont dépend l'agrégation : la changer invalide les
  // créneaux calculés, pas les segments lus.
  _signatureActivite() {
    const s = this.settings;
    return [s.activiteRegles, s.activiteAutre, s.activiteGrainMin, s.activiteDureeMin].join('\u0001');
  }

  // Créneaux réels de plusieurs jours : Map(jour → créneaux). Trois jours lus
  // à la fois. Un serveur injoignable donne une Map vide et un avis, une fois.
  async activitePlage(jours) {
    const out = new Map();
    if (!this.activiteDisponible()) return out;
    const sig = this._signatureActivite();
    if (!this._activiteRegles || this._activiteRegles.sig !== sig) {
      this._activiteRegles = { sig, regles: Ariane.compilerReglesActivite(this.settings.activiteRegles) };
      this._activiteBlocs = new Map();
    }
    const regles = this._activiteRegles.regles;
    const file = (jours || []).slice();
    const traiter = async (jour) => {
      const segs = await this._segmentsDuJour(jour);
      const memo = this._activiteBlocs.get(jour);
      if (memo && memo.segs === segs) { out.set(jour, this._decorerResumes(jour, memo.blocs)); return; }
      const d0 = new Date(jour + 'T00:00:00').getTime();
      const d1 = new Date(Ariane.decalerJour(jour, 1) + 'T00:00:00').getTime();
      const blocs = Ariane.agregerActivite(segs, regles, {
        d0, d1,
        grainMin: this.settings.activiteGrainMin,
        dureeMin: this.settings.activiteDureeMin,
        autre: this.settings.activiteAutre,
      });
      this._activiteBlocs.set(jour, { segs, blocs });
      out.set(jour, this._decorerResumes(jour, blocs));
    };
    await this._chargerResumesActivite();
    try {
      while (file.length) await Promise.all(file.splice(0, 3).map(traiter));
      this._activiteErreur = '';
      if (this.settings.activiteIAAuto) this._resumerAuto(out);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (this._activiteErreur !== msg) {
        this._activiteErreur = msg;
        new obsidian.Notice(tr('ActivityWatch injoignable : ') + msg, 6000);
      }
    }
    return out;
  }

  // Relit le jour courant dans les calendriers ouverts. Les jours passés
  // restent en mémoire : seul aujourd'hui est redemandé au serveur. Tout
  // oublier (réglage changé, test) relit tout et réautorise l'avis d'erreur ;
  // la relecture périodique, elle, ne le répète pas toutes les cinq minutes.
  _rafraichirActivite(toutOublier) {
    if (toutOublier) {
      this._activiteSegments = null;
      this._awBucketsCache = null;
      this._activiteErreur = '';
    }
    const dispo = this.activiteDisponible();
    for (const m of (this._moteursCalendrier || [])) {
      try {
        m._activiteCle = null;
        // Désactivée : la colonne déjà dessinée doit disparaître tout de suite.
        if (!dispo) { m._activite = new Map(); m.dessiner(); } else if (m._chargerActivite) m._chargerActivite();
      } catch (e) { /* vue fermée */ }
    }
  }

  // ── résumés par l'IA ───────────────────────────────────────────────────
  //  Chaque créneau réel peut recevoir de l'IA une catégorie (parmi celles des
  //  réglages, dont une pour la vie privée et les distractions) et une phrase
  //  qui dit ce qui a été fait. Les résumés sont gardés dans activite-ia.json,
  //  dans le dossier du greffon, par jour et bornes du créneau : un créneau
  //  déjà résumé ne repasse pas par l'IA. Avec un fournisseur en ligne
  //  (Mistral, Claude), titres de fenêtres et sites lui sont envoyés.

  get cheminResumesActivite() {
    const dossier = (this.manifest && this.manifest.dir) || '.obsidian/plugins/obsidian-ariane';
    return dossier + '/activite-ia.json';
  }

  static cleBlocActivite(jour, b) { return jour + '|' + b.debut + '|' + b.fin; }

  async _chargerResumesActivite() {
    if (this._resumesActivite) return;
    this._resumesActivite = {};
    const a = this.app.vault.adapter;
    try {
      if (await a.exists(this.cheminResumesActivite)) {
        const j = JSON.parse(await a.read(this.cheminResumesActivite));
        if (j && typeof j === 'object') this._resumesActivite = j;
      }
    } catch (e) { console.warn('[Ariane] résumés d\'activité illisibles :', e); }
  }

  _sauverResumesActivite() {
    this.antirebond('activite-ia', async () => {
      try {
        await this.app.vault.adapter.write(this.cheminResumesActivite,
          JSON.stringify(this._resumesActivite || {}));
      } catch (e) { console.warn('[Ariane] résumés d\'activité non écrits :', e); }
    }, 1500);
  }

  categoriesIA() {
    return Ariane.compilerCategoriesIA(this.settings.activiteCategoriesIA);
  }

  // Les créneaux d'un jour, avec leur résumé s'il existe, et la couleur de sa
  // catégorie (celle des réglages, qui a pu changer depuis).
  _decorerResumes(jour, blocs) {
    const r = this._resumesActivite || {};
    const cats = this.categoriesIA();
    const colorer = this.settings.activiteIACouleur !== false;
    const index = this.indexTempsReel();
    return blocs.map((b0) => {
      const empreinte = Ariane.empreinteActivite(b0.debut);
      const b = Object.assign({}, b0, { empreinte, rattache: index.get(empreinte) || [] });
      const cle = Ariane.cleBlocActivite(jour, b);
      const ia = r[cle];
      if (!ia) return Object.assign({}, b, { cle });
      const cat = cats.find((c) => c.nom === ia.categorie);
      return Object.assign({}, b, { cle, ia,
        couleur: colorer ? ((cat && cat.couleur) || ia.couleur || b.couleur) : b.couleur });
    });
  }

  // L'appel à l'IA choisie pour les résumés (ou celle de l'assistant).
  async _genererActiviteIA(prompt, max) {
    const s = this.settings;
    const f = s.activiteIAFournisseur || s.refsFournisseur || 'ollama';
    const modele = (s.activiteIAModele || '').trim() || s.refsModele || 'llama3.2';
    this._diagIA = '';
    const brut = await this.genererAvecFournisseur(prompt, max, f, modele,
      { modeleClaude: s.activiteIAModeleClaude || 'haiku', delai: 240000 });
    if (!brut) {
      throw new Error((this._diagIA || tr('aucune réponse')) + ' (' + f + ')');
    }
    const j = Ariane.extraireJson(brut);
    if (!j) throw new Error(tr('réponse illisible (JSON attendu)'));
    return j;
  }

  // Résume les créneaux d'un jour qui ne l'ont pas encore été (ou celui de
  // `o.cle`, même déjà résumé). Rend le nombre de créneaux résumés.
  async resumerActivite(jour, o) {
    const opt = o || {};
    if (!this.activiteDisponible()) return 0;
    await this._chargerResumesActivite();
    const cats = this.categoriesIA();
    if (!cats.length) { new obsidian.Notice(tr('Aucune catégorie pour l\'IA : voir Réglages > Temps passé.')); return 0; }
    const blocs = (await this.activitePlage([jour])).get(jour) || [];
    const segs = await this._segmentsDuJour(jour);
    const r = this._resumesActivite;
    const vises = blocs.filter((b) => (opt.cle ? b.cle === opt.cle : !r[b.cle]));
    if (!vises.length) {
      if (!opt.silencieux) new obsidian.Notice(tr('Rien à résumer ce jour-là.'));
      return 0;
    }
    const avis = opt.silencieux ? null
      : new obsidian.Notice(tr('Résumé de l\'activité (') + vises.length + tr(' créneau(x))…'), 0);
    let n = 0;
    try {
      for (let i = 0; i < vises.length; i += 12) {
        const lot = vises.slice(i, i + 12).map((b, k) => Object.assign({}, b, { id: k + 1,
          contenu: Ariane.contenuActivite(segs, new Date(b.debut).getTime(),
            new Date(b.fin).getTime() + 60000, 15) }));
        const prompt = Ariane.promptResumeActivite(lot, cats, this.settings.activiteIAContexte);
        const rep = await this._genererActiviteIA(prompt, 300 + 120 * lot.length);
        const lus = Ariane.lireResumesActivite(rep, cats);
        const modele = this.settings.activiteIAFournisseur || this.settings.refsFournisseur || '';
        for (const b of lot) {
          const x = lus.get(b.id);
          if (!x) continue;
          r[b.cle] = Object.assign(x, { modele, le: jourIsoDe(new Date()) });
          n += 1;
        }
      }
    } catch (e) {
      if (avis) avis.hide();
      new obsidian.Notice(tr('Résumé de l\'activité impossible : ') + ((e && e.message) || e), 10000);
      return n;
    }
    if (avis) avis.hide();
    this._sauverResumesActivite();
    this._rafraichirActivite(false);
    if (!opt.silencieux) new obsidian.Notice(n + tr(' créneau(x) résumé(s).'));
    return n;
  }

  // Les jours visibles d'un calendrier ouvert, sinon la semaine en cours.
  async resumerSemaineAffichee() {
    let jours = [];
    for (const m of (this._moteursCalendrier || [])) {
      if (Array.isArray(m._joursSemaine) && m._joursSemaine.length) { jours = m._joursSemaine; break; }
    }
    if (!jours.length) {
      const lundi = Ariane.grilleSemaine(jourIsoDe(new Date())).lundi;
      for (let i = 0; i < 7; i++) jours.push(Ariane.decalerJour(lundi, i));
    }
    const auj = jourIsoDe(new Date());
    let n = 0;
    for (const j of jours) if (j <= auj) n += await this.resumerActivite(j, { silencieux: true });
    new obsidian.Notice(n + tr(' créneau(x) résumé(s) sur la semaine.'));
  }

  // ── icônes des applications ────────────────────────────────────────────
  //  Les icônes que macOS montre dans le Finder, extraites une fois (AppKit,
  //  par osascript), réduites à 64 px (sips) et gardées dans icones-apps/ du
  //  dossier du greffon. iconeApplication() rend tout de suite ce qui est
  //  connu, et demande le reste : `apres` est rappelé quand il arrive.

  get dossierIconesApps() {
    const dossier = (this.manifest && this.manifest.dir) || '.obsidian/plugins/obsidian-ariane';
    return dossier + '/icones-apps';
  }

  static nomFichierIcone(nom) { return String(nom || '').replace(/[\/:\\]/g, '_') + '.png'; }

  iconeApplication(nom, apres) {
    if (!nom || !obsidian.Platform.isMacOS) return '';
    if (!this._iconesApps) {
      this._iconesApps = new Map();
      this._iconesInventaire = this.app.vault.adapter.list(this.dossierIconesApps)
        .then((l) => {
          for (const f of (l.files || [])) {
            const n = f.split('/').pop().replace(/\.png$/, '');
            if (!this._iconesApps.has(n)) this._iconesApps.set(n, this.app.vault.adapter.getResourcePath(f));
          }
        }).catch(() => { /* dossier pas encore créé */ });
    }
    const cle = Ariane.nomFichierIcone(nom).replace(/\.png$/, '');
    if (this._iconesApps.has(cle)) return this._iconesApps.get(cle);
    (this._iconesAttente || (this._iconesAttente = new Map())).set(nom, apres);
    clearTimeout(this._iconesMinuterie);
    this._iconesMinuterie = setTimeout(() => this._extraireIconesApps(), 30);
    return '';
  }

  async _extraireIconesApps() {
    const attente = this._iconesAttente || new Map();
    this._iconesAttente = new Map();
    if (this._iconesInventaire) await this._iconesInventaire;
    const noms = [...attente.keys()].filter((n) => !this._iconesApps.has(Ariane.nomFichierIcone(n).replace(/\.png$/, '')));
    const rappeler = () => { for (const f of attente.values()) { try { if (f) f(); } catch (e) { /* vue fermée */ } } };
    if (!noms.length) { rappeler(); return; }
    // Rien ne se retente dans la session : une application introuvable reste
    // sans icône (repli sur l'initiale).
    for (const n of noms) this._iconesApps.set(Ariane.nomFichierIcone(n).replace(/\.png$/, ''), '');
    const a = this.app.vault.adapter;
    try { if (!(await a.exists(this.dossierIconesApps))) await a.mkdir(this.dossierIconesApps); } catch (e) { return; }
    const absolu = a.getFullPath ? a.getFullPath(this.dossierIconesApps) : '';
    if (!absolu) return;
    const script = [
      "ObjC.import('AppKit');",
      'function run(argv) {',
      '  var dossier = argv[0], ws = $.NSWorkspace.sharedWorkspace, out = [];',
      '  for (var i = 1; i < argv.length; i++) {',
      '    var nom = argv[i];',
      '    try {',
      '      var chemin = ObjC.unwrap(ws.fullPathForApplication(nom));',
      '      if (!chemin) continue;',
      '      var img = ws.iconForFile(chemin);',
      '      var bmp = $.NSBitmapImageRep.alloc.initWithCGImage(img.CGImageForProposedRectContextHints($(), $(), $()));',
      '      var png = bmp.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));',
      "      var cible = dossier + '/' + nom.replace(/[\\/:\\\\]/g, '_') + '.png';",
      '      if (png.writeToFileAtomically(cible, true)) out.push(nom + "\\t" + cible);',
      '    } catch (e) {}',
      '  }',
      '  return out.join("\\n");',
      '}',
    ].join('\n');
    const cp = require('child_process');
    const sortie = await new Promise((res) => cp.execFile('osascript', ['-l', 'JavaScript', '-e', script, absolu].concat(noms),
      { timeout: 30000 }, (err, out) => res(err ? '' : String(out || ''))));
    const faits = sortie.split('\n').map((l) => l.split('\t')).filter((p) => p[1]);
    if (faits.length) {
      await new Promise((res) => cp.execFile('sips', ['-Z', '64'].concat(faits.map((p) => p[1])),
        { timeout: 30000 }, () => res()));
    }
    for (const [nom] of faits) {
      const f = this.dossierIconesApps + '/' + Ariane.nomFichierIcone(nom);
      this._iconesApps.set(Ariane.nomFichierIcone(nom).replace(/\.png$/, ''), a.getResourcePath(f) + '?v=' + Date.now());
    }
    rappeler();
  }

  // Le temps d'un créneau par application, de la plus longue à la plus
  // courte, avec ce qui l'a le plus occupée : la carte de survol.
  async applicationsBlocActivite(jour, b) {
    const contenu = await this.contenuBlocActivite(jour, b);
    const parApp = new Map();
    for (const x of contenu) {
      const p = parApp.get(x.app) || { app: x.app, min: 0, principal: '' };
      p.min += x.min;
      if (!p.principal) p.principal = x.domaine || (x.titre && x.titre !== x.app ? x.titre : '');
      parApp.set(x.app, p);
    }
    return [...parApp.values()].sort((x, y) => y.min - x.min);
  }

  // ── rattachement du temps réel aux tâches ──────────────────────────────
  //  La note de tâche porte la référence (« Temps réel », une ligne par
  //  créneau rattaché, terminée par l'empreinte du créneau) : c'est elle qui
  //  fait foi. Le calendrier en tire l'index inverse à chaque lecture.

  indexTempsReel() {
    const idx = new Map();
    for (const t of this.tachesPourGantt()) {
      for (const r of (t.tempsReel || [])) {
        if (!idx.has(r.id)) idx.set(r.id, []);
        idx.get(r.id).push({ ref: t.ref, intitule: t.intitule, min: r.min, ligne: Ariane.formatTempsReel(r) });
      }
    }
    return idx;
  }

  // Écrit (ou retire, `ligne` vide) la ligne de l'empreinte `id` dans la
  // propriété « Temps réel » d'une tâche. Rend la ligne qui s'y trouvait.
  async ecrireTempsReel(ref, id, ligne) {
    const f = this.fichierDeRef(ref);
    if (!f) return null;
    const cle = this.cleT('temps-reel');
    let avant = null;
    this.marquerEcriture(f.path);
    if (this.marquerOrigineTache) this.marquerOrigineTache(f.path);
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      const brut = [].concat(this._lireT(fm, 'temps-reel') || []).map(String).filter(Boolean);
      const garde = [];
      for (const l of brut) {
        const x = Ariane.lireTempsReel(l);
        if (x && x.id === id) { avant = l; continue; }
        garde.push(l);
      }
      if (ligne) garde.push(ligne);
      garde.sort();
      fm[cle] = garde;
    });
    return avant;
  }

  // Applique une liste d'opérations { ref, id, apres } et rend celles qui les
  // annulent (pour ⌘Z).
  async appliquerRattachements(ops) {
    const inverse = [];
    for (const o of (ops || [])) {
      const avant = await this.ecrireTempsReel(o.ref, o.id, o.apres || '');
      inverse.push({ ref: o.ref, id: o.id, apres: avant || '' });
    }
    this._rafraichirActivite(false);
    return inverse;
  }

  // Tâches actives, pour les suggestions.
  tachesRattachables() {
    return this.tachesPourGantt()
      .filter((t) => t.statut !== 'terminée' && t.statut !== 'abandonnée' && !t.jalon);
  }

  // Les candidats d'un créneau réel : ses rattachements actuels, puis les
  // tâches au créneau prévu à ce moment-là, puis celles dont la note a été
  // ouverte pendant ce temps dans Obsidian.
  candidatsRattachement(bloc) {
    const taches = this.tachesRattachables();
    const out = [];
    const ajouter = (c) => { if (!out.some((x) => x.ref === c.ref)) out.push(c); };
    for (const r of (bloc.rattache || [])) ajouter({ ref: r.ref, min: r.min, raison: tr('déjà rattaché'), coche: true });
    for (const c of Ariane.candidatsParCreneauPrevu(bloc, taches)) ajouter(Object.assign(c, { coche: !bloc.rattache || !bloc.rattache.length }));
    if (this.sessionsTravail) {
      const sessions = this.sessionsTravail();
      for (const t of taches) {
        const chemins = [t.fichier && t.fichier.path].concat(this._cheminsLiesTache(t)).filter(Boolean);
        let min = 0;
        for (const x of sessions) {
          if (!chemins.includes(x.chemin)) continue;
          min += Ariane.recouvrementMin(bloc.debut, bloc.fin, x.debut.slice(0, 16), x.fin.slice(0, 16));
        }
        if (min >= 2) ajouter({ ref: t.ref, min: Math.min(bloc.actifMin, min), raison: tr('sa note était ouverte dans Obsidian'), coche: false });
      }
    }
    return out;
  }

  // Suggestions de l'IA pour une liste de créneaux d'un même jour. Rend
  // Map(empreinte → [{ ref, min, raison }]).
  async suggererRattachements(jour, blocs) {
    const taches = this.tachesRattachables();
    if (!taches.length || !blocs.length) return new Map();
    const segs = await this._segmentsDuJour(jour);
    const lot = blocs.map((b, k) => Object.assign({}, b, { id: k + 1,
      contenu: Ariane.contenuActivite(segs, new Date(b.debut).getTime(), new Date(b.fin).getTime() + 60000, 12) }));
    const prompt = Ariane.promptRattachement(lot, taches.slice(0, 80), this.settings.activiteIAContexte);
    const rep = await this._genererActiviteIA(prompt, 200 + 150 * lot.length);
    const lus = Ariane.lireRattachements(rep, taches.map((t) => t.ref));
    const out = new Map();
    for (const b of lot) {
      out.set(b.empreinte, (lus.get(b.id) || []).map((x) => ({ ref: x.ref,
        min: Math.max(1, Math.round(x.part * b.actifMin)), raison: x.raison })));
    }
    return out;
  }

  // Tout ce qui a occupé un créneau réel, pour sa fiche.
  async contenuBlocActivite(jour, b) {
    const segs = await this._segmentsDuJour(jour);
    return Ariane.contenuActivite(segs, new Date(b.debut).getTime(), new Date(b.fin).getTime() + 60000, 25);
  }

  // Catégorie choisie à la main : gardée comme un résumé, marquée « manuel ».
  async corrigerCategorieActivite(cle, nom) {
    await this._chargerResumesActivite();
    const cat = this.categoriesIA().find((c) => c.nom === nom);
    if (!cat || !cle) return;
    const r = this._resumesActivite;
    const av = r[cle] || {};
    r[cle] = { categorie: cat.nom, couleur: cat.couleur, resume: av.resume || '',
      personnel: /personnel|distraction|priv/i.test(cat.nom), manuel: true, le: jourIsoDe(new Date()) };
    this._sauverResumesActivite();
    this._rafraichirActivite(false);
  }

  oublierResumesActivite(cle) {
    const r = this._resumesActivite || {};
    if (cle) delete r[cle]; else this._resumesActivite = {};
    this._sauverResumesActivite();
    this._rafraichirActivite(false);
  }

  // Résumé automatique : seulement les journées passées (closes), une à la
  // fois, une fois par session.
  _resumerAuto(parJour) {
    const auj = jourIsoDe(new Date());
    if (!this._iaJoursTentes) this._iaJoursTentes = new Set();
    for (const [jour, blocs] of parJour) {
      if (jour >= auj || this._iaJoursTentes.has(jour)) continue;
      if (!blocs.some((b) => !b.ia)) continue;
      this._iaJoursTentes.add(jour);
      this._iaFile = (this._iaFile || Promise.resolve())
        .then(() => this.resumerActivite(jour, { silencieux: true }))
        .catch(() => { /* signalé par resumerActivite */ });
    }
  }

  // Une saisie dans les règles ne relance le calcul qu'une fois la frappe
  // finie : chaque touche ne doit pas redessiner les calendriers.
  _rafraichirActiviteDiffere() {
    clearTimeout(this._activiteMinuterie);
    this._activiteMinuterie = setTimeout(() => this._rafraichirActivite(false), 1200);
  }

  // Le jour courant avance : toutes les cinq minutes, les calendriers ouverts
  // relisent aujourd'hui, et ne se redessinent que si quelque chose a changé.
  demarrerActivite() {
    this.registerInterval(window.setInterval(() => {
      if (this.activiteDisponible()) this._rafraichirActivite(false);
      this.demarrerReleveSafari();
    }, 300000));
    this.demarrerReleveSafari();
    this.register(() => this.arreterReleveSafari());
  }

  // ── onglets de Safari ──────────────────────────────────────────────────
  //  ActivityWatch 0.13 sait lire l'adresse de l'onglet Safari, mais il est
  //  signé sans le droit de piloter une autre application : macOS refuse ses
  //  demandes en silence, sans jamais rien proposer. Ariane fait donc ce
  //  relevé elle-même, depuis Obsidian (qui a ce droit) : un petit script
  //  osascript qui vit à côté d'Obsidian, lit toutes les cinq secondes
  //  l'onglet actif de Safari quand Safari tourne (jamais il ne le lance),
  //  et n'écrit qu'aux changements. Les relevés restent sur l'ordinateur,
  //  dans onglets-safari.jsonl du dossier du greffon.

  get cheminOngletsSafari() {
    const dossier = (this.manifest && this.manifest.dir) || '.obsidian/plugins/obsidian-ariane';
    return dossier + '/onglets-safari.jsonl';
  }

  // Tous les onglets relevés, celui en cours compris (jusqu'à maintenant).
  ongletsSafari() {
    const l = (this._ongletsSafari || []).slice();
    const c = this._ongletSafariCourant;
    if (c && c.url) l.push({ debut: c.debut, fin: Date.now(), url: c.url, titre: c.titre });
    return l;
  }

  async _chargerOngletsSafari() {
    if (this._ongletsSafari) return;
    this._ongletsSafari = [];
    const a = this.app.vault.adapter;
    let brut = '';
    try { if (await a.exists(this.cheminOngletsSafari)) brut = await a.read(this.cheminOngletsSafari); } catch (e) { brut = ''; }
    // Deux mois suffisent au calendrier.
    const seuil = Date.now() - 62 * 86400000;
    for (const l of brut.split('\n')) {
      if (!l.trim()) continue;
      try {
        const x = JSON.parse(l);
        if (x && x.fin > seuil && x.url) this._ongletsSafari.push(x);
      } catch (e) { /* ligne abîmée : passée */ }
    }
  }

  _noterLigneSafari(ligne) {
    const x = Ariane.lireLigneSafari(ligne);
    if (!x) return;
    if (x.erreur) {
      if (!this._safariRefusSignale) {
        this._safariRefusSignale = true;
        new obsidian.Notice(tr('Ariane ne peut pas lire les onglets de Safari : autorisez Obsidian à contrôler Safari (Réglages Système > Confidentialité et sécurité > Automatisation).'), 15000);
      }
      return;
    }
    const c = this._ongletSafariCourant;
    if (c && c.url && x.ms - c.debut >= 5000) {
      const rec = { debut: c.debut, fin: x.ms, url: c.url, titre: c.titre };
      this._ongletsSafari.push(rec);
      const a = this.app.vault.adapter;
      const p = this.cheminOngletsSafari;
      (async () => {
        const l = JSON.stringify(rec) + '\n';
        if (await a.exists(p)) await a.append(p, l); else await a.write(p, l);
      })().catch((e) => console.warn('[Ariane] onglets Safari :', e));
    }
    this._ongletSafariCourant = x.url ? { debut: x.ms, url: x.url, titre: x.titre || '' } : null;
  }

  async demarrerReleveSafari() {
    if (this._releveSafari || !this.activiteDisponible() || !obsidian.Platform.isMacOS) return;
    if (this.settings.activiteSafari === false) return;
    await this._chargerOngletsSafari();
    const script = [
      'var safari = Application("Safari");',
      'var sortie = $.NSFileHandle.fileHandleWithStandardOutput;',
      'function ecrire(s) { sortie.writeData($(s + "\\n").dataUsingEncoding($.NSUTF8StringEncoding)); }',
      'var avant = null;',
      'while (true) {',
      '  var cle = "-";',
      '  try {',
      '    if (safari.running() && safari.windows.length) {',
      '      var t = safari.windows[0].currentTab();',
      '      cle = "T\\t" + (t.url() || "") + "\\t" + String(t.name() || "").replace(/[\\t\\n]/g, " ");',
      '    }',
      '  } catch (e) {',
      '    if (/-1743|not allowed|autoris/i.test(String(e))) { ecrire("E\\tREFUS"); delay(120); continue; }',
      '  }',
      '  if (cle !== avant) {',
      '    var i = cle.indexOf("\\t");',
      '    ecrire(i < 0 ? cle + "\\t" + Date.now() : cle.slice(0, i) + "\\t" + Date.now() + cle.slice(i));',
      '    avant = cle;',
      '  }',
      '  delay(5);',
      '}',
    ].join('\n');
    let enfant;
    try {
      enfant = require('child_process').spawn('osascript', ['-l', 'JavaScript', '-e', script],
        { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { console.warn('[Ariane] relevé Safari :', e); return; }
    this._releveSafari = enfant;
    let tampon = '';
    enfant.stdout.setEncoding('utf8');
    enfant.stdout.on('data', (morceau) => {
      tampon += morceau;
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const l = tampon.slice(0, i);
        tampon = tampon.slice(i + 1);
        this._noterLigneSafari(l);
      }
    });
    enfant.on('exit', () => {
      if (this._releveSafari === enfant) this._releveSafari = null;
      // L'onglet en cours se clôt ; le relevé repart au prochain battement
      // de cinq minutes s'il le faut.
      this._noterLigneSafari('-\t' + Date.now());
    });
  }

  arreterReleveSafari() {
    const e = this._releveSafari;
    this._releveSafari = null;
    if (e) { try { e.kill(); } catch (x) { /* déjà fini */ } }
    this._noterLigneSafari('-\t' + Date.now());
  }

  // Bouton « Tester » des réglages : ce que le serveur expose, en clair.
  async testerActivityWatch() {
    try {
      const b = await this._awBuckets(true);
      if (!b.fenetre.length) {
        return tr("ActivityWatch répond, mais aucun seau de fenêtres n'existe : aw-watcher-window tourne-t-il ?");
      }
      // Les adresses des onglets peuvent venir du relevé des fenêtres (Safari,
      // Chrome sur macOS) : on regarde ce qu'il a noté récemment.
      let nav = 0;
      let avecAdresse = 0;
      try {
        const ev = await this._awGet('/api/0/buckets/' + encodeURIComponent(b.fenetre[0]) + '/events?limit=300');
        for (const e of (ev || [])) {
          const d = (e && e.data) || {};
          if (!/chrome|chromium|safari|firefox|arc\b|brave|edge|vivaldi|opera|orion|zen\b/i.test(String(d.app || ''))) continue;
          nav += 1;
          if (String(d.url || '').trim()) avecAdresse += 1;
        }
      } catch (e) { /* relevé illisible : on n'en dit rien */ }
      let web;
      if (this.ongletsSafari().length) web = tr('onglets de Safari relevés par Ariane.');
      else if (b.web.length) web = b.web.length + tr(' extension(s) de navigateur.');
      else if (avecAdresse) web = tr('adresses des onglets lues par le relevé des fenêtres.');
      else if (nav) web = tr('onglets du navigateur sans adresse : autorisez ActivityWatch à piloter le navigateur (Réglages Système > Confidentialité et sécurité > Automatisation).');
      else web = tr('aucun navigateur relevé.');
      return tr('ActivityWatch joint') + (b.hote ? ' (' + b.hote + ')' : '') + ' : '
        + b.fenetre.length + tr(' seau(x) de fenêtres, ')
        + (b.afk.length ? tr("absence détectée, ") : tr("pas de seau d'absence, ")) + web;
    } catch (e) {
      return tr('ActivityWatch injoignable : ') + ((e && e.message) || String(e));
    }
  }

  //#endregion Ariane · activité réelle (ActivityWatch)
};
