import axios, { AxiosError } from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

const studioV2Client = axios.create({
  baseURL: `${API_BASE_URL}/studio/v1`,
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
  original_file_name: string;
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
};
