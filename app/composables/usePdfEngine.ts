import { ref } from 'vue'
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import { getDocumentProxy, renderPageAsImage, extractTextItems } from 'unpdf'
import ExcelJS from 'exceljs'
import { Document, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType, BorderStyle, AlignmentType, PageBreak, Packer } from 'docx'
import JSZip from 'jszip'

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

export interface CompressOptions {
  tier: 'lossless' | 'balanced' | 'extreme'
}

export interface CompressResult {
  bytes: Uint8Array
  originalSize: number
  compressedSize: number
  ratioPercent: number
  savingsFormatted: string
}

export interface PdfToImageOptions {
  format: 'png' | 'jpeg' | 'webp'
  dpiScale: number // 1 = 72-96 DPI, 2 = 150 DPI Retina, 3 = 300 DPI Print
  selectedPages?: number[]
}

export interface PageImageOutput {
  pageNumber: number
  filename: string
  dataUrl: string
  blob: Blob
  sizeFormatted: string
}

export interface PdfToImageResult {
  images: PageImageOutput[]
  zipBlob?: Blob
  zipFilename?: string
}

export interface PdfToExcelOptions {
  format?: 'xlsx' | 'csv'
  sheetMode?: 'multi_sheet' | 'single_sheet'
  tableOnly?: boolean
}

export interface PdfToExcelResult {
  data: Uint8Array | string
  filename: string
  rowCount: number
  colCount: number
  tableCount: number
  previewRows?: (string | number)[][]
}

export interface PdfToWordOptions {
  preservePageBreaks?: boolean
}

export interface PdfToWordResult {
  blob: Blob
  filename: string
  paragraphsCount: number
  tablesCount: number
  headingsCount: number
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
      const output = await mergedDoc.save({ useObjectStreams: true })
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
      const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
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
      const output = await newDoc.save({ useObjectStreams: true })
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

  // 3. Rotate specific pages or entire document
  async function rotatePdf(file: File, pageRotations: Map<number, number>): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 15
    statusMessage.value = 'Loading document for rotation...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const pages = doc.getPages()

      statusMessage.value = 'Applying orientation adjustments...'
      pages.forEach((page, idx) => {
        const pageNumber = idx + 1
        const deltaRotation = pageRotations.get(pageNumber) || 0
        if (deltaRotation !== 0) {
          const currentRotation = page.getRotation().angle
          page.setRotation(degrees((currentRotation + deltaRotation) % 360))
        }
      })
      progressPercent.value = 75

      statusMessage.value = 'Saving rotated document...'
      const output = await doc.save({ useObjectStreams: true })
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

  // 3b. Organize: Sort/Reorder, Rotate, and Exclude Pages visually
  async function organizePdf(
    file: File,
    orderedPages: { pageNumber: number; rotation: number; isDeleted: boolean }[]
  ): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 15
    statusMessage.value = 'Loading document pages for reorganization...'

    try {
      const activePages = orderedPages.filter(p => !p.isDeleted)
      if (activePages.length === 0) {
        throw new Error('At least one page must remain in the document.')
      }

      const buffer = await file.arrayBuffer()
      const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const newDoc = await PDFDocument.create()

      statusMessage.value = `Assembling ${activePages.length} pages in custom order...`
      const pageIndices = activePages.map(p => p.pageNumber - 1)
      const copiedPages = await newDoc.copyPages(srcDoc, pageIndices)

      copiedPages.forEach((page, idx) => {
        const rot = activePages[idx]?.rotation || 0
        if (rot !== 0) {
          const currentRotation = page.getRotation().angle
          page.setRotation(degrees((currentRotation + rot) % 360))
        }
        newDoc.addPage(page)
      })

      progressPercent.value = 85
      statusMessage.value = 'Finalizing organized document...'
      const output = await newDoc.save({ useObjectStreams: true })
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Organize failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 4. Remove selected pages from PDF
  async function removePages(file: File, pageIndicesToRemove: number[]): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 20
    statusMessage.value = 'Loading document pages...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const totalPages = doc.getPageCount()

      // Sort descending so indices do not shift while deleting
      const toRemoveSorted = [...new Set(pageIndicesToRemove)].sort((a, b) => b - a)

      if (toRemoveSorted.length >= totalPages) {
        throw new Error('Cannot remove all pages from a document. At least one page must remain.')
      }

      statusMessage.value = `Removing ${toRemoveSorted.length} selected pages...`
      for (const idx of toRemoveSorted) {
        if (idx >= 0 && idx < totalPages) {
          doc.removePage(idx)
        }
      }
      progressPercent.value = 75

      statusMessage.value = 'Rebuilding trimmed document...'
      const output = await doc.save({ useObjectStreams: true })
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Remove pages failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 5. Watermark PDF with custom security text
  async function watermarkPdf(file: File, options: WatermarkOptions): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 15
    statusMessage.value = 'Preparing watermark overlay...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      const pages = doc.getPages()

      const text = options.text || 'CONFIDENTIAL'
      const opacity = options.opacity ?? 0.25
      const angle = degrees(options.angle ?? -45)
      const fontSize = options.fontSize ?? 48
      const color = options.color
        ? rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255)
        : rgb(0.8, 0.2, 0.2) // Red tint default

      const textWidth = font.widthOfTextAtSize(text, fontSize)
      const textHeight = font.heightAtSize(fontSize)

      statusMessage.value = `Watermarking ${pages.length} pages...`
      pages.forEach((page, idx) => {
        const { width, height } = page.getSize()
        const x = (width - textWidth) / 2
        const y = (height - textHeight) / 2

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color,
          opacity,
          rotate: angle
        })
        progressPercent.value = Math.round(15 + ((idx + 1) / pages.length) * 70)
      })

      statusMessage.value = 'Finalizing watermarked PDF...'
      const output = await doc.save({ useObjectStreams: true })
      progressPercent.value = 100
      return output
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Watermark failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 6. Dynamic Page Numbering Insertion
  async function addPageNumbers(file: File, options: PageNumberOptions): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 15
    statusMessage.value = 'Preparing page counter...'

    try {
      const buffer = await file.arrayBuffer()
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const pages = doc.getPages()
      const totalPages = pages.length
      const fontSize = options.fontSize || 9

      statusMessage.value = `Inserting numbers across ${totalPages} pages...`
      pages.forEach((page, idx) => {
        const pageNum = idx + 1
        const label = options.format === 'number'
          ? `${pageNum}`
          : `Page ${pageNum} of ${totalPages}`

        const textWidth = font.widthOfTextAtSize(label, fontSize)
        const { width, height } = page.getSize()

        let x = (width - textWidth) / 2
        let y = 20 // bottom padding

        if (options.position === 'bottom-right') {
          x = width - textWidth - 30
        } else if (options.position === 'bottom-left') {
          x = 30
        } else if (options.position === 'top-right') {
          x = width - textWidth - 30
          y = height - 25
        }

        page.drawText(label, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.3, 0.3, 0.3)
        })
        progressPercent.value = Math.round(15 + (pageNum / totalPages) * 70)
      })

      statusMessage.value = 'Saving numbered document...'
      const output = await doc.save({ useObjectStreams: true })
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

  // 7. Convert Multiple Images to Single Consolidated PDF
  async function imagesToPdf(imageFiles: File[]): Promise<Uint8Array> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 10
    statusMessage.value = 'Initializing image compilation...'

    try {
      const doc = await PDFDocument.create()

      for (let i = 0; i < imageFiles.length; i++) {
        const f = imageFiles[i]!
        statusMessage.value = `Converting ${f.name} (${i + 1}/${imageFiles.length})...`
        const buffer = await f.arrayBuffer()

        let image
        if (f.type === 'image/jpeg' || f.name.toLowerCase().endsWith('.jpg') || f.name.toLowerCase().endsWith('.jpeg')) {
          image = await doc.embedJpg(buffer)
        } else {
          image = await doc.embedPng(buffer)
        }

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
      const output = await doc.save({ useObjectStreams: true })
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

  // Memory Helpers: Convert canvas without network fetch() to preserve strict Content-Security-Policy
  function canvasToBlob(canvas: HTMLCanvasElement, mimeType = 'image/jpeg', quality = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            try {
              const dataUrl = canvas.toDataURL(mimeType, quality)
              const commaIdx = dataUrl.indexOf(',')
              const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
              const binaryString = atob(base64)
              const len = binaryString.length
              const bytes = new Uint8Array(len)
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              resolve(new Blob([bytes], { type: mimeType }))
            } catch (err) {
              reject(err)
            }
          }
        },
        mimeType,
        quality
      )
    })
  }

  async function canvasToArrayBuffer(canvas: HTMLCanvasElement, mimeType = 'image/jpeg', quality = 0.8): Promise<ArrayBuffer> {
    const blob = await canvasToBlob(canvas, mimeType, quality)
    return await blob.arrayBuffer()
  }

  // 8. Compress PDF (3-Tier Dual-Engine: Lossless / Balanced / Extreme)
  async function compressPdf(file: File, tier: 'lossless' | 'balanced' | 'extreme' = 'balanced'): Promise<CompressResult> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 10
    statusMessage.value = `Analyzing document structure (${tier} compression)...`

    const originalSize = file.size

    try {
      const buffer = new Uint8Array(await file.arrayBuffer())

      if (tier === 'lossless') {
        // Mode 1: Smart Vector Mode - Object Stream & Dictionary Compaction (Keeps vector text 100% crisp)
        statusMessage.value = 'Compacting indirect object streams and metadata...'
        const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
        progressPercent.value = 60
        const compressedBytes = await srcDoc.save({ useObjectStreams: true })
        progressPercent.value = 100

        const finalBytes = compressedBytes.length < originalSize ? compressedBytes : buffer
        const compressedSize = finalBytes.length
        const ratioPercent = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
        const savingsFormatted = formatBytes(Math.max(0, originalSize - compressedSize))

        return {
          bytes: finalBytes,
          originalSize,
          compressedSize,
          ratioPercent,
          savingsFormatted
        }
      }

      // Mode 2 & 3: Balanced or Extreme Quantization
      const targetScale = tier === 'balanced' ? 1.5 : 1.0
      const quality = tier === 'balanced' ? 0.72 : 0.52

      statusMessage.value = 'Parsing document pages for image optimization...'
      const proxy = await getDocumentProxy(buffer)
      const totalPages = proxy.numPages
      const newDoc = await PDFDocument.create()

      for (let p = 1; p <= totalPages; p++) {
        statusMessage.value = `Compressing page ${p} of ${totalPages}...`
        const page = await proxy.getPage(p)
        const viewport = page.getViewport({ scale: targetScale })

        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        const ctx = canvas.getContext('2d')

        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await (page as any).render({ canvas, canvasContext: ctx, viewport }).promise

          const imgBytes = await canvasToArrayBuffer(canvas, 'image/jpeg', quality)
          const embedded = await newDoc.embedJpg(imgBytes)

          // Original page dimensions
          const defaultViewport = page.getViewport({ scale: 1.0 })
          const newPage = newDoc.addPage([defaultViewport.width, defaultViewport.height])
          newPage.drawImage(embedded, {
            x: 0,
            y: 0,
            width: defaultViewport.width,
            height: defaultViewport.height
          })
        }

        progressPercent.value = Math.round(15 + (p / totalPages) * 75)
      }

      statusMessage.value = 'Finalizing compressed document package...'
      const compressedBytes = await newDoc.save({ useObjectStreams: true })
      progressPercent.value = 100

      const finalBytes = compressedBytes.length < originalSize ? compressedBytes : buffer
      const compressedSize = finalBytes.length
      const ratioPercent = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
      const savingsFormatted = formatBytes(Math.max(0, originalSize - compressedSize))

      return {
        bytes: finalBytes,
        originalSize,
        compressedSize,
        ratioPercent,
        savingsFormatted
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `Compression failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 9. PDF to Image Converter (PNG / JPG / WebP + Multi-Page ZIP Bundling)
  async function pdfToImages(file: File, options: PdfToImageOptions): Promise<PdfToImageResult> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 5
    statusMessage.value = 'Preparing PDF rasterization engine...'

    const baseName = file.name.replace(/\.[^/.]+$/, '')
    const format = options.format || 'png'
    const scale = options.dpiScale || 2 // default 150 DPI
    const ext = format === 'jpeg' ? 'jpg' : format

    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const proxy = await getDocumentProxy(buffer)
      const totalPages = proxy.numPages

      const targetPages: number[] = options.selectedPages && options.selectedPages.length > 0
        ? options.selectedPages
        : Array.from({ length: totalPages }, (_, i) => i + 1)

      const outputImages: PageImageOutput[] = []

      for (let i = 0; i < targetPages.length; i++) {
        const pageNum = targetPages[i]!
        statusMessage.value = `Rendering page ${pageNum} (${i + 1}/${targetPages.length}) at ${scale * 75} DPI...`

        const page = await proxy.getPage(pageNum)
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        const ctx = canvas.getContext('2d')

        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await (page as any).render({ canvas, canvasContext: ctx, viewport }).promise

          const mimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'
          const blob = await canvasToBlob(canvas, mimeType, 0.92)
          const dataUrl = canvas.toDataURL(mimeType, 0.92)

          outputImages.push({
            pageNumber: pageNum,
            filename: `${baseName}_page_${String(pageNum).padStart(2, '0')}.${ext}`,
            dataUrl,
            blob,
            sizeFormatted: formatBytes(blob.size)
          })
        }

        progressPercent.value = Math.round(((i + 1) / targetPages.length) * 85)
      }

      // If more than 1 image, bundle into a ZIP archive
      let zipBlob: Blob | undefined
      let zipFilename: string | undefined

      if (outputImages.length > 1) {
        statusMessage.value = `Bundling ${outputImages.length} images into ZIP package...`
        const zip = new JSZip()
        outputImages.forEach(img => {
          zip.file(img.filename, img.blob)
        })
        zipBlob = await zip.generateAsync({ type: 'blob' })
        zipFilename = `${baseName}_images_${format.toUpperCase()}.zip`
      }

      progressPercent.value = 100
      statusMessage.value = 'Image extraction complete!'

      return {
        images: outputImages,
        zipBlob,
        zipFilename
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `PDF to image failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // --- Advanced 2D Document Layout & Table Geometry Engine ---
  interface LayoutToken {
    str: string
    x: number
    y: number
    width: number
    height: number
    fontSize: number
  }

  interface VisualLine {
    y: number
    fontSize: number
    tokens: { str: string; x: number; width: number; fontSize: number }[]
    fullText: string
  }

  interface LayoutBlock {
    type: 'heading' | 'paragraph' | 'table'
    level?: 1 | 2
    text?: string
    rows?: (string | number)[][]
    columnWidthRatios?: number[]
  }

  function buildVisualLine(rawTokens: LayoutToken[]): VisualLine {
    rawTokens.sort((a, b) => a.x - b.x)

    const merged: { str: string; x: number; width: number; fontSize: number }[] = []
    let current: { str: string; x: number; width: number; fontSize: number } | null = null

    for (const tok of rawTokens) {
      if (!current) {
        current = { str: tok.str, x: tok.x, width: tok.width, fontSize: tok.fontSize || 10 }
      } else {
        const gap = tok.x - (current.x + current.width)
        const mergeThreshold = Math.max(current.fontSize, tok.fontSize || 10) * 0.65
        if (gap <= mergeThreshold) {
          current.str += (gap > 0.5 ? ' ' : '') + tok.str
          current.width = (tok.x + tok.width) - current.x
        } else {
          merged.push(current)
          current = { str: tok.str, x: tok.x, width: tok.width, fontSize: tok.fontSize || 10 }
        }
      }
    }
    if (current) merged.push(current)

    const fullText = merged.map(m => m.str).join(' ')
    const maxFontSize = Math.max(...merged.map(m => m.fontSize), 10)
    const avgY = rawTokens.reduce((sum, t) => sum + t.y, 0) / rawTokens.length

    return {
      y: avgY,
      fontSize: maxFontSize,
      tokens: merged,
      fullText
    }
  }

  function inferTableGrid(lines: VisualLine[]): { rows: (string | number)[][]; columnWidthRatios: number[] } {
    const starts: number[] = []
    for (const line of lines) {
      for (const tok of line.tokens) {
        starts.push(tok.x)
      }
    }
    starts.sort((a, b) => a - b)

    // Cluster starts into canonical column centers (adaptive proximity 24pt)
    const clusters: { center: number; count: number; items: number[] }[] = []
    for (const x of starts) {
      const match = clusters.find(c => Math.abs(c.center - x) < 24)
      if (match) {
        match.items.push(x)
        match.center = match.items.reduce((sum, val) => sum + val, 0) / match.items.length
        match.count++
      } else {
        clusters.push({ center: x, count: 1, items: [x] })
      }
    }
    clusters.sort((a, b) => a.center - b.center)

    // Column dividing boundaries at midpoints between cluster centers
    const boundaries: number[] = []
    for (let i = 0; i < clusters.length - 1; i++) {
      boundaries.push((clusters[i]!.center + clusters[i + 1]!.center) / 2)
    }

    function getColIndex(x: number): number {
      for (let b = 0; b < boundaries.length; b++) {
        if (x < boundaries[b]!) return b
      }
      return boundaries.length
    }

    const numCols = clusters.length
    const columnWidthRatios: number[] = []
    let prevBound = (clusters[0]?.center || 50) - 10
    for (let i = 0; i < numCols; i++) {
      const nextBound = i < boundaries.length ? boundaries[i]! : (clusters[numCols - 1]?.center || 500) + 60
      const w = Math.max(30, nextBound - prevBound)
      columnWidthRatios.push(w)
      prevBound = nextBound
    }
    const totalW = columnWidthRatios.reduce((s, v) => s + v, 0)
    const normPercentages = columnWidthRatios.map(w => Math.max(8, Math.round((w / (totalW || 1)) * 100)))

    // Stitch wrapped sub-lines into their parent row
    const normalizedLines: VisualLine[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const prevLine = lines[i - 1]
      const isWrap = prevLine &&
        Math.abs(prevLine.y - line.y) < line.fontSize * 1.35 &&
        line.tokens.length <= 2 &&
        prevLine.tokens.length > line.tokens.length

      if (isWrap && normalizedLines.length > 0) {
        const lastLine = normalizedLines[normalizedLines.length - 1]!
        lastLine.tokens.push(...line.tokens)
        lastLine.fullText += ' ' + line.fullText
      } else {
        normalizedLines.push({ ...line, tokens: [...line.tokens] })
      }
    }

    const rows: (string | number)[][] = []
    for (const line of normalizedLines) {
      const rowCells = new Array(numCols).fill('')
      for (const tok of line.tokens) {
        const colIdx = getColIndex(tok.x)
        if (rowCells[colIdx]) {
          rowCells[colIdx] += ' ' + tok.str
        } else {
          rowCells[colIdx] = tok.str
        }
      }

      // Convert financial & numeric strings to true numbers
      const parsedRow = rowCells.map(raw => {
        const str = String(raw).trim()
        const cleanNum = str
          .replace(/^(INR|Rs\.?|[₹$€£])\s*/i, '')
          .replace(/^\((.+)\)$/, '-$1')
          .replace(/,/g, '')

        if (/^[-+]?\d+(\.\d+)?$/.test(cleanNum) && !isNaN(Number(cleanNum))) {
          return Number(cleanNum)
        }
        return str
      })

      rows.push(parsedRow)
    }

    return {
      rows,
      columnWidthRatios: normPercentages
    }
  }

  function parseLayoutPage(rawItems: any[]): LayoutBlock[] {
    const items = (rawItems || []).filter((it: any) => it.str && it.str.trim())
    if (items.length === 0) return []

    const fontSizes = items.map((it: any) => it.fontSize || 10).sort((a: number, b: number) => a - b)
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 10

    // 1. Sort top-to-bottom (Y descending in PDF space), then left-to-right (X ascending)
    items.sort((a: any, b: any) => b.y - a.y || a.x - b.x)

    // 2. Cluster into lines with adaptive Y tolerance
    const lines: VisualLine[] = []
    let curLineTokens: LayoutToken[] = []
    let curY: number | null = null

    for (const item of items) {
      const threshold = Math.max(3.5, (item.fontSize || 10) * 0.45)
      if (curY === null || Math.abs(item.y - curY) > threshold) {
        if (curLineTokens.length > 0) {
          lines.push(buildVisualLine(curLineTokens))
        }
        curLineTokens = [item]
        curY = item.y
      } else {
        curLineTokens.push(item)
      }
    }
    if (curLineTokens.length > 0) {
      lines.push(buildVisualLine(curLineTokens))
    }

    // 3. Segment into semantic blocks (Headings, Paragraphs, Tables)
    const blocks: LayoutBlock[] = []
    let tableBuffer: VisualLine[] = []

    function flushTableBuffer() {
      if (tableBuffer.length === 0) return

      if (tableBuffer.length === 1 && tableBuffer[0]!.tokens.length === 1) {
        blocks.push({
          type: 'paragraph',
          text: tableBuffer[0]!.fullText
        })
        tableBuffer = []
        return
      }

      const { rows, columnWidthRatios } = inferTableGrid(tableBuffer)
      blocks.push({
        type: 'table',
        rows,
        columnWidthRatios
      })
      tableBuffer = []
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const isHeading1 = line.fontSize >= medianFontSize * 1.35
      const isHeading2 = line.fontSize >= medianFontSize * 1.18 && line.fontSize < medianFontSize * 1.35

      if (isHeading1 || isHeading2) {
        flushTableBuffer()
        blocks.push({
          type: 'heading',
          level: isHeading1 ? 1 : 2,
          text: line.fullText
        })
        continue
      }

      // Candidate table line has 2 or more distinct horizontal columns
      if (line.tokens.length >= 2) {
        tableBuffer.push(line)
        continue
      }

      // Single-token line while table is active: check if next line continues the table
      if (tableBuffer.length >= 2) {
        const nextLine = lines[i + 1]
        if (nextLine && nextLine.tokens.length >= 2) {
          tableBuffer.push(line)
          continue
        }
      }

      // Flush table buffer and treat as flowing paragraph
      flushTableBuffer()

      const prevBlock = blocks[blocks.length - 1]
      if (prevBlock && prevBlock.type === 'paragraph' && prevBlock.text) {
        prevBlock.text += ' ' + line.fullText
      } else {
        blocks.push({
          type: 'paragraph',
          text: line.fullText
        })
      }
    }

    flushTableBuffer()
    return blocks
  }

  // 10. PDF to Excel Converter (.xlsx / .csv via Coordinate Histogram Binning & Tabular Geometry)
  async function pdfToExcel(file: File, options?: PdfToExcelOptions): Promise<PdfToExcelResult> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 10
    statusMessage.value = 'Extracting 2D spatial text coordinates...'

    const baseName = file.name.replace(/\.[^/.]+$/, '')
    const format = options?.format || 'xlsx'
    const sheetMode = options?.sheetMode || 'multi_sheet'

    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const textExtract = await extractTextItems(buffer)
      const totalPages = textExtract.totalPages

      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Enterprise PDF Studio'
      workbook.created = new Date()

      let totalRowsExtracted = 0
      let maxColsExtracted = 0
      let totalTablesCount = 0
      const previewRows: (string | number)[][] = []
      const allRowsCombined: (string | number)[][] = []

      let consolidatedSheet: ExcelJS.Worksheet | null = null

      for (let p = 0; p < totalPages; p++) {
        statusMessage.value = `Analyzing layout & table geometry on page ${p + 1} of ${totalPages}...`
        const rawItems = (textExtract.items[p] || []).filter(it => it.str && it.str.trim())
        const blocks = parseLayoutPage(rawItems)

        const sheet = sheetMode === 'single_sheet'
          ? (consolidatedSheet || (consolidatedSheet = workbook.addWorksheet('Consolidated Data')))
          : workbook.addWorksheet(totalPages === 1 ? 'Extracted Data' : `Page ${p + 1}`)

        if (p > 0 && sheetMode === 'single_sheet') {
          sheet.addRow([])
          const pageHeader = sheet.addRow([`--- Page ${p + 1} ---`])
          pageHeader.font = { bold: true, italic: true, color: { argb: 'FF64748B' } }
          sheet.addRow([])
        }

        for (const block of blocks) {
          if (block.type === 'heading' && !options?.tableOnly) {
            const r = sheet.addRow([block.text])
            r.font = { bold: true, size: block.level === 1 ? 14 : 12, color: { argb: 'FF1E293B' } }
            allRowsCombined.push([block.text || ''])
            sheet.addRow([])
          } else if (block.type === 'paragraph' && !options?.tableOnly) {
            const r = sheet.addRow([block.text])
            r.font = { italic: true, size: 9.5, color: { argb: 'FF475569' } }
            allRowsCombined.push([block.text || ''])
          } else if (block.type === 'table' && block.rows && block.rows.length > 0) {
            totalTablesCount++
            const colLen = block.rows[0]?.length || 0
            if (colLen > maxColsExtracted) maxColsExtracted = colLen
            totalRowsExtracted += block.rows.length

            sheet.addRow([]) // spacer before table
            block.rows.forEach((row, rIdx) => {
              const isHeader = rIdx === 0
              const addedRow = sheet.addRow(row)
              allRowsCombined.push(row)

              if (previewRows.length < 8) {
                previewRows.push(row)
              }

              if (isHeader) {
                addedRow.height = 24
                addedRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
                addedRow.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FF1E293B' }
                }
              } else {
                addedRow.height = 20
                addedRow.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: rIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' }
                }
              }

              addedRow.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = {
                  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                  right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                }
                if (typeof cell.value === 'number') {
                  cell.alignment = { horizontal: 'right', vertical: 'middle' }
                  cell.numFmt = Number.isInteger(cell.value) ? '#,##0' : '#,##0.00'
                } else {
                  cell.alignment = { horizontal: isHeader ? 'center' : 'left', vertical: 'middle' }
                }
              })
            })
            sheet.addRow([]) // spacer after table
          }
        }

        // Auto-fit column widths
        const colCount = sheet.actualColumnCount || sheet.columnCount || 10
        for (let c = 1; c <= colCount; c++) {
          const col = sheet.getColumn(c)
          let maxLen = 12
          col.eachCell({ includeEmpty: false }, cell => {
            const val = cell.value ? String(cell.value) : ''
            if (val.length > maxLen) {
              maxLen = Math.min(val.length, 55)
            }
          })
          col.width = maxLen + 4
        }

        progressPercent.value = Math.round(15 + ((p + 1) / totalPages) * 75)
      }

      if (format === 'csv') {
        statusMessage.value = 'Generating CSV export...'
        const csvContent = allRowsCombined
          .map(row => row.map(cell => {
            const str = String(cell ?? '')
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str
          }).join(','))
          .join('\n')

        progressPercent.value = 100
        return {
          data: csvContent,
          filename: `${baseName}.csv`,
          rowCount: totalRowsExtracted,
          colCount: maxColsExtracted,
          tableCount: totalTablesCount,
          previewRows
        }
      }

      statusMessage.value = 'Compiling Excel XLSX binary...'
      const excelBuffer = await workbook.xlsx.writeBuffer()
      progressPercent.value = 100

      return {
        data: new Uint8Array(excelBuffer),
        filename: `${baseName}.xlsx`,
        rowCount: totalRowsExtracted,
        colCount: maxColsExtracted,
        tableCount: totalTablesCount,
        previewRows
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `PDF to Excel failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 11. PDF to Word Converter (.docx via Flowing Paragraph Reflow & Unified Native Tables)
  async function pdfToWord(file: File, options?: PdfToWordOptions): Promise<PdfToWordResult> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 10
    statusMessage.value = 'Extracting document flow & typography...'

    const baseName = file.name.replace(/\.[^/.]+$/, '')

    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const textExtract = await extractTextItems(buffer)
      const totalPages = textExtract.totalPages

      const docElements: (Paragraph | Table)[] = []
      let totalParagraphs = 0
      let totalTables = 0
      let totalHeadings = 0

      for (let p = 0; p < totalPages; p++) {
        statusMessage.value = `Reconstructing page ${p + 1} of ${totalPages}...`
        const rawItems = (textExtract.items[p] || []).filter(it => it.str && it.str.trim())
        if (rawItems.length === 0) continue

        if (p > 0 && options?.preservePageBreaks !== false) {
          docElements.push(new Paragraph({
            children: [new PageBreak()]
          }))
        }

        const blocks = parseLayoutPage(rawItems)

        for (const block of blocks) {
          if (block.type === 'heading') {
            totalHeadings++
            docElements.push(new Paragraph({
              text: block.text || '',
              heading: block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
              spacing: { before: 240, after: 120 }
            }))
          } else if (block.type === 'paragraph') {
            totalParagraphs++
            docElements.push(new Paragraph({
              children: [new TextRun({ text: block.text || '', size: 22 })], // 11pt
              spacing: { before: 80, after: 140, line: 276 }
            }))
          } else if (block.type === 'table' && block.rows && block.rows.length > 0) {
            totalTables++
            const numCols = block.rows[0]?.length || 1
            const widths = block.columnWidthRatios || new Array(numCols).fill(Math.round(100 / numCols))

            const tableRows = block.rows.map((row, rIdx) => {
              const isHeader = rIdx === 0
              return new TableRow({
                tableHeader: isHeader,
                children: row.map((cellVal, cIdx) => new TableCell({
                  width: { size: widths[cIdx] || Math.round(100 / numCols), type: WidthType.PERCENTAGE },
                  shading: isHeader
                    ? { fill: '1E293B' }
                    : (rIdx % 2 === 1 ? { fill: 'F8FAFC' } : undefined),
                  margins: { top: 120, bottom: 120, left: 140, right: 140 },
                  children: [
                    new Paragraph({
                      alignment: typeof cellVal === 'number' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                      children: [
                        new TextRun({
                          text: String(cellVal ?? ''),
                          bold: isHeader,
                          color: isHeader ? 'FFFFFF' : '1E293B',
                          size: 20 // 10pt
                        })
                      ]
                    })
                  ]
                }))
              })
            })

            // Unified, single native Table with cohesive styling
            docElements.push(new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
                insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' }
              }
            }))
          }
        }

        progressPercent.value = Math.round(15 + ((p + 1) / totalPages) * 75)
      }

      statusMessage.value = 'Assembling Word DOCX package...'
      const wordDoc = new Document({
        creator: 'Enterprise PDF Studio',
        title: baseName,
        sections: [{
          properties: {},
          children: docElements.length > 0
            ? docElements
            : [new Paragraph({ text: 'No text extracted from document.' })]
        }]
      })

      const blob = await Packer.toBlob(wordDoc)
      progressPercent.value = 100
      statusMessage.value = 'Word export complete!'

      return {
        blob,
        filename: `${baseName}.docx`,
        paragraphsCount: totalParagraphs,
        tablesCount: totalTables,
        headingsCount: totalHeadings
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `PDF to Word failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 12. Inspect PDF Total Pages and Metadata via unpdf
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

  // 13. Render Realistic First-Page Thumbnail via HTML5 Canvas (matches iLovePDF card preview)
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

  // 14. Render All Page Thumbnails for Visual Grid Editor
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
          canvas.width = Math.max(1, Math.floor(viewport.width))
          canvas.height = Math.max(1, Math.floor(viewport.height))

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

  // Helper: Universal Direct Browser Download
  function downloadBlob(data: Uint8Array | Blob | string, filename: string, mimeType = 'application/pdf') {
    let blob: Blob
    if (data instanceof Blob) {
      blob = data
    } else if (typeof data === 'string') {
      blob = new Blob([data], { type: mimeType })
    } else {
      blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType })
    }

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
    organizePdf,
    watermarkPdf,
    addPageNumbers,
    imagesToPdf,
    compressPdf,
    pdfToImages,
    pdfToExcel,
    pdfToWord,
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
