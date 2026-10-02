import type { PluginServerContext, PluginHandlerContext } from "@getpaseo/plugin/server";
import { loadPiRuntime, findPiDirectory, type PiRuntime } from "./server/runtime";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAnswerService } from "./server/service";
import { createPaseoGateway } from "./server/paseo";
import { createPiExtractor } from "./server/pi";
import { configureRpc, openRpc, resumeRpc, saveRpc, settingsRpc, submitRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  let runtime: Promise<PiRuntime> | undefined;
  let service: ReturnType<typeof createAnswerService> | undefined;
  function get(context: PluginHandlerContext) {
    return service ??= createAnswerService({
      directory: process.env.PASEO_ANSWER_DATA_DIR ?? join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "plugin-data", "answer"),
      gateway: createPaseoGateway(context.paseo),
      extractor: createPiExtractor(() => runtime ??= findPiDirectory().then(loadPiRuntime).catch(error => { runtime = undefined; throw error; })),
    });
  }
  server.handle(settingsRpc, (_input, context) => get(context).settings());
  server.handle(configureRpc, async (model, context) => { await get(context).configure(model); return {}; });
  server.handle(openRpc, ({ agentId }, context) => get(context).open(agentId));
  server.handle(resumeRpc, ({ agentId }, context) => get(context).resume(agentId));
  server.handle(saveRpc, ({ agentId, patch }, context) => get(context).save(agentId, patch));
  server.handle(submitRpc, async ({ agentId, sourceId, revision }, context) => { await get(context).submit(agentId, sourceId, revision); return {}; });
  const started = server.on("agent.turn_started", async ({ agent }, context) => { if (service) await service.resume(agent.id); });
  return () => { started(); };
}
