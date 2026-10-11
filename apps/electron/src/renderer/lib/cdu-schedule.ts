import type { CduTable } from '@profer/shared'
import { splitCduArrangements, type CduArrangement } from './cdu-calendar'

export interface CduCourseCard { title: string; details: Array<{ label: string; value: string }> }
export interface CduScheduleGrid {
  days: string[]
  periods: string[]
  blocks: Array<{ day: number; start: number; span: number; text: string }>
}
export function cduWeekday(label: string): number { return '一二三四五六日'.indexOf(label.trim().slice(-1).replace('天', '日')) + 1 }

/** 先拆课程的不同周次安排，再按目标周筛选；待确认项不混入该周日程。 */
export function selectCduScheduleWeek(model: ReturnType<typeof buildCduSchedule>, week: number) {
  const unconfirmed: Array<{ day: string; period: string; entry: CduArrangement }> = []
  const grids = model.grids.map(grid => ({ ...grid, blocks: grid.blocks.flatMap(block => {
    const entries = splitCduArrangements(block.text)
    const ambiguous = new Set(grid.days.map(cduWeekday)).size !== grid.days.length
    for (const entry of entries) if (!entry.weeks || ambiguous) unconfirmed.push({ day: grid.days[block.day]!, period: grid.periods[block.start]!, entry })
    const matches = ambiguous ? [] : entries.filter(entry => entry.weeks?.includes(week))
    return matches.length ? [{ ...block, title: [...new Set(matches.map(entry => entry.title))].join(' / '), text: matches.map(entry => entry.text).join('\n'), entries: matches }] : []
  }) }))
  const courses = model.courses.filter(course => {
    const entry = splitCduArrangements([course.title, ...course.details.map(detail => detail.value)].join(' / '))[0]
    if (!entry?.weeks) { unconfirmed.push({ day: '未提供星期', period: '未提供时段', entry: entry || { title: course.title, text: course.title, weeks: null } }); return false }
    return entry.weeks.includes(week)
  })
  return { grids, courses, notes: model.notes, unconfirmed }
}

/** 只投影学校/文件中已有的信息，不推算学期起始日或编造课程时间。 */
export function buildCduSchedule(tables: CduTable[]): { grids: CduScheduleGrid[]; courses: CduCourseCard[]; notes: string[] } {
  const grids: CduScheduleGrid[] = []; const courses: CduCourseCard[] = []; const notes = new Set<string>()
  for (const table of tables) {
    const days = table.headers.flatMap((label, index) => /^(?:星期|周)[一二三四五六日天]$/.test(label.trim()) ? [{ label, index }] : [])
    if (!days.length) {
      const titleIndex = table.headers.findIndex(label => /课程|科目/.test(label))
      for (const row of table.rows) courses.push({ title: row[titleIndex] || '课程信息', details: table.headers.flatMap((label, index) => index !== titleIndex && row[index] ? [{ label, value: row[index]! }] : []) })
      continue
    }
    const period = table.headers.findIndex(label => /^(节次|节数|时间|上课时间)$/.test(label.trim()))
    const rows = table.rows.filter(row => {
      if (!/备注|说明/.test(row[0] ?? '')) return true
      row.filter(value => value && !/^(备注|说明)$/.test(value)).forEach(value => notes.add(value)); return false
    })
    const grid: CduScheduleGrid = { days: days.map(day => day.label), periods: rows.map((row, index) => period >= 0 ? row[period] || `时段 ${index + 1}` : `时段 ${index + 1}`), blocks: [] }
    days.forEach((day, dayIndex) => {
      for (let start = 0; start < rows.length;) {
        const text = rows[start]?.[day.index]?.trim() || ''
        let span = 1
        while (text && start + span < rows.length && rows[start + span]?.[day.index]?.trim() === text) span++
        if (text) grid.blocks.push({ day: dayIndex, start, span, text })
        start += span
      }
    })
    grids.push(grid)
  }
  return { grids, courses, notes: [...notes] }
}
