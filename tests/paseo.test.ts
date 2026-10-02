import { expect, test } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { createPaseoGateway } from "../server/paseo";

const entry = (seq: number, type: string, text: string) => ({ seqStart: seq, seqEnd: seq, timestamp: "2026-10-01T10:00:00Z", item: { type, text } });

test("the same user input retains its draft identity after a timeline epoch changes", async () => {
  let epoch = "before-restart";
  const api = { agents: { ref() { return {
    async refresh() { return { agent: { status: "idle", activeTurn: null, lastUserMessageAt: "2026-10-01T10:00:00Z" } }; },
    timeline: { async refetch() { return { epoch, entries: [
      { ...entry(2, "user_message", "Configure it"), item: { type: "user_message", text: "Configure it", clientMessageId: epoch === "before-restart" ? "stable-user-id" : undefined } },
      entry(3, "assistant_message", "Which database?"),
    ], hasOlder: false, error: null }; } },
  }; } } } as unknown as PaseoApi;
  const gateway = createPaseoGateway(api);
  const original = await gateway.iteration("agent-1");
  epoch = "after-restart";
  expect(await gateway.iteration("agent-1")).toEqual(original);
});

test("assistant text without a user-input boundary is not an extractable iteration", async () => {
  const api = { agents: { ref() { return {
    async refresh() { return { agent: { status: "idle", activeTurn: null } }; },
    timeline: { async refetch() { return { epoch: "epoch", entries: [entry(1, "assistant_message", "Old question?")], hasOlder: false, error: null }; } },
  }; } } } as unknown as PaseoApi;
  expect(await createPaseoGateway(api).iteration("agent-1")).toEqual({ id: "", text: "", busy: false });
});

test("a failed agent iteration reports its error instead of extracting a partial reply", async () => {
  const api = { agents: { ref() { return {
    async refresh() { return { agent: { status: "error", lastError: "Provider failed", activeTurn: null } }; },
    timeline: { async refetch() { throw new Error("Do not read failed history"); } },
  }; } } } as unknown as PaseoApi;
  await expect(createPaseoGateway(api).iteration("agent-1")).rejects.toThrow("Provider failed");
});

test("extraction reads every assistant message since the latest user input across history pages", async () => {
  const pages = [
    { entries: [entry(5, "reasoning", "Private thinking"), entry(6, "assistant_message", "Which region?")], hasOlder: true, startCursor: { epoch: "epoch", seq: 5 } },
    { entries: [entry(1, "assistant_message", "Old question?"), entry(2, "user_message", "Configure it"), entry(3, "assistant_message", "Which database?"), entry(4, "notification", "Tool progress")], hasOlder: false, startCursor: null },
  ];
  const api = { agents: { ref() { return {
    async refresh() { return { agent: { status: "idle", activeTurn: null } }; },
    timeline: { async refetch() { return { ...pages.shift(), epoch: "epoch", error: null }; } },
  }; } } } as unknown as PaseoApi;
  expect(await createPaseoGateway(api).iteration("agent-1")).toEqual({ id: expect.stringMatching(/^2026-10-01T10:00:00Z:[a-f0-9]{64}$/), text: "Which database?\n\nWhich region?", busy: false });
});
