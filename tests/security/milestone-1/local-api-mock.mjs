import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureDir = process.env.PLATEN_M1_FIXTURE_DIR || path.join(os.tmpdir(), "platen-m1-security-fixtures");
const plainPdf = readFileSync(path.join(fixtureDir, "plain-two-pages.pdf"));

const server = createServer((request, response) => {
    if (request.method === "GET" && request.url.startsWith("/api/site-content/tools")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
    }

    if (request.method === "POST" && request.url === "/api/security/unlock") {
        request.resume();
        response.writeHead(200, { "content-type": "application/pdf" });
        response.end(plainPdf);
        return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "No local mock route is defined for this request." }));
});

server.listen(3999, "127.0.0.1", () => {
    process.stdout.write("Local PDFNest API mock listening on http://127.0.0.1:3999\n");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
