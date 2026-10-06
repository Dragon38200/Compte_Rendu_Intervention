# -*- coding: utf-8 -*-
"""Authentification : hachage de mot de passe + jetons de session (JWT)."""
import os
import time
import jwt
from werkzeug.security import generate_password_hash, check_password_hash

# IMPORTANT : en production, définissez JWT_SECRET dans les variables
# d'environnement Vercel (Project Settings -> Environment Variables) avec
# une valeur longue et aléatoire. La valeur ci-dessous n'est qu'un repli
# pour le développement local.
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me-in-vercel-env")
JWT_ALGO = "HS256"
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 jours


def hash_password(password):
    return generate_password_hash(password)


def verify_password(password, password_hash):
    return check_password_hash(password_hash, password)


def create_token(user_id, email):
    now = int(time.time())
    # PyJWT >= 2.10 exige que "sub" soit une chaîne (RFC 7519) : l'id
    # numérique est donc sérialisé en texte ici, puis reconverti en entier
    # à la lecture (decode_token) pour rester utilisable tel quel dans les
    # requêtes SQL (user_id = %s).
    payload = {"sub": str(user_id), "email": email, "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token):
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        data["sub"] = int(data["sub"])
        return data
    except Exception:
        return None
