import { createWorker } from 'tesseract.js'
import { parseFields } from './ocrParse'

/**
 * In-browser OCR. Runs entirely on the engineer's phone — the photo never
 * leaves the device for this step, and nothing is sent to any third party.
 *
 * All engine assets (worker script, WASM core, English model) are served
 * from this app's own /tesseract/ folder — not fetched from a public CDN at
 * runtime — so this keeps working on a hospital network that blocks
 * third-party script/CDN origins, and no external service ever sees a
 * console photo. First use per browser downloads ~7 MB (cached after that);
 * later scans reuse the cached engine and run near-instantly.
 */
let workerPromise = null

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      // Point at one exact file rather than a directory: passing a directory
      // makes tesseract.js auto-detect SIMD/relaxed-SIMD support and pick
      // from several core variants, which silently breaks if every variant
      // isn't self-hosted. SIMD (not relaxed-SIMD) is supported by every
      // evergreen mobile browser since 2023, so this one file covers the
      // real target devices without needing to host all six variants.
      corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
      langPath: '/tesseract/',
      cacheMethod: 'none', // traineddata is already local; no need to cache to IndexedDB
    })
  }
  return workerPromise
}

/**
 * @param {string} dataUrl - base64 JPEG data URL from CameraCapture
 * @returns {Promise<{ocr_available: boolean, message?: string, serial_number?: string,
 *   ref_number?: string, mfg_date?: string, mfg_date_raw?: string, raw_text?: string}>}
 */
export async function runLocalOcr(dataUrl) {
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(dataUrl)
    const text = data?.text || ''
    const fields = parseFields(text)
    return { ocr_available: true, raw_text: text, ...fields }
  } catch (err) {
    return {
      ocr_available: false,
      message: 'Could not read the photo on this device. Enter the details manually.',
    }
  }
}
