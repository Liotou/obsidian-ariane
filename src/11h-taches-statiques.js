
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
      liste: 'Liste', 'rappel-id': 'Rappel ID',
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
  // encore dans son entête. « Existe » = la clé est présente, même vide.
  static proprietesManquantes(fm, famille) {
    const props = (famille && Array.isArray(famille.proprietes)) ? famille.proprietes : [];
    const cles = new Set(Object.keys(fm || {}));
    return props
      .filter((p) => p && p.cle && !cles.has(p.cle))
      .map((p) => ({ cle: p.cle, type: p.type || 'texte' }));
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
    l.push('type: tache');
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
    l.push('---');
    l.push('');
    l.push('# ' + intitule);
    l.push('');
    l.push('## Note de travail');
    l.push('');
    l.push('## Journal');
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
    if (!fm || fm.type !== 'tache') return null;
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

  //#endregion Ariane · static · tâches
};
