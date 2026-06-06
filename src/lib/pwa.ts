// Service-worker registration. vite-plugin-pwa generates the SW and a virtual
// module to register it; we register manually (injectRegister: null) so the
// registration scope is explicit and tied to the app's base path.
import { registerSW } from 'virtual:pwa-register';

export function initPWA(): void {
  // `autoUpdate` strategy: the new SW activates and the next navigation uses
  // fresh assets. For v1 we update silently; a "new version" prompt can come
  // later if needed.
  registerSW({
    immediate: true,
    onRegisteredSW(swUrl) {
      // The plugin registers with `scope` derived from Vite `base`.
      if (import.meta.env.DEV) console.debug('[pwa] SW registered:', swUrl);
    },
    onOfflineReady() {
      if (import.meta.env.DEV) console.debug('[pwa] offline ready');
    },
  });
}
