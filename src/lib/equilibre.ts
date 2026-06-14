export function isElectronApp(): boolean {
  return typeof window !== 'undefined' && !!window.equilibre
}

export function getEquilibre() {
  if (!window.equilibre) {
    throw new Error(
      "Pont Electron indisponible. Fermez l'onglet navigateur (localhost:5173) et utilisez la fenetre Equilibre Planner lancee via npm run electron:dev.",
    )
  }
  return window.equilibre
}
