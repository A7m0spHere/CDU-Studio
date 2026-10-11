import { useEffect } from 'react'
import { useStore } from 'jotai'
import { cduAccountAtom, cduDataRevisionAtom, cduDatasetsAtom, cduFormAtom, cduImportPreviewAtom, cduLoginFormAtom } from '@/atoms/cdu-atoms'

export function useCduAccountHydration(): void {
  const store = useStore()
  useEffect(() => {
    let active = true
    let restoredAccount = ''
    const apply = (profile: Awaited<ReturnType<typeof window.electronAPI.cduZone.getAccount>>): void => {
      if (!active) return
      const previous = store.get(cduAccountAtom)
      if (previous.studentId !== profile.studentId || profile.status === 'disconnected' && !profile.studentId) {
        store.set(cduDatasetsAtom, {})
        store.set(cduImportPreviewAtom, null)
      }
      store.set(cduAccountAtom, profile)
      if (profile.studentId) store.set(cduFormAtom, value => ({ ...value, accountId: profile.studentId }))
      if (profile.studentId) store.set(cduLoginFormAtom, value => ({ ...value, username: value.username || profile.studentId }))
      if (profile.status === 'active') store.set(cduLoginFormAtom, value => ({ ...value, password: '' }))
      if (profile.studentId !== restoredAccount) {
        restoredAccount = profile.studentId
        const accountId = profile.studentId
        const revision = store.get(cduDataRevisionAtom)
        if (accountId) void window.electronAPI.cduZone.getSavedData().then(saved => {
          if (!active || store.get(cduAccountAtom).studentId !== accountId || store.get(cduDataRevisionAtom) !== revision) return
          store.set(cduDatasetsAtom, current => {
            const next = { ...current }
            for (const data of saved) if (data.accountId === accountId && (!next[data.domain] || next[data.domain]!.fetchedAt < data.fetchedAt)) next[data.domain] = data
            return next
          })
        }).catch(() => {})
      }
    }
    // 先订阅，再读取快照，避免初次查询时错过状态变化。
    let changed = false
    const unsubscribe = window.electronAPI.cduZone.onStatusChanged(profile => { changed = true; apply(profile) })
    void window.electronAPI.cduZone.getAccount().then(profile => { if (!changed) apply(profile) }).catch(() => {})
    return () => { active = false; unsubscribe() }
  }, [store])
}
