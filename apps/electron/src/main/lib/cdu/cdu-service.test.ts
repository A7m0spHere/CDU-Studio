import { afterEach, describe, expect, test } from 'bun:test'
import type { BrowserWindow, Session } from 'electron'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CduService } from './cdu-service'
import { CduNetwork } from './cdu-network'
import { CduStore } from './cdu-store'

const roots: string[] = []
const cleanup: Array<() => void> = []
afterEach(() => { cleanup.splice(0).forEach(close => close()); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
const identity = '<table><tr><th>学号</th><th>姓名</th><th>学院</th></tr><tr><td>20260001</td><td>张三</td><td>计算机学院</td></tr></table>'
const grades = '<table><tr><th>课程</th><th>成绩</th></tr><tr><td>数学</td><td>90</td></tr></table><p>第 1 页，共 3 页</p>'
function harness() {
  const root = mkdtempSync(join(tmpdir(), 'cdu-service-')); roots.push(root)
  const calls: string[] = []
  const ses = { setProxy: async () => { calls.push('direct') }, closeAllConnections: async () => { calls.push('closeConnections') }, clearStorageData: async () => { calls.push('clearStorage') }, clearCache: async () => { calls.push('clearCache') } } as unknown as Session
  const fakeWindow = () => {
    let html = ''; let url = 'about:blank'; let destroyed = false; let clickLabel = ''; let focused = 0; let onClick = () => {}
    let popupHandler: (details: { url: string }) => any = () => ({ action: 'deny' })
    const events = new Map<string, (...args: any[]) => unknown>()
    const extraFrames: unknown[] = []
    const frame = { get url() { return url }, executeJavaScript: async (script: string) => {
      if (script.includes('target.click()')) {
        if (clickLabel && script.includes(clickLabel)) { calls.push(`click:${clickLabel}`); onClick(); return true }
        return false
      }
      return html
    }, get framesInSubtree(): unknown[] { return [frame, ...extraFrames] } }
    const win = { webContents: { mainFrame: frame, setWindowOpenHandler: (cb: typeof popupHandler) => { popupHandler = cb }, on: (name: string, cb: (...args: any[]) => unknown) => events.set(name, cb) }, show: () => {}, focus: () => { focused++ }, isDestroyed: () => destroyed, loadURL: async (value: string) => { url = value; calls.push('navigate') }, on: (name: string, cb: () => void) => events.set(name, cb), destroy: () => { destroyed = true; events.get('closed')?.() } } as unknown as BrowserWindow
    cleanup.push(() => { if (!destroyed) win.destroy() })
    return { win, events, focusCount: () => focused, addFrame: (content: string, address: string) => extraFrames.push({ url: address, executeJavaScript: async () => content }), popup: (address: string) => popupHandler({ url: address }), setClick: (label: string, action = () => {}) => { clickLabel = label; onClick = action }, setPage: (value: string, address = 'https://szjw.cdu.edu.cn/student') => { html = value; url = address } }
  }
  const native = fakeWindow()
  const service = new CduService(new CduNetwork(() => ses), new CduStore(() => root), () => native.win)
  return { service, root, calls, ses, native, setPage: native.setPage, close: () => native.win.destroy(), openChild: (url: string) => {
    const response = native.popup(url)
    const child = fakeWindow(); child.setPage('', url)
    if (response.action === 'allow') native.events.get('did-create-window')?.(child.win)
    return { ...child, response }
  } }
}

describe('原生登录与只读查询', () => {
  test.each([
    ['父页面切换为另一账户', identity.replaceAll('20260001', '20260002')],
    ['父页面不再展示本人身份', '<p>教务首页</p>'],
    ['父页面变为维护页', '<p>系统维护中</p>'],
  ])('Given 已验证账户与课表 iframe When %s Then 拒绝把课表缓存到原账户', async (_label, parentHtml) => {
    const h = harness(); await h.service.openLogin('direct'); h.setPage(identity)
    const schedule = '<table><tr><th>课程</th><th>周次/节次</th><th>教室</th></tr><tr><td>测试课程</td><td>1-16周 / 1-2节</td><td>A101</td></tr></table>'
    h.native.addFrame(schedule, 'https://szjw.cdu.edu.cn/admin/xsd/pkgl/xskb/queryKbForXsd')
    expect((await h.service.verifyAccount()).status).toBe('active')
    h.setPage(parentHtml)
    expect((await h.service.query({ domain: 'schedule' })).success).toBe(false)
    expect(h.service.store.load('20260001', '学校当前页面', 'schedule')).toBeNull()
  })
  test('Given 已验证账户 When 菜单导航期间新增过期认证 iframe Then 拒绝缓存仍展示的成绩', async () => {
    const h = harness(); await h.service.openLogin('direct'); h.setPage(identity)
    expect((await h.service.verifyAccount()).status).toBe('active')
    h.native.setClick('全部成绩查询', () => {
      h.setPage(identity + grades)
      h.native.addFrame('<p>统一认证</p>', 'https://id.cdu.edu.cn/login')
    })
    expect((await h.service.query({ domain: 'grades' })).success).toBe(false)
    expect(h.service.getAccount().status).toBe('expired')
    expect(h.service.store.load('20260001', '学校当前页面', 'grades')).toBeNull()
  })
  test('Given 父页面展示本人身份 When 课表 iframe 无重复身份字段 Then 正常读取当前课表', async () => {
    const h = harness(); await h.service.openLogin('direct'); h.setPage(identity)
    h.native.addFrame('<p data-cdu-semester="2026-2027-1"></p><table><tr><th>课程</th><th>周次/节次</th><th>教室</th></tr><tr><td>测试课程</td><td>1-16周 / 1-2节</td><td>A101</td></tr></table>', 'https://szjw.cdu.edu.cn/admin/xsd/pkgl/xskb/queryKbForXsd')
    await h.service.verifyAccount()
    const result = await h.service.query({ domain: 'schedule' })
    expect(result.success).toBe(true)
    expect(result.data?.accountId).toBe('20260001')
    expect(result.data?.semester).toBe('2026-2027-1')
    expect(result.data?.tables[0]?.rows).toEqual([['测试课程', '1-16周 / 1-2节', 'A101']])
  })
  test('统一认证 iframe 过期时，不把仍显示的旧成绩当作实时数据', async () => {
    const h = harness(); await h.service.openLogin('direct'); h.setPage(identity + grades)
    await h.service.verifyAccount()
    h.native.addFrame('<p>统一认证</p>', 'https://id.cdu.edu.cn/login')
    expect((await h.service.query({ domain: 'grades' })).success).toBe(false)
    expect(h.service.getAccount().status).toBe('expired')
  })
  test('首页当日空课表不能冒充完整课表，查询会进入真实课表菜单', async () => {
    const h = harness(); await h.service.openLogin('direct')
    h.setPage(identity + '<table><tr><th>节次</th><th>课程</th><th>教室</th></tr></table>', 'https://szjw.cdu.edu.cn/admin/main')
    await h.service.verifyAccount()
    h.native.setClick('我的课表', () => h.setPage(identity + '<p data-cdu-semester="2026-2027-1"></p><table><tr><th>周一</th><th>周二</th></tr><tr><td>测试课程 / 1-16周 / 1-2节</td><td></td></tr></table>', 'https://szjw.cdu.edu.cn/admin/xsd/pkgl/xskb/queryKbForXsd'))
    const result = await h.service.query({ domain: 'schedule', semester: '错误的应用学期' })
    expect(h.calls).toContain('click:我的课表')
    expect(result.data?.semester).toBe('2026-2027-1')
    expect(result.data?.tables[0]?.rows[0]?.[0]).toContain('1-16周')
  })

  test('业务顶栏身份与 iframe 表格联合验证，同一账户才保存查询结果', async () => {
    const h = harness(); await h.service.openLogin('direct')
    h.setPage('<a>张三 / 20260001 学生</a>')
    h.native.addFrame(grades, 'https://szjw.cdu.edu.cn/admin/grades')
    expect((await h.service.verifyAccount()).status).toBe('active')
    expect((await h.service.query({ domain: 'grades' })).data?.tables[0]?.rows).toEqual([['数学', '90']])
  })
  test('初始化直连后才导航；等待验证、取消登录不产生成功状态', async () => {
    const h = harness(); await h.service.openLogin('direct')
    expect(h.calls.slice(0, 3)).toEqual(['direct', 'closeConnections', 'navigate'])
    h.setPage('短信验证码', 'https://id.cdu.edu.cn/login')
    expect((await h.service.verifyAccount()).status).toBe('requires_verification')
    h.close(); expect(h.service.getAccount().status).toBe('disconnected')
  })
  test('SSO 或 HTTP 200 维护页不满足认证成功条件', async () => {
    const h = harness(); await h.service.openLogin('direct')
    h.setPage(identity, 'https://id.cdu.edu.cn/login')
    expect((await h.service.verifyAccount()).status).not.toBe('active')
    h.setPage('页面正在修复中 403 Forbidden')
    expect((await h.service.verifyAccount()).status).toBe('error')
  })
  test('业务页面和本人身份同时成立才激活；查询明确只含已加载分页', async () => {
    const h = harness(); await h.service.openLogin('direct'); h.setPage(identity + grades)
    expect((await h.service.verifyAccount()).status).toBe('active')
    const result = await h.service.query({ domain: 'grades', semester: '假定学期' })
    expect(result.success).toBe(true); expect(result.data?.completeness).toBe('visible')
    expect(result.data?.semester).toBe('学校当前页面'); expect(result.data?.tables[0]?.rows).toHaveLength(1)
    h.setPage(grades + '<p data-cdu-login-required>登录</p>')
    expect((await h.service.query({ domain: 'grades' })).success).toBe(false)
    expect(h.service.getAccount().status).toBe('expired')
  })
  test('账户变化不能把他人页面保存到原账户', async () => {
    const h = harness(); await h.service.openLogin('direct')
    h.setPage('<a>张三 / 20260001 学生</a><p>年级：2025 学院：原学院 专业：原专业 班级：原班级</p>'); await h.service.verifyAccount()
    expect(h.service.getAccount().college).toBe('原学院')
    h.setPage(identity.replaceAll('20260001', '20260002') + grades)
    expect((await h.service.query({ domain: 'grades' })).success).toBe(false)
    expect(h.service.store.load('20260001', '学校当前页面', 'grades')).toBeNull()
    expect(h.service.getAccount().college).toBeUndefined()
  })
  test('登出清理隔离分区和账户缓存，CDUT 文件不受影响', async () => {
    const h = harness(); await h.service.openLogin('direct'); h.setPage(identity + grades); await h.service.verifyAccount(); await h.service.query({ domain: 'grades' })
    const cdutPath = join(h.root, 'cdut-account.json'); writeFileSync(cdutPath, '{"school":"cdut"}')
    const other = { ...h.service.store.load('20260001', '学校当前页面', 'grades')!, accountId: '20260002' }; h.service.store.save(other)
    await h.service.logout()
    expect(readFileSync(cdutPath, 'utf8')).toBe('{"school":"cdut"}')
    expect(h.service.store.load('20260002', '学校当前页面', 'grades')).not.toBeNull()
    expect(h.service.getAccount().studentId).toBe(''); expect(h.calls).toContain('clearStorage'); expect(h.calls).toContain('clearCache')
    expect(h.service.store.load('20260001', '学校当前页面', 'grades')).toBeNull()
  })
})


describe('学校账号自动连接', () => {
  test('再次连接复用已打开的教务窗口，不重置学校页面或重复弹窗', async () => {
    const h = harness(); await h.service.openLogin('vpn')
    const child = h.openChild('https://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/admin')
    child.setPage(identity, 'https://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/admin')
    await h.service.verifyAccount()
    const count = h.calls.filter(call => call === 'navigate').length
    await h.service.openLogin('vpn'); await h.service.openLogin('direct')
    expect(h.calls.filter(call => call === 'navigate')).toHaveLength(count)
    expect(child.focusCount()).toBe(2)
  })

  test('登录前可明确选择兼容方式，但授权本身不是认证成功', async () => {
    const h = harness(); await h.service.approveLegacyVpnHttp()
    expect(h.service.getAccount().status).toBe('disconnected')
    expect(h.service.getAccount().legacyVpnHttpAllowed).toBe(true)
    await h.service.openLogin('vpn')
    expect(h.native.popup('http://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/').action).toBe('allow')
    expect(h.service.getAccount().status).not.toBe('active')
  })
  test('旧版 HTTP 转发默认阻止，确认仅当前运行有效，普通 HTTP 仍被拒绝', async () => {
    const h = harness(); await h.service.openLogin('vpn')
    const legacy = 'http://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/'
    expect(h.native.popup(legacy).action).toBe('deny')
    expect((await h.service.verifyAccount()).connectionHint).toBe('legacy_vpn_http')
    await h.service.approveLegacyVpnHttp()
    expect(h.native.popup(legacy).action).toBe('allow')
    expect(h.native.popup('http://szjw.cdu.edu.cn/').action).toBe('deny')
    await h.service.logout()
    expect(h.service.getAccount().legacyVpnHttpAllowed).toBe(false)
    expect(h.native.popup(legacy).action).toBe('deny')
    const restarted = harness(); await restarted.service.openLogin('vpn')
    expect(restarted.service.getAccount().legacyVpnHttpAllowed).toBe(false)
    expect(restarted.native.popup(legacy).action).toBe('deny')
  })
  test('VPN 登录后自动点击数智教务入口，SPA 轮询不会重复打开同一资源', async () => {
    const h = harness(); await h.service.openLogin('vpn')
    h.setPage(identity, 'https://vpn.cdu.edu.cn/portal/#!/service'); h.native.setClick('数智教务')
    await h.service.advanceLogin(); await h.service.advanceLogin()
    expect(h.calls.filter(call => call === 'click:数智教务')).toHaveLength(1)
    expect(h.service.getAccount().status).not.toBe('active')
  })
  test('允许同分区空白弹窗后续跳转，教务 VPN 子域身份可自动验证', async () => {
    const h = harness(); await h.service.openLogin('vpn')
    h.setPage('', 'https://vpn.cdu.edu.cn/portal/#!/service')
    const child = h.openChild('about:blank')
    expect(child.response.action).toBe('allow')
    expect(child.response.overrideBrowserWindowOptions.webPreferences.session).toBe(h.ses)
    expect(child.response.overrideBrowserWindowOptions.webPreferences.nodeIntegration).toBe(false)
    child.setPage(identity + grades, 'https://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/student')
    await h.service.advanceLogin()
    expect(h.service.getAccount().status).toBe('active')
    expect((await h.service.query({ domain: 'grades' })).data?.tables[0]?.rows).toEqual([['数学', '90']])
    expect(h.native.popup('https://example.org/').action).toBe('deny')
  })
  test('业务网站的统一认证入口自动跳转，验证码仍等待本人处理', async () => {
    const h = harness(); await h.service.openLogin('vpn')
    h.setPage('<button>统一认证</button>'); h.native.setClick('统一认证')
    await h.service.advanceLogin()
    expect(h.calls).toContain('click:统一认证')
    h.setPage('短信验证码', 'https://id.cdu.edu.cn/login')
    await h.service.advanceLogin()
    expect(h.service.getAccount().status).toBe('requires_verification')
  })
  test('直连维护页自动转向官方 VPN，VPN 失败不反复重启登录', async () => {
    const h = harness(); await h.service.openLogin('direct')
    h.setPage('页面正在修复中 403 Forbidden')
    await h.service.advanceLogin()
    expect(h.native.win.webContents.mainFrame.url).toBe('https://vpn.cdu.edu.cn/')
    const navigations = h.calls.filter(call => call === 'navigate').length
    h.setPage('403 Forbidden', 'https://vpn.cdu.edu.cn/')
    await h.service.advanceLogin()
    expect(h.calls.filter(call => call === 'navigate')).toHaveLength(navigations)
  })
})
