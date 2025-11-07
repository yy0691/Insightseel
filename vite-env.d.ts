/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_PROXY?: string
  readonly VITE_MODEL?: string
  readonly VITE_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
