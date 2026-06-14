import type { Recipe, ShoppingItem, WeeklyMenu } from '../types'

export function buildShoppingList(menu: WeeklyMenu, recipes: Recipe[]): ShoppingItem[] {
  const recipeMap = new Map(recipes.map((r) => [r.id, r]))
  const aggregated = new Map<string, ShoppingItem>()

  for (const meal of menu.meals) {
    const recipe = recipeMap.get(meal.recipeId)
    if (!recipe) continue

    for (const ing of recipe.ingredients) {
      const key = ing.name.toLowerCase().trim()
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity = mergeQuantities(existing.quantity, ing.quantity)
      } else {
        aggregated.set(key, {
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          checked: false,
        })
      }
    }
  }

  return Array.from(aggregated.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function mergeQuantities(a: string, b: string): string {
  const na = parseFloat(a)
  const nb = parseFloat(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return String(na + nb)
  return `${a} + ${b}`
}

export function getCurrentMenu(data: { weeklyMenus: WeeklyMenu[] }, weekStart: string): WeeklyMenu | undefined {
  return data.weeklyMenus.find((m) => m.weekStart === weekStart)
}
