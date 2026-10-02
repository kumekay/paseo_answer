import { createHash } from "node:crypto";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
type PaseoApi = PluginHandlerContext["paseo"];
import type { AgentGateway } from "./service";

export function createPaseoGateway(paseo: PaseoApi): AgentGateway {
  return {
    async iteration(agentId) {
      const agent = paseo.agents.ref(agentId);
      const snapshot = await agent.refresh();
      if (!snapshot || snapshot.agent.status === "closed") throw new Error("Agent is unavailable.");
      if (snapshot.agent.status === "error") throw new Error(snapshot.agent.lastError ?? "Agent iteration failed. Retry the agent before extracting questions.");
      const messages: string[] = [];
      let cursor: { epoch: string; seq: number } | undefined;
      let sourceId = "";
      for (;;) {
        const page = await agent.timeline.refetch({ direction: cursor ? "before" : "tail", cursor, projection: "canonical", limit: 200 });
        if (page.error) throw new Error(page.error);
        let found = false;
        for (const entry of [...page.entries].reverse()) {
          if (entry.item.type === "user_message") {
            const inputIdentity = snapshot.agent.lastUserMessageAt ?? entry.item.clientMessageId ?? entry.item.messageId ?? entry.timestamp;
            sourceId = `${inputIdentity}:${createHash("sha256").update(entry.item.text).digest("hex")}`;
            found = true;
            break;
          }
          if (entry.item.type === "assistant_message" && entry.item.text.trim()) messages.unshift(entry.item.text);
        }
        if (found || !page.hasOlder || !page.startCursor) break;
        cursor = page.startCursor;
      }
      return { id: sourceId, text: sourceId ? messages.join("\n\n") : "", busy: snapshot.agent.status === "running" || snapshot.agent.status === "initializing" || !!snapshot.agent.activeTurn };
    },
    async send(agentId, message) { await paseo.agents.ref(agentId).send(message); },
  };
}
