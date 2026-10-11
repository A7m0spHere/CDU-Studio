import type { CampusSchool } from '@profer/shared'

/** CDU 必须有单词边界，不能把 CDUT 误识别成 CDU。 */
export function resolveCampusSchool(text: string, bound?: CampusSchool, historicalGroups: readonly string[] = []): CampusSchool | undefined {
  const cdu = /\bcdu\b|成都大学|成大教务|数智教务/i.test(text)
  const cdut = /\bcdut\b|成都理工大学|青果/i.test(text)
  if (cdu !== cdut) return cdu ? 'cdu' : 'cdut'
  if (cdu && cdut) return undefined
  if (bound) return bound
  if (historicalGroups.includes('cdut-tools') && !historicalGroups.includes('cdu-tools')) return 'cdut'
  if (historicalGroups.includes('cdu-tools') && !historicalGroups.includes('cdut-tools')) return 'cdu'
  return undefined
}
