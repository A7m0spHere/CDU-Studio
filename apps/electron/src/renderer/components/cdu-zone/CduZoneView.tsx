import { useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Activity, ArrowUpRight, BookOpen, CalendarDays, FileUp, GraduationCap, Loader2, LogOut, MessageSquare, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { Button } from '@profer/ui/primitives/button'
import { Input } from '@profer/ui/primitives/input'
import { ConfirmDialog } from '@profer/ui/primitives/confirm-dialog'
import { WindowControlsHost } from '@/components/WindowControlsTemplate'
import { cn } from '@/lib/utils'
import { useCduZoneActions } from '@/hooks/useCduZoneActions'
import { cduAccountAtom, cduBusyAtom, cduDatasetsAtom, cduDiagnosticsAtom, cduDomainAtom, cduFormAtom, cduImportPreviewAtom, cduLogoutOpenAtom, cduLegacyVpnConfirmAtom, cduNoticeAtom } from '@/atoms/cdu-atoms'
import cduLogo from '@/assets/cdu-logo.svg'
import { CduDataTables } from './CduDataTables'
import { CduLoginForm } from './CduLoginForm'

const sections = [
  { domain: 'schedule', title: '我的课表', description: '课程、周次与上课地点', icon: CalendarDays },
  { domain: 'grades', title: '课程成绩', description: '成绩、学分与绩点', icon: BookOpen },
  { domain: 'exams', title: '考试安排', description: '考试时间与考场', icon: GraduationCap },
  { domain: 'profile', title: '个人资料', description: '本人学籍与基本信息', icon: UserRound },
] as const
const statusLabels = { disconnected: '未连接学校', connecting: '等待学校登录', requires_verification: '等待扫码或短信验证', active: '已验证学校账户', expired: '登录已过期', error: '连接需要处理' }

export function CduZoneView(): React.ReactElement {
  const account = useAtomValue(cduAccountAtom)
  const [domain, setDomain] = useAtom(cduDomainAtom)
  const datasets = useAtomValue(cduDatasetsAtom)
  const [form, setForm] = useAtom(cduFormAtom)
  const busy = useAtomValue(cduBusyAtom)
  const [notice, setNotice] = useAtom(cduNoticeAtom)
  const diagnostics = useAtomValue(cduDiagnosticsAtom)
  const [preview, setPreview] = useAtom(cduImportPreviewAtom)
  const [logoutOpen, setLogoutOpen] = useAtom(cduLogoutOpenAtom)
  const [legacyVpnConfirm, setLegacyVpnConfirm] = useAtom(cduLegacyVpnConfirmAtom)
  const fileInput = useRef<HTMLInputElement>(null)
  const actions = useCduZoneActions()
  const data = datasets[domain]
  const section = sections.find(item => item.domain === domain)!

  return <div className="relative flex h-full min-h-0 flex-col bg-muted/25">
    <WindowControlsHost id="cdu-zone" priority={20} className="absolute right-2 top-[3px] z-20" />
    <header className="titlebar-drag-region flex h-14 shrink-0 items-center gap-3 px-7 pr-36">
      <GraduationCap size={18} className="text-primary" /><span className="text-sm font-medium">CDU 专区</span>
      <span className={cn('rounded-full px-2.5 py-1 text-[11px]', account.legacyVpnHttpAllowed ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary')}>{account.legacyVpnHttpAllowed ? '本次已允许学校旧版 HTTP 转发' : '校园网络直连'}</span>
    </header>
    <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 lg:px-9">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="grid gap-5 pt-3 xl:grid-cols-[1.3fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl bg-primary p-7 text-primary-foreground shadow-sm">
            <img src={cduLogo} alt="成都大学" className="mb-8 h-12 max-w-[250px] object-contain object-left" />
            <p className="mb-2 text-xs font-medium tracking-[0.15em] opacity-70">学习与校园生活</p>
            <h1 className="text-3xl font-semibold tracking-tight">教务信息，近在手边。</h1>
            <p className="mt-4 max-w-md text-sm leading-7 opacity-80">连接成都大学数智教务，查看自己的课程、成绩和考试安排，也可以把问题交给教务助理。</p>
            <div className="mt-7 flex items-center gap-2 text-xs opacity-80"><ShieldCheck size={15} />一次输入账号，学校验证由你完成</div>
          </div>
          <div className="flex flex-col rounded-3xl bg-card p-7 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">学校账户</h2><span className={cn('rounded-full px-3 py-1 text-xs', account.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{statusLabels[account.status]}</span></div>
            <p className="mt-6 text-2xl font-semibold">{account.studentName || '连接你的成都大学账户'}</p>
            <p className="mt-2 text-sm text-muted-foreground">{account.studentId ? `学号 ${account.studentId}` : '输入学校账号，自动连接数智教务。'}</p>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">{account.message || (account.status === 'active' ? '账户已通过页面验证；查询时仍需检查学校登录态。' : '自动尝试直连，必要时转入官方 VPN，再进入数智教务验证本人身份。')}</p>
            {!['active', 'connecting', 'requires_verification'].includes(account.status) && <CduLoginForm onLogin={() => void actions.login()} />}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" disabled={!!busy} onClick={() => void actions.openLogin('direct')}>打开学校页面 <ArrowUpRight size={14} className="ml-2" /></Button>
              <Button variant="outline" disabled={!!busy} onClick={() => void actions.openLogin('vpn')}>官方 VPN</Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => void actions.verify()}>检查登录状态</Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => setLegacyVpnConfirm(true)}>{account.connectionHint === 'legacy_vpn_http' ? '处理旧版 VPN 入口' : 'VPN 兼容方式'}</Button>
              {account.studentId && <Button variant="ghost" disabled={!!busy} aria-label="退出学校账户" onClick={() => setLogoutOpen(true)}><LogOut size={16} /></Button>}
              {!account.studentId && ['connecting', 'requires_verification'].includes(account.status) && <Button variant="ghost" disabled={!!busy} onClick={() => void actions.logout()}>取消连接</Button>}
            </div>
          </div>
        </section>

        <nav aria-label="CDU 教务类别" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sections.map(({ domain: value, title, description, icon: Icon }) => <button key={value} disabled={!!busy} onClick={() => { setDomain(value); setPreview(null); setNotice('') }} className={cn('rounded-2xl p-5 text-left shadow-sm transition-colors disabled:opacity-60', domain === value ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-card hover:bg-muted')}>
            <Icon size={20} className="mb-4 text-primary" /><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span>
          </button>)}
        </nav>

        <section className="rounded-3xl bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-lg font-semibold">{section.title}</h2><p className="mt-1 text-xs text-muted-foreground">学校页面读取与本地文件导入共用查询结果，来源始终可见。</p></div>
            <Button variant="outline" disabled={!!busy} onClick={() => void actions.startConversation()}><MessageSquare size={15} className="mr-2" />询问教务助理</Button>
          </div>
          <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl bg-muted/50 p-4">
            <label className="min-w-36 flex-1 text-xs text-muted-foreground">数据归属学号<Input value={form.accountId} disabled={!!busy || account.status === 'active'} onChange={event => { setForm({ ...form, accountId: event.target.value }); setPreview(null) }} placeholder="导入时填写本人学号" className="mt-2 bg-background" /></label>
            <label className="min-w-36 flex-1 text-xs text-muted-foreground">本地数据学期<Input value={form.semester} disabled={!!busy} onChange={event => { setForm({ ...form, semester: event.target.value }); setPreview(null) }} placeholder="例如 2026-2027-1" className="mt-2 bg-background" /></label>
            <Button disabled={!!busy || account.status !== 'active'} onClick={() => void actions.query(false)}><RefreshCw size={14} className="mr-2" />读取学校页面</Button>
            <Button variant="outline" disabled={!!busy || !account.studentId || !form.semester} onClick={() => void actions.query(true)}>读取本地数据</Button>
            <Button variant="outline" disabled={!!busy || !form.accountId || !form.semester} onClick={() => fileInput.current?.click()}><FileUp size={14} className="mr-2" />导入文件</Button>
            <input ref={fileInput} type="file" accept=".csv,.html,.htm,.xlsx" className="hidden" aria-label="选择课表或成绩文件" onChange={event => {
              const file = event.target.files?.[0]; event.target.value = ''
              if (file) void actions.previewFile(file)
            }} />
          </div>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">支持 CSV、HTML 表格和 XLSX。在线读取使用学校当前页面的筛选，学期输入仅用于本地导入与缓存检索。</p>
          {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-primary"><Loader2 className="animate-spin" size={16} />{busy}…</p>}
          {notice && <p role="status" className="mt-4 rounded-xl bg-muted p-4 text-sm">{notice}</p>}
          {preview ? <div className="mt-6 space-y-4 rounded-2xl bg-muted/40 p-5">
            <h3 className="font-semibold">确认导入内容</h3><p className="text-xs leading-6 text-muted-foreground">{preview.warnings.join(' ')}</p>
            <CduDataTables data={preview.data} />
            <div className="flex gap-2"><Button disabled={!!busy} onClick={() => void actions.confirmImport()}>确认并保存</Button><Button variant="ghost" disabled={!!busy} onClick={() => setPreview(null)}>取消</Button></div>
          </div> : data ? <div className="mt-6"><CduDataTables data={data} /></div> : <div className="py-14 text-center"><section.icon size={32} className="mx-auto mb-4 text-muted-foreground/50" /><p className="text-sm font-medium">还没有{section.title}数据</p><p className="mx-auto mt-2 max-w-md text-xs leading-6 text-muted-foreground">连接学校后读取对应页面，或导入本人导出的文件。这里不会用演示数据代替真实教务信息。</p></div>}
        </section>

        <section className="rounded-2xl bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-medium"><Activity size={16} />校园网络检查</div><div className="flex gap-2"><Button variant="ghost" disabled={!!busy} onClick={() => void actions.diagnose()}>检查直连</Button>{account.studentId && <Button variant="ghost" disabled={!!busy} onClick={() => void actions.clearCache()}>清除本地数据</Button>}</div></div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">学校访问使用独立直连分区。开启 Clash TUN 后，直连规则仍可能受网络出口影响；出现“页面正在修复”时请检查代理与 IPv4/IPv6 路径。网站可达与教务登录成功分别验证。</p>
          {!!diagnostics.length && <div className="mt-4 grid gap-3 md:grid-cols-2">{diagnostics.map(item => <div key={item.host} className="rounded-xl bg-muted/50 p-4 text-xs"><p className="font-medium">{item.host} · {item.proxy}</p><p className="mt-2 text-muted-foreground">{item.message}{item.networkError ? `（${item.networkError}）` : ''}{item.httpStatus ? `（HTTP ${item.httpStatus}）` : ''}</p><p className="mt-2 break-all text-muted-foreground">{item.addresses.join(' / ') || 'DNS 解析失败'}{item.fakeIp ? ' · 检测到 Fake-IP，请检查 Clash 规则' : ''}</p></div>)}</div>}
        </section>
      </div>
    </main>
    <ConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} title="退出 CDU 学校账户" description="将关闭学校窗口并清除 CDU 登录态和该账户的本地教务缓存。" confirmLabel="退出账户" onConfirm={() => { setLogoutOpen(false); void actions.logout() }} />
    <ConfirmDialog open={legacyVpnConfirm} onOpenChange={setLegacyVpnConfirm} title="允许本次学校旧版 VPN 转发？" variant="default" description="学校资源列表使用 HTTP 8118 端口转发 CDU 网站。继续后，VPN 会话、认证操作及教务数据可能通过明文连接传输，存在被窃听或篡改的风险。仅放行学校 *.vpn.cdu.edu.cn 下编码为 CDU 资源的转发域名及 8118 端口，退出账户或重启后失效。也可取消，使用校园网或学校官方 SSL VPN 客户端保持加密访问。" confirmLabel="仅本次允许 HTTP 转发" cancelLabel="保持 HTTPS" onConfirm={() => { setLegacyVpnConfirm(false); void actions.approveLegacyVpnHttp() }} />
  </div>
}
