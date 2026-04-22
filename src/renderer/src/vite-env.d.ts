/// <reference types="vite/client" />

import type { CppxApi } from "@shared/contracts";

declare global {
  interface Window {
    cppx: CppxApi;
  }
}

export {};
