/**
 * ============================================================================
 * AtlasOps Incident Management Console - Connectivity Hook
 * ============================================================================
 * File: src/hooks/useConnectivity.ts
 * React 18 useSyncExternalStore subscription listening to browser online
 * and offline window events for tear-free concurrent rendering.
 */

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getServerSnapshot(): boolean {
  return true; // SSR fallback
}

export function useConnectivity(): { isOnline: boolean } {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { isOnline };
}

export default useConnectivity;
