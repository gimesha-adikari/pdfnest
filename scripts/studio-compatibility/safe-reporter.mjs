import fs from "node:fs";
import path from "node:path";

export default class SafeStudioReporter {
  constructor() {
    this.rows = [];
    this.started = null;
  }
  onBegin(_config, suite) {
    this.started = new Date().toISOString();
    this.expected = suite.allTests().map((test) => test.title);
  }
  onTestEnd(test, result) {
    this.rows.push({
      title: test.title,
      status: result.status,
      duration_ms: result.duration,
      retry: result.retry,
      error_type: result.errors?.[0]?.name || null,
    });
  }
  onEnd(result) {
    const dir = process.env.STUDIO_EVIDENCE_DIR || process.cwd();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "playwright-results.json"), JSON.stringify({
      started_at: this.started,
      completed_at: new Date().toISOString(),
      status: result.status,
      expected_tests: this.expected || [],
      results: this.rows,
    }, null, 2) + "\n");
  }
}
