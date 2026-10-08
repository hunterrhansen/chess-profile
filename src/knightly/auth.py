"""Who is asking: a Clerk session token, or, on your own Mac, the one local user.

`KNIGHTLY_AUTH` picks: "clerk" (the default once CLERK_PUBLISHABLE_KEY is set) or "local".
A server (KNIGHTLY_MODE=server) won't fall back to "local" by itself, so it can never end up
serving one person's data to everyone; KNIGHTLY_AUTH=local says so on purpose (local Docker).

Clerk tokens are checked here, with no call to Clerk per request: the signature against
Clerk's public keys (fetched once from the instance's JWKS URL, or given as CLERK_JWT_KEY),
the expiry, the issuer (the instance's Frontend API, read from the publishable key) and, if
KNIGHTLY_ALLOWED_ORIGINS is set, which site the token was made for (`azp`).
"""
import base64
import hashlib
import hmac
import json
import os
import time

import jwt

from . import config


class Unauthorized(Exception):
    pass


def frontend_api(publishable_key: str) -> str:
    """pk_test_Y2xldmVyLmNsZXJrLmFjY291bnRzLmRldiQ -> https://clever.clerk.accounts.dev"""
    try:
        encoded = publishable_key.split("_", 2)[2]
        host = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
    except (IndexError, ValueError) as e:
        raise SystemExit("CLERK_PUBLISHABLE_KEY doesn't look like a Clerk publishable key.") from e
    return f"https://{host}"


class Clerk:
    def __init__(self, issuer: str, jwt_key: str | None = None, origins: list[str] | None = None):
        self.issuer, self.origins = issuer, origins
        self.key = jwt_key
        self.jwks = None if jwt_key else jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True)

    def user(self, token: str) -> str:
        """The Clerk user id a session token is for; Unauthorized if it isn't valid."""
        try:
            key = self.key or self.jwks.get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=["RS256"], issuer=self.issuer, leeway=5,
                                options={"require": ["exp", "iat", "sub"]})
        except jwt.PyJWTError as e:
            raise Unauthorized(str(e)) from None
        if self.origins and claims.get("azp") not in self.origins:
            raise Unauthorized("token made for another site")
        return claims["sub"]


def from_env() -> Clerk | None:
    """The Clerk checker, or None for the local user."""
    explicit = os.environ.get("KNIGHTLY_AUTH")
    publishable = os.environ.get("CLERK_PUBLISHABLE_KEY")
    mode = explicit or ("clerk" if publishable else "local")
    if mode == "local":
        if config.mode() == "server" and not explicit:
            raise SystemExit("A server signs people in with Clerk: set CLERK_PUBLISHABLE_KEY "
                             "(or KNIGHTLY_AUTH=local to serve one local user, e.g. in local Docker).")
        return None
    if mode != "clerk":
        raise SystemExit(f"KNIGHTLY_AUTH must be clerk or local, not {mode!r}.")
    if not publishable:
        raise SystemExit("KNIGHTLY_AUTH=clerk needs CLERK_PUBLISHABLE_KEY.")
    origins = [o.strip() for o in os.environ.get("KNIGHTLY_ALLOWED_ORIGINS", "").split(",") if o.strip()]
    return Clerk(frontend_api(publishable), os.environ.get("CLERK_JWT_KEY"), origins or None)


def webhook(secret: str, headers, body: bytes, now: float | None = None) -> dict:
    """A Clerk webhook's event, once its Svix signature checks out (Unauthorized if not):
    HMAC-SHA256 over "<id>.<timestamp>.<body>" with the endpoint's whsec_ secret, sent at
    most five minutes ago."""
    try:
        msg_id, stamp, signatures = headers["svix-id"], headers["svix-timestamp"], headers["svix-signature"]
        if abs((now or time.time()) - int(stamp)) > 300:
            raise Unauthorized("webhook too old or from the future")
        key = base64.b64decode(secret.removeprefix("whsec_"))
    except (KeyError, ValueError) as e:
        raise Unauthorized(f"not a signed webhook: {e}") from None
    expected = base64.b64encode(hmac.new(key, f"{msg_id}.{stamp}.".encode() + body, hashlib.sha256).digest()).decode()
    sent = [s.split(",", 1)[1] for s in signatures.split() if s.startswith("v1,")]
    if not any(hmac.compare_digest(expected, s) for s in sent):
        raise Unauthorized("webhook signature doesn't match")
    return json.loads(body)
