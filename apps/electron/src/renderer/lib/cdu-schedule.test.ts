import { expect, test } from 'bun:test'
import { buildCduSchedule, selectCduScheduleWeek } from './cdu-schedule'

test('Given 学校合并课表及重复星期日 When 转换应用课表 Then 保留原列顺序、合并连续节次且备注单列', () => {
  const course = '测试课程 / 测试教师 / 1-16周 / 测试楼101'
  const model = buildCduSchedule([{ headers: ['', '节次', '星期日', '星期一', '星期日'], rows: [['上午', '1', '', course, ''], ['上午', '2', '', course, ''], ['备注', '网络课：测试通识课程', '', '', '']] }])
  expect(model.grids[0]?.days).toEqual(['星期日', '星期一', '星期日'])
  expect(model.grids[0]?.blocks).toEqual([{ day: 1, start: 0, span: 2, text: course }])
  expect(model.notes).toEqual(['网络课：测试通识课程'])
})
test('Given 同时段跨周课程 When 切换第5周和第10周 Then 只显示匹配安排并单列未知周次', () => {
  const model = buildCduSchedule([{ headers: ['节次', '星期一', '星期二'], rows: [['1', '课程甲 / 教师甲 1-4周 / A101 / 考查 / / 课程乙 / 教师乙 9-16周 / B102 / 考试', '待确认课程 / A103']] }])
  expect(selectCduScheduleWeek(model, 5).grids[0]?.blocks).toEqual([])
  const tenth = selectCduScheduleWeek(model, 10)
  expect(tenth.grids[0]?.blocks[0]?.title).toBe('课程乙')
  expect(tenth.grids[0]?.blocks[0]?.text).not.toContain('课程甲')
  expect(tenth.unconfirmed[0]?.entry.title).toBe('待确认课程')
})
test('Given CSV 课程清单没有星期 When 导入 Then 显示课程卡片而不编造星期与上课时间', () => {
  const model = buildCduSchedule([{ headers: ['课程', '周次/节次', '教室'], rows: [['合成数学', '1-8周 / 1-2节', '测试楼102']] }])
  expect(model.grids).toEqual([])
  expect(model.courses[0]).toEqual({ title: '合成数学', details: [{ label: '周次/节次', value: '1-8周 / 1-2节' }, { label: '教室', value: '测试楼102' }] })
})
