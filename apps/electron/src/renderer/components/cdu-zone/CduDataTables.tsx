import type { CduDataset } from '@profer/shared'

/** React 文本节点显示单元格，学校网页与导入 HTML 不直接注入应用 DOM。 */
export function CduDataSource({ data }: { data: CduDataset }): React.ReactElement {
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded-full bg-muted px-3 py-1">{data.source === 'file' ? '文件导入' : '教务同步'}{data.cached ? ' · 本地缓存' : ''}</span>
      <span>{data.semester}</span><span>学号 {data.accountId}</span>
      <time dateTime={new Date(data.fetchedAt).toISOString()}>{new Date(data.fetchedAt).toLocaleString('zh-CN')}</time>
    </div>
    {data.completeness === 'visible' && <p className="text-xs leading-6 text-muted-foreground">当前内容来自学校已加载的记录；其他学期、周次或分页需在学校确认后再同步。</p>}
  </div>
}

export function CduDataTables({ data, showSource = true }: { data: CduDataset; showSource?: boolean }): React.ReactElement {
  return <div className="space-y-4">
    {showSource && <CduDataSource data={data} />}
    {data.tables.map((table, tableIndex) => <div key={tableIndex} className="max-h-[440px] overflow-auto rounded-xl bg-background shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-muted"><tr>{table.headers.map((header, index) => <th key={index} className="min-w-24 px-4 py-3 font-medium">{header}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, index) => <tr key={index} className="odd:bg-muted/20 hover:bg-muted/50">{row.map((cell, col) => <td key={col} className="max-w-sm whitespace-pre-wrap px-4 py-3 align-top">{cell}</td>)}</tr>)}</tbody>
      </table>
      {!table.rows.length && <p className="p-6 text-sm text-muted-foreground">该表格暂无记录。</p>}
    </div>)}
  </div>
}
