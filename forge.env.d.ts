declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const BUILD_CHANNEL: string;

interface ImportMetaEnv {
  readonly VITE_BUILD_CHANNEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
