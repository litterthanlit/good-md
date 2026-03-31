import type { HeadingItem } from "./types";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function slugBase(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/_/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createSlugger() {
  const counts = new Map<string, number>();

  return {
    slug(value: string) {
      const base = slugBase(value) || "section";
      const count = counts.get(base) ?? 0;
      counts.set(base, count + 1);
      return count === 0 ? base : `${base}-${count}`;
    },
  };
}

export function extractHeadings(content: string): HeadingItem[] {
  const lines = content.split(/\r?\n/);
  const headings: HeadingItem[] = [];
  const slugger = createSlugger();
  let fenceMarker: "`" | "~" | null = null;

  const toggleFence = (line: string) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!match) return false;

    const marker = match[1][0] as "`" | "~";
    if (fenceMarker === null) {
      fenceMarker = marker;
      return true;
    }

    if (fenceMarker === marker) {
      fenceMarker = null;
      return true;
    }

    return false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (toggleFence(line)) {
      continue;
    }

    if (fenceMarker) {
      continue;
    }

    const atxMatch = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
    if (atxMatch) {
      const text = normalizeWhitespace(atxMatch[2]);
      if (text) {
        headings.push({
          id: slugger.slug(text),
          text,
          level: atxMatch[1].length,
          line: index + 1,
        });
      }
      continue;
    }

    const nextLine = lines[index + 1];
    if (!nextLine) {
      continue;
    }

    const setextMatch = nextLine.match(/^ {0,3}(=+|-+)\s*$/);
    if (!setextMatch) {
      continue;
    }

    const text = normalizeWhitespace(line);
    if (!text) {
      continue;
    }

    headings.push({
      id: slugger.slug(text),
      text,
      level: setextMatch[1][0] === "=" ? 1 : 2,
      line: index + 1,
    });
    index += 1;
  }

  return headings;
}
