import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PluginTheme } from "@getpaseo/plugin";
import { expect, test } from "vitest";
import { AnswerFlow, IsolatedQueries, ModelPicker, type AnswerApi } from "../client/flow";
import type { Draft, ModelSelection } from "../shared/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const theme = { colors: { foreground: "#eee", foregroundMuted: "#aaa", surface0: "#111", surface1: "#222", accent: "#88f", accentForeground: "#111", border: "#333", statusDanger: "#f88" } } as unknown as PluginTheme;
const draft: Draft = { sourceId: "user-1", revision: "revision-1", index: 0, review: false,
  questions: [{ question: "Which database?", context: "", mode: "single", options: ["SQLite", "PostgreSQL"] }],
  answers: [{ selected: [], text: "", skipped: false }],
};
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); }

test("one host's selected model cannot preselect a model on another host", async () => {
  function apiFor(model: ModelSelection | null): AnswerApi { return {
    async settings() { return { model, models: [{ provider: "example", id: "small", name: "Small" }] }; },
    async configure() {}, async open() { return { status: "empty", draft: null }; }, async resume() { return { status: "empty", draft: null }; },
    async save() { throw new Error("No draft"); }, async submit() {},
  }; }
  const shared = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } });
  let first!: ReactTestRenderer; let second!: ReactTestRenderer;
  await act(async () => { first = create(<QueryClientProvider client={shared}><AnswerFlow api={apiFor({ provider: "example", id: "small" })} agentId="host-one-agent" theme={theme} compact onClose={() => {}} /></QueryClientProvider>); });
  await settle();
  await act(async () => { second = create(<QueryClientProvider client={shared}><AnswerFlow api={apiFor(null)} agentId="host-two-agent" theme={theme} compact onClose={() => {}} /></QueryClientProvider>); });
  await settle();
  expect(JSON.stringify(second.toJSON())).toContain("Select an extraction model");
  await act(async () => { first.unmount(); second.unmount(); }); shared.clear();
});

test("a failed autosave is shown as unsaved, not as a host-saved draft", async () => {
  const api: AnswerApi = {
    async settings() { return { model: { provider: "example", id: "small" }, models: [] }; }, async configure() {},
    async open() { return { status: "ready", draft }; }, async resume() { return { status: "ready", draft }; },
    async save() { throw new Error("Draft changed on another device; reload."); }, async submit() {},
  };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<AnswerFlow api={api} agentId="agent-1" theme={theme} compact onClose={() => {}} />); });
  await settle(); await settle();
  await act(async () => { renderer.root.findByType("TextInput" as never).props.onChangeText("Unsaved context"); });
  await settle();
  const screen = JSON.stringify(renderer.toJSON());
  expect(screen).toContain("Draft not saved");
  expect(screen).not.toContain("Draft saved on this host");
  expect(screen).toContain("Draft changed on another device");
  await act(async () => { renderer.unmount(); });
});

test("the answer form shows neither the model nor a saved-draft status", async () => {
  const api: AnswerApi = {
    async settings() { return { model: { provider: "example", id: "small" }, models: [] }; }, async configure() {},
    async open() { return { status: "ready", draft }; }, async resume() { return { status: "ready", draft }; },
    async save(_id, patch) { return { ...draft, ...patch }; }, async submit() {},
  };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<AnswerFlow api={api} agentId="agent-1" theme={theme} compact onClose={() => {}} />); });
  await settle(); await settle();
  await act(async () => { renderer.root.findByType("TextInput" as never).props.onChangeText("Saved context"); });
  await settle();
  const screen = JSON.stringify(renderer.toJSON());
  expect(screen).toContain("Which database?");
  expect(screen).not.toContain("example/small");
  expect(screen).not.toContain("Change model");
  expect(screen).not.toMatch(/Saving|saved on this host/);
  await act(async () => { renderer.unmount(); });
});

test("the configured host model can be changed explicitly through a searchable picker in settings", async () => {
  let model: ModelSelection = { provider: "example", id: "large" };
  const api: AnswerApi = {
    async settings() { return { model, models: [{ provider: "example", id: "large", name: "Large" }, { provider: "example", id: "small", name: "Small" }] }; },
    async configure(selection) { model = selection; }, async open() { return { status: "ready", draft }; }, async resume() { return { status: "ready", draft }; },
    async save(_id, patch) { return { ...draft, ...patch }; }, async submit() {},
  };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<IsolatedQueries><ModelPicker api={api} theme={theme} /></IsolatedQueries>); });
  await settle();
  expect(JSON.stringify(renderer.toJSON())).toContain("Current: example/large");
  const press = async (label: string) => { await act(async () => { const button = renderer.root.findAllByType("Pressable" as never).find(node => node.props.accessibilityLabel === label); if (!button) throw new Error(`No button: ${label}`); button.props.onPress(); }); };
  await act(async () => { renderer.root.findByType("TextInput" as never).props.onChangeText("small"); });
  expect(JSON.stringify(renderer.toJSON())).not.toContain("Choose example/large");
  await press("Choose example/small");
  await settle();
  expect(model.id).toBe("small");
  await act(async () => { renderer.unmount(); });
});

test("a newer user input clears the open form without automatically calling the extraction model", async () => {
  let obsolete = false;
  const api: AnswerApi = {
    async settings() { return { model: { provider: "example", id: "small" }, models: [] }; }, async configure() {},
    async open() { if (obsolete) throw new Error("Must not extract automatically"); return { status: "ready", draft }; },
    async resume() { return obsolete ? { status: "empty", draft: null } : { status: "ready", draft }; },
    async save(_id, patch) { return { ...draft, ...patch }; }, async submit() {},
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<QueryClientProvider client={queryClient}><AnswerFlow api={api} agentId="agent-1" theme={theme} compact onClose={() => {}} /></QueryClientProvider>); });
  await settle(); await settle();
  obsolete = true;
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2150)); });
  await settle();
  expect(JSON.stringify(renderer.toJSON())).not.toContain("Which database?");
  expect(JSON.stringify(renderer.toJSON())).toContain("discarded");
  await act(async () => { renderer.unmount(); }); queryClient.clear();
});

test("Send waits for the review draft to save and closes only after acceptance", async () => {
  let stored = structuredClone(draft);
  let submitted = false;
  let closed = false;
  let revision = 1;
  const api: AnswerApi = {
    async settings() { return { model: { provider: "example", id: "small" }, models: [] }; },
    async configure() {},
    async open() { return { status: "ready", draft: structuredClone(stored) }; },
    async resume() { return { status: "ready", draft: structuredClone(stored) }; },
    async save(_id, patch) {
      await new Promise(resolve => setTimeout(resolve, 10));
      stored = { ...stored, ...patch, revision: `revision-${++revision}` };
      return structuredClone(stored);
    },
    async submit(_id, _source, rev) {
      if (!stored.review || stored.revision !== rev) throw new Error("Review was not saved");
      submitted = true;
    },
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<QueryClientProvider client={queryClient}><AnswerFlow api={api} agentId="agent-1" theme={theme} compact onClose={() => { closed = true; }} /></QueryClientProvider>); });
  await settle(); await settle();
  const press = async (label: string) => { await act(async () => { renderer.root.findAllByType("Pressable" as never).find(node => node.props.accessibilityLabel === label)!.props.onPress(); }); };
  await press("Review answers");
  expect(submitted).toBe(false);
  await press("Send answers");
  await settle(); await settle();
  expect(submitted).toBe(true);
  expect(closed).toBe(true);
  await act(async () => { renderer.unmount(); }); queryClient.clear();
});

test("rapid text edits autosave in order and survive closing the form", async () => {
  let stored = structuredClone(draft);
  let revision = 1;
  const api: AnswerApi = {
    async settings() { return { model: { provider: "example", id: "small" }, models: [] }; },
    async configure() {},
    async open() { return { status: "ready", draft: structuredClone(stored) }; },
    async resume() { return { status: "ready", draft: structuredClone(stored) }; },
    async save(_id, patch) {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (patch.revision !== stored.revision) throw new Error("Stale device revision");
      stored = { ...stored, ...patch, revision: `revision-${++revision}` };
      return structuredClone(stored);
    },
    async submit() {},
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<QueryClientProvider client={queryClient}><AnswerFlow api={api} agentId="agent-1" theme={theme} compact onClose={() => {}} /></QueryClientProvider>); });
  await settle(); await settle();
  await act(async () => {
    const input = renderer.root.findByType("TextInput" as never);
    input.props.onChangeText("S"); input.props.onChangeText("SQL"); input.props.onChangeText("SQLite with backups");
  });
  await act(async () => { renderer.unmount(); });
  await settle(); await settle();
  expect(stored.answers[0].text).toBe("SQLite with backups");
  queryClient.clear();
});

test("first use requires an explicit model choice before the answer form opens", async () => {
  let model: ModelSelection | null = null;
  const api: AnswerApi = {
    async settings() { return { model, models: [{ provider: "example", id: "small", name: "Small" }] }; },
    async configure(selection) { model = selection; },
    async open() { if (!model) throw new Error("No model configured"); return { status: "ready", draft }; },
    async resume() { return { status: "ready", draft }; },
    async save(_id, patch) { return { ...draft, ...patch }; },
    async submit() {},
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<QueryClientProvider client={queryClient}><AnswerFlow api={api} agentId="agent-1" theme={theme} compact onClose={() => {}} /></QueryClientProvider>); });
  await settle();
  expect(model).toBeNull();
  expect(JSON.stringify(renderer.toJSON())).toContain("Select an extraction model");
  const button = renderer.root.findAllByType("Pressable" as never).find(node => node.props.accessibilityLabel === "Choose example/small")!;
  await act(async () => { button.props.onPress(); });
  await settle();
  await settle();
  expect(model).toEqual({ provider: "example", id: "small" });
  expect(JSON.stringify(renderer.toJSON())).toContain("Which database?");
  await act(async () => { renderer.unmount(); });
  queryClient.clear();
});
