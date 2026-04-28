"""
Brahma backend package.

Loads .env at import time so every submodule sees JWT_SECRET, GOOGLE_CLIENT_ID,
and other secrets without each one having to re-call dotenv.
"""

from pathlib import Path

from dotenv import load_dotenv

# override=True so values in .env beat any pre-existing (often blank) shell vars.
# In production (Render) there's no .env file — env vars come straight from the platform.
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
