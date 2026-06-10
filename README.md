![Project cover](cover.png)

# PDFNest

PDFNest is a Next.js PDF utility app for editing, protecting, converting, and extracting content from PDF files. It provides a browser UI for uploading documents, previewing pages where needed, sending files to a PDF processing backend, and downloading the processed output.

## Features

- Merge multiple PDFs into one document
- Split PDFs by selected pages
- Rotate, reorder, and delete PDF pages
- Add text watermarks and page numbers
- Compress PDF files
- Edit PDF metadata
- Lock and unlock protected PDFs
- Convert images to PDF
- Convert PDF pages to images
- Extract text from PDFs
- Convert text images into searchable PDF output
- Light and dark theme support

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- pdfjs-dist for client-side PDF previews
- @dnd-kit for drag-and-drop page ordering
- lucide-react icons

## Requirements

- Node.js 20 or newer
- npm
- A compatible PDF processing API server

The frontend sends processing requests to `NEXT_PUBLIC_API_BASE_URL`, which defaults to:

```bash
http://localhost:8080/api
```

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file if your backend is not running at the default URL:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

```bash
npm run dev
```

Starts the local development server.

```bash
npm run build
```

Builds the app for production.

```bash
npm run start
```

Starts the production server after a successful build.

```bash
npm run lint
```

Runs ESLint.

## Backend API

Most tools use `lib/apiClient.ts` to upload a `FormData` payload and download the returned file. The current UI expects these backend paths under the configured API base URL:

- `POST /structure/merge`
- `POST /structure/split`
- `POST /structure/rotate`
- `POST /structure/delete-pages`
- `POST /structure/reorder-pages`
- `POST /structure/watermark`
- `POST /structure/add-page-numbers`
- `POST /structure/metadata/fetch`
- `POST /structure/update-metadata`
- `POST /optimize/compress`
- `POST /security/lock`
- `POST /security/unlock`
- `POST /conversion/to-pdf`
- `POST /conversion/pdf-to-images`
- `POST /ocr/extract-text`
- `POST /images/to-text-pdf`

The app also includes `app/api/lock/route.ts`, a Next.js route handler that proxies lock requests to `http://localhost:8080/api/security/lock`.

## Project Structure

```text
app/                  App Router pages and route handlers
components/           Shared UI components
components/pdf/       PDF-specific upload, preview, and action components
lib/                  Tool metadata, API client, and error helpers
public/               Static assets and PDF.js worker
```

## Adding a Tool

1. Add the page under `app/<tool-route>/page.tsx`.
2. Add the navigation entry to `lib/toolsData.ts`.
3. Reuse the shared PDF components in `components/pdf/` where possible.
4. Use `uploadAndDownloadFile()` from `lib/apiClient.ts` for upload-and-download API flows.

## License

This project is licensed under the terms in [LICENSE](./LICENSE).
