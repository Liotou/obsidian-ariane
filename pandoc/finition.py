#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ariane — finition du .docx produit par pandoc.

Pandoc reprend les styles du modèle, mais il écrit sa propre section : les
en-têtes du modèle restent dans le fichier mal référencés, et la première page
distincte est perdue. Il écrase aussi les préférences Zotero du modèle, si bien
que Word ne reconnaît plus un « document Zotero » et refuse d'actualiser.

Ce script répare ces points en retouchant le document produit — jamais en le
regénérant, ce qui détruirait les champs Zotero.

Usage : finition.py document.docx ordres.json
  ordres.json = {"modele": "/chemin/Modèle exportation word.docx",
                 "valeurs": {"titre": "...", "dossier": "...",
                             "date": "17/08/2026",
                             "date:long": "Lundi 17 août 2026", "réf": ""},
                 "proprietes": [["Statut", "brouillon"], ...],
                 "styleEnteteTableau": "Titre de tableau",
                 "styleCelluleTableau": "Champ de tableau"}

Le greffon ne sait pas où vont les données : c'est le MODÈLE qui le dit, par
des jetons {{…}} posés dans ses cellules. Voir plus bas la liste des jetons.
"""

import io
import json
import os
import random
import re
import shutil
import string
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile


# --------------------------------------------------------------------------
# Petits outils XML
#
# On travaille sur le texte du XML plutôt que sur un arbre : ElementTree ne
# réécrit que les espaces de noms qu'il croit utiles, ce qui casse l'attribut
# mc:Ignorable des en-têtes de Word. Les fonctions ci-dessous suffisent à
# retrouver les éléments d'un niveau donné, imbrications comprises.
# --------------------------------------------------------------------------

def elements(xml, nom, depart=0, fin=None):
    """Rend les couples (début, fin) des éléments « nom » du premier niveau
    rencontré à partir de « depart ». Les éléments de même nom imbriqués dans
    l'un d'eux ne sont pas rendus."""
    if fin is None:
        fin = len(xml)
    ouvre = re.compile(r"<%s(?=[\s/>])" % re.escape(nom))
    ferme = re.compile(r"</%s>" % re.escape(nom))
    trouves = []
    i = depart
    while True:
        m = ouvre.search(xml, i, fin)
        if not m:
            return trouves
        try:
            j = xml.index(">", m.end())
        except ValueError:
            return trouves
        if xml[j - 1] == "/":            # élément auto-fermant
            trouves.append((m.start(), j + 1))
            i = j + 1
            continue
        profondeur, k = 1, j + 1
        while profondeur:
            a = ouvre.search(xml, k, fin)
            b = ferme.search(xml, k, fin)
            if not b:
                return trouves
            if a and a.start() < b.start():
                ja = xml.index(">", a.end())
                if xml[ja - 1] != "/":
                    profondeur += 1
                k = ja + 1
            else:
                profondeur -= 1
                k = b.end()
        trouves.append((m.start(), k))
        i = k


def echapper(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def desechapper(t):
    return (t.replace("&lt;", "<").replace("&gt;", ">")
             .replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&"))


# <w:t[^>]*> attraperait aussi <w:tcPr> et <w:tab/> : la balise de texte
# s'écrit <w:t> ou <w:t suivi d'une espace.
BALISE_TEXTE = r"<w:t(?:\s[^>]*)?>"


def texte_de(xml):
    """Texte visible d'un fragment : le contenu des <w:t>, rien d'autre."""
    return desechapper("".join(
        re.findall(BALISE_TEXTE + r"(.*?)</w:t>", xml, re.S)))


def normaliser(t):
    """« Réf. » et « ref » se rejoignent : minuscules, sans accent ni ponctuation."""
    t = unicodedata.normalize("NFD", str(t))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", t.lower())


# --------------------------------------------------------------------------
# Styles
# --------------------------------------------------------------------------

def styles_du_docx(pieces):
    """Rend un dictionnaire { nom en minuscules ou id : styleId }."""
    xml = pieces.get("word/styles.xml", b"").decode("utf-8")
    table = {}
    for m in re.finditer(r'<w:style\b[^>]*?w:styleId="([^"]+)"[^>]*?>(.*?)</w:style>', xml, re.S):
        sid, corps = m.group(1), m.group(2)
        nm = re.search(r'<w:name\s+w:val="([^"]*)"', corps)
        if nm:
            nom = nm.group(1).strip().lower()
            table[nom] = sid
            table.setdefault(nom.replace(" ", ""), sid)
        table.setdefault(sid.lower(), sid)
    return table


def identifiant(table, voulu, defaut=""):
    """Word attend un styleId, jamais le nom affiché du style.

    Le modèle français range « Corps de texte » sous le nom anglais « Body
    Text » : seul l'identifiant porte le libellé français, et il s'écrit sans
    espaces (« Corpsdetexte »). On essaie donc aussi la forme compactée.
    """
    if not voulu:
        return defaut
    v = str(voulu).strip().lower()
    return table.get(v) or table.get(v.replace(" ", "")) or defaut or voulu


def remapper_styles(doc, table, correspondances):
    """Remplace les styles inventés par pandoc par ceux du modèle."""
    if not correspondances:
        return doc, 0
    conv = {}
    for depuis, vers in correspondances.items():
        cible = identifiant(table, vers)
        if cible:
            conv[depuis] = cible
    if not conv:
        return doc, 0
    n = [0]

    def sur_style(m):
        a = m.group(1)
        if a in conv:
            n[0] += 1
            return '<w:pStyle w:val="%s"/>' % conv[a]
        return m.group(0)

    return re.sub(r'<w:pStyle w:val="([^"]+)"\s*/>', sur_style, doc), n[0]


# --------------------------------------------------------------------------
# Préférences Zotero
#
# Le module Zotero de Word ne reconnaît un document que s'il y trouve ses
# préférences, rangées dans docProps/custom.xml sous ZOTERO_PREF_1, _2, …
# Pandoc n'écrit pas ces propriétés pour le .docx : le filtre Lua ne les pose
# que pour l'ODT. Sans elles, « Actualiser » répond « Vous devez insérer une
# citation avant d'effectuer cette opération ». On recopie donc celles du
# modèle, en renouvelant seulement l'identifiant de session.
# --------------------------------------------------------------------------

TAILLE_TRANCHE = 255      # découpe retenue par Zotero, relevée dans le modèle
FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}"


def prefs_du_modele(chemin_modele):
    """Rend la chaîne <data …>…</data> des préférences Zotero du modèle."""
    if not chemin_modele or not os.path.exists(chemin_modele):
        return ""
    try:
        with zipfile.ZipFile(chemin_modele) as z:
            xml = z.read("docProps/custom.xml").decode("utf-8")
    except (KeyError, zipfile.BadZipFile):
        return ""
    tranches = re.findall(
        r'name="ZOTERO_PREF_(\d+)"[^>]*>\s*<vt:lpwstr>(.*?)</vt:lpwstr>', xml, re.S)
    if not tranches:
        return ""
    tranches.sort(key=lambda t: int(t[0]))
    return desechapper("".join(t[1] for t in tranches))


def session_neuve(data):
    """Chaque document doit porter sa propre session : deux documents ouverts
    sous le même identifiant se confondraient du point de vue de Zotero."""
    jeton = "".join(random.choice(string.ascii_letters + string.digits)
                    for _ in range(8))
    return re.sub(r'(<session id=")[^"]*(")', r"\g<1>%s\g<2>" % jeton, data, count=1)


def injecter_prefs_zotero(pieces, data):
    """Inscrit les préférences dans docProps/custom.xml, en tranches de 255
    caractères, avec des pid uniques et consécutifs."""
    if not data:
        return 0
    xml = pieces.get("docProps/custom.xml", b"").decode("utf-8")
    if not xml.strip():
        xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
               '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument'
               '/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org'
               '/officeDocument/2006/docPropsVTypes"></Properties>')

    # On retire les propriétés Zotero déjà présentes, y compris la propriété
    # vide « zotero » que pandoc laisse derrière lui, avant de poser les nôtres.
    xml = re.sub(r'<property\b[^>]*name="(?:ZOTERO_PREF_\d+|zotero)"[^>]*>.*?</property>',
                 "", xml, flags=re.S)

    pids = [int(p) for p in re.findall(r'\bpid="(\d+)"', xml)]
    pid = max(pids) + 1 if pids else 2

    tranches = [data[i:i + TAILLE_TRANCHE]
                for i in range(0, len(data), TAILLE_TRANCHE)]
    ajouts = []
    for n, tranche in enumerate(tranches, start=1):
        ajouts.append('<property fmtid="%s" pid="%d" name="ZOTERO_PREF_%d">'
                      '<vt:lpwstr>%s</vt:lpwstr></property>'
                      % (FMTID, pid, n, echapper(tranche)))
        pid += 1

    xml = xml.replace("</Properties>", "".join(ajouts) + "</Properties>", 1)
    pieces["docProps/custom.xml"] = xml.encode("utf-8")
    return len(tranches)


# --------------------------------------------------------------------------
# La section du modèle
#
# Le modèle désigne header2.xml comme en-tête « default » — l'en-tête
# principal, celui au bandeau et aux logos, qui se répète à chaque page — et
# header1.xml en « even », inerte puisque le modèle n'active pas les en-têtes
# pairs et impairs. Il n'y a pas de <w:titlePg/>. Pandoc écrit sa propre
# section : on y rétablit exactement les références du modèle, sans rien
# inventer.
# --------------------------------------------------------------------------

def cibles_des_relations(rels):
    """Rend { rId : nom de fichier } pour les en-têtes et les pieds."""
    return dict(re.findall(
        r'<Relationship Id="([^"]+)"[^>]*Target="((?:header|footer)\d+\.xml)"', rels))


def section_du_modele(chemin_modele):
    """Rend ([(genre, type, fichier)], titlePg) tels que le modèle les pose."""
    if not chemin_modele or not os.path.exists(chemin_modele):
        return [], False
    try:
        with zipfile.ZipFile(chemin_modele) as z:
            doc = z.read("word/document.xml").decode("utf-8")
            rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
    except (KeyError, zipfile.BadZipFile):
        return [], False
    cibles = cibles_des_relations(rels)
    sect = re.search(r"(?s)<w:sectPr\b.*?</w:sectPr>", doc)
    if not sect:
        return [], False
    bloc = sect.group(0)
    refs = []
    for genre, attrs in re.findall(r"<w:(header|footer)Reference\b([^>]*)/>", bloc):
        typ = re.search(r'w:type="([^"]+)"', attrs)
        rid = re.search(r'r:id="([^"]+)"', attrs)
        if typ and rid and rid.group(1) in cibles:
            refs.append((genre, typ.group(1), cibles[rid.group(1)]))
    return refs, "<w:titlePg/>" in bloc


def rattacher_entetes(doc, rels, refs_modele, titlepg):
    """Rétablit dans la section de pandoc les références du modèle."""
    if not refs_modele:
        return doc, []
    par_fichier = {v: k for k, v in cibles_des_relations(rels).items()}
    refs, resume = [], []
    for genre, typ, fichier in refs_modele:
        rid = par_fichier.get(fichier)
        if not rid:
            continue
        refs.append('<w:%sReference w:type="%s" r:id="%s"/>' % (genre, typ, rid))
        resume.append("%s=%s" % (typ, fichier))

    def sur_sect(m):
        bloc = m.group(0)
        # On efface les références de pandoc avant d'inscrire celles du modèle :
        # les compléter au cas par cas produisait des doublons.
        bloc = re.sub(r"<w:(?:header|footer)Reference\b[^>]*/>", "", bloc)
        bloc = re.sub(r"<w:titlePg\s*/>", "", bloc)
        bloc = re.sub(r"(<w:sectPr\b[^>]*>)", r"\1" + "".join(refs), bloc, count=1)
        if titlepg:
            bloc = bloc.replace("</w:sectPr>", "<w:titlePg/></w:sectPr>")
        return bloc

    return re.sub(r"(?s)<w:sectPr\b.*?</w:sectPr>", sur_sect, doc), resume


# --------------------------------------------------------------------------
# Les jetons du modèle
#
# Les consignes vivent dans le modèle Word, pas dans le greffon.
# Partout où le modèle attend une donnée, il porte un jeton entre doubles
# accolades ; la finition le remplace, sans rien connaître de la mise en page.
# Ajouter un rang au modèle avec un nouveau jeton suffit : le code ne bouge pas.
#
#   {{titre}}               titre de la note
#   {{dossier}}             dossier du coffre, sans son numéro de rangement
#   {{date}}                date de création, 17/08/2026
#   {{date:long}}           date de création, Lundi 17 août 2026
#   {{réf}}                 référence de la note, si elle existe
#   {{propriété:clé}}       une propriété nommée de l'en-tête de la note
#   {{propriétés.nom}}      dans un rang répétable : le nom de la propriété
#   {{propriétés.valeur}}   dans le même rang : sa valeur
#
# Un rang qui porte {{propriétés.…}} est cloné autant de fois qu'il reste de
# propriétés, et disparaît s'il n'en reste aucune. Un jeton inconnu s'efface.
# Une cellule ou un paragraphe portant un champ Word — « Page » et ses champs
# PAGE et NUMPAGES — n'est jamais touché.
# --------------------------------------------------------------------------

JETON = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")

# Jetons rencontrés dans le modèle et que le greffon ne sait pas honorer. Ils
# sont effacés du document, mais jamais en silence.
JETONS_INCONNUS = set()
PREFIXE_REPETE = "proprietes."

# <w:p> ne s'imbrique jamais : une expression paresseuse suffit à les isoler.
RE_PARAGRAPHE = re.compile(r"(?s)<w:p(?:\s[^>]*)?/>|<w:p(?:\s[^>]*)?>.*?</w:p>")


def cle_jeton(t):
    """« Réf. » et « ref », « Propriétés.nom » et « proprietes.nom » se
    rejoignent : sans accent, en minuscules, sans espaces."""
    t = unicodedata.normalize("NFD", str(t))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", "", t.lower())


def cles_du_fragment(xml):
    """Les jetons d'un fragment, lus sur son TEXTE et non sur son XML.

    Dès que le modèle est retouché dans Word, Word scinde les jetons en
    plusieurs runs et y glisse ses marques de correction :
    « <w:r><w:t>{{</w:t></w:r><w:proofErr/><w:r><w:t>encadré.titre</w:t></w:r> ».
    Un jeton saisi dans Word ne se retrouve donc jamais d'un seul tenant dans le
    XML : le chercher là serait perdre le gabarit au premier remaniement."""
    return {cle_jeton(m.group(1)) for m in JETON.finditer(texte_de(xml))}


def cellule_a_champ(fragment):
    return (("fldChar" in fragment) or ("<w:fldSimple" in fragment)
            or ("<w:sdt>" in fragment))


def remplacer_texte(fragment, texte):
    """Met « texte » dans le fragment — cellule ou paragraphe — sans toucher à
    sa mise en forme : on reprend le premier run porteur de texte, on garde ses
    rPr, on efface les suivants. Un paragraphe reste toujours un paragraphe."""
    runs = elements(fragment, "w:r")
    porteurs = [(a, b) for a, b in runs
                if re.search(BALISE_TEXTE, fragment[a:b])
                and "instrText" not in fragment[a:b]]
    if porteurs:
        a, b = porteurs[0]
        rpr = re.search(r"<w:rPr>.*?</w:rPr>", fragment[a:b], re.S)
        neuf = ('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>'
                % (rpr.group(0) if rpr else "", echapper(texte)))
        sortie = fragment
        for c, d in reversed(porteurs[1:]):      # de la fin vers le début,
            sortie = sortie[:c] + sortie[d:]     # pour ne pas décaler a et b
        return sortie[:a] + neuf + sortie[b:]

    # Fragment sans run : on en insère un après les propriétés du paragraphe.
    fin_pr = fragment.find("</w:pPr>")
    if fin_pr != -1:
        pos = fin_pr + len("</w:pPr>")
    else:
        pos = fragment.index(">") + 1
    run = '<w:r><w:t xml:space="preserve">%s</w:t></w:r>' % echapper(texte)
    return fragment[:pos] + run + fragment[pos:]


def tous_les_elements(xml, nom):
    """Les éléments « nom » à toute profondeur, imbrications comprises."""
    trouves = []

    def descendre(a, b):
        for x, y in elements(xml, nom, a, b):
            trouves.append((x, y))
            descendre(x + 1, y)

    descendre(0, len(xml))
    return trouves


def substituer_paragraphes(xml, valeurs, effacer_inconnus=True):
    """Remplace les jetons dans chaque paragraphe. Rend (xml, nombre posé)."""
    poses = [0]
    inconnus = set()

    def sur_paragraphe(m):
        para = m.group(0)
        if "{{" not in para or cellule_a_champ(para):
            return para
        texte = texte_de(para)
        if "{{" not in texte:
            return para
        touche = [False]

        def sur_jeton(j):
            cle = cle_jeton(j.group(1))
            if cle in valeurs:
                touche[0] = True
                poses[0] += 1
                return valeurs[cle]
            if effacer_inconnus:
                touche[0] = True
                inconnus.add(cle)
                return ""
            return j.group(0)

        neuf = JETON.sub(sur_jeton, texte)
        return remplacer_texte(para, neuf) if touche[0] else para

    resultat = RE_PARAGRAPHE.sub(sur_paragraphe, xml)
    if inconnus:
        JETONS_INCONNUS.update(inconnus)
    return resultat, poses[0]


def nettoyer_clone(xml):
    """Un fragment recopié ne doit emporter ni signets — leurs identifiants
    entreraient en conflit avec ceux de pandoc — ni identifiants de révision."""
    xml = re.sub(r"<w:bookmark(?:Start|End)\b[^>]*/>", "", xml)
    return re.sub(r'\sw14:(?:paraId|textId)="[^"]*"', "", xml)


def repeter_rangs(xml, proprietes):
    """Clone le rang portant {{propriétés.…}}, une fois par propriété."""
    rangs = tous_les_elements(xml, "w:tr")
    cibles = [(a, b) for a, b in rangs
              if any(c.startswith(PREFIXE_REPETE) for c in cles_du_fragment(xml[a:b]))]
    if not cibles:
        return xml, 0
    # Un rang extérieur contient les rangs du tableau qu'il abrite : on ne
    # garde que les plus intérieurs, seuls à répéter.
    cibles = [(a, b) for a, b in cibles
              if not any((c, d) != (a, b) and a <= c and d <= b for c, d in cibles)]

    poses = 0
    for a, b in sorted(cibles, reverse=True):
        gabarit = nettoyer_clone(xml[a:b])
        clones = []
        for nom, valeur in proprietes:
            copie, _ = substituer_paragraphes(
                gabarit,
                {PREFIXE_REPETE + "nom": str(nom),
                 PREFIXE_REPETE + "valeur": str(valeur)},
                effacer_inconnus=False)
            clones.append(copie)
            poses += 1
        xml = xml[:a] + "".join(clones) + xml[b:]
    return xml, poses


def remplir_gabarit(xml, valeurs, proprietes):
    """Répète les rangs, puis substitue les jetons. Rend (xml, rangs, jetons)."""
    xml, rangs = repeter_rangs(xml, proprietes)
    xml, jetons = substituer_paragraphes(xml, valeurs)
    return xml, rangs, jetons


# --------------------------------------------------------------------------
# En-tête secondaire — le tableau « Propriétés du document »
#
# Ce n'est pas un en-tête au sens de Word : c'est le premier bloc du corps,
# donc il n'apparaît que sur la première page. Le document de référence de
# pandoc ne transporte que des styles, jamais de structure : on recopie donc
# le gabarit depuis le modèle, jetons compris, et on le remplit.
# --------------------------------------------------------------------------

# Ce que chaque jeton consomme dans l'en-tête de la note. Si le modèle porte
# {{date}}, la propriété « date » ne revient pas dans les rangs répétés ; s'il
# ne le porte pas, elle y revient. C'est donc encore le modèle qui décide, le
# greffon ne faisant que dire ce que chaque jeton désigne.
CONSOMME = {
    "titre": ("titre", "aliases"),
    "dossier": ("type",),
    "date": ("date",),
    "date:long": ("date",),
    "ref": ("ref", "reference"),
}


def jetons_du_modele(chemin_modele, gabarits=None):
    """Les jetons réellement posés : ceux des en-têtes et des pieds, et ceux du
    seul tableau des propriétés. La légende en fin de modèle cite les jetons
    pour les expliquer : elle ne doit pas être prise pour une consigne."""
    if not chemin_modele or not os.path.exists(chemin_modele):
        return set()
    morceaux = [g["tbl"] for g in (gabarits or {}).values() if g]
    try:
        with zipfile.ZipFile(chemin_modele) as z:
            for nom in z.namelist():
                if re.match(r"word/(?:header|footer)\d+\.xml$", nom):
                    morceaux.append(z.read(nom).decode("utf-8"))
    except zipfile.BadZipFile:
        return set()
    poses = set()
    for xml in morceaux:
        poses |= cles_du_fragment(xml)
    return poses


def filtrer_proprietes(proprietes, jetons):
    """Retire des rangs répétés les propriétés que le modèle place déjà.

    La comparaison passe par normaliser(), qui efface aussi les traits d'union :
    « temps-passe » dans le jeton et « Temps passe » dans le libellé désignent
    la même propriété."""
    prises = set()
    for jeton in jetons:
        for cle in CONSOMME.get(jeton, ()):
            prises.add(normaliser(cle))
        if jeton.startswith("propriete:"):
            prises.add(normaliser(jeton.split(":", 1)[1]))
    return [(e, v) for e, v in proprietes if normaliser(e) not in prises]


PREFIXE_ENCADRE = "encadre."

# Le vocabulaire que le greffon sait honorer. Tout jeton hors de cette liste
# est signalé : le modèle se retouche dans Word, et une faute de frappe
# dans un jeton s'effacerait sans bruit si l'on ne la disait pas.
VOCABULAIRE = {
    "titre", "dossier", "date", "date:long", "ref",
    "proprietes.nom", "proprietes.valeur",
    "encadre.titre", "encadre.contenu",
}
PREFIXE_NOMME = "propriete:"


def jeton_connu(cle):
    return cle in VOCABULAIRE or cle.startswith(PREFIXE_NOMME)


def controler_modele(chemin_modele):
    """Rend (constats, anomalies). Le modèle est la source des consignes : s'il
    se dérègle, tout le reste se dérègle en silence. On le dit."""
    constats, anomalies = [], []
    if not chemin_modele or not os.path.exists(chemin_modele):
        return constats, ["modèle introuvable : %s" % (chemin_modele or "—")]
    try:
        with zipfile.ZipFile(chemin_modele) as z:
            noms = z.namelist()
            entetes = {n: z.read(n).decode("utf-8") for n in noms
                       if re.match(r"word/(?:header|footer)\d+\.xml$", n)}
    except zipfile.BadZipFile:
        return constats, ["modèle illisible (archive endommagée)"]

    gabarits = gabarits_du_modele(chemin_modele)
    for genre, libelle in (("proprietes", "tableau des propriétés"),
                           ("encadre", "gabarit d'encadré")):
        if gabarits[genre]:
            cles = sorted(cles_du_fragment(gabarits[genre]["tbl"]))
            constats.append("%s : trouvé, jetons %s" % (libelle, ", ".join(cles)))
        else:
            anomalies.append("%s : ABSENT du corps du modèle" % libelle)

    for nom, xml in sorted(entetes.items()):
        cles = sorted(cles_du_fragment(xml))
        if cles:
            constats.append("%s : jetons %s" % (nom.split("/")[-1], ", ".join(cles)))

    toutes = set()
    for g in gabarits.values():
        if g:
            toutes |= cles_du_fragment(g["tbl"])
    for xml in entetes.values():
        toutes |= cles_du_fragment(xml)
    inconnus = sorted(c for c in toutes if not jeton_connu(c))
    if inconnus:
        anomalies.append("jetons non reconnus, qui seront effacés : %s"
                         % ", ".join("{{%s}}" % c for c in inconnus))

    if not prefs_du_modele(chemin_modele):
        anomalies.append("préférences Zotero (ZOTERO_PREF) absentes du modèle : "
                         "Word refusera d'actualiser les citations")
    refs, _ = section_du_modele(chemin_modele)
    if not refs:
        anomalies.append("aucune référence d'en-tête dans la section du modèle")
    else:
        constats.append("section : %s" % ", ".join("%s=%s" % (t, f) for _, t, f in refs))
    return constats, anomalies


def gabarits_du_modele(chemin_modele):
    """Extrait du corps du modèle ses gabarits de tableau, chacun reconnu aux
    jetons qu'il porte — c'est ainsi que le modèle se désigne lui-même, sans
    que le code ait à nommer ses tableaux. Chaque gabarit emporte le paragraphe
    qui le suit : sans lui, deux tableaux voisins se colleraient dans Word."""
    vide = {"proprietes": None, "encadre": None}
    if not chemin_modele or not os.path.exists(chemin_modele):
        return vide
    try:
        with zipfile.ZipFile(chemin_modele) as z:
            doc = z.read("word/document.xml").decode("utf-8")
    except (KeyError, zipfile.BadZipFile):
        return vide
    corps = doc.find("<w:body>")
    if corps == -1:
        return vide
    gabarits = dict(vide)
    for a, b in elements(doc, "w:tbl", corps):
        cles = cles_du_fragment(doc[a:b])
        if not cles:
            continue
        genre = ("encadre" if any(c.startswith(PREFIXE_ENCADRE) for c in cles)
                 else "proprietes")
        if gabarits[genre]:
            continue
        tbl = nettoyer_clone(doc[a:b])
        suivants = elements(doc, "w:p", b)
        para = nettoyer_clone(doc[suivants[0][0]:suivants[0][1]]) if suivants else ""
        gabarits[genre] = {
            "tbl": tbl, "para": para,
            "numids": sorted(set(re.findall(r'<w:numId w:val="(\d+)"', tbl))),
        }
    return gabarits


# --------------------------------------------------------------------------
# Mises en avant Obsidian
#
# Un encadré « > [!info] » devient, dans le markdown, deux blocs à style Word :
# le titre puis le contenu. Ici, on les retrouve à leurs styles et on les
# enferme dans le gabarit d'encadré du modèle. Le contenu est DÉPLACÉ tel quel
# — listes, tableaux et champs de citation compris — jamais reconstruit.
# --------------------------------------------------------------------------

# Marques posées par le greffon autour d'une mise en avant. On ne se fie pas
# aux styles : pandoc donne aux éléments de liste le style de liste, non celui
# du bloc, et un encadré à puces échapperait à toute détection par le style.
MARQUE_DEBUT = "\u27e6ariane:encadre\u27e7"
MARQUE_FIN = "\u27e6/ariane:encadre\u27e7"


def encadrer_mises_en_avant(doc, gabarit):
    """Remplace chaque bloc borné par les marques par le gabarit d'encadré du
    modèle, titre et contenu déposés dedans. Le contenu est DÉPLACÉ tel quel —
    listes, tableaux et champs de citation compris — jamais reconstruit.
    Sans gabarit, les marques sont simplement effacées."""
    ouverture = re.search(r"<w:body>", doc)
    if not ouverture:
        return doc, 0
    debut = ouverture.end()
    fin = doc.rindex("</w:body>") if "</w:body>" in doc else len(doc)
    paras = elements(doc, "w:p", debut, fin)

    blocs = []
    ouvert = None
    for a, b in paras:
        texte = texte_de(doc[a:b])
        if MARQUE_DEBUT in texte:
            ouvert = (a, b, texte.split(MARQUE_DEBUT, 1)[1].strip())
        elif MARQUE_FIN in texte and ouvert:
            blocs.append((ouvert[0], ouvert[1], a, b, ouvert[2]))
            ouvert = None
    if not blocs:
        return doc, 0

    poses = 0
    for d0, d1, f0, f1, titre in reversed(blocs):
        contenu = doc[d1:f0]
        if not gabarit:
            # Pas de gabarit d'encadré dans le modèle : on retire les marques,
            # en gardant le titre dans son paragraphe — le perdre serait pire
            # que de n'avoir pas d'encadrement.
            entete = remplacer_texte(doc[d0:d1], titre) if titre else ""
            doc = doc[:d0] + entete + contenu + doc[f1:]
            continue
        cadre = gabarit["tbl"]
        if titre:
            cadre, _ = substituer_paragraphes(
                cadre, {PREFIXE_ENCADRE + "titre": titre}, effacer_inconnus=False)
        else:
            cadre = retirer_paragraphe_du_jeton(cadre, PREFIXE_ENCADRE + "titre")
        cadre = remplacer_paragraphe_du_jeton(
            cadre, PREFIXE_ENCADRE + "contenu", contenu)
        doc = doc[:d0] + cadre + gabarit["para"] + doc[f1:]
        poses += 1
    return doc, poses


def paragraphe_du_jeton(xml, cle):
    for a, b in tous_les_elements(xml, "w:p"):
        if cle in cles_du_fragment(xml[a:b]):
            return a, b
    return None


def retirer_paragraphe_du_jeton(xml, cle):
    ou = paragraphe_du_jeton(xml, cle)
    return xml[:ou[0]] + xml[ou[1]:] if ou else xml


def remplacer_paragraphe_du_jeton(xml, cle, fragment):
    ou = paragraphe_du_jeton(xml, cle)
    return xml[:ou[0]] + fragment + xml[ou[1]:] if ou else xml


def inserer_entete_secondaire(doc, gabarit, valeurs, proprietes):
    """Pose le tableau des propriétés en tête du corps, gabarit rempli."""
    if not gabarit:
        return doc, 0, 0
    tbl, rangs, jetons = remplir_gabarit(gabarit["tbl"], valeurs, proprietes)
    ouverture = re.search(r"<w:body>", doc)
    if not ouverture:
        return doc, 0, 0
    i = ouverture.end()
    return doc[:i] + tbl + gabarit["para"] + doc[i:], rangs, jetons


def fusionner_numerotation(pieces, chemin_modele, numids):
    """La numérotation automatique du titre « Propriétés du document » tient à
    un numId du modèle ; pandoc écrit sa propre numbering.xml et le perd. On
    recopie les définitions manquantes, en évitant les identifiants déjà pris."""
    if not numids or not chemin_modele or not os.path.exists(chemin_modele):
        return 0
    if "word/numbering.xml" not in pieces:
        return 0
    try:
        with zipfile.ZipFile(chemin_modele) as z:
            source = z.read("word/numbering.xml").decode("utf-8")
    except (KeyError, zipfile.BadZipFile):
        return 0
    cible = pieces["word/numbering.xml"].decode("utf-8")
    presents = set(re.findall(r'<w:num w:numId="(\d+)"', cible))
    abstraits_pris = set(re.findall(r'<w:abstractNum w:abstractNumId="(\d+)"', cible))
    ajouts_abstraits, ajouts_nums = [], []
    for nid in numids:
        if nid in presents:
            continue
        mn = re.search(r'(?s)<w:num w:numId="%s"[^>]*>.*?</w:num>' % nid, source)
        if not mn:
            continue
        bloc_num = mn.group(0)
        ma = re.search(r'<w:abstractNumId w:val="(\d+)"', bloc_num)
        if not ma:
            continue
        aid = ma.group(1)
        mabs = re.search(
            r'(?s)<w:abstractNum w:abstractNumId="%s"[^>]*>.*?</w:abstractNum>' % aid,
            source)
        if not mabs:
            continue
        bloc_abs = mabs.group(0)
        if aid in abstraits_pris:
            neuf = str(max(int(x) for x in abstraits_pris) + 1)
            bloc_abs = bloc_abs.replace('w:abstractNumId="%s"' % aid,
                                        'w:abstractNumId="%s"' % neuf, 1)
            bloc_num = bloc_num.replace('<w:abstractNumId w:val="%s"/>' % aid,
                                        '<w:abstractNumId w:val="%s"/>' % neuf, 1)
            aid = neuf
        abstraits_pris.add(aid)
        ajouts_abstraits.append(bloc_abs)
        ajouts_nums.append(bloc_num)

    if not ajouts_nums:
        return 0
    # Le schéma veut tous les <w:abstractNum> avant les <w:num>.
    m = re.search(r"<w:num\b", cible)
    if m:
        cible = cible[:m.start()] + "".join(ajouts_abstraits) + cible[m.start():]
    else:
        cible = cible.replace("</w:numbering>",
                              "".join(ajouts_abstraits) + "</w:numbering>", 1)
    cible = cible.replace("</w:numbering>",
                          "".join(ajouts_nums) + "</w:numbering>", 1)
    pieces["word/numbering.xml"] = cible.encode("utf-8")
    return len(ajouts_nums)


# --------------------------------------------------------------------------
# Champs Zotero : entités doublement échappées, et bibliographie
# --------------------------------------------------------------------------

# Le filtre Lua rend les préfixes de citation en HTML (stringify passe par
# pandoc.write(..., 'html')) : « Steen & Aven » y devient « Steen &amp; Aven »,
# puis « &amp;amp; » une fois le tout échappé pour le XML. Zotero ne décode pas
# ces entités et les affiche telles quelles dans la citation actualisée. On les
# ramène à leur caractère, dans les seules instructions de champ Zotero — les
# balises de mise en forme du préfixe, écrites &lt;i&gt;, ne sont pas touchées.
ENTITES_DOUBLES = (("&amp;amp;", "&amp;"), ("&amp;lt;", "&lt;"),
                   ("&amp;gt;", "&gt;"), ("&amp;quot;", "&quot;"),
                   ("&amp;apos;", "&apos;"), ("&amp;#39;", "&apos;"))


def desechapper_champs_zotero(doc):
    n = [0]

    def sur_instruction(m):
        bloc = m.group(0)
        if "ZOTERO_" not in bloc:
            return bloc
        for double, simple in ENTITES_DOUBLES:
            if double in bloc:
                n[0] += bloc.count(double)
                bloc = bloc.replace(double, simple)
        return bloc

    doc = re.sub(r"(?s)<w:instrText[^>]*>.*?</w:instrText>", sur_instruction, doc)

    # Le texte affiché du champ avant actualisation — « <Do Zotero Refresh: …> »
    # — porte la même double entité. Zotero le remplacera, mais on le lit
    # d'ici là.
    def sur_apercu(m):
        bloc = m.group(0)
        if "Do Zotero Refresh" not in bloc:
            return bloc
        for double, simple in ENTITES_DOUBLES:
            if double in bloc:
                n[0] += bloc.count(double)
                bloc = bloc.replace(double, simple)
        return bloc

    doc = re.sub(r"(?s)<w:t(?:\s[^>]*)?>.*?</w:t>", sur_apercu, doc)
    return doc, n[0]


# Le filtre ne pose le champ de bibliographie que pour l'ODT. Sans lui, Zotero
# actualise les citations mais ne sait pas où écrire la bibliographie, et
# il faudrait l'ajouter à la main dans Word. On l'inscrit à la fin du corps.
def poser_bibliographie(doc, style):
    if "ZOTERO_BIBL" in doc:
        return doc, False
    m = re.search(r"<w:sectPr\b", doc)
    if not m:
        return doc, False
    champ = ('<w:p><w:pPr><w:pStyle w:val="%s"/></w:pPr>'
             '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
             '<w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_BIBL '
             '{"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY '
             '</w:instrText></w:r>'
             '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
             '<w:r><w:t xml:space="preserve">%s</w:t></w:r>'
             '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
             % (style, echapper("<Bibliographie : Actualiser dans Zotero>")))
    return doc[:m.start()] + champ + doc[m.start():], True


# --------------------------------------------------------------------------
# Tableaux : filets et styles de cellule
# --------------------------------------------------------------------------

def bordures():
    return "<w:tblBorders>%s</w:tblBorders>" % "".join(
        '<w:%s w:val="single" w:sz="4" w:space="0" w:color="000000"/>' % c
        for c in ("top", "left", "bottom", "right", "insideH", "insideV"))


def habiller_tableaux(doc, style_entete, style_cellule, style_tableau, connus):
    def sur_table(m):
        t = m.group(0)
        # Pandoc renvoie à un style de tableau « Table » qui n'existe pas dans
        # le modèle : Word l'ignore en silence, mais un style inconnu reste un
        # défaut. On le ramène à la grille du modèle.
        def sur_tblstyle(s):
            return ('<w:tblStyle w:val="%s"/>'
                    % (s.group(1) if s.group(1) in connus else style_tableau))

        t = re.sub(r'<w:tblStyle w:val="([^"]+)"\s*/>', sur_tblstyle, t)
        if "<w:tblBorders>" not in t:
            if "<w:tblPr>" in t:
                t = t.replace("<w:tblPr>", "<w:tblPr>" + bordures(), 1)
            else:
                t = t.replace("<w:tbl>", "<w:tbl><w:tblPr>" + bordures() + "</w:tblPr>", 1)
        rangs = re.findall(r"<w:tr\b.*?</w:tr>", t, re.S)
        for i, rang in enumerate(rangs):
            style = style_entete if i == 0 else style_cellule
            neuf = re.sub(r'<w:pStyle w:val="[^"]*"\s*/>',
                          '<w:pStyle w:val="%s"/>' % style, rang)
            # Un paragraphe sans style n'en reçoit un que s'il n'en avait pas.
            neuf = re.sub(r"<w:p>(?!<w:pPr)",
                          '<w:p><w:pPr><w:pStyle w:val="%s"/></w:pPr>' % style, neuf)
            t = t.replace(rang, neuf, 1)
        return t

    return re.sub(r"<w:tbl>.*?</w:tbl>", sur_table, doc, flags=re.S)


# --------------------------------------------------------------------------

def verifier_xml(pieces, noms):
    """Un XML mal formé ne se voit qu'à l'ouverture dans Word. On le voit ici."""
    for nom in noms:
        if nom in pieces:
            ET.fromstring(pieces[nom])


def verifier(chemin_modele):
    """Mode « --verifier » : dit ce que le modèle porte, et ce qui cloche."""
    constats, anomalies = controler_modele(chemin_modele)
    print("Modèle : %s" % chemin_modele)
    for c in constats:
        print("  · %s" % c)
    if anomalies:
        for a in anomalies:
            print("ATTENTION : %s" % a)
        return 1
    print("  · aucune anomalie")
    return 0


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--verifier":
        return verifier(sys.argv[2])
    if len(sys.argv) < 3:
        print("usage: finition.py document.docx ordres.json", file=sys.stderr)
        print("       finition.py --verifier modele.docx", file=sys.stderr)
        return 2
    chemin, fordres = sys.argv[1], sys.argv[2]
    ordres = json.load(io.open(fordres, encoding="utf-8"))
    modele = ordres.get("modele", "")
    valeurs = {cle_jeton(c): str(v) for c, v in (ordres.get("valeurs") or {}).items()}
    proprietes = [(str(e), str(v)) for e, v in ordres.get("proprietes", [])]
    st_entete = ordres.get("styleEnteteTableau", "Titredetableau")
    st_cellule = ordres.get("styleCelluleTableau", "Champdetableau")

    with zipfile.ZipFile(chemin) as z:
        pieces = {n: z.read(n) for n in z.namelist()}

    if "word/document.xml" not in pieces:
        print("document.xml introuvable", file=sys.stderr)
        return 1

    doc = pieces["word/document.xml"].decode("utf-8")
    rels = pieces.get("word/_rels/document.xml.rels", b"").decode("utf-8")

    zotero_avant = doc.count("ZOTERO_ITEM")

    table = styles_du_docx(pieces)
    refs_modele, titlepg = section_du_modele(modele)
    doc, resume = rattacher_entetes(doc, rels, refs_modele, titlepg)
    doc, remappes = remapper_styles(doc, table, ordres.get("styles") or {})
    doc = habiller_tableaux(doc,
                            identifiant(table, st_entete, "Titredetableau"),
                            identifiant(table, st_cellule, "Champdetableau"),
                            identifiant(table, "Table Grid", "Grilledutableau"),
                            set(table.values()))

    # L'en-tête secondaire vient APRÈS l'habillage des tableaux : il porte ses
    # propres styles, qu'un habillage général écraserait.
    gabarits = gabarits_du_modele(modele)

    # Les mises en avant, enfermées dans le gabarit d'encadré du modèle. Avant
    # l'en-tête secondaire, pour ne pas parcourir celui-ci.
    encadres_vus = MARQUE_DEBUT in doc
    doc, encadres = encadrer_mises_en_avant(doc, gabarits["encadre"])

    gabarit = gabarits["proprietes"]
    # Le modèle décide : une propriété qu'il place déjà par un jeton nommé ne
    # revient pas dans les rangs répétés.
    proprietes = filtrer_proprietes(proprietes, jetons_du_modele(modele, gabarits))
    doc, rangs, jetons_corps = inserer_entete_secondaire(doc, gabarit, valeurs, proprietes)
    numids = sorted({n for g in gabarits.values() if g for n in g["numids"]})
    numeros = fusionner_numerotation(pieces, modele, numids)

    doc, entites = desechapper_champs_zotero(doc)

    biblio = False
    if ordres.get("bibliographie", True):
        doc, biblio = poser_bibliographie(
            doc, identifiant(table, "Références bib", "Rfrencesbib"))

    if doc.count("ZOTERO_ITEM") != zotero_avant:
        print("ANOMALIE : champs Zotero perdus", file=sys.stderr)
        return 1

    pieces["word/document.xml"] = doc.encode("utf-8")

    # Préférences Zotero, sans lesquelles Word refuse d'actualiser.
    data = prefs_du_modele(modele)
    tranches = injecter_prefs_zotero(pieces, session_neuve(data) if data else "")

    # Les en-têtes de Word : mêmes jetons, même moteur. On ne connaît ni leurs
    # étiquettes ni leur disposition, c'est le modèle qui les porte.
    jetons_entetes = 0
    for nom in sorted(n for n in pieces if re.match(r"word/header\d+\.xml$", n)):
        xml = pieces[nom].decode("utf-8")
        if "{{" not in xml:
            continue
        xml, _, n = remplir_gabarit(xml, valeurs, proprietes)
        jetons_entetes += n
        pieces[nom] = xml.encode("utf-8")

    verifier_xml(pieces, [n for n in pieces if n.endswith(".xml")])

    # Garde-fous : le modèle est retouché à la main, et rien ne doit se
    # dérégler en silence.
    alertes = list(controler_modele(modele)[1])
    if JETONS_INCONNUS:
        alertes.append("jetons effacés faute d'être reconnus : %s"
                       % ", ".join("{{%s}}" % c for c in sorted(JETONS_INCONNUS)))
    if "{{" in doc:
        alertes.append("des accolades {{ subsistent dans le document produit")
    if MARQUE_DEBUT in doc or MARQUE_FIN in doc:
        alertes.append("des marques d'encadré subsistent dans le document produit")
    if gabarits["encadre"] is None and encadres_vus:
        alertes.append("le document contient des mises en avant, mais le modèle "
                       "n'a plus de gabarit d'encadré : elles restent en "
                       "paragraphes simples")

    shutil.copyfile(chemin, chemin + ".avant-finition")
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        for nom, donnees in pieces.items():
            z.writestr(nom, donnees)

    print("section : %s | jetons : %d en-tête(s), %d corps | rangs répétés : %d "
          "| numérotations recopiées : %d | préférences Zotero : %d tranche(s) "
          "| styles remappés : %d | entités redressées : %d | encadrés : %d "
          "| bibliographie : %s"
          % (", ".join(resume) or "—", jetons_entetes, jetons_corps, rangs,
             numeros, tranches, remappes, entites, encadres,
             "posée" if biblio else "—"))
    for a in alertes:
        print("ATTENTION : %s" % a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
