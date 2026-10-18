import dns from 'dns/promises';
import net from 'net';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024; // only the <head> matters; cap the download
const MAX_REDIRECTS = 3;

/**
 * Reject addresses that point back into our own infrastructure.
 * Without this, a user can paste a link like http://169.254.169.254/... and make
 * the server fetch internal metadata/services on their behalf (SSRF).
 */
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||            // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||  // CGNAT
      a >= 224                               // multicast / reserved
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true;
    // IPv4-mapped (::ffff:10.0.0.1) — re-check the embedded v4 address
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // unparseable — refuse
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Blocked address');
    return;
  }
  const records = await dns.lookup(host, { all: true });
  if (records.length === 0 || records.some((r) => isPrivateAddress(r.address))) {
    throw new Error('Blocked address');
  }
}

/** Read at most MAX_BYTES of the body so a huge/streaming page can't exhaust memory. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
    .slice(0, 300);
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  try {
    let url = new URL(rawUrl);

    // Follow redirects manually so every hop is re-validated against the SSRF rules.
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(url);
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'chat-linkpreview/1.0', Accept: 'text/html' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location') as string, url);
        continue;
      }
      break;
    }

    if (!res || !res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('text/html')) return null;

    const html = await readCapped(res);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const desc =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ||
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1];
    const image = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)?.[1];

    return {
      url: url.toString(),
      ...(title ? { title: decodeEntities(title) } : {}),
      ...(desc ? { description: decodeEntities(desc) } : {}),
      ...(image ? { image: decodeEntities(image) } : {}),
    };
  } catch {
    return null;
  }
}
