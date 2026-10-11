import { atom } from 'jotai'
import type { CduAccountProfile, CduDataset, CduDiagnostic, CduDomain, CduImportPreview } from '@profer/shared'

export const cduAccountAtom = atom<CduAccountProfile>({ studentId: '', studentName: '', status: 'disconnected' })
export const cduDomainAtom = atom<CduDomain>('schedule')
export const cduDatasetsAtom = atom<Partial<Record<CduDomain, CduDataset>>>({})
export const cduFormAtom = atom({ accountId: '', semester: '' })
export const cduBusyAtom = atom('')
export const cduNoticeAtom = atom('')
export const cduDiagnosticsAtom = atom<CduDiagnostic[]>([])
export const cduImportPreviewAtom = atom<CduImportPreview | null>(null)
export const cduLogoutOpenAtom = atom(false)
export const cduLegacyVpnConfirmAtom = atom(false)
