import { expect, test } from "@playwright/test";
import { acceptVisibleStudioPageId, mostVisibleStudioPage } from "../components/studio-v2/studioV2PageSelection";

declare global {
  interface Window {
    selectedPageId: string;
    deleteTarget: string | null;
  }
}

type VisibleCandidate = {
  pageId: string;
  overlap: number;
  centerDistance: number;
};

function getMostVisiblePage(candidates: VisibleCandidate[]): string | null {
  return mostVisibleStudioPage(candidates);
}

test("downward reorder keeps Delete bound to the selected page through viewport observation", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.setContent(`
    <style>
      html, body { margin: 0; }
      #outer { width: 500px; height: 420px; overflow: auto; }
      #viewport { width: 420px; height: 160px; overflow: auto; border: 1px solid; }
      [data-page-id] { height: 120px; margin-bottom: 8px; }
    </style>
    <div id="outer"><div id="viewport">
      <div data-page-id="p1">Page 1</div>
      <div data-page-id="p2">Page 2</div>
      <div data-page-id="p3">Page 3</div>
      <div data-page-id="p4">Page 4</div>
    </div></div>
    <button id="delete">Delete selected page</button>
    <script>
      window.selectedPageId = "p2";
      window.deleteTarget = null;
      document.querySelector("#delete").addEventListener("click", () => {
        window.deleteTarget = window.selectedPageId;
      });
    </script>
  `);

  await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("#viewport")!;
    const p2 = viewport.querySelector<HTMLElement>('[data-page-id="p2"]')!;
    viewport.insertBefore(p2, viewport.querySelector('[data-page-id="p4"]'));
    viewport.scrollTop = 128;
  });

  const staleVisiblePage = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("#viewport")!;
    const view = viewport.getBoundingClientRect();
    const center = view.top + view.height / 2;
    return Array.from(viewport.querySelectorAll<HTMLElement>("[data-page-id]"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          pageId: element.dataset.pageId!,
          overlap: Math.max(0, Math.min(bounds.bottom, view.bottom) - Math.max(bounds.top, view.top)),
          centerDistance: Math.abs((bounds.top + bounds.bottom) / 2 - center),
        };
      })
      .filter((candidate) => candidate.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap || left.centerDistance - right.centerDistance)[0]?.pageId ?? null;
  });
  expect(staleVisiblePage).toBe("p3");

  const observedAfterReorder = getMostVisiblePage(await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("#viewport")!;
    const view = viewport.getBoundingClientRect();
    const center = view.top + view.height / 2;
    return Array.from(viewport.querySelectorAll<HTMLElement>("[data-page-id]"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          pageId: element.dataset.pageId!,
          overlap: Math.max(0, Math.min(bounds.bottom, view.bottom) - Math.max(bounds.top, view.top)),
          centerDistance: Math.abs((bounds.top + bounds.bottom) / 2 - center),
        };
      })
      .filter((candidate) => candidate.overlap > 0);
  }));
  const acceptedStaleObservation = acceptVisibleStudioPageId("p2", observedAfterReorder);
  await page.evaluate((acceptedPageId) => {
    if (acceptedPageId) window.selectedPageId = acceptedPageId;
  }, acceptedStaleObservation);
  expect(await page.evaluate(() => window.selectedPageId)).toBe("p2");

  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-page-id="p2"]')!.scrollIntoView({ block: "center" });
  });
  const targetVisiblePage = getMostVisiblePage(await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("#viewport")!;
    const view = viewport.getBoundingClientRect();
    const center = view.top + view.height / 2;
    return Array.from(viewport.querySelectorAll<HTMLElement>("[data-page-id]"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          pageId: element.dataset.pageId!,
          overlap: Math.max(0, Math.min(bounds.bottom, view.bottom) - Math.max(bounds.top, view.top)),
          centerDistance: Math.abs((bounds.top + bounds.bottom) / 2 - center),
        };
      })
      .filter((candidate) => candidate.overlap > 0);
  }));
  const acceptedTargetObservation = acceptVisibleStudioPageId("p2", targetVisiblePage);
  await page.evaluate((acceptedPageId) => {
    if (acceptedPageId) window.selectedPageId = acceptedPageId;
  }, acceptedTargetObservation);

  await page.getByRole("button", { name: "Delete selected page" }).click();
  const deleteTarget = await page.evaluate(() => window.deleteTarget);
  expect(deleteTarget).toBe("p2");
});
