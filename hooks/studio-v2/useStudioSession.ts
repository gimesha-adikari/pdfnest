"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  studioV2Api,
  StudioSessionDTO,
  StudioDocumentDTO,
  StudioVersionDTO,
  StudioOperationDTO,
  StudioVDMDTO,
  StudioCommand,
  ApplyOperationResponse,
  CreateSessionRequest,
  StudioApiError,
  StudioMaterializationRequest,
  StudioMaterializationResponse,
} from "@/lib/studio-v2/api";

export type SyncStatus = "loading" | "saved" | "saving" | "error";
export type HistoryStatus = "idle" | "loading" | "ready" | "error";
export type StudioSessionLifecycle =
  | "entry"
  | "creating"
  | "loading"
  | "ready"
  | "not_found"
  | "error";

export interface UseStudioSessionState {
  session: StudioSessionDTO | null;
  document: StudioDocumentDTO | null;
  activeVersion: StudioVersionDTO | null;
  vdm: StudioVDMDTO | null;
  history: StudioVersionDTO[];
  operations: StudioOperationDTO[];
  syncStatus: SyncStatus;
  historyStatus: HistoryStatus;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

export function useStudioSession(initialSessionId?: string | null) {
  const [session, setSession] = useState<StudioSessionDTO | null>(null);
  const [document, setDocument] = useState<StudioDocumentDTO | null>(null);
  const [activeVersion, setActiveVersion] = useState<StudioVersionDTO | null>(null);
  const [vdm, setVdm] = useState<StudioVDMDTO | null>(null);
  const [history, setHistory] = useState<StudioVersionDTO[]>([]);
  const [operations, setOperations] = useState<StudioOperationDTO[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    initialSessionId ? "loading" : "saved"
  );
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<StudioSessionLifecycle>(
    initialSessionId ? "loading" : "entry"
  );

  const isMountedRef = useRef<boolean>(true);
  const currentRequestIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshHistory = useCallback(async (sessionId: string) => {
    if (!isMountedRef.current) return;
    setHistoryStatus("loading");
    try {
      const histData = await studioV2Api.getHistory(sessionId);
      if (isMountedRef.current) {
        setHistory(histData.versions || []);
        setOperations(histData.operations || []);
        setHistoryStatus("ready");
      }
    } catch {
      if (isMountedRef.current) {
        setHistoryStatus("error");
      }
    }
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      const requestId = ++currentRequestIdRef.current;
      setSyncStatus("loading");
      setLifecycle("loading");
      setError(null);
      try {
        const data = await studioV2Api.getSession(sessionId);
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          setSession(data.session);
          setDocument(data.document);
          setActiveVersion(data.active_version);
          setVdm(data.vdm);
          setSyncStatus("saved");
          setLifecycle("ready");
        }
        await refreshHistory(sessionId);
      } catch (err: unknown) {
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          const msg =
            err instanceof Error ? err.message : "Failed to load studio session";
          setError(msg);
          setSyncStatus("error");
          setLifecycle(
            err instanceof StudioApiError && err.status === 404
              ? "not_found"
              : "error"
          );
        }
      }
    },
    [refreshHistory]
  );

  const initSession = useCallback(
    async (req: CreateSessionRequest) => {
      const requestId = ++currentRequestIdRef.current;
      setSyncStatus("loading");
      setLifecycle("creating");
      setError(null);
      try {
        const data = await studioV2Api.createSession(req);
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          setSession(data.session);
          setDocument(data.document);
          setActiveVersion(data.active_version);
          setVdm(data.vdm);
          setSyncStatus("saved");
          setLifecycle("ready");

          // Sync session ID to URL without page reload to prevent duplicate sessions on refresh
          if (typeof window !== "undefined" && window.history?.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.set("session_id", data.session.id);
            window.history.replaceState(null, "", url.toString());
          }
        }
        await refreshHistory(data.session.id);
        return data;
      } catch (err: unknown) {
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to initialize studio session";
          setError(msg);
          setSyncStatus("error");
          setLifecycle("error");
        }
        throw err;
      }
    },
    [refreshHistory]
  );

  const createSessionFromUpload = useCallback(
    async (file: File) => {
      const requestId = ++currentRequestIdRef.current;
      setSyncStatus("loading");
      setLifecycle("creating");
      setError(null);
      try {
        const data = await studioV2Api.createSessionFromUpload(file);
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          setSession(data.session);
          setDocument(data.document);
          setActiveVersion(data.active_version);
          setVdm(data.vdm);
          setSyncStatus("saved");
          setLifecycle("ready");
          if (typeof window !== "undefined" && window.history?.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.set("session_id", data.session.id);
            window.history.replaceState(null, "", url.toString());
          }
        }
        await refreshHistory(data.session.id);
        return data;
      } catch (err: unknown) {
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to create Studio document from the uploaded PDF"
          );
          setSyncStatus("error");
          setLifecycle("error");
        }
        throw err;
      }
    },
    [refreshHistory]
  );

  const enterStudio = useCallback(() => {
    currentRequestIdRef.current += 1;
    setSession(null);
    setDocument(null);
    setActiveVersion(null);
    setVdm(null);
    setHistory([]);
    setOperations([]);
    setHistoryStatus("idle");
    setSyncStatus("saved");
    setError(null);
    setLifecycle("entry");
    if (typeof window !== "undefined" && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("session_id");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const undo = useCallback(async () => {
    if (!session || !activeVersion?.parent_version_id || syncStatus === "saving") return;
    setSyncStatus("saving");
    setError(null);
    try {
      const res = await studioV2Api.undo(session.id);
      if (isMountedRef.current) {
        setActiveVersion(res.version);
        setVdm(res.vdm);
        setSyncStatus("saved");
      }
      await refreshHistory(session.id);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Undo failed");
        setSyncStatus("error");
      }
    }
  }, [session, activeVersion, syncStatus, refreshHistory]);

  const redo = useCallback(async () => {
    if (!session || !activeVersion?.preferred_child_id || syncStatus === "saving") return;
    setSyncStatus("saving");
    setError(null);
    try {
      const res = await studioV2Api.redo(session.id);
      if (isMountedRef.current) {
        setActiveVersion(res.version);
        setVdm(res.vdm);
        setSyncStatus("saved");
      }
      await refreshHistory(session.id);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Redo failed");
        setSyncStatus("error");
      }
    }
  }, [session, activeVersion, syncStatus, refreshHistory]);

  const checkout = useCallback(
    async (versionId: string) => {
      if (!session || syncStatus === "saving") return;
      setSyncStatus("saving");
      setError(null);
      try {
        const res = await studioV2Api.checkout(session.id, versionId);
        if (isMountedRef.current) {
          setActiveVersion(res.version);
          setVdm(res.vdm);
          setSyncStatus("saved");
        }
        await refreshHistory(session.id);
      } catch (err: unknown) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : "Version checkout failed");
          setSyncStatus("error");
        }
      }
    },
    [session, syncStatus, refreshHistory]
  );

  const executeCommand = useCallback(
    async (command: StudioCommand): Promise<ApplyOperationResponse | null> => {
      if (!session || !activeVersion || syncStatus === "saving") return null;
      setSyncStatus("saving");
      setError(null);
      try {
        const res = await studioV2Api.executeCommand(session.id, command);
        if (isMountedRef.current) {
          setActiveVersion(res.version);
          setVdm(res.vdm);
          setSyncStatus("saved");
        }
        await refreshHistory(session.id);
        return res;
      } catch (err: unknown) {
        if (isMountedRef.current) {
          if (err instanceof StudioApiError && err.status === 409) {
            await loadSession(session.id);
            setError("Studio changed in another window. Refresh complete; please retry.");
          } else {
            setError(err instanceof Error ? err.message : "Studio command failed");
          }
          setSyncStatus("error");
        }
        throw err;
      }
    },
    [session, activeVersion, syncStatus, refreshHistory, loadSession]
  );

  const materialize = useCallback(
    async (request: StudioMaterializationRequest): Promise<StudioMaterializationResponse | null> => {
      if (!session || !activeVersion || syncStatus === "saving") return null;
      setSyncStatus("saving");
      setError(null);
      try {
        const res = await studioV2Api.materialize(session.id, request);
        if (isMountedRef.current) {
          setActiveVersion(res.version);
          setVdm(res.vdm);
          setSyncStatus("saved");
        }
        await refreshHistory(session.id);
        return res;
      } catch (err: unknown) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : "Studio materialization failed");
          setSyncStatus("error");
        }
        throw err;
      }
    },
    [session, activeVersion, syncStatus, refreshHistory]
  );

  useEffect(() => {
    if (initialSessionId) {
      loadSession(initialSessionId);
    } else {
      enterStudio();
    }
  }, [initialSessionId, loadSession, enterStudio]);

  const canUndo = Boolean(
    activeVersion?.parent_version_id &&
      activeVersion.parent_version_id !== "00000000-0000-0000-0000-000000000000"
  );
  const canRedo = Boolean(
    activeVersion?.preferred_child_id &&
      activeVersion.preferred_child_id !== "00000000-0000-0000-0000-000000000000"
  );

  return {
    session,
    document,
    activeVersion,
    vdm,
    history,
    operations,
    syncStatus,
    lifecycle,
    historyStatus,
    isLoading: lifecycle === "loading" || lifecycle === "creating",
    isSaving: syncStatus === "saving",
    error,
    canUndo,
    canRedo,
    loadSession,
    initSession,
    createSessionFromUpload,
    enterStudio,
    undo,
    redo,
    checkout,
    executeCommand,
    materialize,
    refetch: () => session && loadSession(session.id),
  };
}
