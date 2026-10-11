import { useEffect } from 'react'
import { useStore } from 'jotai'
import { cduAccountAtom, cduDatasetsAtom, cduFormAtom, cduImportPreviewAtom, cduLoginFormAtom } from '@/atoms/cdu-atoms'

export function useCduAccountHydration(): void {
  const store = useStore()
  useEffect(() => {
    let active = true
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
    }
    // 先订阅，再读取快照，避免初次查询时错过状态变化。
    let changed = false
    const unsubscribe = window.electronAPI.cduZone.onStatusChanged(profile => { changed = true; apply(profile) })
    void window.electronAPI.cduZone.getAccount().then(profile => { if (!changed) apply(profile) }).catch(() => {})
    return () => { active = false; unsubscribe() }
  }, [store])
}
