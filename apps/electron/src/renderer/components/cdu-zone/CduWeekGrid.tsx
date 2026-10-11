import { CalendarDays } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@profer/ui/primitives/popover'
import { cduWeekday, type selectCduScheduleWeek } from '@/lib/cdu-schedule'
import { cn } from '@/lib/utils'
import { useCduTimetableFit } from '@/hooks/useCduTimetableFit'
import type { useCduScheduleCalendar } from '@/hooks/useCduScheduleCalendar'

type WeekGrid = ReturnType<typeof selectCduScheduleWeek>['grids'][number]
export function CduWeekGrid({ grid, view }: { grid: WeekGrid; view: ReturnType<typeof useCduScheduleCalendar> }): React.ReactElement {
  const ref = useCduTimetableFit(grid.periods.length, grid.days.length)
  const uniqueDays = new Set(grid.days.map(cduWeekday)).size === grid.days.length
  return <section className="overflow-hidden rounded-xl bg-muted/25">
    <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium"><CalendarDays size={12} />第 {view.week} 周<span className="ml-auto text-[10px] font-normal text-muted-foreground">点击课程查看详情</span></div>
    {!grid.blocks.length && <p className="px-2 pb-1 text-[10px] text-muted-foreground">本周没有可确认的课程；待确认项在下方保留。</p>}
    <div ref={ref} data-cdu-timetable className="overflow-x-auto px-1 pb-1" style={{ height: 'var(--cdu-timetable-height, max(320px, calc(100dvh - 260px)))' }}>
      <div className="grid h-full gap-0.5" style={{ gridTemplateColumns: `38px repeat(${grid.days.length}, minmax(0, 1fr))`, gridTemplateRows: `32px repeat(${grid.periods.length}, minmax(0, 1fr))`, minWidth: Math.max(600, 38 + grid.days.length * 70) }}>
        <div className="flex items-center justify-center rounded-md bg-card text-[10px] text-muted-foreground">节次</div>
        {grid.days.map((day, dayIndex) => {
          const weekday = cduWeekday(day)
          const date = uniqueDays ? view.dateFor(weekday) : undefined
          return <button key={dayIndex} aria-label={`${date || ''} ${day}，查看当天`} onClick={() => view.update({ day: weekday, mode: 'day' })} className={cn('flex flex-col items-center justify-center rounded-md bg-card text-[10px] transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', date === view.today && 'bg-primary text-primary-foreground hover:bg-primary/90')}><span>{day}</span>{date && <time dateTime={date} className="text-[11px] font-semibold leading-3">{date.slice(5).replace('-', '/')}</time>}</button>
        })}
        {grid.periods.map((period, row) => <div key={row} title={period} aria-label={period} className="flex min-h-0 flex-col items-center justify-center text-center text-muted-foreground" style={{ gridRow: row + 2, gridColumn: 1 }}><span className="text-[10px] leading-3">{period.split(' / ')[0]}</span>{period.includes(' / ') && <span className="text-[9px] leading-[10px]">{period.split(' / ')[1]}</span>}</div>)}
        {grid.periods.flatMap((_period, row) => grid.days.map((_day, column) => <div key={`${row}:${column}`} className="rounded-md bg-background/70" style={{ gridRow: row + 2, gridColumn: column + 2 }} />))}
        {grid.blocks.map((block, blockIndex) => <article key={blockIndex} aria-label={`${view.dateFor(cduWeekday(grid.days[block.day]!)) || grid.days[block.day]} ${block.title}`} className="z-[1] min-h-0 min-w-0" style={{ gridColumn: block.day + 2, gridRow: `${block.start + 2} / span ${block.span}` }}>
          <Popover>
            <PopoverTrigger asChild><button type="button" aria-label={`查看课程详情：${block.title}`} className="h-full w-full overflow-hidden rounded-md bg-primary/10 px-1.5 py-1 text-left text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className={cn('block break-words text-[11px] font-semibold leading-[14px]', block.span > 1 ? 'line-clamp-2' : 'line-clamp-1')}>{block.title}</span>
              {block.span > 1 && <p className="mt-0.5 line-clamp-2 break-words text-[10px] leading-3 opacity-75">{block.entries.map(entry => entry.text.split(' / ').slice(1).join(' · ')).join(' / ')}</p>}
            </button></PopoverTrigger>
            <PopoverContent className="max-h-80 max-w-[calc(100vw-32px)] overflow-y-auto text-xs" side="top">
              <h4 className="text-sm font-semibold">{block.title}</h4><p className="mt-2 leading-5 text-muted-foreground">{view.dateFor(cduWeekday(grid.days[block.day]!)) || grid.days[block.day]} · {grid.periods[block.start]}{block.span > 1 ? ` — ${grid.periods[block.start + block.span - 1]}` : ''}</p>
              <p className="mt-3 whitespace-pre-wrap break-words leading-6">{block.text}</p>
            </PopoverContent>
          </Popover>
        </article>)}
      </div>
    </div>
  </section>
}
