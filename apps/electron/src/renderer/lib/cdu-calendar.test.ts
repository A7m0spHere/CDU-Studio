import { expect, test } from 'bun:test'
import { cduDateForWeekday, cduShanghaiToday, cduWeekForDate, getCduCalendar, parseCduWeeks, splitCduArrangements } from './cdu-calendar'

test('Given 成都大学已核对校历 When 定位今天与跨年日期 Then 精确映射教学周和自然日', () => {
  const calendar = getCduCalendar('2026-2027-1')!
  expect(cduWeekForDate(calendar, '2026-10-11')).toBe(5)
  expect(cduDateForWeekday(calendar, 5, 7)).toBe('2026-10-11')
  expect(cduDateForWeekday(calendar, 6, 1)).toBe('2026-10-12')
  expect(cduDateForWeekday(calendar, 17, 7)).toBe('2027-01-03')
  expect(cduWeekForDate(calendar, '2026-09-06')).toBe(0)
  expect(getCduCalendar('2027-2028-1')).toBeUndefined()
  expect(cduShanghaiToday(new Date('2026-10-11T16:30:00Z'))).toBe('2026-10-12')
})
test('Given 周次范围、离散周与单双周 When 解析 Then 不把无周次或异常内容当每周', () => {
  expect(parseCduWeeks('测试教师 1-4,7-8周')).toEqual([1, 2, 3, 4, 7, 8])
  expect(parseCduWeeks('1-8周(单)')).toEqual([1, 3, 5, 7])
  expect(parseCduWeeks('第2-8周（双周）')).toEqual([2, 4, 6, 8])
  expect(parseCduWeeks('5周')).toEqual([5])
  expect(parseCduWeeks('周次待定')).toBeNull()
  expect(parseCduWeeks('20-2周')).toBeNull()
  expect(parseCduWeeks('1-8周（待定）')).toBeNull()
  expect(parseCduWeeks('1-8周单独实验')).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})
test('Given 一格包含不同周次及不同课程 When 拆分 Then 后续周不会仍显示第一门课程', () => {
  const entries = splitCduArrangements('合成课程甲 / 教师甲 1-4周 / A101 / 考查 / / 合成课程乙 / 教师乙 9-16周 / B102 / 考试 /')
  expect(entries.map(entry => [entry.title, entry.weeks])).toEqual([
    ['合成课程甲', [1, 2, 3, 4]], ['合成课程乙', [9, 10, 11, 12, 13, 14, 15, 16]],
  ])
  expect(splitCduArrangements('合成课程 / 周次待定 / A101')[0]?.weeks).toBeNull()
})
