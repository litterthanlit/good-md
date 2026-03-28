export default function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-secondary)",
        gap: "0.75rem",
      }}
    >
      <div style={{ fontSize: "48px", opacity: 0.4 }}>&#128196;</div>
      <div style={{ fontSize: "18px", fontWeight: 500 }}>
        Open a Markdown file
      </div>
      <div style={{ fontSize: "13px" }}>
        Press{" "}
        <kbd
          style={{
            padding: "2px 6px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            fontSize: "12px",
          }}
        >
          &#8984;O
        </kbd>{" "}
        to open a file or drag and drop
      </div>
    </div>
  );
}
