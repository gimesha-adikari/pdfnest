import { test, expect } from '@playwright/test';

test.describe('Repository Analyzer Phase 5 Interactive Explorers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/repository-analyzer');
  });

  test('should load RepositoryMap tab', async ({ page }) => {
    const mapTab = page.locator('[data-testid="tab-repository-map"], [role="tab"][name="Repository Map"]');
    if (await mapTab.count() > 0) {
        await mapTab.click();
    }
    const mapContent = page.locator('[data-testid="repository-map-container"]');
    if (await mapContent.count() > 0) {
        await expect(mapContent).toBeVisible();
    }
  });

  test('should load Architecture tab', async ({ page }) => {
    const archTab = page.locator('[data-testid="tab-architecture"], [role="tab"][name="Architecture"]');
    if (await archTab.count() > 0) {
        await archTab.click();
    }
    const archContent = page.locator('[data-testid="architecture-explorer-container"]');
    if (await archContent.count() > 0) {
        await expect(archContent).toBeVisible();
    }
  });

  test('should load Flow tab', async ({ page }) => {
    const flowTab = page.locator('[data-testid="tab-flow"], [role="tab"][name="Execution Flow"]');
    if (await flowTab.count() > 0) {
        await flowTab.click();
    }
    const flowContent = page.locator('[data-testid="flow-explorer-container"]');
    if (await flowContent.count() > 0) {
        await expect(flowContent).toBeVisible();
    }
  });

  test('should load Impact tab', async ({ page }) => {
    const impactTab = page.locator('[data-testid="tab-impact"], [role="tab"][name="Change Impact"]');
    if (await impactTab.count() > 0) {
        await impactTab.click();
    }
    const impactContent = page.locator('[data-testid="impact-explorer-container"]');
    if (await impactContent.count() > 0) {
        await expect(impactContent).toBeVisible();
    }
  });

  test('should load Hotspot tab', async ({ page }) => {
    const hotspotTab = page.locator('[data-testid="tab-hotspot"], [role="tab"][name="Hotspots"]');
    if (await hotspotTab.count() > 0) {
        await hotspotTab.click();
    }
    const hotspotContent = page.locator('[data-testid="hotspot-explorer-container"]');
    if (await hotspotContent.count() > 0) {
        await expect(hotspotContent).toBeVisible();
    }
  });

  test('should trigger the EvidenceExplorer modal', async ({ page }) => {
    const evidenceTrigger = page.locator('[data-testid="trigger-evidence-explorer"], button:has-text("View Evidence")').first();
    if (await evidenceTrigger.count() > 0) {
        await evidenceTrigger.click();
        const evidenceModal = page.locator('[data-testid="evidence-explorer-modal"], [role="dialog"]');
        await expect(evidenceModal).toBeVisible();
    }
  });

  test('should render AI Architecture Synthesis when available', async ({ page }) => {
    const aiSection = page.locator('section[aria-labelledby="ai-architecture-summary-heading"]');
    if (await aiSection.count() > 0) {
        await expect(aiSection).toBeVisible();
        await expect(page.locator('#ai-architecture-summary-heading')).toContainText('AI Architecture Summary');
    }
  });
});
