/**
 * Splash 中转页 HTML 渲染
 * 包含倒计时 + 跳过按钮 + 跟踪像素脚本
 */

function escHtml(s: string): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderFacebookPixel(pixelId: string): string {
  if (!pixelId) return ''
  const id = pixelId.replace(/[^0-9]/g, '')
  if (!id) return ''
  return `
<!-- Facebook Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>
`
}

function renderGoogleAds(tagId: string): string {
  if (!tagId) return ''
  const id = tagId.trim()
  if (!/^(G|AW|UA|GT)-/i.test(id)) return ''
  return `
<!-- Google Tag -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');
</script>
`
}

function renderTiktokPixel(pixelId: string): string {
  if (!pixelId) return ''
  const id = pixelId.trim()
  if (!id) return ''
  return `
<!-- TikTok Pixel -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('${id}');
  ttq.page();
}(window, document, 'ttq');
</script>
`
}

function renderTwitterPixel(pixelId: string): string {
  if (!pixelId) return ''
  const id = pixelId.trim()
  if (!id) return ''
  return `
<!-- Twitter Pixel -->
<script>
!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
twq('config','${id}');
twq('event','tw-${id}-PageView');
</script>
`
}

export function renderSplashPage(opts: {
  finalUrl: string
  title?: string
  subtitle?: string
  imageUrl?: string
  buttonText?: string
  buttonColor?: string
  bgColor?: string
  textColor?: string
  countdownSeconds?: number
  pixelFacebook?: string
  pixelGoogleAds?: string
  pixelTiktok?: string
  pixelTwitter?: string
  customHtml?: string
}): string {
  const seconds = Math.max(0, Math.min(60, opts.countdownSeconds ?? 5))
  const bg = opts.bgColor || '#ffffff'
  const fg = opts.textColor || '#1a1a1a'
  const btnBg = opts.buttonColor || '#0066cc'
  const finalUrl = opts.finalUrl
  const finalUrlWithSkip = finalUrl + (finalUrl.includes('?') ? '&' : '?') + 'splash_skip=1'

  const title = opts.title ? escHtml(opts.title) : ''
  const subtitle = opts.subtitle ? escHtml(opts.subtitle) : ''
  const imageUrl = opts.imageUrl ? escHtml(opts.imageUrl) : ''
  const buttonText = escHtml(opts.buttonText || 'Continue')

  const pixels = [
    renderFacebookPixel(opts.pixelFacebook || ''),
    renderGoogleAds(opts.pixelGoogleAds || ''),
    renderTiktokPixel(opts.pixelTiktok || ''),
    renderTwitterPixel(opts.pixelTwitter || ''),
  ].filter(Boolean).join('\n')

  const customHtmlSafe = opts.customHtml || ''

  const imageHtml = imageUrl ? `<img class="splash-image" src="${imageUrl}" alt="">` : ''
  const titleHtml = title ? `<h1 class="splash-title">${title}</h1>` : ''
  const subtitleHtml = subtitle ? `<p class="splash-subtitle">${subtitle}</p>` : ''
  const countdownHtml = seconds > 0 ? `<p class="splash-countdown">Redirecting in <span id="splashSec">${seconds}</span>s...</p>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title || 'Redirecting...'}</title>
<meta name="robots" content="noindex,nofollow">
${pixels}
${customHtmlSafe}
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{
  display:flex;align-items:center;justify-content:center;min-height:100vh;
  background:${bg};color:${fg};
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  padding:20px;
}
.splash-card{max-width:520px;width:100%;text-align:center}
.splash-image{max-width:200px;max-height:200px;margin:0 auto 20px;display:block}
.splash-title{font-size:28px;font-weight:600;margin-bottom:12px}
.splash-subtitle{font-size:16px;opacity:0.7;margin-bottom:28px;line-height:1.5}
.splash-button{
  display:inline-block;padding:14px 36px;border-radius:8px;
  background:${btnBg};color:#fff;text-decoration:none;font-size:16px;font-weight:500;
  border:none;cursor:pointer;transition:opacity 0.2s;
}
.splash-button:hover{opacity:0.9}
.splash-countdown{margin-top:16px;font-size:13px;opacity:0.5}
</style>
</head>
<body>
<div class="splash-card">
${imageHtml}
${titleHtml}
${subtitleHtml}
<a class="splash-button" href="${escHtml(finalUrlWithSkip)}">${buttonText}</a>
${countdownHtml}
</div>
<script>
(function(){
  var url = ${JSON.stringify(finalUrlWithSkip)};
  var sec = ${seconds};
  if (sec > 0) {
    var el = document.getElementById('splashSec');
    var timer = setInterval(function(){
      sec--;
      if (el) el.textContent = sec;
      if (sec <= 0) {
        clearInterval(timer);
        window.location.replace(url);
      }
    }, 1000);
  }
})();
</script>
</body>
</html>`
}