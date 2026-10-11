import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@profer/ui/primitives/button'
import { Input } from '@profer/ui/primitives/input'
import { useCduScheduleCalendar } from '@/hooks/useCduScheduleCalendar'
import { cduDateForWeekday } from '@/lib/cdu-calendar'

export function CduScheduleToolbar({ view }: { view: ReturnType<typeof useCduScheduleCalendar> }): React.ReactElement {
  return <section className="space-y-1 rounded-xl bg-muted/35 p-2">
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="icon-sm" variant="ghost" aria-label="上一周" disabled={view.week === 1} onClick={() => view.update({ week: view.week - 1 })}><ChevronLeft size={16} /></Button>
        <select aria-label="选择教学周" value={view.week} onChange={event => view.update({ week: Number(event.target.value) })} className="rounded-xl bg-background px-2 py-1 text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {Array.from({ length: view.totalWeeks }, (_, index) => <option key={index} value={index + 1}>第 {index + 1} 周</option>)}
        </select>
        <Button size="icon-sm" variant="ghost" aria-label="下一周" disabled={view.week === view.totalWeeks} onClick={() => view.update({ week: view.week + 1 })}><ChevronRight size={16} /></Button>
        <Button size="sm" className="h-7 px-2 text-[11px]" variant="outline" disabled={!view.inTerm} onClick={view.goToday}>回到本周</Button>
        {view.calendar && <Input aria-label="选择具体日期" type="date" value={view.dateFor(view.day)} min={view.calendar.firstMonday} max={cduDateForWeekday(view.calendar, view.totalWeeks, 7)} onChange={event => view.goDate(event.target.value)} className="h-7 w-36 bg-background text-[11px]" />}
      </div>
      <div className="flex gap-1 rounded-xl bg-background p-1">
        <Button size="sm" className="h-7 px-2 text-[11px]" variant={view.mode === 'week' ? 'secondary' : 'ghost'} aria-pressed={view.mode === 'week'} onClick={() => view.update({ mode: 'week' })}>周视图</Button>
        <Button size="sm" className="h-7 px-2 text-[11px]" variant={view.mode === 'day' ? 'secondary' : 'ghost'} aria-pressed={view.mode === 'day'} onClick={() => view.update({ mode: 'day' })}>日视图</Button>
      </div>
    </div>
    {view.calendar ? <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-muted-foreground"><p>{view.dateFor(1)} — {view.dateFor(7)}</p><details><summary className="cursor-pointer">校历与调课说明</summary><p className="mt-1 max-w-sm">官方校历 · 第一周 {view.calendar.firstMonday}{!view.inTerm ? ' · 今天不在该学期内' : ''}。按课程原始周次排课；节假日、停课和临时调课以学校通知为准。</p></details></div>
      : <p className="text-xs leading-6 text-muted-foreground">该学期校历尚未核对，暂按已识别周次筛选，不显示推测日期。</p>}
  </section>
}
