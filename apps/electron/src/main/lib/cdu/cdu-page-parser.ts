import { load } from 'cheerio'
import type { CduDomain, CduTable } from '@profer/shared'

export const CDU_DOMAINS: CduDomain[] = ['profile', 'schedule', 'grades', 'exams']
export const CDU_LABELS: Record<CduDomain, string> = { profile: '个人资料', schedule: '课表', grades: '成绩', exams: '考试安排' }
const signatures: Record<CduDomain, RegExp[]> = {
  profile: [/学号|姓名/, /学院|专业|班级|学籍/],
  schedule: [/课程|星期|周一/, /周次|节次|节数|星期|周二|上课时间|教室/],
  grades: [/课程|科目/, /成绩|绩点/],
  exams: [/课程|科目/, /考试时间|考试日期|考试地点|考场/],
}
export function cleanCduText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[\t\r\n ]+/g, ' ').trim()
}
export function classifyCduPage(url: string, body: string): 'business' | 'login_required' | 'verification_required' | 'site_blocked' {
  if (/403\s*Forbidden|页面正在修复|访问被拒绝|Access Denied|系统维护中|维护期间/i.test(body)) return 'site_blocked'
  const location = new URL(url)
  // Sangfor 资源页保留屏外防自动填充密码框；不能把它当成仍处于登录页。
  if (location.hostname === 'vpn.cdu.edu.cn' && location.pathname.startsWith('/portal/') && location.hash === '#!/service') return 'business'
  if (/短信验证码|企业微信扫码|扫码验证|二次认证/.test(body)) return 'verification_required'
  const host = location.hostname
  if (host === 'vpn.cdu.edu.cn' && location.pathname.startsWith('/portal/') && location.hash === '#!/login') return 'login_required'
  if (host === 'id.cdu.edu.cn' || /data-cdu-login-required/.test(body) || /<input[^>]+type=["']password/i.test(body)) return 'login_required'
  return 'business'
}

/** 保留合并单元格及换行，避免课表时间和周次丢失。 */
export function parseHtmlTables(html: string): CduTable[] {
  const $ = load(html)
  $('script,style,noscript').remove()
  const tables: CduTable[] = []
  const grids = new Set<unknown>()
  // 学校 EasyUI 网格将表头、数据和冻结列分成多张表，必须按 field 合并。
  $('.datagrid-view').each((_index, view) => {
    const columns = new Map<string, string>()
    $(view).find('.datagrid-header td[field],.datagrid-header th[field],.datagrid-header [data-field]').each((_i, cell) => {
      if ($(cell).closest('.datagrid-view')[0] !== view) return
      const field = $(cell).attr('field') ?? $(cell).attr('data-field')
      const label = cleanCduText($(cell).text())
      if (field && label) columns.set(field, label)
    })
    if (!columns.size) return
    if (columns.size > 100 || tables.length >= 50) throw new Error('业务网格超过 100 列或 50 张表格')
    const rows = new Map<string, Map<string, string>>()
    $(view).find('.datagrid-body').each((_i, body) => {
      $(body).find('tr.datagrid-row,tr[datagrid-row-index]').each((index, row) => {
        if ($(row).closest('.datagrid-view')[0] !== view) return
        const key = $(row).attr('datagrid-row-index') ?? String(index)
        if (!rows.has(key)) {
          if (rows.size >= 5000) throw new Error('业务网格超过 5000 行')
          rows.set(key, new Map())
        }
        $(row).children('td[field],td[data-field]').each((_j, cell) => {
          const field = $(cell).attr('field') ?? $(cell).attr('data-field')
          if (!field || !columns.has(field)) return
          const copy = $(cell).clone(); copy.find('br').replaceWith(' / ')
          rows.get(key)!.set(field, cleanCduText(copy.text()))
        })
      })
    })
    grids.add(view)
    tables.push({ headers: [...columns.values()], rows: [...rows.values()].map(row => [...columns.keys()].map(field => row.get(field) ?? '')) })
  })
  $('table').each((_index, element) => {
    if (grids.has($(element).closest('.datagrid-view')[0]) || $(element).find('table').length) return
    if (tables.length >= 50) throw new Error('表格数量超过上限（50 张）')
    const grid: string[][] = []
    $(element).find('tr').filter((_i, row) => $(row).closest('table')[0] === element).each((rowIndex, row) => {
      if (rowIndex > 5000) throw new Error('表格行数超过上限（5000 行）')
      grid[rowIndex] ??= []
      let col = 0
      $(row).children('th,td').each((_j, cell) => {
        while (grid[rowIndex]![col] !== undefined) col++
        const copy = $(cell).clone()
        copy.find('br').replaceWith(' / ')
        const control = $(cell).find('input:not([type=password]),select,textarea').first()
        const value = cleanCduText(String(control.length ? control.val() ?? copy.text() : copy.text()))
        const rowspan = Math.min(100, Math.max(1, Number($(cell).attr('rowspan')) || 1))
        const colspan = Math.min(100, Math.max(1, Number($(cell).attr('colspan')) || 1))
        if (col + colspan > 100 || rowIndex + rowspan > 5001) throw new Error('表格超过 100 列或 5000 行')
        for (let r = 0; r < rowspan; r++) {
          grid[rowIndex + r] ??= []
          for (let c = 0; c < colspan; c++) grid[rowIndex + r]![col + c] = value
        }
        col += colspan
      })
    })
    const rows = grid.filter(row => row.some(Boolean))
    // 合并的标题行不是列名，保留实际表头及所有业务行。
    while (rows.length > 1 && rows[0]!.length > 1 && new Set(rows[0]).size === 1) rows.shift()
    if (rows.length) tables.push({ headers: rows[0]!, rows: rows.slice(1) })
  })
  return tables
}

/** CSV 支持引号内逗号、换行和双引号转义。 */
export function parseCduCsv(content: string): CduTable[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  const appendCell = (): void => {
    if (row.length >= 100) throw new Error('CSV 超过 100 列')
    row.push(cleanCduText(cell)); cell = ''
  }
  const appendRow = (): void => {
    if (row.some(Boolean)) {
      if (rows.length >= 5001) throw new Error('CSV 超过 5000 行')
      rows.push(row)
    }
    row = []
  }
  const text = content.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (char === ',' && !quoted) appendCell()
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      appendCell(); appendRow()
    } else cell += char
  }
  if (quoted) throw new Error('CSV 引号未闭合，请检查文件格式')
  if (cell || row.length) { appendCell(); appendRow() }
  return rows.length ? [{ headers: rows[0]!, rows: rows.slice(1) }] : []
}

/** XLSX 的 Markdown 投影按工作表分开解析。 */
export function parseCduMarkdown(content: string): CduTable[] {
  const tables: CduTable[] = []; let rows: string[][] = []
  const flush = (): void => {
    if (rows.length) {
      if (tables.length >= 50) throw new Error('工作表数量超过上限（50 张）')
      tables.push({ headers: rows[0]!, rows: rows.slice(1) })
    }
    rows = []
  }
  for (const line of content.split('\n')) {
    if (!line.trim().startsWith('|')) { flush(); continue }
    const cells = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cleanCduText(cell.replace(/\\\|/g, '|')))
    if (cells.every(cell => /^:?-+:?$/.test(cell))) continue
    if (cells.length > 100 || rows.length >= 5001) throw new Error('工作表超过 100 列或 5000 行')
    rows.push(cells)
  }
  flush(); return tables
}

export function selectCduTables(domain: CduDomain, tables: CduTable[]): CduTable[] {
  return tables.filter(table => {
    // 学籍标签可纵向排列；其余业务只使用表头，防止把导航或其他表格误认成业务。
    const sample = domain === 'profile' ? [table.headers, ...table.rows].flat().join(' ') : table.headers.join(' ')
    return signatures[domain].every(pattern => pattern.test(sample))
  })
}

export function extractCduIdentity(html: string): { studentId: string; studentName: string } | null {
  const $ = load(html); $('script,style,input,textarea,select').remove()
  $('td,th,label,p,div,span,dt,dd').append(' ')
  const text = cleanCduText($.text())
  let studentId = /(?:学号|学工号)\s*[：:]?\s*(\d{6,20})(?!\d)/.exec(text)?.[1]
  let studentName = /姓名\s*[：:]?\s*([\u4e00-\u9fff·]{2,12})/.exec(text)?.[1]
  // 学校真实业务顶栏为“姓名 / 学号 学生”，不把公开页面的任意数字视为身份。
  $('a').each((_i, anchor) => {
    const match = /^([\u4e00-\u9fff·]{2,12})\s*\/\s*(\d{6,20})\s*学生$/.exec(cleanCduText($(anchor).text()))
    if (match) { studentName = match[1]; studentId = match[2] }
  })
  if ((!studentId || !studentName) && /年级[：:]/.test(text) && /学院[：:]/.test(text) && /班级[：:]/.test(text)) {
    const card = /([\u4e00-\u9fff·]{2,12})\s+(\d{6,20})\s*\|/.exec(text)
    if (card) { studentName = card[1]; studentId = card[2] }
  }
  // 横向身份表只接受单条记录，避免将班级名单中的首位学生误认为本人。
  for (const table of parseHtmlTables($.html())) {
    if (table.rows.length !== 1) continue
    const idColumn = table.headers.findIndex(label => /^(学号|学工号)[：:]?$/.test(label))
    const nameColumn = table.headers.findIndex(label => /^姓名[：:]?$/.test(label))
    const first = table.rows[0]
    if (first && idColumn >= 0 && nameColumn >= 0 && /^\d{6,20}$/.test(first[idColumn] ?? '')
      && /^[\u4e00-\u9fff·]{2,12}$/.test(first[nameColumn] ?? '')) {
      studentId = first[idColumn]; studentName = first[nameColumn]
      break
    }
  }
  return studentId && studentName ? { studentId, studentName } : null
}

/** 真实首页使用学籍卡片，投影成与表格查询相同的只读结构。 */
export function readCduPageTables(html: string): CduTable[] {
  if (/data-cdu-loading/.test(html)) return []
  const tables = parseHtmlTables(html)
  const identity = extractCduIdentity(html)
  if (!identity) return tables
  const $ = load(html); $('script,style,input,textarea,select').remove()
  $('td,th,label,p,div,span').append(' ')
  const text = cleanCduText($.text())
  const labels = ['年级', '学院', '专业方向', '专业', '预计毕业日期', '班级']
  const values: string[][] = []
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\s)${label}\\s*[：:]\\s*(.*?)(?=\\s*(?:${labels.join('|')})\\s*[：:]|\\s+(?:GPA|加权平均成绩|不及格门数|重修门次数|个人课表|通知公告|快捷入口)(?:\\s|$)|$)`)
    const value = cleanCduText(pattern.exec(text)?.[1] ?? '')
    if (value && value.length <= 120) values.push([label, value])
  }
  if (values.some(([label]) => label === '学院') && values.some(([label]) => label === '专业')) {
    tables.push({ headers: ['字段', '内容'], rows: [['学号', identity.studentId], ['姓名', identity.studentName], ...values] })
  }
  return tables
}

/** 优先使用成绩行的真实学期，其次使用学校可见筛选标签，不采信应用传入的学期。 */
export function inferCduSemester(tables: CduTable[], html: string): string {
  const semesters = new Set<string>()
  for (const table of tables) {
    const column = table.headers.findIndex(label => /学年学期|^学期$/.test(label))
    if (column < 0) continue
    for (const row of table.rows) if (/^\d{4}-\d{4}-[1-3]$/.test(row[column] ?? '')) semesters.add(row[column]!)
  }
  if (semesters.size > 1) return '学校当前页面（跨学期）'
  if (semesters.size === 1) return [...semesters][0]!
  const selected = load(html)('[data-cdu-semester]').attr('data-cdu-semester')
  return selected && /^\d{4}-\d{4}-[1-3]$/.test(selected) ? selected : '学校当前页面'
}

export function formatCduTables(tables: CduTable[]): string {
  const escape = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return tables.map(table => [
    `| ${table.headers.map(escape).join(' | ')} |`,
    `| ${table.headers.map(() => '---').join(' | ')} |`,
    ...table.rows.map(row => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')).join('\n\n')
}
