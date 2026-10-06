-- Schéma PostgreSQL pour Rapport Pro Web.
-- À exécuter UNE SEULE FOIS sur votre base Vercel Postgres après l'avoir
-- créée et reliée au projet (onglet "Storage" -> votre base -> "Query",
-- ou via `psql` avec la chaîne de connexion fournie par Vercel).

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nom TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    site TEXT,
    adresse TEXT,
    contact TEXT
);

CREATE TABLE IF NOT EXISTS techniciens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nom TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logos (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_client ON sites(client_id);
CREATE INDEX IF NOT EXISTS idx_techniciens_user ON techniciens(user_id);
CREATE INDEX IF NOT EXISTS idx_logos_user ON logos(user_id);
