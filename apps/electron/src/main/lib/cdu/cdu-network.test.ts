import { describe, expect, test } from 'bun:test'
import type { Session } from 'electron'
import { CduNetwork, isCduUrl, isCduBusinessUrl, isLegacyCduVpnUrl, isFakeIp } from './cdu-network'

describe('CDU 直连分区行为', () => {
  test('首次导航必须等待直连配置和旧连接关闭，并复用同一初始化', async () => {
    const calls: string[] = []; let release!: () => void
    const configured = new Promise<void>(resolve => { release = resolve })
    const ses = { setProxy: async (config: { mode: string }) => { calls.push(config.mode); await configured }, closeAllConnections: async () => { calls.push('close') } } as unknown as Session
    const network = new CduNetwork(() => ses)
    let ready = false
    const one = network.prepare(); const two = network.prepare()
    void one.then(() => { ready = true })
    expect(one).toBe(two); expect(ready).toBe(false); expect(calls).toEqual(['direct'])
    release(); expect(await one).toBe(ses); expect(calls).toEqual(['direct', 'close'])
    await network.reset(); expect(calls).toEqual(['direct', 'close', 'direct', 'close'])
  })
  test('配置失败不能继续请求，下次可以重试', async () => {
    let attempts = 0
    const ses = { setProxy: async () => { if (++attempts === 1) throw new Error('失败') }, closeAllConnections: async () => {} } as unknown as Session
    const network = new CduNetwork(() => ses)
    await expect(network.prepare()).rejects.toThrow('失败')
    expect(await network.prepare()).toBe(ses)
  })
  test('校园 URL 白名单严格检查协议、域名和用户信息', () => {
    expect(isCduUrl('https://szjw.cdu.edu.cn/')).toBe(true)
    expect(isCduUrl('https://vpn.cdu.edu.cn/https/example')).toBe(true)
    expect(isCduBusinessUrl('https://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/')).toBe(true)
    expect(isCduBusinessUrl('https://vpn.cdu.edu.cn/portal/#!/service')).toBe(false)
    expect(isCduBusinessUrl('https://other.vpn.cdu.edu.cn/')).toBe(false)
    expect(isLegacyCduVpnUrl('http://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/')).toBe(true)
    for (const url of ['http://szjw.cdu.edu.cn/', 'http://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8080/', 'http://example-com.vpn.cdu.edu.cn:8118/', 'http://szjw-cdu-edu-cn-s.vpn.cdu.edu.cn.attacker.example:8118/', 'http://user:password@szjw-cdu-edu-cn-s.vpn.cdu.edu.cn:8118/']) expect(isLegacyCduVpnUrl(url)).toBe(false)
    for (const url of ['http://id.cdu.edu.cn/', 'https://cdu.edu.cn.example.com/', 'https://evilcdu.edu.cn/', 'https://user:password@cdu.edu.cn/', 'file:///tmp/a']) expect(isCduUrl(url)).toBe(false)
    expect(isFakeIp('198.18.0.1')).toBe(true); expect(isFakeIp('198.19.0.1')).toBe(true)
    expect(isFakeIp('202.115.80.140')).toBe(false)
  })
})

test('诊断区分 HTTP 200 拒绝页、认证跳转、DNS 与网络错误，不输出票据', async () => {
  const ses = {
    setProxy: async () => {}, closeAllConnections: async () => {}, resolveProxy: async () => 'DIRECT',
    fetch: async (url: string) => {
      if (url.includes('szjw.')) return { status: 200, ok: true, url, text: async () => '403 Forbidden' }
      if (url.includes('id.')) return { status: 200, ok: true, url: url + 'login?ticket=private', text: async () => '统一认证' }
      throw new Error('含有秘密的请求地址')
    },
  } as unknown as Session
  const results = await new CduNetwork(() => ses, async host => host.startsWith('vpn.') ? [] : ['202.115.80.140']).diagnose()
  expect(results.map(item => item.state)).toEqual(['site_blocked', 'login_required', 'dns_error', 'network_error'])
  expect(results.every(item => item.proxy === 'DIRECT')).toBe(true)
  expect(JSON.stringify(results)).not.toContain('private')
})
