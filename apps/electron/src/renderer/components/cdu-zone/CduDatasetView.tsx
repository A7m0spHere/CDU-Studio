import type { CduDataset } from '@profer/shared'
import { GraduationCap } from 'lucide-react'
import { CduDataSource, CduDataTables } from './CduDataTables'
import { CduScheduleView } from './CduScheduleView'

export function CduDatasetView({ data }: { data: CduDataset }): React.ReactElement {
  const count = data.tables.reduce((sum, table) => sum + table.rows.length, 0)
  const fields = data.domain === 'profile' ? data.tables.filter(table => table.headers[0] === '字段').flatMap(table => table.rows) : []
  return <div className={data.domain === 'schedule' ? 'space-y-2' : 'space-y-5'}>
    <CduDataSource data={data} compact={data.domain === 'schedule'} />
    {data.domain === 'schedule' ? <CduScheduleView data={data} />
      : fields.length ? <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map((row, index) => <div key={index} className="rounded-2xl bg-muted/35 p-5"><dt className="text-xs text-muted-foreground">{row[0]}</dt><dd className="mt-3 break-words text-sm font-medium">{row[1] || '未提供'}</dd></div>)}</dl>
      : data.domain === 'exams' && count === 0 ? <div className="rounded-2xl bg-muted/30 px-6 py-12 text-center"><GraduationCap className="mx-auto mb-4 text-muted-foreground" size={28} /><h3 className="text-sm font-semibold">当前同步范围内暂无考试安排</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">已保留学校的空记录结果。其他考试批次需确认后重新同步。</p></div>
      : <><p className="text-xs text-muted-foreground">已保存 {count} 条{data.domain === 'grades' ? '成绩' : '记录'} · 可离线查看</p><CduDataTables data={data} showSource={false} /></>}
  </div>
}
