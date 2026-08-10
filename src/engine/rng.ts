/**
 * Seeded, counter-based RNG. DESIGN_v12.md §9.3.
 *
 * Every random number in the game goes through here. The state is just
 * `{ seed, step }`, so restoring a save is O(1) — we hash (seed, step)
 * rather than iterating a stream forward. That makes saves fully
 * reproducible, which in turn makes the whole engine deterministically
 * testable.
 */

export interface RngState {
  seed: number
  step: number
}

/** splitmix32-style avalanche over a (seed, step) pair. */
function hash32(seed: number, step: number): number {
  let a = (seed ^ Math.imul(step + 1, 0x9e3779b9)) | 0
  a = (a + 0x6d2b79f5) | 0
  let t = a ^ (a >>> 15)
  t = Math.imul(t, 0x2c1b3c6d)
  t ^= t >>> 12
  t = Math.imul(t, 0x297a2d39)
  t ^= t >>> 15
  return t >>> 0
}

export class Rng {
  #seed: number
  #step: number

  constructor(seed: number, step = 0) {
    this.#seed = seed | 0
    this.#step = step
  }

  static from(state: RngState): Rng {
    return new Rng(state.seed, state.step)
  }

  get state(): RngState {
    return { seed: this.#seed, step: this.#step }
  }

  /** Uniform in [0, 1). */
  next(): number {
    return hash32(this.#seed, this.#step++) / 0x1_0000_0000
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`int(${min}, ${max}): empty range`)
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick() from empty array')
    return items[this.int(0, items.length - 1)] as T
  }

  /** Fisher-Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[out[i], out[j]] = [out[j] as T, out[i] as T]
    }
    return out
  }

  /**
   * A named substream. Used so that unrelated systems drawing numbers in a
   * different order cannot perturb each other's results — content authoring
   * stays stable as the game grows.
   */
  fork(label: string): Rng {
    let h = 0
    for (let i = 0; i < label.length; i++) h = (Math.imul(h, 31) + label.charCodeAt(i)) | 0
    return new Rng(hash32(this.#seed, h) | 0, 0)
  }
}
