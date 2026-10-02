import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PluginTheme } from "@getpaseo/plugin";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import type { Draft, DraftPatch, ModelOption, ModelSelection, OpenResult } from "../shared/types";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { QuestionForm } from "./form";

export interface AnswerApi {
  settings(): Promise<{ model: ModelSelection | null; models: ModelOption[] }>;
  configure(model: ModelSelection): Promise<void>;
  open(agentId: string): Promise<OpenResult>;
  resume(agentId: string): Promise<OpenResult>;
  save(agentId: string, patch: DraftPatch): Promise<Draft>;
  submit(agentId: string, sourceId: string, revision: string): Promise<void>;
}
export interface AnswerFlowProps { api: AnswerApi; agentId: string; theme: PluginTheme; compact: boolean; onClose(): void }

export function AnswerFlow(props: AnswerFlowProps) {
  return <IsolatedQueries><AnswerSession {...props} /></IsolatedQueries>;
}

export function IsolatedQueries({ children }: { children: ReactNode }) {
  // Never reuse Paseo's shared cache across daemon hosts or dialog sessions.
  const client = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false }, mutations: { retry: false } } }), []);
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function ModelPicker({ api, theme }: { api: AnswerApi; theme: PluginTheme }) {
  const queries = useQueryClient();
  const settings = useQuery({ queryKey: ["answer", "settings"], queryFn: api.settings, retry: false });
  const [search, setSearch] = useState("");
  const configure = useMutation({ mutationFn: api.configure, onSuccess: () => queries.invalidateQueries({ queryKey: ["answer", "settings"] }) });
  const colors = theme.colors;
  if (settings.isPending) return <Text style={{ color: colors.foregroundMuted }}>Loading host configuration…</Text>;
  if (settings.error) return <Text style={{ color: colors.statusDanger }}>{settings.error.message}</Text>;
  const current = settings.data.model;
  return <View style={{ gap: 12 }}>
    <Text style={{ color: colors.foreground, fontSize: 20 }}>Select an extraction model</Text>
    <Text style={{ color: colors.foregroundMuted }}>{current ? `Current: ${current.provider}/${current.id}` : "This host uses its Pi authentication. No model is selected automatically."}</Text>
    <TextInput accessibilityLabel="Search models" value={search} onChangeText={setSearch} placeholder="Search by name or provider…" placeholderTextColor={colors.foregroundMuted}
      style={{ color: colors.foreground, minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }} />
    {settings.data.models.length === 0 && <Text style={{ color: colors.foregroundMuted }}>No authenticated models found. Sign in through Pi on this host, then reload the plugin.</Text>}
    {settings.data.models.filter(model => `${model.name} ${model.provider}/${model.id}`.toLowerCase().includes(search.toLowerCase())).map(model => {
      const chosen = current?.provider === model.provider && current.id === model.id;
      return <Pressable key={`${model.provider}/${model.id}`} accessibilityRole="button" accessibilityLabel={`Choose ${model.provider}/${model.id}`} accessibilityState={{ selected: chosen }} disabled={configure.isPending}
        onPress={() => configure.mutate({ provider: model.provider, id: model.id })}
        style={{ padding: 12, minHeight: 48, borderWidth: 1, borderColor: chosen ? colors.accent : colors.border, borderRadius: 10 }}>
        <Text style={{ color: colors.foreground }}>{model.name}</Text>
        <Text style={{ color: colors.foregroundMuted }}>{model.provider}/{model.id}</Text>
      </Pressable>;
    })}
    {configure.error && <Text style={{ color: colors.statusDanger }}>{configure.error.message}</Text>}
  </View>;
}

function AnswerSession({ api, agentId, theme, compact, onClose }: AnswerFlowProps) {
  const queries = useQueryClient();
  const settings = useQuery({ queryKey: ["answer", "settings"], queryFn: api.settings, retry: false });
  const opened = useQuery({ queryKey: ["answer", "open", agentId], queryFn: () => api.open(agentId), enabled: !!settings.data?.model, retry: false,
    refetchInterval: query => query.state.data?.status === "waiting" ? 1000 : false,
  });
  const [working, setWorking] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef<Draft | null>(null);
  const revision = useRef("");
  const dirty = useRef(false);
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const resumed = useQuery({ queryKey: ["answer", "resume", agentId], queryFn: async () => {
    const editVersion = generation.current;
    return { state: await api.resume(agentId), generation: editVersion };
  }, enabled: opened.data?.status === "ready", retry: false, refetchInterval: 2000 });
  useEffect(() => {
    const remote = resumed.data?.state;
    if (!remote) return;
    if (remote.status === "empty") {
      generation.current++;
      dirty.current = false;
      latest.current = null;
      setWorking(null);
    } else if (remote.draft && !dirty.current && resumed.data?.generation === generation.current) {
      latest.current = remote.draft;
      revision.current = remote.draft.revision;
      setWorking(remote.draft);
    }
  }, [resumed.data]);
  useEffect(() => {
    if (opened.data?.draft) {
      latest.current = opened.data.draft;
      revision.current = opened.data.draft.revision;
      setWorking(opened.data.draft);
    }
  }, [opened.data]);
  function change(next: Draft) {
    generation.current++;
    dirty.current = true;
    latest.current = next;
    setWorking(next);
    setSaveError(null);
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (!dirty.current || !latest.current) return;
      const attempted = latest.current;
      const version = generation.current;
      const saved = await api.save(agentId, { ...attempted, revision: revision.current });
      revision.current = saved.revision;
      dirty.current = generation.current !== version;
      latest.current = dirty.current ? { ...latest.current!, revision: saved.revision } : saved;
      setWorking(latest.current);
    }).catch(error => { setSaveError(error instanceof Error ? error.message : String(error)); });
  }
  const submit = useMutation({ mutationFn: async () => {
    await queue.current;
    if (dirty.current || !latest.current) throw new Error("Save your answers before sending.");
    const current = latest.current;
    await api.submit(agentId, current.sourceId, current.revision);
  }, onSuccess: () => {
    queries.removeQueries({ queryKey: ["answer", "open", agentId] });
    onClose();
  } });
  const colors = theme.colors;
  if (settings.isPending) return <Text style={{ color: colors.foregroundMuted }}>Loading host configuration…</Text>;
  if (settings.error) return <Text style={{ color: colors.statusDanger }}>{settings.error.message}</Text>;
  if (!settings.data?.model) return <ModelPicker api={api} theme={theme} />;
  const modelHint = <Text style={{ color: colors.foregroundMuted }}>Change the extraction model in Settings → Plugins → Answer.</Text>;
  const extractAgain = <Pressable accessibilityRole="button" accessibilityLabel="Extract questions" onPress={() => {
    queries.removeQueries({ queryKey: ["answer", "resume", agentId] });
    void opened.refetch();
  }} style={{ padding: 12, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}><Text style={{ color: colors.foreground }}>Extract questions</Text></Pressable>;
  if (opened.error) return <View style={{ gap: 12 }}><Text style={{ color: colors.statusDanger }}>{opened.error.message}</Text>{extractAgain}{modelHint}</View>;
  if (opened.isPending) return <Text style={{ color: colors.foregroundMuted }}>Extracting questions…</Text>;
  if (opened.data?.status === "waiting") return <Text style={{ color: colors.foregroundMuted }}>Waiting for the agent to finish…</Text>;
  if (!opened.data?.draft) return <View style={{ gap: 12 }}><Text style={{ color: colors.foregroundMuted }}>No questions found.</Text>{extractAgain}</View>;
  if (resumed.data?.state.status === "empty") return <View style={{ gap: 12 }}><Text style={{ color: colors.foregroundMuted }}>Conversation changed. Obsolete draft discarded.</Text>{extractAgain}</View>;
  if (!working) return <Text style={{ color: colors.foregroundMuted }}>Loading draft…</Text>;
  return <View style={{ gap: 12 }}>
    {saveError && <Text style={{ color: colors.statusDanger }}>Draft not saved: {saveError}</Text>}
    {submit.error && <Text style={{ color: colors.statusDanger }}>{submit.error.message}</Text>}
    <QuestionForm draft={working} theme={theme} compact={compact} busy={submit.isPending} onChange={change} onSubmit={() => submit.mutate()} />
  </View>;
}
