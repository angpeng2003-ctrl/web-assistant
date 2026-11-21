// 服务端输入校验：拒绝未知字段、限制长度、检查类型，并拦截疑似密钥。
import { HttpError } from './store.js';
import { detectSecret } from '../shared/secrets.js';

/**
 * spec 形如 { name: { type: 'string', max: 200, optional: true, enum: [...], pattern: /re/ } }
 * type: string | boolean | integer | stringArray | array（配合 items 规格）
 */
export function checkObject(obj, spec, where = '请求') {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new HttpError(400, `${where}格式不对，应为对象。`);
  }
  for (const k of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(spec, k)) {
      throw new HttpError(400, `${where}里有不认识的字段：${k}`);
    }
  }
  const out = {};
  for (const [k, rule] of Object.entries(spec)) {
    const v = obj[k];
    if (v === undefined) {
      if (!rule.optional) throw new HttpError(400, `${where}缺少字段：${k}`);
      continue;
    }
    out[k] = checkValue(v, rule, `${where}.${k}`);
  }
  return out;
}

function checkString(v, rule, where) {
  if (typeof v !== 'string') throw new HttpError(400, `${where} 应为文字。`);
  if (rule.max != null && v.length > rule.max) throw new HttpError(400, `${where} 太长了（最多 ${rule.max} 个字）。`);
  if (rule.enum && !rule.enum.includes(v)) throw new HttpError(400, `${where} 的取值不对。`);
  if (rule.pattern && v !== '' && !rule.pattern.test(v)) throw new HttpError(400, `${where} 格式不对。`);
  if (!rule.allowSecret) {
    const hit = detectSecret(v);
    if (hit) {
      throw new HttpError(422, `疑似${hit.kind}，没有保存。这里不能记录密码、令牌或密钥，请删掉后再填。`, { secret: true, field: where });
    }
  }
  return v;
}

export function checkValue(v, rule, where) {
  if (v === null && rule.nullable) return null;
  switch (rule.type) {
    case 'string':
      return checkString(v, rule, where);
    case 'boolean':
      if (typeof v !== 'boolean') throw new HttpError(400, `${where} 应为是或否。`);
      return v;
    case 'integer':
      if (!Number.isInteger(v) || (rule.min != null && v < rule.min) || (rule.max != null && v > rule.max)) {
        throw new HttpError(400, `${where} 应为 ${rule.min ?? ''}–${rule.max ?? ''} 之间的整数。`);
      }
      return v;
    case 'object':
      // 只检查是对象，具体字段由调用方再用 checkObject 校验
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, `${where} 应为对象。`);
      return v;
    case 'stringArray': {
      if (!Array.isArray(v)) throw new HttpError(400, `${where} 应为列表。`);
      if (rule.maxItems != null && v.length > rule.maxItems) throw new HttpError(400, `${where} 项目太多。`);
      const seen = new Set();
      return v.map((x, i) => {
        const s = checkString(x, rule.item || {}, `${where}[${i}]`);
        if (seen.has(s)) throw new HttpError(400, `${where} 有重复项。`);
        seen.add(s);
        return s;
      });
    }
    case 'array': {
      if (!Array.isArray(v)) throw new HttpError(400, `${where} 应为列表。`);
      if (rule.maxItems != null && v.length > rule.maxItems) throw new HttpError(400, `${where} 项目太多（最多 ${rule.maxItems} 项）。`);
      return v.map((x, i) => checkObject(x, rule.items, `${where}[${i}]`));
    }
    default:
      throw new Error(`未知规则类型 ${rule.type}`);
  }
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const URL_RE = /^https?:\/\/[^\s]+$/i;

export function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
