//#region 12 · ArianeSettingTab
// ═══════════════════════════════════════════════════════════════════════════
//  12 · ARIANESETTINGTAB
//  L'onglet de réglages du greffon : une méthode par onglet (ongletGeneral,
//  ongletDossiers, ongletTaches…), plus les fabriques de tableaux de familles.
// ═══════════════════════════════════════════════════════════════════════════

class ArianeSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const maj = async () => this.plugin.saveSettings();
    containerEl.createEl('h2', { text: tr('Ariane') });

    const onglets = [
      [tr('Général'), 'settings', (c) => this.ongletGeneral(c, s, maj)],
      [tr('Dossiers & familles'), 'folder-tree', (c) => this.ongletDossiers(c, s, maj)],
      [tr('Affichage'), 'eye', (c) => this.ongletAffichage(c, s, maj)],
      [tr('Citations & bibliographie'), 'quote', (c) => this.ongletCitations(c, s, maj)],
      [tr('Suggestions'), 'sparkles', (c) => this.ongletSuggestions(c, s, maj)],
      [tr('Tâches'), 'list-checks', (c) => this.ongletTaches(c, s, maj)],
      [tr('Contenu des notes'), 'file-text', (c) => this.ongletContenu(c, s, maj)],
      [tr('Références & auteurs'), 'users', (c) => this.ongletReferences(c, s, maj)],
      [tr('Temps passé'), 'timer', (c) => this.ongletTemps(c, s, maj)],
      [tr('Schémas'), 'git-branch', (c) => this.ongletSchemas(c, s, maj)],
      [tr('Export Word'), 'file-output', (c) => this.ongletExport(c, s, maj)],
      [tr('Avancé'), 'wrench', (c) => this.ongletAvance(c, s, maj)],
    ];
    if (typeof this._ongletActif !== 'number' || this._ongletActif >= onglets.length) this._ongletActif = 0;
    this._sousOngletActif = this._sousOngletActif || {};

    // Rangée 1 : onglets primaires en icônes seules (le titre est l'infobulle).
    const barre = containerEl.createDiv({ cls: 'zfa-onglets zfa-onglets-primaire' });
    // Rangée 2 : sous-onglets, un par section (titre en gras) de l'onglet actif.
    const sousBarre = containerEl.createDiv({ cls: 'zfa-sous-onglets' });
    const corps = containerEl.createDiv({ cls: 'zfa-reglages-corps' });

    // Coupe le contenu d'un onglet en tranches délimitées par ses titres de
    // section (Setting.setHeading -> .setting-item-heading).
    const decouper = (hote) => {
      const chunks = [];
      let cur = { titre: null, els: [] };
      for (const el of Array.from(hote.children)) {
        if (el.classList && el.classList.contains('setting-item-heading')) {
          if (cur.els.length || cur.titre !== null) chunks.push(cur);
          const nomEl = el.querySelector('.setting-item-name');
          cur = { titre: nomEl ? nomEl.textContent : '', els: [] };
          el.addClass('zfa-sous-titre');
        }
        cur.els.push(el);
      }
      if (cur.els.length) chunks.push(cur);
      // Un préambule sans titre est rattaché à la première section titrée.
      if (chunks.length > 1 && chunks[0].titre === null) {
        chunks[1].els = chunks[0].els.concat(chunks[1].els);
        chunks.shift();
      }
      return chunks;
    };

    const rendreSous = (chunks, prim) => {
      sousBarre.empty();
      corps.empty();
      if (chunks.length <= 1) {
        sousBarre.style.display = 'none';
        for (const ch of chunks) for (const el of ch.els) corps.appendChild(el);
        return;
      }
      sousBarre.style.display = '';
      let sel = this._sousOngletActif[prim] || 0;
      if (sel >= chunks.length) sel = 0;
      chunks.forEach((ch, k) => {
        const b = sousBarre.createEl('button', { cls: 'zfa-sous-onglet',
          text: ch.titre || tr('Général') });
        b.toggleClass('is-active', k === sel);
        b.onclick = () => { this._sousOngletActif[prim] = k; rendreSous(chunks, prim); };
      });
      for (const el of chunks[sel].els) corps.appendChild(el);
    };

    const rendre = (i) => {
      this._ongletActif = i;
      Array.from(barre.children).forEach((b, k) => b.toggleClass('is-active', k === i));
      const tmp = containerEl.createDiv();
      tmp.style.display = 'none';
      onglets[i][2](tmp);
      const chunks = decouper(tmp);
      rendreSous(chunks, i);
      tmp.remove();
    };

    onglets.forEach(([nom, icone], i) => {
      const b = barre.createEl('button', { cls: 'zfa-onglet' });
      const ic = b.createSpan({ cls: 'zfa-onglet-icone' });
      obsidian.setIcon(ic, icone);
      b.setAttribute('aria-label', nom);
      b.title = nom;
      b.onclick = () => rendre(i);
    });
    rendre(this._ongletActif);
  }

  /* ---------------- Table des familles de notes (réglages) --------------- */

  // Une ligne par famille, réordonnable au glisser-déposer. C'est le cœur de
  // la généralisation : plus aucun type de note n'est nommé dans le code, tout
  // vient d'ici.
  _tableFamilles(parent, s, maj) {
    const rendre = () => {
      hote.empty();
      const familles = Array.isArray(s.famillesNotes) ? s.famillesNotes : (s.famillesNotes = []);
      if (!familles.length) {
        hote.createDiv({ cls: 'zfa-fam-vide', text: tr("Aucune famille. Ajoutez-en une, ou laissez Ariane proposer celles de votre coffre.") });
      }
      familles.forEach((f, i) => {
        const ligne = hote.createDiv({ cls: 'zfa-fam' });
        ligne.setAttribute('draggable', 'true');

        // Réordonnancement : on ne transporte que le rang, jamais l'objet.
        ligne.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.setData('text/zfa-famille', String(i));
          ev.dataTransfer.effectAllowed = 'move';
          ligne.addClass('zfa-fam-glissee');
        });
        ligne.addEventListener('dragend', () => ligne.removeClass('zfa-fam-glissee'));
        ligne.addEventListener('dragover', (ev) => {
          if (!ev.dataTransfer.types.includes('text/zfa-famille')) return;
          ev.preventDefault(); ligne.addClass('zfa-fam-cible');
        });
        ligne.addEventListener('dragleave', () => ligne.removeClass('zfa-fam-cible'));
        ligne.addEventListener('drop', async (ev) => {
          ligne.removeClass('zfa-fam-cible');
          const depuis = parseInt(ev.dataTransfer.getData('text/zfa-famille'), 10);
          if (isNaN(depuis) || depuis === i) return;
          ev.preventDefault();
          const [x] = familles.splice(depuis, 1);
          familles.splice(i, 0, x);
          await maj(); rendre();
        });

        const tete = ligne.createDiv({ cls: 'zfa-fam-tete' });
        const poignee = tete.createSpan({ cls: 'zfa-fam-poignee' });
        obsidian.setIcon(poignee, 'grip-vertical');
        poignee.setAttribute('aria-label', tr('Glisser pour réordonner'));

        const nom = tete.createEl('input', { cls: 'zfa-fam-nom', type: 'text' });
        nom.placeholder = tr('Nom de la famille');
        nom.value = f.nom || '';
        nom.onchange = async () => { f.nom = nom.value.trim(); await maj(); };

        const pastille = tete.createEl('input', { cls: 'zfa-fam-couleur', type: 'color' });
        pastille.value = f.couleur || '#888888';
        pastille.setAttribute('aria-label', tr('Couleur dans le panneau de suggestions'));
        pastille.onchange = async () => { f.couleur = pastille.value; await maj(); };

        const icone = tete.createEl('input', { cls: 'zfa-fam-icone', type: 'text' });
        icone.placeholder = tr('icône');
        icone.value = f.icone || '';
        icone.setAttribute('aria-label', tr("Nom d'icône Lucide, ex. « book »"));
        icone.onchange = async () => { f.icone = icone.value.trim(); await maj(); };

        const monter = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(monter, 'chevron-up');
        monter.setAttribute('aria-label', tr('Monter'));
        monter.onclick = async () => {
          if (i === 0) return;
          familles.splice(i - 1, 0, familles.splice(i, 1)[0]); await maj(); rendre();
        };
        const descendre = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(descendre, 'chevron-down');
        descendre.setAttribute('aria-label', tr('Descendre'));
        descendre.onclick = async () => {
          if (i >= familles.length - 1) return;
          familles.splice(i + 1, 0, familles.splice(i, 1)[0]); await maj(); rendre();
        };
        const suppr = tete.createEl('button', { cls: 'zfa-fam-bouton zfa-fam-suppr' });
        obsidian.setIcon(suppr, 'trash-2');
        suppr.setAttribute('aria-label', tr('Retirer cette famille'));
        suppr.onclick = async () => { familles.splice(i, 1); await maj(); rendre(); this.plugin.decorerExplorateur(); };

        const corps = ligne.createDiv({ cls: 'zfa-fam-corps' });
        const champ = (libelle, valeur, aide, sur) => {
          const bloc = corps.createDiv({ cls: 'zfa-fam-champ' });
          bloc.createEl('label', { text: libelle });
          const e = bloc.createEl('input', { type: 'text' });
          e.value = valeur; e.placeholder = aide;
          e.onchange = async () => { await sur(e.value); };
          return e;
        };
        champ(tr('Dossiers'), (f.dossiers || []).join(', '),
          tr('un ou plusieurs, séparés par des virgules'),
          async (v) => {
            f.dossiers = v.split(',').map((x) => x.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
            await maj(); this.plugin.invaliderIndexSuggestions(); this.plugin.decorerExplorateur();
          });
        champ(tr('Préfixe'), f.prefixe || '', 'ex. NC-  (facultatif)',
          async (v) => { f.prefixe = v.trim(); await maj(); });

        const cases = ligne.createDiv({ cls: 'zfa-fam-cases' });
        const bascule = (libelle, cle, aide, apres) => {
          const et = cases.createEl('label', { cls: 'zfa-fam-case' });
          const cb = et.createEl('input', { type: 'checkbox' });
          cb.checked = !!f[cle];
          et.createSpan({ text: libelle });
          if (aide) et.setAttribute('aria-label', aide);
          cb.onchange = async () => { f[cle] = cb.checked; await maj(); if (apres) apres(); };
        };
        bascule(tr('Aparté'), 'aparte', tr("Afficher le titre après un lien vers une note de cette famille"));
        bascule(tr('Suggestions'), 'suggestions', tr('Ces notes nourrissent le panneau de suggestions'),
          () => this.plugin.invaliderIndexSuggestions());
        bascule(tr('Chasse fixe'), 'monospace', tr("Police à largeur fixe dans l'explorateur"),
          () => this.plugin.decorerExplorateur());
        bascule(tr('Alias'), 'alias', tr("Afficher l'alias plutôt que le nom de fichier"),
          () => this.plugin.decorerExplorateur());
      });
    };

    const hote = parent.createDiv({ cls: 'zfa-familles' });
    const barre = parent.createDiv({ cls: 'zfa-fam-barre' });
    new obsidian.Setting(barre)
      .addButton((b) => b.setButtonText(tr('Ajouter une famille')).setCta().onClick(async () => {
        (s.famillesNotes = s.famillesNotes || []).push({
          nom: '', dossiers: [], prefixe: '', aparte: true,
          suggestions: false, couleur: '', icone: '', monospace: false, alias: false,
        });
        await maj(); rendre();
      }))
      .addButton((b) => b.setButtonText(tr('Proposer depuis mon coffre')).onClick(async () => {
        const proposees = this.plugin.familiesProposees();
        if (!proposees.length) { new obsidian.Notice(tr('Aucun dossier à proposer.')); return; }
        s.famillesNotes = (s.famillesNotes || []).concat(proposees);
        await maj(); rendre();
        new obsidian.Notice(proposees.length + ' famille(s) proposée(s) — à ajuster.');
      }));
    rendre();
  }

  _section(parent, titre, desc) {
    const st = new obsidian.Setting(parent).setName(titre).setHeading();
    if (desc) st.setDesc(desc);
    return st;
  }
  _aide(parent, txt) {
    const p = parent.createEl('div', { text: txt, cls: 'setting-item-description' });
    p.style.margin = '2px 0 10px';
    return p;
  }

  _sectionProfil(c, s, maj) {
    this._section(c, tr('Profil de réglages'));
    this._aide(c, tr("Un profil rassemble vos réglages pour les partager ou les retrouver ailleurs. Les chemins propres à cette machine — pandoc, filtre Lua, modèle Word, adresses des services d'inférence — n'y figurent jamais, et un profil importé ne les touche pas."));
    new obsidian.Setting(c)
      .setName(tr('Exporter'))
      .setDesc(tr("Écrit un fichier JSON dans le dossier du greffon. « Avec organisation » y ajoute vos dossiers et vos familles de notes ; sans, le profil ne contient que les réglages de fonctionnement."))
      .addButton((b) => b.setButtonText(tr('Exporter')).onClick(async () => {
        try {
          const chemin = await this.plugin.ecrireProfil(false);
          new obsidian.Notice(tr('Profil écrit : ') + chemin);
        } catch (e) { new obsidian.Notice(tr('Échec : ') + (e && e.message ? e.message : e)); }
      }))
      .addButton((b) => b.setButtonText(tr('Avec organisation')).onClick(async () => {
        try {
          const chemin = await this.plugin.ecrireProfil(true);
          new obsidian.Notice(tr('Profil écrit : ') + chemin);
        } catch (e) { new obsidian.Notice(tr('Échec : ') + (e && e.message ? e.message : e)); }
      }));
    new obsidian.Setting(c)
      .setName(tr('Importer'))
      .setDesc(tr("Collez ici le contenu d'un fichier de profil. Les réglages inconnus sont ignorés."))
      .addTextArea((t) => {
        t.inputEl.rows = 3;
        t.setPlaceholder(tr('{ "ariane": "…", "profil": { … } }'));
        this._profilColle = '';
        t.onChange((v) => { this._profilColle = v; });
      })
      .addButton((b) => b.setButtonText(tr('Importer')).setWarning().onClick(async () => {
        if (!this._profilColle || !this._profilColle.trim()) { new obsidian.Notice(tr('Rien à importer.')); return; }
        const r = await this.plugin.importerProfil(this._profilColle);
        if (r.erreur) { new obsidian.Notice(r.erreur); return; }
        new obsidian.Notice(r.poses + ' réglage(s) repris' + (r.version ? ' (profil Ariane ' + r.version + ')' : '') + '.');
        this.display();
      }));
  }

  ongletGeneral(c, s, maj) {
    new obsidian.Setting(c)
      .setName(tr('Langue'))
      .setDesc(tr("« Automatique » suit la langue d'Obsidian. Le greffon parle français et anglais ; toute autre langue affiche l'anglais."))
      .addDropdown((d) => d
        .addOption('auto', tr('Automatique'))
        .addOption('fr', tr('Français'))
        .addOption('en', tr('English'))
        .setValue(s.langue || 'auto')
        .onChange(async (v) => { s.langue = v; definirLangue(v); await maj(); this.display(); }));

    this._sectionProfil(c, s, maj);
    new obsidian.Setting(c)
      .setName(tr('Ré-atomiser tout le coffre'))
      .setDesc(tr('Régénère toutes les annotations à partir des sources.'))
      .addButton((b) => b.setButtonText(tr('Lancer')).setCta().onClick(() => this.plugin.atomiserTout()));

    this._section(c, tr('Automatisation'));
    new obsidian.Setting(c)
      .setName(tr('Régénération automatique'))
      .setDesc(tr('Régénère les annotations à chaque modification de la source.'))
      .addToggle((t) => t.setValue(s.regenerationAuto).onChange(async (v) => { s.regenerationAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Verrouiller les notes automatiques'))
      .setDesc(tr('Restaure toute édition manuelle des notes générées.'))
      .addToggle((t) => t.setValue(s.verrouillage).onChange(async (v) => { s.verrouillage = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Notes verrouillées non modifiables'))
      .setDesc(tr('Les notes portant « locked: true » (fiches graphiques, notes importées) ne peuvent pas être éditées par inadvertance.'))
      .addToggle((t) => t.setValue(s.verrouLecture !== false).onChange(async (v) => {
        s.verrouLecture = v; await maj(); this.plugin.appliquerVerrouLecture();
      }));
    new obsidian.Setting(c)
      .setName(tr('Propager les suppressions'))
      .setDesc(tr("Supprime la note quand l'annotation disparaît de la source et retire ses liens. Action destructive."))
      .addToggle((t) => t.setValue(s.propagerSuppressions).onChange(async (v) => { s.propagerSuppressions = v; await maj(); }));

    this._section(c, tr('Renommer une propriété'));
    this._aide(c, tr("Changer le nom d'une propriété dans les réglages ne vaut que pour les écritures à venir : les notes déjà écrites gardent l'ancien nom. Cet outil reporte l'ancienne valeur sur la nouvelle dans tout le coffre. Une note qui porte déjà la nouvelle propriété n'est jamais écrasée."));
    this._renAncien = this._renAncien || '';
    this._renNouveau = this._renNouveau || '';
    new obsidian.Setting(c)
      .setName(tr('Ancien nom → nouveau nom'))
      .addText((t) => t.setPlaceholder(tr('temps-passe')).setValue(this._renAncien).onChange((v) => { this._renAncien = v.trim(); }))
      .addText((t) => t.setPlaceholder(tr('temps')).setValue(this._renNouveau).onChange((v) => { this._renNouveau = v.trim(); }))
      .addButton((b) => b.setButtonText(tr('Compter')).onClick(() => {
        const n = this.plugin.notesAvecPropriete(this._renAncien).length;
        new obsidian.Notice(this._renAncien
          ? n + ' note(s) portent « ' + this._renAncien + ' ».'
          : tr('Indiquez le nom actuel de la propriété.'));
      }))
      .addButton((b) => b.setButtonText(tr('Renommer')).setWarning().onClick(async () => {
        if (!this._renAncien || !this._renNouveau) { new obsidian.Notice(tr('Indiquez les deux noms.')); return; }
        const avis = new obsidian.Notice(tr('Renommage en cours…'), 0);
        const r = await this.plugin.renommerPropriete(this._renAncien, this._renNouveau);
        avis.hide();
        new obsidian.Notice(r.faites + ' note(s) renommée(s)'
          + (r.ignorees ? ', ' + r.ignorees + ' laissée(s) intacte(s)' : '')
          + (r.echecs ? ', ' + r.echecs + ' en échec' : '') + '.');
      }));

    new obsidian.Setting(c)
      .setName(tr('Correspondances de références mémorisées'))
      .setDesc(tr("Les rapprochements que vous avez confirmés à la main entre une référence en attente et une source Zotero. Les oublier vous fera reposer la question."))
      .addButton((b) => b.setButtonText(tr('Oublier')).setWarning().onClick(async () => {
        const n = Object.keys(s.correspondancesSuffixe || {}).length;
        s.correspondancesSuffixe = {};
        await maj();
        new obsidian.Notice(n + ' correspondance(s) oubliée(s).');
      }));

    this._section(c, tr('Réinitialisation'));
    new obsidian.Setting(c)
      .setName(tr('Rétablir les réglages par défaut'))
      .addButton((b) =>
        b.setButtonText(tr('Réinitialiser')).setWarning().onClick(async () => {
          this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          await this.plugin.saveSettings();
          this.display();
        })
      );
  }

  ongletDossiers(c, s, maj) {
    // ---- Les RÔLES : les emplacements dont Ariane a besoin pour travailler.
    // Ils sont vides par défaut : le greffon ne présume d'aucune organisation.
    this._section(c, tr('Rôles — où Ariane range ses productions'));
    this._aide(c, tr("Ces dossiers ne décrivent pas vos types de notes, mais les emplacements dont Ariane a besoin. Laissez vide ce dont vous ne vous servez pas."));
    const role = (nom, cle, desc) => new obsidian.Setting(c)
      .setName(nom).setDesc(desc)
      .addText((t) => t.setValue(s[cle] || '').setPlaceholder(tr('chemin dans le coffre'))
        .onChange(async (v) => { s[cle] = v.trim().replace(/^\/+|\/+$/g, ''); await maj(); }));
    role(tr('Annotations atomisées'), 'dossierAnnotations', tr("Une note par annotation Zotero."));
    role(tr('Notes de lecture'), 'dossierNotesLecture', tr("Notes-filles Zotero, attachées à la référence entière."));
    role(tr('Références en attente'), 'dossierReferences', tr("Références citées mais pas encore dans Zotero."));
    role(tr('Bibliographies citées'), 'dossierBibliographies', tr("Une note de bibliographie par source."));
    role(tr('Documents exportés'), 'exportDossier', tr("Sortie de l'export Word."));
    role(tr('Journal du temps'), 'tempsDossierJournal', tr("Journaux quotidiens du compteur de temps."));
    new obsidian.Setting(c)
      .setName(tr('Sources à ne jamais atomiser'))
      .setDesc(tr("Une clé de citation par ligne. Certains modules de Zotero rangent leurs réglages dans un élément de la bibliothèque, qui remonte alors comme une source : « AddonItem » en est le cas le plus courant. Les notes sans prose sont déjà écartées d'elles-mêmes."))
      .addTextArea((t) => {
        t.inputEl.rows = 3;
        t.setPlaceholder('AddonItem');
        t.setValue((s.sourcesExclues || []).join('\n'));
        t.onChange(async (v) => {
          s.sourcesExclues = v.split('\n').map((x) => x.trim().replace(/^@/, '')).filter(Boolean);
          await maj();
        });
      });
    new obsidian.Setting(c)
      .setName(tr('Atomiser les notes de lecture'))
      .setDesc(tr("Les notes-filles Zotero — attachées à la référence entière, non à un passage — deviennent des notes à part, citables et reliées à leur source."))
      .addToggle((t) => t.setValue(s.atomiserNotesLecture !== false).onChange(async (v) => { s.atomiserNotesLecture = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Détecter les dossiers de mon coffre'))
      .setDesc(tr("Propose un rôle par dossier dont le nom s'en approche. Rien n'est écrit sans votre relecture."))
      .addButton((b) => b.setButtonText(tr('Proposer')).onClick(async () => {
        const n = this.plugin.proposerRoles();
        await maj(); this.display();
        new obsidian.Notice(n ? n + ' rôle(s) proposé(s) — vérifiez-les.' : tr('Rien à proposer.'));
      }));

    this._section(c, tr("Nommage des annotations"));
    new obsidian.Setting(c)
      .setName(tr('Regrouper par source'))
      .setDesc(tr('Range chaque annotation dans un sous-dossier au nom de sa source (@citekey).'))
      .addToggle((t) => t.setValue(s.regrouperParSource).onChange(async (v) => { s.regrouperParSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Format du nom de fichier'))
      .setDesc(tr('Variables : {{key}}, {{title}}. Ex. « {{key}}_{{title}} » (recommandé), « {{title}} » ou « {{key}} ».'))
      .addText((t) => t.setValue(s.formatNomFichier).onChange(async (v) => { s.formatNomFichier = v.trim() || '{{key}}_{{title}}'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Modèle d'alias"))
      .setDesc(tr("Variables : {{key}}, {{title}}. Vide = pas d'alias."))
      .addText((t) => t.setValue(s.aliasTemplate).onChange(async (v) => { s.aliasTemplate = v; await maj(); }));

    // ---- Les FAMILLES : la description de VOTRE organisation.
    this._section(c, tr('Familles de notes'));
    this._aide(c, tr("Décrivez vos types de notes. Une famille couvre un ou plusieurs dossiers, éventuellement un préfixe de nom, et dit ce qu'Ariane doit en faire : afficher le titre après les liens, nourrir les suggestions, changer l'apparence dans l'explorateur. Glissez les lignes pour les réordonner — la première qui couvre une note l'emporte."));
    this._tableFamilles(c, s, maj);
  }

  ongletAffichage(c, s, maj) {
    this._section(c, tr('Aparté (titre sur les liens)'));
    new obsidian.Setting(c)
      .setName(tr('Afficher le titre en aparté'))
      .setDesc(tr("Ajoute le titre après un lien d'annotation ou de note conceptuelle qui affiche la clé (lecture et édition)."))
      .addToggle((t) => t.setValue(s.aliasSurLiens).onChange(async (v) => { s.aliasSurLiens = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Aperçu au survol hors éditeur'))
      .setDesc(tr("Affiche l'aperçu natif au survol des liens internes dans les vues qui ne le font pas (ex. chat Claudian, panneaux)."))
      .addToggle((t) => t.setValue(s.hoverPartout !== false).onChange(async (v) => { s.hoverPartout = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('— Aparté sur les annotations'))
      .setDesc(tr('Afficher l’aparté pour les liens vers des notes d’annotation.'))
      .addToggle((t) => t.setValue(s.aparteAnnotations).setDisabled(!s.aliasSurLiens).onChange(async (v) => { s.aparteAnnotations = v; await maj(); }));
    this._aide(c, tr("L'aparté sur les autres notes, et l'affichage de l'alias dans l'explorateur, se règlent famille par famille — onglet « Dossiers & familles »."));

    new obsidian.Setting(c).setName(tr('Noms codés en police monospace')).setHeading();
    this._aide(c, tr("Affiche en police à largeur fixe les notes des dossiers listés. Liste vide : aucun. Le texte reste normal (recherche et tri intacts)."));
    new obsidian.Setting(c)
      .setName(tr('Police'))
      .setDesc(tr('Nom de la police monospace (vide = police de code d’Obsidian).'))
      .addText((t) => t.setPlaceholder(tr('var(--font-monospace)')).setValue(s.nomsMonospaceFont || '').onChange(async (v) => { s.nomsMonospaceFont = v.trim(); await maj(); this.plugin.appliquerStyleAparte(); }));
    this._aide(c, tr("Les dossiers concernés se cochent famille par famille — onglet « Dossiers & familles »."));
    new obsidian.Setting(c)
      .setName(tr("Format de l'aparté"))
      .setDesc(tr("Variables : {{alias}} (titre), {{key}}, {{auteur}}, {{auteurs}}, {{annee}}. Ex. « ({{alias}}) », « ({{auteur}}, {{annee}}) »."))
      .addText((t) => t.setValue(s.modeleAparte).onChange(async (v) => { s.modeleAparte = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Couleur de l'aparté"))
      .setDesc(tr("Couleur CSS. Vide = atténuée. Ex. « #999 », « var(--text-faint) »."))
      .addText((t) => t.setValue(s.aparteCouleur).onChange(async (v) => { s.aparteCouleur = v.trim(); await maj(); this.plugin.appliquerStyleAparte(); }));
    new obsidian.Setting(c)
      .setName(tr("Taille de l'aparté"))
      .setDesc(tr("Ex. « 0.8em », « 11px »."))
      .addText((t) => t.setValue(s.aparteTaille).onChange(async (v) => { s.aparteTaille = v.trim() || '0.8em'; await maj(); this.plugin.appliquerStyleAparte(); }));

  }

  ongletCitations(c, s, maj) {
    this._section(c, tr('Citations indirectes'));
    this._aide(c, tr("Quand une annotation rapporte des travaux que vous n'avez pas consultés, la source consultée porte un compteur des travaux qu'elle rapporte, au lieu de les nommer tous dans le fil du texte. Le survol du compteur les affiche en liens cliquables. Les références déjà présentes dans Zotero restent citées en clair, puisque vous les avez lues. Après changement, lancer « Citations : rafraîchir les libellés » pour réécrire les notes."));
    new obsidian.Setting(c)
      .setName(tr('Abréger les citations indirectes'))
      .setDesc(tr("Décoché, tous les auteurs rapportés sont nommés, suivis de « cité dans » et de la source."))
      .addToggle((t) => t.setValue(s.citationsIndirectesAbregees !== false).onChange(async (v) => {
        s.citationsIndirectesAbregees = v; await maj();
      }));
    new obsidian.Setting(c)
      .setName(tr('Forme du compteur'))
      .setDesc(tr("{{n}} tient la place du nombre de travaux rapportés."))
      .addText((t) => t.setValue(s.citationsMarqueEmprunt || '⟨{{n}}⟩').onChange(async (v) => {
        s.citationsMarqueEmprunt = v.trim() || '⟨{{n}}⟩'; await maj();
      }));

    this._section(c, tr('Repliement des citations'));
    this._aide(c, tr("Une citation entre parenthèses cède la place à une pastille portant le nombre de références. Un clic sur la pastille déplie cette citation seule ; les commandes « Citations : tout replier » et « tout déplier » agissent sur l'ensemble, comme le bouton de la barre latérale. En édition, une citation se déplie d'elle-même dès que le curseur y entre."));
    new obsidian.Setting(c)
      .setName(tr('Activer le repliement'))
      .setDesc(tr('Décoché, les citations restent toujours visibles et les commandes sans effet.'))
      .addToggle((t) => t.setValue(s.citationsRepliables !== false).onChange(async (v) => {
        s.citationsRepliables = v; await maj(); this.plugin.appliquerEtatCitations();
      }));
    new obsidian.Setting(c)
      .setName(tr('Replier par défaut'))
      .setDesc(tr("État au démarrage. Les commandes le modifient et l'enregistrent."))
      .addToggle((t) => t.setValue(s.citationsRepliees === true).onChange(async (v) => {
        s.citationsRepliees = v; await maj(); this.plugin.appliquerEtatCitations();
      }));

    this._section(c, tr('Glisser-déposer & notes de bas de page'));
    new obsidian.Setting(c)
      .setName(tr('Déposer une note sur un paragraphe'))
      .setDesc(tr("Glisser un lien de note sur un paragraphe l'ajoute à sa note de bas de page. Déposer ailleurs reste normal."))
      .addToggle((t) => t.setValue(s.dropSurParagraphe).onChange(async (v) => { s.dropSurParagraphe = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Signaler les dépôts non reconnus'))
      .setDesc(tr("Affiche un message quand un élément déposé ne correspond à aucune note du coffre, au lieu de ne rien faire."))
      .addToggle((t) => t.setValue(s.dropSignalerRefus !== false).onChange(async (v) => { s.dropSignalerRefus = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Accepter n'importe quelle note"))
      .setDesc(tr("Si activé, tout lien de note peut être déposé. Sinon, seules les annotations."))
      .addToggle((t) => t.setValue(s.dropToutesNotes).onChange(async (v) => { s.dropToutesNotes = v; await maj(); }));
    this._aide(c, tr('Cible automatique : en survolant le texte, l’appel de note se place en fin de la phrase visée ; en survolant la marge gauche du paragraphe, il se place en fin de paragraphe. La zone visée est surlignée pendant le glisser.'));
    new obsidian.Setting(c)
      .setName(tr('Titre de la section des notes'))
      .addText((t) => t.setValue(s.titreSectionNotes).onChange(async (v) => { s.titreSectionNotes = v.trim() || 'Annotations de lecture associées'; await maj(); }));

    new obsidian.Setting(c).setName(tr('Citations')).setHeading();
    this._aide(c, tr('Une annotation ou une source déposée sur une phrase insère sa référence en ligne, entre parenthèses, avant la ponctuation finale.'));
    new obsidian.Setting(c)
      .setName(tr('Format de la citation'))
      .setDesc(tr('Variables : {{auteurs}}, {{auteursComplets}}, {{annee}}, {{page}}, {{key}}. Les fragments restés vides sont retirés.'))
      .addText((t) => t.setValue(s.modeleCitation || '').onChange(async (v) => { s.modeleCitation = v.trim() || '{{auteurs}}, {{annee}}, p. {{page}}'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Apparat « cité dans »'))
      .setDesc(tr("Quand une annotation cite un travail absent de Zotero — donc non consulté directement — la citation prend la forme « Moulin et Gérard, 2026, p. 345, cité dans Aven, 2012, p. 34 ». Si ce travail figure dans Zotero, il est cité directement. Texte inséré entre les deux références :"))
      .addText((t) => t.setValue(s.citeDans != null ? s.citeDans : ', cité dans ').onChange(async (v) => { s.citeDans = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Séparateur entre citations'))
      .addText((t) => t.setValue(s.separateurCitation || '').onChange(async (v) => { s.separateurCitation = v || ' ; '; await maj(); }));

    new obsidian.Setting(c).setName(tr('Bibliographie de fin de note')).setHeading();
    this._aide(c, tr('Ariane relève les annotations et les sources citées dans le corps de la note, puis entretient une bibliographie en fin de note, à la manière de Zotero dans Word.'));
    new obsidian.Setting(c)
      .setName(tr('Mise à jour automatique'))
      .setDesc(tr('Régénère la bibliographie après une pause dans la frappe.'))
      .addToggle((t) => t.setValue(s.biblioAuto !== false).onChange(async (v) => { s.biblioAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Titre de la section'))
      .addText((t) => t.setValue(s.biblioTitre || '').onChange(async (v) => { s.biblioTitre = v.trim() || 'Bibliographie'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Champ de référence formatée'))
      .setDesc(tr('Propriété des notes sources contenant la référence mise en forme par zotflow (filtre « bibliography »). Le style se règle dans zotflow. Champ absent : Ariane utilise le modèle libre ci-dessous.'))
      .addText((t) => t.setValue(s.biblioChamp || '').onChange(async (v) => { s.biblioChamp = v.trim() || 'bibliographie'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Renvoi vers la note source'))
      .setDesc(tr('Ajoute un lien après chaque référence. Il est placé à la suite, et non autour du texte, afin de préserver les italiques du style bibliographique.'))
      .addToggle((t) => t.setValue(s.biblioLien !== false).onChange(async (v) => { s.biblioLien = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Libellé du renvoi'))
      .addText((t) => t.setValue(s.biblioLienTexte != null ? s.biblioLienTexte : '↗').onChange(async (v) => { s.biblioLienTexte = v || '↗'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Format des entrées (repli, si le champ est absent)'))
      .setDesc(tr('Variables : {{auteurs}}, {{auteursComplets}}, {{annee}}, {{titre}}, {{publication}}, {{doi}}, {{url}}, {{type}}, {{cle}}. Les fragments vides sont retirés.'))
      .addTextArea((t) => {
        t.inputEl.rows = 2;
        t.setValue(s.biblioModele || '');
        t.onChange(async (v) => { s.biblioModele = v.trim() || '{{auteurs}} ({{annee}}). {{titre}}. *{{publication}}*.'; await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Ordre'))
      .addDropdown((d) => {
        d.addOption('auteur', tr('Alphabétique (auteur, année)'));
        d.addOption('apparition', tr('Ordre d’apparition dans la note'));
        d.setValue(s.biblioTri === 'apparition' ? 'apparition' : 'auteur');
        d.onChange(async (v) => { s.biblioTri = v; await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Supprimer les notes de bas de page orphelines'))
      .setDesc(tr("Quand l'appel [^n] disparaît, retire sa définition. N'agit que sur les notes contenant des liens d'annotation."))
      .addToggle((t) => t.setValue(s.nettoyerNotesOrphelines).onChange(async (v) => { s.nettoyerNotesOrphelines = v; await maj(); }));

    this._section(c, tr('Graphe'));
    new obsidian.Setting(c)
      .setName(tr('Taguer les annotations non citées'))
      .setDesc(tr('Ajoute un tag aux annotations à zéro appel, pour les colorer dans le graphe.'))
      .addToggle((t) => t.setValue(s.marquerOrphelines).onChange(async (v) => {
        s.marquerOrphelines = v;
        await maj();
        if (v) this.plugin.synchroniserTagsOrphelines();
        else this.plugin.retirerTousTagsOrphelines();
      }));
    new obsidian.Setting(c)
      .setName(tr('Nom du tag « orpheline »'))
      .setDesc('Sans le #. Utilisez « tag:#' + (s.tagOrpheline || 'orphelin') + ' » dans un groupe du graphe.')
      .addText((t) => t.setValue(s.tagOrpheline).onChange(async (v) => { s.tagOrpheline = v.trim().replace(/^#/, '') || 'orphelin'; await maj(); }));
  }

  ongletTemps(c, s, maj) {
    this._aide(c, tr("Le compteur mesure le temps passé dans une note ouverte en édition. Il se met en pause dès que le clavier et la souris se taisent, ou que la fenêtre perd le focus : il compte donc le travail effectif, non la présence devant l'écran. Le total est inscrit en minutes dans une propriété de la note."));

    new obsidian.Setting(c)
      .setName(tr('Activer le compteur'))
      .addToggle((t) => t.setValue(s.tempsActif !== false).onChange(async (v) => { s.tempsActif = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Propriété où inscrire le total'))
      .setDesc(tr('En minutes, dans le frontmatter de chaque note.'))
      .addText((t) => t.setValue(s.tempsPropriete || 'temps-passe').onChange(async (v) => { s.tempsPropriete = v.trim() || 'temps-passe'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Pause après ce silence"))
      .setDesc(tr("En secondes, sans clavier ni souris. 120 convient à la rédaction, où l'on s'arrête pour réfléchir ; 30 ne compte que la frappe."))
      .addText((t) => t.setValue(String(s.tempsInactiviteSec || 120)).onChange(async (v) => { s.tempsInactiviteSec = Math.max(10, parseInt(v, 10) || 120); await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Écrire dans la note au plus tous les'))
      .setDesc(tr("En secondes. Espacer les écritures évite d'agiter la synchronisation ; le temps en attente n'est jamais perdu, il est reporté en quittant la note."))
      .addText((t) => t.setValue(String(s.tempsEcritureSec || 300)).onChange(async (v) => { s.tempsEcritureSec = Math.max(60, parseInt(v, 10) || 300); await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Ignorer les notes verrouillées'))
      .setDesc(tr("Les notes portant « locked: true » ne sont pas chronométrées."))
      .addToggle((t) => t.setValue(s.tempsIgnorerVerrouillees !== false).onChange(async (v) => { s.tempsIgnorerVerrouillees = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Dossiers exclus du compteur'))
      .setDesc(tr("Un chemin de dossier par ligne. Les notes de ces dossiers — et de leurs sous-dossiers — ne sont pas chronométrées."))
      .addTextArea((t) => {
        t.setPlaceholder('8 - Tâches\n9 - Journal du temps')
          .setValue(s.tempsDossiersExclus || '')
          .onChange(async (v) => { s.tempsDossiersExclus = v; await maj(); });
        t.inputEl.rows = 3;
        t.inputEl.style.width = '100%';
      });

    this._section(c, tr('Affichage'));
    new obsidian.Setting(c)
      .setName(tr("Barre d'état"))
      .setDesc(tr("Temps de la note en cours. Le point est plein quand le compteur tourne, vide en pause. Un clic ouvre le journal du jour."))
      .addToggle((t) => t.setValue(s.tempsBarreEtat !== false).onChange(async (v) => { s.tempsBarreEtat = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Infobulle dans l'explorateur"))
      .addToggle((t) => t.setValue(s.tempsInfobulleExplorateur !== false).onChange(async (v) => { s.tempsInfobulleExplorateur = v; await maj(); }));

    this._section(c, tr('Journal quotidien'));
    new obsidian.Setting(c)
      .setName(tr('Dossier du journal'))
      .addText((t) => t.setValue(s.tempsDossierJournal || '').onChange(async (v) => { s.tempsDossierJournal = v.trim() || '9 - Journal du temps'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Écrire le journal automatiquement'))
      .setDesc(tr('Au changement de jour, la veille est consignée.'))
      .addToggle((t) => t.setValue(s.tempsJournalAuto !== false).onChange(async (v) => { s.tempsJournalAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Conserver le relevé quotidien'))
      .setDesc(tr("En jours. Ce relevé sert au journal ; passé ce délai il est effacé des réglages, les totaux inscrits dans les notes demeurent."))
      .addText((t) => t.setValue(String(s.tempsRetenirJours || 120)).onChange(async (v) => { s.tempsRetenirJours = Math.max(7, parseInt(v, 10) || 120); await maj(); }));
  }

  ongletSchemas(c, s, maj) {
    this._section(c, tr('Vocabulaire des schémas'));
    this._aide(c, tr("Les étiquettes admises sur vos schémas. Une liste vide n'impose rien. Un terme par ligne."));
    new obsidian.Setting(c)
      .setName(tr('Relations admises'))
      .setDesc(tr("Étiquettes portées par les flèches, ex. « précède », « contredit »."))
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.setValue((s.cartesRelations || []).join('\n'));
        t.onChange(async (v) => { s.cartesRelations = v.split('\n').map((x) => x.trim()).filter(Boolean); await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Types de blocs admis'))
      .setDesc(tr('Étiquettes portées par les formes, ex. « concept », « acteur ».'))
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.setValue((s.cartesTypesBlocs || []).join('\n'));
        t.onChange(async (v) => { s.cartesTypesBlocs = v.split('\n').map((x) => x.trim()).filter(Boolean); await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Vocabulaire strict'))
      .setDesc(tr("Signale en erreur toute étiquette hors des listes ci-dessus. Sans cela, elles sont seulement signalées comme inconnues."))
      .addToggle((t) => t.setValue(!!s.cartesStrict).onChange(async (v) => { s.cartesStrict = v; await maj(); }));

    this._aide(c, tr('Schémas draw.io (.drawio.svg) et notes associées. L’éditeur lui-même est fourni par un greffon draw.io, qu’Ariane ne remplace pas.'));

    new obsidian.Setting(c)
      .setName(tr('Recopier le contenu dans la note'))
      .setDesc(tr('Entretient un encart « Contenu du schéma » dans la note associée, ce qui rend les blocs et relations cherchables.'))
      .addToggle((t) => t.setValue(s.schemaSyncAuto !== false).onChange(async (v) => { s.schemaSyncAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Étiquettes implicites'))
      .setDesc(tr('Quand plusieurs flèches partent d’un même bloc et qu’une seule porte une étiquette, elle vaut pour tout le faisceau. Sans effet si deux étiquettes différentes coexistent.'))
      .addToggle((t) => t.setValue(s.schemaPropagerEtiquettes !== false).onChange(async (v) => { s.schemaPropagerEtiquettes = v; await maj(); }));

    this._section(c, tr('Export SVG'));
    new obsidian.Setting(c)
      .setName(tr('Police'))
      .addText((t) => t.setValue(s.cartesSvgPolice || 'Helvetica').onChange(async (v) => { s.cartesSvgPolice = v.trim() || 'Helvetica'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Corps (pt)'))
      .addText((t) => t.setValue(String(s.cartesSvgTaille || 10)).onChange(async (v) => { s.cartesSvgTaille = Number(v) || 10; await maj(); }));
  }

  ongletTaches(c, s, maj) {
    this._section(c, tr('Tâches'));
    this._aide(c, tr("Ariane crée une note par tâche (référence selon la forme réglée ci-dessous), lit les liens entre tâches pour en déduire compositions et blocages, et affiche le rétroplanning dans la frise."));

    new obsidian.Setting(c)
      .setName(tr('Dossier des tâches'))
      .setDesc(tr("Où Ariane crée les nouvelles tâches et où elle les cherche. Vide : « 8 - Tâches »."))
      .addText((t) => t.setValue(s.dossierTaches || '').setPlaceholder(tr('chemin dans le coffre'))
        .onChange(async (v) => { s.dossierTaches = v.trim().replace(/^\/+|\/+$/g, ''); await maj(); }));

    {
      const reg = new obsidian.Setting(c)
        .setName(tr('Forme de la référence'))
        .setDesc(tr("Numérotation incrémentale. {n} = le numéro, {n:3} = sur 3 chiffres. Le reste est littéral. Ne change que les tâches créées ensuite."));
      const apercu = reg.descEl.createDiv({ cls: 'zfa-gabarit-apercu' });
      const rendreApercu = (val) => {
        const ok = !!Ariane.analyserGabaritRef(val);
        apercu.setText(ok
          ? tr('Aperçu : ') + Ariane.referenceTacheSuivante([], val)
          : tr('Il faut exactement un jeton {n} ou {n:3}.'));
        apercu.toggleClass('est-invalide', !ok);
      };
      reg.addText((t) => {
        t.setValue(s.refGabarit || 'T-{n:3}').setPlaceholder('T-{n:3}');
        rendreApercu(t.getValue());
        t.onChange(async (v) => {
          rendreApercu(v);
          if (Ariane.analyserGabaritRef(v)) { s.refGabarit = v.trim(); await maj(); }
        });
      });
    }

    // Suggestions de listes Apple Rappels, partagées par la liste par défaut et
    // les familles. Chargées à la volée sur macOS.
    {
      const dl = c.createEl('datalist');
      dl.id = 'zfa-dl-listes-rappels';
      for (const nom of (this.plugin._listesRappels || [])) dl.createEl('option', { value: nom });
      if (obsidian.Platform && obsidian.Platform.isMacOS && this.plugin._listesRappels === undefined) {
        this.plugin.chargerListesRappels().then(() => this.display());
      }
    }
    new obsidian.Setting(c)
      .setName(tr('Liste de rappels par défaut'))
      .setDesc(tr("Liste Apple Rappels d'une tâche quand sa famille n'en précise pas."))
      .addText((t) => {
        t.inputEl.setAttribute('list', 'zfa-dl-listes-rappels');
        t.setValue(s.listeRappelsDefaut || '')
          .onChange(async (v) => { s.listeRappelsDefaut = v.trim(); await maj(); });
      });

    this._section(c, tr('Apple Rappels'));
    this._aide(c, tr("macOS. Chaque tâche datée devient un rappel dans la liste de sa famille. Synchronisation bidirectionnelle : cocher un rappel termine la tâche, un rappel ajouté à la main devient une tâche. La première synchronisation demande l'accès à Rappels."));
    new obsidian.Setting(c)
      .setName(tr('Activer'))
      .addToggle((t) => t.setValue(s.rappelsActif === true)
        .onChange(async (v) => { s.rappelsActif = v; await maj(); this.display(); }));
    if (s.rappelsActif) {
      {
        const reg = new obsidian.Setting(c)
          .setName(tr('Titre du rappel'))
          .setDesc(tr("Jetons : {ref}, {intitule}, {famille}. Le reste est littéral."));
        const apercu = reg.descEl.createDiv({ cls: 'zfa-gabarit-apercu' });
        const echRef = Ariane.referenceTacheSuivante([], s.refGabarit);
        const rendreApercu = (val) => apercu.setText(tr('Aperçu : ') + Ariane.formatModele(
          val || '[{ref}] - {intitule}',
          { ref: echRef, intitule: tr('Relire le chapitre 2'), famille: tr('Lecture') }));
        reg.addText((t) => {
          t.setValue(s.rappelsFormatTitre || '[{ref}] - {intitule}')
            .setPlaceholder('[{ref}] - {intitule}');
          rendreApercu(t.getValue());
          t.onChange(async (v) => {
            rendreApercu(v);
            s.rappelsFormatTitre = v.trim() || '[{ref}] - {intitule}';
            await maj();
          });
        });
      }
      new obsidian.Setting(c)
        .setName(tr('Synchroniser automatiquement'))
        .addToggle((t) => t.setValue(s.rappelsAuto !== false)
          .onChange(async (v) => { s.rappelsAuto = v; await maj(); this.display(); }));
      if (s.rappelsAuto !== false) {
        new obsidian.Setting(c)
          .setName(tr('Intervalle de relève (minutes)'))
          .addText((t) => t.setValue(String(s.rappelsReleveMin || 10))
            .onChange(async (v) => {
              const n = parseInt(v, 10);
              s.rappelsReleveMin = Number.isFinite(n) && n >= 2 ? n : 10;
              await maj();
            }));
      }
      new obsidian.Setting(c)
        .setName(tr('Synchroniser maintenant'))
        .addButton((b) => b.setButtonText(tr('Pousser')).onClick(() => this.plugin.pousserRappels(false)))
        .addButton((b) => b.setButtonText(tr('Relever')).onClick(() => this.plugin.releverRappels(false)))
        .addExtraButton((b) => b.setIcon('refresh-cw').setTooltip(tr('Recharger la liste des listes'))
          .onClick(async () => { await this.plugin.chargerListesRappels(); this.display(); }));
    }

    // Suggestions de calendriers Apple, partagées par le calendrier par défaut
    // et les familles. Chargées à la volée sur macOS.
    {
      const dl = c.createEl('datalist');
      dl.id = 'zfa-dl-agendas';
      for (const nom of (this.plugin._agendas || [])) dl.createEl('option', { value: nom });
      if (obsidian.Platform && obsidian.Platform.isMacOS && this.plugin._agendas === undefined) {
        this.plugin.chargerAgendas().then(() => this.display());
      }
    }
    this._section(c, tr('Apple Agenda'));
    this._aide(c, tr("macOS. Chaque créneau d'une tâche devient un événement dans le calendrier de sa famille. Synchro bidirectionnelle automatique : à chaque modif d'un côté (et au changement de fenêtre), déplacer/redimensionner l'événement dans Calendar réécrit le créneau. Les calendriers cochés s'affichent en fond de la vue calendrier."));
    new obsidian.Setting(c)
      .setName(tr('Activer'))
      .addToggle((t) => t.setValue(s.agendaActif === true)
        .onChange(async (v) => { s.agendaActif = v; await maj(); this.display(); }));
    if (s.agendaActif) {
      new obsidian.Setting(c)
        .setName(tr('Calendrier par défaut'))
        .setDesc(tr("Calendrier Apple d'une tâche quand sa famille n'en précise pas."))
        .addText((t) => {
          t.inputEl.setAttribute('list', 'zfa-dl-agendas');
          t.setValue(s.agendaCalendrierDefaut || '')
            .onChange(async (v) => { s.agendaCalendrierDefaut = v.trim(); await maj(); });
        });
      {
        const reg = new obsidian.Setting(c)
          .setName(tr('Calendriers à afficher'))
          .setDesc(tr("Cochez les calendriers Apple à montrer en fond de la vue calendrier (Apple → Obsidian, lecture seule ; clic → Calendar.app). Rien n'y est écrit."));
        reg.addExtraButton((b) => b.setIcon('refresh-cw').setTooltip(tr('Recharger la liste des calendriers'))
          .onClick(async () => { this.plugin._agendas = undefined; await this.plugin.chargerAgendas(); this.display(); }));
        const boite = c.createDiv({ cls: 'zfa-agenda-coches' });
        const noms = this.plugin._agendas;
        if (noms === undefined) {
          boite.createDiv({ cls: 'zfa-agenda-coches-vide', text: tr('Chargement des calendriers…') });
          if (obsidian.Platform && obsidian.Platform.isMacOS) this.plugin.chargerAgendas().then(() => this.display());
        } else if (!noms.length) {
          const st = this.plugin._agendaStatut;
          boite.createDiv({ cls: 'zfa-agenda-coches-vide',
            text: (st === 2 || st === 1 || st === 4)
              ? tr('Accès Calendriers : ') + this.plugin._libelleStatutAgenda(st) + '. '
                + tr('Autorisez « Calendriers » pour Obsidian dans Réglages système → Confidentialité et sécurité.')
              : tr('Aucun calendrier détecté.') });
        } else {
          const coches = new Set(this.plugin._agendasCoches());
          for (const nom of noms) {
            const l = boite.createEl('label', { cls: 'zfa-agenda-coche' });
            const cb = l.createEl('input', { type: 'checkbox' });
            cb.checked = coches.has(nom);
            l.createSpan({ text: nom });
            cb.addEventListener('change', async () => {
              const cur = new Set(this.plugin._agendasCoches());
              if (cb.checked) cur.add(nom); else cur.delete(nom);
              s.agendaCalendriersAffiches = [...cur];
              await maj();
              this.plugin._rafraichirFond();
            });
          }
        }
      }
      {
        const reg = new obsidian.Setting(c)
          .setName(tr("Titre de l'événement"))
          .setDesc(tr("Jetons : {ref}, {intitule}, {famille}. Le reste est littéral."));
        const apercu = reg.descEl.createDiv({ cls: 'zfa-gabarit-apercu' });
        const echRef = Ariane.referenceTacheSuivante([], s.refGabarit);
        const rendreApercu = (val) => apercu.setText(tr('Aperçu : ') + Ariane.formatModele(
          val || '[{ref}] - {intitule}',
          { ref: echRef, intitule: tr('Relire le chapitre 2'), famille: tr('Lecture') }));
        reg.addText((t) => {
          t.setValue(s.agendaFormatTitre || '[{ref}] - {intitule}')
            .setPlaceholder('[{ref}] - {intitule}');
          rendreApercu(t.getValue());
          t.onChange(async (v) => {
            rendreApercu(v);
            s.agendaFormatTitre = v.trim() || '[{ref}] - {intitule}';
            await maj();
          });
        });
      }
      new obsidian.Setting(c)
        .setName(tr('Synchroniser automatiquement'))
        .addToggle((t) => t.setValue(s.agendaAuto !== false)
          .onChange(async (v) => { s.agendaAuto = v; await maj(); this.display(); }));
      if (s.agendaAuto !== false) {
        new obsidian.Setting(c)
          .setName(tr('Intervalle de relève (minutes)'))
          .addText((t) => t.setValue(String(s.agendaReleveMin || 10))
            .onChange(async (v) => {
              const n = parseInt(v, 10);
              s.agendaReleveMin = Number.isFinite(n) && n >= 2 ? n : 10;
              await maj();
            }));
      }
      new obsidian.Setting(c)
        .setName(tr('Fenêtre de relève (jours)'))
        .addText((t) => t.setValue(String(s.agendaFenetreJours || 120))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.agendaFenetreJours = Number.isFinite(n) && n >= 7 ? n : 120;
            await maj();
          }));
      new obsidian.Setting(c)
        .setName(tr('Synchroniser maintenant'))
        .addButton((b) => b.setButtonText(tr('Pousser')).onClick(() => this.plugin.pousserAgenda(false)))
        .addButton((b) => b.setButtonText(tr('Relever')).onClick(() => this.plugin.releverAgenda(false)))
        .addExtraButton((b) => b.setIcon('refresh-cw').setTooltip(tr('Recharger la liste des calendriers'))
          .onClick(async () => { this.plugin._agendas = undefined; await this.plugin.chargerAgendas(); this.display(); }));
    }

    this._section(c, tr('Familles de tâches'));
    this._aide(c, tr("Chaque famille porte une couleur et une icône (cartes de l'articulation) et déclare les propriétés qu'elle ajoute à une tâche. La famille d'une tâche vit dans son champ « famille »."));
    this._tableFamillesTaches(c, s, maj);
    new obsidian.Setting(c)
      .setName(tr('Famille par défaut'))
      .setDesc(tr("Appliquée quand le champ « famille » est vide et qu'aucune règle ne tranche."))
      .addDropdown((d) => {
        for (const f of (s.famillesTaches || [])) d.addOption(f.id, f.nom || f.id);
        d.setValue(s.familleTacheDefaut || 'action')
          .onChange(async (v) => { s.familleTacheDefaut = v; await maj(); });
      });

    this._section(c, tr('Clés des propriétés de tâche'));
    this._aide(c, tr("Chaque propriété est écrite « préfixe + nom lisible » (« Tâche - Échéance »). Le préfixe évite les collisions avec d'autres notes. Le nom lisible se remplace ci-dessous ; le préfixe reste devant. « Renommer dans les notes » reporte ensuite l'ancien nom sur le nouveau."));
    // Les lignes « Clé : … » se rafraîchissent en direct, sans redessiner.
    const lignesCles = [];
    const rafraichirCles = () => {
      for (const { st, cle } of lignesCles) {
        st.setDesc(tr('Clé : ') + this.plugin.cleT(cle));
      }
    };
    new obsidian.Setting(c)
      .setName(tr('Préfixe'))
      .setDesc(tr('Vide = pas de préfixe. L\'espace final compte : « Tâche - ».'))
      .addText((t) => t.setPlaceholder('Tâche - ').setValue(s.prefixeTaches || '')
        .onChange(async (v) => {
          s.prefixeTaches = v; await maj(); rafraichirCles();
          this.plugin.harmoniserNomsColonnesBases().catch(() => {});
        }));
    new obsidian.Setting(c)
      .setName(tr('Masquer le préfixe à l\'affichage'))
      .setDesc(tr('Colonnes de frise, cartes d\'articulation et colonnes des bases affichent le nom sans le préfixe.'))
      .addToggle((t) => t.setValue(s.masquerPrefixeAffichage !== false)
        .onChange(async (v) => { s.masquerPrefixeAffichage = v; await maj(); }));
    {
      const ct = s.clesTaches || (s.clesTaches = {});
      const iconeAutre = {
        'bloque-par': 'ban', 'termine-le': 'calendar-check', source: 'book-marked',
        livrable: 'package', fichier: 'file', liste: 'list', 'rappel-id': 'bell',
      };
      const genPar = {};
      for (const p of Ariane.PROPS_GENERIQUES) genPar[p.cle] = p;
      for (const cle of Ariane.CONCEPTS_TACHE) {
        if (cle === 'intitule') continue;
        const g = genPar[cle];
        const st = new obsidian.Setting(c).setName(g ? tr(g.defaut) : Ariane.libelleConcept(cle));
        const ic = createSpan({ cls: 'zfa-tache-ic' });
        obsidian.setIcon(ic, g ? g.icone : (iconeAutre[cle] || 'tag'));
        st.nameEl.prepend(ic);
        st.setDesc(tr('Clé : ') + this.plugin.cleT(cle));
        st.addText((t) => t
          .setPlaceholder(Ariane.libelleConcept(cle))
          .setValue(ct[cle] || '')
          .onChange(async (v) => {
            const t2 = v.trim();
            if (t2 && t2 !== Ariane.libelleConcept(cle)) ct[cle] = t2; else delete ct[cle];
            await maj();
            rafraichirCles();
          }));
        lignesCles.push({ st, cle });
      }
    }
    new obsidian.Setting(c)
      .setName(tr('Appliquer aux notes existantes'))
      .setDesc(tr("Renomme les propriétés dans toutes les notes de tâches (et elles seules). Une note qui porte déjà la nouvelle clé n'est pas touchée."))
      .addButton((b) => b.setButtonText(tr('Renommer dans les notes')).setWarning().onClick(async () => {
        const g = this.plugin;
        const avis = new obsidian.Notice(tr('Renommage en cours…'), 0);
        // Anciennes clés possibles : le concept nu, le préfixe déjà appliqué,
        // et d'éventuels anciens intitulés personnalisés restés en réglages.
        const stale = s.libellesTaches || {};
        const pa = (s.prefixeTachesApplique || '');
        let total = 0;
        for (const f of g.app.vault.getMarkdownFiles()) {
          if (!g.refDeChemin(f.path)) continue;
          const fm = (g.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
          const aFaire = [];
          const cles = Object.keys(fm);
          for (const con of Ariane.CONCEPTS_TACHE) {
            const nk = g.cleT(con);
            if (nk in fm) continue;
            const lab = Ariane.libelleConcept(con);
            const perso = String((s.clesTaches || {})[con] || '').trim();
            const candidats = new Set([con, lab]);
            for (const base of [con, lab, perso, stale[con] && String(stale[con]).trim()]) {
              if (!base) continue;
              candidats.add(base);
              for (const p of [pa, s.prefixeTaches]) if (p) candidats.add(p + base);
            }
            // Toute clé « <préfixe finissant par un séparateur><concept ou libellé> ».
            const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const alts = [con, lab, perso].filter(Boolean).map(esc).join('|');
            const re = new RegExp('^.*[\\s\\-–—](?:' + alts + ')$', 'i');
            for (const k of cles) if (re.test(k)) candidats.add(k);
            for (const ancien of candidats) {
              if (ancien && ancien !== nk && (ancien in fm)) { aFaire.push([ancien, nk]); break; }
            }
          }
          if (!aFaire.length) continue;
          g.marquerEcriture(f.path);
          await g.app.fileManager.processFrontMatter(f, (x) => {
            for (const [a, nk] of aFaire) { x[nk] = x[a]; delete x[a]; }
          });
          total += aFaire.length;
        }
        s.prefixeTachesApplique = s.prefixeTaches || '';
        s.libellesTaches = {};
        await maj();
        avis.hide();
        new obsidian.Notice(total + tr(' propriété(s) renommée(s) dans les notes.'));
      }));
    new obsidian.Setting(c)
      .setName(tr('Nettoyer les clés résiduelles'))
      .setDesc(tr("Supprime des notes de tâches les propriétés en double laissées par un ancien nommage (ex. « Statut » quand « Tâche - statut » existe déjà). Ne touche qu'une clé reconnue comme variante d'un concept, et seulement si la clé actuelle est déjà là."))
      .addButton((b) => b.setButtonText(tr('Nettoyer')).setWarning().onClick(async () => {
        const g = this.plugin;
        const avis = new obsidian.Notice(tr('Nettoyage en cours…'), 0);
        const pa = s.prefixeTachesApplique || '';
        const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let total = 0;
        for (const f of g.app.vault.getMarkdownFiles()) {
          if (!g.refDeChemin(f.path)) continue;
          const fm = (g.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
          const cles = Object.keys(fm);
          const aSupprimer = new Set();
          for (const con of Ariane.CONCEPTS_TACHE) {
            const nk = g.cleT(con);
            if (!(nk in fm)) continue; // clé actuelle absente : on n'y touche pas
            const lab = Ariane.libelleConcept(con);
            const perso = String((s.clesTaches || {})[con] || '').trim();
            const variantes = new Set();
            for (const base of [con, lab, perso]) {
              if (!base) continue;
              variantes.add(base);
              for (const p of [pa, s.prefixeTaches]) if (p) variantes.add(p + base);
            }
            const alts = [con, lab, perso].filter(Boolean).map(esc).join('|');
            const re = new RegExp('^.*[\\s\\-–—](?:' + alts + ')$', 'i');
            for (const k of cles) {
              if (k === nk) continue;
              if (variantes.has(k) || re.test(k)) aSupprimer.add(k);
            }
          }
          if (!aSupprimer.size) continue;
          g.marquerEcriture(f.path);
          await g.app.fileManager.processFrontMatter(f, (x) => {
            for (const k of aSupprimer) delete x[k];
          });
          total += aSupprimer.size;
        }
        avis.hide();
        new obsidian.Notice(total + tr(' clé(s) résiduelle(s) supprimée(s).'));
      }));
    this._section(c, tr('Note de tâche'));
    new obsidian.Setting(c)
      .setName(tr('Habillage de la note de tâche'))
      .setDesc(tr('Dans une note de tâche : propriétés en grille ordonnée avec icônes, contenu aéré. Purement visuel.'))
      .addToggle((t) => t.setValue(s.styleNoteTache === true)
        .onChange(async (v) => { s.styleNoteTache = v; await maj(); this.plugin.habillerNotesTache(); }));
    new obsidian.Setting(c)
      .setName(tr('CSS personnalisé'))
      .setDesc(tr("Injecté globalement dans Obsidian. Vise entre autres « .zfa-note-tache » (note de tâche), « .zfa-artic-* » (articulation), « .zfa-gantt-* » (frise). Laisser vide pour ne rien injecter."))
      .setClass('zfa-css-perso-reglage')
      .addTextArea((t) => {
        t.setPlaceholder('.zfa-note-tache .metadata-container { ... }')
          .setValue(s.cssPersonnalise || '')
          .onChange(async (v) => {
            s.cssPersonnalise = v;
            await maj();
            this.plugin.appliquerCssPersonnalise();
          });
        t.inputEl.rows = 10;
        t.inputEl.style.width = '100%';
        t.inputEl.style.fontFamily = 'var(--font-monospace)';
      });

    this._section(c, tr('Vue Frise'));
    new obsidian.Setting(c)
      .setName(tr('Couleur des barres'))
      .setDesc(tr('Famille, statut, arborescence (une couleur par tâche racine), priorité ou avancement. Réglable aussi dans la barre de la vue.'))
      .addDropdown((d) => {
        for (const [v, lib] of Ariane.MODES_COULEUR_FRISE) d.addOption(v, tr(lib));
        return d.setValue(s.friseBarreCouleur || 'famille')
          .onChange(async (v) => { s.friseBarreCouleur = v; await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Révéler la lignée au survol'))
      .setDesc(tr('Survoler une barre met en valeur ses parents et ses sous-tâches, reliés par un trait.'))
      .addToggle((t) => t.setValue(s.friseLignageSurvol !== false)
        .onChange(async (v) => { s.friseLignageSurvol = v; await maj(); }));

    this._section(c, tr('Vue Articulation'));
    this._aide(c, tr("L'articulation des tâches (hiérarchie, blocages) se dessine dans une vue « Articulation » de la base. L'échelle de la frise, la hauteur de ligne, le regroupement et le tri se règlent par vue, dans « Configurer la vue »."));
    new obsidian.Setting(c)
      .setName(tr('Fléchage'))
      .setDesc(tr('Forme des liens entre cartes.'))
      .addDropdown((d) => d
        .addOption('courbe', tr('Courbe'))
        .addOption('angulaire', tr('Angulaire'))
        .setValue(s.articulationFleches || 'courbe')
        .onChange(async (v) => { s.articulationFleches = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Confirmer avant de supprimer une carte'))
      .setDesc(tr("Demander une validation quand on supprime une tâche depuis l'articulation (clavier ou clic droit)."))
      .addToggle((t) => t.setValue(s.articulationConfirmerSuppression !== false)
        .onChange(async (v) => { s.articulationConfirmerSuppression = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Accrochage magnétique"))
      .setDesc(tr("Au glissé d'une carte, l'accrocher à une grille et aux bords / centres des cartes voisines."))
      .addToggle((t) => t.setValue(s.articulationAimant !== false)
        .onChange(async (v) => { s.articulationAimant = v; await maj(); this.display(); }));
    if (s.articulationAimant !== false) {
      new obsidian.Setting(c)
        .setName(tr('Pas de la grille (px)'))
        .setDesc(tr('0 pour ne pas accrocher à la grille.'))
        .addText((t) => t.setValue(String(s.articulationGrille ?? 20))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.articulationGrille = Number.isFinite(n) && n >= 0 ? n : 20;
            await maj();
          }));
      new obsidian.Setting(c)
        .setName(tr("Distance d'accrochage aux voisins (px)"))
        .addSlider((sl) => sl.setLimits(0, 24, 1).setDynamicTooltip()
          .setValue(Number.isFinite(s.articulationSeuilAimant) ? s.articulationSeuilAimant : 7)
          .onChange(async (v) => { s.articulationSeuilAimant = v; await maj(); }));
    }

    this._section(c, tr('Assistant IA'));
    this._aide(c, tr("Structurer un brouillon, découper une tâche, normaliser les intitulés, vérifier les familles, ajouter en langage naturel, résoudre les sources — via les commandes « Tâches : … (IA) » et les menus contextuels. Chaque proposition est revue avant d'être appliquée. Le classement s'appuie sur la « Description » de chaque famille (onglet Dossiers & familles)."));
    new obsidian.Setting(c)
      .setName(tr('Fournisseur'))
      .setDesc(tr('Partagé avec le découpage des bibliographies. Adresse du service locale : onglet Suggestions.'))
      .addDropdown((d) => d
        .addOption('ollama', 'Ollama')
        .addOption('lmstudio', 'LM Studio')
        .addOption('mistral', 'Mistral')
        .addOption('claude', tr('Claude en ligne de commande'))
        .setValue(s.refsFournisseur || 'ollama')
        .onChange(async (v) => {
          s.refsFournisseur = v;
          // Aligner le nom du modèle sur le fournisseur : un modèle local ne
          // veut rien dire pour Mistral, et inversement.
          const m = String(s.refsModele || '').toLowerCase();
          if (v === 'mistral' && !/mistral|ministral|magistral|codestral|pixtral/.test(m)) {
            s.refsModele = 'mistral-small-latest';
          } else if ((v === 'ollama' || v === 'lmstudio')
            && /mistral|ministral|magistral|codestral|pixtral/.test(m)) {
            s.refsModele = 'llama3.2';
          }
          await maj(); this.display();
        }));
    if (s.refsFournisseur !== 'claude') {
      new obsidian.Setting(c)
        .setName(tr('Modèle'))
        .setDesc(s.refsFournisseur === 'mistral'
          ? tr('Ex. « mistral-small-latest ».')
          : tr('Nom exact du modèle installé.'))
        .addText((t) => t.setValue(s.refsModele || 'llama3.2')
          .onChange(async (v) => { s.refsModele = v.trim() || 'llama3.2'; await maj(); }));
    }
    new obsidian.Setting(c)
      .setName(tr('Tester la connexion'))
      .addButton((b) => b.setButtonText(tr('Tester')).onClick(async () => {
        const avis = new obsidian.Notice(tr('Test…'), 0);
        const r = await this.plugin.genererIA('Réponds exactement ceci : {"ok":true}', 60);
        avis.hide();
        if (r) new obsidian.Notice(tr('Le fournisseur répond.'));
      }));
    if (s.refsFournisseur === 'mistral') {
      new obsidian.Setting(c)
        .setName(tr('Clé Mistral'))
        .setDesc(tr('Conservée localement, dans les réglages du greffon.'))
        .addText((t) => {
          t.setValue(s.refsCleMistral || '')
            .onChange(async (v) => { s.refsCleMistral = v.trim(); await maj(); });
          t.inputEl.type = 'password';
        });
    }
    if (s.refsFournisseur === 'claude') {
      new obsidian.Setting(c)
        .setName(tr('Commande'))
        .setDesc(tr('Chemin du binaire, si « claude » ne suffit pas.'))
        .addText((t) => t.setValue(s.refsCheminClaude || 'claude')
          .onChange(async (v) => { s.refsCheminClaude = v.trim() || 'claude'; await maj(); }));
    }
  }

  // Éditeur des familles de tâches. Même esprit que _tableFamilles (familles
  // de notes) : liste répétable, réordonnable, chaque ligne portant en plus
  // une sous-liste de propriétés { cle, libelle, type }.
  _tableFamillesTaches(parent, s, maj) {
    const TYPES = Object.keys(Ariane.TYPE_FR_VERS_OBSIDIAN); // texte, nombre, …
    const slug = (v) => String(v || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const hote = parent.createDiv({ cls: 'zfa-famt-hote' });

    const rendre = () => {
      hote.empty();
      const familles = Array.isArray(s.famillesTaches) ? s.famillesTaches : (s.famillesTaches = []);
      if (!familles.length) {
        hote.createDiv({ cls: 'zfa-fam-vide', text: tr('Aucune famille de tâches.') });
      } else {
        hote.createDiv({ cls: 'zfa-famt-avert', text:
          tr("Renommer l'identifiant d'une famille ne migre pas les tâches déjà rattachées.") });
      }
      familles.forEach((f, i) => {
        const ligne = hote.createDiv({ cls: 'zfa-famt' });
        const tete = ligne.createDiv({ cls: 'zfa-famt-tete' });

        const apercu = tete.createSpan({ cls: 'zfa-famt-apercu' });
        const peindreApercu = () => {
          apercu.empty();
          apercu.style.setProperty('--zfa-fam-couleur', f.couleur || '#888888');
          obsidian.setIcon(apercu, f.icone || 'circle');
        };
        peindreApercu();

        const id = tete.createEl('input', { cls: 'zfa-famt-id', type: 'text' });
        id.placeholder = tr('identifiant'); id.value = f.id || '';
        id.onchange = async () => {
          const v = slug(id.value); id.value = v;
          const collision = (familles || []).some((g, j) => j !== i && g.id === v);
          id.toggleClass('zfa-famt-collision', !!collision || !v);
          if (v && !collision) { f.id = v; await maj(); }
        };

        const nom = tete.createEl('input', { cls: 'zfa-famt-nom', type: 'text' });
        nom.placeholder = tr('Nom affiché'); nom.value = f.nom || '';
        nom.onchange = async () => { f.nom = nom.value.trim(); await maj(); };

        const couleur = tete.createEl('input', { cls: 'zfa-famt-couleur', type: 'color' });
        couleur.value = f.couleur || '#888888';
        couleur.onchange = async () => { f.couleur = couleur.value; peindreApercu(); await maj(); };

        const icone = tete.createEl('input', { cls: 'zfa-famt-icone', type: 'text' });
        icone.placeholder = tr('icône Lucide'); icone.value = f.icone || '';
        icone.onchange = async () => { f.icone = icone.value.trim(); peindreApercu(); await maj(); };

        const monter = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(monter, 'chevron-up');
        monter.onclick = async () => { if (i === 0) return;
          familles.splice(i - 1, 0, familles.splice(i, 1)[0]); await maj(); rendre(); };
        const descendre = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(descendre, 'chevron-down');
        descendre.onclick = async () => { if (i >= familles.length - 1) return;
          familles.splice(i + 1, 0, familles.splice(i, 1)[0]); await maj(); rendre(); };
        const suppr = tete.createEl('button', { cls: 'zfa-fam-bouton zfa-fam-suppr' });
        obsidian.setIcon(suppr, 'trash-2');
        suppr.onclick = async () => { familles.splice(i, 1); await maj(); rendre(); };

        const corps = ligne.createDiv({ cls: 'zfa-famt-props' });
        corps.createEl('div', { cls: 'zfa-famt-props-titre', text: tr('Description (pour l\'IA)') });
        const desc = corps.createEl('textarea', { cls: 'zfa-famt-desc' });
        desc.rows = 3;
        desc.placeholder = tr('Quelques phrases : ce que recouvre la famille, des exemples, ce qui la distingue. Utilisé par l\'IA pour classer les brouillons.');
        desc.value = f.description || '';
        desc.onchange = async () => { f.description = desc.value.trim(); await maj(); };
        {
          const lr = corps.createDiv({ cls: 'zfa-famt-prop' });
          lr.createEl('label', { text: tr('Liste Apple Rappels'), cls: 'zfa-famt-prop-lbl' });
          const inp = lr.createEl('input', { type: 'text' });
          inp.setAttribute('list', 'zfa-dl-listes-rappels');
          inp.placeholder = this.plugin.settings.listeRappelsDefaut || tr('(liste par défaut)');
          inp.value = f.listeRappels || '';
          inp.onchange = async () => { f.listeRappels = inp.value.trim(); await maj(); };
        }
        {
          const la = corps.createDiv({ cls: 'zfa-famt-prop' });
          la.createEl('label', { text: tr('Calendrier Apple'), cls: 'zfa-famt-prop-lbl' });
          const inp = la.createEl('input', { type: 'text' });
          inp.setAttribute('list', 'zfa-dl-agendas');
          inp.placeholder = this.plugin.settings.agendaCalendrierDefaut || tr('(calendrier par défaut)');
          inp.value = f.agendaCalendrier || '';
          inp.onchange = async () => { f.agendaCalendrier = inp.value.trim(); await maj(); };
        }
        corps.createEl('div', { cls: 'zfa-famt-props-titre', text: tr('Propriétés ajoutées') });
        (f.proprietes = Array.isArray(f.proprietes) ? f.proprietes : []).forEach((p, j) => {
          const pr = corps.createDiv({ cls: 'zfa-famt-prop' });
          const cle = pr.createEl('input', { type: 'text' });
          cle.placeholder = tr('clé'); cle.value = p.cle || '';
          cle.onchange = async () => { p.cle = cle.value.trim(); await maj(); };
          const lib = pr.createEl('input', { type: 'text' });
          lib.placeholder = tr('libellé'); lib.value = p.libelle || '';
          lib.onchange = async () => { p.libelle = lib.value.trim(); await maj(); };
          const typ = pr.createEl('select');
          for (const t of TYPES) typ.createEl('option', { value: t, text: tr(t[0].toUpperCase() + t.slice(1)) });
          typ.value = p.type || 'texte';
          typ.onchange = async () => { p.type = typ.value; await maj(); };
          const del = pr.createEl('button', { cls: 'zfa-fam-bouton zfa-fam-suppr' });
          obsidian.setIcon(del, 'x');
          del.onclick = async () => { f.proprietes.splice(j, 1); await maj(); rendre(); };
        });
        const plus = corps.createEl('button', { cls: 'zfa-famt-prop-plus' });
        plus.setText(tr('Ajouter une propriété'));
        plus.onclick = async () => { f.proprietes.push({ cle: '', libelle: '', type: 'texte' }); await maj(); rendre(); };
      });
    };

    const barre = parent.createDiv({ cls: 'zfa-fam-barre' });
    new obsidian.Setting(barre)
      .addButton((b) => b.setButtonText(tr('Ajouter une famille')).setCta().onClick(async () => {
        (s.famillesTaches = s.famillesTaches || []).push({
          id: '', nom: '', couleur: '#888888', icone: 'circle', proprietes: [],
        });
        await maj(); rendre();
      }))
      .addButton((b) => b.setButtonText(tr('Recharger les familles par défaut')).onClick(async () => {
        s.famillesTaches = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.famillesTaches));
        await maj(); rendre();
      }));
    rendre();
  }

  ongletSuggestions(c, s, maj) {
    const rafraichir = () => this.plugin.majSuggestions(false, true);
    const reindexer = () => { this.plugin.invaliderIndexSuggestions(); this.plugin.majSuggestions(false, true); };

    this._section(c, tr("Suggestions dynamiques d'annotations"));
    this._aide(c, tr("Un panneau latéral propose, au fil de ce que vous écrivez, les notes les plus proches. Tout est local, gratuit et hors-ligne. Ouvrez-le via l'icône ✦ du ruban ou la commande dédiée."));
    new obsidian.Setting(c)
      .setName(tr('Activer les suggestions'))
      .addToggle((t) => t.setValue(s.suggActif).onChange(async (v) => { s.suggActif = v; await maj(); rafraichir(); }));
    new obsidian.Setting(c)
      .setName(tr('Suggestions par argument (clic droit)'))
      .setDesc(tr('Où afficher les suggestions déclenchées par clic droit sur une sélection.'))
      .addDropdown((d) => d.addOption('panneau', tr('Panneau latéral (ancré)')).addOption('flottant', tr('Fenêtre flottante'))
        .setValue(s.suggArgAffichage || 'panneau').onChange(async (v) => { s.suggArgAffichage = v; await maj(); }));
    this._aide(c, tr("Les dossiers puisés par les suggestions, leur couleur et leur icône se règlent famille par famille — onglet « Dossiers & familles », case « Suggestions »."))
    new obsidian.Setting(c)
      .setName(tr('Nombre de suggestions'))
      .addSlider((sl) => sl.setLimits(3, 20, 1).setValue(s.suggK).setDynamicTooltip().onChange(async (v) => { s.suggK = v; await maj(); rafraichir(); }));
    new obsidian.Setting(c)
      .setName(tr('Seuil de pertinence'))
      .setDesc(tr('Score final minimal (en %) pour qu\'une note soit proposée. Plus haut = plus sélectif.'))
      .addSlider((sl) => sl.setLimits(1, 60, 1).setValue(Math.round((s.suggSeuil || 0.18) * 100)).setDynamicTooltip().onChange(async (v) => { s.suggSeuil = v / 100; await maj(); rafraichir(); }));
    new obsidian.Setting(c)
      .setName(tr('Délai avant recalcul (ms)'))
      .setDesc(tr('Temps d’inactivité dans la frappe avant de rafraîchir.'))
      .addText((t) => t.setValue(String(s.suggAntirebond)).onChange(async (v) => { const n = parseInt(v, 10); s.suggAntirebond = Number.isFinite(n) && n >= 100 ? n : 900; await maj(); }));

    this._section(c, tr('Découpage des bibliographies'));
    this._aide(c, tr("Une entrée de bibliographie sur six n'existe qu'en texte brut, qu'aucune expression régulière ne découpe. Un modèle s'en charge. Il propose, il ne décide pas : chaque extraction est recoupée avec le texte d'origine, l'année, le nom et le titre devant s'y retrouver, sinon elle est jetée."));
    new obsidian.Setting(c)
      .setName(tr('Moteur du découpage'))
      .addDropdown((d) => d
        .addOption('ollama', 'Ollama')
        .addOption('lmstudio', 'LM Studio')
        .addOption('mistral', 'Mistral')
        .addOption('claude', tr('Claude en ligne de commande'))
        .setValue(s.refsFournisseur || 'ollama')
        .onChange(async (v) => { s.refsFournisseur = v; await maj(); this.display(); }));
    if (s.refsFournisseur !== 'claude') {
      new obsidian.Setting(c)
        .setName(tr('Modèle'))
        .setDesc(tr('llama3.2 suffit largement pour cette tâche.'))
        .addText((t) => t.setValue(s.refsModele || 'llama3.2')
          .onChange(async (v) => { s.refsModele = v.trim() || 'llama3.2'; await maj(); }));
    }
    if (s.refsFournisseur === 'mistral') {
      new obsidian.Setting(c)
        .setName(tr('Clé Mistral'))
        .setDesc(tr('Conservée dans les réglages du greffon, sur votre machine.'))
        .addText((t) => { t.setValue(s.refsCleMistral || '')
          .onChange(async (v) => { s.refsCleMistral = v.trim(); await maj(); });
          t.inputEl.type = 'password'; });
    }
    if (s.refsFournisseur === 'claude') {
      new obsidian.Setting(c)
        .setName(tr('Commande'))
        .setDesc(tr('Chemin du binaire, si « claude » ne suffit pas.'))
        .addText((t) => t.setValue(s.refsCheminClaude || 'claude')
          .onChange(async (v) => { s.refsCheminClaude = v.trim() || 'claude'; await maj(); }));
    }
    new obsidian.Setting(c)
      .setName(tr('Lancer le découpage'))
      .setDesc(tr("Une passe sur les entrées en texte brut, mise en cache. Interruptible, et reprise là où elle s'était arrêtée."))
      .addButton((b) => b.setButtonText(tr('Découper')).setCta()
        .onClick(() => this.plugin.decouperBibliographies()))
      .addButton((b) => b.setButtonText(tr('Arrêter'))
        .onClick(() => { this.plugin.decoupageEnCours = false; }));

    this._section(c, tr('Moteur de pertinence'));
    this._aide(c, tr("Lexical : mots en commun (aucune dépendance). Sémantique : comprend le sens via des embeddings locaux (Ollama). Hybride : combine les deux (recommandé). En l'absence d'Ollama, le moteur bascule automatiquement sur le lexical."));
    new obsidian.Setting(c)
      .setName(tr('Moteur'))
      .addDropdown((d) => d
        .addOption('lexical', tr('Lexical (mots)'))
        .addOption('semantique', tr('Sémantique (embeddings)'))
        .addOption('hybride', tr('Hybride (recommandé)'))
        .setValue(s.suggMoteur || 'hybride')
        .onChange(async (v) => { s.suggMoteur = v; await maj(); reindexer(); this.display(); }));
    if (s.suggMoteur === 'hybride') {
      new obsidian.Setting(c)
        .setName(tr('Poids du sémantique'))
        .setDesc(tr('Part du score sémantique dans l’hybride (le reste est lexical).'))
        .addSlider((sl) => sl.setLimits(0, 100, 5).setValue(Math.round((s.suggPoidsSemantique || 0.7) * 100)).setDynamicTooltip().onChange(async (v) => { s.suggPoidsSemantique = v / 100; await maj(); rafraichir(); }));
    }

    if (s.suggMoteur === 'semantique' || s.suggMoteur === 'hybride') {
      // ---- Le service d'inférence, quel qu'il soit. Ollama était nommé
      // partout, jusque dans les titres ; il n'est plus qu'un choix parmi deux.
      const lm = (s.suggFournisseur || 'ollama') === 'lmstudio';
      const nomService = lm ? 'LM Studio' : 'Ollama';
      this._section(c, tr("Service d'inférence local"));
      this._aide(c, lm
        ? "LM Studio, par son API compatible OpenAI. Chargez un modèle d'embeddings et un modèle de langue dans l'onglet « Developer », serveur démarré. Identifiants tels que LM Studio les affiche, par exemple « text-embedding-bge-m3-latest »."
        : "Ollama. Dans un terminal : « ollama pull bge-m3 » pour les embeddings, « ollama pull llama3.2 » pour le reclassement. Modèle conseillé en français : bge-m3, multilingue ; plus léger : nomic-embed-text.");
      new obsidian.Setting(c)
        .setName(tr('Service'))
        .setDesc(tr("Changer de service réencode l'index : les vecteurs de deux modèles ne se comparent pas."))
        .addDropdown((d) => d
          .addOption('ollama', tr('Ollama'))
          .addOption('lmstudio', tr('LM Studio'))
          .setValue(s.suggFournisseur || 'ollama')
          .onChange(async (v) => { s.suggFournisseur = v; await maj(); this.display(); }));
      new obsidian.Setting(c)
        .setName(tr('Adresse'))
        .setDesc(tr('Propre à cette machine : jamais reprise dans un profil exporté.'))
        .addText((t) => t
          .setPlaceholder(lm ? 'http://localhost:1234' : 'http://localhost:11434')
          .setValue((lm ? s.suggLmStudioUrl : s.suggOllamaUrl) || '')
          .onChange(async (v) => {
            const url = v.trim() || (lm ? 'http://localhost:1234' : 'http://localhost:11434');
            if (lm) s.suggLmStudioUrl = url; else s.suggOllamaUrl = url;
            await maj();
          }));
      new obsidian.Setting(c)
        .setName(tr("Modèle d'embeddings"))
        .setDesc(tr("Sert à mesurer la proximité de sens entre vos notes."))
        .addText((t) => t.setValue(s.suggModeleEmbed).onChange(async (v) => { s.suggModeleEmbed = v.trim() || 'bge-m3'; await maj(); reindexer(); }))
        .addButton((b) => b.setButtonText(tr('Tester')).onClick(async () => {
          new obsidian.Notice(tr('Test en cours…'));
          const ok = await this.plugin.testerEncodage();
          new obsidian.Notice(ok
            ? nomService + ' répond : encodage disponible.'
            : 'Échec : ' + nomService + ' injoignable, ou modèle « ' + (s.suggModeleEmbed || 'bge-m3') + ' » absent.');
        }));

      this._section(c, tr('Reclassement par modèle de langue'));
      this._aide(c, tr("Un modèle de langue relit les meilleurs candidats et les remet en ordre. C'est de loin le poste le plus lourd du greffon : il ne part que sur demande, par le bouton ✨ du panneau."));
      new obsidian.Setting(c)
        .setName(tr('Activer le reclassement'))
        .addToggle((t) => t.setValue(s.suggRerank).onChange(async (v) => { s.suggRerank = v; await maj(); this.display(); }));
      if (s.suggRerank) {
        new obsidian.Setting(c)
          .setName(tr('Modèle de langue'))
          .addText((t) => t.setValue(s.suggModeleLLM).onChange(async (v) => { s.suggModeleLLM = v.trim() || 'llama3.2'; await maj(); }))
          .addButton((b) => b.setButtonText(tr('Tester')).onClick(async () => {
            new obsidian.Notice(tr('Test du modèle…'));
            const ok = await this.plugin.testerLLM();
            new obsidian.Notice(ok
              ? tr('Le modèle répond : le reclassement est disponible.')
              : 'Échec : modèle « ' + (s.suggModeleLLM || 'llama3.2') + ' » injoignable sur ' + nomService + '.');
          }));
        new obsidian.Setting(c)
          .setName(tr('Reclasser automatiquement'))
          .setDesc(tr("Déconseillé. Activé, le modèle repart à chaque changement de note — c'est ce qui faisait tourner la ventilation sans répit."))
          .addToggle((t) => t.setValue(s.suggRerankAuto === true).onChange(async (v) => { s.suggRerankAuto = v; await maj(); }));
        new obsidian.Setting(c)
          .setName(tr('Candidats soumis'))
          .setDesc(tr('Nombre de meilleurs candidats relus par le modèle.'))
          .addSlider((sl) => sl.setLimits(5, 30, 1).setValue(s.suggRerankTopN || 12).setDynamicTooltip().onChange(async (v) => { s.suggRerankTopN = v; await maj(); }));
        new obsidian.Setting(c)
          .setName(tr('Afficher la justification'))
          .setDesc(tr("Une phrase expliquant pourquoi chaque note est proposée. Sans elle, le reclassement est un peu plus rapide."))
          .addToggle((t) => t.setValue(s.suggRerankJustif !== false).onChange(async (v) => { s.suggRerankJustif = v; await maj(); this.plugin.majSuggestions(false, true); }));

        this._aide(c, tr("Garde-fous. Sans borne de longueur, un modèle qui ne referme pas sa réponse peut tourner plusieurs minutes à pleine charge : c'est arrivé, et mesuré."));
        new obsidian.Setting(c)
          .setName(tr('Longueur maximale de la réponse'))
          .setDesc(tr('En jetons.'))
          .addText((t) => t.setValue(String(s.suggRerankJetons || 400)).onChange(async (v) => { s.suggRerankJetons = Math.max(60, parseInt(v, 10) || 400); await maj(); }));
        new obsidian.Setting(c)
          .setName(tr('Délai maximal'))
          .setDesc(tr("En secondes. Au-delà, Ariane rend la main et garde le classement sans le modèle."))
          .addText((t) => t.setValue(String(s.suggRerankDelaiSec || 45)).onChange(async (v) => { s.suggRerankDelaiSec = Math.max(5, parseInt(v, 10) || 45); await maj(); }));
      }
    }

    this._section(c, tr('Maintenance'));
    new obsidian.Setting(c)
      .setName(tr("Reconstruire l'index maintenant"))
      .setDesc(tr('Réindexe les dossiers candidats et réencode si nécessaire.'))
      .addButton((b) => b.setButtonText(tr('Reconstruire')).onClick(async () => {
        const n = await this.plugin.construireIndexSuggestions();
        new obsidian.Notice(tr('Index reconstruit (') + n + ' notes).');
        this.plugin.majSuggestions(false, true);
      }));
  }

  ongletContenu(c, s, maj) {
    this._aide(c, tr('Variables : {{title}}, {{titleLink}} (titre cliquable vers l’annotation dans le PDF), {{annotationUrl}}, {{key}}, {{paraphrase}}, {{image}}, {{citation}}, {{highlight}}, {{source}}, {{page}}, {{pageLine}}, {{references}}, {{referenceLinks}}, {{sourceName}}.'));
    new obsidian.Setting(c)
      .setName(tr('Modèle de corps de note'))
      .addTextArea((t) => {
        t.setValue(s.modeleNote).onChange(async (v) => { s.modeleNote = v; await maj(); });
        t.inputEl.rows = 6;
        t.inputEl.style.width = '100%';
        t.inputEl.style.fontFamily = 'monospace';
      });
    new obsidian.Setting(c)
      .setName(tr('Inclure le texte surligné (citation)'))
      .setDesc(tr('Intègre le surlignage via {{citation}} (encadré) ou {{highlight}} (brut).'))
      .addToggle((t) => t.setValue(s.inclureCitation).onChange(async (v) => { s.inclureCitation = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Type d'encadré de citation"))
      .setDesc(tr('Callout pour {{citation}} : quote, cite, note, info…'))
      .addText((t) => t.setValue(s.calloutCitation).onChange(async (v) => { s.calloutCitation = v.trim() || 'quote'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Libellé des références'))
      .addText((t) => t.setValue(s.labelReferences).onChange(async (v) => { s.labelReferences = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Libellé de la page'))
      .addText((t) => t.setValue(s.labelPage).onChange(async (v) => { s.labelPage = v; await maj(); }));
  }

  ongletReferences(c, s, maj) {
    new obsidian.Setting(c)
      .setName(tr('Référence par défaut = source'))
      .setDesc(tr('Si une annotation ne cite aucune référence, utilise sa source Zotero.'))
      .addToggle((t) => t.setValue(s.referenceParDefautSource).onChange(async (v) => { s.referenceParDefautSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Rattachement aux sources Zotero'))
      .setDesc(tr('Relie les références en attente aux fiches Zotero par auteurs + année. Les correspondances certaines (un seul appariement possible) sont toujours rattachées sans rien demander ; ce réglage ne concerne que les cas ambigus.'))
      .addDropdown((d) => {
        d.addOption('desactive', tr('Désactivé'));
        d.addOption('certain', tr('Certaines seulement, ignorer les ambiguës'));
        d.addOption('ia', tr('Trancher les ambiguës par le modèle local'));
        d.addOption('manuel', tr('Me demander pour les ambiguës'));
        const v = s.rattachementZotero === false ? 'desactive'
          : (s.rattachementIA !== false ? 'ia'
            : (s.validationRattachement ? 'manuel' : 'certain'));
        d.setValue(v);
        d.onChange(async (val) => {
          s.rattachementZotero = val !== 'desactive';
          s.rattachementAutoCertain = true;
          s.rattachementIA = val === 'ia';
          s.validationRattachement = val === 'manuel';
          await maj();
        });
      });
    new obsidian.Setting(c)
      .setName(tr('Oublier les décisions enregistrées'))
      .setDesc('Une décision prise sur un couple référence/fiche n’est jamais reposée. Ce bouton remet le compteur à zéro (' + Object.keys(s.rattachementsDecides || {}).length + ' décision(s) en mémoire).')
      .addButton((b) => b.setButtonText(tr('Oublier')).onClick(async () => {
        s.rattachementsDecides = {};
        await maj();
        new obsidian.Notice(tr('Décisions de rattachement oubliées.'));
        this.display();
      }));
    new obsidian.Setting(c)
      .setName(tr('Fiches auteurs'))
      .setDesc(tr('Maintient une note par auteur pointant vers ses sources.'))
      .addToggle((t) => t.setValue(s.liensAuteurs).onChange(async (v) => { s.liensAuteurs = v; await maj(); }));

    new obsidian.Setting(c)
      .setName(tr('Dossier des auteurs'))
      .addText((t) => t.setValue(s.dossierAuteurs).onChange(async (v) => { s.dossierAuteurs = v.trim() || 'Auteurs'; await maj(); }));
    this._section(c, tr('Bibliographies citées (API)'));
    this._aide(c, tr("Récupère la bibliographie d'une source via Crossref/OpenAlex (commandes « Confirmer les références en attente » et « Générer la bibliographie citée »)."));
    new obsidian.Setting(c)
      .setName(tr('Activer la récupération via API'))
      .addToggle((t) => t.setValue(s.apiReferencesCitees).onChange(async (v) => { s.apiReferencesCitees = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Source des données'))
      .setDesc(tr('« auto » = Crossref puis OpenAlex. OpenAlex couvre mieux, Crossref est plus direct.'))
      .addDropdown((d) => d
        .addOption('auto', tr('Auto (Crossref puis OpenAlex)'))
        .addOption('crossref', tr('Crossref'))
        .addOption('openalex', tr('OpenAlex'))
        .setValue(s.apiSource || 'auto')
        .onChange(async (v) => { s.apiSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Email (pool poli)'))
      .setDesc(tr('Recommandé : de meilleures limites de débit avec un email.'))
      .addText((t) => t.setPlaceholder(tr('vous@exemple.fr')).setValue(s.apiEmail || '').onChange(async (v) => { s.apiEmail = v.trim(); await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Dossier des bibliographies'))
      .addText((t) => t.setValue(s.dossierBibliographies || '').onChange(async (v) => { s.dossierBibliographies = v.trim() || '6 - Bibliographies citées'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Préfixe des notes de bibliographie'))
      .setDesc(tr("Ajouté devant le nom de la source (ex. « Biblio - @cle »). Peut être vide."))
      .addText((t) => t.setValue(s.prefixeBibliographie || '').onChange(async (v) => { s.prefixeBibliographie = v; await maj(); }));

    new obsidian.Setting(c)
      .setName(tr('Dossier des références citées'))
      .addText((t) => t.setValue(s.dossierReferences).onChange(async (v) => { s.dossierReferences = v.trim() || 'Références citées'; await maj(); }));
  }

  ongletExport(c, s, maj) {
    this._aide(c, tr('Exporte la note active en .docx où chaque note de bas de page devient une citation Zotero vivante (via Pandoc + filtre BetterBibTeX). Zotero doit tourner ; pandoc doit être installé (brew install pandoc). Commande : « Exporter en Word avec citations Zotero (Pandoc) ».'));

    new obsidian.Setting(c).setName(tr('Moteur')).setHeading();
    new obsidian.Setting(c)
      .setName(tr('Chemin de pandoc'))
      .addText((t) => t.setValue(s.exportPandocBin).onChange(async (v) => { s.exportPandocBin = v.trim() || 'pandoc'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Filtre Lua (BetterBibTeX)'))
      .setDesc(tr('pandoc-zotero-live-citemarkers.lua avec ses dépendances.'))
      .addText((t) => t.setValue(s.exportFiltreLua).onChange(async (v) => { s.exportFiltreLua = v.trim(); await maj(); }));

    new obsidian.Setting(c).setName(tr('Mise en page (modèle Word)')).setHeading();
    new obsidian.Setting(c)
      .setName(tr('Modèle Word (styles)'))
      .setDesc(tr('.docx dont les styles seront appliqués (titres, corps, citation, etc.).'))
      .addText((t) => t.setValue(s.exportModeleWord || '').onChange(async (v) => { s.exportModeleWord = v.trim(); await maj(); }))
      .addButton((b) => b.setButtonText(tr('Voir les styles')).onClick(() => this.plugin.listerStylesModele()));
    this._aide(c, tr('Associez chaque niveau markdown à un nom de style de votre modèle (laisser vide = style pandoc par défaut).'));
    s.exportMapStyles = s.exportMapStyles || { Heading1: '', Heading2: '', Heading3: '', Heading4: '', BodyText: 'Corps de texte', BlockText: 'Citation intense', Compact: 'Corps de texte' };
    for (const [cle, lbl] of [['Heading1', tr('Titre 1  (#)')], ['Heading2', tr('Titre 2  (##)')], ['Heading3', tr('Titre 3  (###)')], ['Heading4', tr('Titre 4  (####)')], ['BodyText', 'Corps de texte'], ['BlockText', tr('Citation  (>)')]]) {
      new obsidian.Setting(c)
        .setName(lbl)
        .addText((t) => t.setValue(s.exportMapStyles[cle] || '').onChange(async (v) => { s.exportMapStyles[cle] = v.trim(); await maj(); }));
    }

    new obsidian.Setting(c).setName(tr('Références citées (apparat « cité dans »)')).setHeading();
    this._aide(c, tr("Quand une annotation cite une référence absente de Zotero, la citation prend la forme : « Auteurs, année<texte ci-dessous>Source, p. XX ». Si la référence citée existe dans Zotero, elle est citée directement."));
    new obsidian.Setting(c)
      .setName(tr('Espaces insécables'))
      .setDesc(tr("Rend insécables les espaces déjà présentes devant « ; », « : », « ! », « ? » et « » », et après « « ». Aucune espace n'est ajoutée : les adresses, les heures et les grappes de citation restent intactes."))
      .addToggle((t) => t.setValue(s.exportInsecables !== false).onChange(async (v) => { s.exportInsecables = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Apparat « cité dans » à l'export"))
      .setDesc(tr("Activé, un travail rapporté mais absent de Zotero est cité sous la forme « Fan et al., 2022, cité dans Raizada & Sinha, 2025, p. 1 ». Désactivé, seule la source réellement consultée est citée. Sans effet sur les travaux présents dans Zotero, toujours cités directement."))
      .addToggle((t) => t.setValue(s.exportCiteDansActif !== false).onChange(async (v) => { s.exportCiteDansActif = v; await maj(); }));
    this._section(c, tr('Mise en forme du document'));
    new obsidian.Setting(c)
      .setName(tr('Décaler les titres d’un cran'))
      .setDesc(tr("« # » est le titre du document, pas une partie : « ## » devient donc Titre 1 dans Word."))
      .addToggle((t) => t.setValue(s.exportDecalerTitres !== false).onChange(async (v) => { s.exportDecalerTitres = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Retirer la numérotation saisie à la main'))
      .setDesc(tr("« 2.1 Titre » devient « Titre » : Word numérote seul."))
      .addToggle((t) => t.setValue(s.exportRetirerNumerotation !== false).onChange(async (v) => { s.exportRetirerNumerotation = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Rattacher les en-têtes du modèle'))
      .setDesc(tr("Pandoc écrit sa propre section et laisse les en-têtes orphelins. Désactiver ne se justifie qu'en cas de difficulté."))
      .addToggle((t) => t.setValue(s.exportEntetes !== false).onChange(async (v) => { s.exportEntetes = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Retirer les crochets des propriétés'))
      .setDesc(tr("Une propriété « [[Chabane Mazri]] » sort « Chabane Mazri ». Vaut pour les liens simples, les liens à alias et les liens markdown."))
      .addToggle((t) => t.setValue(s.exportNettoyerLiens !== false).onChange(async (v) => { s.exportNettoyerLiens = v; await maj(); }));

    this._section(c, tr('Styles du modèle employés'));
    this._aide(c, tr("Noms de styles tels qu'ils figurent dans votre modèle Word. Ariane les résout en identifiants — « Corps de texte » se range sous « Corpsdetexte »."));
    const style = (nom, cle, defaut, desc) => new obsidian.Setting(c)
      .setName(nom).setDesc(desc || '')
      .addText((t) => t.setPlaceholder(defaut).setValue(s[cle] || '')
        .onChange(async (v) => { s[cle] = v.trim() || defaut; await maj(); }));
    style(tr('Encadrés'), 'exportStyleEncadre', 'Items de réflexion', tr("Style du contenu des mises en avant « > [!info] »."));
    style(tr('En-tête de tableau'), 'exportStyleEnteteTableau', 'Titre de tableau', tr("Première ligne des tableaux markdown."));
    style(tr('Cellule de tableau'), 'exportStyleCelluleTableau', 'Champ de tableau', tr("Lignes suivantes."));

    this._section(c, tr('Référence de la note'));
    this._aide(c, tr("Le jeton {{réf}} de votre modèle. Ariane cherche les propriétés ci-dessous, dans l'ordre, accents et majuscules indifférents."));
    new obsidian.Setting(c)
      .setName(tr('Propriétés à consulter'))
      .setDesc(tr('Séparées par des virgules.'))
      .addText((t) => t.setPlaceholder(tr('ref, reference, réf')).setValue(s.exportProprieteReference || '')
        .onChange(async (v) => { s.exportProprieteReference = v.trim() || 'ref'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('À défaut, le nom du fichier'))
      .setDesc(tr("Vos notes s'appellent « NP-260826-07 » ou « CR-260826-07 » : le nom fait alors référence. Désactivé, le champ reste vide si aucune propriété n'est trouvée."))
      .addToggle((t) => t.setValue(s.exportRefDepuisNom !== false).onChange(async (v) => { s.exportRefDepuisNom = v; await maj(); }));

    this._aide(c, tr("Le texte de liaison — « , cité dans » — se règle une seule fois, dans l'onglet « Citations & bibliographie ». Il vaut pour les citations en ligne comme pour l'export."));

    new obsidian.Setting(c).setName(tr('Sortie')).setHeading();
    new obsidian.Setting(c)
      .setName(tr('Dossier de sortie'))
      .addText((t) => t.setValue(s.exportDossier).onChange(async (v) => { s.exportDossier = v.trim() || '5 - Livrables'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Emplacement de bibliographie'))
      .setDesc(tr('Ajoute un titre « Bibliographie » où insérer la bibliographie dans Word (Zotero > Add Bibliography).'))
      .addToggle((t) => t.setValue(s.exportBibliographie !== false).onChange(async (v) => { s.exportBibliographie = v; await maj(); }));
  }


  ongletAvance(c, s, maj) {
    this._section(c, tr('Analyse (expressions régulières)'), tr("À ne modifier qu'en connaissance de cause."));
    new obsidian.Setting(c)
      .setName(tr('Marqueur de source'))
      .setDesc(tr('Chaîne détectant une note source à traiter.'))
      .addText((t) => t.setValue(s.marqueurSource).onChange(async (v) => { s.marqueurSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Regex de bloc'))
      .setDesc(tr('Groupe 1 = clé stable, groupe 2 = contenu.'))
      .addText((t) => t.setValue(s.blocRegex).onChange(async (v) => { s.blocRegex = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Regex de page'))
      .addText((t) => t.setValue(s.pageRegex).onChange(async (v) => { s.pageRegex = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Regex d'image"))
      .addText((t) => t.setValue(s.imageRegex).onChange(async (v) => { s.imageRegex = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Retirer les parenthèses des références'))
      .addToggle((t) => t.setValue(s.retirerParentheses).onChange(async (v) => { s.retirerParentheses = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Séparateur de citations'))
      .addText((t) => t.setValue(s.separateurCitations).onChange(async (v) => { s.separateurCitations = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Séparateur d'auteurs (regex)"))
      .addText((t) => t.setValue(s.separateurAuteurs).onChange(async (v) => { s.separateurAuteurs = v; await maj(); }));

    this._section(c, tr('Notes de référence provisoires'));
    new obsidian.Setting(c)
      .setName(tr('Modèle'))
      .setDesc(tr('Variables : {{authorLinks}}, {{name}}, {{year}}, {{firstAuthor}}.'))
      .addTextArea((t) => {
        t.setValue(s.modeleReference).onChange(async (v) => { s.modeleReference = v; await maj(); });
        t.inputEl.rows = 4;
        t.inputEl.style.width = '100%';
        t.inputEl.style.fontFamily = 'monospace';
      });

    this._section(c, tr('Profils de standard'));
    this._aide(c, tr('Liste JSON. Pour chaque bloc, le premier profil dont « titreRegex » correspond est retenu.'));
    let profilsErreur;
    new obsidian.Setting(c)
      .setName(tr('Profils (JSON)'))
      .addTextArea((t) => {
        t.setValue(JSON.stringify(s.profils, null, 2)).onChange(async (v) => {
          try {
            const p = JSON.parse(v);
            if (Array.isArray(p) && p.length > 0) {
              s.profils = p;
              if (profilsErreur) profilsErreur.setText('');
              await maj();
            } else if (profilsErreur) {
              profilsErreur.setText(tr('Le JSON doit être un tableau non vide.'));
            }
          } catch (e) {
            if (profilsErreur) profilsErreur.setText(tr('JSON invalide : ') + e.message);
          }
        });
        t.inputEl.rows = 8;
        t.inputEl.style.width = '100%';
        t.inputEl.style.fontFamily = 'monospace';
      });
    profilsErreur = c.createEl('div', { text: tr(''), cls: 'setting-item-description' });
    profilsErreur.style.color = 'var(--text-error)';

    this._section(c, tr('Bibliographies lues dans les PDF'));
    this._aide(c, tr("Crossref ne connaît que ce qui porte un DOI, or les livres n'en ont souvent pas et ce sont eux qui portent les références les plus citées. Zotero garde le texte extrait de chaque PDF : Ariane y lit la bibliographie directement."));
    new obsidian.Setting(c)
      .setName(tr('Dossier de données Zotero'))
      .setDesc(tr('Vide : détection automatique dans votre dossier personnel.'))
      .addText((t) => t.setValue(s.dossierZotero || '')
        .setPlaceholder(require('path').join(require('os').homedir(), 'Zotero'))
        .onChange(async (v) => { s.dossierZotero = v.trim(); this.plugin._textesPdf = null; await maj(); }));

    this._section(c, tr('Annotations sans titre'));
    this._aide(c, tr("Par défaut, une annotation dont le commentaire ne correspond à aucun profil est ignorée : elle ne devient pas une note. Activez l'option ci-dessous pour l'atomiser quand même, avec un titre déduit de son contenu."));
    new obsidian.Setting(c)
      .setName(tr('Atomiser les annotations sans titre'))
      .setDesc(tr('Le commentaire entier devient la paraphrase et le titre est déduit.'))
      .addToggle((t) => t.setValue(s.titreFacultatif === true).onChange(async (v) => { s.titreFacultatif = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Déduire le titre à partir de'))
      .setDesc(tr("À défaut, l'autre source est utilisée, puis la clé Zotero."))
      .addDropdown((d) => {
        d.addOption('paraphrase', tr('Le commentaire'));
        d.addOption('surlignage', tr('Le texte surligné'));
        d.setValue(s.titreReplSource === 'surlignage' ? 'surlignage' : 'paraphrase');
        d.onChange(async (v) => { s.titreReplSource = v; await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Longueur maximale du titre déduit'))
      .setDesc(tr('En caractères. La coupe se fait à la fin de la première phrase, sinon au dernier mot entier.'))
      .addText((t) => {
        t.setValue(String(s.titreReplLongueur || 60)).onChange(async (v) => {
          const n = parseInt(v, 10);
          s.titreReplLongueur = isNaN(n) ? 60 : Math.max(10, Math.min(200, n));
          await maj();
        });
        t.inputEl.type = 'number';
      });
  }
}

//#endregion 12 · ArianeSettingTab

