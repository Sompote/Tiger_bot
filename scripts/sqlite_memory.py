#!/usr/bin/env python3
import argparse
import json
import math
import os
import sqlite3
import sys
from typing import Any, Dict, List


def connect(db_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


def init_db(db_path: str, vec_ext_path: str) -> Dict[str, Any]:
    conn = connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              conversation_id TEXT NOT NULL UNIQUE,
              platform TEXT DEFAULT '',
              user_id TEXT DEFAULT '',
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              conversation_id TEXT NOT NULL,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS skills (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              provider TEXT DEFAULT '',
              enabled INTEGER DEFAULT 1,
              updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              conversation_id TEXT NOT NULL,
              source TEXT NOT NULL,
              content TEXT NOT NULL,
              embedding_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_conv_time ON memories(conversation_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_source_time ON memories(source, created_at)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
            """
        )

        vec_loaded = False
        vec_error = ""
        if vec_ext_path:
            try:
                conn.enable_load_extension(True)
                conn.load_extension(vec_ext_path)
                vec_loaded = True
            except Exception as err:  # pragma: no cover
                vec_loaded = False
                vec_error = str(err)
            finally:
                try:
                    conn.enable_load_extension(False)
                except Exception:
                    pass

        set_meta(conn, "sqlite_vec_extension_path", vec_ext_path or "")
        set_meta(conn, "sqlite_vec_loaded", "1" if vec_loaded else "0")
        set_meta(conn, "sqlite_vec_error", vec_error)
        conn.commit()
        return {"ok": True, "vec_loaded": vec_loaded, "vec_error": vec_error}
    finally:
        conn.close()


def stats(db_path: str) -> Dict[str, Any]:
    conn = connect(db_path)
    try:
        out = {}
        for table in ["memories", "conversations", "messages", "skills"]:
            row = conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()
            out[table] = int(row["c"] if row else 0)
        return {"ok": True, "counts": out}
    finally:
        conn.close()


def upsert_skill(db_path: str, name: str, provider: str, enabled: int, updated_at: int) -> Dict[str, Any]:
    conn = connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO skills(name, provider, enabled, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
              provider=excluded.provider,
              enabled=excluded.enabled,
              updated_at=excluded.updated_at
            """,
            (name, provider, int(enabled), int(updated_at)),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def parse_embedding(text: str) -> List[float]:
    try:
        data = json.loads(text or "[]")
        if not isinstance(data, list):
            return []
        out = []
        for v in data:
            try:
                out.append(float(v))
            except Exception:
                pass
        return out
    except Exception:
        return []


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return -1.0
    dot = 0.0
    aa = 0.0
    bb = 0.0
    for i in range(len(a)):
        av = float(a[i])
        bv = float(b[i])
        dot += av * bv
        aa += av * av
        bb += bv * bv
    if aa <= 0.0 or bb <= 0.0:
        return -1.0
    return dot / (math.sqrt(aa) * math.sqrt(bb))


def add_memory(
    db_path: str, conversation_id: str, source: str, content: str, embedding_json: str, created_at: int
) -> Dict[str, Any]:
    conn = connect(db_path)
    try:
        conn.execute(
            "INSERT INTO memories(conversation_id, source, content, embedding_json, created_at) VALUES(?, ?, ?, ?, ?)",
            (conversation_id, source, content, embedding_json or "[]", int(created_at)),
        )
        row_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        conn.commit()
        return {"ok": True, "id": row_id}
    finally:
        conn.close()


def search_memories(
    db_path: str,
    conversation_id: str,
    query_embedding_json: str,
    limit: int,
    min_score: float,
    window: int,
) -> Dict[str, Any]:
    conn = connect(db_path)
    try:
        q_emb = parse_embedding(query_embedding_json)
        if not q_emb:
            return {"ok": True, "rows": []}

        rows = conn.execute(
            """
            SELECT id, conversation_id, source, content, embedding_json, created_at
            FROM memories
            WHERE (conversation_id = ? OR conversation_id = 'global' OR source = 'self_reflection')
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (conversation_id, int(window)),
        ).fetchall()

        ranked = []
        for row in rows:
            emb = parse_embedding(row["embedding_json"])
            score = cosine_similarity(q_emb, emb)
            if score > float(min_score):
                ranked.append(
                    {
                        "id": row["id"],
                        "source": row["source"],
                        "content": row["content"],
                        "created_at": row["created_at"],
                        "score": score,
                    }
                )

        ranked.sort(key=lambda r: r["score"], reverse=True)
        return {"ok": True, "rows": ranked[: int(limit)]}
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init", "add", "search", "stats", "upsert-skill"])
    parser.add_argument("--db", required=True)
    parser.add_argument("--vec-ext", default="")
    parser.add_argument("--conversation-id", default="")
    parser.add_argument("--source", default="")
    parser.add_argument("--content", default="")
    parser.add_argument("--embedding-json", default="[]")
    parser.add_argument("--query-embedding-json", default="[]")
    parser.add_argument("--created-at", default="0")
    parser.add_argument("--limit", default="6")
    parser.add_argument("--min-score", default="0.1")
    parser.add_argument("--window", default="600")
    parser.add_argument("--name", default="")
    parser.add_argument("--provider", default="")
    parser.add_argument("--enabled", default="1")
    parser.add_argument("--updated-at", default="0")
    args = parser.parse_args()

    try:
        if args.command == "init":
            result = init_db(args.db, args.vec_ext)
        elif args.command == "add":
            result = add_memory(
                args.db,
                args.conversation_id,
                args.source,
                args.content,
                args.embedding_json,
                int(args.created_at or "0"),
            )
        elif args.command == "stats":
            result = stats(args.db)
        elif args.command == "upsert-skill":
            result = upsert_skill(
                args.db,
                args.name,
                args.provider or "tool",
                int(args.enabled or "1"),
                int(args.updated_at or "0"),
            )
        else:
            result = search_memories(
                args.db,
                args.conversation_id,
                args.query_embedding_json,
                int(args.limit or "6"),
                float(args.min_score or "0.1"),
                int(args.window or "600"),
            )
        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as err:
        sys.stdout.write(json.dumps({"ok": False, "error": str(err)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
