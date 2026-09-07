import { expect, test } from "@playwright/test";

function hasIndexableRobots(body: string): boolean {
    return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*\bindex\b/i.test(body)
        && !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*\bnoindex\b/i.test(body);
}

test.describe("public SEO route responses", () => {
    test("keeps public H1s server-rendered and excludes billing/unknown slugs", async ({ request }) => {
        const publicTool = await request.get("/crop-pdf");
        expect(publicTool.status()).toBe(200);
        const publicToolBody = await publicTool.text();
        expect(publicToolBody).toMatch(/<h1[^>]*>Crop PDF<\/h1>/i);
        expect(hasIndexableRobots(publicToolBody)).toBe(true);

        const about = await request.get("/about");
        expect(about.status()).toBe(200);
        const aboutBody = await about.text();
        expect(aboutBody).toMatch(/<h1[^>]*>[\s\S]*Built for Performance, Security, and[\s\S]*<\/h1>/i);
        expect(aboutBody).toContain("Local-First Reliability");

        const billing = await request.get("/billing");
        expect(billing.status()).toBe(200);
        const billingBody = await billing.text();
        expect(billingBody).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*/i);
        expect(hasIndexableRobots(billingBody)).toBe(false);

        const unknown = await request.get("/seo-route-that-does-not-exist");
        expect(unknown.status()).toBe(404);
        const unknownBody = await unknown.text();
        expect(hasIndexableRobots(unknownBody)).toBe(false);
    });
});
