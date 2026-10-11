import { expect, test } from 'bun:test'
import { cduCourseHue, describeCduCourse } from './cdu-course-presentation'

test('Given 学校原始课程字段 When 显示卡片 Then 教师、地点和周次分开且保留原文', () => {
  const text = '合成课程 / 教师甲 1-4,7-8周 / A101 / 考查'
  expect(describeCduCourse({ title: '合成课程', text, weeks: [1, 2, 3, 4, 7, 8] })).toEqual({ teacher: '教师甲', location: 'A101', weeks: '1-4,7-8周' })
})
test('Given 分列周次或缺少地点 When 显示 Then 不把节次或教师误当地点', () => {
  expect(describeCduCourse({ title: '合成课程', text: '合成课程 / 教师乙 / 1-16周 / 1-2节 / 测试楼102 / 考试', weeks: [1] })).toEqual({ teacher: '教师乙', location: '测试楼102', weeks: '1-16周' })
  expect(describeCduCourse({ title: '合成课程', text: '合成课程 / 1-16周 / 考查', weeks: [1] }).location).toBeUndefined()
})
test('Given 同一课程在不同周出现 When 生成颜色 Then 保持稳定且兼容全半角课名', () => {
  expect(cduCourseHue('测试课程（2）')).toBe(cduCourseHue('测试课程(2)'))
  expect(cduCourseHue(' 测试课程(2) ')).toBe(cduCourseHue('测试课程(2)'))
})
