import { useMemo } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { configureRpc, openRpc, resumeRpc, saveRpc, settingsRpc, submitRpc } from "../shared/rpc";
import type { AnswerApi } from "./flow";

export function useAnswerApi(): AnswerApi {
  const settings = useRpc(settingsRpc);
  const configure = useRpc(configureRpc);
  const open = useRpc(openRpc);
  const resume = useRpc(resumeRpc);
  const save = useRpc(saveRpc);
  const submit = useRpc(submitRpc);
  return useMemo(() => ({
    settings: () => settings({}),
    configure: async model => { await configure(model); },
    open: agentId => open({ agentId }),
    resume: agentId => resume({ agentId }),
    save: (agentId, patch) => save({ agentId, patch }),
    submit: async (agentId, sourceId, revision) => { await submit({ agentId, sourceId, revision }); },
  }), [settings, configure, open, resume, save, submit]);
}
