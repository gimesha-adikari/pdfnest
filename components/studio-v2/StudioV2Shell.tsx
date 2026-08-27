"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudioV2Header } from "./StudioV2Header";
import { StudioV2Workspace } from "./StudioV2Workspace";
import { StudioV2CommandPalette } from "./StudioV2CommandPalette";
import { StudioV2MobileNav } from "./StudioV2MobileNav";
import { StudioV2BottomSheet } from "./StudioV2BottomSheet";
import { StudioV2Entry } from "./StudioV2Entry";
import { StudioV2EditWorkspace } from "./StudioV2EditWorkspace";
import { useStudioSession } from "@/hooks/studio-v2/useStudioSession";
import {
  DocumentInfo,
  HistoryItem,
  InspectorTab,
  ToolCategory,
} from "./types";
import {
  studioV2Api,
  StudioCommand,
  StudioCompressionLevel,
  StudioMaterializationRequest,
  StudioPageNumberingParameters,
  StudioSignatureOverlayParameters,
  StudioUpdateSignatureOverlayParameters,
  StudioTextOverlayParameters,
  StudioUpdateTextOverlayParameters,
  StudioWatermarkParameters,
  StudioJobDTO,
  StudioMarkupAction,
  StudioMarkupBox,
  StudioMarkupMode,
  StudioMarkupAnalysis,
  StudioRedactionBoxPayload,
} from "@/lib/studio-v2/api";
import { StudioV2CanonicalCropBox, getStudioV2TextOverlaySize } from "./StudioV2Geometry";
import { StudioV2OverlayDraft, StudioV2RedactionDraftBox } from "./types";
import { studioV2RedactionBoxToPayload } from "./StudioV2Redaction";
import {
  commitStudioV2MarkupEdit,
  createStudioV2MarkupHistory,
  getMarkupShortcutAction,
  isMarkupShortcutEditableTarget,
  markupBoxesEqual,
  redoStudioV2Markup,
  undoStudioV2Markup,
} from "./StudioV2MarkupHistory";
import { AlertTriangle, Loader2, RefreshCw, Upload } from "lucide-react";
import { parseStudioPageSelection } from "./studioV2PageSelection";
import {
  createStudioCompressState,
  studioCompressionMetricsFromResponse,
  type StudioCompressState,
} from "./studioV2Compress";
import { useStudioV2SubmissionGuard } from "./studioV2SubmissionGuard";
import { StudioV2ConfirmDialog, StudioV2Dialog } from "./StudioV2Dialog";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "Just now";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    return `${Math.floor(diffSec / 3600)} hours ago`;
  } catch {
    return dateStr;
  }
}

export const StudioV2Shell: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionIdParam = searchParams ? searchParams.get("session_id") : null;

  // Authoritative Backend Session Hook
  const {
    session,
    document,
    activeVersion,
    vdm,
    history: backendHistory,
    syncStatus,
    lifecycle,
    isLoading,
    isSaving,
    error,
    canUndo,
    canRedo,
    undo,
    redo,
    checkout,
    refetch,
    createSessionFromUpload,
    enterStudio,
    executeCommand,
    materialize,
    discardSession,
  } = useStudioSession(sessionIdParam);

  // Local Ephemeral UI State
  const [activeTool, setActiveTool] = useState<ToolCategory>("edit");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [zoomScale, setZoomScale] = useState<number>(0.9);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isMaterializing, setIsMaterializing] = useState(false);
  const [materializationError, setMaterializationError] = useState<string | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<StudioCompressionLevel>("medium");
  const [compressState, setCompressState] = useState<StudioCompressState>(() => createStudioCompressState());
  const [markupAction, setMarkupAction] = useState<StudioMarkupAction>("highlight");
  // Preserve the established Studio rectangle behavior until a user opts into
  // text-aware Smart or explicit OCR mode.
  const [markupMode, setMarkupMode] = useState<StudioMarkupMode>("manual");
  const [markupColor, setMarkupColor] = useState("#FFFF00");
  const [markupBoxes, setMarkupBoxes] = useState<StudioMarkupBox[]>([]);
  const [markupHistory, setMarkupHistory] = useState(() => createStudioV2MarkupHistory());
  const markupBoxesRef = useRef<StudioMarkupBox[]>([]);
  const markupInteractionStartRef = useRef<StudioMarkupBox[] | null>(null);
  const [markupJob, setMarkupJob] = useState<StudioJobDTO | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [markupError, setMarkupError] = useState<string | null>(null);
  const [markupAnalysis, setMarkupAnalysis] = useState<StudioMarkupAnalysis | null>(null);
  const [markupAnalysisLoading, setMarkupAnalysisLoading] = useState(false);
  const [markupAnalysisError, setMarkupAnalysisError] = useState<string | null>(null);
  const [redactionMode, setRedactionMode] = useState<"text" | "area">("text");
  const [redactionBoxes, setRedactionBoxes] = useState<StudioV2RedactionDraftBox[]>([]);
  const [cropDraft, setCropDraft] = useState<StudioV2CanonicalCropBox | null>(null);
  const [cropTargetMode, setCropTargetMode] = useState<"current" | "all" | "custom">("current");
  const [cropCustomPages, setCropCustomPages] = useState("");
  const [overlayDraft, setOverlayDraft] = useState<StudioV2OverlayDraft | null>(null);
  const markupSelectionIndexRef = useRef<number | null>(null);
  const submissionGuard = useStudioV2SubmissionGuard();
  const [leaveDestination, setLeaveDestination] = useState<"/" | "/dashboard/settings" | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [sessionDeleteError, setSessionDeleteError] = useState<string | null>(null);

  const guardedExecuteCommand = useCallback(async (command: StudioCommand) => {
    return (await submissionGuard.run(`command:${command.operation}`, () => executeCommand(command))) ?? null;
  }, [executeCommand, submissionGuard]);

  const markupJobIsBusy = Boolean(markupJob && !["succeeded", "failed", "cancelled"].includes(markupJob.status));
  const hasActiveOperation = isSaving || isMaterializing || markupJobIsBusy || submissionGuard.pending;

  const resetMarkupDraft = useCallback((next: StudioMarkupBox[] = []) => {
    markupInteractionStartRef.current = null;
    markupBoxesRef.current = next;
    setMarkupBoxes(next);
    setMarkupHistory(createStudioV2MarkupHistory(next));
  }, []);

  const commitMarkupEdit = useCallback((next: StudioMarkupBox[], previous = markupBoxesRef.current) => {
    setMarkupHistory((history) => {
      if (markupBoxesEqual(previous, next)) return history;
      markupBoxesRef.current = next;
      setMarkupBoxes(next);
      return commitStudioV2MarkupEdit({ ...history, present: previous }, next);
    });
  }, []);

  const undoMarkupDraft = useCallback(() => {
    setMarkupHistory((history) => {
      const next = undoStudioV2Markup(history);
      if (next === history) return history;
      markupBoxesRef.current = next.present;
      setMarkupBoxes(next.present);
      return next;
    });
  }, []);

  const redoMarkupDraft = useCallback(() => {
    setMarkupHistory((history) => {
      const next = redoStudioV2Markup(history);
      if (next === history) return history;
      markupBoxesRef.current = next.present;
      setMarkupBoxes(next.present);
      return next;
    });
  }, []);

  const newIdempotencyKey = useCallback((operation: string) => {
    const suffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `studio-v2-${operation}-${suffix}`;
  }, []);

  const selectedPage = useMemo(
    () => vdm?.pages.find((page) => page.page_id === selectedPageId) ?? null,
    [vdm, selectedPageId]
  );
  const selectedPageIndex = useMemo(
    () => (vdm && selectedPageId ? vdm.pages.findIndex((page) => page.page_id === selectedPageId) : -1),
    [vdm, selectedPageId]
  );

  const committedCrop = useMemo<StudioV2CanonicalCropBox | null>(() => {
    if (!selectedPage?.dimensions) return null;
    const existing = selectedPage.crop_box;
    return existing?.length === 4
      ? [existing[0], existing[1], existing[2], existing[3]]
      : [0, 0, selectedPage.dimensions.width, selectedPage.dimensions.height];
  }, [selectedPage]);

  const committedCropKey = committedCrop?.join(",") ?? "";
  useEffect(() => {
    setCropDraft(committedCrop);
  }, [selectedPageId, committedCropKey]);

  useEffect(() => {
    const overlay = selectedPage?.overlays.find((candidate) => candidate.id === selectedOverlayId) ?? null;
    if (!selectedPage || !overlay || (overlay.type !== "text" && overlay.type !== "signature")) {
      setOverlayDraft(null);
      return;
    }
    const x = overlay.rect?.[0] ?? 0;
    const y = overlay.rect?.[1] ?? 0;
    const fontSize = overlay.font_size ?? 24;
    const textSize = getStudioV2TextOverlaySize(overlay.text ?? "", fontSize);
    setOverlayDraft({
      pageId: selectedPage.page_id,
      overlayId: overlay.id,
      type: overlay.type,
      rect: {
        x,
        y,
        width: overlay.type === "signature" ? (overlay.rect?.[2] ?? 0) : textSize.width,
        height: overlay.type === "signature" ? (overlay.rect?.[3] ?? 0) : textSize.height,
      },
      text: overlay.text,
      fontSize,
      color: overlay.color,
      assetId: overlay.asset_id,
    });
  }, [selectedPage?.page_id, selectedOverlayId, activeVersion?.id]);

  useEffect(() => {
    if (markupSelectionIndexRef.current === null || !vdm || vdm.pages.length === 0) return;
    const index = Math.min(Math.max(markupSelectionIndexRef.current, 0), vdm.pages.length - 1);
    setSelectedPageId(vdm.pages[index].page_id);
    markupSelectionIndexRef.current = null;
  }, [vdm]);

  // Keep a single durable pointer to the in-flight job so a browser reload can
  // resume polling without inventing a second submission or version.
  useEffect(() => {
    if (!session?.id || markupJob || typeof window === "undefined") return;
    const storedJobId = window.localStorage.getItem(`studio-v2-markup-job:${session.id}`);
    if (!storedJobId) return;
    let cancelled = false;
    void studioV2Api.getJob(session.id, storedJobId).then(({ job }) => {
      if (cancelled) return;
      if (["succeeded", "failed", "cancelled"].includes(job.status)) {
        window.localStorage.removeItem(`studio-v2-markup-job:${session.id}`);
        if (job.status === "succeeded") void refetch();
      } else {
        setMarkupJob(job);
      }
    }).catch(() => {
      window.localStorage.removeItem(`studio-v2-markup-job:${session.id}`);
    });
    return () => { cancelled = true; };
  }, [session?.id, markupJob, refetch]);

  useEffect(() => {
    if (!session?.id || !markupJob?.id || !markupJobIsBusy) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const { job } = await studioV2Api.getJob(session.id, markupJob.id);
        if (cancelled) return;
        setMarkupJob(job);
        if (["succeeded", "failed", "cancelled"].includes(job.status)) {
          if (typeof window !== "undefined") window.localStorage.removeItem(`studio-v2-markup-job:${session.id}`);
          if (job.status === "succeeded") {
            resetMarkupDraft();
            setMarkupError(null);
            void refetch();
          } else if (job.status === "failed") {
            setMarkupError(job.error || "The markup worker failed. You can adjust the selection and retry.");
          }
          return;
        }
        window.setTimeout(() => { void poll(); }, 1000);
      } catch (err) {
        if (!cancelled) setMarkupError(err instanceof Error ? err.message : "Unable to poll the markup job.");
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [session?.id, markupJob?.id, markupJobIsBusy, refetch]);

  // Read-only, session-owned analysis. The browser never submits the PDF to a
  // standalone structure route and this request is made once per Studio session.
  useEffect(() => {
    if (!session?.id) return;
    let cancelled = false;
    setMarkupAnalysisLoading(true);
    setMarkupAnalysisError(null);
    void studioV2Api.getMarkupAnalysis(session.id).then((analysis) => {
      if (!cancelled) setMarkupAnalysis(analysis);
    }).catch((err) => {
      if (!cancelled) {
        setMarkupAnalysis(null);
        setMarkupAnalysisError(err instanceof Error ? err.message : "Unable to analyze the Studio document.");
      }
    }).finally(() => {
      if (!cancelled) setMarkupAnalysisLoading(false);
    });
    return () => { cancelled = true; };
  }, [session?.id]);

  useEffect(() => {
    const handleMarkupKeyboard = (event: KeyboardEvent) => {
      if (activeTool !== "annotate" || (!event.metaKey && !event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && isMarkupShortcutEditableTarget(target.tagName, target.isContentEditable)) return;
      const action = getMarkupShortcutAction(event.key, event.shiftKey);
      if (action === "redo") {
        if (!markupHistory.future.length) return;
        event.preventDefault();
        redoMarkupDraft();
      } else if (action === "undo") {
        if (!markupHistory.past.length) return;
        event.preventDefault();
        undoMarkupDraft();
      }
    };
    window.addEventListener("keydown", handleMarkupKeyboard);
    return () => window.removeEventListener("keydown", handleMarkupKeyboard);
  }, [activeTool, markupHistory.future.length, markupHistory.past.length, redoMarkupDraft, undoMarkupDraft]);

  const handleMarkupBoxChange = useCallback((box: StudioMarkupBox) => {
    const current = markupBoxesRef.current;
    const existing = current.findIndex((candidate) => candidate.id === box.id);
    const next = existing < 0
      ? [...current, box]
      : current.map((candidate, index) => index === existing ? box : candidate);
    markupBoxesRef.current = next;
    setMarkupBoxes(next);
    setMarkupError(null);
  }, []);

  const handleMarkupInteractionStart = useCallback(() => {
    markupInteractionStartRef.current = markupBoxesRef.current.map((box) => ({ ...box }));
  }, []);

  const handleMarkupInteractionEnd = useCallback(() => {
    const previous = markupInteractionStartRef.current;
    if (!previous) return;
    markupInteractionStartRef.current = null;
    commitMarkupEdit(markupBoxesRef.current, previous);
  }, [commitMarkupEdit]);

  const handleMarkupActionChange = useCallback((action: StudioMarkupAction) => {
    setMarkupAction(action);
    setMarkupColor(action === "highlight" ? "#FFFF00" : action === "underline" ? "#FF4D4D" : "#FF0000");
  }, []);

  const handleMarkupModeChange = useCallback((mode: StudioMarkupMode) => {
    if (markupBoxesRef.current.length > 0) {
      setMarkupError("Clear or apply pending regions before changing markup mode.");
      return;
    }
    setMarkupMode(mode);
    setMarkupError(null);
  }, []);

  const handleRemoveMarkupBox = useCallback((boxId: string) => {
    commitMarkupEdit(markupBoxesRef.current.filter((box) => box.id !== boxId));
  }, [commitMarkupEdit]);

  const handleClearMarkup = useCallback(() => {
    if (markupBoxesRef.current.length > 0) commitMarkupEdit([]);
  }, [commitMarkupEdit]);

  const handleRedactionBoxAdd = useCallback((box: StudioV2RedactionDraftBox) => {
    setRedactionBoxes((current) => [...current, box]);
    setMaterializationError(null);
  }, []);

  const handleRemoveRedactionBox = useCallback((boxId: string) => {
    setRedactionBoxes((current) => current.filter((box) => box.id !== boxId));
  }, []);

  const handleApplyMarkup = useCallback(async () => {
    if (!session || !activeVersion || markupBoxes.length === 0 || markupJobIsBusy) return;
    await submissionGuard.run("job:markup-apply", async () => {
      const boxes = markupBoxes.filter((box) => box.width > 2 && box.height > 2);
      if (boxes.length === 0) {
        setMarkupError("Drag a region larger than 2 points before applying markup.");
        return;
      }
      setMarkupError(null);
      markupSelectionIndexRef.current = selectedPageIndex;
      try {
        const operation = `markup_${markupAction}` as const;
        const { job } = await studioV2Api.submitJob(session.id, {
          base_version_id: activeVersion.id,
          idempotency_key: newIdempotencyKey(operation),
          operation,
          parameters: { boxes, mode: markupMode },
        });
        setMarkupJob(job);
        if (typeof window !== "undefined") window.localStorage.setItem(`studio-v2-markup-job:${session.id}`, job.id);
      } catch (err) {
        setMarkupError(err instanceof Error ? err.message : "Unable to submit markup.");
      }
    });
  }, [session, activeVersion, markupBoxes, markupJobIsBusy, selectedPageIndex, markupAction, markupMode, newIdempotencyKey, submissionGuard]);

  const handleCancelMarkupJob = useCallback(async () => {
    if (!session || !markupJob || !markupJobIsBusy) return;
    await submissionGuard.run(`job:markup-cancel:${markupJob.id}`, async () => {
      try {
        const { job } = await studioV2Api.cancelJob(session.id, markupJob.id);
        setMarkupJob(job);
        if (["cancelled", "failed", "succeeded"].includes(job.status) && typeof window !== "undefined") window.localStorage.removeItem(`studio-v2-markup-job:${session.id}`);
      } catch (err) {
        setMarkupError(err instanceof Error ? err.message : "Unable to cancel the markup job.");
      }
    });
  }, [session, markupJob, markupJobIsBusy, submissionGuard]);

  const handleCancelMarkup = useCallback(() => {
    if (!markupJobIsBusy) {
      resetMarkupDraft();
      setMarkupError(null);
    }
  }, [markupJobIsBusy, resetMarkupDraft]);

  useEffect(() => {
    if (!selectedPage || !selectedOverlayId || !selectedPage.overlays.some((overlay) => overlay.id === selectedOverlayId)) {
      setSelectedOverlayId(null);
    }
  }, [selectedPage, selectedOverlayId]);

  const handleRotate = useCallback(
    async (deltaDegrees: 90 | -90) => {
      if (!selectedPage || !activeVersion) return;
      const command: StudioCommand = {
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("rotate-page"),
        operation: "rotate_page",
        parameters: { page_ids: [selectedPage.page_id], delta_degrees: deltaDegrees },
      };
      try {
        await guardedExecuteCommand(command);
      } catch {
        // The hook exposes the authoritative error state to the shell.
      }
    },
    [selectedPage, activeVersion, newIdempotencyKey, guardedExecuteCommand]
  );

  const handleDeletePage = useCallback(async () => {
    if (!selectedPage || !activeVersion || !vdm) return;
    const selectedIndex = vdm.pages.findIndex((page) => page.page_id === selectedPage.page_id);
    const plannedNextPage = vdm.pages[selectedIndex + 1] ?? vdm.pages[selectedIndex - 1] ?? null;
    setSelectedPageId(plannedNextPage?.page_id ?? null);
    try {
      const response = await guardedExecuteCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("delete-page"),
        operation: "delete_pages",
        parameters: { page_ids: [selectedPage.page_id] },
      });
      if (response) {
        const nextPage = response.vdm.pages[selectedIndex] ?? response.vdm.pages[selectedIndex - 1] ?? null;
        setSelectedPageId(nextPage?.page_id ?? null);
      }
    } catch {
      // Keep the existing selection and authoritative VDM on failure.
      setSelectedPageId(selectedPage.page_id);
    }
  }, [selectedPage, activeVersion, vdm, guardedExecuteCommand, newIdempotencyKey]);

  const handleReorderPage = useCallback(
    async (direction: -1 | 1) => {
      if (!vdm || !selectedPage || !activeVersion) return;
      const targetIndex = selectedPageIndex + direction;
      if (selectedPageIndex < 0 || targetIndex < 0 || targetIndex >= vdm.pages.length) return;
      const pageIds = vdm.pages.map((page) => page.page_id);
      [pageIds[selectedPageIndex], pageIds[targetIndex]] = [pageIds[targetIndex], pageIds[selectedPageIndex]];
      try {
        await guardedExecuteCommand({
          base_version_id: activeVersion.id,
          idempotency_key: newIdempotencyKey("reorder-pages"),
          operation: "reorder_pages",
          parameters: { page_ids: pageIds },
        });
      } catch {
        // Keep the authoritative order and selected page on failure.
      }
    },
    [vdm, selectedPage, activeVersion, selectedPageIndex, guardedExecuteCommand, newIdempotencyKey]
  );

  const handleDuplicatePage = useCallback(async () => {
    if (!vdm || !selectedPage || !activeVersion) return;
    const existingPageIds = new Set(vdm.pages.map((page) => page.page_id));
    try {
      const response = await guardedExecuteCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("duplicate-page"),
        operation: "duplicate_pages",
        parameters: { page_ids: [selectedPage.page_id], copies: 1 },
      });
      const duplicate = response?.vdm.pages.find(
        (page) => !existingPageIds.has(page.page_id) && page.parent_page_id === selectedPage.page_id
      );
      if (duplicate) setSelectedPageId(duplicate.page_id);
    } catch {
      // Keep the source page selected when duplication fails.
    }
  }, [vdm, selectedPage, activeVersion, guardedExecuteCommand, newIdempotencyKey]);

  const handleAddBlankPage = useCallback(async () => {
    if (!vdm || !activeVersion) return;
    const existingPageIds = new Set(vdm.pages.map((page) => page.page_id));
    const position = selectedPageIndex >= 0 ? selectedPageIndex + 1 : vdm.pages.length;
    try {
      const response = await guardedExecuteCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("insert-blank-page"),
        operation: "insert_blank_pages",
        parameters: { position, count: 1 },
      });
      const blank = response?.vdm.pages.find(
        (page) => !existingPageIds.has(page.page_id) && page.is_blank
      );
      if (blank) setSelectedPageId(blank.page_id);
    } catch {
      // Keep the existing selection when blank-page insertion fails.
    }
  }, [vdm, activeVersion, selectedPageIndex, guardedExecuteCommand, newIdempotencyKey]);

  const handleCropPage = useCallback(
    async (cropBox: number[], requestedPageIds?: string[]) => {
      if (!selectedPage || !activeVersion || !vdm) return;
      let pageIds = requestedPageIds;
      if (!pageIds) {
        if (cropTargetMode === "all") pageIds = vdm.pages.map((page) => page.page_id);
        else if (cropTargetMode === "custom") {
          const pageNumbers = parseStudioPageSelection(cropCustomPages, vdm.pages.length);
          pageIds = pageNumbers.map((pageNumber) => vdm.pages[pageNumber - 1].page_id);
        } else pageIds = [selectedPage.page_id];
      }
      if (pageIds.length === 0) return;
      for (const pageId of pageIds) {
        const page = vdm.pages.find((candidate) => candidate.page_id === pageId);
        const width = page?.dimensions?.width ?? 0;
        const height = page?.dimensions?.height ?? 0;
        if (!page || cropBox.length !== 4 || cropBox[0] < 0 || cropBox[1] < 0 || cropBox[2] <= cropBox[0] || cropBox[3] <= cropBox[1] || cropBox[2] > width || cropBox[3] > height) {
          throw new Error(`Crop box does not fit target page ${page ? vdm.pages.indexOf(page) + 1 : ""}. Choose a smaller box or compatible pages.`);
        }
      }
      try {
        await guardedExecuteCommand({
          base_version_id: activeVersion.id,
          idempotency_key: newIdempotencyKey("crop-page"),
          operation: "crop_page",
          parameters: { page_ids: pageIds, crop_box: cropBox },
        });
      } catch {
        // Keep the authoritative VDM and let the hook expose the recoverable error.
      }
    },
    [selectedPage, activeVersion, vdm, cropTargetMode, cropCustomPages, guardedExecuteCommand, newIdempotencyKey]
  );

  const handleUpdateMetadata = useCallback(
    async (metadata: { title: string; author: string; subject: string; keywords: string }) => {
      if (!activeVersion) return;
      try {
        await guardedExecuteCommand({
          base_version_id: activeVersion.id,
          idempotency_key: newIdempotencyKey("update-metadata"),
          operation: "update_metadata",
          parameters: metadata,
        });
      } catch {
        // Keep the authoritative VDM and expose the recoverable error via the hook.
      }
    },
    [activeVersion, guardedExecuteCommand, newIdempotencyKey]
  );

  const handleWatermark = useCallback(
    async (parameters: StudioWatermarkParameters) => {
      if (!activeVersion || !vdm) return;
      await guardedExecuteCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("add-watermark"),
        operation: "add_watermark",
        parameters: { ...parameters, page_ids: vdm.pages.map((page) => page.page_id) },
      });
    },
    [activeVersion, guardedExecuteCommand, newIdempotencyKey, vdm]
  );

  const handlePageNumbering = useCallback(
    async (parameters: StudioPageNumberingParameters) => {
      if (!activeVersion) return;
      await guardedExecuteCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("update-page-numbering"),
        operation: "update_page_numbering",
        parameters,
      });
    },
    [activeVersion, guardedExecuteCommand, newIdempotencyKey]
  );

  const handleAddText = useCallback(async (parameters: StudioTextOverlayParameters) => {
    if (!activeVersion || !vdm) return;
    const existing = new Set(vdm.pages.find((page) => page.page_id === parameters.page_id)?.overlays.map((overlay) => overlay.id) ?? []);
    const response = await guardedExecuteCommand({
      base_version_id: activeVersion.id,
      idempotency_key: newIdempotencyKey("add-text-overlay"),
      operation: "add_text_overlay",
      parameters,
    });
    const created = response?.vdm.pages.find((page) => page.page_id === parameters.page_id)?.overlays.find((overlay) => overlay.type === "text" && !existing.has(overlay.id));
    if (created) setSelectedOverlayId(created.id);
  }, [activeVersion, vdm, guardedExecuteCommand, newIdempotencyKey]);

  const handleUpdateText = useCallback(async (parameters: StudioUpdateTextOverlayParameters) => {
    if (!activeVersion) return;
    await guardedExecuteCommand({
      base_version_id: activeVersion.id,
      idempotency_key: newIdempotencyKey("update-text-overlay"),
      operation: "update_text_overlay",
      parameters,
    });
  }, [activeVersion, guardedExecuteCommand, newIdempotencyKey]);

  const handleRemoveText = useCallback(async (target: { page_id: string; overlay_id: string }) => {
    if (!activeVersion) return;
    await guardedExecuteCommand({
      base_version_id: activeVersion.id,
      idempotency_key: newIdempotencyKey("delete-text-overlay"),
      operation: "delete_overlay",
      parameters: { targets: [target] },
    });
    setSelectedOverlayId(null);
  }, [activeVersion, guardedExecuteCommand, newIdempotencyKey]);

  const handleAddSignature = useCallback(async (blob: Blob, parameters: StudioSignatureOverlayParameters) => {
    if (!session || !activeVersion || !vdm) return;
    await submissionGuard.run(`overlay:add-signature:${parameters.page_id}`, async () => {
      const file = new File([blob], "signature.png", { type: blob.type || "image/png" });
      const uploaded = await studioV2Api.uploadSignatureAsset(session.id, file);
      const response = await guardedExecuteCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("add-signature-overlay"),
        operation: "add_signature_overlay",
        parameters: { ...parameters, asset_id: uploaded.asset.id },
      });
      const existing = new Set(vdm.pages.find((page) => page.page_id === parameters.page_id)?.overlays.map((overlay) => overlay.id) ?? []);
      const created = response?.vdm.pages.find((page) => page.page_id === parameters.page_id)?.overlays.find((overlay) => overlay.type === "signature" && !existing.has(overlay.id));
      if (created) setSelectedOverlayId(created.id);
    });
  }, [session, activeVersion, vdm, guardedExecuteCommand, newIdempotencyKey, submissionGuard]);

  const handleUpdateSignature = useCallback(async (parameters: StudioUpdateSignatureOverlayParameters) => {
    if (!activeVersion) return;
    await guardedExecuteCommand({
      base_version_id: activeVersion.id,
      idempotency_key: newIdempotencyKey("update-signature-overlay"),
      operation: "update_signature_overlay",
      parameters,
    });
  }, [activeVersion, guardedExecuteCommand, newIdempotencyKey]);

  const handleRemoveSignature = useCallback(async (target: { page_id: string; overlay_id: string }) => {
    if (!activeVersion) return;
    await guardedExecuteCommand({
      base_version_id: activeVersion.id,
      idempotency_key: newIdempotencyKey("delete-signature-overlay"),
      operation: "delete_overlay",
      parameters: { targets: [target] },
    });
    setSelectedOverlayId(null);
  }, [activeVersion, guardedExecuteCommand, newIdempotencyKey]);

  const handleOverlayCommit = useCallback(async (draft: StudioV2OverlayDraft) => {
    if (!activeVersion) return;
    try {
      if (draft.type === "text") {
        await handleUpdateText({
          page_id: draft.pageId,
          overlay_id: draft.overlayId,
          text: draft.text ?? "",
          x: draft.rect.x,
          y: draft.rect.y,
          font_size: draft.fontSize ?? 24,
          color: draft.color ?? "#000000",
        });
      } else {
        await handleUpdateSignature({
          page_id: draft.pageId,
          overlay_id: draft.overlayId,
          asset_id: draft.assetId ?? "",
          x: draft.rect.x,
          y: draft.rect.y,
          width: draft.rect.width,
          height: draft.rect.height,
        });
      }
    } catch {
      // Preserve the draft and let the existing shell error surface explain
      // stale-base or validation failures without reporting false success.
    }
  }, [activeVersion, handleUpdateSignature, handleUpdateText]);

  const watermarkTargets = useMemo(
    () => (vdm?.pages ?? []).flatMap((page) => page.overlays.filter((overlay) => overlay.type === "watermark").map((overlay) => ({ page_id: page.page_id, overlay_id: overlay.id }))),
    [vdm]
  );

  const handleRemoveWatermark = useCallback(
    async (targets: Array<{ page_id: string; overlay_id: string }>) => {
      if (!activeVersion || targets.length === 0) return;
      await guardedExecuteCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("delete-overlay"),
        operation: "delete_overlay",
        parameters: { targets },
      });
    },
    [activeVersion, guardedExecuteCommand, newIdempotencyKey]
  );

  const handleExport = useCallback(async () => {
    if (!session || !activeVersion || isSaving || isExporting) return;
    await submissionGuard.run("export", async () => {
      setIsExporting(true);
      setExportError(null);
      try {
        const result = await studioV2Api.finalizeExport(session.id);
        const href = studioV2Api.exportDownloadURL(session.id, result.export.id);
        const anchor = window.document.createElement("a");
        anchor.href = href;
        anchor.download = result.file_name;
        anchor.style.display = "none";
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Export failed");
      } finally {
        setIsExporting(false);
      }
    });
  }, [session, activeVersion, isSaving, isExporting, submissionGuard]);

  const handleMaterialize = useCallback(
    async (
      operation: "compress" | "grayscale" | "repair" | "redact" | "merge" | "split",
      options: { redactKeywords?: string[]; redactBoxes?: StudioRedactionBoxPayload[]; mergeParameters?: import("@/lib/studio-v2/api").StudioMergeParameters; pageIds?: string[] } = {}
    ) => {
      if (!activeVersion || isSaving || isMaterializing) return false;
      const selectedIndexBeforeMaterialization = selectedPageIndex;
      setIsMaterializing(true);
      setMaterializationError(null);
      try {
        const request: StudioMaterializationRequest = operation === "compress"
          ? {
              base_version_id: activeVersion.id,
              idempotency_key: newIdempotencyKey(`materialize-${operation}`),
              operation,
              parameters: { level: compressionLevel },
            }
          : operation === "redact"
            ? {
                base_version_id: activeVersion.id,
                idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                operation,
                parameters: { keywords: options.redactKeywords ?? [], boxes: options.redactBoxes ?? [] },
              }
              : operation === "merge"
              ? {
                  base_version_id: activeVersion.id,
                  idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                  operation,
                  parameters: options.mergeParameters ?? { source_asset_ids: [], current_document_position: 0 },
                }
              : operation === "split"
                ? {
                    base_version_id: activeVersion.id,
                    idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                    operation,
                    parameters: { page_ids: options.pageIds ?? [] },
                  }
                : {
                    base_version_id: activeVersion.id,
                    idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                    operation,
                    parameters: {},
                  };
        const response = await materialize(request);
        if (!response) return false;
        const replacementPage = response?.vdm.pages[
          Math.min(Math.max(selectedIndexBeforeMaterialization, 0), response.vdm.pages.length - 1)
        ];
        setSelectedPageId(replacementPage?.page_id ?? null);
        return true;
      } catch (err) {
        setMaterializationError(err instanceof Error ? err.message : "Materialization failed");
        return false;
      } finally {
        setIsMaterializing(false);
      }
    },
    [activeVersion, compressionLevel, isSaving, isMaterializing, materialize, newIdempotencyKey, selectedPageIndex]
  );

  const handleCompressionLevelChange = useCallback((level: StudioCompressionLevel) => {
    setCompressionLevel(level);
    setCompressState((current) => ({ ...current, level }));
  }, []);

  const handleCompress = useCallback(async (): Promise<boolean> => {
    if (!activeVersion || isSaving || isMaterializing) return false;
    const selectedIndexBeforeMaterialization = selectedPageIndex;
    setIsMaterializing(true);
    setMaterializationError(null);
    setCompressState({
      status: "starting",
      level: compressionLevel,
      message: "Preparing current document",
      error: null,
      metrics: null,
    });
    try {
      setCompressState((current) => ({ ...current, status: "running", message: "Compressing current document", error: null }));
      const response = await materialize({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("materialize-compress"),
        operation: "compress",
        parameters: { level: compressionLevel },
      });
      if (!response) throw new Error("Compression did not return a materialized Studio version");
      const metrics = studioCompressionMetricsFromResponse(response.metrics);
      if (!metrics) throw new Error("Compression did not return exact result metrics");
      const replacementPage = response.vdm.pages[
        Math.min(Math.max(selectedIndexBeforeMaterialization, 0), response.vdm.pages.length - 1)
      ];
      setSelectedPageId(replacementPage?.page_id ?? null);
      setCompressState({
        status: "succeeded",
        level: compressionLevel,
        message: "Compression complete",
        error: null,
        metrics,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Compression failed";
      setMaterializationError(message);
      setCompressState((current) => ({ ...current, status: "failed", message: "Compression failed", error: message, metrics: null }));
      return false;
    } finally {
      setIsMaterializing(false);
    }
  }, [activeVersion, compressionLevel, isMaterializing, isSaving, materialize, newIdempotencyKey, selectedPageIndex]);

  const handleApplyRedaction = useCallback(async (keywordInput: string): Promise<boolean> => {
    const keywords = keywordInput.split(",").map((keyword) => keyword.trim()).filter(Boolean);
    if (!keywords.length && !redactionBoxes.length) {
      setMaterializationError("Enter a keyword or draw at least one area to redact.");
      return false;
    }
    if (!vdm) return false;
    let boxes: StudioRedactionBoxPayload[] = [];
    try {
      boxes = redactionBoxes.map((box) => {
        const page = vdm.pages.find((candidate) => candidate.page_id === box.pageId);
        if (!page || page.source_page_number !== box.page) throw new Error("A pending redaction page is no longer present in the current Studio version.");
        return studioV2RedactionBoxToPayload(box, page);
      });
    } catch (err) {
      setMaterializationError(err instanceof Error ? err.message : "Invalid redaction region.");
      return false;
    }
    const succeeded = await handleMaterialize("redact", { redactKeywords: keywords, redactBoxes: boxes });
    if (succeeded) {
      setRedactionBoxes([]);
      setRedactionMode("text");
    }
    return succeeded;
  }, [handleMaterialize, redactionBoxes, vdm]);

  const handleSplit = useCallback(
    async (pageIds: string[]) => {
      if (!vdm) return false;
      const validPageIds = new Set(vdm.pages.map((page) => page.page_id));
      if (!pageIds.length || pageIds.some((pageId) => !validPageIds.has(pageId))) {
        throw new Error("The selected pages are no longer present in the current Studio document.");
      }
      return handleMaterialize("split", { pageIds });
    },
    [handleMaterialize, vdm]
  );

  useEffect(() => {
    if (!vdm || !selectedPageId || vdm.pages.some((page) => page.page_id === selectedPageId)) return;
    setSelectedPageId(vdm.pages[0]?.page_id ?? null);
  }, [vdm, selectedPageId]);

  // Transform Authoritative State for UI Components
  const docInfo: DocumentInfo = useMemo(() => {
    return {
      id: document?.id || session?.document_id || "doc_init",
      name: document?.original_filename || document?.original_file_name || "untitled.pdf",
      version: activeVersion
        ? `Version ${activeVersion.version_number}`
        : "Version 0",
      pageCount: vdm?.page_count || document?.initial_page_count || 1,
      fileSize: formatBytes(document?.file_size || 0),
      saved: syncStatus === "saved",
      syncStatus: syncStatus,
    };
  }, [document, session, activeVersion, vdm, syncStatus]);

  const historyItems: HistoryItem[] = useMemo(() => {
    if (!backendHistory || backendHistory.length === 0) {
      if (activeVersion) {
        return [
          {
            id: activeVersion.id,
            action: activeVersion.operation_type || "Initial State",
            timestamp: formatRelativeTime(activeVersion.created_at),
            versionNumber: activeVersion.version_number,
            isActive: true,
          },
        ];
      }
      return [];
    }

    return backendHistory.map((ver) => ({
      id: ver.id,
      action:
        ver.operation_type === "initial_upload"
          ? "Initial Document"
          : ver.operation_type || "Operation",
      timestamp: formatRelativeTime(ver.created_at),
      versionNumber: ver.version_number,
      isActive: ver.id === activeVersion?.id,
    }));
  }, [backendHistory, activeVersion]);

  // Zoom Handlers
  const handleZoomIn = useCallback(() => {
    setZoomScale((prev) => Math.min(prev + 0.1, 2.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale((prev) => Math.max(prev - 0.1, 0.4));
  }, []);

  const handleFitToScreen = useCallback(() => {
    setZoomScale(0.9);
  }, []);

  const handleTogglePan = useCallback(() => {
    setIsPanning((prev) => !prev);
  }, []);

  // Tool Selection Handler
  const handleSelectTool = useCallback((tool: ToolCategory) => {
    setActiveTool(tool);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileSheetOpen(true);
    }
  }, []);

  const enterEdit = useCallback(() => {
    if (session && activeVersion) setEditMode(true);
  }, [activeVersion, session]);

  const openLeaveConfirmation = useCallback((destination: "/" | "/dashboard/settings") => {
    setLeaveDestination(destination);
  }, []);

  const confirmLeave = useCallback(() => {
    if (!leaveDestination || hasActiveOperation) return;
    const destination = leaveDestination;
    setLeaveDestination(null);
    router.push(destination);
  }, [hasActiveOperation, leaveDestination, router]);

  const openTrashConfirmation = useCallback(() => {
    if (!session || hasActiveOperation) return;
    setSessionDeleteError(null);
    setTrashDialogOpen(true);
  }, [hasActiveOperation, session]);

  const confirmTrash = useCallback(() => {
    if (!session || hasActiveOperation || isDeletingSession) return;
    void submissionGuard.run("session:delete", async () => {
      setIsDeletingSession(true);
      setSessionDeleteError(null);
      try {
        const deleted = await discardSession();
        if (!deleted) throw new Error("Studio session is no longer available.");
        setTrashDialogOpen(false);
        // Discard is a terminal workspace transition. A full replace ensures
        // the cleared entry state cannot be retained by the Studio route's
        // client router cache or restored by the browser back button.
        window.location.replace("/");
      } catch (err) {
        setSessionDeleteError(err instanceof Error ? err.message : "Unable to discard this Studio session. You can retry.");
      } finally {
        setIsDeletingSession(false);
      }
    });
  }, [discardSession, hasActiveOperation, isDeletingSession, router, session, submissionGuard]);

  // Global Keyboard Shortcuts (Cmd+K, 0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (
        e.key === "0" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        handleFitToScreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFitToScreen]);

  if (lifecycle === "entry" || lifecycle === "creating") {
    return (
      <StudioV2Entry
        isCreating={lifecycle === "creating"}
        error={error}
        onUpload={createSessionFromUpload}
      />
    );
  }

  // Loading State for an explicit session only.
  if (isLoading && !session) {
    return (
      <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#d2bbff]" />
        <span className="font-mono text-xs text-[#9AA1AD]">
          Loading Studio session...
        </span>
      </div>
    );
  }

  // Invalid IDs get their own recovery state and never create a replacement.
  if (lifecycle === "not_found") {
    return (
      <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-900/30 border border-amber-700/60 flex items-center justify-center text-amber-300 mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-white mb-1">Studio session not found</h2>
        <p className="text-xs text-[#9AA1AD] max-w-sm mb-6 font-mono">{error || "This Studio session does not exist or is no longer available."}</p>
        <div className="flex gap-2">
          <button onClick={enterStudio} className="flex items-center gap-2 bg-[#7c3aed] text-white text-xs font-medium px-4 py-2 rounded hover:bg-[#6d28d9] transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Open another PDF</span>
          </button>
          <button onClick={enterStudio} className="text-xs text-[#D8DCE3] border border-white/15 px-4 py-2 rounded hover:bg-white/5 transition-colors">Return to Studio</button>
        </div>
      </div>
    );
  }

  // Error State (with retry)
  if (lifecycle === "error" && !session) {
    return (
      <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-800 flex items-center justify-center text-red-400 mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-white mb-1">
          Unable to Load Studio Session
        </h2>
        <p className="text-xs text-[#9AA1AD] max-w-sm mb-6 font-mono">{error}</p>
        <button
          onClick={refetch}
          className="flex items-center gap-2 bg-[#7c3aed] text-white text-xs font-medium px-4 py-2 rounded hover:bg-[#6d28d9] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Session</span>
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] font-sans antialiased overflow-hidden flex flex-col select-none">
      {editMode && session && activeVersion ? <StudioV2EditWorkspace
        sessionId={session.id}
        baseVersionId={activeVersion.id}
        documentName={docInfo.name}
        newIdempotencyKey={newIdempotencyKey}
        onBack={() => setEditMode(false)}
        onCompiled={async () => { await refetch(); setEditMode(false); }}
      /> : <>
      {/* Top Fixed Header */}
      <StudioV2Header
        document={docInfo}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => openLeaveConfirmation("/dashboard/settings")}
        onOpenHelp={() => setHelpOpen(true)}
        onNavigateHome={() => openLeaveConfirmation("/")}
        onExport={handleExport}
        onCompress={handleCompress}
        compressionLevel={compressionLevel}
        onCompressionLevelChange={handleCompressionLevelChange}
        compressStatus={compressState.status}
        compressStatusMessage={compressState.message}
        compressMetrics={compressState.metrics}
        compressError={compressState.error}
        onGrayscale={() => handleMaterialize("grayscale")}
        onRepair={() => handleMaterialize("repair")}
        onApplyRedaction={handleApplyRedaction}
        redactionMode={redactionMode}
        onRedactionModeChange={setRedactionMode}
        redactionBoxes={redactionBoxes}
        onRemoveRedactionBox={handleRemoveRedactionBox}
        onClearRedactions={() => setRedactionBoxes([])}
        onUploadMergeAsset={async (file) => {
          if (!session) throw new Error("Studio session is not ready");
          const response = await studioV2Api.uploadAsset(session.id, file);
          return response.asset;
        }}
        onMerge={(mergeParameters) => handleMaterialize("merge", { mergeParameters })}
        sessionId={session?.id}
        versionId={activeVersion?.id}
        pages={vdm?.pages ?? []}
        onSplit={handleSplit}
        onUploadWatermarkAsset={async (file) => {
          if (!session) throw new Error("Studio session is not ready");
          const response = await studioV2Api.uploadWatermarkAsset(session.id, file);
          return response.asset;
        }}
        onWatermark={handleWatermark}
        watermarkTargets={watermarkTargets}
        onRemoveWatermark={handleRemoveWatermark}
        pageNumbering={vdm?.page_numbering}
        onPageNumbering={handlePageNumbering}
        isMaterializing={isMaterializing}
        materializeDisabled={!session || !activeVersion || isSaving || markupJobIsBusy}
        isExporting={isExporting}
        exportDisabled={!session || !activeVersion || isSaving || isMaterializing || markupJobIsBusy}
      />

      {(error || exportError || materializationError) && (
        <div role="alert" className="fixed left-1/2 top-[56px] z-50 -translate-x-1/2 rounded border border-red-800/80 bg-red-950/90 px-4 py-2 text-xs text-red-100 shadow-lg">
          {materializationError || exportError || error}
        </div>
      )}

      {/* Main Workspace (Sidebar + Canvas + Inspector) */}
      <StudioV2Workspace
        document={docInfo}
        sessionId={session?.id}
        versionId={activeVersion?.id}
        vdm={vdm}
        selectedPageId={selectedPageId}
        activeTool={activeTool}
        inspectorTab={inspectorTab}
        history={historyItems}
        zoomScale={zoomScale}
        isPanning={isPanning}
        onSelectTool={handleSelectTool}
        onSelectInspectorTab={setInspectorTab}
        onSelectPage={setSelectedPageId}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onTogglePan={handleTogglePan}
        onCheckoutVersion={checkout}
        metadata={vdm?.metadata}
        onUpdateMetadata={handleUpdateMetadata}
        onAddNewPage={handleAddBlankPage}
        onEnterEdit={enterEdit}
        onTrash={openTrashConfirmation}
        onHelp={() => setHelpOpen(true)}
        isSessionActionDisabled={hasActiveOperation || isDeletingSession}
        onRotateClockwise={() => handleRotate(90)}
        onRotateCounterClockwise={() => handleRotate(-90)}
        onDeletePage={handleDeletePage}
        onMovePageEarlier={() => handleReorderPage(-1)}
        onMovePageLater={() => handleReorderPage(1)}
        onDuplicatePage={handleDuplicatePage}
        onCropPage={handleCropPage}
        cropDraft={cropDraft}
        onCropDraftChange={(next) => setCropDraft(next as StudioV2CanonicalCropBox)}
        cropTargetMode={cropTargetMode}
        cropCustomPages={cropCustomPages}
        onCropTargetModeChange={setCropTargetMode}
        onCropCustomPagesChange={setCropCustomPages}
        selectedOverlayId={selectedOverlayId}
        onSelectOverlay={setSelectedOverlayId}
        overlayDraft={overlayDraft}
        onOverlayDraftChange={setOverlayDraft}
        onOverlayCommit={handleOverlayCommit}
        onAddText={handleAddText}
        onUpdateText={handleUpdateText}
        onRemoveText={handleRemoveText}
        onAddSignature={handleAddSignature}
        onUpdateSignature={handleUpdateSignature}
        onRemoveSignature={handleRemoveSignature}
        canMovePageEarlier={selectedPageIndex > 0}
        canMovePageLater={selectedPageIndex >= 0 && selectedPageIndex < (vdm?.pages.length ?? 0) - 1}
        isCommandLoading={isSaving || markupJobIsBusy || submissionGuard.pending}
        markupAction={markupAction}
        markupMode={markupMode}
        markupAnalysis={markupAnalysis}
        markupAnalysisLoading={markupAnalysisLoading}
        markupAnalysisError={markupAnalysisError}
        markupColor={markupColor}
        markupBoxes={markupBoxes}
        markupJob={markupJob}
        markupError={markupError}
        onMarkupActionChange={handleMarkupActionChange}
        onMarkupModeChange={handleMarkupModeChange}
        onMarkupColorChange={setMarkupColor}
        onMarkupBoxChange={handleMarkupBoxChange}
        onMarkupInteractionStart={handleMarkupInteractionStart}
        onMarkupInteractionEnd={handleMarkupInteractionEnd}
        redactActive={redactionMode === "area"}
        redactionBoxes={redactionBoxes}
        onRedactionBoxAdd={handleRedactionBoxAdd}
        onRemoveMarkupBox={handleRemoveMarkupBox}
        onClearMarkup={handleClearMarkup}
        onApplyMarkup={() => void handleApplyMarkup()}
        onCancelMarkup={handleCancelMarkup}
        onCancelMarkupJob={() => void handleCancelMarkupJob()}
        markupCanUndo={markupHistory.past.length > 0}
        markupCanRedo={markupHistory.future.length > 0}
        onMarkupUndo={undoMarkupDraft}
        onMarkupRedo={redoMarkupDraft}
      />

      {/* Mobile Bottom Docked Navigation */}
      <StudioV2MobileNav
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
      />

      {/* Mobile Contextual Bottom Sheet */}
      <StudioV2BottomSheet
        isOpen={mobileSheetOpen}
        activeTool={activeTool}
        onClose={() => setMobileSheetOpen(false)}
        onRotatePage={() => void handleRotate(90)}
        onDeletePage={() => void handleDeletePage()}
        onMovePageEarlier={() => void handleReorderPage(-1)}
        onMovePageLater={() => void handleReorderPage(1)}
        onDuplicatePage={() => void handleDuplicatePage()}
      />

      {/* Command Palette Modal (Cmd+K) */}
      <StudioV2CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onFitToScreen={handleFitToScreen}
        onRotatePage={() => handleRotate(90)}
        canRotatePage={Boolean(selectedPage) && !isSaving}
        onExport={handleExport}
      />

      <StudioV2ConfirmDialog
        open={leaveDestination !== null}
        title={leaveDestination === "/dashboard/settings" ? "Open Settings?" : "Leave Studio?"}
        description={hasActiveOperation ? "A Studio operation is still running. Wait for it to finish before leaving this workspace." : "Your Studio session is saved, but you are leaving the editor."}
        cancelLabel="Stay"
        confirmLabel={leaveDestination === "/dashboard/settings" ? "Open Settings" : "Go to home"}
        onCancel={() => setLeaveDestination(null)}
        onConfirm={confirmLeave}
        confirmDisabled={hasActiveOperation}
      />

      <StudioV2ConfirmDialog
        open={trashDialogOpen}
        title="Discard this Studio session?"
        description={hasActiveOperation ? "A Studio operation is still running. Wait for it to finish before discarding this workspace." : "This will remove the current Studio workspace, its saved session data, and associated owned resources. This action cannot be undone."}
        cancelLabel="Cancel"
        confirmLabel={isDeletingSession ? "Discarding…" : "Discard session"}
        onCancel={() => { if (!isDeletingSession) setTrashDialogOpen(false); }}
        onConfirm={confirmTrash}
        confirmDisabled={hasActiveOperation || isDeletingSession}
        cancelDisabled={isDeletingSession}
        destructive
        error={sessionDeleteError}
      />

      <StudioV2Dialog open={helpOpen} title="Studio Help" onClose={() => setHelpOpen(false)}>
        <div className="mt-4 space-y-3 text-xs leading-5 text-[#B7BDC8]">
          <p>Choose a workspace category on the left to focus the inspector on pages, organization, editing, annotations, or overlays.</p>
          <p><span className="font-semibold text-white">Shortcuts:</span> Cmd/Ctrl+K opens Search, 0 fits the canvas, and Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z undo or redo markup drafts while Annotate is active.</p>
          <p>Use Export to create the final PDF. Changes are saved as Studio versions.</p>
        </div>
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => setHelpOpen(false)} className="rounded border border-[var(--studio-border)] px-3 py-2 text-xs text-[#D8DCE3] hover:bg-[#20242B]">Close</button></div>
      </StudioV2Dialog>
      </>}
    </div>
  );
};
