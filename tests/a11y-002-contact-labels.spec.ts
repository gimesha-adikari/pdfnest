import { expect, test } from "@playwright/test";

const CONTACT_CONTROLS = [
    {
        name: "Name",
        selector: 'input[name="name"]',
        id: "contact-name",
        label: /^Name/,
    },
    {
        name: "Email",
        selector: 'input[name="email"]',
        id: "contact-email",
        label: /^Email/,
    },
    {
        name: "Category",
        selector: 'select[name="category"]',
        id: "contact-category",
        label: /^Category/,
    },
    {
        name: "Subject",
        selector: 'input[name="subject"]',
        id: "contact-subject",
        label: /^Subject/,
    },
    {
        name: "Message",
        selector: 'textarea[name="message"]',
        id: "contact-message",
        label: /^Message/,
    },
    {
        name: "Attachments",
        selector: 'input[type="file"]',
        id: "contact-attachments",
        label: /^Add Attachments \(Max 10MB\)/,
    },
] as const;

test("A11Y-002: Contact controls have native labels without submitting", async ({ page }) => {
    const response = await page.goto("/contact", { waitUntil: "domcontentloaded" });

    expect(response, "Contact should return a document response").not.toBeNull();
    expect(response?.status(), "Contact should render successfully").toBe(200);

    const landmarkCounts = await page.evaluate(() => ({
        mainCount: document.querySelectorAll("main").length,
        nestedMainCount: document.querySelectorAll("main main").length,
    }));

    expect(landmarkCounts).toEqual({
        mainCount: 1,
        nestedMainCount: 0,
    });

    const ids = CONTACT_CONTROLS.map((control) => control.id);
    expect(new Set(ids).size, "the intended control IDs must be unique").toBe(ids.length);
    const idCounts = await page.evaluate(
        (expectedIds) =>
            expectedIds.map((id) => ({
                id,
                count: Array.from(document.querySelectorAll("[id]")).filter((element) => element.id === id).length,
            })),
        ids,
    );

    expect(idCounts.every(({ count }) => count === 1), "each intended ID should resolve one control").toBe(true);

    for (const control of CONTACT_CONTROLS) {
        const element = page.locator(control.selector);
        const label = page.locator('label[for="' + control.id + '"]');
        const description = control.name + " control";

        await expect(element, description + " should exist once").toHaveCount(1);
        await expect(label, control.name + " label should exist once").toHaveCount(1);
        await expect(
            element,
            control.name + " control should have its stable ID",
        ).toHaveAttribute("id", control.id);
        await expect(
            label,
            control.name + " label should visibly name the control",
        ).toContainText(control.label);

        const nativeAssociation = await element.evaluate((controlElement) => {
            const formControl = controlElement as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

            return {
                id: formControl.id,
                labels: Array.from(formControl.labels ?? []).map((associatedLabel: HTMLLabelElement) => ({
                    htmlFor: associatedLabel.htmlFor,
                    text: associatedLabel.textContent?.trim() ?? "",
                })),
            };
        });

        expect(nativeAssociation.labels, control.name + " native label association").toEqual([
            expect.objectContaining({
                htmlFor: control.id,
            }),
        ]);
        expect(nativeAssociation.labels[0]?.text).toMatch(control.label);

        const labeledControl = page.getByLabel(control.label);
        await expect(
            labeledControl,
            control.name + " should resolve through its intended visible label",
        ).toHaveCount(1);
    }

    await expect(
        page.getByRole("button", { name: /^Send Message$/ }),
        "submit button should retain its native accessible name",
    ).toHaveCount(1);
});
