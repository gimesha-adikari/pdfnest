import type { VDMPageDescriptorDTO, StudioRedactionBoxPayload } from "@/lib/studio-v2/api";
import type { StudioV2RedactionDraftBox } from "./types";
import { getStudioV2VisiblePageSize } from "./StudioV2Geometry";

export function studioV2RedactionBoxToPayload(
  box: StudioV2RedactionDraftBox,
  page: VDMPageDescriptorDTO,
): StudioRedactionBoxPayload {
  if (box.pageId !== page.page_id || box.page !== page.source_page_number) {
    throw new Error("Redaction region is associated with a different page.");
  }
  const size = getStudioV2VisiblePageSize({
    dimensions: page.dimensions ?? { width: 0, height: 0 },
    rotation: page.rotation,
    cropBox: page.crop_box?.length === 4 ? page.crop_box : null,
  });
  if (!size.width || !size.height) throw new Error("Redaction target page has no dimensions.");
  const { x, y, width, height } = box.rect;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error("Redaction region must contain finite positive geometry.");
  }
  if (x < 0 || y < 0 || x + width > size.width || y + height > size.height) {
    throw new Error("Redaction region must stay inside the visible page.");
  }
  return {
    id: box.id,
    page_id: box.pageId,
    page: box.page,
    x: Number((x / size.width).toFixed(8)),
    y: Number((y / size.height).toFixed(8)),
    width: Number((width / size.width).toFixed(8)),
    height: Number((height / size.height).toFixed(8)),
  };
}

export function redactionBoxHasPracticalSize(box: StudioV2RedactionDraftBox): boolean {
  return box.rect.width > 2 && box.rect.height > 2;
}
