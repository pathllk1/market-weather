import { ref } from 'vue'
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import { getDocumentProxy, renderPageAsImage, extractTextItems } from 'unpdf'
import ExcelJS from 'exceljs'
import { Document, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, Packer } from 'docx'
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
}

export interface PdfToExcelResult {
  data: Uint8Array | string
  filename: string
  rowCount: number
  colCount: number
}

export interface PdfToWordResult {
  blob: Blob
  filename: string
  paragraphsCount: number
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

  // 10. PDF to Excel Converter (.xlsx / .csv via Spatial Coordinate Clustering)
  async function pdfToExcel(file: File, options?: PdfToExcelOptions): Promise<PdfToExcelResult> {
    isProcessing.value = true
    errorMessage.value = null
    progressPercent.value = 10
    statusMessage.value = 'Extracting 2D spatial text coordinates...'

    const baseName = file.name.replace(/\.[^/.]+$/, '')
    const format = options?.format || 'xlsx'

    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const textExtract = await extractTextItems(buffer)
      const totalPages = textExtract.totalPages

      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Enterprise PDF Studio'
      workbook.created = new Date()

      let totalRowsExtracted = 0
      let maxColsExtracted = 0
      const allRowsCombined: (string | number)[][] = []

      for (let p = 0; p < totalPages; p++) {
        statusMessage.value = `Clustering table geometry on page ${p + 1} of ${totalPages}...`
        const items = (textExtract.items[p] || []).filter(it => it.str && it.str.trim())

        // 1. Sort top-to-bottom (Y descending in PDF coordinate space)
        items.sort((a, b) => b.y - a.y || a.x - b.x)

        // 2. Cluster into physical rows using adaptive Y-tolerance
        const rawRows: typeof items[] = []
        let currentRow: typeof items = []
        let currentY: number | null = null

        for (const item of items) {
          const rowThreshold = (item.height || item.fontSize || 10) * 0.5
          if (currentY === null || Math.abs(item.y - currentY) > rowThreshold) {
            if (currentRow.length > 0) rawRows.push(currentRow)
            currentRow = [item]
            currentY = item.y
          } else {
            currentRow.push(item)
          }
        }
        if (currentRow.length > 0) rawRows.push(currentRow)

        // 3. For each row, merge horizontally adjacent tokens into cohesive cells
        const gridData: (string | number)[][] = rawRows.map(row => {
          row.sort((a, b) => a.x - b.x)
          const cells: { str: string; x: number; width: number }[] = []
          let curCell: { str: string; x: number; width: number } | null = null

          for (const tok of row) {
            if (!curCell) {
              curCell = { str: tok.str, x: tok.x, width: tok.width }
            } else {
              const gap = tok.x - (curCell.x + curCell.width)
              if (gap < (tok.fontSize || 10) * 0.8) {
                curCell.str += ' ' + tok.str
                curCell.width = (tok.x + tok.width) - curCell.x
              } else {
                cells.push(curCell)
                curCell = { str: tok.str, x: tok.x, width: tok.width }
              }
            }
          }
          if (curCell) cells.push(curCell)

          return cells.map(c => {
            const raw = c.str.trim()
            // Auto-parse numeric/financial strings so formulas work in Excel
            const cleanNumeric = raw.replace(/^[₹$€£]\s*/, '').replace(/,/g, '')
            if (/^[-+]?\d+(\.\d+)?$/.test(cleanNumeric) && !isNaN(Number(cleanNumeric))) {
              return Number(cleanNumeric)
            }
            return raw
          })
        })

        if (gridData.length > 0) {
          totalRowsExtracted += gridData.length
          const pageCols = Math.max(...gridData.map(r => r.length), 0)
          if (pageCols > maxColsExtracted) maxColsExtracted = pageCols

          const sheet = workbook.addWorksheet(totalPages === 1 ? 'Extracted Data' : `Page ${p + 1}`)
          gridData.forEach(row => sheet.addRow(row))
          allRowsCombined.push(...gridData)

          // Style header row (Row 1)
          if (sheet.rowCount > 0) {
            const headerRow = sheet.getRow(1)
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
            headerRow.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF1E293B' }
            }
          }

          // Auto-fit column widths
          sheet.columns.forEach(col => {
            let maxLen = 10
            col.eachCell?.({ includeEmpty: true }, cell => {
              const val = cell.value ? String(cell.value) : ''
              if (val.length > maxLen) maxLen = Math.min(val.length, 50)
            })
            col.width = maxLen + 3
          })
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
          colCount: maxColsExtracted
        }
      }

      statusMessage.value = 'Compiling Excel XLSX binary...'
      const excelBuffer = await workbook.xlsx.writeBuffer()
      progressPercent.value = 100

      return {
        data: new Uint8Array(excelBuffer),
        filename: `${baseName}.xlsx`,
        rowCount: totalRowsExtracted,
        colCount: maxColsExtracted
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errorMessage.value = `PDF to Excel failed: ${msg}`
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // 11. PDF to Word Converter (.docx via Paragraph Reflow & Native Tables)
  async function pdfToWord(file: File): Promise<PdfToWordResult> {
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

      for (let p = 0; p < totalPages; p++) {
        statusMessage.value = `Reflowing page ${p + 1} of ${totalPages}...`
        const items = (textExtract.items[p] || []).filter(it => it.str && it.str.trim())
        if (items.length === 0) continue

        // Determine baseline body font size (median)
        const fontSizes = items.map(it => it.fontSize || 10).sort((a, b) => a - b)
        const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 10

        items.sort((a, b) => b.y - a.y || a.x - b.x)

        // Group into lines
        const rawRows: typeof items[] = []
        let currentRow: typeof items = []
        let currentY: number | null = null

        for (const item of items) {
          const rowThreshold = (item.height || item.fontSize || 10) * 0.5
          if (currentY === null || Math.abs(item.y - currentY) > rowThreshold) {
            if (currentRow.length > 0) rawRows.push(currentRow)
            currentRow = [item]
            currentY = item.y
          } else {
            currentRow.push(item)
          }
        }
        if (currentRow.length > 0) rawRows.push(currentRow)

        for (const row of rawRows) {
          row.sort((a, b) => a.x - b.x)
          const firstTok = row[0]
          const isLargeHeader = firstTok && (firstTok.fontSize || 10) >= medianFontSize * 1.4
          const isSubHeader = firstTok && (firstTok.fontSize || 10) >= medianFontSize * 1.2

          // If multiple separate columns with large gaps, render as native Word Table
          if (row.length > 1 && !isLargeHeader) {
            const tableRow = new TableRow({
              children: row.map(cell => new TableCell({
                children: [new Paragraph({ children: [new TextRun(cell.str)] })]
              }))
            })
            docElements.push(new Table({ rows: [tableRow] }))
            totalParagraphs++
          } else {
            const lineText = row.map(c => c.str).join(' ')
            if (isLargeHeader) {
              docElements.push(new Paragraph({
                text: lineText,
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 240, after: 120 }
              }))
            } else if (isSubHeader) {
              docElements.push(new Paragraph({
                text: lineText,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 180, after: 80 }
              }))
            } else {
              docElements.push(new Paragraph({
                children: [new TextRun(lineText)],
                spacing: { after: 80 }
              }))
            }
            totalParagraphs++
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
            : [new Paragraph({ text: 'Empty document content.' })]
        }]
      })

      const blob = await Packer.toBlob(wordDoc)
      progressPercent.value = 100
      statusMessage.value = 'Word export complete!'

      return {
        blob,
        filename: `${baseName}.docx`,
        paragraphsCount: totalParagraphs
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
