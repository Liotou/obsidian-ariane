
// ── avecTachesStatiques ───────────────────────────────────────────────────
// Domaine : tâches (frise, articulation, calendrier).
// Fonctions pures des tâches : clés, statuts, familles, cohérence.
const avecTachesStatiques = (Base) => class extends Base {
  //#region Ariane · static · tâches
  // ── static · tâches ──────────────────────────────────────────────────────

  // Nom lisible d'un concept de tâche. C'est TOUJOURS ce nom qui sert de base
  // à la clé de frontmatter (« Échéance », pas « echeance ») ; l'utilisateur
  // n'a pas à choisir.
  static libelleConcept(concept) {
    const d = Ariane.PROPS_GENERIQUES.find((p) => p.cle === concept);
    if (d) return tr(d.defaut);
    return ({
      'bloque-par': 'Bloquée par', 'termine-le': 'Terminée le',
      source: 'Source', livrable: 'Livrable', fichier: 'Fichier',
      liste: 'Liste', 'rappel-id': 'Rappel ID', 'agenda-id': 'Agenda ID',
    })[concept] || concept;
  }

  // Clé de frontmatter d'un concept de tâche. Règle UNIQUE :
  //   clé = `prefixe` + label
  //   label = `cles[concept]` si l'utilisateur l'a personnalisé,
  //           sinon le nom lisible par défaut.
  // Le préfixe s'applique TOUJOURS, à toutes les propriétés de la même façon.
  // (`intitule` reste à part : il vit dans `aliases`.)
  static cleTache(concept, opts) {
    if (concept === 'intitule') return 'intitule';
    const o = opts || {};
    const perso = String((o.cles || {})[concept] || '').trim();
    const label = perso || Ariane.libelleConcept(concept);
    return (o.prefixe || '') + label;
  }

  // La famille d'une tâche n'est pas déclarée, elle se déduit du champ rempli.
  // Un champ « famille » pourrait contredire les champs présents ; son absence
  // rend la contradiction impossible.
  // L'ordre est aussi celui de la priorité quand plusieurs sont remplis.
  static champTache(fm) {
    const ordre = ['source', 'livrable', 'fichier'];
    const remplis = ordre.filter((c) => fm && String(fm[c] == null ? '' : fm[c]).trim());
    return { retenu: remplis[0] || null, conflits: remplis.length > 1 ? remplis : [] };
  }

  static familleTache(fm, familles, defaut) {
    const liste = Array.isArray(familles) ? familles : null;
    // Appel historique (un seul argument) : on garde la déduction d'origine.
    if (!liste) {
      const retenu = Ariane.champTache(fm).retenu;
      if (retenu === 'source') return 'lecture';
      return retenu ? 'production' : 'action';
    }
    const connus = new Set(liste.map((f) => f && f.id).filter(Boolean));
    const explicite = fm && fm.famille ? String(fm.famille).trim() : '';
    if (explicite && connus.has(explicite)) return explicite;
    const retenu = Ariane.champTache(fm).retenu;
    if (retenu === 'source' && connus.has('lecture')) return 'lecture';
    if (retenu && connus.has('production')) return 'production';
    return (defaut && connus.has(defaut)) ? defaut
      : (connus.has('action') ? 'action' : (liste[0] && liste[0].id) || 'action');
  }

  // Les propriétés qu'une famille ajoute à une tâche et qui n'existent pas
  // encore dans son entête. « Existe » = la clé est présente, même vide, sous
  // sa forme nue OU préfixée (une famille peut nommer « Source » quand la
  // tâche porte déjà « Tâche - Source » : ne pas dupliquer).
  static proprietesManquantes(fm, famille, prefixe) {
    const props = (famille && Array.isArray(famille.proprietes)) ? famille.proprietes : [];
    const cles = new Set(Object.keys(fm || {}));
    const pre = prefixe || '';
    return props
      .filter((p) => p && p.cle && !cles.has(p.cle) && !(pre && cles.has(pre + p.cle)))
      .map((p) => ({ cle: pre ? pre + p.cle : p.cle, type: p.type || 'texte' }));
  }

  // Une valeur YAML citée. Les intitulés portent des apostrophes, des deux
  // points et des guillemets typographiques : les citer systématiquement évite
  // d'avoir à décider au cas par cas.
  static yamlChaine(v) {
    const s = String(v == null ? '' : v);
    if (!s) return '';
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  // Le corps d'une note de tâche neuve. Tous les champs du schéma sont émis,
  // y compris vides : l'éditeur de propriétés d'Obsidian ne montre que ce qui
  // existe, et une tâche dont les champs manquent est une tâche qu'on ne pense
  // pas à remplir. Un champ vide s'écrit sans espace en fin de ligne, que
  // certains éditeurs suppriment et qui ferait alors diverger le fichier.
  static corpsNouvelleTache(champs) {
    const c = champs || {};
    const q = Ariane.yamlChaine;
    const ligne = (cle, val) => cle + ':' + (val ? ' ' + val : '');
    // Clés personnalisées éventuelles : c.cles = { concept: 'nom réel', … }.
    const K = (concept) => (c.cles && c.cles[concept]) || concept;
    const intitule = c.intitule || 'Sans titre';
    const jour = c.aujourdhui || '';
    const l = [];
    l.push('---');
    l.push('aliases:');
    l.push('  - ' + q(intitule));
    l.push('Type: tache');
    l.push(ligne(K('famille'), c.famille));
    l.push(ligne(K('statut'), c.statut || 'à faire'));
    l.push(K('terminee') + ': ' + ((c.statut || '') === 'terminée' ? 'true' : 'false'));
    l.push(ligne(K('priorite'), c.priorite));
    l.push(ligne(K('debut'), c.debut));
    l.push(ligne(K('echeance'), c.echeance));
    l.push(ligne(K('heure'), c.heure));
    // Dérivé, tenu à jour par Ariane : vrai tant qu'il n'y a pas d'échéance.
    l.push(K('sans-echeance') + ': ' + (c.echeance ? 'false' : 'true'));
    l.push(K('creneaux') + ': []');
    l.push(K('avancement') + ': ' + (Number(c.avancement) || 0));
    l.push(K('termine-le') + ':');
    l.push(K('jalon') + ': ' + (c.jalon ? 'true' : 'false'));
    l.push(K('parent') + ':');
    l.push(K('bloque-par') + ': []');
    l.push(ligne(K('source'), q(c.source)));
    l.push(ligne(K('livrable'), q(c.livrable)));
    l.push(ligne(K('fichier'), q(c.fichier)));
    l.push(ligne(K('liste'), q(c.liste)));
    l.push(K('rappel-id') + ':');
    l.push(K('agenda-id') + ': []');
    l.push(ligne('cree', jour));
    l.push(ligne('modifie', jour));
    // Le titre suit directement les propriétés : pas de ligne vide entre
    // les deux, qu'Obsidian affiche comme un blanc sous l'en-tête.
    l.push('---');
    l.push('# ' + intitule);
    l.push('');
    l.push('## Note de travail');
    l.push('');
    l.push('## Journal');
    l.push('');
    return l.join('\n');
  }

  // Le corps d'une note neuve associée à un événement Apple Calendrier (clic
  // droit sur un événement de la vue calendrier — pas un créneau de tâche :
  // ça reste un événement, pas quelque chose à faire). Note libre, sans
  // frontmatter de tâche ; `Événement ID` la relie à l'événement d'origine
  // pour qui veut le retrouver, sans les synchros d'un jalon — une note n'a
  // pas de date à tenir à jour.
  // Une tâche relève-t-elle d'Apple Rappels ? Une échéance suffit, un rappel
  // déjà lié aussi. Et une synchronisation passée, enfin : une tâche revenue
  // d'« abandonnée » n'a plus ni rappel ni, parfois, d'échéance, mais elle
  // avait bien un rappel avant qu'on le retire, et doit le retrouver.
  static rappelConcerne(statut, echeance, rappelId, instantane) {
    const rid = String(rappelId || '').trim();
    const dejaSynchronisee = !!String(instantane || '').trim();
    if (!String(echeance || '').trim() && !rid && !dejaSynchronisee) return false;
    // Terminée ou abandonnée sans rappel : il n'y a rien à créer ni à retirer.
    if ((statut === 'terminée' || statut === 'abandonnée') && !rid) return false;
    return true;
  }

  // Une tâche abandonnée n'a plus rien à faire dans Apple Rappels : à la
  // différence d'une tâche terminée, qu'on coche, on retire son rappel. Encore
  // faut-il qu'un rappel existe, et que l'utilisateur n'ait pas coupé cela.
  static rappelASupprimer(statut, rappelId, reglages) {
    if (String(statut || '') !== 'abandonnée') return false;
    if (!String(rappelId || '').trim()) return false;
    return (reglages || {}).rappelsSupprimerAbandonnees !== false;
  }

  // Un chemin de dossier, réduit à ce qui l'identifie : casse ignorée, et
  // zéros de tête retirés du numéro qui ouvre chaque segment. « 7 - Journal »
  // et « 07 - Journal » se ramènent ainsi au même.
  static normaliserDossier(chemin) {
    return String(chemin || '').split('/')
      .map((seg) => seg.trim().replace(/^0+(\d)/, '$1').toLowerCase())
      .filter(Boolean).join('/');
  }

  // Le dossier réel que désigne un réglage devenu faux. Rend '' si le dossier
  // existe tel quel, ou si rien ne lui correspond : renommer les dossiers d'un
  // coffre (« 7 - X » en « 07 - X ») laissait sinon les réglages en arrière,
  // et le greffon recréait le dossier disparu à la première écriture.
  static dossierEquivalent(nom, existants) {
    const voulu = String(nom || '').trim();
    if (!voulu) return '';
    const liste = existants || [];
    if (liste.includes(voulu)) return '';
    const cle = Ariane.normaliserDossier(voulu);
    if (!cle) return '';
    const candidats = liste.filter((d) => Ariane.normaliserDossier(d) === cle);
    if (candidats.length === 1) return candidats[0];
    if (candidats.length > 1) return '';
    // Renumérotation : même nom, autre numéro (« 1 - Annotations » devenu
    // « 02 - Annotations »). Retenu seulement si un seul dossier existant
    // porte ce nom, au même niveau : en cas de doute, on ne choisit pas.
    const seul = Ariane.dossierSansNumero(voulu);
    if (!seul || seul === cle) return '';
    const parNom = liste.filter((d) => Ariane.dossierSansNumero(d) === seul);
    return parNom.length === 1 ? parNom[0] : '';
  }

  // Un chemin de dossier sans les numéros de tête de ses segments, en
  // minuscules : « 04 - Livrables/1 - Réunions » donne « livrables/réunions ».
  static dossierSansNumero(chemin) {
    return Ariane.normaliserDossier(chemin).split('/')
      .map((seg) => seg.replace(/^\d+\s*-\s*/, '')).join('/');
  }

  // L'identifiant d'événement Apple porté par un frontmatter, s'il y en a un.
  // C'est ce qui relie une note libre, ou un jalon, à l'événement d'origine.
  static idEvenementDe(fm) {
    return String(((fm || {})['Événement ID']) || '').trim();
  }

  static corpsNouvelleNoteEvenement(champs) {
    const c = champs || {};
    const q = Ariane.yamlChaine;
    const titre = c.intitule || 'Sans titre';
    const l = [];
    l.push('---');
    l.push('aliases:');
    l.push('  - ' + q(titre));
    l.push('Type: evenement');
    l.push('Événement ID:' + (c.evenementId ? ' ' + q(c.evenementId) : ''));
    l.push('Date:' + (c.date ? ' ' + c.date : ''));
    l.push('tags:');
    // Le titre suit directement les propriétés : pas de ligne vide entre
    // les deux, qu'Obsidian affiche comme un blanc sous l'en-tête.
    l.push('---');
    l.push('# ' + titre);
    l.push('');
    return l.join('\n');
  }

  // Référence nue d'un lien, alias compris : « [[T26-001|partie 2]] » rend
  // « T26-001 ».
  static refDeLien(v) {
    return String(v == null ? '' : v).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
  }

  // Le chemin d'une note désigne-t-il une tâche, et sous quelle référence ?
  // Une tâche est une note .md du dossier des tâches (sous-dossiers compris) ;
  // les anciennes références « T26-001 » restent reconnues où qu'elles soient.
  // La référence EST le nom de fichier, quel qu'il soit — plus de forme imposée.
  static refDepuisChemin(chemin, dossier) {
    const p = String(chemin || '');
    if (!/\.md$/i.test(p)) return null;
    const base = p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    const d = String(dossier || '').replace(/^\/+|\/+$/g, '');
    if (d && p.startsWith(d + '/')) return base;
    const m = p.match(/(?:^|\/)(T\d{2}-\d{3,4})\.md$/);
    return m ? m[1] : null;
  }

  // La date d'achèvement se déduit du statut, elle ne se saisit pas. Rendre
  // null veut dire « ne rien écrire », ce qui compte : réécrire à l'identique
  // relancerait l'événement de modification et ferait tourner la boucle.
  // Une tâche abandonnée n'est pas une tâche achevée, elle ne reçoit pas de date.
  static achevementAEcrire(fm, aujourdhui) {
    if (!fm || (fm.Type || fm.type) !== 'tache') return null;
    const dejaPosee = String(fm['termine-le'] == null ? '' : fm['termine-le']).trim();
    if (fm.statut === 'terminée') return dejaPosee ? null : aujourdhui;
    return dejaPosee ? '' : null;
  }

  // « Sans échéance » est une vraie propriété (case) mais elle ne se saisit
  // pas : elle vaut vrai tant que la tâche n'a pas d'échéance. Rendre null veut
  // dire « ne rien réécrire » — sinon l'écoute de modification tournerait en
  // boucle. `actuel` est la valeur déjà dans la note (true/false/undefined).
  static sansEcheanceAEcrire(echeance, actuel) {
    const attendu = !String(echeance == null ? '' : echeance).trim();
    return actuel === attendu ? null : attendu;
  }

  // Contenu du bloc d'accès, sans ses marques. Une action n'en a pas besoin :
  // un bloc vide dans chaque note d'action ne serait que du bruit.
  static blocTache(fm, meta) {
    const c = Ariane.champTache(fm);
    if (!c.retenu) return '';
    const l = [];
    if (c.conflits.length) {
      l.push('> [!warning] ' + tr('Conflit de champs') + ' : ' + c.conflits.join(', ')
             + '. ' + tr('Seul le premier est retenu.'));
      l.push('');
    }
    if (c.retenu === 'source') {
      l.push('**' + tr('Source') + '** ' + String(fm.source).trim());
      const acces = [];
      if (meta && meta.uriPdf) acces.push('[' + tr('Ouvrir le PDF') + '](' + meta.uriPdf + ')');
      if (meta && meta.uriZotero) acces.push('[' + tr('Ouvrir dans Zotero') + '](' + meta.uriZotero + ')');
      if (acces.length) { l.push(''); l.push(acces.join('  ·  ')); }
    } else if (c.retenu === 'livrable') {
      l.push('**' + tr('Livrable') + '** ' + String(fm.livrable).trim());
    } else {
      const chemin = String(fm.fichier).trim();
      l.push('**' + tr('Fichier') + '** `' + chemin.split('/').pop() + '`');
      if (meta && (meta.modifie || meta.ouvert)) {
        const bouts = [];
        if (meta.modifie) bouts.push(tr('modifié le') + ' ' + meta.modifie);
        if (meta.ouvert) bouts.push(tr('ouvert le') + ' ' + meta.ouvert);
        l.push('');
        l.push('*' + bouts.join('  ·  ') + '*');
      }
    }
    return l.join('\n');
  }

  // Libellé d'une note du coffre dans le sélecteur. L'alias passe devant : c'est
  // sous ce nom que Monsieur connaît ses notes, « NC-202607081912 » ne disant
  // rien à personne. Le nom de fichier suit tout de même, pour rester cherchable.
  static libelleNote(fm, basename) {
    const alias = []
      .concat((fm && fm.aliases) || [])
      .map((a) => String(a).trim())
      .filter(Boolean);
    return alias.length ? alias.join(' / ') + '  ·  ' + basename : basename;
  }

  // Libellé d'une fiche Zotero dans le sélecteur. Tout y est réuni pour que la
  // recherche approchée morde sur l'auteur, l'année, le titre ou la clé : on ne
  // retient pas une clé de citation par cœur.
  static libelleSource(fm, basename) {
    const f = fm || {};
    const auteurs = []
      .concat(f.creators || [])
      .map((c) => String(c).replace(/^\[\[|\]\]$/g, '').trim())
      .filter(Boolean);
    const bouts = [];
    if (auteurs.length) bouts.push(auteurs.slice(0, 3).join(', '));
    if (f.year) bouts.push('(' + f.year + ')');
    if (f.title) bouts.push('— ' + String(f.title));
    bouts.push('· ' + basename);
    return bouts.join(' ');
  }

  // Les tâches les plus probables pour un créneau qu'on vient de tracer dans
  // le calendrier, du plus au moins probable, chacune avec la raison qui l'a
  // fait monter (affichée à côté du nom). Quatre indices, qui se cumulent :
  //   · le travail récent : une tâche travaillée la veille est plus probable
  //     qu'une tâche laissée depuis un mois (décroissance sur une semaine) ;
  //   · la frise : le jour tombe entre son début et son échéance ;
  //   · l'échéance qui approche (décroissance sur dix jours), ou dépassée ;
  //   · le statut et la priorité.
  // Terminées, abandonnées et jalons sont écartés : on n'y travaille plus, ou
  // on n'y travaille pas.
  static suggererTachesCreneau(taches, jour) {
    const j = Ariane.jourValide(jour);
    const sortie = [];
    for (const t of (taches || [])) {
      if (!t || !t.ref || t.jalon) continue;
      const st = String(t.statut || 'à faire');
      if (st === 'terminée' || st === 'abandonnée') continue;
      let score = st === 'en cours' ? 30 : st === 'en attente' ? -10 : 10;
      score += t.priorite === 'haute' ? 8 : t.priorite === 'moyenne' ? 4 : 0;
      const raisons = [];   // [poids, texte] : la plus lourde est affichée

      // Le dernier créneau en date, avant ou le jour même ; à défaut le plus
      // proche après (une tâche déjà planifiée demain compte aussi).
      let ecartCreneau = null;
      for (const c of Ariane.creneauxDeTache([].concat(t.creneaux || []))) {
        const e = j ? Ariane.ecartJours(c.debut.slice(0, 10), j) : null;
        if (e === null) continue;
        if (ecartCreneau === null || Math.abs(e) < Math.abs(ecartCreneau)) ecartCreneau = e;
      }
      if (ecartCreneau !== null) {
        const p = 40 * Math.exp(-Math.abs(ecartCreneau) / 7);
        score += p;
        raisons.push([p, ecartCreneau === 0 ? tr('déjà travaillée ce jour-là')
          : ecartCreneau > 0 ? tr('dernier créneau il y a {n} j').replace('{n}', ecartCreneau)
            : tr('créneau prévu dans {n} j').replace('{n}', -ecartCreneau)]);
      }

      const deb = Ariane.jourValide(t.debut);
      const ech = Ariane.jourValide(t.echeance);
      if (j && (deb || ech) && (!deb || deb <= j) && (!ech || j <= ech)) {
        score += 25;
        // Pèse dans le score, mais s'efface à l'affichage devant une échéance
        // chiffrée, qui en dit plus.
        raisons.push([10, tr('en cours sur la frise')]);
      }
      if (j && ech) {
        const reste = Ariane.ecartJours(j, ech);
        if (reste >= 0) {
          const p = 30 * Math.exp(-reste / 10);
          score += p;
          raisons.push([p, reste === 0 ? tr('échéance ce jour-là')
            : tr('échéance dans {n} j').replace('{n}', reste)]);
        } else {
          score += 15;
          raisons.push([15, tr('échéance dépassée')]);
        }
      }
      if (st === 'en cours') raisons.push([12, tr('en cours')]);
      raisons.sort((a, b) => b[0] - a[0]);
      sortie.push({ t, score, raison: raisons.length ? raisons[0][1] : '' });
    }
    // À score égal, l'intitulé départage : l'ordre ne saute pas d'une
    // ouverture à l'autre.
    return sortie.sort((a, b) => (b.score - a.score)
      || String(a.t.intitule || a.t.ref).localeCompare(String(b.t.intitule || b.t.ref), 'fr'));
  }

  // Case « terminee » et statut vont ensemble. Quand Ariane écrit un statut
  // sans la case, on ajoute la case assortie : les deux arrivent en phase, et
  // la règle qui les accorde (accordTermine) n'a rien à arbitrer. Sans cela,
  // le menu de la frise écrivait « terminée » case décochée, et la règle,
  // faute de savoir lequel avait bougé, rendait raison à la case.
  static champsTacheEnPhase(champs) {
    const c = Object.assign({}, champs || {});
    if (Object.prototype.hasOwnProperty.call(c, 'statut')
      && !Object.prototype.hasOwnProperty.call(c, 'terminee')) {
      c.terminee = c.statut === 'terminée';
    }
    return c;
  }

  // Accorde la case et le statut quand ils se contredisent : celui des deux
  // qui a changé depuis l'état mémorisé (`avant`) entraîne l'autre. Rend les
  // champs à écrire, ou null s'ils sont déjà d'accord. Sans état mémorisé, on
  // ne peut pas savoir lequel a bougé : on rend raison au statut, que la
  // plupart des gestes modifient (menus, formulaire, synchronisations).
  static accordTermine(avant, coche, fini) {
    if (coche === fini) return null;
    const caseModifiee = avant ? avant.coche !== coche : false;
    return caseModifiee
      ? { statut: coche ? 'terminée' : 'à faire' }
      : { terminee: fini };
  }

  // ── Journal des modifications et analyse des tâches ────────────────────
  //  Fonctions pures du journal (spec 2026-09-29, lot 1) : ce qu'on retient
  //  d'une tâche, ce qui a changé entre deux instantanés, et l'analyse
  //  (urgence, importance, diagnostics) qu'en tirent le tableau de bord et
  //  les outils de Claude. Rien de tout cela n'est écrit dans les notes.

  // Les champs dont on garde l'historique, en concepts Ariane (le journal
  // survit ainsi à un renommage des clés de propriétés).
  static get CHAMPS_JOURNAL() {
    return ['intitule', 'statut', 'priorite', 'debut', 'echeance', 'heure',
      'avancement', 'jalon', 'parent', 'bloque-par', 'famille'];
  }

  // L'instantané d'une tâche (objet de tachesPourGantt) : valeurs simples,
  // listes triées, pour que deux instantanés se comparent à l'identique.
  static instantaneTache(t) {
    const x = t || {};
    const liste = (v) => [].concat(v || []).map(String).filter(Boolean).sort();
    return {
      intitule: String(x.intitule || ''),
      statut: String(x.statut || ''),
      priorite: String(x.priorite || ''),
      debut: String(x.debut || ''),
      echeance: String(x.echeance || ''),
      heure: String(x.heure || ''),
      avancement: Number(x.avancement) || 0,
      jalon: x.jalon === true,
      parent: String(x.parent || ''),
      'bloque-par': liste(x.bloquePar),
      famille: String(x.famille || ''),
      creneaux: liste(x.creneaux),
    };
  }

  // Ce qui a changé entre deux instantanés : une entrée par champ, et une par
  // créneau ajouté ou retiré (la liste entière ne dirait pas lequel).
  static differencesTache(avant, apres) {
    const a = avant || {};
    const b = apres || {};
    const out = [];
    const egal = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    for (const champ of Ariane.CHAMPS_JOURNAL) {
      if (egal(a[champ], b[champ])) continue;
      out.push({ champ, avant: a[champ] === undefined ? '' : a[champ],
                 apres: b[champ] === undefined ? '' : b[champ] });
    }
    const ca = new Set(a.creneaux || []);
    const cb = new Set(b.creneaux || []);
    for (const c of cb) if (!ca.has(c)) out.push({ champ: 'creneau', avant: '', apres: c });
    for (const c of ca) if (!cb.has(c)) out.push({ champ: 'creneau', avant: c, apres: '' });
    return out;
  }

  // Combien de fois l'échéance a été repoussée plus tard, d'après le journal.
  static reportsEcheance(entrees) {
    let n = 0;
    for (const e of (entrees || [])) {
      if (e.champ !== 'echeance') continue;
      const av = Ariane.jourValide(e.avant);
      const ap = Ariane.jourValide(e.apres);
      if (av && ap && ap > av) n += 1;
    }
    return n;
  }

  // L'analyse d'une tâche. `ctx` :
  //   aujourdhui      'AAAA-MM-JJ'
  //   journal         entrées du journal de CETTE tâche
  //   bloquees        nombre de tâches non finies qu'elle bloque
  //   filles          nombre de tâches filles non finies
  //   tempsRecentMin  minutes passées (sa note et les notes liées) sur la période
  //   semainesAbandon seuil de l'abandon probable (4 par défaut)
  // Rend { urgence, importance, diagnostics, dernierCreneau, prochainCreneau,
  // reports } ; urgence et importance : { score 0-100, niveau, raison }.
  static analyseTache(t, ctx) {
    const c = ctx || {};
    const auj = Ariane.jourValide(c.aujourdhui) || new Date().toISOString().slice(0, 10);
    const fini = t.statut === 'terminée' || t.statut === 'abandonnée';
    const semaines = Number(c.semainesAbandon) > 0 ? Number(c.semainesAbandon) : 4;
    const creneaux = Ariane.creneauxDeTache([].concat(t.creneaux || []));
    const passes = creneaux.map((x) => x.debut.slice(0, 10)).filter((j) => j <= auj).sort();
    const avenir = creneaux.map((x) => x.debut).filter((d) => d.slice(0, 10) >= auj).sort();
    const dernierCreneau = passes.length ? passes[passes.length - 1] : '';
    const prochainCreneau = avenir.length ? avenir[0] : '';
    const ech = Ariane.jourValide(t.echeance);
    const reste = ech ? Ariane.ecartJours(auj, ech) : null;
    const journal = c.journal || [];
    const reports = Ariane.reportsEcheance(journal);
    const bloquees = Number(c.bloquees) || 0;
    const niveau = (s) => (s >= 60 ? 'haute' : s >= 30 ? 'moyenne' : 'basse');

    // Urgence : l'échéance d'abord, puis ce que la tâche retient.
    let urg = 0;
    let rUrg = '';
    if (!fini && reste !== null) {
      if (reste < 0) {
        urg = 100;
        rUrg = tr('échéance dépassée de {n} j').replace('{n}', String(-reste));
      } else {
        urg = Math.round(100 * Math.exp(-reste / 7));
        rUrg = reste === 0 ? tr('échéance aujourd’hui')
          : tr('échéance dans {n} j').replace('{n}', String(reste));
      }
    }
    if (!fini && bloquees) {
      urg = Math.min(100, urg + 12 * bloquees);
      if (!rUrg) rUrg = tr('bloque {n} tâche(s)').replace('{n}', String(bloquees));
    }

    // Importance : la priorité si Monsieur l'a donnée, sinon déduite.
    let imp;
    let rImp;
    const prio = { haute: 85, moyenne: 55, basse: 20 }[t.priorite];
    if (prio !== undefined) {
      imp = prio;
      rImp = tr('priorité ') + t.priorite;
    } else {
      imp = 30;
      const raisons = [];
      if (t.livrable) { imp += 25; raisons.push(tr('rattachée à un livrable')); }
      if (bloquees) {
        imp += 10 * Math.min(bloquees, 3);
        raisons.push(tr('débloque {n} tâche(s)').replace('{n}', String(bloquees)));
      }
      if (Number(c.filles) > 0) {
        imp += 8 * Math.min(Number(c.filles), 3);
        raisons.push(tr('mère de {n} tâche(s)').replace('{n}', String(c.filles)));
      }
      if (t.jalon) { imp += 15; raisons.push(tr('jalon')); }
      imp = Math.min(100, imp);
      rImp = raisons.length ? raisons.join(', ') : tr('rien ne la distingue');
    }

    // Diagnostics : des règles qu'on peut expliquer, chacune avec sa raison.
    const diagnostics = [];
    if (!fini) {
      if (reste !== null && reste < 0) {
        diagnostics.push({ code: 'retard',
          raison: tr('échéance dépassée depuis {n} j').replace('{n}', String(-reste)) });
      }
      if (reports >= 2) {
        diagnostics.push({ code: 'etire',
          raison: tr('échéance repoussée {n} fois').replace('{n}', String(reports)) });
      }
      if (reste !== null && reste >= 0 && reste <= 14 && !prochainCreneau && !t.jalon) {
        diagnostics.push({ code: 'sous-planifiee',
          raison: tr('échéance dans {n} j, aucun créneau prévu').replace('{n}', String(reste)) });
      }
      const seuil = Ariane.decalerJour(auj, -7 * semaines);
      const cree = Ariane.jourValide(t.cree) || '';
      const activiteJournal = journal.some((e) => String(e.le || '').slice(0, 10) >= seuil);
      const actif = (dernierCreneau && dernierCreneau >= seuil) || prochainCreneau
        || activiteJournal || Number(c.tempsRecentMin) > 0;
      if (!actif && (!cree || cree < seuil) && t.statut !== 'en attente') {
        diagnostics.push({ code: 'abandon',
          raison: dernierCreneau
            ? tr('aucune activité depuis le {d}').replace('{d}', dernierCreneau)
            : tr('aucune activité depuis {n} semaines').replace('{n}', String(semaines)) });
      }
    }
    return {
      urgence: { score: urg, niveau: niveau(urg), raison: rUrg },
      importance: { score: imp, niveau: niveau(imp), raison: rImp },
      diagnostics, dernierCreneau, prochainCreneau, reports,
    };
  }

  // La revue : les analyses (analyseTaches) rangées en ce qui demande
  // l'attention, du plus pressant au moins pressant. Chaque tâche y porte la
  // raison de sa place. Une tâche peut figurer dans plusieurs rubriques.
  static revueTaches(analyses, aujourdhui) {
    const auj = Ariane.jourValide(aujourdhui) || new Date().toISOString().slice(0, 10);
    const dans7 = Ariane.decalerJour(auj, 7);
    const actives = (analyses || []).filter((x) => x && x.tache
      && x.tache.statut !== 'terminée' && x.tache.statut !== 'abandonnée');
    const avec = (code) => actives.filter((x) => x.analyse.diagnostics.some((d) => d.code === code));
    const parUrgence = (l) => l.slice().sort((a, b) => b.analyse.urgence.score - a.analyse.urgence.score
      || b.analyse.importance.score - a.analyse.importance.score);
    const cetteSemaine = actives.filter((x) => {
      const ech = Ariane.jourValide(x.tache.echeance);
      const pro = String(x.analyse.prochainCreneau || '').slice(0, 10);
      return (ech && ech >= auj && ech <= dans7) || (pro && pro <= dans7);
    });
    const urgentImportant = actives.filter((x) => x.analyse.urgence.niveau === 'haute'
      && x.analyse.importance.niveau !== 'basse');
    const importantPasUrgent = actives.filter((x) => x.analyse.importance.niveau === 'haute'
      && x.analyse.urgence.niveau === 'basse');
    return {
      aujourdhui: auj,
      enRetard: parUrgence(avec('retard')),
      sousPlanifiees: parUrgence(avec('sous-planifiee')),
      sEtirent: parUrgence(avec('etire')),
      abandonsProbables: avec('abandon'),
      cetteSemaine: parUrgence(cetteSemaine),
      urgentImportant: parUrgence(urgentImportant),
      importantPasUrgent: parUrgence(importantPasUrgent),
    };
  }

  // Ce que Claude propose (outil proposer_modifications), vérifié avant
  // d'être montré à Monsieur. Chaque changement porte sur UNE tâche (ou en
  // crée une) ; s'il contient une seule valeur invalide, il est écarté en
  // entier avec la raison, plutôt que d'être appliqué à moitié. Les valeurs
  // identiques à l'existant sont passées sous silence : rien à valider.
  // Rend { valides: [{ id, ref, intitule, justification, operations }], erreurs }.
  static validerPropositions(changements, taches) {
    const parRef = new Map((taches || []).map((t) => [t.ref, t]));
    const STATUTS = ['à faire', 'en cours', 'en attente', 'terminée', 'abandonnée'];
    const PRIORITES = ['', 'basse', 'moyenne', 'haute'];
    const CHAMPS = ['intitule', 'statut', 'priorite', 'debut', 'echeance', 'heure',
      'avancement', 'jalon', 'parent', 'famille'];
    const valides = [];
    const erreurs = [];
    // Une valeur de champ : normalisée si elle est acceptable, sinon une erreur.
    const verifier = (champ, v) => {
      if (champ === 'intitule' || champ === 'famille') {
        const x = String(v == null ? '' : v).trim();
        return x ? { v: x } : { e: champ + ' vide' };
      }
      if (champ === 'statut') return STATUTS.includes(v) ? { v } : { e: 'statut inconnu : ' + v };
      if (champ === 'priorite') {
        const x = v == null ? '' : String(v);
        return PRIORITES.includes(x) ? { v: x } : { e: 'priorité inconnue : ' + v };
      }
      if (champ === 'debut' || champ === 'echeance') {
        const x = v == null ? '' : String(v).trim();
        if (!x) return { v: '' };
        return Ariane.jourValide(x) === x ? { v: x } : { e: champ + ' invalide : ' + v };
      }
      if (champ === 'heure') {
        const x = v == null ? '' : String(v).trim();
        return !x || /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? { v: x } : { e: 'heure invalide : ' + v };
      }
      if (champ === 'avancement') {
        const n = Number(v);
        return Number.isInteger(n) && n >= 0 && n <= 100 ? { v: n } : { e: 'avancement invalide : ' + v };
      }
      if (champ === 'jalon') return typeof v === 'boolean' ? { v } : { e: 'jalon : vrai ou faux' };
      if (champ === 'parent') {
        const x = Ariane.refDeLien(String(v == null ? '' : v));
        if (!x) return { v: '' };
        return parRef.has(x) ? { v: '[[' + x + ']]', ref: x } : { e: 'tâche mère introuvable : ' + v };
      }
      return { e: 'champ non modifiable : ' + champ };
    };
    const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    (Array.isArray(changements) ? changements : []).forEach((brut, i) => {
      const x = brut || {};
      const id = 'p' + (i + 1);
      const fautes = [];
      const operations = [];
      const cree = x.creer && typeof x.creer === 'object' ? x.creer : null;
      const ref = cree ? '' : String(x.ref || '').trim();
      const t = cree ? null : parRef.get(ref);
      if (!cree && !t) {
        erreurs.push({ id, ref, erreur: ref ? 'tâche introuvable : ' + ref : 'ni référence ni création' });
        return;
      }
      if (cree) {
        const champs = {};
        for (const [k, v] of Object.entries(cree)) {
          if (!CHAMPS.includes(k)) { fautes.push('champ non modifiable : ' + k); continue; }
          const r = verifier(k, v);
          if (r.e) fautes.push(r.e); else champs[k] = r.v;
        }
        if (!champs.intitule) fautes.push('création sans intitulé');
        operations.push({ genre: 'creation', champs });
      }
      for (const [k, v] of Object.entries((x.champs && typeof x.champs === 'object') ? x.champs : {})) {
        if (!CHAMPS.includes(k)) { fautes.push('champ non modifiable : ' + k); continue; }
        const r = verifier(k, v);
        if (r.e) { fautes.push(r.e); continue; }
        if (r.ref && r.ref === ref) { fautes.push('une tâche ne peut être sa propre mère'); continue; }
        const avant = k === 'parent' ? (Ariane.refDeLien(t.parent || '') ? '[[' + Ariane.refDeLien(t.parent) + ']]' : '')
          : k === 'jalon' ? t.jalon === true
            : k === 'avancement' ? (Number(t.avancement) || 0)
              : String(t[k] == null ? '' : t[k]);
        if (JSON.stringify(avant) === JSON.stringify(r.v)) continue;
        operations.push({ genre: 'champ', champ: k, avant, apres: r.v });
      }
      const existants = new Set(Ariane.creneauxDeTache([].concat((t && t.creneaux) || [])).map((c) => c.brut));
      for (const c of [].concat(x.ajouter_creneaux || [])) {
        const d = String((c && c.debut) || '');
        const f = String((c && c.fin) || '');
        if (!instant.test(d) || !instant.test(f) || !Ariane.jourValide(d) || f <= d) {
          fautes.push('créneau invalide : ' + JSON.stringify(c));
          continue;
        }
        const b = Ariane.formatCreneau(d, f);
        if (!existants.has(b)) operations.push({ genre: 'creneau+', debut: d, fin: f, brut: b });
      }
      for (const c of [].concat(x.retirer_creneaux || [])) {
        const b = typeof c === 'string' ? c.trim()
          : (c && c.debut && c.fin ? Ariane.formatCreneau(String(c.debut), String(c.fin)) : '');
        if (!b || !existants.has(b)) { fautes.push('créneau à retirer introuvable : ' + JSON.stringify(c)); continue; }
        operations.push({ genre: 'creneau-', brut: b });
      }
      if (fautes.length) { erreurs.push({ id, ref, erreur: fautes.join(' ; ') }); return; }
      if (!operations.length) { erreurs.push({ id, ref, erreur: 'rien à changer' }); return; }
      valides.push({ id, ref, intitule: cree ? operations[0].champs.intitule : t.intitule,
        justification: String(x.justification || '').trim(), operations });
    });
    return { valides, erreurs };
  }

  // Une échéance dite en clair, relativement à aujourd'hui, avec son genre
  // (retard, proche : sept jours au plus, loin) pour la couleur.
  static echeanceRelative(echeance, aujourdhui) {
    const e = Ariane.jourValide(echeance);
    const auj = Ariane.jourValide(aujourdhui);
    if (!e || !auj) return null;
    const n = Ariane.ecartJours(auj, e);
    if (n < 0) return { texte: tr('dépassée de {n} j').replace('{n}', String(-n)), genre: 'retard', jours: n };
    if (n === 0) return { texte: tr('aujourd’hui'), genre: 'proche', jours: 0 };
    if (n === 1) return { texte: tr('demain'), genre: 'proche', jours: 1 };
    if (n <= 13) return { texte: tr('dans {n} j').replace('{n}', String(n)), genre: n <= 7 ? 'proche' : 'loin', jours: n };
    return { texte: tr('dans {n} sem.').replace('{n}', String(Math.round(n / 7))), genre: 'loin', jours: n };
  }

  // Une ligne du journal des tâches, dite en français.
  static phraseJournal(e) {
    const x = e || {};
    const v = (y) => (y === '' || y == null ? tr('(aucune)') : String(y));
    switch (x.champ) {
      case 'creation': return tr('tâche créée');
      case 'suppression': return tr('tâche supprimée');
      case 'creneau': return x.apres ? tr('créneau ajouté : ') + x.apres : tr('créneau retiré : ') + x.avant;
      case 'echeance': {
        const av = Ariane.jourValide(x.avant);
        const ap = Ariane.jourValide(x.apres);
        if (av && ap) {
          return (ap > av ? tr('échéance repoussée du {a} au {b}') : tr('échéance avancée du {a} au {b}'))
            .replace('{a}', av).replace('{b}', ap);
        }
        return ap ? tr('échéance fixée au ') + ap : tr('échéance retirée');
      }
      case 'debut': return x.apres ? tr('début : ') + x.apres : tr('début retiré');
      case 'statut': return tr('statut : ') + v(x.avant) + ' → ' + v(x.apres);
      case 'avancement': return tr('avancement : ') + (Number(x.avant) || 0) + ' % → ' + (Number(x.apres) || 0) + ' %';
      case 'intitule': return tr('renommée : « ') + x.apres + ' »';
      case 'priorite': return tr('priorité : ') + v(x.avant) + ' → ' + v(x.apres);
      case 'jalon': return x.apres === true ? tr('devient un jalon') : tr('n’est plus un jalon');
      case 'parent': return x.apres ? tr('rattachée à ') + Ariane.refDeLien(String(x.apres)) : tr('détachée de sa mère');
      case 'bloque-par': return tr('blocages modifiés');
      case 'famille': return tr('famille : ') + v(x.avant) + ' → ' + v(x.apres);
      default: return String(x.champ) + ' : ' + v(x.avant) + ' → ' + v(x.apres);
    }
  }

  static get ORIGINES_JOURNAL() {
    return { externe: tr('vous'), ariane: 'Ariane', claude: 'Claude', ia: tr('IA (répartition)') };
  }

  // Tout ce qu'affiche la note « Gestion de l'organisation ». `entrees` :
  // { tache, analyse, tempsSemaineMin, termineLe } par tâche (analyseTaches,
  // complété) ; `ctx` : { aujourdhui, journal, evenements } (événements
  // Apple de la semaine). Rend des données, jamais du DOM : le bloc les met
  // en forme, la suite de tests les éprouve.
  static tableauOrganisation(entrees, ctx) {
    const c = ctx || {};
    const auj = Ariane.jourValide(c.aujourdhui) || new Date().toISOString().slice(0, 10);
    const { lundi, jours } = Ariane.grilleSemaine(auj);
    const liste = (entrees || []).filter((x) => x && x.tache);
    const finie = (x) => x.tache.statut === 'terminée' || x.tache.statut === 'abandonnée';
    const actives = liste.filter((x) => !finie(x));
    const parUrgence = (a, b) => b.analyse.urgence.score - a.analyse.urgence.score
      || b.analyse.importance.score - a.analyse.importance.score;

    // Les créneaux de la semaine, toutes tâches confondues (une tâche finie
    // a pu être travaillée lundi : ses heures comptent).
    const creneaux = [];
    for (const x of liste) {
      for (const cr of Ariane.creneauxDeTache([].concat(x.tache.creneaux || []))) {
        const j = cr.debut.slice(0, 10);
        if (j < lundi || j > jours[6]) continue;
        creneaux.push({ entree: x, jour: j, debut: cr.debut, fin: cr.fin,
          minutes: Ariane.dureeCreneauMin(cr.debut, cr.fin) });
      }
    }
    const evenements = (c.evenements || []).filter((e) => e && e.debut);
    const horaires = evenements.filter((e) => !e.allDay);

    // Temps libre : dans la plage de travail (9 h - 18 h par défaut) de chaque
    // jour ouvré qui reste, une fois retirés les créneaux de tâches et les
    // rendez-vous. Aujourd'hui ne compte qu'à partir de maintenant, arrondi au
    // quart d'heure suivant. Les événements « journée entière » ne bloquent
    // rien (un colloque d'un jour n'occupe pas forcément toute la plage).
    const mn = (hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : null; };
    const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const hDeb = mn(c.heureDebut) != null ? mn(c.heureDebut) : 9 * 60;
    const hFin = mn(c.heureFin) != null ? mn(c.heureFin) : 18 * 60;
    const maintenant = mn(c.maintenant);
    const ouvre = (i) => c.weekend === true || i < 5;
    const libreDu = (j, i) => {
      if (j < auj || !ouvre(i) || hFin <= hDeb) return null;
      let debut = hDeb;
      if (j === auj && maintenant != null) debut = Math.max(hDeb, Math.ceil(maintenant / 15) * 15);
      if (debut >= hFin) return { plages: [], minutes: 0, capacite: 0 };
      const occ = creneaux.filter((x) => x.jour === j).map((x) => ({ debut: x.debut, fin: x.fin }))
        .concat(horaires.filter((e) => e.debut.slice(0, 10) === j).map((e) => ({ debut: e.debut, fin: e.fin || e.debut })));
      // La pause déjeuner, si elle est réglée, n'est pas du temps libre.
      if (mn(c.pauseDebut) != null && mn(c.pauseFin) != null && mn(c.pauseFin) > mn(c.pauseDebut)) {
        occ.push({ debut: j + 'T' + hm(mn(c.pauseDebut)), fin: j + 'T' + hm(mn(c.pauseFin)) });
      }
      const plages = Ariane.plagesLibres(j, occ, hm(debut), hm(hFin), 30);
      return { plages, minutes: plages.reduce((s, p) => s + p.minutes, 0), capacite: hFin - debut };
    };

    const semaine = jours.map((j, i) => {
      const cr = creneaux.filter((x) => x.jour === j);
      const ev = horaires.filter((e) => e.debut.slice(0, 10) === j);
      const libre = libreDu(j, i);
      return {
        libre,
        jour: j,
        aujourdhui: j === auj,
        minutesPlanifiees: cr.reduce((s, x) => s + x.minutes, 0),
        nbCreneaux: cr.length,
        nbEvenements: ev.length,
        minutesEvenements: ev.reduce((s, e) => s + Ariane.dureeCreneauMin(e.debut, e.fin || e.debut), 0),
      };
    });

    const dans7 = Ariane.decalerJour(auj, 7);
    const ilYa7 = Ariane.decalerJour(auj, -6);
    const chiffres = {
      actives: actives.length,
      enRetard: actives.filter((x) => x.analyse.diagnostics.some((d) => d.code === 'retard')).length,
      echeances7: actives.filter((x) => {
        const e = Ariane.jourValide(x.tache.echeance);
        return e && e >= auj && e <= dans7;
      }).length,
      minutesPlanifieesSemaine: semaine.reduce((s, j) => s + j.minutesPlanifiees, 0),
      minutesPasseesSemaine: Math.round(liste.reduce((s, x) => s + (Number(x.tempsSemaineMin) || 0), 0)),
      termineesSemaine: liste.filter((x) => x.tache.statut === 'terminée'
        && Ariane.jourValide(x.termineLe) && x.termineLe >= ilYa7).length,
    };

    const aujourdhui = creneaux.filter((x) => x.jour === auj)
      .map((x) => ({ genre: 'creneau', debut: x.debut, fin: x.fin, minutes: x.minutes,
        tache: x.entree.tache, analyse: x.entree.analyse }))
      .concat(horaires.filter((e) => e.debut.slice(0, 10) === auj).map((e) => ({
        genre: 'evenement', debut: e.debut, fin: e.fin || e.debut, titre: e.titre || '',
        calendrier: e.calendrier || '', couleur: e.couleur || '',
        minutes: Ariane.dureeCreneauMin(e.debut, e.fin || e.debut) })))
      .sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
    const journeeEntiere = evenements.filter((e) => e.allDay
      && e.debut.slice(0, 10) <= auj && String(e.fin || e.debut).slice(0, 10) >= auj)
      .map((e) => ({ titre: e.titre || '', calendrier: e.calendrier || '', couleur: e.couleur || '' }));

    // Tâches suggérées : ce qui mérite l'attention maintenant, classé, chacune
    // avec un conseil. Celles déjà au programme d'aujourd'hui n'y figurent
    // pas (elles sont dans « Aujourd'hui »), ni les jalons, ni ce qui est « en
    // attente » (un choix de Monsieur). Le conseil est rendu en données
    // ({ genre, date }) : le bloc le formule.
    const auProgramme = new Set(aujourdhui.filter((x) => x.genre === 'creneau').map((x) => x.tache.ref));
    const a_ = (x, code) => x.analyse.diagnostics.some((d) => d.code === code);
    const conseil = (x) => {
      if (a_(x, 'retard')) return { genre: 'retard', date: x.tache.echeance };
      if (a_(x, 'sous-planifiee')) return { genre: 'planifier-avant', date: x.tache.echeance };
      if (a_(x, 'etire')) return { genre: 'decouper', date: '' };
      if (a_(x, 'abandon')) return { genre: 'relancer', date: '' };
      if (x.analyse.prochainCreneau) return { genre: 'prevue', date: x.analyse.prochainCreneau };
      return { genre: 'a-planifier', date: '' };
    };
    const poids = (x) => x.analyse.urgence.score * 0.6 + x.analyse.importance.score * 0.4
      + (a_(x, 'retard') ? 30 : 0) + (a_(x, 'sous-planifiee') ? 20 : 0)
      - (x.analyse.prochainCreneau ? 10 : 0);   // déjà planifiée : moins pressante
    const suggestions = actives
      .filter((x) => !auProgramme.has(x.tache.ref) && !x.tache.jalon && x.tache.statut !== 'en attente'
        && (x.analyse.urgence.score >= 30 || x.analyse.importance.score >= 50
          || a_(x, 'retard') || a_(x, 'sous-planifiee') || a_(x, 'etire')))
      .map((x) => Object.assign({}, x, { conseil: conseil(x), poids: poids(x) }))
      .sort((a, b) => b.poids - a.poids || parUrgence(a, b))
      .slice(0, 8);
    const suggerees = new Set(suggestions.map((x) => x.tache.ref));

    // Matrice : urgent et important à partir de la moitié de l'échelle.
    const matrice = { urgentImportant: [], importantPasUrgent: [], urgentPasImportant: [], niUnNiAutre: [] };
    for (const x of actives) {
      const u = x.analyse.urgence.score >= 50;
      const i = x.analyse.importance.score >= 50;
      matrice[u && i ? 'urgentImportant' : i ? 'importantPasUrgent' : u ? 'urgentPasImportant' : 'niUnNiAutre'].push(x);
    }
    for (const k of Object.keys(matrice)) matrice[k].sort(parUrgence);

    const gravite = { retard: 0, 'sous-planifiee': 1, etire: 2, abandon: 3 };
    const rang = (x) => Math.min(...x.analyse.diagnostics.map((d) => (d.code in gravite ? gravite[d.code] : 9)));
    // À surveiller : les signaux qui restent une fois les suggestions faites.
    const surveiller = actives.filter((x) => x.analyse.diagnostics.length && !suggerees.has(x.tache.ref))
      .sort((a, b) => rang(a) - rang(b) || parUrgence(a, b));

    const dans30 = Ariane.decalerJour(auj, 30);
    const echeances = actives.filter((x) => {
      const e = Ariane.jourValide(x.tache.echeance);
      return e && e >= auj && e <= dans30;
    }).sort((a, b) => (a.tache.echeance < b.tache.echeance ? -1 : a.tache.echeance > b.tache.echeance ? 1 : parUrgence(a, b)));

    const parFamille = new Map();
    for (const x of liste) {
      const f = x.tache.famille || '';
      if (!parFamille.has(f)) {
        parFamille.set(f, { famille: f, actives: 0, terminees: 0, abandonnees: 0, total: 0, minutesSemaine: 0 });
      }
      const g = parFamille.get(f);
      g.total += 1;
      if (x.tache.statut === 'terminée') g.terminees += 1;
      else if (x.tache.statut === 'abandonnée') g.abandonnees += 1;
      else g.actives += 1;
    }
    for (const x of creneaux) parFamille.get(x.entree.tache.famille || '').minutesSemaine += x.minutes;
    const familles = Array.from(parFamille.values()).map((g) => Object.assign(g, {
      taux: g.total - g.abandonnees > 0 ? Math.round(100 * g.terminees / (g.total - g.abandonnees)) : 0,
    })).sort((a, b) => b.actives - a.actives || b.total - a.total);

    const intitules = new Map(liste.map((x) => [x.tache.ref, x.tache.intitule]));
    const activite = (c.journal || []).slice()
      .sort((a, b) => (a.le < b.le ? 1 : a.le > b.le ? -1 : 0))
      .slice(0, 12)
      .map((e) => ({ le: e.le, ref: e.ref, intitule: intitules.get(e.ref) || '',
        phrase: Ariane.phraseJournal(e), origine: Ariane.ORIGINES_JOURNAL[e.origine] || e.origine || '' }));

    const joursLibres = semaine.filter((j) => j.libre);
    const tempsLibre = {
      heureDebut: hm(hDeb),
      heureFin: hm(hFin),
      minutes: joursLibres.reduce((s, j) => s + j.libre.minutes, 0),
      capacite: joursLibres.reduce((s, j) => s + j.libre.capacite, 0),
      nbPlages: joursLibres.reduce((s, j) => s + j.libre.plages.length, 0),
      jours: joursLibres.map((j) => ({ jour: j.jour, aujourdhui: j.aujourdhui, plages: j.libre.plages, minutes: j.libre.minutes })),
    };
    return { aujourdhuiISO: auj, lundi, chiffres, semaine, aujourdhui, journeeEntiere, suggestions, tempsLibre,
      matrice, surveiller, echeances, familles, activite };
  }

  // ── Répartition de la semaine par l'IA ─────────────────────────────────
  //  L'IA estime chaque tâche (taille, temps restant, part de la semaine, bloc
  //  idéal) ; Ariane place les créneaux par des règles fixes, dans les seules
  //  plages libres. Ainsi aucun créneau ne peut tomber sur un rendez-vous ni
  //  déborder de la journée, quoi que réponde le modèle.

  // Les tâches à considérer, les plus pressantes d'abord, avec ce qui aide à
  // juger leur taille : durée de vie (début → échéance), temps restant avant
  // l'échéance, heures déjà planifiées, avancement, signaux.
  static candidatsRepartition(entrees, aujourdhui, max) {
    const auj = Ariane.jourValide(aujourdhui) || new Date().toISOString().slice(0, 10);
    const out = [];
    for (const x of (entrees || [])) {
      if (!x || !x.tache) continue;
      const t = x.tache;
      if (t.statut === 'terminée' || t.statut === 'abandonnée' || t.statut === 'en attente' || t.jalon) continue;
      const a = x.analyse;
      const crs = Ariane.creneauxDeTache([].concat(t.creneaux || []));
      const somme = (l) => l.reduce((s, c) => s + Ariane.dureeCreneauMin(c.debut, c.fin), 0);
      const deb = Ariane.jourValide(t.debut);
      const ech = Ariane.jourValide(t.echeance);
      const codes = a.diagnostics.map((d) => d.code);
      out.push({
        ref: t.ref, intitule: t.intitule || t.ref, famille: t.famille || '', statut: t.statut || 'à faire',
        avancement: Number(t.avancement) || 0, debut: deb, echeance: ech,
        dureeVieJours: deb && ech ? Ariane.ecartJours(deb, ech) : null,
        joursRestants: ech ? Ariane.ecartJours(auj, ech) : null,
        minutesPasseesPlanifiees: somme(crs.filter((c) => c.debut.slice(0, 10) < auj)),
        minutesAVenirPlanifiees: somme(crs.filter((c) => c.debut.slice(0, 10) >= auj)),
        diagnostics: codes,
        rang: a.urgence.score * 0.6 + a.importance.score * 0.4
          + (codes.includes('retard') ? 30 : 0) + (codes.includes('sous-planifiee') ? 20 : 0),
      });
    }
    return out.sort((p, q) => q.rang - p.rang).slice(0, Number(max) > 0 ? Number(max) : 30);
  }

  // La consigne donnée à l'IA : le contexte de la semaine, les tâches, et la
  // façon de juger. Elle ne place rien : elle estime, en JSON.
  static promptRepartition(candidats, tempsLibre, aujourdhui, familles) {
    const h = (m) => (m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '') : m + ' min');
    const noms = new Map((familles || []).map((f) => [f.id, f]));
    const lignes = (candidats || []).map((c) => {
      const f = noms.get(c.famille);
      const bouts = [c.ref, c.intitule,
        'famille : ' + (f ? f.nom + (f.description ? ' (' + String(f.description).slice(0, 120) + ')' : '') : (c.famille || '?')),
        'statut : ' + c.statut + ', avancement ' + c.avancement + ' %'];
      if (c.echeance) {
        bouts.push('échéance ' + c.echeance + ' (' + (c.joursRestants < 0 ? 'dépassée de ' + (-c.joursRestants) + ' j' : 'dans ' + c.joursRestants + ' j') + ')');
      } else bouts.push('sans échéance');
      if (c.dureeVieJours != null) bouts.push('durée de vie ' + c.dureeVieJours + ' j (début ' + c.debut + ')');
      bouts.push('déjà planifié : ' + h(c.minutesPasseesPlanifiees) + ' passées, ' + h(c.minutesAVenirPlanifiees) + ' à venir');
      if (c.diagnostics.length) bouts.push('signaux : ' + c.diagnostics.join(', '));
      return '- ' + bouts.join(' | ');
    });
    return [
      'Tu aides un doctorant en sciences de gestion à répartir ses tâches sur ses plages libres de la semaine.',
      'Nous sommes le ' + aujourdhui + '. Temps libre restant cette semaine (' + tempsLibre.heureDebut + ' - ' + tempsLibre.heureFin
        + ', jours ouvrés) : ' + h(tempsLibre.minutes) + ', en ' + tempsLibre.nbPlages + ' plage(s).',
      '',
      'Pour CHAQUE tâche ci-dessous, estime :',
      '- taille : « petite » (15 à 45 min : envoyer, répondre, réserver, faire un retour court), « moyenne » (1 à 4 h : lire un article, préparer une réunion, rédiger une note) ou « grosse » (plus de 4 h : lire un ouvrage, rédiger un chapitre, théoriser, construire un cadre).',
      '- effort_restant_min : le temps total qu\'il reste à y passer, en minutes, compte tenu de l\'avancement et des heures déjà planifiées.',
      '- cette_semaine_min : la part à faire CETTE semaine. Échéance cette semaine ou dépassée : tout le reste. Échéance lointaine : une part proportionnelle (effort restant divisé par les semaines restantes), au moins un bloc si la tâche est importante ou qu\'elle s\'étire. 0 si rien ne presse et que la tâche peut attendre.',
      '- bloc_min : la durée idéale d\'un bloc de travail (petite : 15 à 45 ; moyenne : 60 à 120 ; grosse : 120 à 180, travail de concentration).',
      '- moment : « matin » pour un travail de concentration, « apres-midi » pour du travail léger ou relationnel, sinon « indifferent ».',
      '- raison : une phrase courte, en français, qui justifie ta taille et ta part de la semaine (elle sera montrée au doctorant).',
      '',
      'Indices à croiser : le verbe et l\'objet du titre ; la famille ; une longue durée de vie (plusieurs mois entre début et échéance) signale un travail de fond, à faire par blocs réguliers ; une échéance proche avec un titre bref signale une petite tâche urgente ; les heures déjà planifiées et l\'avancement réduisent ce qui reste ; le signal « etire » (échéance repoussée plusieurs fois) appelle au moins un bloc cette semaine.',
      'Ne propose pas de dates ni d\'heures : le placement est fait ensuite.',
      '',
      'Tâches :',
      lignes.join('\n'),
      '',
      'Réponds UNIQUEMENT par un tableau JSON, un objet par tâche, dans cet ordre de champs :',
      '[{"ref":"T000","taille":"moyenne","effort_restant_min":120,"cette_semaine_min":90,"bloc_min":90,"moment":"matin","raison":"..."}]',
    ].join('\n');
  }

  // La réponse de l'IA, vérifiée et bornée. Une tâche inconnue est ignorée ;
  // une valeur absurde est ramenée dans des bornes raisonnables.
  static lireEstimations(reponse, candidats) {
    const refs = new Set((candidats || []).map((c) => c.ref));
    const liste = Array.isArray(reponse) ? reponse
      : (reponse && Array.isArray(reponse.taches) ? reponse.taches : []);
    const borne = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
    const quart = (n) => Math.round(n / 15) * 15;
    const out = [];
    const vus = new Set();
    for (const e of liste) {
      const ref = String((e && e.ref) || '').trim();
      if (!refs.has(ref) || vus.has(ref)) continue;
      vus.add(ref);
      const taille = ['petite', 'moyenne', 'grosse'].includes(e.taille) ? e.taille : 'moyenne';
      const effort = borne(e.effort_restant_min, 15, 6000, taille === 'petite' ? 30 : taille === 'grosse' ? 600 : 120);
      const semaine = quart(borne(e.cette_semaine_min, 0, effort, Math.min(effort, 60)));
      const bloc = Math.max(15, quart(borne(e.bloc_min, 15, 240, taille === 'petite' ? 30 : taille === 'grosse' ? 150 : 90)));
      const moment = ['matin', 'apres-midi'].includes(e.moment) ? e.moment : 'indifferent';
      out.push({ ref, taille, effort, semaine, bloc, moment, raison: String(e.raison || '').trim().slice(0, 240) });
    }
    return out;
  }

  // Le placement, par règles fixes. `ctx` :
  //   jours        tempsLibre.jours ({ jour, plages: [{ debut, fin }] })
  //   dejaParJour  { jour: minutes de créneaux déjà planifiés }
  //   candidats    ceux de candidatsRepartition (ordre de passage, échéances)
  //   heureDebut   début de la plage de travail
  //   maxJourMin   plafond de tâches par jour, déjà planifié compris (360)
  //   reserve      part du temps libre laissée vide (0,2)
  // Règles : les plus pressantes d'abord ; jamais après l'échéance (sauf
  // retard : au plus tôt) ; gros travaux dans les longues plages, le matin
  // s'ils le demandent, un seul bloc par jour ; petites tâches dans la plage
  // qui leur va le mieux, à la suite l'une de l'autre ; un quart d'heure
  // d'air après un rendez-vous ou un autre bloc.
  static placerRepartition(estimations, ctx) {
    const c = ctx || {};
    const mn = (hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : 0; };
    const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const debutJournee = mn(c.heureDebut || '09:00');
    const maxJour = Number(c.maxJourMin) > 0 ? Number(c.maxJourMin) : 360;
    const reserve = Number.isFinite(Number(c.reserve)) ? Math.max(0, Math.min(0.9, Number(c.reserve))) : 0.2;
    const plages = [];
    for (const j of (c.jours || [])) {
      for (const p of (j.plages || [])) {
        let d = mn(p.debut);
        const f = mn(p.fin);
        if (d > debutJournee) d += 15;   // de l'air après ce qui précède
        if (f - d >= 30) plages.push({ jour: j.jour, debut: d, fin: f });
      }
    }
    const libreTotal = plages.reduce((s, p) => s + p.fin - p.debut, 0);
    let budget = Math.floor(libreTotal * (1 - reserve) / 15) * 15;
    const charge = Object.assign({}, c.dejaParJour || {});
    const infos = new Map((c.candidats || []).map((x, i) => [x.ref, Object.assign({ ordre: i }, x)]));
    const ordre = (estimations || []).slice().sort((a, b) =>
      ((infos.get(a.ref) || {}).ordre ?? 999) - ((infos.get(b.ref) || {}).ordre ?? 999));
    const placements = [];
    const nonPlaces = [];
    for (const e of ordre) {
      const info = infos.get(e.ref) || {};
      let besoin = e.semaine;
      if (besoin <= 0) continue;
      const pressee = info.joursRestants != null && info.joursRestants <= 7;
      const limite = info.echeance && info.joursRestants >= 0 ? info.echeance : null;
      const joursPris = new Set();
      while (besoin > 0 && budget >= 15) {
        const possibles = plages.filter((p) => p.fin - p.debut >= Math.min(30, besoin)
          && (!limite || p.jour <= limite)
          && (e.taille === 'petite' || !joursPris.has(p.jour))
          && (charge[p.jour] || 0) + Math.min(30, besoin) <= maxJour);
        if (!possibles.length) break;
        // Un reste court ne se laisse pas traîner au lendemain : jusqu'à une
        // fois et demie le bloc, on le fait d'une traite.
        const voulu = besoin <= e.bloc * 1.5 ? besoin : e.bloc;
        const cle = (p) => {
          const lg = p.fin - p.debut;
          const ajustement = e.taille === 'petite' ? Math.abs(lg - voulu) : (lg >= voulu ? 0 : voulu - lg);
          // « Matin » : un bloc qui commence avant 11 h (commencé à 11 h 45,
          // un bloc de trois heures se passe surtout l'après-midi).
          const moment = e.moment === 'matin' ? (p.debut < 660 ? 0 : 1) : e.moment === 'apres-midi' ? (p.debut >= 720 ? 0 : 1) : 0;
          return [pressee ? p.jour : '', e.taille === 'petite' ? ajustement : moment, e.taille === 'petite' ? moment : ajustement, p.jour, p.debut];
        };
        possibles.sort((a, b) => {
          const ka = cle(a);
          const kb = cle(b);
          for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
          return 0;
        });
        const p = possibles[0];
        const duree = Math.floor(Math.min(voulu, p.fin - p.debut, maxJour - (charge[p.jour] || 0), budget) / 15) * 15;
        if (duree < 15) break;
        placements.push({ ref: e.ref, jour: p.jour, debut: p.jour + 'T' + hm(p.debut),
          fin: p.jour + 'T' + hm(p.debut + duree), minutes: duree });
        p.debut += duree + (e.taille === 'petite' ? 0 : 15);
        if (p.fin - p.debut < 30) plages.splice(plages.indexOf(p), 1);
        besoin -= duree;
        budget -= duree;
        charge[p.jour] = (charge[p.jour] || 0) + duree;
        joursPris.add(p.jour);
      }
      if (besoin > 0) nonPlaces.push({ ref: e.ref, manqueMin: besoin });
    }
    return { placements, nonPlaces, libreMin: libreTotal,
      placeMin: placements.reduce((s, x) => s + x.minutes, 0) };
  }

  // Les placements, dits comme des propositions (le format de
  // proposer_modifications) : une par tâche, ses créneaux, sa justification.
  static propositionsRepartition(placement, estimations, candidats) {
    const est = new Map((estimations || []).map((e) => [e.ref, e]));
    const titres = new Map((candidats || []).map((c) => [c.ref, c.intitule]));
    const parRef = new Map();
    for (const p of (placement.placements || [])) {
      if (!parRef.has(p.ref)) parRef.set(p.ref, []);
      parRef.get(p.ref).push({ debut: p.debut, fin: p.fin });
    }
    const out = [];
    for (const [ref, creneaux] of parRef) {
      const e = est.get(ref) || {};
      const taille = { petite: 'petite tâche', moyenne: 'tâche moyenne', grosse: 'gros travail' }[e.taille] || '';
      out.push({ ref, intitule: titres.get(ref) || ref, ajouter_creneaux: creneaux,
        justification: [taille, e.raison].filter(Boolean).join(' : ') });
    }
    return out;
  }

  //#endregion Ariane · static · tâches
};
