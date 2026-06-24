#!/usr/bin/env python3
"""Static dev server for Vikariekollen that disables caching, so edits to
JS/CSS are always picked up on reload (no stale-cache false bugs).

Uses ThreadingHTTPServer so the browser's parallel resource requests don't
stall a single-threaded server."""
import http.server
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 3320


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    # Defeat If-Modified-Since 304s so an edited file is always re-sent fresh.
    def send_head(self):
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        return super().send_head()


httpd = http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler)
print(f'Vikariekollen no-cache server on http://localhost:{PORT}')
httpd.serve_forever()
