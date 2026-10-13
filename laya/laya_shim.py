"""Jev-strict shim: forwards POST /v1/systemone to laya-serve and returns only the fields Jev returns.

OpenClaw's TypeSafe plugin validates responses with additionalProperties: false; laya-serve adds
routing / answer_confidence / action / x_jev_confidence / extra usage fields, which fail that check.
Usage: python laya_shim.py [listen_port] [laya_port] [checkpoint]
  checkpoint (optional, e.g. multilingual): pin every request to one Laya checkpoint, so a small server keeps one model in memory.
"""
import json, sys, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN = int(sys.argv[1]) if len(sys.argv) > 1 else 8712
UPSTREAM = f"http://127.0.0.1:{int(sys.argv[2]) if len(sys.argv) > 2 else 8711}"
PIN = sys.argv[3] if len(sys.argv) > 3 else None
KEEP = {"noul": ("type", "noul"),
        "choice": ("type", "choice", "confidence", "probabilities"),
        "score": ("type", "score", "confidence", "probabilities", "legend")}


def slim(r):
    answers = {k: {f: a[f] for f in KEEP.get(a.get("type"), a.keys()) if f in a} for k, a in r["answers"].items()}
    u = r.get("usage", {})
    return {"model": r.get("model", "laya"), "answers": answers,
            "usage": {"input_tokens": int(u.get("input_tokens", 0)), "output_tokens": int(u.get("output_tokens", 0))}}


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        if PIN:
            b = json.loads(body or b"{}")
            b["model"] = PIN
            body = json.dumps(b).encode()
        req = urllib.request.Request(UPSTREAM + self.path, data=body, headers={"content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as up:
                code, data = up.status, json.loads(up.read())
                if self.path.rstrip("/") == "/v1/systemone" and code == 200:
                    routed = data.get("routing", {}).get("model")
                    data = slim(data)
                    print(f"laya {routed} -> " + json.dumps({k: a.get("choice", a.get("noul")) for k, a in data["answers"].items()}), flush=True)
        except urllib.error.HTTPError as e:
            code, data = e.code, json.loads(e.read() or b"{}")
        out = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", LISTEN), H).serve_forever()
