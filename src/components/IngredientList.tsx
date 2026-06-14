import type { Ingredient } from '../types'
import { getIngredientParts, getScaledIngredientQuantityLabel } from '../lib/recipeFormat'

interface IngredientListProps {
  ingredients: Ingredient[]
  /** Portions prevues par la recette (colonne de reference). */
  recipeServings?: number
  /** Nombre de personnes saisi pour le creneau (colonne adaptee). */
  guestCount?: number
}

export default function IngredientList({
  ingredients,
  recipeServings,
  guestCount,
}: IngredientListProps) {
  if (!ingredients.length) return null

  const baseServings = recipeServings && recipeServings > 0 ? recipeServings : 1
  const showGuestColumn =
    guestCount != null && guestCount > 0 && recipeServings != null && recipeServings > 0

  return (
    <ul className="ingredient-list">
      {showGuestColumn && (
        <li className="ingredient-line ingredient-line--header">
          <span className="ingredient-name" aria-hidden="true" />
          <span className="ingredient-leader" aria-hidden="true" />
          <span className="ingredient-qty ingredient-qty--header">{baseServings} pers.</span>
          <span className="ingredient-qty ingredient-qty--header ingredient-qty--guest">
            {guestCount} pers.
          </span>
        </li>
      )}

      {ingredients.map((ing, index) => {
        const { name, quantityLabel } = getIngredientParts(ing)
        const scaledLabel = showGuestColumn
          ? getScaledIngredientQuantityLabel(ing, baseServings, guestCount)
          : null

        return (
          <li key={index} className="ingredient-line">
            <span className="ingredient-name">{name}</span>
            {quantityLabel ? (
              <>
                <span className="ingredient-leader" aria-hidden="true" />
                <span className="ingredient-qty">{quantityLabel}</span>
                {showGuestColumn && scaledLabel ? (
                  <span className="ingredient-qty ingredient-qty--guest">{scaledLabel}</span>
                ) : null}
              </>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
