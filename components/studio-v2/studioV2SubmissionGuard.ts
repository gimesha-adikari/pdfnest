"use client";

import { useCallback, useRef, useState } from "react";

export class StudioV2SubmissionGuard {
  private readonly active = new Set<string>();

  acquire(key: string): boolean {
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }

  release(key: string): void {
    this.active.delete(key);
  }

  isActive(key: string): boolean {
    return this.active.has(key);
  }

  keys(): string[] {
    return [...this.active];
  }

  async run<T>(key: string, operation: () => Promise<T> | T): Promise<T | undefined> {
    if (!this.acquire(key)) return undefined;
    try {
      return await operation();
    } finally {
      this.release(key);
    }
  }
}

export function useStudioV2SubmissionGuard() {
  const guardRef = useRef<StudioV2SubmissionGuard | null>(null);
  if (!guardRef.current) guardRef.current = new StudioV2SubmissionGuard();
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());

  const syncPendingState = useCallback(() => {
    setPendingKeys(new Set(guardRef.current?.keys() ?? []));
  }, []);

  const acquire = useCallback((key: string): boolean => {
    const acquired = guardRef.current?.acquire(key) ?? false;
    if (acquired) syncPendingState();
    return acquired;
  }, [syncPendingState]);

  const release = useCallback((key: string): void => {
    guardRef.current?.release(key);
    syncPendingState();
  }, [syncPendingState]);

  const run = useCallback(async <T,>(key: string, operation: () => Promise<T> | T): Promise<T | undefined> => {
    if (!acquire(key)) return undefined;
    try {
      return await operation();
    } finally {
      release(key);
    }
  }, [acquire, release]);

  return {
    acquire,
    release,
    run,
    pending: pendingKeys.size > 0,
    isPending: (key: string) => pendingKeys.has(key),
  };
}
