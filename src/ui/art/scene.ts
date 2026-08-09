/**
 * Location illustrations. DESIGN_v12.md §10.2.
 *
 * One drawing per venue, in the flat line-art register of the rest of the art
 * layer. These fill the picture well in the left-hand info panel — the place
 * the reference build puts a photograph — so selecting a target shows you
 * somewhere rather than another paragraph.
 *
 * Everything is geometry on a 200 × 112 grid. A vehicle's scene nests its own
 * silhouette into the foreground, so the same car reads consistently on the
 * map badge, in the scene and in the garage rack.
 */

import type { Era } from '../../engine/types.js'
import type { BodyType, VenueKey } from '../../content/types.js'
import { carInner } from './car.js'

const SKY = '#efe4c8'
const FAR = '#dccca4'
const NEAR = '#cbb88d'
const LINE = 'var(--art-line)'
const SOFT = 'var(--art-line-soft)'
const GROUND = 90

const stroke = (d: string, w = 1.5, color = LINE): string =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`

const shape = (d: string, fill = FAR, w = 1.5): string =>
  `<path d="${d}" fill="${fill}" stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round"/>`

const box = (x: number, y: number, w: number, h: number, fill = FAR): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${LINE}" stroke-width="1.4"/>`

const pane = (x: number, y: number, w: number, h: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${SKY}" stroke="${SOFT}" stroke-width="1"/>`

/** Window grid — the quickest way to make a block read as inhabited. */
function grid(x: number, y: number, cols: number, rows: number, gap = 20): string {
  const out: string[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      out.push(pane(x + c * gap, y + r * (gap - 4), 11, 9))
    }
  }
  return out.join('')
}

const label = (x: number, y: number, text: string, size = 8): string =>
  `<text x="${x}" y="${y}" font-size="${size}" font-family="var(--mono)" fill="${SOFT}"
    text-anchor="middle" letter-spacing="1">${text}</text>`

const VENUES: Record<VenueKey, () => string> = {
  alley: () =>
    shape(`M0 4 L54 26 L54 ${GROUND} L0 ${GROUND} Z`, NEAR) +
    shape(`M200 0 L148 24 L148 ${GROUND} L200 ${GROUND} Z`, NEAR) +
    box(54, 26, 94, GROUND - 26, FAR) +
    // the one light on the wall, and nothing else
    stroke('M40 30 L52 34', 1.4) +
    `<circle cx="38" cy="30" r="5" fill="${SKY}" stroke="${LINE}" stroke-width="1.4"/>` +
    stroke('M30 26 L38 30 L34 38', 1, SOFT) +
    box(96, 62, 34, 28, NEAR) +
    stroke('M96 70 h34', 1.2, SOFT) +
    stroke('M8 96 q22 -5 44 0 M120 100 q26 -4 50 0', 1.2, SOFT),

  warehouse: () =>
    shape(`M8 42 L100 14 L192 42 Z`, NEAR) +
    box(16, 42, 168, GROUND - 42) +
    box(70, 54, 60, GROUND - 54, NEAR) +
    stroke('M70 62 h60 M70 70 h60 M70 78 h60', 1.1, SOFT) +
    pane(28, 52, 22, 14) +
    pane(150, 52, 22, 14) +
    box(140, 68, 18, 22, FAR) +
    box(158, 74, 16, 16, FAR),

  store: () =>
    box(14, 24, 172, GROUND - 24) +
    shape(`M8 42 L192 42 L184 56 L16 56 Z`, NEAR) +
    stroke('M40 42 v14 M72 42 v14 M104 42 v14 M136 42 v14 M168 42 v14', 1, SOFT) +
    pane(30, 60, 46, 30) +
    box(96, 60, 26, GROUND - 60, SKY) +
    // stacked timber out front
    box(136, 74, 44, 6, NEAR) +
    box(136, 80, 44, 6, NEAR) +
    label(100, 36, '建 材'),

  laundry: () =>
    box(16, 26, 168, GROUND - 26) +
    box(16, 26, 168, 14, NEAR) +
    label(100, 37, '自 助 洗 衣') +
    pane(30, 48, 140, 42) +
    `<circle cx="60" cy="70" r="12" fill="${SKY}" stroke="${LINE}" stroke-width="1.4"/>` +
    `<circle cx="100" cy="70" r="12" fill="${SKY}" stroke="${LINE}" stroke-width="1.4"/>` +
    `<circle cx="140" cy="70" r="12" fill="${SKY}" stroke="${LINE}" stroke-width="1.4"/>` +
    stroke('M52 70 a8 8 0 0 1 16 0 M92 70 a8 8 0 0 1 16 0 M132 70 a8 8 0 0 1 16 0', 1, SOFT),

  apartment: () =>
    box(34, 4, 132, GROUND - 4) +
    grid(46, 14, 5, 3) +
    box(84, 66, 32, GROUND - 66, NEAR) +
    stroke('M78 66 h44', 2) +
    // the fixed bay, marked out on the tarmac
    stroke(`M20 ${GROUND + 8} h44 M20 ${GROUND + 8} v14 M64 ${GROUND + 8} v14`, 1.4, SOFT),

  house: () =>
    shape(`M22 46 L100 12 L178 46 Z`, NEAR) +
    box(36, 46, 128, GROUND - 46) +
    box(88, 62, 26, GROUND - 62, NEAR) +
    pane(50, 58, 26, 18) +
    pane(124, 58, 26, 18) +
    // the driveway running to the kerb
    stroke(`M78 ${GROUND} L58 112 M122 ${GROUND} L142 112`, 1.4, SOFT),

  lot: () =>
    box(20, 30, 160, 26, FAR) +
    label(100, 47, '超 市') +
    stroke(`M0 ${GROUND} h200`, 1.6) +
    stroke('M14 112 L34 94 M54 112 L74 94 M94 112 L114 94 M134 112 L154 94', 1.6, SOFT) +
    stroke('M170 94 v-42', 1.6) +
    shape('M164 48 h14 v7 h-14 Z', NEAR),

  gas: () =>
    box(18, 20, 164, 13, NEAR) +
    stroke('M28 33 v34 M172 33 v34', 2.4) +
    box(84, 50, 24, 40) +
    stroke('M90 58 h12', 1.6, SOFT) +
    stroke('M108 60 h10 v16', 1.4) +
    box(132, 44, 30, 22, FAR) +
    label(147, 58, '$') +
    stroke('M147 66 v24', 1.8),

  deck: () =>
    box(0, 0, 200, 18, NEAR) +
    stroke('M0 10 h200', 1.2, SOFT) +
    stroke('M24 18 v72 M176 18 v72', 6, NEAR) +
    stroke('M24 18 v72 M176 18 v72', 1.4) +
    box(60, 26, 80, 12, FAR) +
    label(100, 35, 'B2', 9) +
    // fluorescent strips receding
    stroke('M56 24 h88 M64 44 h72 M72 64 h56', 1.6, SOFT) +
    stroke('M100 70 v18 M90 80 L100 90 L110 80', 2, LINE),

  bar: () =>
    box(18, 22, 164, GROUND - 22, NEAR) +
    // the bracket where a sign would go, with no sign on it
    stroke('M92 22 v-10 h30', 1.6) +
    stroke('M118 12 v8', 1.2, SOFT) +
    box(80, 54, 30, GROUND - 54, FAR) +
    stroke('M84 70 h4', 2) +
    pane(36, 46, 32, 22) +
    stroke('M36 46 l32 22 M68 46 l-32 22', 1, SOFT) +
    box(128, 48, 34, 24, FAR),

  diner: () =>
    box(16, 26, 168, GROUND - 26) +
    box(16, 26, 168, 15, NEAR) +
    label(100, 38, '2 4 H') +
    pane(28, 48, 66, 42) +
    pane(106, 48, 66, 42) +
    // counter and stools through the glass
    stroke('M32 78 h58 M118 78 h50', 1.6, SOFT) +
    `<circle cx="46" cy="70" r="4" fill="${SKY}" stroke="${SOFT}" stroke-width="1"/>` +
    `<circle cx="64" cy="70" r="4" fill="${SKY}" stroke="${SOFT}" stroke-width="1"/>` +
    `<circle cx="130" cy="70" r="4" fill="${SKY}" stroke="${SOFT}" stroke-width="1"/>`,

  shop: () =>
    box(14, 24, 172, GROUND - 24) +
    box(56, 40, 90, GROUND - 40, NEAR) +
    stroke('M56 50 h90 M56 60 h90 M56 70 h90', 1.1, SOFT) +
    // half-open, which is how you get in round the back
    stroke('M56 40 h90', 2.4) +
    box(158, 62, 18, 28, FAR) +
    stroke('M158 70 h18 M158 78 h18', 1.1, SOFT) +
    stroke('M26 44 v18 M22 48 h8 M22 56 h8', 1.4) +
    label(101, 34, '修 车'),

  cafe: () =>
    box(20, 24, 160, GROUND - 24) +
    shape('M12 40 L188 40 L180 54 L20 54 Z', NEAR) +
    stroke('M44 40 v14 M76 40 v14 M108 40 v14 M140 40 v14', 1, SOFT) +
    pane(36, 58, 48, 32) +
    box(100, 58, 24, GROUND - 58, SKY) +
    // two tables on the pavement
    stroke(`M42 ${GROUND + 12} h22 M53 ${GROUND + 12} v10`, 1.6) +
    stroke(`M120 ${GROUND + 12} h22 M131 ${GROUND + 12} v10`, 1.6),
}

export interface SceneOptions {
  venue: VenueKey
  /** Draws the car into the foreground of its own location. */
  car?: { bodyType: BodyType; era: Era; gone?: boolean; condition?: number }
  height?: number
}

export function venueScene({ venue, car, height = 96 }: SceneOptions): string {
  const backdrop = VENUES[venue]()
  const foreground = car
    ? `<svg x="52" y="62" width="112" height="43" viewBox="0 0 202 78"
         preserveAspectRatio="xMidYMid meet">${carInner({
           bodyType: car.bodyType,
           era: car.era,
           ...(car.gone ? { gone: true } : {}),
           ...(car.condition !== undefined ? { condition: car.condition } : {}),
         })}</svg>`
    : ''

  return `<svg class="scene" viewBox="0 0 200 112" role="img" aria-hidden="true"
    style="display:block;width:100%;height:${height}px" preserveAspectRatio="xMidYMid slice">
    <rect width="200" height="112" fill="${SKY}"/>
    ${backdrop}
    <rect x="0" y="${GROUND}" width="200" height="${112 - GROUND}" fill="${NEAR}" opacity=".55"/>
    <line x1="0" y1="${GROUND}" x2="200" y2="${GROUND}" stroke="${LINE}" stroke-width="1.6"/>
    ${foreground}
  </svg>`
}
