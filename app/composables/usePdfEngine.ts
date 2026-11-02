import { ref } from 'vue'
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import { getDocumentProxy, renderPageAsImage } from 'unpdf'

export interface PageThumbnail {
  pageNumber: number
  rotation: number
  isDeleted: boolean
  dataUrl?: string
}

export interface PdfFileItem {
  id: string
  file: File
  name: string
  sizeFormatted: string
  numPages: number
  thumbnailUrl?: string
  rotation: number
}

export interface WatermarkOptions {
  text: string
  opacity?: number
  angle?: number
  fontSize?: number
  color?: { r: number; g: number; b: number }
}

export interface PageNumberOptions {
  position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right'
  format?: 'number' | 'page_of_total'
  fontSize?: number
}

export function usePdfEngine() {
  const isProcessing = ref(false)
  const progressPercent = ref(0)
  const statusMessage = ref('')
  const errorMessage = ref<string | null>(null)

  // 1. Merge Multiple PDFs into a single document
  async function mergePdfs(files: File[]): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 5
    statusMessage.value = 'Initializing unified document...'

    try {
      const mergedDoc = await PDFDocument.create()

      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        statusMessage.value = `Importing ${file.name} (${i + 1}/${files.length})...`
        const buffer = await file.arrayBuffer()
        const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
        const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices())
        copiedPages.forEach(page => mergedDoc.addPage(page))
        progressPercent.value = Math.round(((i + 1) / files.length) * 85)
      }

      statusMessage.value = 'Finalizing merged document...'
      const output = await mergedDoc.save()
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Merge failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 2. Split PDF by specific page ranges (e.g., "1-3, 5, 7-10")
  async function splitPdf(file: File, pageRangeStr: string): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 10
    statusMessage.value = 'Parsing page selection...'

    try {
      const buffer = await file.arrayBuffer()
      const srcDoc = await PDFDocument.load(buffer)
      const newDoc = await PDFDocument.create()
      const totalPages = srcDoc.getPageCount()

      const targetIndices = parsePageRange(pageRangeStr, totalPages)
      if (targetIndices.length === 0) {
        throw new Error('No valid pages selected in the specified range')
      }

      statusMessage.value = `Extracting ${targetIndices.length} pages...`
      const copiedPages = await newDoc.copyPages(srcDoc, targetIndices)
      copiedPages.forEach(page => newDoc.addPage(page))
      progressPercent.value = 80

      statusMessage.value = 'Rendering new split PDF...'
      const output = await newDoc.save()
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Split failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 3. Rotate Specific Pages in a PDF
  async function rotatePdf(file: File, pageRotations: Map<number, number>): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    statusMessage.value = 'Applying page rotations...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer)
      const pages = doc.getPages()

      for (let i = 0; i < pages.length; i++) {
        const pageNumber = i + 1
        const delta = pageRotations.get(pageNumber) || 0
        if (delta !== 0) {
          const page = pages[i]!
          const currentRotation = page.getRotation().angle
          page.setRotation(degrees((currentRotation + delta) % 360))
        }
      }

      const output = await doc.save()
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Rotation failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 4. Remove Pages from a PDF
  async function removePages(file: File, pageIndicesToRemove: number[]): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    statusMessage.value = 'Removing selected pages...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer)
      const totalPages = doc.getPageCount()

      const sorted = [...pageIndicesToRemove].sort((a, b) => b - a)
      for (const idx of sorted) {
        if (idx >= 0 && idx < totalPages) {
          doc.removePage(idx)
        }
      }

      if (doc.getPageCount() === 0) {
        throw new Error('Cannot remove all pages from a document')
      }

      const output = await doc.save()
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Page removal failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 5. Apply Text Watermark
  async function watermarkPdf(file: File, options: WatermarkOptions): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    statusMessage.value = 'Applying watermark across pages...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer)
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      const pages = doc.getPages()

      const text = options.text.trim() || 'CONFIDENTIAL'
      const opacity = options.opacity ?? 0.25
      const angle = options.angle ?? -45
      const color = options.color
        ? rgb(options.color.r, options.color.g, options.color.b)
        : rgb(0.4, 0.4, 0.4)

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]!
        const { width, height } = page.getSize()
        const dynamicSize = options.fontSize || Math.max(18, Math.min(width, height) / 12)

        page.drawText(text, {
          x: width / 4,
          y: height / 2,
          size: dynamicSize,
          font,
          color,
          opacity,
          rotate: degrees(angle)
        })
      }

      const output = await doc.save()
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Watermarking failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 6. Add Page Numbers
  async function addPageNumbers(file: File, options: PageNumberOptions = {}): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    statusMessage.value = 'Numbering pages...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer)
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const pages = doc.getPages()
      const totalPages = pages.length
      const fontSize = options.fontSize || 10

      for (let i = 0; i < totalPages; i++) {
        const page = pages[i]!
        const { width } = page.getSize()
        const pageNum = i + 1

        const label = options.format === 'page_of_total'
          ? `Page ${pageNum} of ${totalPages}`
          : `${pageNum}`

        const textWidth = font.widthOfTextAtSize(label, fontSize)
        let x = width / 2 - textWidth / 2
        const y = 25

        if (options.position === 'bottom-right') {
          x = width - textWidth - 30
        } else if (options.position === 'bottom-left') {
          x = 30
        } else if (options.position === 'top-right') {
          x = width - textWidth - 30
        }

        page.drawText(label, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.3, 0.3, 0.3)
        })
      }

      const output = await doc.save()
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Page numbering failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 7. Convert JPG/PNG Images to PDF Document
  async function imagesToPdf(imageFiles: File[]): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 10
    statusMessage.value = 'Creating image presentation PDF...'

    try {
      const doc = await PDFDocument.create()

      for (let i = 0; i < imageFiles.length; i++) {
        const imgFile = imageFiles[i]!
        statusMessage.value = `Embedding image ${i + 1} of ${imageFiles.length}...`
        const imgBuffer = await imgFile.arrayBuffer()

        const isPng = imgFile.type.includes('png') || imgFile.name.toLowerCase().endsWith('.png')
        const image = isPng
          ? await doc.embedPng(imgBuffer)
          : await doc.embedJpg(imgBuffer)

        const page = doc.addPage([image.width, image.height])
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height
        })
        progressPercent.value = Math.round(((i + 1) / imageFiles.length) * 85)
      }

      statusMessage.value = 'Finalizing document...'
      const output = await doc.save()
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Image conversion failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 8. Inspect PDF Total Pages and Metadata via unpdf
  async function inspectPdf(file: File): Promise<{ numPages: number; isEncrypted: boolean }> {
    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const doc = await getDocumentProxy(buffer)
      return {
        numPages: doc.numPages,
        isEncrypted: false
      }
    } catch (err: any) {
      const isEncrypted = err?.name === 'PasswordException' || String(err?.message || '').includes('password')
      return {
        numPages: 0,
        isEncrypted
      }
    }
  }

  // 9. Render Realistic First-Page Thumbnail via HTML5 Canvas (matches iLovePDF card preview)
  async function renderPageThumbnail(fileOrBuffer: File | Uint8Array, pageNumber = 1, scale = 0.35): Promise<string> {
    if (typeof window === 'undefined') {
      return ''
    }

    try {
      const buffer = fileOrBuffer instanceof File
        ? new Uint8Array(await fileOrBuffer.arrayBuffer())
        : fileOrBuffer

      // Primary: unpdf built-in isomorphic renderPageAsImage
      try {
        const result = await renderPageAsImage(buffer, pageNumber, {
          scale,
          toDataURL: true
        }) as unknown as string
        if (result && typeof result === 'string' && result.startsWith('data:image')) {
          return result
        }
      } catch (unpdfErr) {
        console.warn('unpdf renderPageAsImage error:', unpdfErr)
      }

      // Secondary fallback: Direct browser HTML5 canvas with canvas + canvasContext
      if (typeof document !== 'undefined') {
        const doc = await getDocumentProxy(buffer)
        const pageIndex = Math.min(Math.max(1, pageNumber), doc.numPages)
        const page = await doc.getPage(pageIndex)

        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))

        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          const renderContext: any = {
            canvas,
            canvasContext: ctx,
            viewport
          }

          await (page as any).render(renderContext).promise
          return canvas.toDataURL('image/jpeg', 0.85)
        }
      }
    } catch (err) {
      console.warn('Thumbnail canvas render fallback failed:', err)
    }

    return ''
  }

  // 10. Render All Page Thumbnails for Visual Grid Editor
  async function renderAllPageThumbnails(
    file: File,
    maxPages = 60,
    scale = 0.3
  ): Promise<PageThumbnail[]> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return []
    }

    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const doc = await getDocumentProxy(buffer)
      const total = Math.min(doc.numPages, maxPages)
      const items: PageThumbnail[] = []

      for (let p = 1; p <= total; p++) {
        try {
          const page = await doc.getPage(p)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height

          const ctx = canvas.getContext('2d')
          let dataUrl = ''
          if (ctx) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            await (page as any).render({ canvas, canvasContext: ctx, viewport }).promise
            dataUrl = canvas.toDataURL('image/jpeg', 0.8)
          }

          items.push({
            pageNumber: p,
            rotation: 0,
            isDeleted: false,
            dataUrl
          })
        } catch {
          items.push({
            pageNumber: p,
            rotation: 0,
            isDeleted: false
          })
        }
      }

      return items
    } catch (err) {
      console.warn('Failed to render page thumbnails:', err)
      return []
    }
  }

  // Helper: Trigger Direct Browser Download
  function downloadBlob(data: Uint8Array, filename: string) {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Helper: Format byte sizes cleanly
  function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return {
    isProcessing,
    progressPercent,
    statusMessage,
    errorMessage,
    mergePdfs,
    splitPdf,
    rotatePdf,
    removePages,
    watermarkPdf,
    addPageNumbers,
    imagesToPdf,
    inspectPdf,
    renderPageThumbnail,
    renderAllPageThumbnails,
    downloadBlob,
    formatBytes
  }
}

// Range string parser e.g. "1-3, 5, 8-10" -> array of zero-based indices
function parsePageRange(rangeStr: string, maxPages: number): number[] {
  const indices = new Set<number>()
  const parts = rangeStr.split(',').map(s => s.trim())

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number)
      if (start && end) {
        for (let p = Math.max(1, start); p <= Math.min(maxPages, end); p++) {
          indices.add(p - 1)
        }
      }
    } else {
      const p = Number(part)
      if (p >= 1 && p <= maxPages) {
        indices.add(p - 1)
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b)
}
