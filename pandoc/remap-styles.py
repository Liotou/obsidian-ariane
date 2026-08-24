#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ariane — post-traitement des styles d'un .docx produit par pandoc.

Usages :
  remap-styles.py --list  MODELE.docx          -> imprime (JSON) les noms de styles du modèle
  remap-styles.py --remap DOCX.docx  MAPPING    -> remappe les styles pandoc vers ceux du modèle
      MAPPING = JSON {"Heading1":"Titre 1", "BodyText":"Corps de texte", ...}
      (les valeurs sont des NOMS de style ou des styleId présents dans le document)
"""
import sys, re, json, io, zipfile


def styles_du_docx(chemin):
    """Retourne (name2id, liste_noms) à partir de word/styles.xml."""
    with zipfile.ZipFile(chemin) as z:
        xml = z.read('word/styles.xml').decode('utf-8')
    name2id, noms = {}, []
    for m in re.finditer(r'<w:style\b[^>]*?w:styleId="([^"]+)"[^>]*?>(.*?)</w:style>', xml, re.S):
        sid, corps = m.group(1), m.group(2)
        nm = re.search(r'<w:name\s+w:val="([^"]*)"', corps)
        if nm:
            noms.append(nm.group(1))
            name2id[nm.group(1).strip().lower()] = sid
        name2id.setdefault(sid.lower(), sid)
    return name2id, sorted(set(noms))


def cmd_list(modele):
    _, noms = styles_du_docx(modele)
    print(json.dumps(noms, ensure_ascii=False))


def cmd_remap(docx, mapping_json):
    mapping = json.loads(mapping_json)
    name2id, _ = styles_du_docx(docx)
    resolu = {}
    for pandoc_id, cible in mapping.items():
        cible = str(cible or '').strip()
        if not cible:
            continue
        tid = name2id.get(cible.lower())
        if tid:
            resolu[pandoc_id] = tid
    if not resolu:
        print(json.dumps({'change': 0}))
        return
    with zipfile.ZipFile(docx) as zin:
        noms = zin.namelist()
        contenu = {n: zin.read(n) for n in noms}
    doc = contenu['word/document.xml'].decode('utf-8')
    doc = re.sub(r'w:pStyle w:val="([^"]+)"',
                 lambda mm: 'w:pStyle w:val="%s"' % resolu.get(mm.group(1), mm.group(1)),
                 doc)
    contenu['word/document.xml'] = doc.encode('utf-8')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
        for n in noms:
            zout.writestr(n, contenu[n])
    with open(docx, 'wb') as f:
        f.write(buf.getvalue())
    print(json.dumps({'change': len(resolu), 'resolu': resolu}, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--list':
        cmd_list(sys.argv[2])
    elif len(sys.argv) >= 4 and sys.argv[1] == '--remap':
        cmd_remap(sys.argv[2], sys.argv[3])
    else:
        sys.stderr.write(__doc__)
        sys.exit(2)
