import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const EXPECTED_SURFACES = [
    { file: "app/(site)/login/page.tsx", count: 1, autocomplete: "current-password" },
    { file: "app/(site)/register/page.tsx", count: 1, autocomplete: "new-password" },
    { file: "app/(site)/reset-password/page.tsx", count: 2, autocomplete: "new-password" },
    { file: "app/(site)/dashboard/settings/page.tsx", count: 3, autocomplete: "current-password" },
    { file: "components/auth/AuthModal.tsx", count: 1, autocomplete: "current-password" },
    { file: "components/pdf/PdfUploader.tsx", count: 1, autocomplete: "off" },
    { file: "components/tools/LockPdfWorkspace.tsx", count: 1, autocomplete: "off" },
    { file: "components/tools/UnlockPdfWorkspace.tsx", count: 1, autocomplete: "off" },
] as const;

function read(relativePath: string): string {
    return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

async function run() {
    const wrapperPath = path.resolve(process.cwd(), "components/ui/PasswordField.tsx");
    assert.ok(fs.existsSync(wrapperPath), "PasswordField.tsx must exist");
    const wrapperSource = fs.readFileSync(wrapperPath, "utf8");

    const { getPasswordFieldPresentation } = await import("../../components/ui/PasswordField");

    assert.deepEqual(getPasswordFieldPresentation(false), {
        inputType: "password",
        label: "Show password",
    });
    assert.deepEqual(getPasswordFieldPresentation(true), {
        inputType: "text",
        label: "Hide password",
    });

    assert.match(wrapperSource, /type=\{inputType\}/, "the input must use the resolved presentation type");
    assert.match(wrapperSource, /type="button"/, "visibility control must not submit its form");
    assert.match(wrapperSource, /aria-label=\{label\}/, "visibility label must be exposed accessibly");
    assert.match(wrapperSource, /aria-pressed=\{isVisible\}/, "visibility state must be exposed");
    assert.match(wrapperSource, /\{\.\.\.props\}/, "arbitrary input props must be forwarded");
    assert.match(wrapperSource, /className=\{`\$\{className\} pr-12`\}/, "password text must have right padding");
    assert.match(wrapperSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
    assert.match(wrapperSource, /disabled=\{disabled\}/, "disabled state must reach the visibility button");
    assert.match(wrapperSource, /Omit<InputHTMLAttributes<HTMLInputElement>, "type">/);

    let total = 0;
    for (const surface of EXPECTED_SURFACES) {
        const source = read(surface.file);
        const wrapperUses = (source.match(/<PasswordField\b/g) || []).length;
        const passwordLiterals = (source.match(/type=["']password["']/g) || []).length;
        assert.equal(wrapperUses, surface.count, `${surface.file} must use PasswordField for every active password input`);
        assert.equal(passwordLiterals, 0, `${surface.file} must not retain a direct password input`);
        assert.match(source, new RegExp(`autoComplete[^\\n]*${surface.autocomplete}`), `${surface.file} autocomplete contract`);
        total += surface.count;
    }

    assert.equal(total, 11, "the qualified baseline must contain exactly 11 active password inputs");
    assert.match(
        read("components/auth/AuthModal.tsx"),
        /autoComplete=\{isLoginView \? "current-password" : "new-password"\}/,
        "AuthModal must use account-context-specific autocomplete",
    );

    console.log(`Password visibility contract passed for ${total} active inputs.`);
}

void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
