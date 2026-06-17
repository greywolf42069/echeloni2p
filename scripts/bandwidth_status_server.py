"""Standalone bandwidth status endpoint for Echelon.

This is intentionally separate from the giant sync daemon so we can prove
bandwidth accounting end-to-end without repeatedly touching the main
request handler.

Endpoint behavior:
- polls i2pd stats
- reconciles them with the stored bandwidth counters
- returns a JSON snapshot for the UI or daemon to consume
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import json
import os

from scripts.bandwidth_meter import poll_and_record
from scripts import auth as auth_mod
from scripts.rate_limiter import RateLimiter

HOST = os.environ.get('ECHELON_BW_HOST', '127.0.0.1')
PORT = int(os.environ.get('ECHELON_BW_PORT', '7072'))


class Handler(BaseHTTPRequestHandler):
    rate_limiter = RateLimiter(rate=5.0, capacity=10)

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _check_auth(self, path: str) -> bool:
        """Return True if request is allowed, False if a rejection was sent."""
        if not auth_mod.require_auth_enabled():
            return True
        expected = auth_mod.load_or_create_secret()
        submitted = self.headers.get('X-Echelon-Auth')
        result = auth_mod.auth_status_for(path, submitted, expected, require_auth=True)
        if result is not None:
            status, message = result
            self._send_json(status, {'error': message})
            return False
        return True

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path
        if not self._check_auth(path):
            return
        if path == '/health':
            self._send_json(200, {'ok': True})
            return
        client = self.client_address[0]
        if not self.rate_limiter.allow(client):
            self._send_json(429, {'error': 'rate limited'})
            return
        if path == '/status/bandwidth':
            qs = parse_qs(urlparse(self.path).query)
            wallet = (qs.get('wallet') or [None])[0]
            tier = (qs.get('tier') or ['free'])[0]
            try:
                payload = poll_and_record(wallet, tier)
                self._send_json(200, payload)
            except Exception as exc:  # noqa: BLE001
                self._send_json(500, {'error': 'bandwidth status unavailable', 'detail': str(exc)})
            return
        self._send_json(404, {'error': 'not found'})

    def log_message(self, format, *args):  # noqa: A003
        return


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'[echelon-bandwidth] listening on http://{HOST}:{PORT}')
    server.serve_forever()


if __name__ == '__main__':
    main()
