import { session, type Session } from 'electron'
import { lookup } from 'node:dns/promises'
import type { CduDiagnostic } from '@profer/shared'
import { classifyCduPage } from './cdu-page-parser'

export const CDU_AUTH_PARTITION = 'persist:cdu-auth-zone'
/** 学校官方应用导航实际公布的教务 SSO 入口，不能用站点根地址替代。 */
export const CDU_HOME_URL = 'https://szjw.cdu.edu.cn/admin/caslogin'
export const CDU_VPN_URL = 'https://vpn.cdu.edu.cn/'
/** VPN 资源列表实测的教务转发域名；门户本身不能作为教务业务页。 */
export function isCduBusinessUrl(value: string): boolean {
  if (!isCduUrl(value) && !isLegacyCduVpnUrl(value)) return false
  return ['szjw.cdu.edu.cn', 'szjw-cdu-edu-cn-s.vpn.cdu.edu.cn'].includes(new URL(value).hostname)
}
/** 仅学校 VPN 转发的 CDU 资源；不允许普通校园 HTTP、其他端口或外部目标。 */
export function isLegacyCduVpnUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && url.port === '8118' && !url.username && !url.password
      && /^[a-z0-9-]+-cdu-edu-cn(?:-s)?\.vpn\.cdu\.edu\.cn$/.test(url.hostname)
  } catch { return false }
}
export function isCduUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'cdu.edu.cn' || url.hostname.endsWith('.cdu.edu.cn')) && !url.username && !url.password
  } catch { return false }
}
export function isFakeIp(address: string): boolean {
  return /^198\.(18|19)\./.test(address) || /^2001:2:/i.test(address)
}

/** 所有 CDU 网络入口共用；不继承系统代理或 AI 渠道代理。 */
async function lookupCduHost(host: string): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      lookup(host, { all: true }).then(items => items.map(item => item.address)),
      new Promise<string[]>(resolve => { timer = setTimeout(() => resolve([]), 5000); timer.unref() }),
    ])
  } catch { return [] }
  finally { if (timer) clearTimeout(timer) }
}

export class CduNetwork {
  private ready: Promise<Session> | undefined
  constructor(
    private readonly getSession = () => session.fromPartition(CDU_AUTH_PARTITION),
    private readonly lookupHost = lookupCduHost,
  ) {}
  prepare(): Promise<Session> {
    if (!this.ready) {
      const ses = this.getSession()
      this.ready = ses.setProxy({ mode: 'direct' }).then(async () => {
        await ses.closeAllConnections()
        return ses
      }).catch(error => { this.ready = undefined; throw error })
    }
    return this.ready
  }
  async reset(): Promise<void> {
    await this.ready?.catch(() => undefined)
    this.ready = undefined
    await this.prepare()
  }
  async diagnose(): Promise<CduDiagnostic[]> {
    const ses = await this.prepare()
    return Promise.all(['szjw.cdu.edu.cn', 'id.cdu.edu.cn', 'vpn.cdu.edu.cn', 'jw.cdu.edu.cn'].map(async host => {
      const addresses = await this.lookupHost(host).catch(() => [])
      const result: CduDiagnostic = { host, addresses, fakeIp: addresses.some(isFakeIp), proxy: await ses.resolveProxy(`https://${host}/`).catch(() => 'UNKNOWN'), state: addresses.length ? 'network_error' : 'dns_error', message: addresses.length ? '网络不可达，请检查校园网或官方 VPN' : '系统 DNS 解析失败，请检查本地网络；Chromium 仍将尝试访问' }
      try {
        const response = await ses.fetch(`https://${host}/`, { signal: AbortSignal.timeout(12_000), redirect: 'follow' })
        const body = (await response.text()).slice(0, 1_000_000)
        const kind = classifyCduPage(response.url, body)
        result.httpStatus = response.status
        result.state = kind === 'business' ? (response.ok ? 'reachable' : 'site_blocked') : kind
        result.message = result.state === 'site_blocked' ? '当前访问路径返回拒绝内容；请检查本机代理、TUN 与 IPv4/IPv6 出口，或尝试官方 VPN' : result.state === 'reachable' ? '网站可达；尚不代表教务已登录' : '请在学校页面完成认证'
      } catch (error) {
        // 只返回标准错误码，不传递可能含认证票据的原始异常文本。
        const code = /\bERR_[A-Z_]+\b/.exec(error instanceof Error ? error.message : '')?.[0]
        result.networkError = code ?? (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? error.name : 'NETWORK_ERROR')
      }
      return result
    }))
  }
}
