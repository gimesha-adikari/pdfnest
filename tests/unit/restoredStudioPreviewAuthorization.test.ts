import assert from "node:assert/strict";
import {
    authorizeRestoredStudioPreview,
    createRestoredStudioPreviewScope,
    isRestoredStudioPreviewAuthorized,
    isRestoredStudioPreviewRequired,
    revokeRestoredStudioPreview,
    revokeRestoredStudioPreviewIfUnreachable,
} from "../../lib/security/restoredStudioPreviewAuthorization";
import { hasCloudSubmissionInitiated } from "../../lib/security/pdfInputPreparation";
import { getPreviewFileIdentity } from "../../lib/preview/types";

function makeFile(name: string): File {
    return new File(["synthetic"], name, {
        type: "application/pdf",
        lastModified: 1234,
    });
}

const current = makeFile("snapshot.pdf");
const history = makeFile("snapshot.pdf");
const unrelated = makeFile("snapshot.pdf");
const scope = createRestoredStudioPreviewScope([current, history]);

assert.equal(isRestoredStudioPreviewRequired(current), true);
assert.equal(isRestoredStudioPreviewRequired(history), true);
assert.equal(isRestoredStudioPreviewRequired(unrelated), false);
assert.equal(isRestoredStudioPreviewAuthorized(current), false);
assert.equal(hasCloudSubmissionInitiated(current), false, "consent requirement alone is not transmission history");

authorizeRestoredStudioPreview(scope);
assert.equal(isRestoredStudioPreviewAuthorized(current), true);
assert.equal(isRestoredStudioPreviewAuthorized(history), true);
assert.equal(isRestoredStudioPreviewAuthorized(unrelated), true, "an unrelated ordinary File keeps the existing preview behavior");
assert.equal(isRestoredStudioPreviewRequired(unrelated), false, "restored-project authorization is not inherited by another File");
assert.equal(hasCloudSubmissionInitiated(current), false, "authorization alone must not mark a request");

assert.equal(
    revokeRestoredStudioPreviewIfUnreachable(scope, [unrelated, current]),
    false,
    "a scope remains authorized while its exact current File remains reachable in document history",
);
assert.equal(
    revokeRestoredStudioPreviewIfUnreachable(scope, [unrelated, history]),
    false,
    "any exact File retained in undo or redo history keeps the project scope reachable",
);
assert.equal(isRestoredStudioPreviewAuthorized(current), true);
assert.equal(isRestoredStudioPreviewAuthorized(history), true);

const otherProjectFile = makeFile("snapshot.pdf");
assert.equal(isRestoredStudioPreviewRequired(otherProjectFile), false);
assert.equal(isRestoredStudioPreviewAuthorized(otherProjectFile), true);
const otherProjectScope = createRestoredStudioPreviewScope([otherProjectFile]);
assert.equal(isRestoredStudioPreviewRequired(otherProjectFile), true);
assert.equal(isRestoredStudioPreviewAuthorized(otherProjectFile), false, "a new File with matching metadata needs its own project authorization");
authorizeRestoredStudioPreview(otherProjectScope);
assert.equal(isRestoredStudioPreviewAuthorized(otherProjectFile), true);
assert.equal(
    revokeRestoredStudioPreviewIfUnreachable(scope, [unrelated]),
    true,
    "a project scope is revoked after all of its exact Files leave active and undo/redo history",
);
assert.equal(isRestoredStudioPreviewAuthorized(current), false);
assert.equal(isRestoredStudioPreviewAuthorized(history), false);
assert.equal(isRestoredStudioPreviewAuthorized(otherProjectFile), true, "revoking one project scope leaves another project isolated");

revokeRestoredStudioPreview(scope);
assert.equal(isRestoredStudioPreviewAuthorized(current), false);
assert.equal(isRestoredStudioPreviewRequired(current), true, "revocation must remain fail closed");

assert.notEqual(
    getPreviewFileIdentity(current),
    getPreviewFileIdentity(history),
    "distinct File objects with colliding metadata must not share preview identity",
);

console.log("Restored Studio preview authorization tests passed.");
