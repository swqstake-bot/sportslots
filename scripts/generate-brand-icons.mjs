/**
 * Rasterize public/*.svg → PNG/ICO for Electron + Windows tray/taskbar.
 * Run: node scripts/generate-brand-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const publicDir = path.join(root, 'public')
const buildDir = path.join(root, 'build')

async function rasterize(svgPath, outPath, size) {
  await sharp(svgPath, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath)
  console.log('wrote', path.relative(root, outPath), `${size}x${size}`)
}

async function main() {
  fs.mkdirSync(buildDir, { recursive: true })
  const iconSvg = path.join(publicDir, 'favicon.svg')
  const traySvg = path.join(publicDir, 'tray-icon.svg')

  await rasterize(iconSvg, path.join(publicDir, 'icon.png'), 512)
  await rasterize(iconSvg, path.join(publicDir, 'icon-256.png'), 256)
  await rasterize(traySvg, path.join(publicDir, 'tray-icon.png'), 64)

  const icoBuf = await pngToIco([
    path.join(publicDir, 'icon.png'),
    path.join(publicDir, 'icon-256.png'),
    path.join(publicDir, 'tray-icon.png'),
  ])
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf)
  console.log('wrote build/icon.ico')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
