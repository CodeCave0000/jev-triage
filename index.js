import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// Jev decides, the agent executes: every message is triaged by the agent's
// decision model before the main model is called.
const QUESTIONS = {
  kind: {
    type: "choice",
    instructions: "What kind of message is this",
    criteria: {
      thanks: "A thank-you or a confirmation that needs no action",
      spam: "Advertising, phishing or unrelated junk",
      question: "A how-to, billing or account question",
      incident: "Something is broken or down",
    },
  },
  urgent: {
    type: "boolean",
    instructions: "Is it time-sensitive",
    criteria: { true: "Live customers or a deadline are affected", false: "It can wait for normal handling" },
  },
};

const verdicts = new Map();
const silenced = new Set(); // sessions whose spam turn must send nothing

export default definePluginEntry({
  id: "jev-triage",
  name: "Jev triage",
  description: "Jev decides before the agent runs.",
  register(api) {
    // runs first, right before the model call: Jev decides, and can end the turn here
    api.on("before_agent_reply", async (event, ctx) => {
      silenced.delete(ctx.sessionKey ?? "");
      const t0 = Date.now();
      const out = await api.runtime.decisions.evaluate(
        { state: event.cleanedBody, questions: QUESTIONS },
        { agentId: ctx.agentId, purpose: "support.triage", rubricVersion: "1", timeoutMs: 5000, signal: AbortSignal.timeout(5000) },
      );
      if (out.status !== "ok") return; // no decision model: the normal agent path
      const { kind, urgent } = out.result.answers;
      const sure = kind.probabilities[kind.choice];
      api.logger.info(`jev ${kind.choice} ${sure.toFixed(2)} urgent ${urgent.probabilityTrue.toFixed(2)} ${Date.now() - t0}ms`);
      if (sure < 0.9) return; // not sure enough: the message goes to the main model untouched
      if (kind.choice === "thanks") return { handled: true, reply: { text: "בשמחה! 🙂" } };
      if (kind.choice === "spam") {
        silenced.add(ctx.sessionKey ?? "");
        return { handled: true }; // silence, no model call
      }
      verdicts.set(ctx.runId ?? "", `${kind.choice}, urgent ${urgent.probabilityTrue.toFixed(2)}`);
    }, { eligibleTriggers: ["user"] }); // customer messages only, never heartbeats or cron

    // then the main model gets the decision instead of making it again
    api.on("before_prompt_build", (event, ctx) => {
      const v = verdicts.get(ctx.runId ?? "");
      verdicts.delete(ctx.runId ?? "");
      if (v) return { prependContext: `[triage by Jev: ${v}]` };
    });

    // a user turn must end in a reply, so OpenClaw sends a "no visible reply" notice: spam cancels it
    api.on("message_sending", (event, ctx) => {
      if (silenced.delete(ctx.sessionKey ?? "")) return { cancel: true, cancelReason: "jev: spam" };
    });
  },
});
