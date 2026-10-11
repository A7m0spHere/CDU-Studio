import { useEffect } from 'react'
import { useAtom } from 'jotai'
import type { CduDataset } from '@profer/shared'
import { cduScheduleNavigationAtom, cduTodayAtom } from '@/atoms/cdu-atoms'
import { cduDateForWeekday, cduShanghaiToday, cduWeekdayForDate, cduWeekForDate, getCduCalendar, splitCduArrangements } from '@/lib/cdu-calendar'
import type { buildCduSchedule } from '@/lib/cdu-schedule'

export function useCduScheduleCalendar(data: CduDataset, model: ReturnType<typeof buildCduSchedule>) {
  const [today, setToday] = useAtom(cduTodayAtom)
  const [navigation, setNavigation] = useAtom(cduScheduleNavigationAtom)
  useEffect(() => {
    setToday(cduShanghaiToday())
    const timer = setInterval(() => setToday(cduShanghaiToday()), 60_000)
    return () => clearInterval(timer)
  }, [setToday])
  const calendar = getCduCalendar(data.semester)
  const observedWeeks = [
    ...model.grids.flatMap(grid => grid.blocks.flatMap(block => splitCduArrangements(block.text).flatMap(entry => entry.weeks || []))),
    ...model.courses.flatMap(course => splitCduArrangements([course.title, ...course.details.map(detail => detail.value)].join(' / ')).flatMap(entry => entry.weeks || [])),
  ]
  const totalWeeks = calendar?.totalWeeks || observedWeeks.reduce((max, week) => Math.max(max, week), 1)
  const currentWeek = calendar ? cduWeekForDate(calendar, today) : undefined
  const inTerm = currentWeek !== undefined && currentWeek >= 1 && currentWeek <= totalWeeks
  const key = `${data.accountId}:${data.semester}`
  const initial = { week: inTerm ? currentWeek! : 1, day: inTerm ? cduWeekdayForDate(today) : 1, mode: 'week' as const }
  const state = navigation[key] || initial
  const week = Math.min(totalWeeks, Math.max(1, state.week))
  const day = Math.min(7, Math.max(1, state.day))
  const update = (patch: Partial<typeof state>): void => setNavigation(value => ({ ...value, [key]: { ...state, week, day, ...patch } }))
  const dateFor = (weekday: number): string | undefined => calendar ? cduDateForWeekday(calendar, week, weekday) : undefined
  const shiftDay = (delta: number): void => {
    const index = Math.min(totalWeeks * 7 - 1, Math.max(0, (week - 1) * 7 + day - 1 + delta))
    update({ week: Math.floor(index / 7) + 1, day: index % 7 + 1, mode: 'day' })
  }
  const goDate = (date: string): void => {
    if (!calendar || !date) return
    try {
      const targetWeek = cduWeekForDate(calendar, date)
      if (targetWeek >= 1 && targetWeek <= totalWeeks) update({ week: targetWeek, day: cduWeekdayForDate(date), mode: 'day' })
    } catch { /* 原生日期输入尚未填写完整时保持当前日程。 */ }
  }
  return { calendar, today, totalWeeks, inTerm, week, day, mode: state.mode, update, dateFor, shiftDay, goDate,
    goToday: () => { if (inTerm) update({ week: currentWeek!, day: cduWeekdayForDate(today) }) },
  }
}
