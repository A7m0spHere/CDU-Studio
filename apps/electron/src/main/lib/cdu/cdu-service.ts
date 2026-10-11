import { BrowserWindow, type BrowserWindowConstructorOptions, type WebFrameMain, type Session } from 'electron'
import type { CduAccountProfile, CduDataset, CduDomain, CduLoginInput, CduQueryInput, CduQueryResult } from '@profer/shared'
import { CduNetwork, CDU_HOME_URL, CDU_VPN_URL, isCduUrl, isCduBusinessUrl, isLegacyCduVpnUrl } from './cdu-network'
import { CduStore, validateCduDomain, validateCduSemester } from './cdu-store'
import { classifyCduPage, extractCduIdentity, inferCduSemester, readCduPageTables, selectCduTables } from './cdu-page-parser'
import { buildCduCredentialScript, getCduCredentialStage, validateCduLoginInput, type CduCredentialResult } from './cdu-credential-login'
import { buildCduMenuScript } from './cdu-page-navigation'

const MENU_LABELS: Record<CduDomain, string[]> = {
  profile: ['个人信息', '学籍信息', '学生基本信息', '个人资料', '首页'],
  schedule: ['我的课表', '个人课表', '学生课表查询', '课表查询'],
  grades: ['全部成绩查询', '成绩查询', '学生成绩查询', '我的成绩'],
  exams: ['考试查询', '考试安排', '学生考试查询', '考试安排查询', '我的考试'],
}
interface PageSnapshot { url: string; html: string }

/** 仅读取白名单校园页面；没有确认的业务接口不进行猜测请求。 */
export class CduService {
  constructor(
    readonly network = new CduNetwork(),
    readonly store = new CduStore(),
    private readonly createWindow = (options: BrowserWindowConstructorOptions): BrowserWindow => new BrowserWindow(options),
  ) {}
  private profile: CduAccountProfile | undefined
  private window: BrowserWindow | undefined
  private windows = new Set<BrowserWindow>()
  private loginTimer: ReturnType<typeof setInterval> | undefined
  private advancing = false
  private loginActions = new Set<string>()
  private loginMode: 'direct' | 'vpn' = 'direct'
  private businessVerified = false
  private legacyVpnHttpApproved = false
  private generation = 0
  private verifying = false
  private queryPending = false
  private credentials: CduLoginInput | undefined
  private requestedStudentId: string | undefined
  private credentialSubmissions = new Set<string>()
  private credentialTimer: ReturnType<typeof setTimeout> | undefined
  private awaitingUserVerification = false
  private credentialFailure = false
  private loginStarting = false
  private statusCallback: (profile: CduAccountProfile) => void = () => {}
  getAccount(): CduAccountProfile { return { ...(this.profile ??= this.store.loadAccount()), legacyVpnHttpAllowed: this.legacyVpnHttpApproved } }
  onStatus(callback: (profile: CduAccountProfile) => void): void { this.statusCallback = callback }
  private update(update: Partial<CduAccountProfile>): CduAccountProfile {
    const previous = this.getAccount()
    this.profile = { ...previous, ...update }
    if (JSON.stringify(previous) === JSON.stringify(this.profile)) return this.getAccount()
    this.statusCallback(this.getAccount())
    return this.getAccount()
  }
  /** 凭据只存在本次连接的主进程内存中，各认证阶段复用同一份输入。 */
  async login(input: CduLoginInput): Promise<void> {
    validateCduLoginInput(input)
    if (this.loginStarting || this.credentials) throw new Error('正在连接学校，请等待完成或先取消连接')
    this.loginStarting = true
    this.clearCredentials()
    for (const win of [...this.windows]) if (!win.isDestroyed()) win.destroy()
    const generation = ++this.generation
    try {
      const ses = await this.network.prepare()
      if (generation !== this.generation) return
      await ses.clearStorageData()
      if (generation !== this.generation) return
      await ses.closeAllConnections()
      if (generation !== this.generation) return
      this.store.clearAccount()
      this.requestedStudentId = input.username.trim()
      this.credentials = { username: this.requestedStudentId, password: input.password }
      this.credentialFailure = false
      this.update({ studentId: '', studentName: '', college: undefined, major: undefined, lastVerifiedAt: undefined, status: 'connecting', message: '正在连接学校教务；需要扫码、短信或验证码时会打开学校页面' })
      this.armCredentialExpiry(120_000)
      await this.navigateLogin('direct', false)
      await this.advanceLogin()
    } catch {
      if (generation !== this.generation && !this.requestedStudentId) return
      this.clearCredentials()
      this.update({ status: 'error', message: '无法初始化学校认证，请检查网络后重新连接' })
      throw new Error('无法初始化学校认证，请检查网络后重新连接')
    } finally { this.loginStarting = false }
  }
  private clearCredentials(): void {
    this.credentials = undefined
    this.requestedStudentId = undefined
    this.credentialSubmissions.clear()
    this.credentialFailure = false
    this.awaitingUserVerification = false
    if (this.credentialTimer) clearTimeout(this.credentialTimer)
    this.credentialTimer = undefined
  }
  private armCredentialExpiry(delay: number): void {
    if (this.credentialTimer) clearTimeout(this.credentialTimer)
    this.credentialTimer = setTimeout(() => {
      this.credentials = undefined
      this.credentialTimer = undefined
      if (this.getAccount().status === 'requires_verification') {
        this.update({ message: '本次密码已从内存释放，可继续在学校页面完成验证；后续若需密码请重新连接' })
      } else {
        this.credentialFailure = true
        this.update({ status: 'error', message: '自动连接超时，请检查学校页面后重新连接' })
      }
      this.revealSchoolWindow()
    }, delay)
    this.credentialTimer.unref()
  }
  private allowTimeForUserVerification(): void {
    if (!this.credentials || this.awaitingUserVerification) return
    this.awaitingUserVerification = true
    // 人工扫码或阅读学校条款需要更多时间；只延长一次，不能被轮询无限续期。
    this.armCredentialExpiry(10 * 60_000)
  }
  private revealSchoolWindow(): void {
    const win = [...this.windows].reverse().find(item => !item.isDestroyed())
    win?.show(); win?.focus()
  }
  async openLogin(mode: 'direct' | 'vpn'): Promise<void> {
    if (this.loginStarting) throw new Error('正在初始化学校认证，请稍候')
    // 二次验证或兼容方式继续当前流程，避免再次索要账号密码。
    if (this.requestedStudentId && this.windows.size) { this.revealSchoolWindow(); return }
    this.clearCredentials()
    return this.navigateLogin(mode, true)
  }
  private async navigateLogin(mode: 'direct' | 'vpn', interactive: boolean): Promise<void> {
    if (mode !== 'direct' && mode !== 'vpn') throw new Error('未知登录方式')
    const requestGeneration = this.generation
    const ses = await this.network.prepare()
    if (requestGeneration !== this.generation) return
    const connected = [...this.windows].reverse().find(win => !win.isDestroyed() && isCduBusinessUrl(win.webContents.mainFrame.url))
    const existing = connected ?? (mode === this.loginMode ? this.window : undefined)
    if (existing && !existing.isDestroyed() && ['active', 'connecting', 'requires_verification'].includes(this.getAccount().status)) {
      if (interactive) { existing.show(); existing.focus() }
      return
    }
    this.loginMode = mode
    this.businessVerified = false
    this.generation++
    const navigationGeneration = this.generation
    if (!this.window || this.window.isDestroyed()) {
      const win = this.createWindow({ show: interactive, width: 1120, height: 800, title: 'CDU 学校登录与教务', autoHideMenuBar: true, webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, safeDialogs: true } })
      this.window = win
      this.trackWindow(win, ses)
    }
    this.loginActions.clear()
    this.credentialSubmissions.clear()
    this.update({ status: 'connecting', connectionHint: undefined, message: mode === 'vpn' ? '请完成学校 VPN 登录，软件将自动进入数智教务并继续统一认证' : '请完成学校账号登录，软件将自动检测认证结果；必要时完成扫码或短信验证' })
    if (interactive) { this.window.show(); this.window.focus() }
    try { await this.window.loadURL(mode === 'vpn' ? CDU_VPN_URL : CDU_HOME_URL) }
    catch { if (navigationGeneration === this.generation) this.update({ status: 'error', message: '校园页面不可达，请检查网络或尝试官方 VPN' }) }
  }
  private isAllowedUrl(url: string): boolean {
    return isCduUrl(url) || (this.legacyVpnHttpApproved && isLegacyCduVpnUrl(url))
  }
  /** 只在用户确认当前运行的风险说明后调用，不持久化此授权。 */
  async approveLegacyVpnHttp(): Promise<void> {
    this.legacyVpnHttpApproved = true
    this.loginActions.clear()
    this.update({ status: this.windows.size ? 'connecting' : this.getAccount().status, connectionHint: undefined, message: '已仅为本次运行允许学校旧版 VPN 转发；仍需完成学校认证' })
    await this.advanceLogin()
  }
  private trackWindow(win: BrowserWindow, ses: Session): void {
    if (this.windows.has(win)) return
    this.windows.add(win)
    // 保留真实弹窗握手，兼容先开 about:blank 再写入 VPN 转发地址的学校脚本。
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isLegacyCduVpnUrl(url) && !this.legacyVpnHttpApproved) {
        this.allowTimeForUserVerification()
        this.update({ status: 'error', connectionHint: 'legacy_vpn_http', message: '学校 VPN 资源使用旧版 HTTP 转发，需要先选择兼容方式；也可使用校园网或官方 SSL VPN 客户端' })
        this.revealSchoolWindow()
        return { action: 'deny' }
      }
      if (url !== 'about:blank' && !this.isAllowedUrl(url)) {
        this.update({ status: 'error', message: '学校弹窗地址未通过校园 HTTPS 校验，已停止跳转' })
        return { action: 'deny' }
      }
      return { action: 'allow', outlivesOpener: true, overrideBrowserWindowOptions: { show: !this.requestedStudentId, width: 1120, height: 800, autoHideMenuBar: true, webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, safeDialogs: true } } }
    })
    win.webContents.on('did-create-window', child => this.trackWindow(child, ses))
    const guardNavigation = (event: { preventDefault(): void }, url: string): void => {
      if (this.isAllowedUrl(url)) return
      event.preventDefault()
      if (isLegacyCduVpnUrl(url)) this.update({ status: 'error', connectionHint: 'legacy_vpn_http', message: '学校旧版 HTTP 转发等待本次运行确认，请回到 CDU 专区选择兼容方式' })
    }
    win.webContents.on('will-navigate', guardNavigation)
    win.webContents.on('will-redirect', guardNavigation)
    win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3 && this.windows.has(win)) this.update({ status: 'error', message: `学校页面加载失败（网络错误码 ${code}），请检查校园网络或官方 VPN` })
    })
    win.webContents.on('did-finish-load', () => { void this.advanceLogin() })
    win.on('closed', () => {
      this.windows.delete(win); this.generation++
      if (this.window === win) this.window = [...this.windows].find(item => !item.isDestroyed())
      if (!this.windows.size) {
        this.clearCredentials()
        if (this.loginTimer) clearInterval(this.loginTimer)
        this.loginTimer = undefined
        if (this.getAccount().status === 'active') this.update({ status: 'expired', message: '学校窗口已关闭，重新打开后自动验证登录态' })
        else if (['connecting', 'requires_verification'].includes(this.getAccount().status)) this.update({ status: 'disconnected', message: '已取消学校登录' })
      }
    })
    if (!this.loginTimer) {
      // VPN 是 SPA，登录后的 hash 路由变化不一定触发 did-finish-load。
      this.loginTimer = setInterval(() => { void this.advanceLogin() }, 1500)
      this.loginTimer.unref()
    }
  }
  private frames(): WebFrameMain[] {
    return [...this.windows].filter(win => !win.isDestroyed()).flatMap(win => win.webContents.mainFrame.framesInSubtree).slice(0, 40)
  }
  /** 认证阶段复用本次输入，只点击学校已展示的只读入口，不提交验证码。 */
  async advanceLogin(): Promise<void> {
    if (this.advancing || this.queryPending || this.credentialFailure) return
    this.advancing = true
    const generation = this.generation
    try {
      for (const frame of this.frames()) {
        if (!this.isAllowedUrl(frame.url)) continue
        const url = new URL(frame.url)
        const stage = this.credentials && getCduCredentialStage(frame.url, this.legacyVpnHttpApproved)
        if (stage && this.credentials) {
          const key = `${stage}:${url.origin}`
          const allowSubmit = !this.credentialSubmissions.has(key)
          const result = await this.executeFrameScript<CduCredentialResult>(frame, buildCduCredentialScript(allowSubmit ? this.credentials : { username: '', password: '' }, url.origin, stage, allowSubmit), true)
          if (generation !== this.generation) return
          if (!result) {
            this.allowTimeForUserVerification()
            // 提交结果不确定时停止再次注入，交给学校页面显示真实结果，避免重复认证。
            this.credentialSubmissions.add(key)
            this.update({ status: 'requires_verification', message: '自动提交结果暂未确认，请检查学校窗口；软件会继续检测认证结果' })
            this.revealSchoolWindow(); return
          }
          if (result?.state === 'submitted') this.credentialSubmissions.add(key)
          if (result?.state === 'rejected') {
            this.clearCredentials(); this.credentialFailure = true
            this.update({ status: 'error', message: '学校提示账号或密码错误、锁定或过期，请检查后重新连接' })
            this.revealSchoolWindow(); return
          }
          if (result?.state === 'verification_required' || result?.state === 'consent_required') {
            this.allowTimeForUserVerification()
            this.update({ status: 'requires_verification', message: result.state === 'consent_required' ? '请在学校窗口阅读并确认 VPN 使用说明，账号密码已填入' : '请在学校窗口完成扫码、短信或验证码，软件会继续检测结果' })
            this.revealSchoolWindow(); return
          }
          if (result?.state === 'not_ready' && this.getAccount().status === 'requires_verification') this.revealSchoolWindow()
        }
        const portal = url.hostname === 'vpn.cdu.edu.cn' && url.pathname.startsWith('/portal/') && url.hash.includes('/service')
        const business = isCduBusinessUrl(frame.url)
        if (portal && [...this.windows].some(win => !win.isDestroyed() && isCduBusinessUrl(win.webContents.mainFrame.url))) continue
        if (!portal && !business) continue
        const action = portal ? 'vpn' : 'sso'
        const key = `${action}:${url.origin}${url.pathname}${url.hash}`
        if (this.loginActions.has(key)) continue
        const labels = portal ? ['数智教务'] : ['统一认证', '统一身份认证', '统一身份认证登录']
        const clicked = await this.executeFrameScript<boolean>(frame, `(() => {
          const labels = ${JSON.stringify(labels)};
          const target = [...document.querySelectorAll('a,button,[role=button]')].find(el =>
            el.getClientRects().length && labels.some(label => ${portal ? "(el.getAttribute('title') === label || (el.textContent || '').includes(label))" : "(el.textContent || '').trim() === label"}));
          if (!target) return false;
          target.click(); return true;
        })()`, true)
        if (generation !== this.generation) return
        if (clicked) { this.loginActions.add(key); break }
      }
      await this.verifyAccount()
      if (generation === this.generation && !this.businessVerified && !this.credentialFailure && this.loginMode === 'direct' && this.getAccount().status === 'error' && !this.getAccount().connectionHint) {
        await this.navigateLogin('vpn', !this.requestedStudentId)
        return
      }
      if (generation === this.generation && this.getAccount().status === 'connecting') {
        const business = this.frames().find(frame => isCduBusinessUrl(frame.url))
        if (business) {
          const url = new URL(business.url)
          const key = `profile:${url.origin}${url.pathname}${url.hash}`
          if (!this.loginActions.has(key) && await this.navigateDomain('profile')) this.loginActions.add(key)
        }
      }
    } catch {
      if (generation === this.generation) this.update({ status: 'error', message: '学校自动连接暂未完成，请在学校窗口检查认证状态' })
    } finally { this.advancing = false }
  }
  /** 页面导航或脚本异常不得让自动登录永久等待。 */
  private async executeFrameScript<T>(frame: WebFrameMain, source: string, userGesture = false): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        frame.executeJavaScript(source, userGesture) as Promise<T>,
        new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 4000); timer.unref() }),
      ])
    } catch { return undefined }
    finally { if (timer) clearTimeout(timer) }
  }
  private async snapshots(): Promise<PageSnapshot[]> {
    const results: PageSnapshot[] = []
    for (const frame of this.frames()) {
      if (!this.isAllowedUrl(frame.url)) continue
      try {
        // 不读取凭据、可编辑输入或 Cookie；仅保留展示数据及可见学期筛选标签。
        const html = await this.executeFrameScript<string>(frame, `(() => {
          if (window.frameElement && !window.frameElement.getClientRects().length) return '';
          const copy = document.body.cloneNode(true);
          const tables = [...document.body.querySelectorAll('table,.datagrid-view,.ui-jqgrid-view')];
          [...copy.querySelectorAll('table,.datagrid-view,.ui-jqgrid-view')].forEach((el, index) => {
            const original = tables[index];
            let hidden = !original?.getClientRects().length;
            for (let parent = original; parent && !hidden; parent = parent.parentElement) {
              const style = getComputedStyle(parent);
              hidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
            }
            if (hidden) el.remove();
          });
          const terms = [...new Set([...document.querySelectorAll('select')].filter(el => el.getClientRects().length).map(el => (el.selectedOptions[0]?.textContent || '').trim()).filter(text => /^\\d{4}-\\d{4}-[1-3]$/.test(text)))];
          if ([...document.querySelectorAll('input[type=password]')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')) copy.setAttribute('data-cdu-login-required', 'true');
          if (/企业微信[\\s\\S]{0,16}(?:扫码|二维码)|扫码验证|短信验证码|二次认证/.test(document.body.innerText || '')) copy.setAttribute('data-cdu-verification-required', 'true');
          if ([...document.querySelectorAll('.datagrid-mask,.datagrid-mask-msg,.ui-jqgrid .loading')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')) copy.setAttribute('data-cdu-loading', 'true');
          copy.querySelectorAll('script,style,input,textarea,select,iframe').forEach(el => el.remove());
          copy.querySelectorAll('td,th,label,p,div,span').forEach(el => el.append(' '));
          return (terms.length === 1 ? '<p data-cdu-semester="' + terms[0] + '">页面学期</p>' : '') + (copy.hasAttribute('data-cdu-verification-required') ? '<p data-cdu-verification-required>学校二次验证</p>' : '') + (copy.hasAttribute('data-cdu-login-required') ? '<p data-cdu-login-required>学校登录</p>' : '') + (copy.hasAttribute('data-cdu-loading') ? '<p data-cdu-loading>业务数据加载中</p>' : '') + copy.innerHTML.slice(0, 1000000);
        })()`)
        if (html) results.push({ url: frame.url, html: String(html) })
      } catch { /* 导航中分离的 iframe 不影响其余页面读取 */ }
    }
    return results
  }
  async verifyAccount(): Promise<CduAccountProfile> {
    if (this.getAccount().connectionHint === 'legacy_vpn_http' && !this.legacyVpnHttpApproved) return this.getAccount()
    if (this.verifying) return this.getAccount()
    this.verifying = true
    const generation = this.generation
    try {
      const pages = await this.snapshots()
      if (generation !== this.generation) return this.getAccount()
      const authentication = pages.map(page => classifyCduPage(page.url, page.html))
      if (authentication.includes('verification_required')) {
        this.allowTimeForUserVerification()
        this.revealSchoolWindow()
        return this.update({ status: 'requires_verification', message: '请在学校窗口完成扫码或短信验证' })
      }
      if (authentication.includes('login_required')) return this.update({ status: this.getAccount().status === 'active' ? 'expired' : 'connecting', message: '请在学校窗口完成统一认证' })
      const businessPages = pages.filter(page => isCduBusinessUrl(page.url))
      const readyPages = businessPages.filter(page => classifyCduPage(page.url, page.html) === 'business')
      const identities = readyPages.map(page => extractCduIdentity(page.html)).filter(identity => identity !== null)
      const identity = identities[0]
      const tables = readyPages.flatMap(page => readCduPageTables(page.html))
      if (identity && identities.some(item => item.studentId !== identity.studentId)) return this.update({ status: 'error', message: '学校窗口存在不同账户，请关闭旧账户页面后重新连接' })
      // 顶栏身份与 iframe 中的业务表格分别读取，但必须属于同一业务会话。
      if (identity && ['profile', 'schedule', 'grades', 'exams'].some(domain => selectCduTables(domain as CduDomain, tables).length)) {
        if (this.requestedStudentId && identity.studentId !== this.requestedStudentId) {
          this.clearCredentials(); this.credentialFailure = true
          this.revealSchoolWindow()
          return this.update({ status: 'error', message: '学校返回的账户与输入学号不一致，请退出学校旧账户后重新连接' })
        }
        const previous = this.getAccount()
        if (previous.studentId && previous.studentId !== identity.studentId) this.store.invalidatePreviews()
        const card = selectCduTables('profile', tables).find(table => table.headers[0] === '字段')
        const college = card?.rows.find(row => row[0] === '学院')?.[1] ?? (previous.studentId === identity.studentId ? previous.college : undefined)
        const major = card?.rows.find(row => row[0] === '专业')?.[1] ?? (previous.studentId === identity.studentId ? previous.major : undefined)
        const now = Date.now()
        const lastVerifiedAt = previous.status === 'active' && previous.studentId === identity.studentId && now - (previous.lastVerifiedAt ?? 0) < 30_000 ? previous.lastVerifiedAt : now
        const profile = this.update({ ...identity, college, major, status: 'active', lastVerifiedAt, message: undefined })
        this.businessVerified = true
        if (previous.studentId !== profile.studentId || previous.studentName !== profile.studentName || previous.college !== college || previous.major !== major || previous.lastVerifiedAt !== lastVerifiedAt) this.store.saveAccount(profile)
        if (this.requestedStudentId) {
          this.clearCredentials()
          for (const win of this.windows) if (!win.isDestroyed()) win.hide()
        }
        return profile
      }
      const kinds = (businessPages.length ? businessPages : pages).map(page => classifyCduPage(page.url, page.html))
      if (kinds.includes('site_blocked')) return this.update({ status: 'error', message: '学校页面拒绝访问或维护中，请尝试官方 VPN' })
      if (kinds.includes('verification_required')) return this.update({ status: 'requires_verification', message: '请在学校窗口完成扫码或短信验证' })
      if (kinds.includes('login_required')) return this.update({ status: this.getAccount().status === 'active' ? 'expired' : 'connecting', message: '请在学校窗口完成统一认证' })
      if (businessPages.length && this.getAccount().status === 'active') return this.getAccount()
      if (pages.length) return this.update({ status: this.getAccount().status === 'active' ? 'expired' : 'connecting', message: '正在自动连接学校教务；必要时请在学校窗口完成认证或打开个人信息页' })
      return this.getAccount()
    } catch { return generation === this.generation ? this.update({ status: 'error', message: '读取学校页面失败，请重试验证' }) : this.getAccount() }
    finally { this.verifying = false }
  }
  /** 根据实际页面只读菜单导航；不存在匹配菜单时要求用户在学校窗口打开目标页。 */
  private async navigateDomain(domain: CduDomain): Promise<boolean> {
    for (const frame of this.frames()) {
      if (!isCduBusinessUrl(frame.url)) continue
      const clicked = await this.executeFrameScript<boolean>(frame, buildCduMenuScript(MENU_LABELS[domain]), true)
      if (clicked) return true
    }
    return false
  }
  async query(input: CduQueryInput): Promise<CduQueryResult> {
    validateCduDomain(input?.domain)
    const semester = input.semester?.trim()
    if (semester) validateCduSemester(semester)
    const account = this.getAccount()
    if (input.useCache) {
      if (!account.studentId || !semester) return { success: false, error: '读取本地数据需要已选择的学号和明确学期' }
      const data = this.store.load(account.studentId, semester, input.domain)
      return data ? { success: true, data } : { success: false, error: '该账户和学期没有本地数据' }
    }
    if (account.status !== 'active') return { success: false, error: '请先在 CDU 专区打开学校页面，进入个人信息页并验证账户；也可显式选择本地数据' }
    if (this.queryPending) return { success: false, error: '已有教务查询进行中，请等待完成后重试' }
    this.queryPending = true
    const generation = this.generation
    try {
      await this.network.prepare()
      const forDomain = (page: PageSnapshot): boolean => isCduBusinessUrl(page.url) && (input.domain !== 'schedule' || new URL(page.url).pathname.includes('queryKbForXsd'))
      let sessionPages = await this.snapshots()
      if (sessionPages.some(page => ['login_required', 'verification_required'].includes(classifyCduPage(page.url, page.html)))) {
        await this.verifyAccount()
        return { success: false, error: '学校认证已过期或仍需验证，请在学校窗口完成认证后重新查询' }
      }
      let pages = sessionPages.filter(forDomain)
      const ready = (page: PageSnapshot): boolean => {
        const tables = selectCduTables(input.domain, readCduPageTables(page.html))
        if (input.domain !== 'schedule') return tables.length > 0
        return tables.some(table => {
          const days = table.headers.flatMap((label, index) => /^(?:星期|周)[一二三四五六日天]$/.test(label.trim()) ? [index] : [])
          return days.length ? table.rows.some(row => !/备注|说明/.test(row[0] ?? '') && days.some(index => row[index]?.trim())) : table.rows.length > 0
        })
      }
      // 课表先出现空网格再填充课程；备注或表头不能提前结束等待。
      if (!pages.some(ready)) {
        await this.navigateDomain(input.domain)
        // 真实页面可能异步渲染；有界轮询，不长期占用主线程。
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 250))
          if (generation !== this.generation) return { success: false, error: '学校窗口已变化，请重新查询' }
          sessionPages = await this.snapshots()
          pages = sessionPages.filter(forDomain)
          if (pages.some(ready)) break
        }
      }
      if (generation !== this.generation || account.studentId !== this.getAccount().studentId) return { success: false, error: '账户或学校窗口已变化，请重新查询' }
      // 认证与账户归属必须检查同次快照的整个会话，不能在筛选课表 iframe 后漏掉父页面。
      const kinds = sessionPages.map(page => classifyCduPage(page.url, page.html))
      if (kinds.some(kind => kind !== 'business')) {
        await this.verifyAccount()
        return { success: false, error: '学校登录已过期、等待验证或页面维护中，请重新检查学校窗口' }
      }
      const identities = sessionPages.filter(page => isCduBusinessUrl(page.url)).map(page => extractCduIdentity(page.html)).filter(identity => identity !== null)
      if (!identities.length) {
        await this.verifyAccount()
        return { success: false, error: '学校当前页面未能确认本人身份，请打开个人信息页并验证后重新查询' }
      }
      if (identities.some(identity => identity.studentId !== account.studentId)) {
        await this.verifyAccount()
        return { success: false, error: '学校账户已变化，请验证后重新查询' }
      }
      const tables = pages.flatMap(page => classifyCduPage(page.url, page.html) === 'business' ? selectCduTables(input.domain, readCduPageTables(page.html)) : [])
      if (!tables.length) {
        await this.verifyAccount()
        if (!input.background) this.window?.show()
        return { success: false, error: '未读取到目标表格。请在学校窗口打开对应页面，加载所需学期和分页后重新读取' }
      }
      // 页面上的学期需要用户核对；不能把请求参数当成服务器已执行的筛选。
      const matchingHtml = pages.filter(page => selectCduTables(input.domain, readCduPageTables(page.html)).length).map(page => page.html).join('\n')
      const data: CduDataset = { domain: input.domain, accountId: account.studentId, semester: inferCduSemester(tables, matchingHtml), tables, source: 'page', fetchedAt: Date.now(), cached: false, completeness: 'visible' }
      this.store.save(data)
      return { success: true, data }
    } catch { return { success: false, error: '教务页面读取失败，请检查学校窗口与网络后重试' } }
    finally { this.queryPending = false }
  }
  async logout(): Promise<void> {
    this.generation++
    this.clearCredentials()
    const account = this.getAccount()
    for (const win of [...this.windows]) if (!win.isDestroyed()) win.destroy()
    this.window = undefined
    if (account.studentId) this.store.clearCache(account.studentId)
    this.store.clearAccount()
    this.profile = { studentId: '', studentName: '', status: 'disconnected' }
    this.legacyVpnHttpApproved = false
    this.statusCallback(this.getAccount())
    // 分区清理失败仍保持退出状态，并把失败交给调用方显示，不能假报清理成功。
    const ses = await this.network.prepare()
    await ses.clearStorageData()
    await ses.clearCache()
    await ses.closeAllConnections()
  }
  adoptImportedAccount(data: CduDataset): void {
    if (this.getAccount().status === 'active') return
    const previous = this.getAccount().studentId
    if (previous && previous !== data.accountId) this.store.invalidatePreviews()
    const profile = this.update({ studentId: data.accountId, studentName: '', status: 'disconnected', message: '已选择离线导入账户，尚未连接学校系统' })
    this.store.saveAccount(profile)
  }
}
export const cduService = new CduService()
