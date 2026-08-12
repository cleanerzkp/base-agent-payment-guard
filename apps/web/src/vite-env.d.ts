/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GUARD_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
