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
  font_size?: number;
  opacity?: number;
  rotation?: number;
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

export interface StudioSessionResponse {
  session: StudioSessionDTO;
  document: StudioDocumentDTO;
  active_version: StudioVersionDTO;
  vdm: StudioVDMDTO;
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
  );

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

export interface StudioRedactParameters {
  keywords: string[];
  boxes: string;
}

export interface StudioMergeParameters {
  source_asset_ids: string[];
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
