import assert from "node:assert/strict";
import { fitWidthZoom } from "../../components/editor-v2/model";
import { STUDIO_TILE_MAX_SCALE, STUDIO_TILE_MIN_SCALE, studioVisualResolution } from "../../components/editor-v2/visualResolution";
import { studioV2PageTileURL } from "../../lib/studio-v2/api";

const at = (zoom: number, dpr: number, pageWidthPt = 600) => studioVisualResolution({ pageWidthPt, zoom, devicePixelRatio: dpr });

assert.equal(at(1, 1).scale, 1, "100% at DPR 1 requests one pixel per PDF point");
assert.equal(at(1, 2).scale, 2, "100% at DPR 2 requests two physical pixels per PDF point");
assert.equal(at(.5, 1).scale, STUDIO_TILE_MIN_SCALE, "50% is bounded at the minimum bucket");
assert.equal(at(2, 1).scale, 2, "200% at DPR 1 requests a 2x raster");
assert.equal(at(2, 2).scale, 4, "200% at DPR 2 requests a 4x raster");
assert.equal(at(2, 4).scale, STUDIO_TILE_MAX_SCALE, "large DPR is bounded at the safe maximum");
assert.equal(at(Number.NaN, Number.NaN).scale, 1, "invalid inputs fall back to a valid scale");
assert.equal(at(1.17, 1).scale, 1.5, "fit-width-style zoom rounds up to the smallest sufficient bucket");
assert.equal(at(1.17, 2).scale, 3, "DPR is included in fit-width resolution");
const fitNarrow = fitWidthZoom(764, 600);
const fitWide = fitWidthZoom(1264, 600);
assert.equal(at(fitNarrow, 1).scale, 1.5, "a normal fit-width viewport is sharp");
assert.equal(at(fitWide, 1).scale, 2, "a wider fit-width viewport gets a larger bucket");
assert.ok(at(2, 2).requestedWidthPx > at(1, 1).requestedWidthPx, "requested raster width follows displayed resolution");
assert.ok(at(2, 2).requestedWidthPx > 0 && Number.isFinite(at(2, 2).requestedWidthPx), "requested dimensions remain valid");

const url = studioV2PageTileURL("session-1", "version-1", "page-1", at(2, 2).scale);
const parsed = new URL(url);
assert.equal(parsed.pathname.endsWith("/sessions/session-1/versions/version-1/pages/page-1/tile"), true, "session/version/page identity remains in the tile URL");
assert.equal(parsed.searchParams.get("scale"), "4", "resolution policy is forwarded to the existing tile endpoint");
const dashboardUrl = studioV2PageTileURL("session-1", "version-1", "page-1");
assert.equal(new URL(dashboardUrl).searchParams.get("scale"), "0.35", "non-editor dashboard previews retain their existing policy");
console.log("Studio adaptive visual-resolution tests passed.");
