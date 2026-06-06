// Minimal, dependency-free PDF writer: wraps a single JPEG into a one-page PDF.
//
// JPEG is the one image format you can embed in a PDF *verbatim* — the JPEG
// byte stream is exactly what /DCTDecode expects, so no re-encoding or zlib is
// needed. We render a dream to a canvas, export it as JPEG, and drop those bytes
// straight into an image XObject sized to fill the page. That keeps the whole
// "share as PDF" path inside the no-dependency, offline-first contract.

/** Build a one-page PDF (image fills the page) from raw JPEG bytes. */
export function jpegToPdf(jpeg: Uint8Array, pxW: number, pxH: number): Blob {
  const enc = new TextEncoder();
  // 1px → 0.75pt ≈ 96 DPI, a sensible on-screen-to-paper mapping.
  const ptW = +(pxW * 0.75).toFixed(2);
  const ptH = +(pxH * 0.75).toFixed(2);

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (data: string | Uint8Array): void => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string): void => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );

  // Object 4 — the image stream (binary, written by hand to preserve bytes).
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
      `/Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push('\nendstream\nendobj\n');

  // Object 5 — content stream: place the image to fill the page.
  const content = `q\n${ptW} 0 0 ${ptH} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}endstream`);

  // Cross-reference table.
  const xrefStart = length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return new Blob([out], { type: 'application/pdf' });
}
