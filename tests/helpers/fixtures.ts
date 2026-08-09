import path from 'path';

export const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

export const FIXTURES = {
  SAMPLE_PDF: path.join(FIXTURES_DIR, 'sample.pdf'),
  SAMPLE_PDF_2: path.join(FIXTURES_DIR, 'sample2.pdf'),
  SAMPLE_DOCX: path.join(FIXTURES_DIR, 'sample.docx'),
  SAMPLE_XLSX: path.join(FIXTURES_DIR, 'sample.xlsx'),
  SAMPLE_PPTX: path.join(FIXTURES_DIR, 'sample.pptx'),
  SAMPLE_MD: path.join(FIXTURES_DIR, 'sample.md'),
  SAMPLE_PY: path.join(FIXTURES_DIR, 'sample.py'),
  SAMPLE_PNG: path.join(FIXTURES_DIR, 'sample.png'),
  SAMPLE_JPG: path.join(FIXTURES_DIR, 'sample.jpg'),
} as const;
