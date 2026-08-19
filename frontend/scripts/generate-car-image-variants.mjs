/**
 * Pre-build step: generate @2x WebP variants for all car images.
 *
 * Each car has a single {id}_2026.webp (1x). This script creates {id}_2026@2x.webp
 * at 2× the original dimensions (quality 85), so that CarMedia's <img srcSet>
 * can serve a resolution-appropriate image to HiDPI / retina displays.
 *
 * Skips files that already have a @2x variant (idempotent).
 *
 * Usage: node scripts/generate-car-image-variants.mjs
 */
import { existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const carsDir = resolve(__dirname, '../public/cars')

if (!existsSync(carsDir)) {
  console.error('[generate-car-images] public/cars not found — skipping')
  process.exit(0)
}

const files = readdirSync(carsDir).filter(f => f.endsWith('.webp') && !f.includes('@2x'))

let generated = 0
let skipped = 0
let errors = 0

for (const file of files) {
  const srcPath = resolve(carsDir, file)
  const destPath = resolve(carsDir, file.replace(/\.webp$/, '@2x.webp'))
  if (existsSync(destPath)) {
    skipped++
    continue
  }

  try {
    // Read metadata to get current dimensions, then double them for 2x
    const meta = await sharp(srcPath).metadata()
    const targetWidth = Math.round((meta.width ?? 640) * 2)
    const targetHeight = Math.round((meta.height ?? 360) * 2)

    await sharp(srcPath)
      .resize(targetWidth, targetHeight, { fit: 'inside' })
      .webp({ quality: 85 })
      .toFile(destPath)

    generated++
  } catch (err) {
    console.error(`[generate-car-images] Failed for ${file}:`, err.message ?? err)
    errors++
  }
}

console.log(`[generate-car-images] ${generated} generated, ${skipped} skipped, ${errors} errors`)
if (errors > 0) process.exit(1)
