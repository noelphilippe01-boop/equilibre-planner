const { downloadArtifact } = require('@electron/get')
const extract = require('extract-zip')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const { version } = require(path.join(root, 'node_modules/electron/package.json'))
const distDir = path.join(root, 'node_modules/electron/dist')

async function main() {
  fs.mkdirSync(distDir, { recursive: true })
  console.log('Downloading Electron', version)
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: 'win32',
    arch: 'x64',
  })
  console.log('Extracting to', distDir)
  if (process.platform === 'win32') {
    const { execFileSync } = require('child_process')
    execFileSync('powershell.exe', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}' -Force`,
    ], { stdio: 'inherit' })
  } else {
    await extract(zipPath, { dir: distDir })
  }
  fs.writeFileSync(path.join(root, 'node_modules/electron/path.txt'), 'electron.exe', 'utf8')
  fs.writeFileSync(path.join(distDir, 'version'), `v${version}`)
  const exe = path.join(distDir, 'electron.exe')
  if (!fs.existsSync(exe)) throw new Error('electron.exe missing after extract')
  console.log('Electron ready:', exe)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
