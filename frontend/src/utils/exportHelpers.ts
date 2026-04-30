export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const linkElement = document.createElement("a");

  linkElement.href = url;
  linkElement.download = filename;
  linkElement.rel = "noopener noreferrer";
  document.body.appendChild(linkElement);
  linkElement.click();
  linkElement.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadJsonFile(content: unknown, filename: string): void {
  downloadTextFile(
    JSON.stringify(content, null, 2),
    filename,
    "application/json;charset=utf-8",
  );
}

export function downloadCsvFile(content: string, filename: string): void {
  downloadTextFile(content, filename, "text/csv;charset=utf-8");
}

export function buildCsvFromObjects(
  rows: Record<string, any>[],
  preferredColumns?: string[],
): string {
  if (rows.length === 0) {
    return "";
  }

  const columns =
    preferredColumns && preferredColumns.length > 0
      ? preferredColumns
      : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const escapeValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }

    const normalized =
      value instanceof Date
        ? value.toISOString()
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

    if (/[",\n]/.test(normalized)) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }

    return normalized;
  };

  return [
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeValue(row[column])).join(","),
    ),
  ].join("\n");
}

export function openPrintableReport(title: string, html: string): boolean {
  const printWindow = window.open(
    "",
    "_blank",
    "noopener,noreferrer,width=1024,height=768",
  );

  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1, h2, h3 { color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; }
          .muted { color: #6b7280; }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();

  window.setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      printWindow.focus();
    }
  }, 250);

  return true;
}
