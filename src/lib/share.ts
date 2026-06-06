// Egress for a single dream: plain text, a themed PNG card, or a one-page PDF.
//
// On a phone the primary path is the native share sheet (Web Share API with
// files); where that is unavailable (most desktops) we fall back to a download.
// All rendering is local — nothing leaves the device until the user picks a
// target in the OS share sheet. The PNG/PDF share the same canvas so they look
// identical.

import type { DreamEntry } from '../db/schema';
import { jpegToPdf } from './pdf';
import { canShareFiles } from './platform';

const THEME = {
  bg: '#0c0a09',
  panel: '#15120f',
  line: '#2b2620',
  ink: '#e6dcc7',
  inkDim: '#968f7d',
  inkFaint: '#5e574a',
  accent: '#d4a94e',
  serif: "'Iowan Old Style', 'Hoefler Text', Palatino, Georgia, serif",
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
};

function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Plain-text rendering of a dream (for "Share as text" / clipboard). */
export function dreamToText(d: DreamEntry): string {
  const lines = [d.title.trim() || 'Untitled dream', longDate(d.timestamp)];
  if (d.lucid) lines.push('Lucid');
  if (d.tags.length) lines.push('Tags: ' + d.tags.join(', '));
  lines.push('', d.body.trim());
  return lines.join('\n');
}

/** A filesystem-friendly base name for downloads. */
export function dreamFileBase(d: DreamEntry): string {
  const slug = (d.title.trim() || 'dream')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `dream-${new Date(d.timestamp).toISOString().slice(0, 10)}${slug ? `-${slug}` : ''}`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/** Render a dream as a themed card onto a canvas (used for both PNG and PDF). */
export function renderDreamCanvas(d: DreamEntry): HTMLCanvasElement {
  const DPR = 2; // fixed, so shared output quality is consistent across devices
  const W = 760;
  const PAD = 56;
  const maxW = W - PAD * 2;
  const TITLE_LH = 44;
  const BODY_LH = 30;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const titleText = d.title.trim() || 'Untitled dream';
  const bodyText = d.body.trim() || '(no text recorded)';

  // Measure first (unscaled context) to know the height.
  ctx.font = `600 34px ${THEME.serif}`;
  const titleLines = wrap(ctx, titleText, maxW);
  ctx.font = `19px ${THEME.sans}`;
  const bodyLines = wrap(ctx, bodyText, maxW);

  let h = PAD;
  h += titleLines.length * TITLE_LH;
  h += 10 + 24; // gap + meta line
  h += 28; // rule block
  h += bodyLines.length * BODY_LH;
  h += 46; // footer
  const H = Math.max(Math.ceil(h + PAD), 320);

  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);
  ctx.textBaseline = 'top';

  // Background + frame.
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = THEME.panel;
  ctx.fillRect(PAD - 18, PAD - 18, W - (PAD - 18) * 2, H - (PAD - 18) * 2);
  ctx.strokeStyle = THEME.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD - 18.5, PAD - 18.5, W - (PAD - 18) * 2, H - (PAD - 18) * 2);
  ctx.fillStyle = THEME.accent;
  ctx.fillRect(PAD - 18, PAD - 18, 3, H - (PAD - 18) * 2);

  let y = PAD;

  // Title.
  ctx.fillStyle = THEME.accent;
  ctx.font = `600 34px ${THEME.serif}`;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y);
    y += TITLE_LH;
  }
  y += 10;

  // Meta line: date · lucid · tags.
  const meta = [longDate(d.timestamp)];
  if (d.lucid) meta.push('lucid');
  if (d.tags.length) meta.push(d.tags.join(' · '));
  ctx.fillStyle = THEME.inkDim;
  ctx.font = `15px ${THEME.sans}`;
  ctx.fillText(meta.join('   ·   '), PAD, y);
  y += 24;

  // Rule.
  y += 14;
  ctx.strokeStyle = THEME.line;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 14;

  // Body.
  ctx.fillStyle = THEME.ink;
  ctx.font = `19px ${THEME.sans}`;
  for (const line of bodyLines) {
    if (line) ctx.fillText(line, PAD, y);
    y += BODY_LH;
  }

  // Footer.
  ctx.fillStyle = THEME.inkFaint;
  ctx.font = `13px ${THEME.sans}`;
  ctx.fillText('Athanor · Dream Diary', PAD, H - PAD - 6);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed.'))),
      type,
      quality,
    );
  });
}

export async function dreamToPng(d: DreamEntry): Promise<Blob> {
  return canvasToBlob(renderDreamCanvas(d), 'image/png');
}

export async function dreamToPdf(d: DreamEntry): Promise<Blob> {
  const canvas = renderDreamCanvas(d);
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
  return jpegToPdf(bytes, canvas.width, canvas.height);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Share a file through the OS share sheet, falling back to a download. */
export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  opts: { title?: string; text?: string } = {},
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type });
  if (canShareFiles() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // Otherwise fall through to a download.
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

/** Share plain text via the OS share sheet (returns false if unavailable). */
export async function shareText(title: string, text: string): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false;
  try {
    await navigator.share({ title, text });
  } catch {
    /* user cancelled — treat as handled */
  }
  return true;
}
