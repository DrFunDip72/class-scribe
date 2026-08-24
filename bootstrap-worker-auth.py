"""Create the local, least-privileged worker login.

Run once, then create the returned bcrypt user record through the documented
Supabase SQL step. The generated password is never printed.
"""

from __future__ import annotations

import secrets
import json
import uuid
from pathlib import Path

import bcrypt

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / ".env.worker.local"
URL = "https://wmsotywnkqdajhmiultx.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_PrMevh9mKkLYGcMeK78MRA_5LZcRiy4"
EMAIL = "class-scribe-worker-wmsotywnkqdajhmiultx@example.com"


def main() -> None:
    if OUTPUT.exists():
        print(".env.worker.local already exists; leaving it unchanged.")
        return
    password = secrets.token_urlsafe(36)
    user_id = str(uuid.uuid4())
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()
    OUTPUT.write_text(
        "\n".join([
            f"SUPABASE_URL={URL}",
            f"SUPABASE_PUBLISHABLE_KEY={PUBLISHABLE_KEY}",
            f"WORKER_EMAIL={EMAIL}",
            f"WORKER_PASSWORD={password}",
            "WORKER_ID=class-scribe-home",
            "WHISPER_MODEL=small",
            "OLLAMA_MODEL=qwen3:4b",
            "OLLAMA_URL=http://127.0.0.1:11434",
            "POLL_SECONDS=8",
            "",
        ]),
        encoding="utf-8",
    )
    bootstrap = {
        "user_id": user_id,
        "email": EMAIL,
        "encrypted_password": password_hash,
    }
    (ROOT / ".worker-auth-bootstrap.json").write_text(
        json.dumps(bootstrap),
        encoding="utf-8",
    )
    print(json.dumps(bootstrap))
    print(f"Prepared dedicated worker login: {EMAIL}")
    print("Saved its random password to the ignored .env.worker.local file.")


if __name__ == "__main__":
    main()
