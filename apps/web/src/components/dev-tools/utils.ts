export type TransformResult = { output: string; error?: string };

function jsonErrorHint(input: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = Number(posMatch[1]);
    const before = input.slice(0, pos);
    const line = before.split('\n').length;
    const lastNl = before.lastIndexOf('\n');
    const col = pos - lastNl;
    return `Line ${line}, column ${col}: ${msg}`;
  }
  return msg;
}

export function formatJson(input: string): TransformResult {
  if (!input.trim()) return { output: '' };
  try {
    const parsed = JSON.parse(input);
    return { output: JSON.stringify(parsed, null, 2) };
  } catch (err) {
    return { output: '', error: jsonErrorHint(input, err) };
  }
}

export function minifyJson(input: string): TransformResult {
  if (!input.trim()) return { output: '' };
  try {
    const parsed = JSON.parse(input);
    return { output: JSON.stringify(parsed) };
  } catch (err) {
    return { output: '', error: jsonErrorHint(input, err) };
  }
}

export function validateJson(input: string): TransformResult {
  if (!input.trim()) return { output: '', error: undefined };
  try {
    JSON.parse(input);
    return { output: '✓ Valid JSON' };
  } catch (err) {
    return { output: '', error: jsonErrorHint(input, err) };
  }
}

export function escapeJsonString(input: string): TransformResult {
  return { output: JSON.stringify(input) };
}

export function unescapeJsonString(input: string): TransformResult {
  if (!input.trim()) return { output: '' };
  try {
    const parsed = JSON.parse(input.trim());
    if (typeof parsed !== 'string') {
      return { output: '', error: 'Expected a JSON string value' };
    }
    return { output: parsed };
  } catch (err) {
    return { output: '', error: jsonErrorHint(input, err) };
  }
}

export function base64Encode(input: string): TransformResult {
  try {
    return { output: btoa(unescape(encodeURIComponent(input))) };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export function base64Decode(input: string): TransformResult {
  if (!input.trim()) return { output: '' };
  try {
    return { output: decodeURIComponent(escape(atob(input.trim()))) };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export function urlEncode(input: string): TransformResult {
  return { output: encodeURIComponent(input) };
}

export function urlDecode(input: string): TransformResult {
  if (!input.trim()) return { output: '' };
  try {
    return { output: decodeURIComponent(input.trim()) };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export function timestampToDate(input: string, unit: 'ms' | 's'): TransformResult {
  if (!input.trim()) return { output: '' };
  const num = Number(input.trim());
  if (!Number.isFinite(num)) return { output: '', error: 'Invalid timestamp' };
  const ms = unit === 's' ? num * 1000 : num;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return { output: '', error: 'Invalid date from timestamp' };
  return {
    output: [
      d.toISOString(),
      d.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' }),
    ].join('\n'),
  };
}

export function dateToTimestamp(input: string, unit: 'ms' | 's'): TransformResult {
  if (!input.trim()) return { output: '' };
  const d = new Date(input.trim());
  if (Number.isNaN(d.getTime())) return { output: '', error: 'Invalid date — try ISO 8601 or locale format' };
  const ms = d.getTime();
  return { output: unit === 's' ? String(Math.floor(ms / 1000)) : String(ms) };
}
