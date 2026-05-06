/**
 * CIDR 工具
 *
 * 支持判断一个 IP 是否属于某个 CIDR 段。
 * 例:
 *   ipInCidr('192.168.1.5', '192.168.1.0/24') === true
 *   ipInCidr('10.0.0.1', '10.0.0.0/8')        === true
 *   ipInCidr('1.2.3.4', '5.6.7.0/24')         === false
 *
 * 只支持 IPv4。IPv6 不在当前需求内。
 */

/**
 * 把 IPv4 地址转成 32 位整数(用 BigInt 避免符号位问题)
 * 返回 null 表示输入不是合法 IPv4
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let result = 0
  for (const part of parts) {
    const n = Number.parseInt(part, 10)
    if (Number.isNaN(n) || n < 0 || n > 255 || String(n) !== part) {
      return null
    }
    result = (result << 8) + n
  }
  // 用 >>> 0 转成无符号 32 位
  return result >>> 0
}

/**
 * 校验单个 IPv4 地址格式
 */
export function isValidIPv4(ip: string): boolean {
  return ipv4ToInt(ip) !== null
}

/**
 * 校验 CIDR 格式 (例: '192.168.1.0/24')
 */
export function isValidCidr(cidr: string): boolean {
  const parts = cidr.split('/')
  if (parts.length !== 2) return false
  if (!isValidIPv4(parts[0])) return false
  const prefix = Number.parseInt(parts[1], 10)
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false
  if (String(prefix) !== parts[1]) return false
  return true
}

/**
 * 判断 IP 是否在 CIDR 段内
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const ipInt = ipv4ToInt(ip)
  if (ipInt === null) return false

  const parts = cidr.split('/')
  if (parts.length !== 2) return false

  const cidrIpInt = ipv4ToInt(parts[0])
  if (cidrIpInt === null) return false

  const prefix = Number.parseInt(parts[1], 10)
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false

  if (prefix === 0) return true // /0 匹配所有 IP

  // 高 prefix 位的掩码
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0
  return (ipInt & mask) === (cidrIpInt & mask)
}

/**
 * 从 H3 event 取访问者 IP
 * 优先用 Cloudflare 的 CF-Connecting-IP,兜底用 X-Forwarded-For 第一个
 */
export function getClientIp(event: any): string {
  const cfIp = getRequestHeader(event, 'cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  const xff = getRequestHeader(event, 'x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()

  const realIp = getRequestHeader(event, 'x-real-ip')
  if (realIp) return realIp.trim()

  return ''
}