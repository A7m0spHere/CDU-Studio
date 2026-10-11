import { describe, expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { buildCduCredentialScript, getCduCredentialStage, validateCduLoginInput } from './cdu-credential-login'

const input = { username: '20260001', password: '合成密码"\n\\不落盘' }

class Element {
  parentElement: Element | null = null
  innerText = ''
  hiddenTrap = false
  style = { display: 'block', visibility: 'visible', opacity: '1' }
  textContent = ''
  querySelector(_selector: string): Element | null { return null }
  getAttribute(_name: string): string | null { return null }
  getBoundingClientRect() { return { width: 100, height: 30, top: 10, bottom: 40, left: 10, right: 110 } }
  closest(selector: string): Element | null {
    if (selector.startsWith('.hidden-box')) return this.hiddenTrap ? this : null
    if (selector === 'label') return this.parentElement?.innerText.includes('同意') ? this.parentElement : null
    return null
  }
}
class Input extends Element {
  type = 'text'; name = ''; id = ''; placeholder = ''; disabled = false; readOnly = false; checked = false
  events: string[] = []
  private current = ''
  get value() { return this.current }
  set value(value: string) { this.current = value }
  dispatchEvent(event: Event) { this.events.push(event.type); return true }
  focus() {}
  blur() { this.events.push('blur') }
}
function page(url = 'https://id.cdu.edu.cn/login') {
  const username = new Input(); username.name = 'username'
  const password = new Input(); password.type = 'password'
  const inputs = [username, password]
  const button = Object.assign(new Element(), { disabled: false, classList: { contains: () => false }, clicks: 0, click() { this.clicks++ } }); button.innerText = '登 录'
  const body = { innerText: '' }
  const document = { body, querySelectorAll: (selector: string) => selector === 'input' ? inputs : selector === 'input[type=checkbox]' ? inputs.filter(el => el.type === 'checkbox') : [button] }
  return { username, password, inputs, button, body, async run(allowSubmit = true, actualUrl = url) {
    const location = new URL(actualUrl)
    return await runInNewContext(buildCduCredentialScript(input, new URL(url).origin, getCduCredentialStage(url, true)!, allowSubmit), {
      location, document, HTMLInputElement: Input, Event, KeyboardEvent: Event, innerHeight: 800, innerWidth: 1200,
      getComputedStyle: (el: Element) => el.style, setTimeout: (fn: () => void) => fn(),
    }) as { state: string }
  } }
}

describe('学校认证地址与输入边界', () => {
  test('Given 学校官方认证入口 When 匹配认证阶段 Then 仅接受精确主机与登录路径', () => {
    expect(getCduCredentialStage('https://id.cdu.edu.cn/login')).toBe('identity')
    expect(getCduCredentialStage('https://vpn.cdu.edu.cn/portal/#!/login')).toBe('vpn')
    for (const url of ['https://id.cdu.edu.cn.attacker.example/login', 'https://id.cdu.edu.cn:8443/login', 'https://user:secret@id.cdu.edu.cn/login', 'https://szjw.cdu.edu.cn/login', 'https://id.cdu.edu.cn/reset', 'https://vpn.cdu.edu.cn/portal/#!/service']) expect(getCduCredentialStage(url)).toBeUndefined()
  })
  test('Given 旧版 VPN 明文转发 When 未授权 Then 不提交密码，授权后也仅匹配身份认证资源', () => {
    const url = 'http://id-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/login'
    expect(getCduCredentialStage(url)).toBeUndefined()
    expect(getCduCredentialStage(url, true)).toBe('identity')
    expect(getCduCredentialStage('http://other-cdu-edu-cn.vpn.cdu.edu.cn:8118/login', true)).toBeUndefined()
  })
  test('Given 非法参数 When 校验 Then 在传递给学校前拒绝', () => {
    expect(() => validateCduLoginInput({ username: '../bad', password: 'test' })).toThrow('学号')
    expect(() => validateCduLoginInput({ username: input.username, password: '' })).toThrow('密码')
    expect(() => validateCduLoginInput({ username: input.username, password: 'x'.repeat(257) })).toThrow('256')
  })
})

describe('学校原生表单提交', () => {
  test('Given Ant Design 样式登录表单 When 填写 Then 原生 setter 和事件正确保留密码并提交一次', async () => {
    const p = page(); expect((await p.run()).state).toBe('submitted')
    expect(p.username.value).toBe(input.username); expect(p.password.value).toBe(input.password)
    expect(p.password.events).toEqual(['input', 'keyup', 'change', 'blur']); expect(p.button.clicks).toBe(1)
  })
  test('Given Sangfor 透明防填充控件 When 登录 Then 不写入隐藏假密码框', async () => {
    const p = page('https://vpn.cdu.edu.cn/portal/#!/login')
    const trap = new Input(); trap.type = 'password'; trap.hiddenTrap = true
    p.inputs.unshift(trap); p.username.name = ''
    expect((await p.run()).state).toBe('submitted')
    expect(trap.value).toBe(''); expect(p.password.value).toBe(input.password)
  })
  test('Given 需要确认的自定义免责声明复选框 When 自动连接 Then 只填账号密码并等待本人确认', async () => {
    const p = page('https://vpn.cdu.edu.cn/portal/#!/login')
    const checkbox = new Input(); checkbox.type = 'checkbox'; checkbox.parentElement = new Element(); checkbox.parentElement.innerText = '我已阅读并同意免责声明'
    checkbox.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 })
    p.inputs.push(checkbox)
    expect((await p.run()).state).toBe('consent_required')
    expect(checkbox.checked).toBe(false); expect(p.button.clicks).toBe(0)
    expect(p.password.value).toBe(input.password)
    const mark = new Element(); mark.textContent = '\uE65C'
    checkbox.parentElement.querySelector = () => mark
    expect((await p.run()).state).toBe('submitted')
    expect(checkbox.checked).toBe(false); expect(p.button.clicks).toBe(1)
  })
  test('Given 验证码控件 When 自动连接 Then 不代填或自动提交验证码', async () => {
    const p = page(); const code = new Input(); code.name = 'captcha'; p.inputs.push(code)
    expect((await p.run()).state).toBe('verification_required')
    expect(code.value).toBe(''); expect(p.button.clicks).toBe(0)
    expect(p.password.value).toBe(input.password)
  })
  test('Given 二次验证页面 When 检测 Then 交给本人且不进行密码提交', async () => {
    const p = page(); p.inputs.length = 0; p.body.innerText = '企业微信\n扫码验证'
    expect((await p.run()).state).toBe('verification_required'); expect(p.button.clicks).toBe(0)
  })
  test('Given 动态口令使用密码输入框 When 检测 Then 不把学校密码填入一次性口令', async () => {
    const p = page('https://vpn.cdu.edu.cn/portal/#!/login')
    p.password.placeholder = '动态口令'
    expect((await p.run()).state).toBe('verification_required')
    expect(p.password.value).toBe(''); expect(p.button.clicks).toBe(0)
  })
  test('Given 页面在执行前改变来源 When 执行 Then 不写入凭据', async () => {
    const p = page(); expect((await p.run(true, 'https://example.org/login')).state).toBe('not_ready')
    expect(p.password.value).toBe(''); expect(p.button.clicks).toBe(0)
  })
  test('Given 已提交过该认证阶段 When 继续观察 Then 不重复填入密码或提交', async () => {
    const p = page(); expect((await p.run(false)).state).toBe('not_ready')
    expect(p.password.value).toBe(''); expect(p.button.clicks).toBe(0)
    p.body.innerText = '账号或密码错误'; expect((await p.run(false)).state).toBe('rejected')
  })
})
