"""Local Workerd HTTP / standard CookieJar transport check; no real OIDC login."""

from __future__ import annotations

import http.client
import http.cookiejar
import json
import os
import signal
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_ID = "7wqbzelu2ey5n5brfr73d"
LOGIN = "https://login.loom-labs.ai"
WWW = "https://www.loom-labs.ai"
CHECKOUT = "https://checkout.loom-labs.ai"
COOKIE = f"__Secure-loom_session_{APP_ID}"
TEST_KEY = str(uuid.uuid4())  # Fixture key only, never a production credential.
processes: list[subprocess.Popen[bytes]] = []
checks: list[str] = []


def command(args: list[str], app: str, **kwargs):
    return subprocess.run(args, cwd=ROOT / f"apps/{app}", check=True, capture_output=True, **kwargs)


def fixture_cookies() -> dict[str, str]:
    result = subprocess.run(
        ["node", "scripts/create-session-fixture.mjs"],
        text=True,
        cwd=ROOT / "packages/identity-core",
        check=True,
        capture_output=True,
        env={**os.environ, "SHARED_SESSION_TEST_KEY": TEST_KEY},
    )
    return json.loads(result.stdout)


def jar_with(value: str) -> http.cookiejar.CookieJar:
    jar = http.cookiejar.CookieJar()
    jar.set_cookie(
        http.cookiejar.Cookie(
            version=0,
            name=COOKIE,
            value=value,
            port=None,
            port_specified=False,
            domain=".loom-labs.ai",
            domain_specified=True,
            domain_initial_dot=True,
            path="/",
            path_specified=True,
            secure=True,
            expires=None,
            discard=True,
            comment=None,
            comment_url=None,
            rest={"HttpOnly": None, "SameSite": "Lax"},
            rfc2109=False,
        )
    )
    return jar


def request_http(url: str, jar: http.cookiejar.CookieJar, *, method="GET", origin=None):
    parsed = urllib.parse.urlsplit(url)
    request = urllib.request.Request(url, method=method)
    jar.add_cookie_header(request)
    headers = dict(request.header_items())
    headers["Host"] = parsed.hostname
    if origin:
        headers["Origin"] = origin
    port = 3100 if parsed.hostname == "www.loom-labs.ai" else 3101
    connection = http.client.HTTPConnection("localhost", port, timeout=10)
    connection.request(method, urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, "")), headers=headers)
    response = connection.getresponse()
    jar.extract_cookies(response, request)
    result = (response.status, {key.lower(): value for key, value in response.getheaders()}, response.read())
    connection.close()
    return result


def start(app: str, port: int, host: str, state: Path, log):
    app_url = WWW if app == "web" else CHECKOUT
    args = [
        "pnpm",
        "exec",
        "wrangler",
        "dev",
        "--env",
        "preview",
        "--local",
        "--port",
        str(port),
        "--host",
        host,
        "--inspector-port",
        str(port + 10000),
        "--upstream-protocol",
        "https",
        "--persist-to",
        str(state),
        "--var",
        f"APP_URL:{app_url}",
        "--var",
        f"LOGIN_URL:{LOGIN}",
        "--var",
        f"AUTH_SUCCESS_URL:{WWW}/",
        "--var",
        "LOGTO_COOKIE_DOMAIN:.loom-labs.ai",
        "--var",
        f"LOGTO_COOKIE_SECRET:{TEST_KEY}",
        "--var",
        "LOGTO_APP_SECRET:local-only-fixture-client-secret",
    ]
    processes.append(subprocess.Popen(args, cwd=ROOT / f"apps/{app}", stdout=log, stderr=log, start_new_session=True))


def main():
    with tempfile.TemporaryDirectory(prefix="loom-domain-http-") as directory:
        state = Path(directory) / "state"
        command(
            [
                "pnpm",
                "exec",
                "wrangler",
                "d1",
                "migrations",
                "apply",
                "hotkey-tools-identity",
                "--local",
                "--env",
                "preview",
                "--persist-to",
                str(state),
            ],
            "identity",
        )
        with open(Path(directory) / "workers.log", "wb") as log:
            start("identity", 3101, "login.loom-labs.ai", state, log)
            start("web", 3100, "www.loom-labs.ai", state, log)
            for _ in range(100):
                try:
                    if (
                        request_http(WWW + "/api/health", http.cookiejar.CookieJar())[0] == 200
                        and request_http(LOGIN + "/api/health", http.cookiejar.CookieJar())[0] == 200
                    ):
                        break
                except OSError:
                    pass
                time.sleep(0.2)
            else:
                raise AssertionError("Local Workerd servers did not become healthy")
            fixtures = fixture_cookies()
            jar = jar_with(fixtures["valid"])
            for product in [WWW, CHECKOUT]:
                status, headers, body = request_http(product + "/api/me", jar)
                assert status == 200 and json.loads(body)["data"]["user"]["id"] == "local-cookie-domain-fixture", (
                    "Shared encrypted fixture session must reach both products"
                )
                assert headers.get("x-robots-tag") == "noindex, nofollow, noarchive"
                checks.append("shared_session_" + urllib.parse.urlsplit(product).hostname)
                assert request_http(product + "/api/premium", jar)[0] == 403, (
                    "A shared login must not imply paid access"
                )
            target = "https://future.loom-labs.ai/workspace?source=sso-check&tag=a%2Bb&tag=2"
            status, headers, _ = request_http(LOGIN + "/?" + urllib.parse.urlencode({"returnTo": target}), jar)
            assert status in [303, 307] and headers.get("location") == target, (
                "Valid session must return immediately with path/query preserved"
            )
            checks.append("central_existing_session_skips_oidc")
            for product in [WWW, CHECKOUT]:
                assert request_http(product + "/api/premium", jar_with(fixtures["expired"]))[0] == 401
            checks.append("expired_shared_session_denied_on_both_products")
            wrong = jar_with(("A" if fixtures["valid"][0] != "A" else "B") + fixtures["valid"][1:])
            assert json.loads(request_http(WWW + "/api/me", wrong)[2])["data"]["user"] is None
            checks.append("tampered_cookie_denied")
            for url, expected in [
                ("https://future.loom-labs.ai/", True),
                ("https://loom-labs.ai.evil.example/", False),
                ("http://www.loom-labs.ai/", False),
            ]:
                request = urllib.request.Request(url)
                jar.add_cookie_header(request)
                assert request.has_header("Cookie") == expected, "Standard CookieJar must enforce Domain and Secure"
            checks.append("standard_cookiejar_domain_and_secure_scope")
            anonymous = http.cookiejar.CookieJar()
            status, headers, _ = request_http(
                LOGIN
                + "/api/auth/login?"
                + urllib.parse.urlencode({"provider": "github", "returnTo": WWW + "/workspace?source=sso-check"}),
                anonymous,
            )
            assert status == 303 and urllib.parse.urlsplit(headers["location"]).hostname == "auth.loom-labs.ai"
            cookie = next(cookie for cookie in anonymous if cookie.name == COOKIE)
            assert (
                cookie.domain == ".loom-labs.ai"
                and cookie.secure
                and cookie.path == "/"
                and cookie.has_nonstandard_attr("HttpOnly")
            )
            checks.append("actual_workerd_signin_sets_shared_cookie")
            # A fixture token cannot complete real provider logout. Clearing the local
            # Domain cookie must still happen in the adapter's failure path.
            request_http(WWW + "/api/auth/logout", jar, method="POST", origin=WWW)
            assert all(cookie.name != COOKIE for cookie in jar), "Logout must expire the exact parent-domain cookie"
            for product in [WWW, CHECKOUT]:
                assert json.loads(request_http(product + "/api/me", jar)[2])["data"]["user"] is None
            checks.append("shared_logout_removes_session_for_both_products")
            result = {
                "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "runtime": "real local Workerd HTTP",
                "cookieJar": "Python standard http.cookiejar",
                "sessionFixture": "official CookieStorage encrypted with generated local-only key",
                "realOidcLogin": False,
                "remoteMutations": False,
                "checks": checks,
            }
            evidence = ROOT / ".codex-artifacts/web/shared-domain-local.json"
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text(json.dumps(result, indent=2) + "\n")
            print(
                json.dumps(
                    {"localSharedDomainChecksPassed": len(checks), "realOidcLogin": False, "remoteMutations": False}
                )
            )


if __name__ == "__main__":
    try:
        main()
    finally:
        for process in processes:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
            except (ProcessLookupError, PermissionError, subprocess.TimeoutExpired):
                if process.poll() is None:
                    process.kill()
