import axios, { AxiosError } from "axios";

const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
const normalizedBaseUrl = rawBaseUrl.endsWith("/api")
  ? `${rawBaseUrl}/studio/v1`
  : `${rawBaseUrl}/api/studio/v1`;

const studioV2Client = axios.create({
  baseURL: normalizedBaseUrl,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface StudioSessionDTO {
  id: string;
  user_id?: string | null;
  document_id: string;
  active_version_id: string;
  created_at: string;
  last_accessed_at: string;
  expires_at: string;
}

export interface StudioDocumentDTO {
  id: string;
  original_filename?: string;
  original_file_name?: string;
  file_size: number;
  initial_page_count: number;
  created_at: string;
}

export interface StudioVersionDTO {
  id: string;
  document_id: string;
  parent_version_id?: string | null;
  preferred_child_id?: string | null;
  snapshot_id?: string | null;
  version_number: number;
  status: string;
  operation_type: string;
  is_materialized: boolean;
  created_at: string;
}

export interface StudioOperationDTO {
  id: string;
  document_id: string;
  version_id: string;
  idempotency_key: string;
  operation_name: string;
  parameters: Record<string, unknown>;
  target_page_ids?: string[];
  created_at: string;
}

export interface VDMOverlayDTO {
  id: string;
  type: string;
  text?: string;
  font?: string;
  color?: string;
  font_size?: number;
  opacity?: number;
  rotation?: number;
  position?: string;
  asset_id?: string;
  asset_r2_key?: string;
  rect?: number[];
  quads?: number[];
}

export interface VDMPageDescriptorDTO {
  page_id: string;
  source_asset_id?: string | null;
  source_page_number: number;
  parent_page_id?: string | null;
  is_blank: boolean;
  dimensions?: {
    width: number;
    height: number;
  };
  rotation: number;
  crop_box?: number[];
  overlays: VDMOverlayDTO[];
}

export interface VDMPageNumberingDTO {
  enabled: boolean;
  format: string;
  position: string;
  font_size: number;
  font_family: string;
  start_at: number;
  omitted_page_ids?: string[];
}

export interface StudioVDMDTO {
  document_id: string;
  version_id?: string;
  page_count: number;
  pages: VDMPageDescriptorDTO[];
  page_numbering?: VDMPageNumberingDTO;
  metadata?: Record<string, string>;
}

export interface StudioMetadataParameters {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export interface StudioPageNumberingParameters {
  enabled: boolean;
  position: "bl" | "bc" | "br" | "tl" | "tc" | "tr";
  font_size: number;
  font_family: "Helvetica" | "Times-Roman" | "Courier";
}

export interface StudioTextOverlayParameters {
  page_id: string;
  text: string;
  x: number;
  y: number;
  font_size: number;
  color: string;
}

export interface StudioUpdateTextOverlayParameters extends StudioTextOverlayParameters {
  overlay_id: string;
}

export interface StudioSignatureOverlayParameters {
  page_id: string;
  asset_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudioUpdateSignatureOverlayParameters extends StudioSignatureOverlayParameters {
  overlay_id: string;
}

export interface StudioSessionResponse {
  session: StudioSessionDTO;
  document: StudioDocumentDTO;
  active_version: StudioVersionDTO;
  vdm: StudioVDMDTO;
}

export interface DeleteStudioSessionResponse {
  deleted: boolean;
}

export type StudioMarkupAction = "highlight" | "underline" | "strikeout";
export type StudioMarkupOperation = `markup_${StudioMarkupAction}`;
export type StudioMarkupMode = "manual" | "smart" | "ocr";

export type StudioMarkupPageKind = "text" | "scanned" | "mixed" | "blank" | "unknown";

export interface StudioMarkupPageAnalysis {
  page: number;
  kind: StudioMarkupPageKind;
  hasSelectableText: boolean;
  wordCount: number;
  textBlockCount: number;
  imageBlockCount: number;
  textAreaRatio: number;
  imageAreaRatio: number;
}

export interface StudioMarkupAnalysis {
  pageCount: number;
  pages: StudioMarkupPageAnalysis[];
}

export interface StudioMarkupBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  color: string;
}

export interface StudioMarkupJobParameters {
  boxes: StudioMarkupBox[];
  mode: StudioMarkupMode;
}

export interface StudioJobDTO {
  id: string;
  session_id: string;
  base_version_id: string;
  result_version_id?: string | null;
  editor_state_id?: string | null;
  job_type: StudioMarkupOperation | "editor_extract" | "editor_compile";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | string;
  progress: number;
  message: string;
  error?: string;
  reconciled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioJobResponse {
  job: StudioJobDTO;
}

export interface StudioEditorElementDTO {
  id: string;
  text: string;
  original_text?: string;
  x: number; y: number; width: number; height: number; size: number;
  font: string; bg_color?: string; text_color?: string; transparent_bg?: boolean;
}
export interface StudioEditorPageDTO {
  page_num: number; width: number; height: number;
  kind: "text" | "mixed" | "scanned" | "blank";
  elements: StudioEditorElementDTO[];
}
export interface StudioEditorLayoutDTO {
  pages: StudioEditorPageDTO[];
  source_tracker?: string;
  upright_tracker?: string;
}
export interface StudioEditorStateDTO {
  id: string; document_id: string; session_id: string; base_version_id: string;
  extract_job_id: string; layout: StudioEditorLayoutDTO; created_at: string;
}
export interface StudioEditorCompileParameters {
  editor_state_id: string;
  layout: StudioEditorLayoutDTO;
}

export interface StudioJobRequest {
  base_version_id: string;
  idempotency_key: string;
  operation: StudioMarkupOperation | "editor_extract" | "editor_compile";
  parameters: StudioMarkupJobParameters | Record<string, never> | StudioEditorCompileParameters;
}

export interface CreateSessionRequest {
  file_name?: string;
  file_size?: number;
  initial_page_count?: number;
  source_asset_id?: string;
  source_r2_key?: string;
  initial_vdm?: StudioVDMDTO;
}

export interface ApplyOperationRequest {
  base_version_id: string;
  idempotency_key: string;
  operation_name: string;
  parameters: Record<string, unknown>;
  target_page_ids?: string[];
  new_virtual_model: StudioVDMDTO;
  is_materialized?: boolean;
}

interface StudioCommandEnvelope {
  base_version_id: string;
  idempotency_key: string;
}

export type StudioCommand = StudioCommandEnvelope &
  (
    | {
        operation: "rotate_page";
        parameters: { page_ids: string[]; delta_degrees: number };
      }
    | {
        operation: "delete_pages";
        parameters: { page_ids: string[] };
      }
    | {
        operation: "reorder_pages";
        parameters: { page_ids: string[] };
      }
    | {
        operation: "duplicate_pages";
        parameters: { page_ids: string[]; copies: number };
      }
    | {
        operation: "insert_blank_pages";
        parameters: { position: number; count: number };
      }
    | {
        operation: "crop_page";
        parameters: { page_ids: string[]; crop_box: number[] };
      }
    | {
        operation: "update_metadata";
        parameters: StudioMetadataParameters;
      }
    | {
        operation: "update_page_numbering";
        parameters: StudioPageNumberingParameters;
      }
    | {
        operation: "add_watermark";
        parameters: StudioWatermarkParameters;
      }
    | {
        operation: "add_text_overlay";
        parameters: StudioTextOverlayParameters;
      }
    | {
        operation: "update_text_overlay";
        parameters: StudioUpdateTextOverlayParameters;
      }
    | {
        operation: "add_signature_overlay";
        parameters: StudioSignatureOverlayParameters;
      }
    | {
        operation: "update_signature_overlay";
        parameters: StudioUpdateSignatureOverlayParameters;
      }
    | {
        operation: "delete_overlay";
        parameters: StudioDeleteOverlayParameters;
      }
  );

export interface StudioWatermarkParameters {
  page_ids: string[];
  kind: "text" | "image";
  text?: string;
  font: "Helvetica" | "Times-Roman" | "Courier";
  font_size: number;
  rotation: number;
  opacity: number;
  position: "tl" | "tc" | "tr" | "cl" | "cr" | "bl" | "bc" | "br" | "cc";
  asset_id?: string;
}

export interface StudioDeleteOverlayParameters {
  targets: Array<{ page_id: string; overlay_id: string }>;
}

export interface ApplyOperationResponse {
  version: StudioVersionDTO;
  operation: StudioOperationDTO;
  is_idempotent_replay: boolean;
  vdm: StudioVDMDTO;
}

export interface UndoRedoResponse {
  version: StudioVersionDTO;
  vdm: StudioVDMDTO;
}

export interface HistoryResponse {
  versions: StudioVersionDTO[];
  operations: StudioOperationDTO[];
}

export interface StudioExportDTO {
  id: string;
  document_id: string;
  version_id: string;
  export_format: string;
  r2_key: string;
  byte_size: number;
  expires_at: string;
  created_at: string;
}

export interface FinalizeExportResponse {
  export: StudioExportDTO;
  file_name: string;
  download_path: string;
}

export type StudioCompressionLevel = "low" | "medium" | "high";
export type StudioMaterializationOperation = "compress" | "grayscale" | "repair" | "redact" | "merge" | "split";

export interface StudioCompressionMetrics {
  input_bytes: number;
  output_bytes: number;
  saved_bytes: number;
  reduction_percent: number;
}

export interface StudioRedactParameters {
  keywords: string[];
  boxes: StudioRedactionBoxPayload[];
}

/** Normalized visible-page coordinates sent to the trusted Go boundary. */
export interface StudioRedactionBoxPayload {
  id: string;
  page_id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudioMergeParameters {
  source_asset_ids: string[];
  current_document_position: number;
}

export interface StudioSplitParameters {
  page_ids: string[];
}

export type StudioMaterializationRequest = {
  base_version_id: string;
  idempotency_key: string;
  operation: "compress";
  parameters: { level: StudioCompressionLevel };
} | {
  base_version_id: string;
  idempotency_key: string;
  operation: "grayscale" | "repair";
  parameters: Record<string, never>;
} | {
  base_version_id: string;
  idempotency_key: string;
  operation: "redact";
  parameters: StudioRedactParameters;
} | {
  base_version_id: string;
  idempotency_key: string;
  operation: "merge";
  parameters: StudioMergeParameters;
} | {
  base_version_id: string;
  idempotency_key: string;
  operation: "split";
  parameters: StudioSplitParameters;
};

export interface StudioAssetDTO {
  id: string;
  document_id: string;
  asset_type: string;
  byte_size: number;
  mime_type: string;
}

export interface StudioAssetUploadResponse {
  asset: StudioAssetDTO;
}

export interface StudioMaterializationResponse {
  version: StudioVersionDTO;
  operation: StudioOperationDTO;
  asset: {
    id: string;
    document_id: string;
    asset_type: string;
    byte_size: number;
    mime_type: string;
  };
  vdm: StudioVDMDTO;
  metrics?: StudioCompressionMetrics;
  is_idempotent_replay: boolean;
}

export interface CheckoutRequest {
  target_version_id: string;
}

export class StudioApiError extends Error {
  status: number;
  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "StudioApiError";
    this.status = status;
  }
}

function handleAxiosError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ error?: string }>;
    const status = axiosErr.response?.status || 500;
    const msg =
      axiosErr.response?.data?.error ||
      axiosErr.message ||
      "Studio API request failed";
    throw new StudioApiError(msg, status);
  }
  if (err instanceof Error) {
    throw new StudioApiError(err.message, 500);
  }
  throw new StudioApiError("An unexpected error occurred", 500);
}

export const studioV2Api = {
  async createSession(req: CreateSessionRequest): Promise<StudioSessionResponse> {
    try {
      const res = await studioV2Client.post<StudioSessionResponse>(
        "/sessions",
        req
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async createSessionFromUpload(file: File): Promise<StudioSessionResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    try {
      const res = await studioV2Client.post<StudioSessionResponse>(
        "/sessions/from-upload",
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async uploadAsset(sessionId: string, file: File): Promise<StudioAssetUploadResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    try {
      const res = await studioV2Client.post<StudioAssetUploadResponse>(
        `/sessions/${sessionId}/assets`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async uploadWatermarkAsset(sessionId: string, file: File): Promise<StudioAssetUploadResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("asset_kind", "watermark_image");
    try {
      const res = await studioV2Client.post<StudioAssetUploadResponse>(
        `/sessions/${sessionId}/assets`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async uploadSignatureAsset(sessionId: string, file: File): Promise<StudioAssetUploadResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("asset_kind", "signature_image");
    try {
      const res = await studioV2Client.post<StudioAssetUploadResponse>(
        `/sessions/${sessionId}/assets`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async getSession(sessionId: string): Promise<StudioSessionResponse> {
    try {
      const res = await studioV2Client.get<StudioSessionResponse>(
        `/sessions/${sessionId}`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async deleteSession(sessionId: string): Promise<DeleteStudioSessionResponse> {
    try {
      const res = await studioV2Client.delete<DeleteStudioSessionResponse>(`/sessions/${sessionId}`);
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async getMarkupAnalysis(sessionId: string): Promise<StudioMarkupAnalysis> {
    try {
      const res = await studioV2Client.get<StudioMarkupAnalysis>(
        `/sessions/${sessionId}/markup-analysis`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async submitJob(sessionId: string, request: StudioJobRequest): Promise<StudioJobResponse> {
    try {
      const res = await studioV2Client.post<StudioJobResponse>(
        `/sessions/${sessionId}/jobs`,
        request
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async getJob(sessionId: string, jobId: string): Promise<StudioJobResponse> {
    try {
      const res = await studioV2Client.get<StudioJobResponse>(
        `/sessions/${sessionId}/jobs/${jobId}`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async getEditorState(sessionId: string, stateId: string): Promise<{ editor_state: StudioEditorStateDTO }> {
    try {
      const response = await studioV2Client.get(`/sessions/${sessionId}/editor/${stateId}`);
      return response.data;
    } catch (err) { return handleAxiosError(err); }
  },

  async cancelJob(sessionId: string, jobId: string): Promise<StudioJobResponse> {
    try {
      const res = await studioV2Client.post<StudioJobResponse>(
        `/sessions/${sessionId}/jobs/${jobId}/cancel`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  /** @deprecated Product commands must use executeCommand; retained for legacy fixtures. */
  async applyOperation(
    sessionId: string,
    req: ApplyOperationRequest
  ): Promise<ApplyOperationResponse> {
    try {
      const res = await studioV2Client.post<ApplyOperationResponse>(
        `/sessions/${sessionId}/operations`,
        req
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async executeCommand(
    sessionId: string,
    command: StudioCommand
  ): Promise<ApplyOperationResponse> {
    try {
      const res = await studioV2Client.post<ApplyOperationResponse>(
        `/sessions/${sessionId}/commands`,
        command
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async undo(sessionId: string): Promise<UndoRedoResponse> {
    try {
      const res = await studioV2Client.post<UndoRedoResponse>(
        `/sessions/${sessionId}/undo`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async redo(sessionId: string): Promise<UndoRedoResponse> {
    try {
      const res = await studioV2Client.post<UndoRedoResponse>(
        `/sessions/${sessionId}/redo`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async getHistory(sessionId: string): Promise<HistoryResponse> {
    try {
      const res = await studioV2Client.get<HistoryResponse>(
        `/sessions/${sessionId}/history`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async checkout(
    sessionId: string,
    targetVersionId: string
  ): Promise<UndoRedoResponse> {
    try {
      const res = await studioV2Client.post<UndoRedoResponse>(
        `/sessions/${sessionId}/checkout`,
        { target_version_id: targetVersionId }
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async finalizeExport(sessionId: string): Promise<FinalizeExportResponse> {
    try {
      const res = await studioV2Client.post<FinalizeExportResponse>(
        `/sessions/${sessionId}/export`
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  async materialize(
    sessionId: string,
    request: StudioMaterializationRequest
  ): Promise<StudioMaterializationResponse> {
    try {
      const res = await studioV2Client.post<StudioMaterializationResponse>(
        `/sessions/${sessionId}/materializations`,
        request
      );
      return res.data;
    } catch (err) {
      return handleAxiosError(err);
    }
  },

  exportDownloadURL(sessionId: string, exportId: string): string {
    return studioV2Client.getUri({
      url: `/sessions/${sessionId}/exports/${exportId}/download`,
    });
  },
};
