
// ── avecPublicationSite ──────────────────────────────────────────────────
// Domaine : publication du site (Quartz). Miroir intégral d'un dossier du
// coffre vers content/ d'un dépôt Git, puis commit + push. Remplace le
// plugin communautaire Quartz Syncer, dont le bouton « Publish to remote »
// s'est révélé cassé (case cochée ignorée par sa propre logique de
// sélection) — voir docs/superpowers/notes du 2026-09-13.
const avecPublicationSite = (Base) => class extends Base {
  //#region Ariane · publication du site

  get cheminDepotSite() {
    return (this.settings.publicationDepot || '').trim();
  }

  get dossierPublicVault() {
    return (this.settings.publicationDossierVault || '95 - Dépôt public').trim();
  }

  // Miroir récursif source -> cible : copie ce qui est nouveau ou modifié,
  // retire de la cible ce qui n'existe plus côté source. C'est la sélection
  // ELLE-MÊME : être dans dossierPublicVault, c'est être publié — aucun
  // frontmatter à poser sur chaque note.
  _miroiterDossierPublication(source, cible) {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(cible, { recursive: true });
    const nomsSource = new Set();
    for (const entree of fs.readdirSync(source, { withFileTypes: true })) {
      if (entree.name === '.obsidian' || entree.name === '.DS_Store') continue;
      nomsSource.add(entree.name);
      const src = path.join(source, entree.name);
      const dst = path.join(cible, entree.name);
      if (entree.isDirectory()) {
        this._miroiterDossierPublication(src, dst);
      } else {
        fs.copyFileSync(src, dst);
      }
    }
    if (!fs.existsSync(cible)) return;
    for (const entree of fs.readdirSync(cible, { withFileTypes: true })) {
      if (nomsSource.has(entree.name)) continue;
      fs.rmSync(path.join(cible, entree.name), { recursive: true, force: true });
    }
  }

  _executerGit(depot, args) {
    const { execFile } = require('child_process');
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd: depot }, (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message || '').trim() || ('git ' + args.join(' '))));
        else resolve(stdout);
      });
    });
  }

  // Commande unique : synchronise dossierPublicVault vers content/, commit,
  // pousse. Silencieux (Notice seule) si rien n'a changé.
  async publierSite() {
    const depot = this.cheminDepotSite;
    if (!depot) {
      new obsidian.Notice(tr('Publication du site : renseigne le chemin du dépôt dans les réglages Ariane (onglet « Export et publication »).'));
      return;
    }
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(depot)) {
      new obsidian.Notice(tr('Publication du site : dépôt introuvable — ') + depot);
      return;
    }
    const basePath = this.app.vault.adapter.basePath;
    const dossierVaultAbs = path.join(basePath, this.dossierPublicVault);
    if (!fs.existsSync(dossierVaultAbs)) {
      new obsidian.Notice(tr('Publication du site : dossier introuvable dans le coffre — ') + this.dossierPublicVault);
      return;
    }

    const notice = new obsidian.Notice(tr('Publication du site : synchronisation…'), 0);
    try {
      this._miroiterDossierPublication(dossierVaultAbs, path.join(depot, 'content'));

      await this._executerGit(depot, ['add', 'content']);
      const statut = await this._executerGit(depot, ['status', '--porcelain', '--', 'content']);
      if (!statut.trim()) {
        notice.hide();
        new obsidian.Notice(tr('Publication du site : déjà à jour, rien à publier.'));
        return;
      }
      await this._executerGit(depot, ['commit', '-m', 'Publication depuis Obsidian (Ariane)']);
      await this._executerGit(depot, ['push', 'origin', this.settings.publicationBranche || 'main']);
      notice.hide();
      new obsidian.Notice(tr('✓ Site publié — le déploiement démarre automatiquement.'));
    } catch (e) {
      notice.hide();
      console.error('[Ariane] publication du site :', e);
      new obsidian.Notice(tr('Échec de la publication du site : ') + e.message, 10000);
    }
  }

  //#endregion Ariane · publication du site
}
