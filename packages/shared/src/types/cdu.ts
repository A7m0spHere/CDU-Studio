/** 成都大学专区契约；密码仅用于本次学校认证，不落盘或提供给 Agent。 */
export type CampusSchool = 'cdu' | 'cdut'
export type CduDomain = 'profile' | 'schedule' | 'grades' | 'exams'
export type CduAccountStatus = 'disconnected' | 'connecting' | 'requires_verification' | 'active' | 'expired' | 'error'
export interface CduLoginInput { username: string; password: string }
export interface CduAccountProfile {
  studentId: string
  studentName: string
  status: CduAccountStatus
  college?: string
  major?: string
  lastVerifiedAt?: number
  message?: string
  /** 旧版 HTTP 转发必须由用户在当前运行中明确确认。 */
  connectionHint?: 'legacy_vpn_http'
  legacyVpnHttpAllowed?: boolean
}
export interface CduTable { headers: string[]; rows: string[][] }
export interface CduDataset {
  domain: CduDomain
  accountId: string
  semester: string
  tables: CduTable[]
  source: 'page' | 'interface' | 'file'
  fetchedAt: number
  cached: boolean
  /** 页面读取仅代表已加载的内容，不承诺未加载分页。 */
  completeness: 'visible' | 'imported' | 'complete'
}
export interface CduQueryInput { domain: CduDomain; semester?: string; useCache?: boolean; background?: boolean }
export interface CduQueryResult { success: boolean; data?: CduDataset; error?: string }
export interface CduImportInput {
  domain: CduDomain
  semester: string
  /** 离线导入也必须由用户显式指定账户归属。 */
  accountId: string
  format: 'csv' | 'html' | 'markdown'
  content: string
}
export interface CduImportPreview { token: string; data: CduDataset; warnings: string[] }
export interface CduDiagnostic {
  host: string
  proxy: string
  addresses: string[]
  fakeIp: boolean
  httpStatus?: number
  networkError?: string
  state: 'reachable' | 'login_required' | 'verification_required' | 'site_blocked' | 'dns_error' | 'network_error'
  message: string
}
export interface CduZoneAPI {
  getAccount(): Promise<CduAccountProfile>
  getSavedData(): Promise<CduDataset[]>
  login(input: CduLoginInput): Promise<void>
  openLogin(mode: 'direct' | 'vpn'): Promise<void>
  approveLegacyVpnHttp(): Promise<void>
  verifyAccount(): Promise<CduAccountProfile>
  logout(): Promise<void>
  query(input: CduQueryInput): Promise<CduQueryResult>
  diagnose(): Promise<CduDiagnostic[]>
  previewImport(input: CduImportInput): Promise<CduImportPreview>
  commitImport(token: string): Promise<CduDataset>
  clearCache(accountId: string): Promise<void>
  startConversation(): Promise<string>
  onStatusChanged(callback: (profile: CduAccountProfile) => void): () => void
}
export const CDU_ZONE_IPC_CHANNELS = {
  GET_ACCOUNT: 'cdu-zone:get-account', LOGIN: 'cdu-zone:login', OPEN_LOGIN: 'cdu-zone:open-login',
  GET_SAVED_DATA: 'cdu-zone:get-saved-data',
  APPROVE_LEGACY_VPN_HTTP: 'cdu-zone:approve-legacy-vpn-http',
  VERIFY: 'cdu-zone:verify', LOGOUT: 'cdu-zone:logout', QUERY: 'cdu-zone:query',
  DIAGNOSE: 'cdu-zone:diagnose', PREVIEW_IMPORT: 'cdu-zone:preview-import',
  COMMIT_IMPORT: 'cdu-zone:commit-import', CLEAR_CACHE: 'cdu-zone:clear-cache',
  START_CONVERSATION: 'cdu-zone:start-conversation', STATUS_CHANGED: 'cdu-zone:status-changed',
} as const
