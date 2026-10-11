/** 保留学校菜单自己的点击处理，仅修正规范路径，避免双斜杠被服务端重定向回首页。 */
export function buildCduMenuScript(labels: string[]): string {
  return `(() => {
    const labels = ${JSON.stringify(labels)};
    const nodes = [...document.querySelectorAll('a,button,[role=menuitem]')];
    const labelOf = el => (el.textContent || '').replace(/[\\uE000-\\uF8FF]/g, '').replace(/\\s*\\/\\s*$/, '').trim();
    let target = nodes.find(el => el.getClientRects().length && labels.includes(labelOf(el)));
    if (!target) {
      const group = nodes.find(el => (el.textContent || '').trim().startsWith('信息查询'));
      if (group) group.click();
      target = nodes.find(el => labels.includes(labelOf(el)));
    }
    if (!target) return false;
    if (target.href && !target.href.startsWith('javascript:')) {
      const url = new URL(target.href, location.origin);
      if (url.origin !== location.origin) return false;
      url.pathname = url.pathname.replace(/\\/{2,}/g, '/');
      target.href = url.href;
    }
    target.click(); return true;
  })()`
}
