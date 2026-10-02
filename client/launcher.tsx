import { useSyncExternalStore } from "react";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { View, type ViewProps } from "react-native";
import { useAnswerApi } from "./api";
import { AnswerFlow } from "./flow";

// A custom composer icon is a mounted client contribution. The modal is host-owned
// and portals outside the icon slot, so /answer and the button open the same UI.
// React still bubbles the modal's clicks and Enter keys to the pill's Pressable,
// which reruns the action and swaps this icon for a spinner, unmounting the modal.
const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
const isolate = { onClick: stop, onKeyDown: stop } as ViewProps;
export function createLauncher(agentId: string) {
  let open = false;
  const listeners = new Set<() => void>();
  function setOpen(value: boolean) { open = value; for (const listener of listeners) listener(); }
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  function AnswerIcon({ theme, layout, size, color }: PluginButtonIconProps) {
    const visible = useSyncExternalStore(subscribe, () => open);
    const api = useAnswerApi();
    return <>
      <Icon name="ListChecks" size={size} color={color} />
      <View style={{ position: "absolute" }} {...isolate}>
        <Modal title="Answer questions" open={visible} onOpenChange={setOpen}>
          <Modal.Content>
            {visible && <AnswerFlow api={api} agentId={agentId} theme={theme} compact={layout.compact} onClose={() => setOpen(false)} />}
          </Modal.Content>
        </Modal>
      </View>
    </>;
  }
  return { Icon: AnswerIcon, show: () => setOpen(true), close: () => setOpen(false) };
}
