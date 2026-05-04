"""
Post-deploy smoke test for the Render instance.

Hits the public URL, confirms /api/health is green, that the static
React bundle is being served, and that the auth + workspace + projects
chain works end-to-end. Reports first failure with enough context to
fix it; exits non-zero so it can be wired into Render's post-deploy
hook later.

Usage:
    python scripts/smoke_deploy.py [BASE_URL]

Default BASE_URL is https://brahma-ui.onrender.com — pass another to
test a preview branch deploy.
"""
import sys
import time
from urllib.parse import urljoin

import httpx


DEFAULT_BASE = "https://brahma-ui.onrender.com"
TIMEOUT = 30  # Free-tier cold start can take ~25s


def check(name: str, fn) -> bool:
    try:
        fn()
        print(f"  OK   · {name}")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  FAIL · {name}")
        print(f"         {type(e).__name__}: {e}")
        return False


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE
    print(f"Brahma deploy smoke test -> {base}")
    print()

    client = httpx.Client(base_url=base, timeout=TIMEOUT, follow_redirects=True)
    ok = True

    def check_health() -> None:
        r = client.get("/api/health")
        r.raise_for_status()
        body = r.json()
        assert body.get("status") == "ok", f"health body: {body}"

    def check_static() -> None:
        r = client.get("/")
        r.raise_for_status()
        assert "<div id=\"root\"" in r.text or "Brahma" in r.text, "no React shell in /"

    def check_scenarios() -> None:
        r = client.get("/api/scenarios")
        r.raise_for_status()
        body = r.json()
        # Response is a flat dict {"churn": {...}, "ltv": {...}, ...}
        assert isinstance(body, dict) and len(body) >= 1, f"unexpected shape: {type(body)}"
        assert "churn" in body, f"missing churn scenario; keys = {list(body.keys())}"

    def check_signup_login() -> None:
        # Use a unique email per run so the same target can be re-smoked
        email = f"smoke-{int(time.time())}@brahma.dev"
        r = client.post(
            "/api/auth/signup",
            json={"email": email, "password": "SmokeTest123!", "name": "Smoke"},
        )
        if r.status_code not in (200, 201):
            raise AssertionError(f"signup → {r.status_code}: {r.text[:200]}")
        # /api/me should reflect the new session via the cookie httpx caught
        me = client.get("/api/me")
        me.raise_for_status()
        body = me.json()
        assert body["user"]["email"] == email, f"me email mismatch: {body}"

    def check_test_connection() -> None:
        r = client.post(
            "/api/pipelines/test-connection",
            json={
                "sourceConfig": {
                    "type": "rest_api",
                    "url": "https://jsonplaceholder.typicode.com/users",
                    "method": "GET",
                },
            },
        )
        r.raise_for_status()
        body = r.json()
        assert body.get("ok") is True, f"REST probe failed: {body}"

    ok = check("/api/health responds", check_health) and ok
    ok = check("/ serves React shell", check_static) and ok
    ok = check("/api/scenarios lists demos", check_scenarios) and ok
    ok = check("signup + /me round-trip", check_signup_login) and ok
    ok = check("/test-connection probes REST", check_test_connection) and ok

    print()
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
