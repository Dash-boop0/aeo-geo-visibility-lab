// Hand-drawn inline SVG charts. Pure string builders (no DOM access) so they can be tested in Node.
// Marks carry series colour; all text uses CSS text tokens (classes) so light/dark themes work.
// Every mark has a data-tip attribute (custom hover tooltip) and a <title> (native fallback).

// Shared palette from CONVENTIONS.md, ordered so adjacent slots stay distinguishable for
// colour-vision deficiency (validated: worst adjacent CVD ΔE 11.9). Grey is reserved for "other".
export const PALETTE = ['#2F5BEA', '#E07A1F', '#1F9E89', '#7A5AF8', '#C2417A'];
export const OTHER_COLOR = '#8C8C8C';

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const round1 = (v) => Math.round(v * 10) / 10;

/** Colour for the i-th entity in a fixed order; beyond the palette, entities fold into grey. */
export function colorAt(i) {
  return i >= 0 && i < PALETTE.length ? PALETTE[i] : OTHER_COLOR;
}

/** Approximate text width in px for 12px Inter-like fonts (used to avoid clipping labels). */
export function textWidth(str, size = 12) {
  return String(str).length * size * 0.56;
}

function truncate(str, maxPx, size = 12) {
  const s = String(str);
  if (textWidth(s, size) <= maxPx) return s;
  const chars = Math.max(1, Math.floor(maxPx / (size * 0.56)) - 1);
  return `${s.slice(0, chars)}…`;
}

/** Bar path with 4px rounded data-end and square baseline end (horizontal bar from x0). */
function hBarPath(x0, y, w, h, r = 4) {
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${round1(x0)},${round1(y)}H${round1(x0 + w - rr)}Q${round1(x0 + w)},${round1(y)} ${round1(x0 + w)},${round1(y + rr)}`
    + `V${round1(y + h - rr)}Q${round1(x0 + w)},${round1(y + h)} ${round1(x0 + w - rr)},${round1(y + h)}H${round1(x0)}Z`;
}

/**
 * Horizontal bar chart of rates (0–1).
 * items: [{ label, value|null, num, den, color, lowN, tip? }]
 * Value labels sit at the bar tip as "54.4% (86/158)"; null values show "n/a (n=0)".
 */
export function barChart({ title, desc = '', items, width = 640, valueMax = 1 }) {
  const w = Math.max(280, Math.floor(width));
  const narrow = w < 520;
  const labelW = narrow ? 0 : Math.min(220, Math.round(w * 0.3));
  const valueW = 118;
  const barH = 18;
  const rowH = narrow ? 44 : 32;
  const top = 8;
  const plotX = labelW + (narrow ? 0 : 12);
  const plotW = Math.max(40, w - plotX - valueW);
  const h = top + items.length * rowH + 22;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * valueMax);
  const parts = [];
  parts.push(`<svg class="chart" role="img" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`<title>${esc(title)}</title><desc>${esc(desc)}</desc>`);
  for (const t of ticks) {
    const x = round1(plotX + (t / valueMax) * plotW);
    parts.push(`<line class="grid" x1="${x}" x2="${x}" y1="${top - 4}" y2="${h - 18}"/>`);
    parts.push(`<text class="axis" x="${x}" y="${h - 4}" text-anchor="${x < 14 ? 'start' : 'middle'}">${Math.round(t * 100)}%</text>`);
  }
  items.forEach((it, i) => {
    const yRow = top + i * rowH;
    const yBar = narrow ? yRow + 20 : yRow + (rowH - barH) / 2;
    const label = narrow ? truncate(it.label, w - 8) : truncate(it.label, labelW - 4);
    if (narrow) parts.push(`<text class="label" x="0" y="${yRow + 13}">${esc(label)}</text>`);
    else parts.push(`<text class="label" x="${labelW}" y="${round1(yBar + barH / 2 + 4)}" text-anchor="end">${esc(label)}</text>`);
    const valueText = it.value === null || it.value === undefined
      ? `n/a (n=${it.den ?? 0})`
      : `${pct(it.value)} (${it.num}/${it.den})${it.lowN ? ' ⚠' : ''}`;
    const tip = it.tip || `${it.label}: ${valueText}${it.lowN ? ' — low sample size (n<10)' : ''}`;
    const bw = it.value ? Math.max(2, (Math.min(it.value, valueMax) / valueMax) * plotW) : 0;
    parts.push(`<g class="mark" data-tip="${esc(tip)}" tabindex="0"><title>${esc(tip)}</title>`);
    parts.push(`<rect class="hit" x="${plotX}" y="${round1(yBar - 4)}" width="${round1(plotW + valueW)}" height="${barH + 8}" fill="transparent"/>`);
    if (bw > 0) parts.push(`<path d="${hBarPath(plotX, yBar, bw, barH)}" fill="${esc(it.color || PALETTE[0])}"${it.lowN ? ' fill-opacity="0.55"' : ''}/>`);
    parts.push(`<text class="value" x="${round1(plotX + bw + 6)}" y="${round1(yBar + barH / 2 + 4)}">${esc(valueText)}</text>`);
    parts.push('</g>');
  });
  parts.push('</svg>');
  return parts.join('');
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** White or near-black text, whichever contrasts better with the fill. */
export function inkOn(hex) {
  const L = luminance(hex);
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / (0.0144 + 0.05)) ? '#FFFFFF' : '#1C1C1A';
}

/**
 * 100% stacked horizontal bars (e.g. mention share per platform).
 * rows: [{ label, total, segments: [{ name, value (share 0–1), count, color }] }]
 * A row with total 0 shows "no tracked-brand mentions". Segments are separated by a 2px gap.
 */
export function stackedBarChart({ title, desc = '', rows, width = 640 }) {
  const w = Math.max(280, Math.floor(width));
  const narrow = w < 520;
  const labelW = narrow ? 0 : Math.min(180, Math.round(w * 0.24));
  const barH = 22;
  const rowH = narrow ? 50 : 36;
  const plotX = labelW + (narrow ? 0 : 12);
  const totalW = 64;
  const plotW = Math.max(60, w - plotX - totalW);
  const h = rows.length * rowH + 8;
  const parts = [];
  parts.push(`<svg class="chart" role="img" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`<title>${esc(title)}</title><desc>${esc(desc)}</desc>`);
  rows.forEach((row, i) => {
    const yRow = 4 + i * rowH;
    const y = narrow ? yRow + 20 : yRow + (rowH - barH) / 2;
    if (narrow) parts.push(`<text class="label" x="0" y="${yRow + 13}">${esc(truncate(row.label, w - 70))}</text>`);
    else parts.push(`<text class="label" x="${labelW}" y="${round1(y + barH / 2 + 4)}" text-anchor="end">${esc(truncate(row.label, labelW - 4))}</text>`);
    parts.push(`<text class="value" x="${w}" y="${round1(y + barH / 2 + 4)}" text-anchor="end">n=${row.total}${row.total > 0 && row.total < 10 ? ' ⚠' : ''}</text>`);
    if (!row.total) {
      parts.push(`<rect class="empty" x="${plotX}" y="${y}" width="${plotW}" height="${barH}" rx="4"/>`);
      parts.push(`<text class="muted-label" x="${plotX + 8}" y="${round1(y + barH / 2 + 4)}">no tracked-brand mentions</text>`);
      return;
    }
    const visible = row.segments.filter((s) => s.value > 0);
    const gap = 2;
    const usable = plotW - gap * Math.max(0, visible.length - 1);
    let x = plotX;
    visible.forEach((s, j) => {
      const sw = Math.max(1, s.value * usable);
      const first = j === 0;
      const last = j === visible.length - 1;
      const r = 4;
      const tip = `${row.label} · ${s.name}: ${pct(s.value)} of tracked-brand mentions (${s.count}/${row.total})`;
      parts.push(`<g class="mark" data-tip="${esc(tip)}" tabindex="0"><title>${esc(tip)}</title>`);
      if (first || last) {
        parts.push(`<rect x="${round1(x)}" y="${y}" width="${round1(sw)}" height="${barH}" rx="${Math.min(r, sw / 2)}" fill="${esc(s.color)}"/>`);
        // square off the inner side(s) so only the outer ends are rounded
        if (!first || !last) {
          const sx = first ? x + sw / 2 : x;
          parts.push(`<rect x="${round1(sx)}" y="${y}" width="${round1(sw / 2)}" height="${barH}" fill="${esc(s.color)}"/>`);
        }
      } else {
        parts.push(`<rect x="${round1(x)}" y="${y}" width="${round1(sw)}" height="${barH}" fill="${esc(s.color)}"/>`);
      }
      const lab = `${Math.round(s.value * 100)}%`;
      if (textWidth(lab, 11) + 10 < sw) {
        parts.push(`<text class="inbar" x="${round1(x + sw / 2)}" y="${round1(y + barH / 2 + 4)}" text-anchor="middle" fill="${inkOn(s.color)}">${lab}</text>`);
      }
      parts.push('</g>');
      x += sw + gap;
    });
  });
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Line chart of a rate across ordered categories (dates), one series per entity (platform).
 * series: [{ name, color, points: [{ x (category), value|null, num, den }] }]
 * Missing points (no data) are not drawn and break the line; they are never imputed as 0.
 */
export function lineChart({ title, desc = '', categories, series, width = 640, height = 240 }) {
  const w = Math.max(280, Math.floor(width));
  const left = 44;
  const right = 24;
  const top = 12;
  const bottom = 28;
  const plotW = w - left - right;
  const plotH = height - top - bottom;
  const xOf = (i) => (categories.length <= 1 ? left + plotW / 2 : left + (i / (categories.length - 1)) * plotW);
  const yOf = (v) => top + (1 - v) * plotH;
  const parts = [];
  parts.push(`<svg class="chart" role="img" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`<title>${esc(title)}</title><desc>${esc(desc)}</desc>`);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const y = round1(yOf(t));
    parts.push(`<line class="grid" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/>`);
    parts.push(`<text class="axis" x="${left - 6}" y="${y + 4}" text-anchor="end">${t * 100}%</text>`);
  }
  categories.forEach((c, i) => {
    const anchor = categories.length > 1 && i === 0 ? 'start' : (categories.length > 1 && i === categories.length - 1 ? 'end' : 'middle');
    parts.push(`<text class="axis" x="${round1(xOf(i))}" y="${height - 8}" text-anchor="${anchor}">${esc(c)}</text>`);
  });
  for (const s of series) {
    let d = '';
    let pen = false;
    categories.forEach((c, i) => {
      const p = s.points.find((pt) => pt.x === c);
      if (!p || p.value === null || p.value === undefined) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${round1(xOf(i))},${round1(yOf(p.value))}`;
      pen = true;
    });
    if (d.includes('L')) parts.push(`<path d="${d}" fill="none" stroke="${esc(s.color)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    categories.forEach((c, i) => {
      const p = s.points.find((pt) => pt.x === c);
      if (!p || p.value === null || p.value === undefined) return;
      const tip = `${s.name} · ${c}: ${pct(p.value)} (${p.num}/${p.den})${p.den < 10 ? ' — low n' : ''}`;
      parts.push(`<g class="mark" data-tip="${esc(tip)}" tabindex="0"><title>${esc(tip)}</title>`
        + `<circle cx="${round1(xOf(i))}" cy="${round1(yOf(p.value))}" r="12" fill="transparent"/>`
        + `<circle class="dot" cx="${round1(xOf(i))}" cy="${round1(yOf(p.value))}" r="5" fill="${esc(s.color)}"/></g>`);
    });
  }
  parts.push('</svg>');
  return parts.join('');
}

/** HTML legend: coloured swatch + text-token label (identity is never colour alone). */
export function legendHTML(items) {
  return `<ul class="legend">${items.map((it) => `<li><span class="swatch" style="background:${esc(it.color)}"></span>${esc(it.name)}</li>`).join('')}</ul>`;
}
