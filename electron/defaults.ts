import type { AppData } from '../src/types/index.js'

import { createDefaultGuestCounts } from '../src/lib/guestCounts.js'

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
    fullMealType: 'dinner',
    goals: [],
    notes: '',
  },
  recipes: [],
  weeklyMenus: [],
  activityPlans: [],
  checkIns: [],
  settings: {
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    ollamaVisionModel: 'llama3.2-vision',
    weekStartDay: 'Lundi',
    weekEndDay: 'Dimanche',
  },
  menuGuestCounts: createDefaultGuestCounts(),
}
