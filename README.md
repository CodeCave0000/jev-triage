# jev-triage

An OpenClaw plugin that puts **Jev**, TypeSafe AI's decision model, in front of your agent's main model.
Every incoming message is classified first — `thanks` / `spam` / `question` / `incident`, plus `urgent` yes/no — and the
main model only wakes up for the messages that need it:

| Jev's answer (score ≥ 0.9) | What happens |
|---|---|
| `thanks` | the plugin replies `בשמחה! 🙂` itself; the main model is never called |
| `spam` | the turn ends in silence |
| `question` / `incident` | the main model gets `[triage by Jev: <kind>, urgent <p>]` prepended |
| any score below 0.9 | untouched: the normal agent path |

Every decision is logged: `jev thanks 1.00 urgent 0.39 245ms`. To watch only Jev's decisions:

```bash
openclaw logs --follow | grep "jev "
```

Jev triages customer messages only, never heartbeats or cron turns. OpenClaw 2026.9.7 posts a "did not produce a
visible reply" notice after a user turn that ends in silence; the plugin cancels that notice for spam, so the spammer
gets nothing.

## Requirements

- OpenClaw **2026.9.6 or newer** (the decision-model role); tested on **2026.9.7**
- the official TypeSafe plugin, with Jev selected as the agent's decision model
- a TypeSafe API key

## Install

Run these in your OpenClaw terminal (on a Hostinger VPS: Docker Manager → your OpenClaw project → Terminal):

```bash
openclaw plugins install @openclaw/typesafe
openclaw secrets store set TYPESAFE_API_KEY --kind secret        # paste the key at the prompt, or Control UI → Settings → Secrets
openclaw config set plugins.entries.typesafe.config.apiKey '{"source":"store","provider":"default","id":"TYPESAFE_API_KEY"}' --strict-json
openclaw config set agents.defaults.decisionModel typesafe/jev-latest   # or the Decision picker in the Control UI

openclaw plugins install git:github.com/RanyAlbegWein/jev-triage --force --accept-capabilities
openclaw config set plugins.entries.jev-triage.hooks.allowConversationAccess true
```

Then restart OpenClaw. In Docker (Hostinger's one-click install included), restart the **container** and give it a few
minutes. `openclaw gateway restart` does not work inside the container. `openclaw plugins list` should then show
`typesafe` and `jev-triage` enabled.

`--accept-capabilities` is required: a plugin that reads conversations gets real access, so OpenClaw refuses it
without explicit consent. `--force` acknowledges that the source is outside ClawHub's review.

**No `git` where OpenClaw runs?** (`git --version` says "not found".) Download the folder and install it by path instead:

```bash
curl -fsSL https://github.com/RanyAlbegWein/jev-triage/archive/refs/heads/main.tar.gz | tar xz -C /tmp
openclaw plugins install /tmp/jev-triage-main --force --accept-capabilities
```

**Only for some agents?** The plugin acts only where Jev is the agent's decision model. `agents.defaults.decisionModel`
turns it on for every agent. To limit it, set the decision model on the agents you want instead of the default.

## Before you trust it

The 0.9 threshold is a starting point, not a measurement of your traffic. Run your own messages through it and
check the scores in the log first — OpenClaw's decision-model docs say the same. Jev can only return one of the
options you give it, and it can still return the wrong one: that is what the threshold is for.

MIT License.
