/**
 * 多语言密码输入页渲染器
 *
 * 支持: zh / en / pt / es / ja / ko / fr / de / ar
 *
 * 优先级:
 *   1. 链接配置的 passwordLang(非 'auto')
 *   2. 访客浏览器 Accept-Language
 *   3. 兜底中文 zh
 */

export type PasswordLang = 'zh' | 'en' | 'pt' | 'es' | 'ja' | 'ko' | 'fr' | 'de' | 'ar'

interface I18nStrings {
  htmlLang: string
  title: string
  heading: string
  subtitle: string
  placeholder: string
  buttonText: string
  errorWrong: (n: number, max: number) => string
  errorLocked: (mins: number) => string
  isRtl?: boolean
}

const STRINGS: Record<PasswordLang, I18nStrings> = {
  zh: {
    htmlLang: 'zh-CN',
    title: '需要密码 · 短链',
    heading: '需要密码',
    subtitle: '此链接受密码保护,请输入密码访问',
    placeholder: '请输入密码',
    buttonText: '访问',
    errorWrong: (n, max) => `密码错误(已失败 ${n}/${max} 次)`,
    errorLocked: mins => `失败次数过多,请 ${mins} 分钟后再试`,
  },
  en: {
    htmlLang: 'en',
    title: 'Password Required · Short Link',
    heading: 'Password Required',
    subtitle: 'This link is password-protected. Please enter the password to continue.',
    placeholder: 'Enter password',
    buttonText: 'Continue',
    errorWrong: (n, max) => `Incorrect password (${n}/${max} attempts)`,
    errorLocked: mins => `Too many failed attempts. Try again in ${mins} minutes.`,
  },
  pt: {
    htmlLang: 'pt-BR',
    title: 'Senha necessária · Link curto',
    heading: 'Senha necessária',
    subtitle: 'Este link é protegido por senha. Digite a senha para continuar.',
    placeholder: 'Digite a senha',
    buttonText: 'Continuar',
    errorWrong: (n, max) => `Senha incorreta (${n}/${max} tentativas)`,
    errorLocked: mins => `Muitas tentativas. Tente novamente em ${mins} minutos.`,
  },
  es: {
    htmlLang: 'es',
    title: 'Contraseña requerida · Enlace corto',
    heading: 'Contraseña requerida',
    subtitle: 'Este enlace está protegido con contraseña. Ingresa la contraseña para continuar.',
    placeholder: 'Ingresa la contraseña',
    buttonText: 'Continuar',
    errorWrong: (n, max) => `Contraseña incorrecta (${n}/${max} intentos)`,
    errorLocked: mins => `Demasiados intentos fallidos. Vuelve a intentarlo en ${mins} minutos.`,
  },
  ja: {
    htmlLang: 'ja',
    title: 'パスワードが必要 · 短縮リンク',
    heading: 'パスワードが必要です',
    subtitle: 'このリンクはパスワードで保護されています。パスワードを入力してください。',
    placeholder: 'パスワードを入力',
    buttonText: 'アクセス',
    errorWrong: (n, max) => `パスワードが違います(${n}/${max} 回)`,
    errorLocked: mins => `試行回数が多すぎます。${mins} 分後に再度お試しください。`,
  },
  ko: {
    htmlLang: 'ko',
    title: '비밀번호 필요 · 단축 링크',
    heading: '비밀번호가 필요합니다',
    subtitle: '이 링크는 비밀번호로 보호되어 있습니다. 비밀번호를 입력하세요.',
    placeholder: '비밀번호 입력',
    buttonText: '접속',
    errorWrong: (n, max) => `잘못된 비밀번호 (${n}/${max}회)`,
    errorLocked: mins => `너무 많은 실패 시도. ${mins}분 후에 다시 시도하세요.`,
  },
  fr: {
    htmlLang: 'fr',
    title: 'Mot de passe requis · Lien court',
    heading: 'Mot de passe requis',
    subtitle: 'Ce lien est protégé par un mot de passe. Veuillez saisir le mot de passe.',
    placeholder: 'Saisir le mot de passe',
    buttonText: 'Continuer',
    errorWrong: (n, max) => `Mot de passe incorrect (${n}/${max} tentatives)`,
    errorLocked: mins => `Trop d'échecs. Réessayez dans ${mins} minutes.`,
  },
  de: {
    htmlLang: 'de',
    title: 'Passwort erforderlich · Kurzlink',
    heading: 'Passwort erforderlich',
    subtitle: 'Dieser Link ist passwortgeschützt. Bitte geben Sie das Passwort ein.',
    placeholder: 'Passwort eingeben',
    buttonText: 'Weiter',
    errorWrong: (n, max) => `Falsches Passwort (${n}/${max} Versuche)`,
    errorLocked: mins => `Zu viele Fehlversuche. Versuchen Sie es in ${mins} Minuten erneut.`,
  },
  ar: {
    htmlLang: 'ar',
    title: 'كلمة المرور مطلوبة · رابط قصير',
    heading: 'كلمة المرور مطلوبة',
    subtitle: 'هذا الرابط محمي بكلمة مرور. يرجى إدخال كلمة المرور للمتابعة.',
    placeholder: 'أدخل كلمة المرور',
    buttonText: 'متابعة',
    errorWrong: (n, max) => `كلمة المرور غير صحيحة (${n}/${max} محاولات)`,
    errorLocked: mins => `محاولات فاشلة كثيرة جدًا. حاول مرة أخرى بعد ${mins} دقيقة.`,
    isRtl: true,
  },
}

/**
 * 从 Accept-Language header 检测语言
 * 例: 'zh-CN,zh;q=0.9,en;q=0.8' -> 'zh'
 */
function detectFromAcceptLanguage(header: string | undefined): PasswordLang {
  if (!header) return 'zh'
  const langs = header.toLowerCase().split(',').map(s => s.trim().split(';')[0].split('-')[0])
  const supported: PasswordLang[] = ['zh', 'en', 'pt', 'es', 'ja', 'ko', 'fr', 'de', 'ar']
  for (const lang of langs) {
    if (supported.includes(lang as PasswordLang)) {
      return lang as PasswordLang
    }
  }
  return 'zh'
}

/**
 * 决定最终使用的语言
 */
export function resolvePasswordLang(
  configuredLang: string | undefined,
  acceptLanguageHeader: string | undefined,
): PasswordLang {
  if (configuredLang && configuredLang !== 'auto') {
    const supported: PasswordLang[] = ['zh', 'en', 'pt', 'es', 'ja', 'ko', 'fr', 'de', 'ar']
    if (supported.includes(configuredLang as PasswordLang)) {
      return configuredLang as PasswordLang
    }
  }
  return detectFromAcceptLanguage(acceptLanguageHeader)
}

/**
 * 渲染密码输入页 HTML
 *
 * @param slug 链接 slug
 * @param lang 使用的语言
 * @param errorType 错误类型: null / 'wrong' / 'locked'
 * @param errorContext 错误上下文: { failedTimes, maxFails, lockMins }
 */
export function renderPasswordPage(
  slug: string,
  lang: PasswordLang,
  errorType: 'wrong' | 'locked' | null = null,
  errorContext: { failedTimes?: number, maxFails?: number, lockMins?: number } = {},
): string {
  const s = STRINGS[lang] || STRINGS.zh

  let errorMsg = ''
  if (errorType === 'wrong') {
    errorMsg = s.errorWrong(errorContext.failedTimes || 0, errorContext.maxFails || 5)
  }
  else if (errorType === 'locked') {
    errorMsg = s.errorLocked(errorContext.lockMins || 10)
  }

  const errBlock = errorMsg
    ? `<div style="background:#fee;color:#c33;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:14px;">${errorMsg}</div>`
    : ''

  const dirAttr = s.isRtl ? ' dir="rtl"' : ''

  // 转义 slug 防 XSS(slug 本身已经被 slugRegex 限制了,但保险起见)
  const safeSlug = slug.replace(/[<>"'&]/g, '')

  return `<!DOCTYPE html>
<html lang="${s.htmlLang}"${dirAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${s.title}</title>
<meta name="robots" content="noindex,nofollow">
<style>
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  padding: 20px;
}
.card {
  background: #fff; border-radius: 12px; padding: 32px 28px; width: 100%; max-width: 360px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
h1 { margin: 0 0 8px; font-size: 22px; color: #333; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
input[type=password] {
  width: 100%; padding: 12px 14px; font-size: 16px; border: 2px solid #e0e0e0;
  border-radius: 8px; outline: none; transition: border-color .15s;
}
input[type=password]:focus { border-color: #667eea; }
button {
  width: 100%; margin-top: 12px; padding: 12px; font-size: 15px; font-weight: 600;
  border: none; border-radius: 8px; background: #667eea; color: #fff; cursor: pointer; transition: background .15s;
}
button:hover { background: #5568d3; }
button:disabled { background: #aaa; cursor: not-allowed; }
.icon { width: 48px; height: 48px; margin: 0 auto 16px; display: block; }
</style>
</head>
<body>
<div class="card">
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  <h1>${s.heading}</h1>
  <p class="subtitle">${s.subtitle}</p>
  ${errBlock}
  <form method="POST" action="/_/verify-password" autocomplete="off">
    <input type="hidden" name="slug" value="${safeSlug}">
    <input type="password" name="password" placeholder="${s.placeholder}" required autofocus maxlength="32">
    <button type="submit">${s.buttonText}</button>
  </form>
</div>
</body>
</html>`
}