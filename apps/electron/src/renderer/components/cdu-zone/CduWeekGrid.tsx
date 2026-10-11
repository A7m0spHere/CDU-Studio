import { cduWeekday, type selectCduScheduleWeek } from '@/lib/cdu-schedule'
import { cn } from '@/lib/utils'
import { useCduTimetableFit } from '@/hooks/useCduTimetableFit'
import type { useCduScheduleCalendar } from '@/hooks/useCduScheduleCalendar'
import { CduCourseCard } from './CduCourseCard'

type WeekGrid = ReturnType<typeof selectCduScheduleWeek>['grids'][number]
function sectionBreak(periods: string[], row: number): boolean {
  if (!row) return false
  const hour = Number(periods[row]?.split(' / ')[1]?.split(':')[0])
  const previous = Number(periods[row - 1]?.split(' / ')[1]?.split(':')[0])
  return hour >= 12 && previous < 12 || hour >= 18 && previous < 18
}
export function CduWeekGrid({ grid, view }: { grid: WeekGrid; view: ReturnType<typeof useCduScheduleCalendar> }): React.ReactElement {
  const ref = useCduTimetableFit(grid.periods.length, grid.days.length, 44)
  const uniqueDays = new Set(grid.days.map(cduWeekday)).size === grid.days.length
  const month = view.dateFor(1)?.slice(5, 7)
  return <section className="cdu-timetable-board overflow-hidden rounded-xl border border-border/50">
    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground"><span>{grid.blocks.length} 个上课时段</span><span>点击日期查看当天 · 点击课程查看详情</span></div>
    {!grid.blocks.length && <p className="px-3 pb-1 text-[10px] text-muted-foreground">本周没有可确认的课程；待确认项在下方保留。</p>}
    <div ref={ref} data-cdu-timetable className="overflow-x-auto pb-1" style={{ height: 'var(--cdu-timetable-height, max(320px, calc(100dvh - 260px)))' }}>
      <div className="grid h-full" style={{ gridTemplateColumns: `48px repeat(${grid.days.length}, minmax(0, 1fr))`, gridTemplateRows: `44px repeat(${grid.periods.length}, minmax(0, 1fr))`, minWidth: Math.max(600, 48 + grid.days.length * 70) }}>
        <div className="flex items-center justify-center border-b border-border/50 text-[10px] font-medium text-muted-foreground">{month ? `${Number(month)}月` : '节次'}</div>
        {grid.days.map((day, dayIndex) => {
          const weekday = cduWeekday(day)
          const date = uniqueDays ? view.dateFor(weekday) : undefined
          const today = date === view.today
          return <button key={dayIndex} aria-label={`${date || ''} ${day}，查看当天`} onClick={() => view.update({ day: weekday, mode: 'day' })} className={cn('flex flex-col items-center justify-center gap-0.5 border-b border-border/50 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring', today && 'bg-primary/[0.03]')}><span>{day.replace('星期', '周')}</span>{date && <time dateTime={date} className={cn('flex size-6 items-center justify-center rounded-full text-xs font-semibold text-foreground', today && 'bg-primary text-primary-foreground')}>{date.slice(8)}</time>}</button>
        })}
        {grid.periods.map((period, row) => <div key={row} title={period} aria-label={period} className={cn('flex min-h-0 flex-col items-center justify-center border-b border-border/30 text-center', sectionBreak(grid.periods, row) && 'border-t border-t-border/70')} style={{ gridRow: row + 2, gridColumn: 1 }}><span className="text-[10px] font-medium leading-3 text-foreground/80">{period.split(' / ')[0]}</span>{period.includes(' / ') && <span className="text-[9px] leading-3 text-muted-foreground">{period.split(' / ')[1]}</span>}</div>)}
        {grid.periods.flatMap((_period, row) => grid.days.map((day, column) => <div key={`${row}:${column}`} className={cn('cdu-timetable-slot', sectionBreak(grid.periods, row) && 'is-break', uniqueDays && view.dateFor(cduWeekday(day)) === view.today && 'bg-primary/[0.025]')} style={{ gridRow: row + 2, gridColumn: column + 2 }} />))}
        {grid.blocks.map((block, blockIndex) => <article key={blockIndex} aria-label={`${view.dateFor(cduWeekday(grid.days[block.day]!)) || grid.days[block.day]} ${block.title}`} className="z-[1] min-h-0 min-w-0 p-[3px]" style={{ gridColumn: block.day + 2, gridRow: `${block.start + 2} / span ${block.span}` }}>
          <CduCourseCard block={block} date={view.dateFor(cduWeekday(grid.days[block.day]!))} day={grid.days[block.day]!} periods={grid.periods} />
        </article>)}
      </div>
    </div>
  </section>
}
