import type { AppData } from '../src/types/index.js'

export const defaultAppData: AppData = {
  profile: {
    name: '',
    age: null,
    weightKg: null,
    heightCm: null,
    activityLevel: 'moderate',
    healthConditions: [],
    allergies: [],
    dietaryPreferences: [],
    mealPreferences: {
      breakfast: [],
      lunch: [],
      dinner: [],
    },
    goals: [],
    notes: '',
  },
  recipes: [],
  weeklyMenus: [],
  activityPlans: [],
  checkIns: [],
  settings: {
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2:1b',
    weekStartDay: 'Lundi',
    weekEndDay: 'Dimanche',
  },
  menuGuestCounts: {
    Lundi: 1,
    Mardi: 1,
    Mercredi: 1,
    Jeudi: 1,
    Vendredi: 1,
    Samedi: 1,
    Dimanche: 1,
  },
}
