import './styles/main.css'
import { Ui } from './ui/app.js'

const root = document.getElementById('app')
if (!root) throw new Error('#app not found')

const ui = new Ui(root)
ui.render()

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
  if (!ui.session || ui.modalCount() > 0) return

  // [F] opens the dossier — but only once the dossier exists. §8.1: an
  // unlocked-out system has no shortcut either.
  if ((event.key === 'f' || event.key === 'F') && ui.mode !== 'heist') {
    if (!ui.game.state.unlocked.includes('dossier')) return
    ui.mode = ui.mode === 'dossier' ? 'map' : 'dossier'
    ui.render()
  }
})
