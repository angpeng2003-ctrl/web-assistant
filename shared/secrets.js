// 识别疑似密码、访问令牌、API 密钥、私钥。浏览器和服务端共用。
// 宁可多拦一点：被拦下的内容不会保存，也不会写进任何生成的文档。

const PATTERNS = [
  { kind: '私钥', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: 'GitHub 令牌', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/ },
  { kind: 'GitHub 令牌', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { kind: 'API 密钥', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}/ },
  { kind: '支付平台密钥', re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/ },
  { kind: '发信服务密钥', re: /\bre_[A-Za-z0-9_]{16,}/ },
  { kind: '云服务密钥', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'Google API 密钥', re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { kind: 'Slack 令牌', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: '访问令牌', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { kind: '访问令牌', re: /\b(?:vercel|npm|glpat|hf)_[A-Za-z0-9_-]{20,}/ },
  // “密码：Abc12345”“token=xxxx” 这类写法：值里要有数字或符号，避免把“密码由客户保管”误判
  {
    kind: '密码或密钥',
    re: /(?:密码|口令|密钥|令牌|password|passwd|pwd|passcode|token|api[ _-]?key|secret)\s*(?:[:：=]|是|为)\s*(?=[^\s　-鿿＀-￯]*[0-9!@#$%^&*_+=~?])[^\s　-鿿＀-￯]{6,}/i,
  },
];

const URL_RE = /https?:\/\/[^\s<>"'）)]+/gi;

// 长串随机字符（大小写字母加数字，32 位以上）。网址里的长 ID（例如网盘链接）不算。
function findHighEntropy(text) {
  const withoutUrls = text.replace(URL_RE, ' ');
  const tokens = withoutUrls.split(/[\s,;:，；：、()（）"'`<>[\]{}]+/);
  for (const t of tokens) {
    if (t.length >= 32 && /^[A-Za-z0-9_\-+/=]+$/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t) && /[0-9]/.test(t)) {
      return t;
    }
  }
  return null;
}

/** 返回 { kind } 或 null */
export function detectSecret(text) {
  if (typeof text !== 'string' || text.length < 6) return null;
  for (const p of PATTERNS) {
    if (p.re.test(text)) return { kind: p.kind };
  }
  if (findHighEntropy(text)) return { kind: '疑似密钥的长串字符' };
  return null;
}

/** 在任意 JSON 值里找疑似密钥，返回 { path, kind } 或 null */
export function findSecretIn(value, path = '') {
  if (typeof value === 'string') {
    const hit = detectSecret(value);
    return hit ? { path, kind: hit.kind } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findSecretIn(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const hit = findSecretIn(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

export const REDACTED = '［已隐去疑似密钥］';

/** 把文本里疑似密钥的部分替换掉（用于生成文档前的最后一道检查） */
export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const p of PATTERNS) {
    const g = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
    out = out.replace(g, REDACTED);
  }
  // 长串字符逐个替换（不动网址）
  let guard = 0;
  let token;
  while ((token = findHighEntropy(out)) && guard++ < 100) {
    out = out.split(token).join(REDACTED);
  }
  return out;
}
