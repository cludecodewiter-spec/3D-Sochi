/**
 * Real-photo assets. CLAUDE.md §2.4 / §4.
 *
 * §8 lists both "emoji as icons" and "pure vector map badges" as anti-patterns:
 * the reference build uses photographs, and dropping them costs the whole
 * period texture. The 46px badge is therefore a **photo base + a high-contrast
 * corner glyph**, because §2.4's measured finding is that at 46px faces, cars
 * and signage stay legible while buildings and scenes turn to mush.
 *
 * Every people/* reference funnels through `portraitPhoto` so the prototype
 * portraits (randomuser.me — commercially unusable, see assets/CREDITS.md) can
 * be swapped for AI-generated faces by editing one function.
 */

export type PhotoKey = string

const BASE = `${import.meta.env.BASE_URL}assets`

/** JPEG for photographs, PNG for the pre-processed round icons. */
export const photoUrl = (key: PhotoKey): string => `${BASE}/${key}.jpg`
export const iconUrl = (key: string): string => `${BASE}/icons/${key}.png`

/**
 * ⚠️ These are real people (see assets/CREDITS.md). Legal for the prototype,
 * not for release. Every portrait in the game resolves through here, so
 * swapping the source for AI-generated faces is a one-line edit.
 */
export const PORTRAIT_COUNT = 12
export const portraitKey = (index: number): PhotoKey =>
  `people/p${String(((index % PORTRAIT_COUNT) + PORTRAIT_COUNT) % PORTRAIT_COUNT).padStart(2, '0')}`

/** §2.4 corner-badge glyphs, lifted from the prototype's GLY table. */
export const BADGE_PATHS: Record<string, string> = {
  plane: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  house: 'M12 2 1 11h3v10h6v-6h4v6h6V11h3z',
  P: 'M8 4h5a4.5 4.5 0 0 1 0 9h-2v7H8zm3 3v3h2a1.5 1.5 0 0 0 0-3z',
  cart: 'M2 3h3l3 11h10l3-8H7M9 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm9 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  fuel: 'M4 2h8a1 1 0 0 1 1 1v19H3V3a1 1 0 0 1 1-1zm1 3h6v5H5zm11 1 3 3v9a2 2 0 0 1-4 0v-5h-1V8z',
  badge: 'M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5z',
  fork: 'M6 2v7a3 3 0 0 0 2 2.8V22h2V11.8A3 3 0 0 0 12 9V2h-1.5v6H9.5V2H8v6H6.5V2zM17 2c-2 0-3 3-3 7 0 2.5.7 3.6 2 3.9V22h2V2z',
  tree: 'M12 2 5 12h4l-4 6h6v4h2v-4h6l-4-6h4z',
  bed: 'M2 7h2v6h18v7h-2v-3H4v3H2zm6 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm4 0h9a2 2 0 0 1 2 2v3h-11z',
  wrench: 'M21 5.5a5.5 5.5 0 0 1-7.6 5.1L5 19l-2-2 8.4-8.4A5.5 5.5 0 0 1 18.4 2l-3 3 1.6 1.6 3-3c.6.8 1 1.8 1 2.9z',
  car: 'M3 14 5 9h14l2 5v5h-3a2 2 0 0 1-4 0h-4a2 2 0 0 1-4 0H3z',
  glass: 'M3 3h18l-8 9v7h4v2H7v-2h4v-7z',
  mask: 'M4 7h16l-1.2 12.2A2 2 0 0 1 16.8 21H7.2a2 2 0 0 1-2-1.8zM9 7a3 3 0 0 1 6 0',
  fist: 'M5 9c0-1 .8-2 2-2h9a4 4 0 0 1 4 4v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zm2-4h8v2H7z',
  tow: 'M2 15h4l1-5h7l3 5h5v3h-2a2 2 0 0 1-4 0H8a2 2 0 0 1-4 0H2zM14 5h6v2h-6z',
}

/** §2.4 colour coding: default brown / my property → green / hostile → red. */
export type BadgeTone = 'default' | 'mine' | 'hostile'

const TONE: Record<BadgeTone, string> = {
  default: '#4a3a1e',
  mine: '#137a20',
  hostile: '#a81c08',
}

export interface PhotoBadgeOptions {
  photo: PhotoKey
  glyph?: keyof typeof BADGE_PATHS | string
  tone?: BadgeTone
  size?: number
  selected?: boolean
  gone?: boolean
  /** Small red dot — the player holds intel about this target. */
  flagged?: boolean
}

/**
 * The map badge: a circular photo with a glyph in the corner. Built as one
 * inline SVG so it drops straight into the map's coordinate space.
 */
export function photoBadge(options: PhotoBadgeOptions): string {
  const { photo, glyph, tone = 'default', size = 46, selected, gone, flagged } = options
  const r = size / 2
  const id = `clip-${photo.replace(/\W/g, '-')}-${size}`
  const badgeR = size * 0.217 // §2.4: 20px badge on a 46px icon
  const bx = r * 0.68
  const path = glyph ? BADGE_PATHS[glyph] : undefined

  // x/y pull the nested SVG back by half its size: a nested <svg> anchors its
  // top-left at the current origin, so without this the badge hangs down-right
  // of its map coordinate and sits on top of the district label.
  return `<svg viewBox="${-r} ${-r} ${size} ${size}" width="${size}" height="${size}"
    x="${-r}" y="${-r}" role="img" aria-hidden="true"
    style="display:block;overflow:visible">
    <defs><clipPath id="${id}"><circle r="${r - 3}"/></clipPath></defs>
    <image href="${photoUrl(photo)}" x="${-r + 3}" y="${-r + 3}"
      width="${size - 6}" height="${size - 6}" preserveAspectRatio="xMidYMid slice"
      clip-path="url(#${id})" opacity="${gone ? 0.35 : 1}"/>
    <circle r="${r - 3}" fill="none" stroke="#4a3a1e" stroke-width="5"/>
    <circle r="${r - 5.5}" fill="none" stroke="#f5e3c2" stroke-width="1" opacity=".55"/>
    ${
      path
        ? `<g transform="translate(${bx} ${bx})">
             <circle r="${badgeR}" fill="#f5e3c2" stroke="${TONE[tone]}" stroke-width="2"/>
             <g transform="translate(${-badgeR * 0.62} ${-badgeR * 0.62}) scale(${(badgeR * 1.24) / 24})">
               <path d="${path}" fill="${TONE[tone]}"/>
             </g>
           </g>`
        : ''
    }
    ${flagged ? `<circle cx="${-bx}" cy="${-bx}" r="${badgeR * 0.5}" fill="#a81c08" stroke="#f5e3c2" stroke-width="1.6"/>` : ''}
    ${selected ? `<circle r="${r - 0.5}" fill="none" stroke="#a81c08" stroke-width="3"/>` : ''}
    ${gone ? `<line x1="${-r * 0.6}" y1="${-r * 0.6}" x2="${r * 0.6}" y2="${r * 0.6}" stroke="#a81c08" stroke-width="3"/>` : ''}
  </svg>`
}

/** A plain framed photo for panels and slots (§2.3 sizes). */
export function photoTile(key: PhotoKey, w: number, h: number): string {
  return `<img src="${photoUrl(key)}" width="${w}" height="${h}" alt=""
    style="display:block;width:${w}px;height:${h}px;object-fit:cover"/>`
}
