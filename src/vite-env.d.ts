/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to `1` to enable opt-in perf logging (FPS / long tasks / slow events) */
  readonly VITE_PERF_INSTRUMENTATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
