# -*- coding: utf-8 -*-
"""
Petite couche d'accès base de données.

En production sur Vercel : PostgreSQL (Vercel Postgres / Neon), piloté via
psycopg2, grâce à la variable d'environnement POSTGRES_URL (ou DATABASE_URL)
que Vercel fournit automatiquement une fois la base reliée au projet.

En développement local (aucune de ces variables définie) : repli automatique
sur un fichier SQLite, pour pouvoir tester toute la logique de l'application
sans dépendre d'une vraie base Postgres. Les requêtes sont écrites une seule
fois, au format Postgres (%s), et traduites à la volée pour SQLite (?).
"""
import os
import sqlite3

POSTGRES_DSN = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
IS_POSTGRES = bool(POSTGRES_DSN)
SQLITE_PATH = os.environ.get("SQLITE_PATH", "/tmp/rapport_pro_dev.db")

_sqlite_initialized = False


def _adapt(sql):
    return sql if IS_POSTGRES else sql.replace("%s", "?")


def get_conn():
    if IS_POSTGRES:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(POSTGRES_DSN, sslmode="require",
                                 cursor_factory=psycopg2.extras.RealDictCursor)
        return conn
    else:
        _ensure_sqlite_schema()
        conn = sqlite3.connect(SQLITE_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def fetchall(sql, params=()):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(_adapt(sql), params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def fetchone(sql, params=()):
    rows = fetchall(sql, params)
    return rows[0] if rows else None


def execute(sql, params=()):
    """Pour UPDATE/DELETE (ou INSERT sans besoin de l'id généré)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(_adapt(sql), params)
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def insert_returning_id(sql, params=()):
    """INSERT générique qui renvoie l'id auto-généré de la ligne créée,
    que l'on soit en Postgres (RETURNING id) ou en SQLite (lastrowid)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        if IS_POSTGRES:
            if "returning" not in sql.lower():
                sql = sql.rstrip().rstrip(";") + " RETURNING id"
            cur.execute(_adapt(sql), params)
            row = cur.fetchone()
            conn.commit()
            return row["id"] if row else None
        else:
            cur.execute(_adapt(sql), params)
            conn.commit()
            return cur.lastrowid
    finally:
        conn.close()


# ---------------------------------------------------------------------- #
# Schéma (voir aussi schema.sql, à exécuter une fois sur la vraie base
# Postgres lors du déploiement). En local (SQLite), on le crée nous-mêmes
# à la volée, uniquement pour le développement/les tests.
# ---------------------------------------------------------------------- #
_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    site TEXT,
    adresse TEXT,
    contact TEXT
);
CREATE TABLE IF NOT EXISTS techniciens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS logos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    url TEXT NOT NULL
);
"""


def _ensure_sqlite_schema():
    global _sqlite_initialized
    if _sqlite_initialized:
        return
    conn = sqlite3.connect(SQLITE_PATH)
    try:
        conn.executescript(_SQLITE_SCHEMA)
        conn.commit()
    finally:
        conn.close()
    _sqlite_initialized = True
