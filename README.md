# jev-triage

An OpenClaw plugin that puts a **decision model** in front of your agent's main model. Pick the model:

| Provider | What it is | Runs where | Costs |
|---|---|---|---|
| **Jev** | TypeSafe AI's hosted decision model | TypeSafe's API | a TypeSafe API key, per token |
| **Laya** | Convai Innovations' open-weights decision model (Apache 2.0), speaks the same wire protocol as Jev | your own server, next to OpenClaw | nothing, about 2 GB of RAM |

Both go through OpenClaw's decision-model role and the official TypeSafe plugin, so the plugin code is the same;
only the install differs (see [Install](#install)).

Every incoming message is classified first — `thanks` / `spam` / `question` / `incident`, plus `urgent` yes/no — and the
main model only wakes up for the messages that need it:

| The decision (score ≥ 0.9) | What happens |
|---|---|
| `thanks` | the plugin replies `בשמחה! 🙂` itself; the main model is never called |
| `spam` | the turn ends in silence |
| `question` / `incident` | the main model gets `[triage by Jev: <kind>, urgent <p>]` (or `by Laya`) prepended, and the earlier verdicts of the same chat |
| any score below 0.9 | untouched: the normal agent path |

Every decision is logged with the name of the model that answered: `jev thanks 1.00 urgent 0.39 245ms` or
`laya thanks 0.98 urgent 0.12 180ms`. To watch only the decisions:

```bash
openclaw logs --follow | grep -E "(jev|laya) "
```

The decision model sees each incoming message before OpenClaw hands it to the model (the `before_dispatch` hook), so
thanks and spam end there and a spammer gets nothing back. Commands such as `/new` go straight to OpenClaw, and
heartbeat or cron turns are never triaged.

## Requirements

- OpenClaw **2026.9.6 or newer** (the decision-model role); tested on **2026.9.7** with Jev
- the official TypeSafe plugin — it is the bridge for both providers: hosted Jev, or a local System One server such as Laya
- **Jev:** a TypeSafe API key
- **Laya:** about 2 GB of free RAM and 1 GB of disk on the machine that runs OpenClaw, for the multilingual checkpoint; no key

## Install

Run these in your OpenClaw terminal (on a Hostinger VPS: Docker Manager → your OpenClaw project → Terminal).

### 1. The TypeSafe plugin (both providers)

```bash
openclaw plugins install @openclaw/typesafe
```

### 2a. Jev (hosted)

```bash
openclaw secrets store set TYPESAFE_API_KEY --kind secret        # paste the key at the prompt, or Control UI → Settings → Secrets
openclaw config set plugins.entries.typesafe.config.apiKey '{"source":"store","provider":"default","id":"TYPESAFE_API_KEY"}' --strict-json
openclaw config set agents.defaults.decisionModel typesafe/jev-latest   # or the Decision picker in the Control UI
```

### 2b. Laya (self-hosted)

Laya's server answers on the same `POST /v1/systemone` endpoint as Jev, so the TypeSafe plugin talks to it as a
"local System One server". Two things are fixed by the plugin: the server must be reachable on **loopback**
(`127.0.0.1`) from where OpenClaw runs, and it must answer in Laya's **strict Jev mode** (`LAYA_JEV_STRICT=1`),
because the plugin rejects a reply with extra fields.

**On a Hostinger VPS (OpenClaw in Docker).** The OpenClaw container's loopback is its own, so Laya runs in a second
container that shares its network. In the VPS **host** shell (hPanel → Browser terminal, or SSH), not the OpenClaw
terminal:

```bash
OC=$(docker ps --format '{{.Names}}' | grep -i openclaw | head -1); echo "$OC"
git clone --depth 1 https://github.com/NandhaKishorM/laya.git laya && docker build -t laya:local laya
docker run -d --name laya --restart unless-stopped --network "container:$OC" \
  -e LAYA_HOST=127.0.0.1 -e LAYA_JEV_STRICT=1 -e LAYA_MODELS=multilingual -e LAYA_PRELOAD=1 \
  -v laya-cache:/home/laya/.cache/huggingface laya:local laya-serve
docker logs -f laya        # the first start downloads the checkpoint (~650 MB); wait for "Application startup complete"
```

There is no published Laya image, which is why it is built from the checkout (CPU PyTorch, a few minutes). If Docker
Manager ever **recreates** the OpenClaw container (an update, not a restart), run `docker rm -f laya` and the
`docker run` line again, because the shared network points at the old container.

**OpenClaw on a plain machine.** Python 3.10+:

```bash
pip install "laya[serve]"
LAYA_HOST=127.0.0.1 LAYA_JEV_STRICT=1 LAYA_MODELS=multilingual LAYA_PRELOAD=1 laya-serve
```

**Then point OpenClaw at it** (back in the OpenClaw terminal):

```bash
curl -s http://127.0.0.1:8000/health      # {"status":"ok"} once the server is up
openclaw config set plugins.entries.typesafe.config.baseUrl http://127.0.0.1:8000
openclaw config set agents.defaults.decisionModel typesafe/multilingual
```

`typesafe/multilingual` sends `multilingual` as the model label, which pins Laya's multilingual checkpoint (Hebrew
included, 100+ languages; 1.6 GB of RAM resident). `typesafe/english` pins the English checkpoint, which is sharper on
English and useless on Hebrew. `typesafe/kev-latest` lets Laya's router pick a checkpoint per message by its script,
which downloads the second checkpoint on demand (the first such message waits a few seconds) and keeps both resident.
The label does not appear in the Control UI's Decision picker; set it from the terminal as above.

With `baseUrl` set, every TypeSafe request goes to the local server and the API key is ignored. To go back to Jev:

```bash
openclaw config unset plugins.entries.typesafe.config.baseUrl
openclaw config set agents.defaults.decisionModel typesafe/jev-latest
```

### 3. This plugin (both providers)

```bash
openclaw plugins install git:github.com/CodeCave0000/jev-triage --force --accept-capabilities
openclaw config set plugins.entries.jev-triage.hooks.allowConversationAccess true
```

Then restart OpenClaw. In Docker (Hostinger's one-click install included), restart the **container** and give it a few
minutes. `openclaw gateway restart` does not work inside the container. `openclaw plugins list` should then show
`typesafe` and `jev-triage` enabled.

`--accept-capabilities` is required: a plugin that reads conversations gets real access, so OpenClaw refuses it
without explicit consent. `--force` acknowledges that the source is outside ClawHub's review.

**No `git` where OpenClaw runs?** (`git --version` says "not found".) Download the folder and install it by path instead:

```bash
curl -fsSL https://github.com/CodeCave0000/jev-triage/archive/refs/heads/main.tar.gz | tar xz -C /tmp
openclaw plugins install /tmp/jev-triage-main --force --accept-capabilities
```

**Only for some agents?** The plugin acts only where a decision model is set for the agent. `agents.defaults.decisionModel`
turns it on for every agent. To limit it, set the decision model on the agents you want instead of the default.

## Before you trust it

The 0.9 threshold is a starting point, not a measurement of your traffic. Run your own messages through it and
check the scores in the log first — OpenClaw's decision-model docs say the same. Jev and Laya can only return one of the
options you give them, and they can still return the wrong one: that is what the threshold is for. The two models
are calibrated differently, so a threshold tuned on one is not automatically right for the other.

MIT License.
