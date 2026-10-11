/** 已逐项核对成都大学官方 2026 年校历；未核对的学期不推算开学日。 */
export interface CduCalendar { semester: string; firstMonday: string; totalWeeks: number; source: string }
export const CDU_CALENDAR_SOURCE = 'https://www.cdu.edu.cn/xyfw/chengdoudaxue2026nianxiaoli.pdf'
const calendars: CduCalendar[] = [
  { semester: '2025-2026-2', firstMonday: '2026-03-09', totalWeeks: 19, source: CDU_CALENDAR_SOURCE },
  { semester: '2026-2027-1', firstMonday: '2026-09-07', totalWeeks: 19, source: CDU_CALENDAR_SOURCE },
]
export function getCduCalendar(semester: string): CduCalendar | undefined { return calendars.find(item => item.semester === semester) }
const DAY = 86_400_000
function dateValue(value: string): number {
  const result = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) throw new Error('日期格式无效')
  return result
}
export function cduDateForWeekday(calendar: CduCalendar, week: number, weekday: number): string {
  if (!Number.isInteger(week) || week < 1 || week > calendar.totalWeeks || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new Error('教学周或星期超出范围')
  return new Date(dateValue(calendar.firstMonday) + ((week - 1) * 7 + weekday - 1) * DAY).toISOString().slice(0, 10)
}
export function cduWeekForDate(calendar: CduCalendar, date: string): number { return Math.floor((dateValue(date) - dateValue(calendar.firstMonday)) / (7 * DAY)) + 1 }
export function cduWeekdayForDate(date: string): number { return new Date(dateValue(date)).getUTCDay() || 7 }
export function cduShanghaiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (type: string): string => parts.find(part => part.type === type)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

const WEEK = /(?<![\d,，、-])(?:第)?(\d{1,2}(?:\s*(?:[-–—至]\s*\d{1,2}|[,，、]\s*\d{1,2}))*)\s*(?:[（(](单|双)(?:周)?[）)])?\s*周(?:\s*(?:[（(](单|双)(?:周)?[）)]|(单|双)周))?/g
/** 无法确认周次返回 null，不将其解释成每周。 */
export function parseCduWeeks(text: string): number[] | null {
  if (/待定|待确认|未定|隔周|不定期/.test(text)) return null
  const matches = [...text.matchAll(WEEK)]
  if (matches.length !== 1) return null
  const match = matches[0]!
  const parity = match[2] || match[3] || match[4]
  const weeks = new Set<number>()
  for (const part of match[1]!.replace(/\s/g, '').replace(/[–—至]/g, '-').split(/[,，、]/)) {
    const [start, end = start] = part.split('-').map(Number)
    if (!start || !end || start > end || end > 53) return null
    for (let week = start; week <= end; week++) if (!parity || week % 2 === (parity === '单' ? 1 : 0)) weeks.add(week)
  }
  return weeks.size ? [...weeks].sort((a, b) => a - b) : null
}
export interface CduArrangement { title: string; text: string; weeks: number[] | null }
/** 学校课程通常以考核方式分隔；无法可靠拆分时保留原文并标为待确认。 */
export function splitCduArrangements(text: string): CduArrangement[] {
  const tokens = text.split(/\s*\/\s*|\r?\n/).map(value => value.trim()).filter(Boolean)
  const groups: string[][] = []; let current: string[] = []
  for (const token of tokens) {
    current.push(token)
    if (/^(考试|考查|考核)$/.test(token)) { groups.push(current); current = [] }
  }
  if (current.length) groups.push(current)
  return groups.map(group => ({ title: group[0] || '课程信息', text: group.join(' / '), weeks: parseCduWeeks(group.join(' / ')) }))
}
