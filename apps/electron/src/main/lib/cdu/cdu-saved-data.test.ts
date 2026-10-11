import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CduStore } from './cdu-store'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
test('Given 多账户多学期缓存 When 恢复本机数据 Then 仅恢复本人各类别最新记录且同批成绩保留全部可见行', () => {
  const root = mkdtempSync(join(tmpdir(), 'cdu-saved-')); roots.push(root)
  const store = new CduStore(() => root)
  const base = { domain: 'grades' as const, accountId: '20260001', source: 'page' as const, cached: false, completeness: 'visible' as const }
  store.save({ ...base, semester: '2025-2026-1', fetchedAt: 100, tables: [{ headers: ['课程', '成绩'], rows: [['旧课程', '80']] }] })
  store.save({ ...base, semester: '学校当前页面（跨学期）', fetchedAt: 200, tables: [{ headers: ['学年学期', '课程', '成绩'], rows: [['2025-2026-1', '数学', '90'], ['2025-2026-2', '物理', '85']] }] })
  store.save({ ...base, accountId: '20260002', semester: '2026-2027-1', fetchedAt: 300, tables: [{ headers: ['课程', '成绩'], rows: [['另一账户', '99']] }] })
  const broken = join(root, 'cdu-cache', '20260001', 'a'.repeat(64))
  mkdirSync(broken, { recursive: true }); writeFileSync(join(broken, 'grades.json'), JSON.stringify({ semester: '' }))
  const saved = store.latest('20260001')
  expect(saved).toHaveLength(1)
  expect(saved[0]?.tables[0]?.rows).toHaveLength(2)
  expect(saved[0]?.cached).toBe(true)
  expect(JSON.stringify(saved)).not.toContain('另一账户')
  store.clearCache('20260001'); expect(store.latest('20260001')).toEqual([])
})
