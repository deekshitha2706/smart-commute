"""Serve the SmartCommute web UI on http://localhost:8000 (a secure context, so GPS works in Chrome/Edge).
Usage:  python tools/serve_web.py [port]
No MATLAB bridge here: the badge shows DEMO ENGINE (JavaScript approximation of the statistical engine)."""
import functools, http.server, os, sys
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'web')
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
print('SmartCommute UI on http://localhost:%d  (Ctrl+C to stop)' % port)
http.server.ThreadingHTTPServer(('127.0.0.1', port), h).serve_forever()
