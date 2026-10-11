import * as React from 'react'
import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CduDataset } from '@profer/shared'
import { CduDatasetView } from './CduDatasetView'
import { Provider, createStore } from 'jotai'
import { cduScheduleNavigationAtom, cduTodayAtom } from '@/atoms/cdu-atoms'

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
test('Given 官方校历与分周课程 When 查看第5周 Then 七天有日期且只展示匹配课程', () => {
  const store = createStore(); store.set(cduTodayAtom, '2026-10-11')
  const data = { ...base, tables: [{ headers: ['节次', '星期一', '星期六', '星期日'], rows: [['1 / 08:30 / 09:15', '第六周课程 / 教师甲 6周 / A101 / 考试', '第五周课程 / 教师乙 5周 / A102 / 考查', '']] }] }
  store.set(cduScheduleNavigationAtom, { '20260001:2026-2027-1': { week: 5, day: 7, mode: 'week' } })
  const html = renderToStaticMarkup(<Provider store={store}><CduDatasetView data={data} /></Provider>).split('查看导入的原始表格')[0]!
  expect(html).toContain('2026-10-05')
  expect(html).toContain('2026-10-11')
  expect(html).toContain('第五周课程')
  expect(html).not.toContain('第六周课程')
  store.set(cduScheduleNavigationAtom, { '20260001:2026-2027-1': { week: 5, day: 6, mode: 'day' } })
  const daily = renderToStaticMarkup(<Provider store={store}><CduDatasetView data={data} /></Provider>).split('查看导入的原始表格')[0]!
  expect(daily).toContain('2026-10-10')
  expect(daily).toContain('第五周课程')
  expect(daily).toContain('08:30–09:15')
})
