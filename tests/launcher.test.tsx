import { expect, test, vi } from "vitest";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { createLauncher } from "../client/launcher";

vi.mock("../client/api", () => ({ useAnswerApi: () => ({}) }));
vi.mock("../client/flow", () => ({ AnswerFlow: () => null }));

// Paseo renders the pill icon inside the pill's Pressable, so React events from the
// portaled modal bubble to it. Pressing the pill again swaps the icon for a spinner,
// which unmounts the modal and the draft with it.
test("events inside the open modal do not reach the composer pill", () => {
  const launcher = createLauncher("agent-1");
  const props = { theme: { colors: {} }, layout: { compact: false }, size: 14, color: "gray" } as unknown as PluginButtonIconProps;
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<launcher.Icon {...props} />); });
  act(() => launcher.show());
  const modal = renderer.root.findByType("Modal" as never);
  let boundary: ReactTestInstance | null = modal.parent;
  const reached: string[] = [];
  for (const name of ["onClick", "onKeyDown"]) {
    const event = { stopPropagation: vi.fn() };
    while (boundary && !boundary.props[name]) boundary = boundary.parent;
    boundary?.props[name](event);
    if (!event.stopPropagation.mock.calls.length) reached.push(name);
    boundary = modal.parent;
  }
  expect(reached).toEqual([]);
});
