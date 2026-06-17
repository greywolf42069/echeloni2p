from __future__ import annotations

"""Stage 1 quota endpoints for the Echelon sync daemon.

This module keeps the subscription / quota logic small and explicit so the
browser can query it and the daemon can enforce it.
"""

import json
from urllib.parse import parse_qs, urlparse

from scripts.subscription_quota import QuotaStore
from scripts import auth as auth_mod
from scripts.rate_limiter import RateLimiter


_limiter = RateLimiter(rate=10.0, capacity=20)


def _quota_store() -> QuotaStore:
    return QuotaStore()


def _check_handler_auth(handler, path: str) -> bool:
    """Return True if request is allowed, False if a rejection was sent."""
    if not auth_mod.require_auth_enabled():
        return True
    expected = auth_mod.load_or_create_secret()
    submitted = handler.headers.get('X-Echelon-Auth') if hasattr(handler, 'headers') else None
    result = auth_mod.auth_status_for(path, submitted, expected, require_auth=True)
    if result is not None:
        status, message = result
        handler._send_json(status, {'error': message})
        return False
    return True


def handle_quota_get(handler) -> None:
    if not _check_handler_auth(handler, '/quota/get'):
        return
    client = handler.client_address[0]
    if not _limiter.allow(client):
        handler._send_json(429, {'error': 'rate limited'})
        return
    qs = parse_qs(urlparse(handler.path).query)
    wallet = (qs.get('wallet') or [''])[0].strip()
    if not wallet:
        handler._send_json(400, {'error': 'missing wallet'})
        return
    store = _quota_store()
    ent = store.ensure(wallet)
    handler._send_json(200, {'entitlement': ent.to_dict(), 'quotas': ent.quotas()})


def handle_quota_increment(handler) -> None:
    if not _check_handler_auth(handler, '/quota/increment'):
        return
    client = handler.client_address[0]
    if not _limiter.allow(client):
        handler._send_json(429, {'error': 'rate limited'})
        return
    body = handler._read_json()
    if body is None:
        return
    if not isinstance(body, dict):
        handler._send_json(400, {'error': 'expected JSON object'})
        return
    wallet = str(body.get('wallet') or '').strip()
    action = str(body.get('action') or '').strip()
    amount = int(body.get('amount') or 1)
    if not wallet or not action:
        handler._send_json(400, {'error': 'missing wallet or action'})
        return
    store = _quota_store()
    ent = store.increment(wallet, action, amount)
    handler._send_json(200, {'entitlement': ent.to_dict(), 'quotas': ent.quotas()})


def handle_quota_check(handler) -> None:
    if not _check_handler_auth(handler, '/quota/check'):
        return
    client = handler.client_address[0]
    if not _limiter.allow(client):
        handler._send_json(429, {'error': 'rate limited'})
        return
    body = handler._read_json()
    if body is None:
        return
    if not isinstance(body, dict):
        handler._send_json(400, {'error': 'expected JSON object'})
        return
    wallet = str(body.get('wallet') or '').strip()
    action = str(body.get('action') or '').strip()
    amount = int(body.get('amount') or 1)
    if not wallet or not action:
        handler._send_json(400, {'error': 'missing wallet or action'})
        return
    store = _quota_store()
    ent = store.ensure(wallet)
    ok, reason = store.can(ent, action, amount)
    handler._send_json(200, {'ok': ok, 'reason': reason, 'entitlement': ent.to_dict(), 'quotas': ent.quotas()})
