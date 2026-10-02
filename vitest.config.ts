import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@getpaseo/plugin/client/react-native": fileURLToPath(new URL("./tests/native.tsx", import.meta.url)),
    "react-native": fileURLToPath(new URL("./tests/native.tsx", import.meta.url)),
  } },
  test: { environment: "node", setupFiles: ["./tests/environment.ts"] },
});
