import assert from "node:assert/strict";
import axios, { AxiosError, type AxiosInstance } from "axios";
import { loadStudioSourceModule } from "../helpers/loadStudioSourceModule";
import * as admission from "../../lib/studio-v2/sourceAdmission";
import * as preparation from "../../lib/security/pdfInputPreparation";

type API = typeof import("../../lib/studio-v2/api");
const limit = 52_428_800;
function file(size: number): File {
  const result = new File(["%PDF-synthetic"], "source.pdf", { type: "application/pdf" });
  Object.defineProperty(result, "size", { value: size });
  return result;
}

async function main() {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  let requests = 0, marks = 0, forms = 0;
  let failure: unknown;
  let client!: AxiosInstance;
  globalThis.fetch = async () => { throw new Error("Network forbidden in Studio admission tests"); };
  globalThis.FormData = class extends originalFormData { constructor() { super(); forms++; } };
  const api = loadStudioSourceModule<API>("lib/studio-v2/api.ts", {
    axios: { default: { ...axios, create(config: Parameters<typeof axios.create>[0]) {
      client = axios.create({ ...config, baseURL: "http://127.0.0.1:9/api/studio/v1" });
      client.defaults.adapter = async (request) => {
        requests++;
        if (failure) throw failure;
        return { data: { accepted: true }, status: 201, statusText: "Created", headers: {}, config: request };
      };
      return client;
    } } },
    "@/lib/studio-v2/sourceAdmission": admission,
    "./sourceAdmission": admission,
    "@/lib/security/pdfInputPreparation": { ...preparation, markCloudSubmissionInitiated(files: File[]) { marks++; preparation.markCloudSubmissionInitiated(files); } },
  });
  try {
    assert.equal(admission.MAX_STUDIO_PDF_SOURCE_BYTES, limit);
    for (const size of [limit - 1, limit]) {
      assert.equal(admission.studioPdfSourceIssue(file(size)), null);
      await api.studioV2Api.createSessionFromUpload(file(size));
      await api.studioV2Api.uploadAsset("session", file(size));
    }
    for (const size of [limit + 1, 0, -1, NaN, Infinity, 1.5]) {
      for (const submit of [api.studioV2Api.createSessionFromUpload, (f: File) => api.studioV2Api.uploadAsset("session", f)]) {
        const selected = file(size);
        const before = { requests, marks, forms };
        await assert.rejects(submit(selected), (error: unknown) => error instanceof api.StudioApiError && error.status === (Number.isSafeInteger(size) && size > limit ? 413 : 400));
        assert.deepEqual({ requests, marks, forms }, before, "reject before FormData, provenance mark or request");
        assert.equal(preparation.hasCloudSubmissionInitiated(selected), false);
      }
    }
    // Valid retry still submits and records permanent transmission history.
    const valid = file(16);
    failure = new AxiosError("lost response", "ERR_NETWORK");
    await assert.rejects(api.studioV2Api.createSessionFromUpload(valid));
    assert.equal(preparation.hasCloudSubmissionInitiated(valid), true);
    failure = undefined;
    await api.studioV2Api.createSessionFromUpload(valid);
    const codes: [number, string][] = [[413,"STUDIO_SOURCE_TOO_LARGE"],[400,"STUDIO_SOURCE_INVALID"],[400,"STUDIO_SOURCE_ENCRYPTED"],[400,"STUDIO_SOURCE_PAGE_LIMIT"],[404,"STUDIO_SOURCE_NOT_FOUND"],[409,"STUDIO_SOURCE_CHANGED"],[503,"STUDIO_SOURCE_UNAVAILABLE"],[413,"PREVIEW_SOURCE_TOO_LARGE"]];
    for (const [status,code] of codes) {
      failure = new AxiosError("provider /private/path", "ERR_BAD_RESPONSE", undefined, undefined,
        { status, statusText:"Rejected", data:{code,error:"/private/storage/key Worker exception"},headers:{},config:{headers:new axios.AxiosHeaders()} });
      await assert.rejects(api.studioV2Api.createSessionFromUpload(file(16)), (error:unknown)=>{
        assert(error instanceof api.StudioApiError);
        assert.equal(error.status,status);assert.equal(error.code,code);
        assert.equal(error.message,admission.studioSourceErrorMessage(code));
        assert.doesNotMatch(error.message,/private|Worker exception/);return true;
      });
    }
    failure = new axios.CanceledError("cancelled");
    await assert.rejects(api.studioV2Api.createSessionFromUpload(file(16)),(error:unknown)=>error instanceof api.StudioApiError && error.code==="ERR_CANCELED");
    failure = new AxiosError("request timeout", "ECONNABORTED");
    await assert.rejects(api.studioV2Api.uploadAsset("session",file(16)),(error:unknown)=>error instanceof api.StudioApiError && error.code==="ECONNABORTED");
    failure = new Error("unexpected /private/provider/path");
    await assert.rejects(api.studioV2Api.createSessionFromUpload(file(16)),(error:unknown)=>error instanceof api.StudioApiError && !error.message.includes("/private/"));
    failure = undefined;
    const previouslySent = file(limit+1);
    preparation.markCloudSubmissionInitiated([previouslySent]);
    await assert.rejects(api.studioV2Api.createSessionFromUpload(previouslySent));
    assert.equal(preparation.hasCloudSubmissionInitiated(previouslySent),true,"size rejection must not erase earlier transmission history");
    // Separate image methods do not inherit the PDF cap.
    await api.studioV2Api.uploadWatermarkAsset("session", file(limit + 1));
    await api.studioV2Api.uploadSignatureAsset("session", file(limit + 1));
    console.log("Studio source API boundary tests passed: integer limits, direct calls, no local-rejection side effects, retry and separate assets.");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }
}
void main();
