const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '../electron/preload.cjs')
const destDir = path.join(__dirname, '../dist-electron/electron')
const dest = path.join(destDir, 'preload.cjs')

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
