const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('equilibre', {
  getData: () => ipcRenderer.invoke('data:get'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  generateAI: (payload) => ipcRenderer.invoke('ai:generate', payload),
  extractRecipesFromImage: (payload) => ipcRenderer.invoke('ai:extractRecipesFromImage', payload),
  importRecipeFromUrl: (payload) => ipcRenderer.invoke('recipe:importFromUrl', payload),
  importRecipesFromSite: (payload) => ipcRenderer.invoke('recipe:importFromSite', payload),
  estimateSiteImport: (payload) => ipcRenderer.invoke('recipe:estimateSiteImport', payload),
  cancelSiteImport: () => ipcRenderer.invoke('recipe:cancelSiteImport'),
  onSiteImportProgress: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('recipe:siteImportProgress', listener)
    return () => ipcRenderer.removeListener('recipe:siteImportProgress', listener)
  },
  listOllamaModels: (baseUrl) => ipcRenderer.invoke('ollama:listModels', baseUrl),
})
