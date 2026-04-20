import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { getFileMetadata, readFileBytes } from "./commands";
import { extractFileInfo } from "./documents";
import type { PdfAnnotation, PdfEditState, SearchResult } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfTextPage {
  page: number;
  text: string;
}

export interface PdfTextCacheEntry {
  modifiedMs: number;
  size: number;
  pages: PdfTextPage[];
}

export const EMPTY_PDF_EDIT_STATE: PdfEditState = {
  annotations: [],
  rotations: {},
  deletedPages: [],
  pageOrder: null,
};

export function createEmptyPdfEditState(): PdfEditState {
  return {
    annotations: [],
    rotations: {},
    deletedPages: [],
    pageOrder: null,
  };
}

export function hasPdfEdits(editState: PdfEditState | undefined) {
  if (!editState) return false;
  return (
    editState.annotations.length > 0 ||
    editState.deletedPages.length > 0 ||
    editState.pageOrder !== null ||
    Object.values(editState.rotations).some((rotation) => rotation % 360 !== 0)
  );
}

export async function loadPdfDocument(bytes: number[]) {
  return pdfjsLib.getDocument({ data: Uint8Array.from(bytes) }).promise;
}

export async function extractPdfTextPages(bytes: number[]): Promise<PdfTextPage[]> {
  const document = await loadPdfDocument(bytes);
  const pages: PdfTextPage[] = [];

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) =>
        typeof (item as { str?: unknown }).str === "string"
          ? (item as { str: string }).str
          : "",
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: pageIndex, text });
  }

  await document.destroy();
  return pages;
}

export async function searchPdfFiles(
  paths: string[],
  query: string,
  cache: Map<string, PdfTextCacheEntry>,
): Promise<SearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const results: SearchResult[] = [];
  for (const path of paths) {
    const { filename, parentFolder } = extractFileInfo(path);
    const metadata = await getFileMetadata(path);
    const cacheKey = path;
    let entry = cache.get(cacheKey);

    if (
      !entry ||
      entry.modifiedMs !== metadata.modifiedMs ||
      entry.size !== metadata.size
    ) {
      const bytes = await readFileBytes(path);
      entry = {
        ...metadata,
        pages: await extractPdfTextPages(bytes),
      };
      cache.set(cacheKey, entry);
    }

    const filenameMatches = filename.toLowerCase().includes(normalizedQuery);
    let bestPage = entry.pages.find((page) =>
      page.text.toLowerCase().includes(normalizedQuery),
    );

    if (!filenameMatches && !bestPage) {
      continue;
    }

    const snippetSource = bestPage?.text || filename;
    const lowerSnippet = snippetSource.toLowerCase();
    const matchIndex = lowerSnippet.indexOf(normalizedQuery);
    const snippet =
      matchIndex >= 0
        ? snippetSource
            .slice(Math.max(0, matchIndex - 48), matchIndex + normalizedQuery.length + 92)
            .trim()
        : snippetSource.slice(0, 140);

    results.push({
      kind: "pdf",
      path,
      filename,
      parentFolder,
      snippet: snippet || "PDF document",
      line: 1,
      headingId: null,
      page: bestPage?.page ?? 1,
    });
  }

  return results;
}

function parseHexColor(value: string) {
  const normalized = value.replace("#", "");
  const fallback = { r: 1, g: 0.84, b: 0 };
  if (normalized.length !== 6) return fallback;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return fallback;
  }
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function drawAnnotation(page: PDFPage, annotation: PdfAnnotation, font: PDFFont) {
  const color = parseHexColor(annotation.color);
  const fill = rgb(color.r, color.g, color.b);

  if (annotation.kind === "whiteout") {
    page.drawRectangle({
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      color: rgb(1, 1, 1),
      opacity: 1,
    });
    return;
  }

  if (annotation.kind === "highlight") {
    page.drawRectangle({
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      color: fill,
      opacity: annotation.opacity,
    });
    return;
  }

  if (annotation.kind === "ink" && annotation.points && annotation.points.length > 1) {
    for (let index = 1; index < annotation.points.length; index += 1) {
      page.drawLine({
        start: annotation.points[index - 1],
        end: annotation.points[index],
        thickness: 2,
        color: fill,
        opacity: annotation.opacity,
      });
    }
    return;
  }

  const text = annotation.text?.trim() || (annotation.kind === "note" ? "Note" : "");
  if (!text) return;

  page.drawRectangle({
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
    color: annotation.kind === "note" ? rgb(1, 0.95, 0.58) : rgb(1, 1, 1),
    opacity: annotation.kind === "note" ? 0.95 : 0.82,
    borderColor: fill,
    borderWidth: 1,
  });
  page.drawText(text.slice(0, 500), {
    x: annotation.x + 6,
    y: annotation.y + Math.max(6, annotation.height - (annotation.fontSize ?? 12) - 6),
    size: annotation.fontSize ?? 12,
    color: annotation.kind === "note" ? rgb(0.18, 0.14, 0.02) : fill,
    font,
  });
}

export async function applyPdfEdits(
  bytes: number[],
  editState: PdfEditState,
): Promise<number[]> {
  const source = await PDFDocument.load(Uint8Array.from(bytes));
  const target = await PDFDocument.create();
  const font = await target.embedFont(StandardFonts.Helvetica);
  const sourcePageCount = source.getPageCount();
  const order =
    editState.pageOrder ?? Array.from({ length: sourcePageCount }, (_, index) => index);
  const deleted = new Set(editState.deletedPages);
  const sourcePages = source.getPages();

  for (const sourcePageIndex of order) {
    if (deleted.has(sourcePageIndex) || sourcePageIndex >= sourcePageCount) {
      continue;
    }

    const [copiedPage] = await target.copyPages(source, [sourcePageIndex]);
    const baseRotation = sourcePages[sourcePageIndex].getRotation().angle;
    const addedRotation = editState.rotations[sourcePageIndex] ?? 0;
    copiedPage.setRotation(degrees((baseRotation + addedRotation) % 360));
    target.addPage(copiedPage);

    for (const annotation of editState.annotations.filter(
      (item) => item.pageIndex === sourcePageIndex,
    )) {
      drawAnnotation(copiedPage, annotation, font);
    }
  }

  const saved = await target.save();
  return Array.from(saved);
}
