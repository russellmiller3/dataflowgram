PRAGMA application_id = 1128353875; -- 0x43415053 'CAPS'

CREATE TABLE app_meta (
    key         TEXT PRIMARY KEY,
    value       TEXT
) STRICT, WITHOUT ROWID;

INSERT INTO app_meta (key, value) VALUES
    ('schema_version',  '9'),
    ('app_name',        'My App'),
    ('app_version',     '1.0.0'),
    ('ui_version',      '1'),
    ('created_at',      datetime('now')),
    ('updated_at',      datetime('now'));

CREATE TABLE app_permissions (
    permission  TEXT PRIMARY KEY,
    reason      TEXT
) STRICT, WITHOUT ROWID;

CREATE TABLE app_ui (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    version         INTEGER NOT NULL DEFAULT 1,
    html            TEXT NOT NULL,
    source_bundle   TEXT,
    source_framework TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    is_active       INTEGER DEFAULT 1
) STRICT;

-- At most one UI may be active; injectUi deactivates before inserting.
CREATE UNIQUE INDEX idx_app_ui_single_active ON app_ui(is_active) WHERE is_active = 1;

-- _id is both the document identity and the row identity (see schema.rs). The key
-- is composite because _id is unique per COLLECTION, not globally. There are no
-- created_at/updated_at columns: _created_at/_updated_at inside data_json are the
-- only timestamps, and the only ones the merge engine reads.
CREATE TABLE doc_records (
    collection      TEXT NOT NULL,
    _id             TEXT NOT NULL,
    data_json       TEXT NOT NULL,
    PRIMARY KEY (collection, _id)
) STRICT;

CREATE TABLE doc_storage (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
) STRICT;

-- filename is UNIQUE: these rows are addressed by path, which is also the URL a
-- file is served at. The INTEGER id is internal.
CREATE TABLE app_assets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT NOT NULL UNIQUE,
    mime_type   TEXT NOT NULL,
    data        BLOB NOT NULL,
    size_bytes  INTEGER,
    hash_sha256 TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
) STRICT;

-- Metadata and payload are separate tables so listing assets never pages through
-- blob prefixes. doc_asset_blobs deliberately keeps its rowid: the desktop host
-- reads byte ranges out of it with SQLite's incremental blob I/O, which addresses
-- rows by rowid and cannot work on a WITHOUT ROWID table.
CREATE TABLE doc_assets (
    id           TEXT PRIMARY KEY,
    display_name TEXT,
    belongs_to   TEXT,
    mime_type    TEXT NOT NULL,
    size_bytes   INTEGER,
    hash_sha256  TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_doc_assets_belongs_to ON doc_assets(belongs_to);

CREATE TABLE doc_asset_blobs (
    id      TEXT PRIMARY KEY,
    data    BLOB NOT NULL
) STRICT;
