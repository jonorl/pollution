/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the pollution API; defaults to production when unset. */
  readonly VITE_API_URL?: string;
}
