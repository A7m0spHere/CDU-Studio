import type { CduLoginInput } from '@profer/shared'

export type CduCredentialStage = 'identity' | 'vpn'
export interface CduCredentialResult {
  state: 'not_ready' | 'submitted' | 'verification_required' | 'consent_required' | 'rejected'
}

/** 仅向实际观察到的学校认证入口提交，普通业务页不能取得密码。 */
export function getCduCredentialStage(value: string, legacyApproved = false): CduCredentialStage | undefined {
  try {
    const url = new URL(value)
    if (url.username || url.password) return undefined
    const secure = url.protocol === 'https:' && !url.port
    if (secure && url.hostname === 'vpn.cdu.edu.cn' && url.pathname.startsWith('/portal/') && url.hash === '#!/login') return 'vpn'
    const identity = secure && url.hostname === 'id.cdu.edu.cn'
    const forwarded = /^id-cdu-edu-cn(?:-s)?\.vpn\.cdu\.edu\.cn$/.test(url.hostname)
      && ((secure) || (legacyApproved && url.protocol === 'http:' && url.port === '8118'))
    if ((identity || forwarded) && /^\/(?:cas\/|authserver\/)?login\/?$/.test(url.pathname)) return 'identity'
    return undefined
  } catch { return undefined }
}

export function validateCduLoginInput(input: CduLoginInput): void {
  if (!input || typeof input.username !== 'string' || !/^\d{6,20}$/.test(input.username.trim())) throw new Error('请填写 6–20 位学号')
  if (typeof input.password !== 'string' || input.password.length === 0 || input.password.length > 256) throw new Error('请输入学校密码，最多 256 个字符')
}

/** 交由学校现有页面完成加密及提交；不复制密码到网页存储，不代填验证码或同意条款。 */
export function buildCduCredentialScript(input: CduLoginInput, origin: string, stage: CduCredentialStage, allowSubmit = true): string {
  return `(async () => {
    if (location.origin !== ${JSON.stringify(origin)}) return { state: 'not_ready' };
    const stage = ${JSON.stringify(stage)};
    if (stage === 'vpn' && location.hash !== '#!/login') return { state: 'not_ready' };
    if (stage === 'identity' && !/^\\/(?:cas\\/|authserver\\/)?login\\/?$/.test(location.pathname)) return { state: 'not_ready' };
    const visible = el => {
      if (el.closest('.hidden-box,[hidden],[aria-hidden=true]')) return false;
      for (let parent = el; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < innerHeight && rect.left < innerWidth && getComputedStyle(el).visibility !== 'hidden';
    };
    const text = (document.body.innerText || '').slice(0, 20000);
    if (/用户名或密码错误|账号或密码错误|账户或密码错误|密码错误|账号不存在|账号已锁定|账户已锁定|密码已过期/.test(text)) return { state: 'rejected' };
    const inputs = [...document.querySelectorAll('input')].filter(el => visible(el) && !el.disabled && !el.readOnly);
    const verification = inputs.find(el => /captcha|verify|verification|验证码|动态口令|动态密码|一次性口令/i.test([el.name, el.id, el.placeholder,
      el.closest('label')?.innerText || el.parentElement?.querySelector?.('label,.input-column-name,.ant-form-item-label')?.innerText || ''].join(' ')));
    const password = inputs.find(el => el.type === 'password' && el !== verification);
    const username = inputs.find(el => el !== verification && ['text', 'tel', 'email'].includes(el.type) && /username|user.?name|account|学工号|学号|用户名/i.test([el.name, el.id, el.placeholder].join(' ')))
      || (stage === 'vpn' ? inputs.find(el => ['text', 'tel'].includes(el.type) && el !== verification) : undefined);
    if (!username || !password) return { state: verification || /企业微信[\\s\\S]{0,16}(?:扫码|二维码)|扫码验证|短信验证码|二次认证/.test(text) ? 'verification_required' : 'not_ready' };
    if (!${JSON.stringify(allowSubmit)}) return { state: verification ? 'verification_required' : 'not_ready' };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const write = (el, value) => {
      el.focus();
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    };
    write(username, ${JSON.stringify(input.username.trim())});
    write(password, ${JSON.stringify(input.password)});
    await new Promise(resolve => setTimeout(resolve, 80));
    if (location.origin !== ${JSON.stringify(origin)}) return { state: 'not_ready' };
    if (verification) return { state: 'verification_required' };
    const consent = [...document.querySelectorAll('input[type=checkbox]')].find(el => {
      const label = el.closest('label') || el.parentElement;
      const mark = label?.querySelector('.checkbox__mark');
      const checked = el.checked || label?.getAttribute('aria-checked') === 'true'
        || /[\\uE000-\\uF8FF✓✔]/.test(mark?.textContent || '');
      return !checked && visible(label) && /同意|阅读|免责|条款/.test(label?.innerText || '');
    });
    if (consent) return { state: 'consent_required' };
    const form = password.closest('form');
    const controls = [...(form || document).querySelectorAll('button,input[type=submit],[role=button],a,.login-btn,.login-button')];
    const submit = controls.find(el => visible(el) && !el.disabled && !el.classList.contains('disabled')
      && /^登\\s*录$|^Login$/i.test((el.innerText || el.value || '').trim()));
    if (!submit) return { state: 'not_ready' };
    submit.click();
    return { state: 'submitted' };
  })()`
}
