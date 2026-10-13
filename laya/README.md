# Laya instead of Jev

Use [Laya](https://github.com/NandhaKishorM/laya), the open-source decision model, as the decision model of an
[OpenClaw](https://openclaw.ai) agent, in place of TypeSafe Jev. Everything runs on your own server. You need no API key.

## Why an adapter

`laya-serve` answers on the same `POST /v1/systemone` endpoint as the hosted Jev API, and OpenClaw's TypeSafe plugin can
send its decisions to a local server (`baseUrl`). But the plugin validates every response strictly
(`additionalProperties: false`), and Laya adds fields that Jev does not send (`routing`, `answer_confidence`, `action`,
extra `usage` fields). The plugin then rejects the answer with `invalid-response`.

`laya_shim.py` sits between them. It forwards each request to Laya and returns only the fields that Jev returns. It is
one file, Python standard library only.

## Install (inside the OpenClaw container)

Tested on 13 October 2026 with OpenClaw 2026.9.7, `@openclaw/typesafe` 2026.9.7, Laya 0.4.6, on a 2-vCPU VPS with no GPU.

```bash
cd ~
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv venv laya
uv pip install --python laya/bin/python torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python laya/bin/python "laya[serve]"
curl -LO https://raw.githubusercontent.com/CodeCave0000/jev-triage/laya-v1/laya/laya_shim.py
```

Point the TypeSafe plugin at the adapter, then restart the container:

```bash
openclaw config set plugins.entries.typesafe.config.baseUrl http://127.0.0.1:8712
```

After every container restart, start Laya and the adapter:

```bash
cd ~
LAYA_HOST=127.0.0.1 LAYA_PORT=8711 LAYA_MODELS=multilingual LAYA_PRELOAD=1 nohup laya/bin/laya-serve > laya.log 2>&1 &
nohup laya/bin/python laya_shim.py 8712 8711 multilingual > shim.log 2>&1 &
```

`laya_shim.py <adapter port> <laya port> [checkpoint]`. The optional checkpoint pins every request to one Laya model, so a
small server keeps one model in memory (`multilingual` reads 100+ languages, Hebrew included).

Keep your agent's decision model as it is (for example `typesafe/jev-latest`). With `baseUrl` set, every request from the
TypeSafe plugin goes to the local server, whatever the model label says.

## What to expect

- About 2 GB of memory for `laya-serve` with the multilingual model.
- About 0.4 to 0.6 seconds per decision on a 2-vCPU VPS.
- Laya's base models are weaker than Jev on nuance (urgency, negation). Their own benchmark file says the headline score
  comes from a fine-tuned checkpoint. Keep a confidence bar in your plugin and let the main model handle the rest.

## Go back to Jev

```bash
openclaw config unset plugins.entries.typesafe.config.baseUrl
```

Then restart the container.

