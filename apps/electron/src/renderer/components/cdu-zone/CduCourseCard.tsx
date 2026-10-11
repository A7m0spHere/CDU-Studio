import type { CSSProperties } from 'react'
import { MapPin, UserRound } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@profer/ui/primitives/popover'
import { cduCourseHue, cduCourseTime, describeCduCourse } from '@/lib/cdu-course-presentation'
import type { selectCduScheduleWeek } from '@/lib/cdu-schedule'
import { cn } from '@/lib/utils'

type CourseBlock = ReturnType<typeof selectCduScheduleWeek>['grids'][number]['blocks'][number]
export function CduCourseCard({ block, date, day, periods }: { block: CourseBlock; date?: string; day: string; periods: string[] }): React.ReactElement {
  const fields = block.entries.map(describeCduCourse)
  const locations = [...new Set(fields.flatMap(field => field.location ? [field.location] : []))].join(' / ')
  const teachers = [...new Set(fields.flatMap(field => field.teacher ? [field.teacher] : []))].join(' / ')
  const hue = cduCourseHue(block.entries[0]?.title || block.title)
  return <Popover>
    <PopoverTrigger asChild><button type="button" aria-label={`查看课程详情：${block.title}`} className="cdu-course-card flex h-full w-full min-w-0 flex-col overflow-hidden px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ '--cdu-course-hue': hue } as CSSProperties}>
      <span className={cn('cdu-course-title block break-words text-[11.5px] font-semibold leading-[15px]', block.span > 1 ? 'line-clamp-2' : 'line-clamp-1')}>{block.title}</span>
      {block.span > 1 && <div className="mt-auto space-y-0.5 pt-1 text-[10px] leading-3 opacity-80">
        {locations && <p className="flex min-w-0 items-center gap-1"><MapPin size={10} className="shrink-0" /><span className="truncate">{locations}{block.span <= 2 && teachers ? ` · ${teachers}` : ''}</span></p>}
        {teachers && (!locations || block.span > 2) && <p className="flex min-w-0 items-center gap-1"><UserRound size={10} className="shrink-0" /><span className="truncate">{teachers}</span></p>}
      </div>}
    </button></PopoverTrigger>
    <PopoverContent className="w-80 max-h-96 max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl p-4 text-xs" side="top">
      <div className="flex items-start gap-2"><span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: `hsl(${hue} 55% 55%)` }} /><h4 className="text-sm font-semibold leading-5">{block.title}</h4></div>
      <p className="mt-2 text-[11px] text-muted-foreground">{date || day} · {day}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{cduCourseTime(periods, block.start, block.span)}</p>
      {fields.map((field, index) => <section key={index} className="mt-3 rounded-lg bg-muted/40 p-3">
        {fields.length > 1 && <h5 className="mb-2 font-medium">{block.entries[index]!.title}</h5>}
        <dl className="grid grid-cols-[36px_1fr] gap-x-3 gap-y-2 leading-5"><dt className="text-muted-foreground">地点</dt><dd>{field.location || '原记录未明确提供'}</dd><dt className="text-muted-foreground">教师</dt><dd>{field.teacher || '原记录未明确提供'}</dd><dt className="text-muted-foreground">周次</dt><dd>{field.weeks || '待确认'}</dd></dl>
      </section>)}
      <details className="mt-3 text-[11px] text-muted-foreground"><summary className="cursor-pointer">学校原始记录</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{block.text}</p></details>
    </PopoverContent>
  </Popover>
}
