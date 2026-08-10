/**
 * The icon library. DESIGN_v12.md §10.2.
 *
 * Every glyph is authored on a 24 × 24 grid and returned as SVG markup, so the
 * same shape works as a map badge, a panel caption and a list bullet without
 * being redrawn. Nothing here loads a file — the whole set is geometry.
 *
 * The rule that matters: an icon must say *which one*, not merely *what kind*.
 * A single generic car silhouette on every vehicle pin tells the player nothing
 * they did not already know from the pin's colour; a wagon that reads as a
 * wagon lets them pick a target off the map at a glance.
 */

import type { BodyType, RoleKey, VenueKey } from '../../content/types.js'

export type Glyph = (color: string) => string

const filled = (d: string): Glyph => (c) => `<path d="${d}" fill="${c}"/>`

const lined =
  (d: string, width = 2, color?: string): Glyph =>
  (c) =>
    `<path d="${d}" fill="none" stroke="${color ?? c}" stroke-width="${width}"
      stroke-linecap="round" stroke-linejoin="round"/>`

const group =
  (...parts: ((c: string) => string)[]): Glyph =>
  (c) =>
    parts.map((part) => part(c)).join('')

/**
 * A two-tone glyph. Vehicles need it: at badge size the only thing that
 * separates a wagon from a coupe is the roofline, and a roofline is only
 * visible if the glass is knocked back out of the silhouette.
 */
export type TwoTone = (color: string, background: string) => string

const car =
  (shell: string, glass: string[], front: number, rear: number): TwoTone =>
  (c, bg) =>
    `<path d="${shell}" fill="${c}"/>` +
    glass.map((g) => `<path d="${g}" fill="${bg}"/>`).join('') +
    `<circle cx="${front}" cy="18.2" r="2.9" fill="${c}"/>` +
    `<circle cx="${rear}" cy="18.2" r="2.9" fill="${c}"/>` +
    `<circle cx="${front}" cy="18.2" r="1.1" fill="${bg}"/>` +
    `<circle cx="${rear}" cy="18.2" r="1.1" fill="${bg}"/>`

// ── vehicles, one silhouette per body type ────────────────────────────────

export const VEHICLE_GLYPHS: Record<BodyType, TwoTone> = {
  // Deliberately exaggerated. An icon is not a scale model — at badge size the
  // only thing that survives is the greenhouse shape, so each body type's
  // roofline is pushed to the edge of caricature and the glass is knocked out
  // in one piece so it reads as that shape.

  // three boxes: long hood, roof in the middle only, long boot
  sedan: car(
    'M1 18.8 L1 13.6 Q1 12.4 2.4 12.2 L7.4 11.6 L9.6 6.6 Q10 5.8 11 5.8 ' +
      'L14.2 5.8 Q15.2 5.8 15.6 6.6 L17.8 11.6 L22 12.2 Q23 12.4 23 13.6 L23 18.8 Z',
    ['M10.5 7.4 L9 11.2 L16.3 11.2 L14.8 7.4 Z'],
    7,
    17,
  ),

  // the roof runs to the very tail — there is no boot at all
  wagon: car(
    'M1 18.8 L1 13.6 Q1 12.4 2.4 12.2 L6.4 11.6 L8.4 6 Q8.8 5.2 9.8 5.2 ' +
      'L21.4 5.2 Q22.7 5.2 22.9 6.6 L23 13.6 L23 18.8 Z',
    ['M9.3 6.8 L7.7 11.2 L21.3 11.2 L21.3 6.8 Z'],
    6.6,
    17.6,
  ),

  // a short cab, then a step down into an open bed with the tailgate up
  pickup: car(
    'M1 18.8 L1 13.6 Q1 12.4 2.4 12.2 L5.6 11.6 L7.8 5.8 Q8.2 5 9.2 5 ' +
      'L13.2 5 Q14 5 14.2 5.9 L14.8 12.4 L21 12.4 L21 9.4 L23 9.4 L23 18.8 Z',
    ['M9 6.4 L7.5 11.2 L13.5 11.2 L13.2 6.4 Z'],
    6.4,
    18,
  ),

  // a wedge that peaks early and falls away all the way to the tail
  coupe: car(
    'M1 18.8 L1 14 Q1 12.8 2.2 12.6 L6 11.8 L8.6 6.6 Q9.4 5.4 11.4 5.4 ' +
      'L13.6 5.4 Q15.5 5.6 16.9 7.4 L22.2 13 Q23 13.4 23 14.2 L23 18.8 Z',
    ['M10.6 6.8 L9.1 11.4 L18 11.4 L14.6 7 Z'],
    7,
    17.2,
  ),

  // one unbroken dome, nose and tail both low
  sleek: car(
    'M0.8 18.8 L0.8 14.4 Q1.2 12.8 3.8 12.4 L6.6 12 Q9.6 5.8 14 5.6 ' +
      'L16.4 5.6 Q20 6 21.6 9.6 L22.8 12.8 Q23.2 13.4 23.2 14.4 L23.2 18.8 Z',
    ['M13.4 7 Q10.4 8.4 8.7 11.4 L19.5 11.4 Q18 7.8 15.2 7 Z'],
    6.8,
    17.4,
  ),
}

// ── informants, one per trade ─────────────────────────────────────────────

export const ROLE_GLYPHS: Record<RoleKey, Glyph> = {
  // 码头工人 — a crate on a hook
  dock: group(
    lined('M12 9.5 V6 Q12 3.2 9.4 3.2 Q7.2 3.2 7.2 5.6', 1.8),
    lined('M5.4 9.8 h13.2 v10.6 H5.4 Z', 1.8),
    lined('M5.4 9.8 L18.6 20.4 M18.6 9.8 L5.4 20.4', 1.4),
  ),
  // 夜班护士 — the cross
  nurse: filled('M9.6 3.4 h4.8 v6.2 h6.2 v4.8 h-6.2 v6.2 H9.6 v-6.2 H3.4 V9.6 h6.2 Z'),
  // 修车行学徒 — an open-end spanner
  mechanic: group(
    lined(
      'M18.7 4.1 a5.1 5.1 0 0 0-6.7 6.7 L4.6 18.2 a2.1 2.1 0 1 0 2.9 2.9 ' +
        'L14.9 13.7 a5.1 5.1 0 0 0 6.7-6.7 L18.1 10.5 L14.3 9.6 L13.4 5.8 Z',
      1.8,
    ),
  ),
  // 保险公司理赔员 — the briefcase
  adjuster: group(
    lined('M3.6 8.8 h16.8 v11.6 H3.6 Z', 1.8),
    lined('M9 8.8 V6.4 Q9 5 10.4 5 h3.2 Q15 5 15 6.4 V8.8', 1.8),
    lined('M3.6 14 h16.8', 1.4),
  ),
}

// ── venues ────────────────────────────────────────────────────────────────

export const VENUE_GLYPHS: Record<VenueKey, Glyph> = {
  alley: group(
    lined('M4 3 v18 M20 3 v18', 1.8),
    lined('M4 8 h4 M16 8 h4 M4 14 h4 M16 14 h4', 1.2),
    lined('M12 6 v9 M9.6 6 h4.8', 1.6),
    filled('M9.6 3.6 h4.8 v2.2 H9.6 Z'),
  ),
  warehouse: group(
    lined('M1.4 9.8 L12 4.6 L22.6 9.8', 1.8),
    lined('M2.8 9.8 h18.4 V21 H2.8 Z', 1.8),
    lined('M7 12.6 h10 V21 H7 Z', 1.6),
    lined('M7 15.4 h10 M7 18.2 h10', 1.1),
  ),
  store: group(
    lined('M3.6 12.8 V21 h16.8 v-8.2', 1.8),
    filled('M1.6 7.8 h20.8 L20.4 12.8 H3.6 Z'),
    lined('M6.6 7.8 L5.6 12.8 M12 7.8 v5 M17.4 7.8 L18.4 12.8', 1, 'var(--art-fill-2)'),
    lined('M9 21 v-4.6 h6 V21', 1.6),
  ),
  laundry: group(
    lined('M3.6 3.4 h16.8 v17.4 H3.6 Z', 1.8),
    lined('M12 14 m-4.6 0 a4.6 4.6 0 1 0 9.2 0 a4.6 4.6 0 1 0-9.2 0', 1.6),
    filled('M6 5.8 h2.6 v1.8 H6 Z M10 5.8 h2.6 v1.8 H10 Z'),
  ),
  apartment: group(
    lined('M5 2.8 h14 v18.4 H5 Z', 1.8),
    filled(
      'M7.6 5.8 h2.6 v2.6 H7.6 Z M13.8 5.8 h2.6 v2.6 h-2.6 Z ' +
        'M7.6 10.6 h2.6 v2.6 H7.6 Z M13.8 10.6 h2.6 v2.6 h-2.6 Z',
    ),
    lined('M10.4 21.2 v-5.2 h3.2 v5.2', 1.6),
  ),
  house: group(
    lined('M2.2 12.4 L12 3.4 L21.8 12.4', 1.8),
    lined('M4.6 12.4 V21 h14.8 v-8.6', 1.8),
    filled('M16.2 5.2 h2.6 v4 h-2.6 Z'),
    lined('M9.8 21 v-5.6 h4.4 V21', 1.6),
    filled('M6.6 14.2 h2.4 v2.4 H6.6 Z'),
  ),
  lot: group(
    lined('M3.4 3.4 h17.2 v17.2 H3.4 Z', 1.8),
    lined('M9.6 17 V7.4 h3.6 a3 3 0 0 1 0 6 H9.6', 2),
  ),
  atm: group(
    lined('M3.4 5.4 h17.2 v10.4 H3.4 Z', 1.8),
    lined('M3.4 8.6 h17.2', 1.4),
    filled('M6 11.4 h6 v2 H6 Z'),
    lined('M8 15.8 v4.4 M16 15.8 v4.4 M6.4 20.2 h11.2', 1.6),
  ),
  gas: group(
    lined('M3.4 21 V5.4 Q3.4 3.6 5.4 3.6 h6.4 q2 0 2 1.8 V21 Z', 1.8),
    lined('M3.4 9.4 h10.4', 1.4),
    lined('M14 8 h3.2 q2.4 0 2.4 2.4 V16 a1.8 1.8 0 1 0 1.8-1.8', 1.6),
  ),
  deck: group(
    lined('M3.4 3.4 h17.2 v9 H3.4 Z', 1.8),
    lined('M7 6.6 h3.4 M13.6 6.6 h3.4 M7 9.6 h10', 1.2),
    lined('M12 14.4 v5.4 M8.6 16.6 L12 20.4 L15.4 16.6', 1.8),
  ),
  bar: group(
    lined('M4.2 7.6 h11 v10.2 a2.6 2.6 0 0 1-2.6 2.6 H6.8 a2.6 2.6 0 0 1-2.6-2.6 Z', 1.8),
    lined('M15.2 10 h2.4 a3.2 3.2 0 0 1 0 6.4 h-2.4', 1.8),
    filled('M3.4 4.2 q2.4-2 5.4 0 q2.6-1.8 5.4 0 q1.4 1 1.4 3.4 H4.2 q0-2.4-.8-3.4 Z'),
    lined('M7.4 12 v5 M12 12 v5', 1.1),
  ),
  diner: group(
    filled('M3.4 10.6 a8.6 4.6 0 0 1 17.2 0 Z'),
    lined('M3.4 12.6 h17.2', 2.2),
    lined('M3.8 15 a8.2 3.6 0 0 0 16.4 0', 1.8),
  ),
  shop: group(
    lined('M3.4 8.6 h17.2 v12.4 H3.4 Z', 1.8),
    lined('M3.4 12 h17.2 M3.4 15.2 h17.2 M3.4 18.4 h17.2', 1.2),
    lined('M12 3 v5.6 M9 5 h6', 1.6),
  ),
  cafe: group(
    lined('M4 9.4 h11 v6.2 a4.2 4.2 0 0 1-4.2 4.2 H8.2 A4.2 4.2 0 0 1 4 15.6 Z', 1.8),
    lined('M15 10.8 h2.2 a2.6 2.6 0 0 1 0 5.2 H15', 1.6),
    lined('M7.4 6.4 q1.4-1.6 0-3.2 M11.6 6.4 q1.4-1.6 0-3.2', 1.4),
  ),
}

/** Wraps a glyph in a standalone 24 × 24 SVG. */
export function iconSvg(glyph: Glyph, size = 18, color = 'var(--art-line)'): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"
    role="img" aria-hidden="true" style="display:block">${glyph(color)}</svg>`
}

/** Emits a glyph already positioned for a map badge, centred on the origin. */
export function badgeGlyph(
  glyph: Glyph | TwoTone,
  color: string,
  scale = 0.86,
  background = 'transparent',
): string {
  const body = (glyph as TwoTone)(color, background)
  return `<g transform="translate(${-12 * scale} ${-12 * scale}) scale(${scale})">${body}</g>`
}
