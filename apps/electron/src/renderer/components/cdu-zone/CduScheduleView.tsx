import { useMemo } from 'react'
import type { CduDataset } from '@profer/shared'
import { CalendarDays, BookOpen } from 'lucide-react'
import { buildCduSchedule } from '@/lib/cdu-schedule'
import { CduDataTables } from './CduDataTables'

/** 本地课程投影；学校网页只承担认证和数据同步，不嵌入应用内容区。 */
export function CduScheduleView({ data }: { data: CduDataset }): React.ReactElement {
  const model = useMemo(() => buildCduSchedule(data.tables), [data.tables])
  return <div className="space-y-5">
    {model.grids.map((grid, index) => <section key={index} className="overflow-hidden rounded-2xl bg-muted/30">
      <div className="flex items-center gap-2 px-5 py-4 text-sm font-medium"><CalendarDays size={16} />学期课表<span className="ml-auto text-xs font-normal text-muted-foreground">按学校原始节次排列</span></div>
      {!grid.blocks.length && <p className="px-5 pb-4 text-xs leading-6 text-muted-foreground">当前同步的网格中没有课程。请核对学校的学期与周次筛选；网络课和实践课程请查看下方备注。</p>}
      <div className="overflow-x-auto p-2">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `52px repeat(${grid.days.length}, minmax(130px, 1fr))`, gridTemplateRows: `40px repeat(${grid.periods.length}, minmax(66px, auto))`, minWidth: 52 + grid.days.length * 136 }}>
          <div className="flex items-center justify-center text-xs text-muted-foreground">节次</div>
          {grid.days.map((day, dayIndex) => <div key={dayIndex} className="flex items-center justify-center rounded-xl bg-card text-xs font-medium">{day}</div>)}
          {grid.periods.map((period, row) => <div key={row} className="flex flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground" style={{ gridRow: row + 2, gridColumn: 1 }}><span>{period.split(' / ')[0]}</span>{period.includes(' / ') && <span className="text-[10px] leading-4">{period.split(' / ').slice(1).map((time, index) => <span key={index} className="block">{time}</span>)}</span>}</div>)}
          {grid.periods.flatMap((_period, row) => grid.days.map((_day, column) => <div key={`${row}:${column}`} className="rounded-xl bg-background/70" style={{ gridRow: row + 2, gridColumn: column + 2 }} />))}
          {grid.blocks.map((block, blockIndex) => {
            const [title, ...details] = block.text.split(/\s+\/\s+|\n/)
            return <article key={blockIndex} aria-label={`${grid.days[block.day]} ${grid.periods[block.start]}节 ${title}`} className="z-[1] min-w-0 rounded-xl bg-primary/10 p-3 text-primary shadow-sm transition-colors hover:bg-primary/15" style={{ gridColumn: block.day + 2, gridRow: `${block.start + 2} / span ${block.span}` }}>
              <h3 className="break-words text-xs font-semibold leading-5">{title}</h3>
              {details.length > 0 && <><p className="mt-2 line-clamp-3 break-words text-[11px] leading-5 opacity-80">{details.join(' · ')}</p><details className="mt-2 text-[10px]"><summary className="cursor-pointer opacity-70">展开完整安排</summary><p className="mt-2 whitespace-pre-wrap break-words leading-5">{block.text}</p></details></>}
            </article>
          })}
        </div>
      </div>
    </section>)}
    {!!model.courses.length && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{model.courses.map((course, index) => <article key={index} className="rounded-2xl bg-muted/35 p-5">
      <BookOpen size={17} className="mb-3 text-primary" /><h3 className="text-sm font-semibold">{course.title}</h3>
      <dl className="mt-4 space-y-2">{course.details.map((detail, detailIndex) => <div key={detailIndex} className="text-xs leading-6"><dt className="text-muted-foreground">{detail.label}</dt><dd className="whitespace-pre-wrap break-words">{detail.value}</dd></div>)}</dl>
    </article>)}</div>}
    {!!model.notes.length && <section className="rounded-2xl bg-muted/35 p-5"><h3 className="text-sm font-semibold">网络课与其他课程备注</h3>{model.notes.map((note, index) => <p key={index} className="mt-3 whitespace-pre-wrap break-words text-xs leading-7 text-muted-foreground">{note}</p>)}</section>}
    <details className="rounded-xl bg-muted/20 p-4 text-xs text-muted-foreground"><summary className="cursor-pointer select-none">查看导入的原始表格</summary><div className="mt-4"><CduDataTables data={data} showSource={false} /></div></details>
  </div>
}
