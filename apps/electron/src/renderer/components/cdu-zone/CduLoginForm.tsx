import { useAtom, useAtomValue } from 'jotai'
import { Button } from '@profer/ui/primitives/button'
import { Input } from '@profer/ui/primitives/input'
import { cduBusyAtom, cduLoginFormAtom } from '@/atoms/cdu-atoms'

/** 密码仅停留于本次连接表单，提交即从渲染状态清空。 */
export function CduLoginForm({ onLogin }: { onLogin: () => void }): React.ReactElement {
  const [form, setForm] = useAtom(cduLoginFormAtom)
  const busy = useAtomValue(cduBusyAtom)
  return <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); onLogin() }}>
    <label className="block text-xs text-muted-foreground" htmlFor="cdu-login-username">学校学号
      <Input id="cdu-login-username" value={form.username} autoComplete="username" inputMode="numeric" maxLength={20} disabled={!!busy} placeholder="输入统一身份认证学号" className="mt-2 bg-background" onChange={event => setForm(current => ({ ...current, username: event.target.value }))} />
    </label>
    <label className="block text-xs text-muted-foreground" htmlFor="cdu-login-password">学校密码
      <Input id="cdu-login-password" type="password" value={form.password} autoComplete="off" maxLength={256} disabled={!!busy} placeholder="仅用于本次连接" className="mt-2 bg-background" onChange={event => setForm(current => ({ ...current, password: event.target.value }))} />
    </label>
    <Button type="submit" className="w-full" disabled={!!busy || !/^\d{6,20}$/.test(form.username.trim()) || !form.password}>连接学校账号</Button>
    <p className="text-xs leading-6 text-muted-foreground">需要扫码、短信、验证码或确认学校说明时，请在弹出的学校页面操作。密码仅用于本次连接，不保存到本地。</p>
  </form>
}
