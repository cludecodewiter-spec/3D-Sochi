/**
 * The city map — the game's primary navigation, as in the reference build.
 * Every target and every informant hangout is a badge pinned to its district;
 * clicking a badge is how the player selects anything.
 *
 * Drawn procedurally: street grid, river, district labels, then badges laid
 * out in a small cluster around each district node so several cars in the
 * same neighbourhood stay individually clickable.
 */

export interface District {
  id: string
  x: number
  y: number
}

/** Ids match the `location` prefixes used in content/vehicles.ts. */
/** Coordinates are in the map's 300 × 240 viewBox. */
export const DISTRICTS: District[] = [
  { id: '北环', x: 152, y: 32 },
  { id: '码头区', x: 58, y: 62 },
  { id: '东区', x: 244, y: 66 },
  { id: '中城', x: 150, y: 118 },
  { id: '西区', x: 50, y: 134 },
  { id: '工业路', x: 248, y: 158 },
  { id: '南街', x: 132, y: 186 },
  { id: '河滨路', x: 48, y: 206 },
]

export const districtOf = (location: string): District | undefined =>
  DISTRICTS.find((d) => location.startsWith(d.id))

export interface MapPin {
  id: string
  kind: 'vehicle' | 'informant'
  location: string
  label: string
  /** Dimmed and struck through — already taken. */
  gone?: boolean
  /** Player is carrying intel about this target. */
  flagged?: boolean
}

const CAR_GLYPH =
  'M-5.2 1.2 h.9 a2 2 0 0 1 4 0 h1.6 a2 2 0 0 1 4 0 h.9 v-1.6 l-1.6-.5 l-2-2.2 h-4 l-2 2.2 l-1.8.5 z'
const HEAD_GLYPH = 'M0 -3.4 a2 2 0 1 1 0 4 a2 2 0 1 1 0 -4 M-3.6 4.6 a3.6 3.6 0 0 1 7.2 0 z'

function cluster(count: number, index: number): [number, number] {
  if (count === 1) return [0, -13]
  const spread = 20
  const perRow = Math.min(3, count)
  const row = Math.floor(index / perRow)
  const col = index % perRow
  const rowWidth = Math.min(perRow, count - row * perRow)
  return [(col - (rowWidth - 1) / 2) * spread, -13 + row * 19]
}

export interface MapOptions {
  pins: MapPin[]
  selectedId?: string | null
  heat?: number
  onSelect?: (id: string) => void
}

export function buildMap(options: MapOptions): HTMLElement {
  const { pins, selectedId, heat = 0, onSelect } = options

  const roads = [
    'M12 44 L288 50', 'M8 108 L292 114', 'M14 168 L286 162', 'M10 214 L290 208',
    'M58 12 L50 228', 'M150 8 L146 226', 'M242 18 L250 220',
    'M96 16 L104 224', 'M198 12 L196 228', 'M20 78 L280 84', 'M16 140 L284 136',
  ]

  const byDistrict = new Map<string, MapPin[]>()
  for (const pin of pins) {
    const district = districtOf(pin.location)
    if (!district) continue
    const list = byDistrict.get(district.id) ?? []
    list.push(pin)
    byDistrict.set(district.id, list)
  }

  const badges: string[] = []
  for (const district of DISTRICTS) {
    const list = byDistrict.get(district.id) ?? []
    list.forEach((pin, index) => {
      const [dx, dy] = cluster(list.length, index)
      const x = district.x + dx
      const y = district.y + dy
      const on = pin.id === selectedId
      const fill = pin.gone
        ? 'var(--paper-3)'
        : pin.kind === 'informant'
          ? '#cfae62'
          : 'var(--art-accent)'
      badges.push(`<g class="node" data-pin="${pin.id}" transform="translate(${x} ${y})">
        <title>${pin.label}</title>
        <circle class="ring" r="11.5" fill="none" stroke="var(--art-red)" stroke-width="2.4"
          opacity="${on ? 1 : 0}"/>
        <circle r="10" fill="#f0e4c6" opacity=".95"/>
        <circle r="8.6" fill="${fill}" stroke="var(--art-line)" stroke-width="1"
          opacity="${pin.gone ? 0.4 : 1}"/>
        <path d="${pin.kind === 'vehicle' ? CAR_GLYPH : HEAD_GLYPH}"
          fill="var(--art-line)" opacity="${pin.gone ? 0.4 : 0.92}" transform="scale(1.15)"/>
        ${pin.flagged ? '<circle cx="6.6" cy="-6.6" r="3" fill="var(--art-red)" stroke="var(--art-fill-2)" stroke-width=".8"/>' : ''}
        ${pin.gone ? '<line x1="-7" y1="-7" x2="7" y2="7" stroke="var(--art-red)" stroke-width="2"/>' : ''}
      </g>`)
    })
  }

  const wrap = document.createElement('div')
  wrap.className = 'mapwrap sunken'
  wrap.innerHTML = `<svg class="city-map" viewBox="0 0 300 240" role="img"
    preserveAspectRatio="xMidYMid meet">
    <rect width="300" height="240" fill="#f0e4c6"/>
    <g stroke="#cdba8f" stroke-width="2.2" fill="none" stroke-linecap="round">
      ${roads.map((d) => `<path d="${d}"/>`).join('')}
    </g>
    <path d="M0 226 Q70 208 130 220 Q210 236 300 206" stroke="#9db4c0" stroke-width="9"
      fill="none" opacity=".75"/>
    <text x="292" y="200" font-size="8" text-anchor="end" font-family="var(--sans)"
      fill="#7d95a3">河</text>
    ${
      heat >= 40
        ? `<circle cx="150" cy="118" r="${52 + heat / 1.4}" fill="var(--art-red)"
             opacity="${Math.min(0.2, heat / 460)}"/>`
        : ''
    }
    <g>${DISTRICTS.map(
      (d) => `<g>
        <circle cx="${d.x}" cy="${d.y}" r="2.6" fill="#a08a5c"/>
        <text x="${d.x}" y="${d.y + 14}" font-size="10" text-anchor="middle"
          font-family="var(--sans)" fill="#6f5c3a">${d.id}</text>
      </g>`,
    ).join('')}</g>
    ${badges.join('')}
  </svg>`

  if (onSelect) {
    wrap.addEventListener('click', (event) => {
      const node = (event.target as Element).closest('[data-pin]')
      const id = node?.getAttribute('data-pin')
      if (id) onSelect(id)
    })
  }
  return wrap
}
