// The renderer substitutes only external native/host UI primitives.
import { createElement, type ReactNode } from "react";
const primitive = (name: string) => (props: Record<string, unknown> & { children?: ReactNode }) => createElement(name, props, props.children);
export const View = primitive("View");
export const Text = primitive("Text");
export const Pressable = primitive("Pressable");
export const TextInput = primitive("TextInput");
export const ScrollView = primitive("ScrollView");
export const Icon = primitive("Icon");
export const Modal = Object.assign(primitive("Modal"), { Content: primitive("ModalContent") });
export const Platform = { OS: "web" };
