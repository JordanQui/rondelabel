import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TRACK_DIR = join('public', 'tracks', 'oleroralapomo')
const EXPECTED_MIN_BYTES = 1024

const pointerSignature = 'version https://git-lfs.github.com/spec/v1'
const filesToCheck = [
  'Noratolopomu.mp3',
  'Oleroralapomo.mp3',
  'Ralotorapomi.mp3',
  'Relatarapobo.mp3',
].map((file) => join(TRACK_DIR, file))

const pointerFiles = filesToCheck.filter((file) => {
  try {
    const content = readFileSync(file, 'utf8')
    return content.includes(pointerSignature)
  } catch (error) {
    console.error(`[LFS verify] Cannot read ${file}:`, error)
    return true
  }
})

const tinyFiles = filesToCheck.filter((file) => {
  try {
    const { size } = statSync(file)
    return size < EXPECTED_MIN_BYTES
  } catch (error) {
    console.error(`[LFS verify] Cannot stat ${file}:`, error)
    return true
  }
})

const uniqueFailures = Array.from(new Set([...pointerFiles, ...tinyFiles]))

if (uniqueFailures.length === 0) {
  console.info('[LFS verify] Audio assets are present (>= 1KB and not Git LFS pointers).')
  process.exit(0)
}

console.error('\n[LFS verify] One or more audio files are missing their binary content:')
uniqueFailures.forEach((file) => console.error(` - ${file}`))
console.error(
  '\nRun `git lfs fetch --all && git lfs checkout` to download media before building.\n' +
    'On CI (e.g. Vercel), ensure Git LFS is installed and the repository is cloned with LFS support.'
)
process.exit(1)
