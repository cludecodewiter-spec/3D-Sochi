/**
 * Procedurally synthesised sound. DESIGN_v12.md §14 item 1 — the four-stage
 * heist "+ 音效" is the top priority in the whole project, so it cannot be
 * blocked on sourcing audio files. Everything here is WebAudio primitives.
 */

type Voice = 'tick' | 'pick' | 'clack' | 'engine' | 'siren' | 'heart' | 'fail' | 'cash'

let ctx: AudioContext | null = null
let enabled = true

function audio(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  void ctx.resume()
  return ctx
}

export const setAudioEnabled = (on: boolean): void => {
  enabled = on
}
export const audioEnabled = (): boolean => enabled

function env(
  c: AudioContext,
  node: AudioNode,
  { attack = 0.005, decay = 0.12, peak = 0.2, at = 0 }: Partial<{
    attack: number
    decay: number
    peak: number
    at: number
  }> = {},
): GainNode {
  const gain = c.createGain()
  const t = c.currentTime + at
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  node.connect(gain)
  gain.connect(c.destination)
  return gain
}

function tone(
  c: AudioContext,
  freq: number,
  type: OscillatorType,
  opts: Parameters<typeof env>[2] & { sweepTo?: number } = {},
): void {
  const osc = c.createOscillator()
  osc.type = type
  const t = c.currentTime + (opts.at ?? 0)
  osc.frequency.setValueAtTime(freq, t)
  if (opts.sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + (opts.decay ?? 0.12))
  }
  env(c, osc, opts)
  osc.start(t)
  osc.stop(t + (opts.attack ?? 0.005) + (opts.decay ?? 0.12) + 0.02)
}

function noise(c: AudioContext, duration: number, filterHz: number, peak = 0.15): void {
  const frames = Math.floor(c.sampleRate * duration)
  const buffer = c.createBuffer(1, frames, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterHz
  filter.Q.value = 1.4
  src.connect(filter)
  env(c, filter, { attack: 0.004, decay: duration, peak })
  src.start()
}

export function play(voice: Voice): void {
  const c = audio()
  if (!c) return
  switch (voice) {
    case 'tick':
      tone(c, 1_200, 'square', { peak: 0.03, decay: 0.03 })
      break
    // The lock. This is the sound the entire game is built around, so it is
    // three scrapes and a seat rather than one beep.
    case 'pick':
      noise(c, 0.05, 2_400, 0.09)
      noise(c, 0.04, 3_100, 0.07)
      break
    case 'clack':
      tone(c, 320, 'square', { peak: 0.16, decay: 0.06 })
      noise(c, 0.05, 1_100, 0.1)
      break
    case 'engine':
      tone(c, 60, 'sawtooth', { peak: 0.18, decay: 0.7, sweepTo: 130 })
      noise(c, 0.5, 220, 0.06)
      break
    case 'siren':
      tone(c, 720, 'sine', { peak: 0.1, decay: 0.35, sweepTo: 980 })
      tone(c, 980, 'sine', { peak: 0.1, decay: 0.35, sweepTo: 720, at: 0.36 })
      break
    case 'heart':
      tone(c, 62, 'sine', { peak: 0.28, decay: 0.16 })
      tone(c, 55, 'sine', { peak: 0.2, decay: 0.2, at: 0.2 })
      break
    case 'fail':
      tone(c, 180, 'sawtooth', { peak: 0.16, decay: 0.5, sweepTo: 62 })
      break
    case 'cash':
      tone(c, 880, 'triangle', { peak: 0.1, decay: 0.09 })
      tone(c, 1_320, 'triangle', { peak: 0.08, decay: 0.12, at: 0.07 })
      break
  }
}
