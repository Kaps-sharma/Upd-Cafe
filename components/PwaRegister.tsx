'use client';

import { useEffect } from 'react';

/** Registers the service worker that makes the app installable. */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && window.location.hostname !== 'localhost') return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installation is a bonus, never a requirement for ordering.
    });
  }, []);

  return null;
}
