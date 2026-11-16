export function serializeCsv(columns, rows) {
  const cell = value => {
    let text = String(value ?? "");
    if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\ufeff" + [columns.map(c => c.label), ...rows.map(r => columns.map(c => r.cells[c.key]))].map(row => row.map(cell).join(";")).join("\r\n");
}
export function downloadCsv(filename, columns, rows) {
  const url = URL.createObjectURL(new Blob([serializeCsv(columns, rows)], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
