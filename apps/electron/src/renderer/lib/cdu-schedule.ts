import type { CduTable } from '@profer/shared'

export interface CduCourseCard { title: string; details: Array<{ label: string; value: string }> }
export interface CduScheduleGrid {
  days: string[]
  periods: string[]
  blocks: Array<{ day: number; start: number; span: number; text: string }>
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
