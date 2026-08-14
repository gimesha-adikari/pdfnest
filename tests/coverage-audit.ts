import fs from 'fs';
import path from 'path';
import { NAV_TOOLS_FALLBACK } from '../lib/toolsData';

interface AuditResult {
  title: string;
  href: string;
  category: string;
  testFile: string | null;
  status: 'COVERED' | 'NOT_COVERED';
}

function findTestFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findTestFiles(filePath));
    } else if (file.endsWith('.spec.ts')) {
      results.push(filePath);
    }
  });
  return results;
}

export function runCoverageAudit(): AuditResult[] {
  const testsDir = path.resolve(__dirname);
  const specFiles = findTestFiles(testsDir);

  const specContents = specFiles.map(f => ({
    file: path.relative(path.resolve(__dirname, '..'), f),
    content: fs.readFileSync(f, 'utf-8'),
  }));

  const results: AuditResult[] = NAV_TOOLS_FALLBACK.map(tool => {
    const slug = tool.href.replace(/^\//, '');
    const matchingSpec = specContents.find(s => s.content.includes(`'${slug}'`) || s.content.includes(`"${slug}"`));

    return {
      title: tool.title,
      href: tool.href,
      category: tool.category,
      testFile: matchingSpec ? matchingSpec.file : null,
      status: matchingSpec ? 'COVERED' : 'NOT_COVERED',
    };
  });

  return results;
}

function printReport() {
  const audit = runCoverageAudit();
  console.log('\n================================================================================');
  console.log('                        PDFNEST E2E TEST COVERAGE AUDIT                         ');
  console.log('================================================================================\n');

  console.log(
    'Tool Title'.padEnd(30) +
    'Route Slug'.padEnd(25) +
    'Category'.padEnd(15) +
    'Status'.padEnd(12) +
    'Test File'
  );
  console.log('-'.repeat(110));

  let coveredCount = 0;
  audit.forEach(item => {
    if (item.status === 'COVERED') coveredCount++;
    const statusStr = item.status === 'COVERED' ? '✓ COVERED' : '✗ MISSING';
    console.log(
      item.title.padEnd(30) +
      item.href.padEnd(25) +
      item.category.padEnd(15) +
      statusStr.padEnd(12) +
      (item.testFile || 'N/A')
    );
  });

  console.log('-'.repeat(110));
  console.log(`TOTAL TOOLS: ${audit.length} | COVERED: ${coveredCount} | MISSING: ${audit.length - coveredCount}`);
  console.log(`COVERAGE RATE: ${((coveredCount / audit.length) * 100).toFixed(1)}%\n`);
}

if (require.main === module) {
  printReport();
}
