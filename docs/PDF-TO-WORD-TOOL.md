# PulseWatch Free Tool — PDF to Word

**Version**: v1.0  
**Date**: 2026-05-30  
**Owner**: Web tools / Growth

## Goal

Add a free, privacy-friendly **PDF to Word** tool to the public tools surface. The tool should convert PDF text into a downloadable `.docx` file directly in the browser, without uploading documents to PulseWatch servers.

## Product positioning

| Dimension | Plan |
|---|---|
| User value | Turn invoices, reports, SOPs, and exported PDF text into editable Word documents quickly. |
| Growth value | Broaden the free tools landing page beyond developer-only utilities and capture more SEO traffic. |
| Privacy promise | Conversion runs locally in the browser. No PDF content is sent to PulseWatch. |
| Target users | Founders, ops teams, developers, students, and small businesses needing quick document conversion. |

## MVP scope

| Area | Requirement |
|---|---|
| Input | Single `.pdf` file upload, recommended max 20 MB. |
| Processing | Extract text page-by-page in browser using PDF parsing. |
| Output | Generate a `.docx` file with document title, page headings, and paragraphs. |
| UX | Show file name, page count, conversion status, warnings for scanned/image-only PDFs, and a download button. |
| i18n | English and Chinese UI strings via `next-intl`. |
| SEO | Dedicated route `/tools/pdf-to-word` with localized metadata. |

## Explicit non-goals for MVP

- Pixel-perfect PDF layout preservation.
- OCR for scanned/image-only PDFs.
- Embedded image/table reconstruction.
- Batch conversion.
- Server-side storage or upload.

## Quality strategy

MVP chooses **local text-first conversion** as the safest default: it is fast, private, and works well for text PDFs. High-fidelity conversion is a separate Pro-grade roadmap item because it needs server-side rendering, OCR, font mapping, table detection, and more expensive infrastructure.

## Success criteria

1. User can open `/tools/pdf-to-word`.
2. User can select a text PDF and download a valid `.docx`.
3. No network upload is required for the selected PDF content.
4. Scanned/image PDFs produce a clear “no extractable text” warning.
5. Tool is discoverable from the public tools page and marketing resources.

## Future roadmap

| Phase | Capability |
|---|---|
| P2 | OCR for scanned PDFs. |
| P3 | Preserve headings/tables using layout heuristics. |
| P4 | High-fidelity server conversion with LibreOffice/PDF render pipeline. |
| P5 | Batch conversion and ZIP export. |
