import { BrowserWindow, ipcMain } from 'electron'
import { CDU_ZONE_IPC_CHANNELS as C, type CduImportInput, type CduQueryInput } from '@profer/shared'
import { cduService } from './cdu-service'
import { createAgentSession, updateAgentSessionMeta } from '../agent-session-manager'

export function registerCduIpc(getMainWindow: () => BrowserWindow | null): void {
  const handle = (channel: string, fn: (owner: number, ...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender.id !== getMainWindow()?.webContents.id || event.senderFrame !== event.sender.mainFrame) throw new Error('CDU IPC 仅允许应用主界面调用')
      return fn(event.sender.id, ...args)
    })
  }
  handle(C.GET_ACCOUNT, () => cduService.getAccount())
  handle(C.OPEN_LOGIN, (_owner, mode: 'direct' | 'vpn') => cduService.openLogin(mode))
  handle(C.APPROVE_LEGACY_VPN_HTTP, () => cduService.approveLegacyVpnHttp())
  handle(C.VERIFY, () => cduService.verifyAccount())
  handle(C.LOGOUT, () => cduService.logout())
  handle(C.QUERY, (_owner, input: CduQueryInput) => cduService.query(input))
  handle(C.DIAGNOSE, () => cduService.network.diagnose())
  handle(C.PREVIEW_IMPORT, (owner, input: CduImportInput) => {
    const account = cduService.getAccount()
    if (account.status === 'active' && input.accountId !== account.studentId) throw new Error('导入学号与当前学校账户不一致')
    return cduService.store.preview(input, owner)
  })
  handle(C.COMMIT_IMPORT, (owner, token: string) => {
    const account = cduService.getAccount()
    const data = cduService.store.commit(token, owner, account.status === 'active' ? account.studentId : undefined)
    cduService.adoptImportedAccount(data)
    return data
  })
  handle(C.CLEAR_CACHE, (_owner, accountId: string) => cduService.store.clearCache(accountId))
  handle(C.START_CONVERSATION, () => {
    const session = createAgentSession('CDU 教务助理', undefined, undefined, undefined, 'pi')
    updateAgentSessionMeta(session.id, { campusSchool: 'cdu', activatedToolGroups: ['cdu-tools'] })
    return session.id
  })
  cduService.onStatus(profile => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(C.STATUS_CHANGED, profile)
  })
}
