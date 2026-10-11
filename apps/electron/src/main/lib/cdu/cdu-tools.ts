import { Type } from 'typebox'
import type { AgentToolResult } from '@earendil-works/pi-agent-core'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { CduDomain } from '@profer/shared'
import { cduService } from './cdu-service'
import { CDU_DOMAINS, CDU_LABELS, formatCduTables } from './cdu-page-parser'
import { getAgentSessionMeta } from '../agent-session-manager'

/** 与专区共享同一查询服务；模型无法指定任意 URL 或学校账户。 */
export function buildPiCduTools(sdk: typeof import('@earendil-works/pi-coding-agent'), sessionId: string): ToolDefinition[] {
  return CDU_DOMAINS.map((domain: CduDomain) => sdk.defineTool({
    name: `cdu_${domain}`,
    label: `CDU ${CDU_LABELS[domain]}`,
    description: `只读查询成都大学${CDU_LABELS[domain]}。在线读取需要用户先在 CDU 专区完成原生学校认证。页面结果只覆盖当前已加载内容，学期筛选与分页需用户在学校页面核对；禁止声称已自动取得全部记录。离线数据需显式 source=cache 并指定学期。`,
    parameters: Type.Object({
      source: Type.Optional(Type.Union([Type.Literal('live'), Type.Literal('cache')])),
      semester: Type.Optional(Type.String({ maxLength: 40, description: '本地数据所属学期；在线读取不能据此替代学校页面筛选' })),
    }),
    async execute(_id, params): Promise<AgentToolResult<unknown>> {
      const args = params as { source?: 'live' | 'cache'; semester?: string }
      const meta = getAgentSessionMeta(sessionId)
      if (meta?.campusSchool !== 'cdu') return { content: [{ type: 'text' as const, text: '请先询问用户学校，或从 CDU 专区打开教务助理；当前会话尚未绑定成都大学。' }], details: { success: false } }
      const result = await cduService.query({ domain, useCache: args.source === 'cache', semester: args.semester })
      const text = result.data
        ? `CDU ${CDU_LABELS[domain]}｜来源：${result.data.source === 'file' ? '文件导入' : '学校页面'}${result.data.cached ? '（本地缓存）' : ''}｜获取时间：${new Date(result.data.fetchedAt).toISOString()}｜学期：${result.data.semester}\n${result.data.completeness === 'visible' ? '仅包含当前已加载的页面表格，请核对分页与学期。\n' : ''}\n${formatCduTables(result.data.tables)}`
        : result.error ?? '查询失败'
      const bounded = text.length > 20000 ? text.slice(0, 20000) + '\n内容过长，仅展示前段；请在 CDU 专区查看完整已加载表格。' : text
      return { content: [{ type: 'text' as const, text: bounded }], details: { success: result.success, source: result.data?.source, fetchedAt: result.data?.fetchedAt, completeness: result.data?.completeness } }
    },
  }))
}
