import type { PluginClientContext, PluginButtonRegistration } from "@getpaseo/plugin/client";
import { createLauncher } from "./client/launcher";
import { AnswerSettings } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; pill: PluginButtonRegistration; launcher: ReturnType<typeof createLauncher> }>();
  let stopped = false;
  const lifetime = new AbortController();
  let unsubscribe: (() => void) | undefined;
  let release: (() => Promise<void>) | undefined;
  function remove(agentId: string) {
    const item = pills.get(agentId);
    item?.launcher.close();
    item?.pill.remove();
    pills.delete(agentId);
  }
  function register(agent: { id: string; workspaceId?: string | null; archivedAt?: string | null }) {
    if (stopped) return;
    if (!agent.workspaceId || agent.archivedAt) { remove(agent.id); return; }
    const current = pills.get(agent.id);
    if (current?.workspaceId === agent.workspaceId) return current;
    remove(agent.id);
    const launcher = createLauncher(agent.id);
    const pill = client.addComposerPill({ id: "answer", workspaceId: agent.workspaceId, agentId: agent.id, button: {
      title: "Answer questions", label: "Answer", icon: launcher.Icon,
      behavior: { kind: "action", onPress: launcher.show },
    } });
    const item = { workspaceId: agent.workspaceId, pill, launcher };
    pills.set(agent.id, item);
    return item;
  }
  let snapshotGeneration = 0;
  async function remainingPages(cursor: string | null, present: Set<string>, generation: number) {
    while (cursor && !stopped) {
      const page = await client.paseo.agents.list({ signal: lifetime.signal, page: { limit: 200, cursor } });
      for (const { agent } of page.entries) { present.add(agent.id); register(agent); }
      cursor = page.pageInfo.nextCursor;
    }
    if (!stopped && snapshotGeneration === generation) for (const id of pills.keys()) if (!present.has(id)) remove(id);
  }
  const removeSettings = client.addSettingsScreen({ id: "model", title: "Extraction model", icon: "Cpu", Component: AnswerSettings });
  const removeCommand = client.addSlashCommand({ name: "answer", description: "Answer questions from the latest agent iteration", argumentHint: "", context: "agent",
    onSubmit({ agent, workspace }) { register({ id: agent.id, workspaceId: workspace.id })?.launcher.show(); },
  });
  void client.paseo.agents.list({ subscribe: {}, signal: lifetime.signal, page: { limit: 200 } }).then(({ subscription }) => {
    if (stopped) { void subscription.release(); return; }
    release = () => subscription.release();
    unsubscribe = subscription.subscribe({
      snapshot({ entries, pageInfo }) {
        const generation = ++snapshotGeneration;
        const present = new Set(entries.map(entry => entry.agent.id));
        for (const { agent } of entries) register(agent);
        void remainingPages(pageInfo.nextCursor, present, generation).catch(error => {
          if (!stopped) console.error("Answer directory paging failed:", error instanceof Error ? error.message : String(error));
        });
      },
      update(message) {
        if (message.type !== "agent_update") return;
        snapshotGeneration++;
        const update = message.payload;
        if (update.kind === "remove") remove(update.agentId);
        else register(update.agent);
      },
      error(error) { if (!stopped) console.error("Answer agent observation failed:", error instanceof Error ? error.message : String(error)); },
    });
  }).catch(error => { if (!stopped) console.error("Answer agent observation failed:", error instanceof Error ? error.message : String(error)); });
  return async () => {
    stopped = true;
    lifetime.abort();
    unsubscribe?.();
    removeCommand();
    removeSettings();
    for (const id of pills.keys()) remove(id);
    await release?.();
  };
}
