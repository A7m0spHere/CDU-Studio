import { useStore } from 'jotai'
import { cduAccountAtom, cduBusyAtom, cduDatasetsAtom, cduDiagnosticsAtom, cduDomainAtom, cduFormAtom, cduImportPreviewAtom, cduLoginFormAtom, cduNoticeAtom } from '@/atoms/cdu-atoms'
import { readCduImportFile } from '@/lib/cdu-import'
import { useOpenSession } from './useOpenSession'

/** 集中处理 CDU IPC 与异步状态，组件仅描述交互。 */
export function useCduZoneActions() {
  const store = useStore()
  const openSession = useOpenSession()
  const run = async (label: string, task: () => Promise<void>): Promise<void> => {
    if (store.get(cduBusyAtom)) return
    store.set(cduBusyAtom, label)
    store.set(cduNoticeAtom, '')
    try { await task() }
    catch (error) { store.set(cduNoticeAtom, error instanceof Error ? error.message : '操作未完成，请重试') }
    finally { store.set(cduBusyAtom, '') }
  }
  return {
    login: () => run('连接学校账号', async () => {
      const input = store.get(cduLoginFormAtom)
      store.set(cduLoginFormAtom, current => ({ ...current, password: '' }))
      await window.electronAPI.cduZone.login(input)
    }),
    openLogin: (mode: 'direct' | 'vpn') => run('打开学校页面', () => window.electronAPI.cduZone.openLogin(mode)),
    approveLegacyVpnHttp: () => run('继续学校 VPN 转发', async () => {
      await window.electronAPI.cduZone.approveLegacyVpnHttp()
      store.set(cduNoticeAtom, '已仅为本次运行允许学校旧版 VPN 转发；退出账户或重启后失效')
    }),
    verify: () => run('验证账户', async () => {
      const result = await window.electronAPI.cduZone.verifyAccount()
      store.set(cduNoticeAtom, result.status === 'active' ? '学校账户验证成功' : result.message || '请先打开学校页面')
    }),
    query: (useCache: boolean) => run(useCache ? '读取本地数据' : '读取学校页面', async () => {
      const result = await window.electronAPI.cduZone.query({ domain: store.get(cduDomainAtom), semester: store.get(cduFormAtom).semester, useCache })
      if (!result.success || !result.data) throw new Error(result.error ?? '尚未读取到数据')
      if (store.get(cduAccountAtom).studentId !== result.data.accountId) throw new Error('账户已变化，请重新读取')
      store.set(cduDatasetsAtom, current => ({ ...current, [result.data!.domain]: result.data }))
    }),
    previewFile: (file: File) => run('解析导入文件', async () => {
      const form = store.get(cduFormAtom)
      const domain = store.get(cduDomainAtom)
      const result = await readCduImportFile(file)
      store.set(cduImportPreviewAtom, await window.electronAPI.cduZone.previewImport({ ...result, domain, accountId: form.accountId, semester: form.semester }))
    }),
    confirmImport: () => run('保存本地数据', async () => {
      const preview = store.get(cduImportPreviewAtom)
      if (!preview) throw new Error('请先预览文件')
      const saved = await window.electronAPI.cduZone.commitImport(preview.token)
      store.set(cduDatasetsAtom, current => ({ ...current, [saved.domain]: saved }))
      store.set(cduImportPreviewAtom, null)
      store.set(cduNoticeAtom, '已保存文件导入数据，可离线查看')
    }),
    diagnose: () => run('检查校园网络', async () => { store.set(cduDiagnosticsAtom, await window.electronAPI.cduZone.diagnose()) }),
    clearCache: () => run('清除本地数据', async () => {
      await window.electronAPI.cduZone.clearCache(store.get(cduAccountAtom).studentId)
      store.set(cduDatasetsAtom, {}); store.set(cduImportPreviewAtom, null)
      store.set(cduNoticeAtom, '本地教务缓存已清除')
    }),
    logout: () => run('退出学校账户', async () => {
      store.set(cduLoginFormAtom, { username: '', password: '' })
      await window.electronAPI.cduZone.logout()
      store.set(cduDatasetsAtom, {}); store.set(cduImportPreviewAtom, null)
      store.set(cduFormAtom, current => ({ ...current, accountId: '' }))
    }),
    startConversation: () => run('打开教务助理', async () => {
      const id = await window.electronAPI.cduZone.startConversation()
      openSession('agent', id, 'CDU 教务助理')
    }),
  }
}
export type CduZoneActions = ReturnType<typeof useCduZoneActions>
