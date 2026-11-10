#!/usr/bin/env python3
"""Les surlignages et commentaires de Monsieur sur une pièce jointe Zotero,
lus dans la base de Zotero, en lecture seule (Zotero peut rester ouvert).

Ils sont à jour à la dernière synchronisation de Zotero sur ce Mac, y
compris ceux qui n'ont pas encore leur note dans « 02 - Annotations ».

Usage : python3 surlignages.py CLE_PIECE [--pages 40-60] [--couleur jaune]
  CLE_PIECE : l'identifiant de la pièce jointe (donné par ou-je-lis.py)
  --pages   : pages IMPRIMÉES (celles du livre), une ou une plage
  --couleur : jaune, rouge, vert, bleu, violet, magenta, orange, gris
"""
import argparse
import glob
import os
import re
import pathlib
import sqlite3

COULEURS = {
    '#ffd400': 'jaune', '#ffff00': 'jaune', '#facd5a': 'jaune', '#ff6666': 'rouge',
    '#5fb236': 'vert', '#2ea8e5': 'bleu', '#a28ae5': 'violet', '#e56eee': 'magenta',
    '#f19837': 'orange', '#aaaaaa': 'gris',
}
TYPES = {1: 'surlignage', 2: 'note', 3: 'image', 4: 'dessin', 5: 'soulignement', 6: 'texte'}


def racine_zotero():
    # Les profils de Zotero : macOS, Windows (%APPDATA%), Linux.
    profils = [os.path.expanduser('~/Library/Application Support/Zotero/Profiles'),
               os.path.join(os.environ['APPDATA'], 'Zotero', 'Zotero', 'Profiles') if os.environ.get('APPDATA') else '',
               os.path.expanduser('~/.zotero/zotero')]
    for dossier in filter(None, profils):
        for prefs in glob.glob(os.path.join(dossier, '*', 'prefs.js')):
            try:
                texte = open(prefs, encoding='utf-8').read()
            except OSError:
                continue
            m = re.search(r'"extensions\.zotero\.dataDir",\s*"((?:[^"\\]|\\.)+)"', texte)
            # Sous Windows, la préférence double ses barres obliques inverses.
            chemin = m.group(1).replace('\\\\', '\\') if m else ''
            if chemin and os.path.isdir(chemin):
                return chemin
    return os.path.expanduser('~/Zotero')


def entier(s):
    m = re.match(r'\d+', str(s or ''))
    return int(m.group(0)) if m else None


def main():
    a = argparse.ArgumentParser()
    a.add_argument('cle')
    a.add_argument('--pages', default='')
    a.add_argument('--couleur', default='')
    o = a.parse_args()
    base = os.path.join(racine_zotero(), 'zotero.sqlite')
    # immutable=1 : lecture sans verrou, même pendant que Zotero écrit.
    # Une adresse de fichier valable partout (C:/… sous Windows compris).
    uri = pathlib.Path(base).resolve().as_uri() + '?immutable=1'
    con = sqlite3.connect(uri, uri=True)
    lignes = con.execute(
        'SELECT i.key, a.type, a.color, a.pageLabel, a.text, a.comment FROM itemAnnotations a '
        'JOIN items i ON i.itemID = a.itemID JOIN items p ON p.itemID = a.parentItemID '
        'WHERE p.key = ? ORDER BY a.sortIndex', (o.cle,)).fetchall()
    de = a_ = None
    if o.pages:
        m = re.match(r'^\s*(\d+)\s*(?:-\s*(\d+))?\s*$', o.pages)
        if m:
            de = int(m.group(1))
            a_ = int(m.group(2) or m.group(1))
    n = 0
    for cle, typ, couleur, page, texte, commentaire in lignes:
        nom = COULEURS.get(str(couleur or '').lower(), str(couleur or ''))
        if o.couleur and nom != o.couleur.lower():
            continue
        p = entier(page)
        if de is not None and (p is None or p < de or p > a_):
            continue
        n += 1
        comm = re.sub(r'<[^>]+>', '', str(commentaire or '')).strip()
        print('### p. ' + str(page or '?') + ' · ' + nom + ' · ' + TYPES.get(typ, str(typ)) + ' · ' + cle)
        if texte:
            print('> ' + str(texte).strip().replace('\n', '\n> '))
        if comm:
            print('Commentaire de Monsieur : ' + comm)
        print()
    print(str(n) + ' annotation(s) sur ' + str(len(lignes)) + ' pour cette pièce jointe.')


main()
