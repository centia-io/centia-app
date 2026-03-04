/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CENTIA_HOST: string;
  readonly VITE_CENTIA_CLIENT_ID: string;
  readonly VITE_CLIENT_FIRST_ENABLED?: string;
  readonly VITE_CLIENT_FIRST_PERSIST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
