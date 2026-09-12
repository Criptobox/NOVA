/* ============================================================
   NOVA v006 — Generador CSV compatible con Excel:
   BOM UTF-8 · separador ";" · fin de línea CRLF · escape de comillas.
   ============================================================ */

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // comillas solo si contiene ; " \n
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(';'), ...rows.map(r => r.map(cell).join(';'))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
