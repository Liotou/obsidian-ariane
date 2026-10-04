#!/usr/bin/env python3
"""Le PDF que Monsieur lit dans Obsidian, retrouvé sans rien lui demander.

Obsidian enregistre ses onglets dans .obsidian/workspace.json ; ZotFlow y
note pour chaque lecteur la pièce jointe Zotero ouverte (itemKey), et garde
la page lue dans ses réglages (viewStates). La pièce jointe porte le même
identifiant que son dossier dans ~/Zotero/storage. Lecture seule, rien n'est
écrit nulle part.

Usage : python3 ou-je-lis.py [chemin du coffre]
"""
import glob
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
# <coffre>/.claude/skills/lecture-pdf/ou-je-lis.py
COFFRE = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(ICI, '..', '..', '..'))
LECTEURS = ('zotflow-zotero-reader-view', 'zotflow-local-zotero-reader-view', 'pdf')


def lire_json(chemin):
    try:
        with open(chemin, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def racine_zotero():
    # Un dossier de données déplacé est noté dans les préférences de Zotero.
    for prefs in glob.glob(os.path.expanduser('~/Library/Application Support/Zotero/Profiles/*/prefs.js')):
        try:
            texte = open(prefs, encoding='utf-8').read()
        except OSError:
            continue
        m = re.search(r'"extensions\.zotero\.dataDir",\s*"([^"]+)"', texte)
        if m and os.path.isdir(m.group(1)):
            return m.group(1)
    return os.path.expanduser('~/Zotero')


def feuilles(noeud, dans_principal, sortie):
    """Toutes les feuilles, avec : sont-elles dans la zone principale, et
    sont-elles l'onglet affiché de leur groupe ?"""
    if isinstance(noeud, dict):
        if noeud.get('type') == 'tabs':
            enfants = noeud.get('children', [])
            courant = noeud.get('currentTab', 0) or 0
            for i, e in enumerate(enfants):
                if e.get('type') == 'leaf':
                    sortie.append((e, dans_principal, i == courant))
                else:
                    feuilles(e, dans_principal, sortie)
            return
        if noeud.get('type') == 'leaf':
            sortie.append((noeud, dans_principal, True))
            return
        for e in noeud.get('children', []):
            feuilles(e, dans_principal, sortie)


def fiche_source(cle_piece):
    """La fiche ZotFlow qui porte cette pièce jointe (lien open-attachment)."""
    motif = 'key=' + cle_piece
    for racine, _, fichiers in os.walk(os.path.join(COFFRE, '98 - Bibliographie')):
        for nom in fichiers:
            if not nom.endswith('.md'):
                continue
            chemin = os.path.join(racine, nom)
            try:
                texte = open(chemin, encoding='utf-8').read()
            except OSError:
                continue
            if motif in texte and 'open-attachment' in texte:
                m = re.search(r'^citationKey:\s*"?([^"\n]+)"?\s*$', texte, re.M)
                return os.path.relpath(chemin, COFFRE), (m.group(1).strip() if m else '')
    return '', ''


def main():
    ws = lire_json(os.path.join(COFFRE, '.obsidian', 'workspace.json'))
    if not ws:
        print("workspace.json illisible : le coffre est-il bien " + COFFRE + " ?")
        return
    zot = (lire_json(os.path.join(COFFRE, '.obsidian', 'plugins', 'zotflow', 'data.json')) or {})
    etats = zot.get('viewStates', {})

    toutes = []
    feuilles(ws.get('main', {}), True, toutes)
    for cote in ('left', 'right'):
        feuilles(ws.get(cote, {}), False, toutes)
    actif = ws.get('active')

    lecteurs = [(f, p, v) for f, p, v in toutes if (f.get('state') or {}).get('type') in LECTEURS]
    if not lecteurs:
        print('Aucun PDF ouvert dans Obsidian.')
        return
    # Le lecteur actif ; sinon (Monsieur a cliqué dans Claudian) celui affiché
    # dans la zone principale ; sinon le premier ouvert.
    lecteurs.sort(key=lambda x: (x[0].get('id') != actif, not (x[1] and x[2]), not x[1]))

    zotero = racine_zotero()
    for rang, (f, principal, affiche) in enumerate(lecteurs):
        st = f.get('state') or {}
        etat = st.get('state') or {}
        titre = st.get('title') or ''
        print(('## En cours de lecture' if rang == 0 else '## Aussi ouvert') + ' : ' + titre)
        if st.get('type') == 'pdf':
            fichier = etat.get('file', '')
            print('- Type : PDF du coffre')
            print('- PDF : ' + os.path.join(COFFRE, fichier))
            vs = etats.get(fichier) or {}
        else:
            cle = str(etat.get('itemKey', ''))
            dossier = os.path.join(zotero, 'storage', cle)
            pdfs = sorted(glob.glob(os.path.join(dossier, '*.pdf')))
            print('- Type : lecteur ZotFlow (pièce jointe Zotero ' + cle + ')')
            print('- PDF : ' + (pdfs[0] if pdfs else 'ABSENT de ' + dossier + ' (pas téléchargé par Zotero sur ce Mac)'))
            cache = os.path.join(dossier, '.zotero-ft-cache')
            if os.path.exists(cache):
                print('- Texte intégral extrait par Zotero : ' + cache)
            fiche, citekey = fiche_source(cle)
            if fiche:
                print('- Fiche source : ' + fiche)
            if citekey:
                print('- Clé de citation : ' + citekey + ' (lien : [[@' + citekey + ']])')
                annos = os.path.join(COFFRE, '02 - Annotations', '@' + citekey)
                if os.path.isdir(annos):
                    n = len([x for x in os.listdir(annos) if x.endswith('.md')])
                    print('- Notes de surlignages dans le coffre : ' + os.path.relpath(annos, COFFRE) + ' (' + str(n) + ')')
            print('- Surlignages à jour (base Zotero) : python3 "' + os.path.join(ICI, 'surlignages.py') + '" ' + cle)
            vs = etats.get(str(etat.get('libraryID', '')) + ':' + cle) or {}
        p = (vs.get('primaryViewState') or {}).get('pageIndex')
        if isinstance(p, int):
            print('- Page affichée : ' + str(p + 1) + " (numéro dans le fichier ; l'imprimé peut différer)")
        else:
            print('- Page affichée : inconnue')
        if not principal:
            print('- (ouvert dans une barre latérale)')
        print()


main()
