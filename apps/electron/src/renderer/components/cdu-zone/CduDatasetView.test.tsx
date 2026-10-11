import * as React from 'react'
import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CduDataset } from '@profer/shared'
import { CduDatasetView } from './CduDatasetView'

const base: CduDataset = { domain: 'schedule', accountId: '20260001', semester: '2026-2027-1', tables: [], source: 'file', fetchedAt: 100, cached: true, completeness: 'imported' }
test('Given 已导入课表 When 在专区显示 Then 使用课程卡片且不嵌入网页', () => {
  const html = renderToStaticMarkup(<CduDatasetView data={{ ...base, tables: [{ headers: ['节次', '周一', '周二'], rows: [['1', '测试课程 / 测试教室', '']] }] }} />)
  expect(html).toContain('<article')
  expect(html).toContain('测试课程')
  expect(html).toContain('本地缓存')
  expect(html).not.toContain('<iframe')
  expect(html).not.toContain('<webview')
})
test('Given 学校空考试结果 When 显示 Then 明示当前同步范围而不宣称全部批次无考试', () => {
  const html = renderToStaticMarkup(<CduDatasetView data={{ ...base, domain: 'exams', tables: [{ headers: ['考试课程', '考试时间'], rows: [] }] }} />)
  expect(html).toContain('当前同步范围内暂无考试安排')
  expect(html).toContain('其他考试批次')
})
