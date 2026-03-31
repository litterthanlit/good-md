import { createElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { HeadingItem } from "../lib/types";
import "../styles/markdown.css";
import "../styles/code-theme.css";

interface MarkdownRendererProps {
  content: string;
  headings: HeadingItem[];
}

function flattenText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(flattenText).join("");
  }

  if (
    children &&
    typeof children === "object" &&
    "props" in children &&
    children.props &&
    typeof children.props === "object" &&
    "children" in children.props
  ) {
    return flattenText(
      (children.props as { children?: ReactNode }).children ?? null,
    );
  }

  return "";
}

export default function MarkdownRenderer({
  content,
  headings,
}: MarkdownRendererProps) {
  let headingIndex = 0;

  const renderHeading =
    (tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
    ({ children }: { children?: ReactNode }) => {
      const currentHeading = headings[headingIndex];
      headingIndex += 1;
      const fallbackText = flattenText(children);
      const headingId =
        currentHeading?.id ??
        fallbackText
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "");

      return createElement(
        tag,
        {
          id: headingId,
          "data-heading-id": headingId,
        },
        <>
          <a className="anchor" href={`#${headingId}`} aria-hidden="true" />
          {children}
        </>,
      );
    };

  return (
    <div className="markdown-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: renderHeading("h1"),
          h2: renderHeading("h2"),
          h3: renderHeading("h3"),
          h4: renderHeading("h4"),
          h5: renderHeading("h5"),
          h6: renderHeading("h6"),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
