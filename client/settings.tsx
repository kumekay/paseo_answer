import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useAnswerApi } from "./api";
import { IsolatedQueries, ModelPicker } from "./flow";

export function AnswerSettings({ theme }: PluginSurfaceProps) {
  const api = useAnswerApi();
  return <IsolatedQueries><ModelPicker api={api} theme={theme} /></IsolatedQueries>;
}
