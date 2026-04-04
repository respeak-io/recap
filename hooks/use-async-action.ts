"use client";

import { useState, useCallback } from "react";

/**
 * Wraps an async function with loading state management.
 * Eliminates the repetitive setLoading(true) / try-finally { setLoading(false) } pattern.
 */
export function useAsyncAction<T>(
  action: () => Promise<T>
): { execute: () => Promise<T | undefined>; loading: boolean } {
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async () => {
    setLoading(true);
    try {
      return await action();
    } finally {
      setLoading(false);
    }
  }, [action]);

  return { execute, loading };
}
