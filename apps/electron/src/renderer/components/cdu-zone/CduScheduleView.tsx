import { useMemo } from 'react'
import type { CduDataset } from '@profer/shared'
import { CalendarDays, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@profer/ui/primitives/button'
import { buildCduSchedule, cduWeekday, selectCduScheduleWeek } from '@/lib/cdu-schedule'
import { useCduScheduleCalendar } from '@/hooks/useCduScheduleCalendar'
import { cn } from '@/lib/utils'
import { CduDataTables } from './CduDataTables'
import { CduScheduleToolbar } from './CduScheduleToolbar'

const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
function periodRange(periods: string[], start: number, span: number): string {
  const first = periods[start]!.split(' / '); const last = periods[start + span - 1]!.split(' / ')
  const slots = /^\d+$/.test(first[0]!) ? `第 ${first[0]}${span > 1 ? `–${last[0]}` : ''} 节` : `${first[0]}${span > 1 ? ` — ${last[0]}` : ''}`
  return first[1] && last[2] ? `${first[1]}–${last[2]} · ${slots}` : slots
}

/** 周课表与日程共用同一份本地源数据，未知周次单列，日期只采用已核对校历。 */
export function CduScheduleView({ data }: { data: CduDataset }): React.ReactElement {
  const source = useMemo(() => buildCduSchedule(data.tables), [data.tables])
  const view = useCduScheduleCalendar(data, source)
  const model = useMemo(() => selectCduScheduleWeek(source, view.week), [source, view.week])
  const daily = model.grids.flatMap((grid, gridIndex) => grid.blocks.filter(block => cduWeekday(grid.days[block.day]!) === view.day).map(block => ({ grid, gridIndex, block }))).sort((a, b) => a.block.start - b.block.start)
  const dayDate = view.dateFor(view.day)
  return <div className="space-y-5">
    <CduScheduleToolbar view={view} />
    {view.mode === 'day' ? <section className="space-y-4 rounded-2xl bg-muted/30 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={17} />{dayDate || `第 ${view.week} 周`} · {weekdays[view.day - 1]}{dayDate === view.today ? ' · 今天' : ''}</h3><p className="mt-2 text-xs text-muted-foreground">已匹配 {daily.length} 个上课时段</p></div>
        <div className="flex gap-2"><Button size="icon" variant="ghost" aria-label="前一天" disabled={view.week === 1 && view.day === 1} onClick={() => view.shiftDay(-1)}><ChevronLeft size={16} /></Button><Button size="icon" variant="ghost" aria-label="后一天" disabled={view.week === view.totalWeeks && view.day === 7} onClick={() => view.shiftDay(1)}><ChevronRight size={16} /></Button></div>
      </header>
      {!daily.length && <p className="rounded-xl bg-background p-6 text-sm text-muted-foreground">当前日期没有匹配到课程，周次待确认的内容在下方单列。</p>}
      <div className="grid gap-3 lg:grid-cols-2">{daily.map(({ grid, gridIndex, block }) => <article key={`${gridIndex}:${block.start}`} className="rounded-2xl bg-card p-5 shadow-sm">
        <p className="text-xs leading-6 text-muted-foreground">{periodRange(grid.periods, block.start, block.span)}</p>
        <h4 className="mt-2 text-sm font-semibold">{block.title}</h4><p className="mt-3 whitespace-pre-wrap break-words text-xs leading-7 text-muted-foreground">{block.text}</p>
      </article>)}</div>
    </section> : model.grids.map((grid, index) => <section key={index} className="overflow-hidden rounded-2xl bg-muted/30">
      <div className="flex items-center gap-2 px-5 py-4 text-sm font-medium"><CalendarDays size={16} />第 {view.week} 周课表<span className="ml-auto text-xs font-normal text-muted-foreground">点击日期查看当天</span></div>
      {!grid.blocks.length && <p className="px-5 pb-4 text-xs leading-6 text-muted-foreground">本周没有可确认的课程；周次待确认项和无具体时段的备注在下方保留。</p>}
      <div className="max-h-[680px] overflow-auto p-2">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `52px repeat(${grid.days.length}, minmax(130px, 1fr))`, gridTemplateRows: `60px repeat(${grid.periods.length}, minmax(66px, auto))`, minWidth: 52 + grid.days.length * 136 }}>
          <div className="sticky top-0 z-10 flex items-center justify-center rounded-xl bg-card text-xs text-muted-foreground">节次</div>
          {grid.days.map((day, dayIndex) => {
            const weekday = cduWeekday(day)
            const date = new Set(grid.days.map(cduWeekday)).size === grid.days.length ? view.dateFor(weekday) : undefined
            return <button key={dayIndex} aria-label={`${date || ''} ${day}，查看当天`} onClick={() => view.update({ day: weekday, mode: 'day' })} className={cn('sticky top-0 z-10 flex flex-col items-center justify-center gap-1 rounded-xl bg-card text-xs shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', date === view.today && 'bg-primary text-primary-foreground hover:bg-primary/90')}><span>{day}</span>{date && <time dateTime={date} className="text-sm font-semibold">{date.slice(5).replace('-', '/')}</time>}</button>
          })}
          {grid.periods.map((period, row) => <div key={row} className="flex flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground" style={{ gridRow: row + 2, gridColumn: 1 }}><span>{period.split(' / ')[0]}</span>{period.includes(' / ') && <span className="text-[10px] leading-4">{period.split(' / ').slice(1).map((time, timeIndex) => <span key={timeIndex} className="block">{time}</span>)}</span>}</div>)}
          {grid.periods.flatMap((_period, row) => grid.days.map((_day, column) => <div key={`${row}:${column}`} className="rounded-xl bg-background/70" style={{ gridRow: row + 2, gridColumn: column + 2 }} />))}
          {grid.blocks.map((block, blockIndex) => <article key={blockIndex} aria-label={`${view.dateFor(cduWeekday(grid.days[block.day]!)) || grid.days[block.day]} ${block.title}`} className="z-[1] min-w-0 rounded-xl bg-primary/10 p-3 text-primary shadow-sm" style={{ gridColumn: block.day + 2, gridRow: `${block.start + 2} / span ${block.span}` }}>
            <h3 className="break-words text-xs font-semibold leading-5">{block.title}</h3><p className="mt-2 line-clamp-3 break-words text-[11px] leading-5 opacity-80">{block.text}</p><details className="mt-2 text-[10px]"><summary className="cursor-pointer opacity-70">展开本周安排</summary><p className="mt-2 whitespace-pre-wrap break-words leading-5">{block.text}</p></details>
          </article>)}
        </div>
      </div>
    </section>)}
    {!!model.courses.length && <section className="space-y-3"><h3 className="text-sm font-semibold">本周未标具体日期的课程</h3><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{model.courses.map((course, index) => <article key={index} className="rounded-2xl bg-muted/35 p-5"><BookOpen size={17} className="mb-3 text-primary" /><h3 className="text-sm font-semibold">{course.title}</h3><dl className="mt-4 space-y-2">{course.details.map((detail, detailIndex) => <div key={detailIndex} className="text-xs leading-6"><dt className="text-muted-foreground">{detail.label}</dt><dd className="whitespace-pre-wrap break-words">{detail.value}</dd></div>)}</dl></article>)}</div></section>}
    {!!model.unconfirmed.length && <section className="space-y-3 rounded-2xl bg-muted/35 p-5"><h3 className="text-sm font-semibold">周次或日期待确认</h3><p className="text-xs leading-6 text-muted-foreground">这些记录未混入所选日期的日程，也未被当作每周上课。</p>{model.unconfirmed.map((item, index) => <article key={index} className="rounded-xl bg-card p-4"><h4 className="text-xs font-semibold">{item.entry.title}</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{item.day} · {item.period}<br />{item.entry.text}</p></article>)}</section>}
    {!!model.notes.length && <details className="rounded-2xl bg-muted/35 p-5"><summary className="cursor-pointer text-sm font-semibold">未标具体时段的课程备注</summary>{model.notes.map((note, index) => <p key={index} className="mt-3 whitespace-pre-wrap break-words text-xs leading-7 text-muted-foreground">{note}</p>)}</details>}
    <details className="rounded-xl bg-muted/20 p-4 text-xs text-muted-foreground"><summary className="cursor-pointer select-none">查看导入的原始表格</summary><div className="mt-4"><CduDataTables data={data} showSource={false} /></div></details>
  </div>
}
