export interface MealPreferences {
  breakfast: string[]
  lunch: string[]
  dinner: string[]
}

export interface HealthProfile {
  name: string
  age: number | null
  weightKg: number | null
  heightCm: number | null
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  healthConditions: string[]
  allergies: string[]
  dietaryPreferences: string[]
  mealPreferences: MealPreferences
  /** Repas principal quotidien (recette complete de la bibliotheque). */
  fullMealType?: 'lunch' | 'dinner'
  goals: string[]
  notes: string
}

export interface Ingredient {
  name: string
  quantity: string
  unit: string
}

export type RecipeMealType = MealSlot['mealType']

export interface Recipe {
  id: string
  name: string
  servings: number
  prepMinutes: number
  ingredients: Ingredient[]
  steps: string[]
  tags: string[]
  /** Origine : livre, site, perso… */
  source?: string
  sourceUrl?: string
  /** Repas compatibles (ex. breakfast pour tartines) */
  mealTypes?: RecipeMealType[]
  /** Saisons : printemps, ete, automne, hiver */
  seasons?: string[]
}

export interface MealSlot {
  day: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipeId: string
  recipeName: string
  /** Repas leger sans recette bibliotheque (tartines, salade, soupe…). */
  isLightMeal?: boolean
}

export interface DayMealGuestCounts {
  breakfast: number
  lunch: number
  dinner: number
}

export type WeekGuestCounts = Record<string, DayMealGuestCounts>

export interface WeeklyMenu {
  id: string
  weekStart: string
  season: string
  meals: MealSlot[]
  guestsByDay: WeekGuestCounts
  createdAt: string
}

export interface ShoppingItem {
  name: string
  quantity: string
  unit: string
  checked: boolean
}

export interface ActivitySession {
  id: string
  day: string
  type: string
  durationMinutes: number
  intensity: 'low' | 'moderate' | 'high'
  description: string
  completed: boolean
}

export interface WeeklyActivityPlan {
  id: string
  weekStart: string
  sessions: ActivitySession[]
  createdAt: string
}

export interface CheckIn {
  id: string
  date: string
  energy: 1 | 2 | 3 | 4 | 5
  mood: 1 | 2 | 3 | 4 | 5
  sleepHours: number | null
  painLevel: 0 | 1 | 2 | 3 | 4 | 5
  notes: string
  weightKg: number | null
}

export interface AppSettings {
  ollamaUrl: string
  ollamaModel: string
  /** Modele Ollama avec vision (OCR, photos, notes manuscrites). */
  ollamaVisionModel: string
  weekStartDay: string
  weekEndDay: string
  /** Version interne — reinitialise la bibliotheque lors d'une montee de version. */
  recipeLibraryVersion?: number
}

export interface AppData {
  profile: HealthProfile
  recipes: Recipe[]
  weeklyMenus: WeeklyMenu[]
  activityPlans: WeeklyActivityPlan[]
  checkIns: CheckIn[]
  settings: AppSettings
  menuGuestCounts: WeekGuestCounts
}

export const defaultMealPreferences: MealPreferences = {
  breakfast: [],
  lunch: [],
  dinner: [],
}

export const defaultProfile: HealthProfile = {
  name: '',
  age: null,
  weightKg: null,
  heightCm: null,
  activityLevel: 'moderate',
  healthConditions: [],
  allergies: [],
  dietaryPreferences: [],
  mealPreferences: defaultMealPreferences,
  fullMealType: 'dinner',
  goals: [],
  notes: '',
}

export const defaultSettings: AppSettings = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  ollamaVisionModel: 'llama3.2-vision',
  weekStartDay: 'Lundi',
  weekEndDay: 'Dimanche',
}

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export const defaultAppData: AppData = {
  profile: defaultProfile,
  recipes: [],
  weeklyMenus: [],
  activityPlans: [],
  checkIns: [],
  settings: defaultSettings,
  menuGuestCounts: Object.fromEntries(
    DAYS.map((day) => [day, { breakfast: 1, lunch: 1, dinner: 1 }]),
  ) as WeekGuestCounts,
}

export function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return 'printemps'
  if (month >= 6 && month <= 8) return 'ete'
  if (month >= 9 && month <= 11) return 'automne'
  return 'hiver'
}

export const MEAL_LABELS: Record<MealSlot['mealType'], string> = {
  breakfast: 'Petit-dejeuner',
  lunch: 'Dejeuner',
  dinner: 'Diner',
  snack: 'Collation',
}

export const ACTIVITY_LEVEL_LABELS: Record<HealthProfile['activityLevel'], string> = {
  sedentary: 'Sedentaire',
  light: 'Leger',
  moderate: 'Modere',
  active: 'Actif',
  very_active: 'Tres actif',
}
