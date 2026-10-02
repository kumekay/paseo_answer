import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, test, vi } from "vitest";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Draft } from "../shared/types";
import { QuestionForm } from "../client/form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const theme = { colors: { foreground: "#eee", foregroundMuted: "#aaa", surface0: "#111", surface1: "#222", accent: "#88f", accentForeground: "#111", border: "#333" } } as unknown as PluginTheme;
const draft: Draft = { sourceId: "user-1", revision: "revision-1", index: 0, review: false,
  questions: [
    { question: "Which database?", context: "", mode: "single", options: ["SQLite", "PostgreSQL"] },
    { question: "Which features?", context: "Choose several", mode: "multiple", options: ["Search", "Export"] },
    { question: "Any constraints?", context: "", mode: "text", options: [] },
  ], answers: Array.from({ length: 3 }, () => ({ selected: [], text: "", skipped: false })),
};

async function setup(compact = true) {
  let value: Draft = structuredClone(draft);
  let sent: Draft | undefined;
  function Harness() {
    const [state, setState] = useState(value);
    return <QuestionForm draft={state} theme={theme} compact={compact} busy={false}
      onChange={next => { value = next; setState(next); }} onSubmit={() => { sent = value; }} />;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Harness />); });
  return { renderer, value: () => value, sent: () => sent,
    async press(label: string) {
      const button = renderer.root.findAllByType("Pressable" as never).find(node => node.props.accessibilityLabel === label);
      if (!button) throw new Error(`No button: ${label}`);
      await act(async () => { button.props.onPress(); });
    },
    async text(text: string) { await act(async () => { renderer.root.findByType("TextInput" as never).props.onChangeText(text); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test.each([true, false])("compact=%s: skipping leads to review and only the explicit Send button submits", async (compact) => {
  const ui = await setup(compact);
  await ui.press("Skip");
  await ui.press("Search");
  await ui.press("Next");
  await ui.text("Keep costs low");
  await ui.press("Review answers");
  expect(ui.sent()).toBeUndefined();
  expect(ui.value().review).toBe(true);
  expect(JSON.stringify(ui.renderer.toJSON())).toContain("(skipped)");
  await ui.press("Send answers");
  expect(ui.sent()?.answers).toEqual([
    { selected: [], text: "", skipped: true },
    { selected: [0], text: "", skipped: false },
    { selected: [], text: "Keep costs low", skipped: false },
  ]);
  await ui.close();
});

test("navigation preserves answers and multi-select permits several choices", async () => {
  const ui = await setup();
  await ui.text("Existing database");
  await ui.press("Next");
  await ui.press("Search");
  await ui.press("Export");
  expect(ui.value().answers[1].selected).toEqual([0, 1]);
  await ui.press("Previous");
  expect(ui.renderer.root.findByType("TextInput" as never).props.value).toBe("Existing database");
  await ui.close();
});

test("single-choice questions allow changing the selection and adding free text", async () => {
  const ui = await setup();
  await ui.press("SQLite");
  await ui.press("PostgreSQL");
  await ui.text("Use the existing server");
  expect(ui.value().answers[0]).toEqual({ selected: [1], text: "Use the existing server", skipped: false });
  await ui.close();
});

function keyEvent(key: string, modifiers: { ctrlKey?: boolean } = {}) {
  return { key, ...modifiers, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}
const focusable = (ui: Awaited<ReturnType<typeof setup>>) =>
  ui.renderer.root.findAll(node => node.type === ("Pressable" as never) || node.type === ("TextInput" as never)).map(node => node.props.accessibilityLabel as string);

test("Tab order runs through the options, the text field, then straight to the forward action", async () => {
  const ui = await setup();
  expect(focusable(ui).slice(0, 4)).toEqual(["SQLite", "PostgreSQL", "Your answer or additional details", "Next"]);
  await ui.press("Next"); await ui.press("Next");
  expect(focusable(ui)[1]).toBe("Review answers");
  await ui.close();
});

test("Space selects the focused option", async () => {
  const ui = await setup();
  const event = keyEvent(" ");
  await act(async () => { ui.renderer.root.findAllByType("Pressable" as never).find(node => node.props.accessibilityLabel === "PostgreSQL")!.props.onKeyDown(event); });
  expect(event.preventDefault).toHaveBeenCalled();
  expect(ui.value().answers[0].selected).toEqual([1]);
  await ui.close();
});

test("Ctrl+Enter moves to the next question, then review, then sends", async () => {
  const ui = await setup();
  const ctrlEnter = async () => { await act(async () => { ui.renderer.root.find(node => !!node.props.onKeyDownCapture).props.onKeyDownCapture(keyEvent("Enter", { ctrlKey: true })); }); };
  await ui.text("Existing database");
  await ctrlEnter();
  expect(ui.value().index).toBe(1);
  await ctrlEnter(); await ctrlEnter();
  expect(ui.value().review).toBe(true);
  expect(ui.sent()).toBeUndefined();
  await ctrlEnter();
  expect(ui.sent()?.answers[0].text).toBe("Existing database");
  await ui.close();
});

test("each question starts focused on its first option, and review on Send", async () => {
  const focused: string[] = [];
  let value: Draft = structuredClone(draft);
  function Harness() {
    const [state, setState] = useState(value);
    return <QuestionForm draft={state} theme={theme} compact={false} busy={false} onChange={next => { value = next; setState(next); }} onSubmit={() => {}} />;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Harness />, { createNodeMock: element => {
    const { accessibilityLabel } = element.props as { accessibilityLabel: string };
    return { focus: () => focused.push(accessibilityLabel) };
  } }); });
  const press = async (label: string) => { await act(async () => { renderer.root.findAllByType("Pressable" as never).find(node => node.props.accessibilityLabel === label)!.props.onPress(); }); };
  await press("Next");
  await press("Next");
  await press("Review answers");
  // Node mocks are created once per element: the first-option slot keeps its initial label.
  expect(focused).toEqual(["SQLite", "SQLite", "Your answer or additional details", "Send answers"]);
  await act(async () => { renderer.unmount(); });
});
