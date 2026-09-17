import { createWorker } from 'tesseract.js'
import { parseFields } from './ocrParse'

// Box blur over a single-channel array — used as the "unsharp" reference
// below and, as a side effect, smooths out JPEG-compression and sensor
// noise before that noise gets amplified by sharpening.
function boxBlur(src, width, height, radius) {
  const out = new Float32Array(src.length)
  const size = radius * 2 + 1
  // Horizontal pass
  const tmp = new Float32Array(src.length)
  for (let y = 0; y < height; y++) {
    let sum = 0
    const row = y * width
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(width - 1, Math.max(0, x))]
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / size
      const add = src[row + Math.min(width - 1, x + radius + 1)]
      const sub = src[row + Math.max(0, x - radius)]
      sum += add - sub
    }
  }
  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x]
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / size
      const add = tmp[Math.min(height - 1, y + radius + 1) * width + x]
      const sub = tmp[Math.max(0, y - radius) * width + x]
      sum += add - sub
    }
  }
  return out
}

/**
 * Grayscale + denoise + sharpen + adaptive contrast stretch, for OCR only —
 * the original color photo is untouched and is what gets stored/shown as
 * the audit record. This targets exactly the failure modes a real field
 * photo hits that a scanned document never does: uneven indoor lighting,
 * glare off a metal label, camera-shake blur, and JPEG noise. A single
 * fixed contrast multiplier only helps images that were already decently
 * exposed; this adapts to whatever the photo actually looks like.
 */
function preprocessForOcr(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Upscale small/low-res captures — more pixels per character measurably
      // helps Tesseract on tiny label text, up to a sane cap.
      const MIN_EDGE = 1200
      const longEdge = Math.max(img.width, img.height)
      const upscale = longEdge < MIN_EDGE ? Math.min(2, MIN_EDGE / longEdge) : 1

      const width = Math.round(img.width * upscale)
      const height = Math.round(img.height * upscale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      const imageData = ctx.getImageData(0, 0, width, height)
      const d = imageData.data
      const n = width * height
      const gray = new Float32Array(n)
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      }

      // Unsharp mask: blur as the "what the eye already sees" reference,
      // then push each pixel away from it in proportion to how much detail
      // sits there — recovers edge definition a soft/blurry photo lost,
      // without the noise blow-up a naive sharpen kernel causes.
      const blurred = boxBlur(gray, width, height, 1)
      const SHARPEN_AMOUNT = 0.8
      const sharpened = new Float32Array(n)
      for (let p = 0; p < n; p++) {
        sharpened[p] = gray[p] + SHARPEN_AMOUNT * (gray[p] - blurred[p])
      }

      // Adaptive contrast: stretch the 2nd-98th percentile of this specific
      // photo's brightness range to fill 0-255, instead of a fixed curve.
      // Handles a dim, underlit label and a glare-washed-out one equally,
      // where one fixed multiplier could only ever help one of the two.
      const sorted = Float32Array.from(sharpened).sort()
      const lo = sorted[Math.floor(n * 0.02)]
      const hi = sorted[Math.ceil(n * 0.98) - 1]
      const range = Math.max(1, hi - lo)

      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const v = Math.min(255, Math.max(0, ((sharpened[p] - lo) / range) * 255))
        d[i] = d[i + 1] = d[i + 2] = v
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

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
    }).then(async (worker) => {
      // Default full-page auto-segmentation tries to detect multiple text
      // blocks/columns, which real label photos defeat: this label is a
      // dense grid of icon boxes, hazard pictograms and address blocks, and
      // auto-segmentation was observed to reorder "SN" away from its value
      // in the extracted text. PSM 6 ("assume a single uniform block of
      // text") skips block detection and reads top-to-bottom by line
      // instead, which tracks the label's actual row layout far more
      // reliably.
      await worker.setParameters({ tessedit_pageseg_mode: '6' })
      return worker
    })
  }
  return workerPromise
}

async function recognizeOnce(worker, dataUrl) {
  const { data } = await worker.recognize(dataUrl)
  const text = data?.text || ''
  return { text, fields: parseFields(text) }
}

/**
 * @param {string} dataUrl - base64 JPEG data URL from CameraCapture
 * @returns {Promise<{ocr_available: boolean, message?: string, serial_number?: string,
 *   ref_number?: string, mfg_date?: string, mfg_date_raw?: string, raw_text?: string}>}
 */
export async function runLocalOcr(dataUrl) {
  try {
    const worker = await getWorker()

    // Try the contrast-enhanced version first — it's the better input for
    // most real photos (glare, dim indoor lighting on a metal label). If it
    // comes back empty, retry against the untouched original: a fixed
    // contrast curve can occasionally hurt an already well-lit, sharp photo.
    const enhanced = await preprocessForOcr(dataUrl).catch(() => dataUrl)
    let result = await recognizeOnce(worker, enhanced)

    if (!result.fields.serial_number && !result.fields.mfg_date && enhanced !== dataUrl) {
      const retry = await recognizeOnce(worker, dataUrl)
      if (retry.fields.serial_number || retry.fields.mfg_date) {
        result = retry
      } else if (retry.text.length > result.text.length) {
        // Neither pass found a match — keep whichever raw text is more
        // substantial, so "Show what was detected" is as useful as possible.
        result = retry
      }
    }

    return { ocr_available: true, raw_text: result.text, ...result.fields }
  } catch (err) {
    return {
      ocr_available: false,
      message: 'Could not read the photo on this device. Enter the details manually.',
    }
  }
}
