import { useMemo, type CSSProperties } from 'react'
import type { CduDataset } from '@profer/shared'
import { CalendarDays, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@profer/ui/primitives/button'
import { buildCduSchedule, cduWeekday, selectCduScheduleWeek } from '@/lib/cdu-schedule'
import { useCduScheduleCalendar } from '@/hooks/useCduScheduleCalendar'
import { CduDataTables } from './CduDataTables'
import { CduScheduleToolbar } from './CduScheduleToolbar'
import { CduWeekGrid } from './CduWeekGrid'
import { cduCourseHue, cduCourseTime, describeCduCourse } from '@/lib/cdu-course-presentation'

const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

/** 周课表与日程共用同一份本地源数据，未知周次单列，日期只采用已核对校历。 */
export function CduScheduleView({ data }: { data: CduDataset }): React.ReactElement {
  const source = useMemo(() => buildCduSchedule(data.tables), [data.tables])
  const view = useCduScheduleCalendar(data, source)
  const model = useMemo(() => selectCduScheduleWeek(source, view.week), [source, view.week])
  const daily = model.grids.flatMap((grid, gridIndex) => grid.blocks.filter(block => cduWeekday(grid.days[block.day]!) === view.day).map(block => ({ grid, gridIndex, block }))).sort((a, b) => a.block.start - b.block.start)
  const dayDate = view.dateFor(view.day)
  return <div className="space-y-2">
    <CduScheduleToolbar view={view} />
    {view.mode === 'day' ? <section className="space-y-4 rounded-2xl bg-muted/30 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={17} />{dayDate || `第 ${view.week} 周`} · {weekdays[view.day - 1]}{dayDate === view.today ? ' · 今天' : ''}</h3><p className="mt-2 text-xs text-muted-foreground">已匹配 {daily.length} 个上课时段</p></div>
        <div className="flex gap-2"><Button size="icon" variant="ghost" aria-label="前一天" disabled={view.week === 1 && view.day === 1} onClick={() => view.shiftDay(-1)}><ChevronLeft size={16} /></Button><Button size="icon" variant="ghost" aria-label="后一天" disabled={view.week === view.totalWeeks && view.day === 7} onClick={() => view.shiftDay(1)}><ChevronRight size={16} /></Button></div>
      </header>
      {!daily.length && <p className="rounded-xl bg-background p-6 text-sm text-muted-foreground">当前日期没有匹配到课程，周次待确认的内容在下方单列。</p>}
      <div className="grid gap-3 lg:grid-cols-2">{daily.map(({ grid, gridIndex, block }) => <article key={`${gridIndex}:${block.start}`} className="cdu-course-card p-4" style={{ '--cdu-course-hue': cduCourseHue(block.entries[0]?.title || block.title) } as CSSProperties}>
        <p className="text-xs leading-6 opacity-75">{cduCourseTime(grid.periods, block.start, block.span)}</p>
        <h4 className="mt-2 text-sm font-semibold">{block.title}</h4>
        {block.entries.map((entry, index) => { const fields = describeCduCourse(entry); return <p key={index} className="mt-3 text-xs leading-6 opacity-80">{[fields.location, fields.teacher].filter(Boolean).join(' · ') || '查看原始安排'}{block.entries.length > 1 ? ` · ${entry.title}` : ''}</p> })}
        <details className="mt-3 text-[11px] opacity-75"><summary className="cursor-pointer">学校原始记录</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{block.text}</p></details>
      </article>)}</div>
    </section> : model.grids.map((grid, index) => <CduWeekGrid key={index} grid={grid} view={view} />)}
    {!!model.courses.length && <section className="space-y-3"><h3 className="text-sm font-semibold">本周未标具体日期的课程</h3><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{model.courses.map((course, index) => <article key={index} className="rounded-2xl bg-muted/35 p-5"><BookOpen size={17} className="mb-3 text-primary" /><h3 className="text-sm font-semibold">{course.title}</h3><dl className="mt-4 space-y-2">{course.details.map((detail, detailIndex) => <div key={detailIndex} className="text-xs leading-6"><dt className="text-muted-foreground">{detail.label}</dt><dd className="whitespace-pre-wrap break-words">{detail.value}</dd></div>)}</dl></article>)}</div></section>}
    {!!model.unconfirmed.length && <section className="space-y-3 rounded-2xl bg-muted/35 p-5"><h3 className="text-sm font-semibold">周次或日期待确认</h3><p className="text-xs leading-6 text-muted-foreground">这些记录未混入所选日期的日程，也未被当作每周上课。</p>{model.unconfirmed.map((item, index) => <article key={index} className="rounded-xl bg-card p-4"><h4 className="text-xs font-semibold">{item.entry.title}</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{item.day} · {item.period}<br />{item.entry.text}</p></article>)}</section>}
    {!!model.notes.length && <details className="rounded-2xl bg-muted/35 p-5"><summary className="cursor-pointer text-sm font-semibold">未标具体时段的课程备注</summary>{model.notes.map((note, index) => <p key={index} className="mt-3 whitespace-pre-wrap break-words text-xs leading-7 text-muted-foreground">{note}</p>)}</details>}
    <details className="rounded-xl bg-muted/20 p-4 text-xs text-muted-foreground"><summary className="cursor-pointer select-none">查看导入的原始表格</summary><div className="mt-4"><CduDataTables data={data} showSource={false} /></div></details>
  </div>
}
