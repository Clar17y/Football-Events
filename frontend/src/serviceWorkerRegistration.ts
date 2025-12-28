export function registerSW() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');

      const requestSkipWaiting = (worker: ServiceWorker) => {
        worker.postMessage({ type: 'SKIP_WAITING' });
      };

      if (registration.waiting) requestSkipWaiting(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            requestSkipWaiting(newWorker);
          }
        });
      });

      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) {
          hadController = true;
          return;
        }
        window.location.reload();
      });

      registration.update().catch(() => { });
    } catch (error) {
      console.warn('[sw] registration failed', error);
    }
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', () => {
      register();
    });
  }
}
