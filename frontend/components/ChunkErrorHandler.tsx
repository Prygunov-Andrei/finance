'use client';

import { useEffect } from 'react';

const RELOAD_FLAG = 'chunk-error-reloaded';

export function ChunkErrorHandler() {
  useEffect(() => {
    const isChunkError = (message: string) =>
      /ChunkLoadError|Loading chunk .* failed|Failed to load chunk/i.test(message);

    const reloadOnce = () => {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkError(event.message || '') || isChunkError(String(event.error))) {
        reloadOnce();
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        (reason && (reason.message || reason.name || String(reason))) || '';
      if (isChunkError(message)) {
        reloadOnce();
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    const onLoad = () => {
      sessionStorage.removeItem(RELOAD_FLAG);
    };
    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad, { once: true });
    }

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
