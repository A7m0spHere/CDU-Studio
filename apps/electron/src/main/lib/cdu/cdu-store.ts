import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { CduAccountProfile, CduDataset, CduDomain, CduImportInput, CduImportPreview } from '@profer/shared'
import { getConfigDir } from '../config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from '../safe-file'
import { CDU_DOMAINS, parseCduCsv, parseCduMarkdown, parseHtmlTables, selectCduTables } from './cdu-page-parser'

export function validateCduDomain(value: unknown): asserts value is CduDomain {
  if (!CDU_DOMAINS.includes(value as CduDomain)) throw new Error('未知 CDU 查询类别')
}
export function validateCduAccount(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{6,20}$/.test(value)) throw new Error('请填写 6–20 位学号，用于隔离本地数据')
}
export function validateCduSemester(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) throw new Error('请填写学期，最多 40 个字符')
}

/** JSON 文件按账户、学期隔离；不保存学校密码、Cookie 或原始网页。 */
export class CduStore {
  private previews = new Map<string, { owner: number; expires: number; data: CduDataset }>()
  constructor(private readonly root = getConfigDir) {}
  private accountPath(): string { return join(this.root(), 'cdu-account.json') }
  private cacheRoot(account: string): string {
    validateCduAccount(account)
    return join(this.root(), 'cdu-cache', account)
  }
  private datasetPath(account: string, semester: string, domain: CduDomain): string {
    validateCduDomain(domain); validateCduSemester(semester)
    return join(this.cacheRoot(account), createHash('sha256').update(semester.trim()).digest('hex'), `${domain}.json`)
  }
  loadAccount(): CduAccountProfile {
    const saved = readJsonFileSafe<CduAccountProfile>(this.accountPath())
    return saved && typeof saved.studentId === 'string' && /^\d{6,20}$/.test(saved.studentId)
      ? { studentId: saved.studentId, studentName: typeof saved.studentName === 'string' ? saved.studentName : '', college: typeof saved.college === 'string' ? saved.college : undefined, major: typeof saved.major === 'string' ? saved.major : undefined, status: 'disconnected', lastVerifiedAt: saved.lastVerifiedAt }
      : { studentId: '', studentName: '', status: 'disconnected' }
  }
  saveAccount(profile: CduAccountProfile): void {
    const { studentId, studentName, college, major, lastVerifiedAt } = profile
    validateCduAccount(studentId)
    mkdirSync(this.root(), { recursive: true })
    writeJsonFileAtomic(this.accountPath(), { studentId, studentName, college, major, lastVerifiedAt })
  }
  clearAccount(): void {
    for (const suffix of ['', '.bak', '.tmp']) rmSync(this.accountPath() + suffix, { force: true })
    this.previews.clear()
  }
  save(data: CduDataset): void {
    const file = this.datasetPath(data.accountId, data.semester, data.domain)
    mkdirSync(join(file, '..'), { recursive: true })
    writeJsonFileAtomic(file, { ...data, cached: false })
    // 跨学期成绩保留当前页面投影，同时按行内真实学期隔离缓存；范围仍为 visible。
    if (data.domain === 'grades' && data.source === 'page' && data.semester === '学校当前页面（跨学期）') {
      const semesters = new Set<string>()
      for (const table of data.tables) {
        const column = table.headers.findIndex(label => /学年学期|^学期$/.test(label))
        if (column >= 0) for (const row of table.rows) if (/^\d{4}-\d{4}-[1-3]$/.test(row[column] ?? '')) semesters.add(row[column]!)
      }
      for (const semester of semesters) {
        const tables = data.tables.flatMap(table => {
          const column = table.headers.findIndex(label => /学年学期|^学期$/.test(label))
          const rows = column < 0 ? [] : table.rows.filter(row => row[column] === semester)
          return rows.length ? [{ headers: table.headers, rows }] : []
        })
        this.save({ ...data, semester, tables })
      }
    }
  }
  load(account: string, semester: string, domain: CduDomain): CduDataset | null {
    const data = readJsonFileSafe<CduDataset>(this.datasetPath(account, semester, domain))
    return data && data.accountId === account && data.semester === semester && data.domain === domain
      && ['page', 'interface', 'file'].includes(data.source) && ['visible', 'complete', 'imported'].includes(data.completeness)
      && Number.isFinite(data.fetchedAt) && data.fetchedAt > 0 && Array.isArray(data.tables)
      && data.tables.every(table => table && Array.isArray(table.headers) && table.headers.every(cell => typeof cell === 'string')
        && Array.isArray(table.rows) && table.rows.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string')))
      ? { ...data, cached: true } : null
  }
  invalidatePreviews(): void { this.previews.clear() }
  clearCache(account: string): void {
    rmSync(this.cacheRoot(account), { recursive: true, force: true })
    for (const [key, value] of this.previews) if (value.data.accountId === account) this.previews.delete(key)
  }
  preview(input: CduImportInput, owner: number): CduImportPreview {
    validateCduDomain(input?.domain); validateCduAccount(input?.accountId); validateCduSemester(input?.semester)
    if (typeof input.content !== 'string' || Buffer.byteLength(input.content) > 8_000_000) throw new Error('文件内容为空或超过 8 MB')
    const all = input.format === 'csv' ? parseCduCsv(input.content) : input.format === 'html' ? parseHtmlTables(input.content) : input.format === 'markdown' ? parseCduMarkdown(input.content) : []
    const tables = selectCduTables(input.domain, all)
    if (!tables.length) throw new Error('未识别到所选类别的表头，请检查文件类别与格式')
    if (tables.some(table => table.headers.length > 100 || table.rows.some(row => row.length !== table.headers.length)) || tables.reduce((count, table) => count + table.rows.length, 0) > 5000) throw new Error('表格列数不一致或超过导入上限（100 列、5000 行）')
    const data: CduDataset = { domain: input.domain, accountId: input.accountId, semester: input.semester.trim(), tables, source: 'file', fetchedAt: Date.now(), cached: false, completeness: 'imported' }
    for (const [key, value] of this.previews) if (value.expires < Date.now() || value.owner === owner) this.previews.delete(key)
    const token = randomUUID()
    this.previews.set(token, { data, owner, expires: Date.now() + 600_000 })
    return { token, data, warnings: ['仅导入预览中的表格，不代表学校实时数据；请核对学号、学期及全部记录。'] }
  }
  commit(token: string, owner: number, expectedAccount?: string): CduDataset {
    const pending = this.previews.get(token)
    if (!pending || pending.owner !== owner || pending.expires < Date.now()) throw new Error('导入预览已失效，请重新选择文件')
    if (expectedAccount && pending.data.accountId !== expectedAccount) throw new Error('学校账户已变化，请重新预览导入文件')
    this.save(pending.data)
    this.previews.delete(token)
    return pending.data
  }
}
