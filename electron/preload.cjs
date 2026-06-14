const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('equilibre', {
  getData: () => ipcRenderer.invoke('data:get'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  generateAI: (payload) => ipcRenderer.invoke('ai:generate', payload),
  listOllamaModels: (baseUrl) => ipcRenderer.invoke('ollama:listModels', baseUrl),
})
