import { parseCduWeeks, type CduArrangement } from './cdu-calendar'

export function cduCourseTime(periods: string[], start: number, span: number): string {
  const first = periods[start]!.split(' / '); const last = periods[start + span - 1]!.split(' / ')
  const slots = /^\d+$/.test(first[0]!) ? `第 ${first[0]}${span > 1 ? `–${last[0]}` : ''} 节` : `${first[0]}${span > 1 ? ` — ${last[0]}` : ''}`
  return first[1] && last[2] ? `${first[1]}–${last[2]} · ${slots}` : slots
}

/** 课程色以课名确定，切换教学周或教师后不变。 */
export function cduCourseHue(title: string): number {
  const hues = [216, 166, 270, 32, 345, 191, 80, 240]
  let hash = 2166136261
  for (const char of title.normalize('NFKC').trim().replace(/\s+/g, ' ')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hues[(hash >>> 0) % hues.length]!
}

/** 仅整理已有字段；无法确认时省略摘要字段，原文仍在详情中。 */
export function describeCduCourse(entry: CduArrangement): { teacher?: string; location?: string; weeks?: string } {
  const tokens = entry.text.split(' / ').map(token => token.trim())
  const weekIndex = tokens.findIndex(token => parseCduWeeks(token) !== null)
  if (weekIndex < 0) return {}
  const weekToken = tokens[weekIndex]!
  const digit = weekToken.search(/\d/)
  const prefix = weekToken.slice(0, digit).replace(/第\s*$/, '').replace(/^(?:教师|任课教师)[:：]\s*/, '').trim()
  const candidate = prefix || (weekIndex > 1 ? tokens[weekIndex - 1] : undefined)
  const teacher = candidate && /^[\u4e00-\u9fff·、，, A-Za-z.-]{2,30}$/.test(candidate) ? candidate : undefined
  const location = tokens.slice(weekIndex + 1).map(token => token.replace(/^(?:教室|地点|上课地点)[:：]\s*/, '')).find(token =>
    !/周|节|^(考试|考查|考核)$/.test(token) && /^(?:[A-Za-z\d][A-Za-z\d-]{1,11}|[^/]{0,30}(?:教室|实验室|教学楼|楼|馆|场)[^/]{0,12}|在线教学|线上教学)$/.test(token))
  return { teacher, location, weeks: weekToken.slice(digit).trim() }
}
