#!/usr/bin/env python3
import argparse
import glob
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def discover_extension_path() -> str:
    try:
        import sqlite_vec  # type: ignore
    except Exception:
        return ""

    # Preferred API if present.
    loadable_fn = getattr(sqlite_vec, "loadable_path", None)
    if callable(loadable_fn):
        try:
            path = str(loadable_fn() or "").strip()
            if path and os.path.exists(path):
                return path
        except Exception:
            pass

    module_file = Path(getattr(sqlite_vec, "__file__", "")).resolve()
    if not module_file.exists():
        return ""
    base = module_file.parent
    patterns = ["*vec*.so", "*vec*.dylib", "*vec*.dll", "*.so", "*.dylib", "*.dll"]
    for pat in patterns:
        for candidate in glob.glob(str(base / pat)):
            if os.path.isfile(candidate):
                return candidate
    return ""


def test_load(path: str):
    if not path:
        return False, "extension path is empty"
    conn = sqlite3.connect(":memory:")
    try:
        conn.enable_load_extension(True)
        conn.load_extension(path)
        return True, ""
    except Exception as err:
        return False, str(err)
    finally:
        try:
            conn.enable_load_extension(False)
        except Exception:
            pass
        conn.close()


def set_env_sqlite_vec(env_path: str, extension_path: str):
    p = Path(env_path)
    text = p.read_text(encoding="utf-8") if p.exists() else ""
    lines = text.splitlines()
    replaced = False
    out = []
    for line in lines:
        if line.startswith("SQLITE_VEC_EXTENSION="):
            out.append(f"SQLITE_VEC_EXTENSION={extension_path}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"SQLITE_VEC_EXTENSION={extension_path}")
    p.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true", help="Attempt pip install sqlite-vec first")
    parser.add_argument("--write-env", action="store_true", help="Write SQLITE_VEC_EXTENSION to .env")
    parser.add_argument("--env-path", default=".env")
    parser.add_argument("--extension-path", default="")
    args = parser.parse_args()

    install_error = ""
    if args.install:
        res = run([sys.executable, "-m", "pip", "install", "sqlite-vec"])
        if res.returncode != 0:
            install_error = (res.stderr or res.stdout or "").strip()

    extension_path = args.extension_path.strip() or discover_extension_path()
    ok, load_error = test_load(extension_path)

    if ok and args.write_env:
        set_env_sqlite_vec(args.env_path, extension_path)

    out = {
        "ok": ok,
        "sqlite_version": sqlite3.sqlite_version,
        "extension_path": extension_path,
        "loaded": ok,
        "load_error": load_error,
        "install_error": install_error,
    }
    sys.stdout.write(json.dumps(out))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
