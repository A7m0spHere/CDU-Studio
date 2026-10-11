interface XlsxEngine { toMarkdown(): Promise<string>; destroy(): void }
interface XlsxModule { XlsxWorkbook: { load(buffer: ArrayBuffer, options: { wasmUrl: string }): Promise<XlsxEngine> } }

/** 复用应用已有的本地 Silurus WASM，不向第三方上传学校文件。 */
export async function readCduImportFile(file: File): Promise<{ format: 'csv' | 'html' | 'markdown'; content: string }> {
  if (file.size > 8_000_000) throw new Error('文件超过 8 MB，请先缩小导出范围')
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'xlsx') {
    const base = new URL('./vendor/ooxml/', window.location.href).href
    const module = await import(/* @vite-ignore */ `${base}xlsx.mjs`) as XlsxModule
    const manifest = await import(/* @vite-ignore */ `${base}wasm-manifest.mjs`)
    const workbook = await module.XlsxWorkbook.load(await file.arrayBuffer(), { wasmUrl: `${base}${manifest.default.xlsx}` })
    try { return { format: 'markdown', content: await workbook.toMarkdown() } }
    finally { workbook.destroy() }
  }
  if (!['csv', 'html', 'htm'].includes(extension ?? '')) throw new Error('仅支持 CSV、HTML 表格和 XLSX；旧版 XLS 请先另存为 XLSX')
  return { format: extension === 'csv' ? 'csv' : 'html', content: await file.text() }
}
