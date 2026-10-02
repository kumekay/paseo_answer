import { expect, test } from "vitest";
import type { PluginClientContext, PluginComposerPillContribution, PluginClientSlashCommandContribution } from "@getpaseo/plugin/client";
import { FetchAgentsRequestMessageSchema } from "@getpaseo/protocol/messages";
import contribute from "../index.client";

test("agents beyond the first directory page also receive an Answer button", async () => {
  const pills = new Map<string, PluginComposerPillContribution>();
  const client = {
    paseo: { agents: { async list(options: { page?: { cursor?: string } }) {
      if (options.page?.cursor) return { entries: [{ agent: { id: "last-agent", workspaceId: "workspace-2" } }], pageInfo: { nextCursor: null } };
      return { subscription: {
        subscribe(observer: { snapshot(value: unknown): void }) { observer.snapshot({ entries: [{ agent: { id: "first-agent", workspaceId: "workspace-1" } }], pageInfo: { nextCursor: "next-page" } }); return () => {}; },
        async release() {},
      } };
    } } },
    addComposerPill(pill: PluginComposerPillContribution) { pills.set(pill.agentId, pill); return { update() {}, remove() { pills.delete(pill.agentId); } }; },
    addSlashCommand() { return () => {}; },
    addSettingsScreen() { return () => {}; },
  } as unknown as PluginClientContext;
  const cleanup = contribute(client);
  await new Promise(resolve => setImmediate(resolve));
  expect([...pills.keys()]).toEqual(["first-agent", "last-agent"]);
  await cleanup();
});

test("the plugin exposes Answer beside Tasks/Subagents and a client-only slash command", async () => {
  const pills = new Map<string, PluginComposerPillContribution>();
  let slash: PluginClientSlashCommandContribution | undefined;
  let released = false;
  const client = {
    paseo: { agents: { async list(options: object) { FetchAgentsRequestMessageSchema.parse({ type: "fetch_agents_request", requestId: "test", ...options }); return { subscription: {
      subscribe(observer: { snapshot(value: unknown): void }) { observer.snapshot({ entries: [{ agent: { id: "agent-1", workspaceId: "workspace-1" } }], pageInfo: { nextCursor: null } }); return () => {}; },
      async release() { released = true; },
    } }; } } },
    addComposerPill(pill: PluginComposerPillContribution) { pills.set(pill.agentId, pill); return { update() {}, remove() { pills.delete(pill.agentId); } }; },
    addSlashCommand(command: PluginClientSlashCommandContribution) { slash = command; return () => {}; },
    addSettingsScreen() { return () => {}; },
  } as unknown as PluginClientContext;
  const cleanup = contribute(client);
  await Promise.resolve();
  expect(pills.get("agent-1")?.button.label).toBe("Answer");
  expect(slash).toMatchObject({ name: "answer", context: "agent" });
  await cleanup();
  expect(pills.size).toBe(0);
  expect(released).toBe(true);
});
