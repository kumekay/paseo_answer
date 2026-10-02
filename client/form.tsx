import { useEffect, useRef, type Ref } from "react";
import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { Platform, Pressable, Text, View, type TextInput as NativeTextInput, type ViewProps } from "react-native";
import { answerText } from "../shared/format";
import type { Answer, Draft } from "../shared/types";

export interface QuestionFormProps {
  draft: Draft;
  theme: PluginTheme;
  compact: boolean;
  busy: boolean;
  onChange(draft: Draft): void;
  onSubmit(): void;
}
interface Key { key: string; ctrlKey?: boolean; metaKey?: boolean; preventDefault(): void; stopPropagation(): void }
export function QuestionForm({ draft, theme, compact, busy, onChange, onSubmit }: QuestionFormProps) {
  const question = draft.questions[draft.index];
  const answer = draft.answers[draft.index];
  const last = draft.index === draft.questions.length - 1;
  const colors = theme.colors;
  const firstOption = useRef<View>(null);
  const input = useRef<NativeTextInput>(null);
  const send = useRef<View>(null);
  // Keyboard flow on web: each step starts on its first choice, or on Send when reviewing.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    (draft.review ? send.current : firstOption.current ?? (compact ? null : input.current))?.focus();
  }, [draft.index, draft.review]);
  function update(patch: Partial<Answer>) {
    const answers = [...draft.answers];
    answers[draft.index] = { ...answer, ...patch, skipped: false };
    onChange({ ...draft, answers });
  }
  function toggle(index: number) {
    update({ selected: question.mode === "multiple" ? (answer.selected.includes(index) ? answer.selected.filter(i => i !== index) : [...answer.selected, index].sort((a, b) => a - b)) : (answer.selected.includes(index) ? [] : [index]) });
  }
  function forward() {
    if (draft.review) onSubmit();
    else if (last) onChange({ ...draft, review: true });
    else onChange({ ...draft, index: draft.index + 1 });
  }
  // Capture runs before a focused option's own Enter handling, so Ctrl+Enter never also toggles it.
  const shortcuts = { onKeyDownCapture(event: Key) {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!busy) forward();
  } } as ViewProps;
  const focusStyle = (state: object) => (state as { focused?: boolean }).focused ? { backgroundColor: colors.surface2 } : null;
  function button(label: string, action: () => void, disabled = busy, ref?: Ref<View>) {
    return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={action} style={state => [{ minHeight: 48, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }, focusStyle(state)]}>
      <Text style={{ color: colors.foreground, textAlign: "center" }}>{label}</Text>
    </Pressable>;
  }
  if (draft.review) return <View style={{ gap: 16 }} {...shortcuts}>
    <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "600" }}>Review your answers</Text>
    {draft.questions.map((item, index) => <View key={index} style={{ padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
      <Text selectable style={{ color: colors.foreground, fontWeight: "600" }}>{index + 1}. {item.question}</Text>
      <Text selectable style={{ color: colors.foregroundMuted }}>{answerText(draft, index)}</Text>
      {button(`Edit answer ${index + 1}`, () => onChange({ ...draft, index, review: false }))}
    </View>)}
    {button("Back to answers", () => onChange({ ...draft, review: false }))}
    {button("Send answers", onSubmit, busy, send)}
  </View>;
  return <View style={{ gap: 12 }} {...shortcuts}>
    <Text style={{ color: colors.foregroundMuted }}>Question {draft.index + 1} of {draft.questions.length}</Text>
    <Text selectable style={{ color: colors.foreground, fontSize: compact ? 20 : 22, fontWeight: "600" }}>{question.question}</Text>
    {!!question.context && <Text selectable style={{ color: colors.foregroundMuted }}>{question.context}</Text>}
    {question.options.map((option, index) => <Pressable key={index} ref={index === 0 ? firstOption : undefined}
      accessibilityRole={question.mode === "multiple" ? "checkbox" : "radio"} accessibilityLabel={option}
      accessibilityState={{ checked: answer.selected.includes(index), disabled: busy }} disabled={busy}
      onPress={() => toggle(index)}
      {...{ onKeyDown(event: Key) { if (event.key === " " && !busy) { event.preventDefault(); toggle(index); } } } as ViewProps}
      style={state => [{ minHeight: 48, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: answer.selected.includes(index) ? colors.accent : colors.border }, focusStyle(state)]}>
      <Text style={{ color: colors.foreground }}>{answer.selected.includes(index) ? "● " : "○ "}{option}</Text>
    </Pressable>)}
    <TextInput ref={input} accessibilityLabel="Your answer or additional details" multiline editable={!busy} value={answer.text}
      placeholder="Your answer or additional details…" placeholderTextColor={colors.foregroundMuted}
      onChangeText={text => update({ text })}
      style={{ color: colors.foreground, backgroundColor: colors.surface1, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 112, textAlignVertical: "top" }} />
    {answer.skipped && <Text style={{ color: colors.foregroundMuted }}>Skipped — choose an option or type to answer instead.</Text>}
    {button(last ? "Review answers" : "Next", forward)}
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={{ flex: 1 }}>{button("Previous", () => onChange({ ...draft, index: draft.index - 1 }), busy || draft.index === 0)}</View>
      <View style={{ flex: 1 }}>{button("Skip", () => {
        const answers = [...draft.answers];
        answers[draft.index] = { selected: [], text: "", skipped: true };
        onChange({ ...draft, answers, index: Math.min(draft.index + 1, draft.questions.length - 1), review: last });
      })}</View>
      {!last && <View style={{ flex: 1 }}>{button("Review answers", () => onChange({ ...draft, review: true }))}</View>}
    </View>
  </View>;
}
