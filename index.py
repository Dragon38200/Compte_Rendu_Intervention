# -*- coding: utf-8 -*-
"""
API Flask de Rapport Pro Web.

Toutes les routes /api/* du site sont servies par cette unique fonction
serverless (voir vercel.json), Flask se chargeant lui-même du routage
interne. Le frontend statique (public/) appelle ces routes en fetch().
"""
import os
import sys
import json

from flask import Flask, request, jsonify, g, send_file, Response
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _lib import db, auth, blob, docx_builder  # noqa: E402

app = Flask(__name__)

IS_PROD = bool(os.environ.get("VERCEL"))


# ------------------------------------------------------------------ #
# Authentification
# ------------------------------------------------------------------ #
def _set_auth_cookie(resp, token):
    resp.set_cookie(
        "token", token,
        httponly=True,
        secure=IS_PROD,
        samesite="Lax",
        max_age=auth.TOKEN_TTL_SECONDS,
        path="/",
    )


def _current_user_id():
    token = request.cookies.get("token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    if not token:
        return None
    data = auth.decode_token(token)
    return data["sub"] if data else None


def login_required(f):
    from functools import wraps

    @wraps(f)
    def wrapper(*args, **kwargs):
        user_id = _current_user_id()
        if not user_id:
            return jsonify({"error": "Non authentifié"}), 401
        g.user_id = user_id
        return f(*args, **kwargs)
    return wrapper


@app.post("/api/auth/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or "@" not in email or len(password) < 6:
        return jsonify({"error": "Email invalide ou mot de passe trop court (6 caractères minimum)."}), 400

    existing = db.fetchone("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        return jsonify({"error": "Un compte existe déjà avec cet email."}), 409

    user_id = db.insert_returning_id(
        "INSERT INTO users (email, password_hash) VALUES (%s, %s)",
        (email, auth.hash_password(password)),
    )
    token = auth.create_token(user_id, email)
    resp = jsonify({"id": user_id, "email": email})
    _set_auth_cookie(resp, token)
    return resp


@app.post("/api/auth/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = db.fetchone("SELECT id, email, password_hash FROM users WHERE email = %s", (email,))
    if not user or not auth.verify_password(password, user["password_hash"]):
        return jsonify({"error": "Email ou mot de passe incorrect."}), 401

    token = auth.create_token(user["id"], user["email"])
    resp = jsonify({"id": user["id"], "email": user["email"]})
    _set_auth_cookie(resp, token)
    return resp


@app.post("/api/auth/logout")
def logout():
    resp = jsonify({"ok": True})
    resp.set_cookie("token", "", expires=0, path="/")
    return resp


@app.get("/api/auth/me")
@login_required
def me():
    user = db.fetchone("SELECT id, email FROM users WHERE id = %s", (g.user_id,))
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404
    return jsonify(user)


# ------------------------------------------------------------------ #
# Bibliothèque clients (client + sites rattachés)
# ------------------------------------------------------------------ #
@app.get("/api/clients")
@login_required
def list_clients():
    clients = db.fetchall("SELECT id, nom FROM clients WHERE user_id = %s ORDER BY nom", (g.user_id,))
    for c in clients:
        c["sites"] = db.fetchall(
            "SELECT id, site, adresse, contact FROM sites WHERE client_id = %s ORDER BY id", (c["id"],)
        )
    return jsonify(clients)


@app.post("/api/clients")
@login_required
def create_client():
    data = request.get_json(force=True, silent=True) or {}
    nom = (data.get("nom") or "").strip()
    if not nom:
        return jsonify({"error": "Le nom du client est obligatoire."}), 400

    client_id = db.insert_returning_id(
        "INSERT INTO clients (user_id, nom) VALUES (%s, %s)", (g.user_id, nom)
    )
    site = (data.get("site") or "").strip()
    adresse = (data.get("adresse") or "").strip()
    contact = (data.get("contact") or "").strip()
    if site or adresse or contact:
        db.insert_returning_id(
            "INSERT INTO sites (client_id, site, adresse, contact) VALUES (%s, %s, %s, %s)",
            (client_id, site, adresse, contact),
        )
    return jsonify({"id": client_id, "nom": nom}), 201


@app.put("/api/clients/<int:client_id>")
@login_required
def update_client(client_id):
    owner = db.fetchone("SELECT id FROM clients WHERE id = %s AND user_id = %s", (client_id, g.user_id))
    if not owner:
        return jsonify({"error": "Client introuvable."}), 404
    data = request.get_json(force=True, silent=True) or {}
    nom = (data.get("nom") or "").strip()
    if not nom:
        return jsonify({"error": "Le nom du client est obligatoire."}), 400
    db.execute("UPDATE clients SET nom = %s WHERE id = %s", (nom, client_id))
    return jsonify({"ok": True})


@app.put("/api/sites/<int:site_id>")
@login_required
def update_site(site_id):
    row = db.fetchone(
        "SELECT sites.id FROM sites JOIN clients ON clients.id = sites.client_id "
        "WHERE sites.id = %s AND clients.user_id = %s",
        (site_id, g.user_id),
    )
    if not row:
        return jsonify({"error": "Site introuvable."}), 404
    data = request.get_json(force=True, silent=True) or {}
    db.execute(
        "UPDATE sites SET site = %s, adresse = %s, contact = %s WHERE id = %s",
        ((data.get("site") or "").strip(), (data.get("adresse") or "").strip(),
         (data.get("contact") or "").strip(), site_id),
    )
    return jsonify({"ok": True})


@app.post("/api/clients/<int:client_id>/sites")
@login_required
def add_site(client_id):
    owner = db.fetchone("SELECT id FROM clients WHERE id = %s AND user_id = %s", (client_id, g.user_id))
    if not owner:
        return jsonify({"error": "Client introuvable."}), 404
    data = request.get_json(force=True, silent=True) or {}
    site_id = db.insert_returning_id(
        "INSERT INTO sites (client_id, site, adresse, contact) VALUES (%s, %s, %s, %s)",
        (client_id, (data.get("site") or "").strip(), (data.get("adresse") or "").strip(),
         (data.get("contact") or "").strip()),
    )
    return jsonify({"id": site_id}), 201


@app.delete("/api/clients/<int:client_id>")
@login_required
def delete_client(client_id):
    owner = db.fetchone("SELECT id FROM clients WHERE id = %s AND user_id = %s", (client_id, g.user_id))
    if not owner:
        return jsonify({"error": "Client introuvable."}), 404
    db.execute("DELETE FROM sites WHERE client_id = %s", (client_id,))
    db.execute("DELETE FROM clients WHERE id = %s", (client_id,))
    return jsonify({"ok": True})


@app.delete("/api/sites/<int:site_id>")
@login_required
def delete_site(site_id):
    row = db.fetchone(
        "SELECT sites.id FROM sites JOIN clients ON clients.id = sites.client_id "
        "WHERE sites.id = %s AND clients.user_id = %s",
        (site_id, g.user_id),
    )
    if not row:
        return jsonify({"error": "Site introuvable."}), 404
    db.execute("DELETE FROM sites WHERE id = %s", (site_id,))
    return jsonify({"ok": True})


# ------------------------------------------------------------------ #
# Bibliothèque techniciens
# ------------------------------------------------------------------ #
@app.get("/api/techniciens")
@login_required
def list_techniciens():
    return jsonify(db.fetchall(
        "SELECT id, nom FROM techniciens WHERE user_id = %s ORDER BY nom", (g.user_id,)
    ))


@app.post("/api/techniciens")
@login_required
def create_technicien():
    data = request.get_json(force=True, silent=True) or {}
    nom = (data.get("nom") or "").strip()
    if not nom:
        return jsonify({"error": "Le nom du technicien est obligatoire."}), 400
    tech_id = db.insert_returning_id(
        "INSERT INTO techniciens (user_id, nom) VALUES (%s, %s)", (g.user_id, nom)
    )
    return jsonify({"id": tech_id, "nom": nom}), 201


@app.put("/api/techniciens/<int:tech_id>")
@login_required
def update_technicien(tech_id):
    owner = db.fetchone("SELECT id FROM techniciens WHERE id = %s AND user_id = %s", (tech_id, g.user_id))
    if not owner:
        return jsonify({"error": "Technicien introuvable."}), 404
    data = request.get_json(force=True, silent=True) or {}
    nom = (data.get("nom") or "").strip()
    if not nom:
        return jsonify({"error": "Le nom du technicien est obligatoire."}), 400
    db.execute("UPDATE techniciens SET nom = %s WHERE id = %s", (nom, tech_id))
    return jsonify({"ok": True})


@app.delete("/api/techniciens/<int:tech_id>")
@login_required
def delete_technicien(tech_id):
    owner = db.fetchone("SELECT id FROM techniciens WHERE id = %s AND user_id = %s", (tech_id, g.user_id))
    if not owner:
        return jsonify({"error": "Technicien introuvable."}), 404
    db.execute("DELETE FROM techniciens WHERE id = %s", (tech_id,))
    return jsonify({"ok": True})


# ------------------------------------------------------------------ #
# Bibliothèque de logos clients (fichiers -> Vercel Blob)
# ------------------------------------------------------------------ #
@app.get("/api/logos")
@login_required
def list_logos():
    return jsonify(db.fetchall(
        "SELECT id, nom, url FROM logos WHERE user_id = %s ORDER BY nom", (g.user_id,)
    ))


@app.post("/api/logos")
@login_required
def upload_logo():
    nom = (request.form.get("nom") or "").strip()
    file = request.files.get("fichier")
    if not nom or not file:
        return jsonify({"error": "Nom et fichier requis."}), 400

    url = blob.upload_bytes(file.read(), file.filename, file.mimetype or "image/png")
    logo_id = db.insert_returning_id(
        "INSERT INTO logos (user_id, nom, url) VALUES (%s, %s, %s)", (g.user_id, nom, url)
    )
    return jsonify({"id": logo_id, "nom": nom, "url": url}), 201


@app.delete("/api/logos/<int:logo_id>")
@login_required
def delete_logo(logo_id):
    owner = db.fetchone("SELECT id FROM logos WHERE id = %s AND user_id = %s", (logo_id, g.user_id))
    if not owner:
        return jsonify({"error": "Logo introuvable."}), 404
    db.execute("DELETE FROM logos WHERE id = %s", (logo_id,))
    return jsonify({"ok": True})


@app.get("/local-blob/<key>")
def local_blob(key):
    """Secours UNIQUEMENT pour le développement local sans compte Vercel
    Blob : ressert un fichier écrit par blob.upload_bytes(). En production,
    les logos sont servis directement depuis l'URL Vercel Blob (CDN public),
    cette route n'est alors jamais utilisée."""
    data = blob.read_local_blob(key)
    if data is None:
        return jsonify({"error": "Introuvable"}), 404
    return send_file(io.BytesIO(data), mimetype="application/octet-stream")


# ------------------------------------------------------------------ #
# Génération du rapport
# ------------------------------------------------------------------ #
@app.post("/api/generate")
@login_required
def generate_report():
    """
    Reçoit un formulaire multipart avec :
      - champ "payload" : JSON (voir docx_builder.build_report_docx)
      - fichiers "photo_0", "photo_1", ... : les photos référencées par
        "photo_index" dans payload["content"]
      - fichier "logo" (optionnel) : logo client pour ce rapport précis
    Renvoie directement le .docx généré en téléchargement.
    """
    raw_payload = request.form.get("payload")
    if not raw_payload:
        return jsonify({"error": "payload manquant"}), 400
    try:
        payload = json.loads(raw_payload)
    except ValueError:
        return jsonify({"error": "payload JSON invalide"}), 400

    photos = []
    i = 0
    while True:
        f = request.files.get(f"photo_{i}")
        if f is None:
            break
        photos.append(f.read())
        i += 1

    logo_file = request.files.get("logo")
    logo_bytes = logo_file.read() if logo_file else None

    try:
        docx_bytes = docx_builder.build_report_docx(payload, photos, logo_bytes=logo_bytes)
    except Exception as e:
        return jsonify({"error": f"Échec de la génération du rapport : {e}"}), 500

    filename = (payload.get("filename") or "rapport").strip() or "rapport"
    if not filename.lower().endswith(".docx"):
        filename += ".docx"

    return Response(
        docx_bytes,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "db": "postgres" if db.IS_POSTGRES else "sqlite (dev)"})


# Point d'entrée WSGI utilisé par Vercel (runtime Python) et par un
# serveur de développement local (voir README_DEPLOIEMENT.md).
if __name__ == "__main__":
    app.run(debug=True, port=5000)
