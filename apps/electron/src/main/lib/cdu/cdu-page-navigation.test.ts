import { describe, expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { buildCduMenuScript } from './cdu-page-navigation'

describe('学校只读菜单导航', () => {
  test.each([
    ['/admin//xsd/xsdcjcx/qbcjcx?filter=a%2Fb', '/admin/xsd/xsdcjcx/qbcjcx?filter=a%2Fb'],
    ['/admin/xsd/kwglXsdKscx', '/admin/xsd/kwglXsdKscx'],
  ])('Given 学校菜单 %s When 打开成绩 Then 规范路径且保留筛选参数', (href, expected) => {
    let clicked = ''
    const target = { textContent: '全部成绩查询', href: new URL(href, 'https://szjw.cdu.edu.cn').href, getClientRects: () => [1], click() { clicked = this.href } }
    const result = runInNewContext(buildCduMenuScript(['全部成绩查询']), { document: { querySelectorAll: () => [target] }, location: { origin: 'https://szjw.cdu.edu.cn' }, URL })
    expect(result).toBe(true)
    expect(clicked).toBe(`https://szjw.cdu.edu.cn${expected}`)
  })
  test('Given 外部同名菜单 When 自动导航 Then 不打开或改写外部地址', () => {
    let clicked = false
    const target = { textContent: '全部成绩查询', href: 'https://example.com/admin//grades', getClientRects: () => [1], click() { clicked = true } }
    expect(runInNewContext(buildCduMenuScript(['全部成绩查询']), { document: { querySelectorAll: () => [target] }, location: { origin: 'https://szjw.cdu.edu.cn' }, URL })).toBe(false)
    expect(clicked).toBe(false)
  })
})
