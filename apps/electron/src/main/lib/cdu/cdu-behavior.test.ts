import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyCduPage, extractCduIdentity, inferCduSemester, parseCduCsv, parseCduMarkdown, parseHtmlTables, readCduPageTables, selectCduTables } from './cdu-page-parser'
import { CduStore } from './cdu-store'
import { resolveCampusSchool } from './campus-routing'

const roots: string[] = []
const makeStore = (): CduStore => {
  const root = mkdtempSync(join(tmpdir(), 'cdu-behavior-')); roots.push(root)
  return new CduStore(() => root)
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const input = { domain: 'grades' as const, accountId: '20260001', semester: '2026-2027-1', format: 'csv' as const, content: '课程,成绩,学分\n高等数学,90,4' }

describe('学校页面状态', () => {
  test('VPN 资源页的隐藏密码框不冒充登录页，门户路由仍不能证明业务成功', () => {
    expect(classifyCduPage('https://vpn.cdu.edu.cn/portal/#!/service', '<p data-cdu-login-required>隐藏控件</p><input type="password">')).toBe('business')
    expect(classifyCduPage('https://vpn.cdu.edu.cn/portal/#!/login', '<p>学校登录</p>')).toBe('login_required')
  })
  test('即使 HTTP 200 页面也将内嵌 403 和维护说明识别为拒绝', () => {
    expect(classifyCduPage('https://szjw.cdu.edu.cn/', '<h1>页面正在修复中</h1>403 Forbidden nginx')).toBe('site_blocked')
  })
  test('扫码、密码页与业务页面分别处理，SSO 跳转不是成功依据', () => {
    expect(classifyCduPage('https://id.cdu.edu.cn/login', '<p>统一认证</p>')).toBe('login_required')
    expect(classifyCduPage('https://szjw.cdu.edu.cn/', '短信验证码')).toBe('verification_required')
    expect(classifyCduPage('https://szjw.cdu.edu.cn/', '<p data-cdu-login-required>登录</p>')).toBe('login_required')
    expect(extractCduIdentity('<p>统一认证成功</p>')).toBeNull()
  })
  test('身份按真实标签提取，不读取输入框密码或脚本中的学号', () => {
    expect(extractCduIdentity('<script>学号 999999 姓名 李四</script><table><tr><td>学号</td><td>20260001</td><td>姓名</td><td>张三</td><td>学院</td><td>计算机学院</td></tr></table>')).toEqual({ studentId: '20260001', studentName: '张三' })
    expect(extractCduIdentity('<table><tr><th>学号</th><th>姓名</th><th>学院</th></tr><tr><td>20260001</td><td>张三</td><td>计算机学院</td></tr></table>')).toEqual({ studentId: '20260001', studentName: '张三' })
    expect(extractCduIdentity('<input value="学号 20260001 姓名 张三">')).toBeNull()
    expect(extractCduIdentity('<table><tr><th>学号</th><th>姓名</th><th>学院</th></tr><tr><td>20260001</td><td>张三</td><td>计算机学院</td></tr><tr><td>20260002</td><td>李四</td><td>计算机学院</td></tr></table>')).toBeNull()
  })
})

describe('表格解析与范围', () => {
  test('真实智慧教务顶栏和学籍卡片可读取身份，不要求虚构的姓名标签', () => {
    const html = '<a>张三 / 20260001 学生</a><div>张三 20260001 | 男 | 汉族</div><div>年级：2025 学院：测试学院 专业方向：- 专业：测试专业 预计毕业日期：2029-06-30 班级：测试25-3</div><div>GPA 3.00</div>'
    expect(extractCduIdentity(html)).toEqual({ studentId: '20260001', studentName: '张三' })
    const table = selectCduTables('profile', readCduPageTables(html))[0]!
    expect(table.rows).toContainEqual(['学院', '测试学院'])
    expect(table.rows).toContainEqual(['专业', '测试专业'])
    expect(table.rows).toContainEqual(['班级', '测试25-3'])
  })
  test('EasyUI 分离表头与冻结列按字段对齐，不把第一条成绩误当表头', () => {
    const html = `<table><tr><td><div class="datagrid-view">
      <div class="datagrid-view1"><div class="datagrid-header"><table><tr><td field="course">课程/环节</td></tr></table></div><div class="datagrid-body"><table><tr class="datagrid-row" datagrid-row-index="0"><td field="course">测试课程</td></tr></table></div></div>
      <div class="datagrid-view2"><div class="datagrid-header"><table><tr><td field="score">综合成绩</td><td field="credit">获得学分</td></tr></table></div><div class="datagrid-body"><table><tr class="datagrid-row" datagrid-row-index="0"><td field="credit">3</td><td field="score">90</td></tr></table></div></div>
      </div></td></tr></table>`
    const tables = selectCduTables('grades', parseHtmlTables(html))
    expect(tables).toEqual([{ headers: ['课程/环节', '综合成绩', '获得学分'], rows: [['测试课程', '90', '3']] }])
  })
  test('考试网格无记录可以返回空表；正在加载不能冒充无考试安排', () => {
    const html = '<div class="datagrid-view"><div class="datagrid-header"><table><tr><td field="course">考试课程</td><td field="time">考试时间</td></tr></table></div><div class="datagrid-body"><table></table><div>没有记录！</div></div></div>'
    expect(selectCduTables('exams', readCduPageTables(html))[0]?.rows).toEqual([])
    expect(readCduPageTables('<p data-cdu-loading>加载中</p>' + html)).toEqual([])
  })
  test('跳过合并标题行，保留课表周次、节次、教室与换行', () => {
    const tables = parseHtmlTables('<table><tr><th colspan="3">个人课表</th></tr><tr><th>课程</th><th>周次/节次</th><th>教室</th></tr><tr><td rowspan="2">数学</td><td>1-8周(单)<br>1-2节</td><td>A101</td></tr><tr><td>10-16周(双)</td><td>A102</td></tr></table>')
    expect(selectCduTables('schedule', tables)[0]?.rows).toEqual([['数学', '1-8周(单) / 1-2节', 'A101'], ['数学', '10-16周(双)', 'A102']])
    expect(selectCduTables('grades', tables)).toEqual([])
  })
  test('考试表不与成绩表互认，未加载分页不会生成虚构记录', () => {
    const tables = parseHtmlTables('<table><tr><th>课程</th><th>考试时间</th><th>考场</th></tr><tr><td>数学</td><td>2026-12-01 08:00</td><td>A101</td></tr></table><p>第1页 共10页</p>')
    expect(selectCduTables('exams', tables)[0]?.rows.length).toBe(1)
    expect(selectCduTables('grades', tables)).toEqual([])
  })
  test('CSV 引号和 XLSX Markdown 工作表分别解析', () => {
    expect(parseCduCsv('课程,成绩\n"数学,基础",90\n"含""引号""",80')[0]?.rows).toEqual([['数学,基础', '90'], ['含"引号"', '80']])
    expect(() => parseCduCsv('课程,成绩\n"数学,90')).toThrow('引号未闭合')
    expect(parseCduMarkdown('# A\n|课程|成绩|\n|---|---|\n|数学|90|\n\n# B\n|课程|成绩|\n|---|---|\n|英语|80|')).toHaveLength(2)
  })
  test('解析过程中拒绝超限行列，不等待异常表格完整展开', () => {
    expect(() => parseCduCsv(Array(101).fill('列').join(','))).toThrow('100 列')
    expect(() => parseCduCsv('课程,成绩\n' + '数学,90\n'.repeat(5001))).toThrow('5000 行')
    expect(() => parseCduMarkdown('|' + Array(101).fill('列').join('|') + '|')).toThrow('100 列')
    expect(() => parseCduMarkdown('|课程|成绩|\n' + '|数学|90|\n'.repeat(5001))).toThrow('5000 行')
    expect(() => parseCduMarkdown('|课程|成绩|\n|数学|90|\n\n'.repeat(51))).toThrow('50 张')
  })
})

describe('导入确认与账户隔离', () => {
  test('真实学期来自学校筛选或成绩行，跨学期部分记录分别缓存', () => {
    const store = makeStore()
    const tables = [{ headers: ['学年学期', '课程', '综合成绩'], rows: [['2025-2026-1', '测试课程甲', '90'], ['2025-2026-2', '测试课程乙', '80']] }]
    expect(inferCduSemester(tables, '')).toBe('学校当前页面（跨学期）')
    expect(inferCduSemester([], '<p data-cdu-semester="2026-2027-1"></p>')).toBe('2026-2027-1')
    store.save({ domain: 'grades', accountId: input.accountId, semester: inferCduSemester(tables, ''), tables, source: 'page', fetchedAt: Date.now(), cached: false, completeness: 'visible' })
    expect(store.load(input.accountId, '2025-2026-1', 'grades')?.tables[0]?.rows).toEqual([tables[0]!.rows[0]!])
    expect(store.load(input.accountId, '2025-2026-2', 'grades')?.completeness).toBe('visible')
  })

  test('预览不落盘，确认后可离线读取且标注来源与时间', () => {
    const store = makeStore(); const preview = store.preview(input, 1)
    expect(store.load(input.accountId, input.semester, input.domain)).toBeNull()
    const data = store.commit(preview.token, 1)
    expect(data.source).toBe('file'); expect(data.completeness).toBe('imported'); expect(data.fetchedAt).toBeGreaterThan(0)
    expect(store.load(input.accountId, input.semester, input.domain)?.cached).toBe(true)
    expect(store.load('20260002', input.semester, input.domain)).toBeNull()
    expect(store.load(input.accountId, '2025-2026-1', input.domain)).toBeNull()
  })
  test('确认限于原窗口和当前账户，一次令牌不能重复保存', () => {
    const store = makeStore(); const preview = store.preview(input, 1)
    expect(() => store.commit(preview.token, 2)).toThrow('已失效')
    expect(() => store.commit(preview.token, 1, '20260002')).toThrow('账户已变化')
    store.commit(preview.token, 1, input.accountId)
    expect(() => store.commit(preview.token, 1)).toThrow('已失效')
  })
  test('取消后重新预览使旧令牌失效；清缓存会撤销对应预览', () => {
    const store = makeStore(); const first = store.preview(input, 1); const next = store.preview(input, 1)
    expect(() => store.commit(first.token, 1)).toThrow('已失效')
    store.clearCache(input.accountId)
    expect(() => store.commit(next.token, 1)).toThrow('已失效')
  })
  test('重启后必须重新验证；落盘白名单不包含凭据', () => {
    const store = makeStore()
    store.saveAccount({ studentId: input.accountId, studentName: '张三', status: 'active', legacyVpnHttpAllowed: true, password: '不可保存', cookie: '不可保存' } as never)
    expect(store.loadAccount().status).toBe('disconnected')
    const json = readFileSync(join(roots.at(-1)!, 'cdu-account.json'), 'utf8')
    expect(json).not.toContain('password'); expect(json).not.toContain('cookie')
    expect(json).not.toContain('legacyVpnHttpAllowed')
    store.clearAccount(); expect(store.loadAccount().studentId).toBe('')
  })
  test('路径穿越、错误类别和不一致列数被拒绝', () => {
    const store = makeStore()
    expect(() => store.preview({ ...input, accountId: '../cdut' }, 1)).toThrow('学号')
    expect(() => store.preview({ ...input, domain: 'other' as never }, 1)).toThrow('类别')
    expect(() => store.preview({ ...input, content: '课程,成绩\n数学,90,4' }, 1)).toThrow('列数')
  })
})

describe('两校 Agent 路由', () => {
  test('显式校名优先于会话绑定，CDUT 不会匹配 CDU', () => {
    expect(resolveCampusSchool('成都大学成绩', 'cdut')).toBe('cdu')
    expect(resolveCampusSchool('CDUT 课表', 'cdu')).toBe('cdut')
    expect(resolveCampusSchool('CDU 课表')).toBe('cdu')
  })
  test('普通教务提问保持绑定；没有学校或同时提及两校时需选择', () => {
    expect(resolveCampusSchool('查课表')).toBeUndefined()
    expect(resolveCampusSchool('查课表', 'cdu')).toBe('cdu')
    expect(resolveCampusSchool('比较 CDU 与 CDUT 的课表', 'cdu')).toBeUndefined()
    expect(resolveCampusSchool('查成绩', undefined, ['cdut-tools'])).toBe('cdut')
  })
})
