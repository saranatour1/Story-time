import { createStart } from "@tanstack/react-start";

// SSR is off app-wide; only Preview routes opt in with `ssr: true`.
export const startInstance = createStart(() => ({ defaultSsr: false }));
