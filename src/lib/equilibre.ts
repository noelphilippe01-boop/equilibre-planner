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

export function requireEquilibreApi<K extends keyof Window['equilibre']>(
  method: K,
): NonNullable<Window['equilibre'][K]> {
  const api = getEquilibre()[method]
  if (typeof api !== 'function') {
    throw new Error(
      `Fonction "${String(method)}" indisponible. Fermez completement Equilibre Planner (fenetre + terminal) puis relancez : npm run electron:dev`,
    )
  }
  return api as NonNullable<Window['equilibre'][K]>
}
