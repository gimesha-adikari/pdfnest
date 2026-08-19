import assert from "assert";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html);
}

function testXSSSanitization() {
    const maliciousMd = `
# Dangerous Markdown

<script>alert("XSS-ATTACK")</script>
<img src="x" onerror="alert('XSS-ONERROR')">
[Malicious Link](javascript:alert('XSS-JS-URI'))
<a href="javascript:void(0)" onclick="alert('XSS-CLICK')">Click me</a>
`;

    const rawHtml = marked.parse(maliciousMd) as string;
    const cleanHtml = sanitizeHtml(rawHtml);

    assert(!cleanHtml.includes("<script>"), "Sanitizer must strip <script> tags");
    assert(!cleanHtml.includes('href="javascript:'), "Sanitizer must strip javascript: href attributes");
    assert(!cleanHtml.includes("onclick="), "Sanitizer must strip onclick attributes");

    console.log("✔ XSS Sanitization Test Passed");
}

function testLegitimateMarkdownRendering() {
    const validMd = `
# Sample Title

This is **bold** and *italic* text.

- Item 1
- Item 2

[Legitimate Link](https://pdfnest.com)

| Header A | Header B |
| :--- | :--- |
| Val A | Val B |

\`\`\`python
print("Hello World")
\`\`\`

![Figure 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)
`;

    const rawHtml = marked.parse(validMd) as string;
    const cleanHtml = sanitizeHtml(rawHtml);

    assert(cleanHtml.includes("Sample Title"), "Must render title");
    assert(cleanHtml.includes("<strong>bold</strong>"), "Must render bold text");
    assert(cleanHtml.includes("<em>italic</em>"), "Must render italic text");
    assert(cleanHtml.includes("<li>Item 1</li>"), "Must render unordered list");
    assert(cleanHtml.includes('href="https://pdfnest.com"'), "Must render valid HTTPS link");
    assert(cleanHtml.includes("<table>") && cleanHtml.includes("Header A"), "Must render table");
    assert(cleanHtml.includes("Hello World"), "Must render code block text");
    assert(cleanHtml.includes('<img src="data:image/png;base64,'), "Must render base64 Data URI image");

    console.log("✔ Legitimate Markdown Rendering Test Passed");
}

function run() {
    console.log("--- Running Markdown Security & Preview Unit Tests ---");
    testXSSSanitization();
    testLegitimateMarkdownRendering();
    console.log("--- All Markdown Security Tests Passed ---");
}

run();
