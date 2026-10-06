# -*- coding: utf-8 -*-
"""
Stockage des fichiers persistants (logos clients) via Vercel Blob.

Vercel n'offre pas de disque persistant aux fonctions serverless : tout
fichier qui doit survivre entre deux requêtes (un logo réutilisé d'un
rapport à l'autre, par exemple) doit être stocké à part, ici via Vercel
Blob. En développement local (pas de jeton BLOB_READ_WRITE_TOKEN défini),
on écrit simplement sur le disque local du conteneur, pour pouvoir tester
sans compte Vercel — ce mode n'est PAS persistant en production.

Important : l'API REST exacte de Vercel Blob peut évoluer. Si l'upload
échoue après déploiement, vérifiez la documentation à jour sur
https://vercel.com/docs/storage/vercel-blob et ajustez `upload_bytes`
en conséquence (ou utilisez le SDK officiel côté Node si vous préférez
déporter uniquement cette fonction dans une petite route Node).
"""
import os
import uuid
import requests

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN")
LOCAL_BLOB_DIR = os.environ.get("LOCAL_BLOB_DIR", "/tmp/rapport_pro_blobs")
BLOB_API_BASE = "https://blob.vercel-storage.com"


def upload_bytes(data: bytes, filename_hint: str, content_type: str = "application/octet-stream") -> str:
    """Stocke les bytes donnés et renvoie une URL utilisable pour les
    relire ensuite (servie par Vercel Blob en production, ou par la route
    /local-blob/<key> de l'API Flask en développement local)."""
    ext = os.path.splitext(filename_hint or "")[1] or ""
    key = f"{uuid.uuid4().hex}{ext}"

    if BLOB_TOKEN:
        resp = requests.put(
            f"{BLOB_API_BASE}/{key}",
            data=data,
            headers={
                "authorization": f"Bearer {BLOB_TOKEN}",
                "x-content-type": content_type,
                "x-add-random-suffix": "0",
            },
            timeout=30,
        )
        resp.raise_for_status()
        try:
            return resp.json().get("url") or f"{BLOB_API_BASE}/{key}"
        except ValueError:
            return f"{BLOB_API_BASE}/{key}"
    else:
        os.makedirs(LOCAL_BLOB_DIR, exist_ok=True)
        with open(os.path.join(LOCAL_BLOB_DIR, key), "wb") as f:
            f.write(data)
        return f"/local-blob/{key}"


def read_local_blob(key: str):
    """Utilisé uniquement par la route Flask de secours en mode développement
    local, pour resservir un fichier écrit par upload_bytes() ci-dessus."""
    path = os.path.join(LOCAL_BLOB_DIR, key)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()
