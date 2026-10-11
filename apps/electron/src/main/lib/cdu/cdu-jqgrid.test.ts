import { describe, expect, test } from 'bun:test'
import { parseHtmlTables, selectCduTables } from './cdu-page-parser'

describe('超星 jqGrid 成绩与考务读取', () => {
  test('Given 首页隐藏弹窗含成绩表头 When 查询当前可见成绩 Then 不把隐藏模板当空成绩', () => {
    const html = '<div style="display: none"><table><tr><th>课程名称</th><th>最高成绩</th><th>绩点</th></tr></table></div>'
    expect(selectCduTables('grades', parseHtmlTables(html))).toEqual([])
  })
  test('Given 分离表头且包含隐藏主键 When 读取成绩 Then 合并真实行并忽略隐藏列及占位首行', () => {
    const html = `<div class="ui-jqgrid-view"><div class="ui-jqgrid-hdiv"><table class="ui-jqgrid-htable"><tr>
      <th id="grades_id" style="display: none">主键</th><th id="grades_xnxq">学年学期</th><th id="grades_course">课程/环节</th><th id="grades_score">综合成绩</th>
      </tr></table></div><div class="ui-jqgrid-bdiv"><table class="ui-jqgrid-btable"><tr class="jqgfirstrow"><td></td></tr>
      <tr class="jqgrow"><td aria-describedby="grades_id">private-key</td><td aria-describedby="grades_score">89</td><td aria-describedby="grades_course">合成课程</td><td aria-describedby="grades_xnxq">2026-2027-1</td></tr>
      </table></div></div>`
    const tables = selectCduTables('grades', parseHtmlTables(html))
    expect(tables).toEqual([{ headers: ['学年学期', '课程/环节', '综合成绩'], rows: [['2026-2027-1', '合成课程', '89']] }])
    expect(JSON.stringify(tables)).not.toContain('private-key')
  })
  test('Given 考务确实无记录 When 读取网格 Then 保留完整表头及空数组', () => {
    const html = `<div class="ui-jqgrid-view"><table class="ui-jqgrid-htable"><tr><th id="exam_course">课程</th><th id="exam_time">考试时间</th><th id="exam_place">考试地点</th></tr></table><table class="ui-jqgrid-btable"><tr class="jqgfirstrow"><td></td></tr></table></div>`
    expect(selectCduTables('exams', parseHtmlTables(html))).toEqual([{ headers: ['课程', '考试时间', '考试地点'], rows: [] }])
  })
})
