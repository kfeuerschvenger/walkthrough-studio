import type { Plugin } from 'vite';

/**
 * Social crawlers (Facebook, LinkedIn, Slack, X) ignore relative image URLs,
 * so the preview image needs an absolute one. The public URL is only known at
 * deploy time, which makes it an optional build-time value.
 */

/** Meta tags whose `content` is a root-relative URL to be made absolute. */
const IMAGE_META = ['og:image', 'twitter:image'] as const;

/** Receives a human-readable warning about an unusable configuration. */
type Warn = (message: string) => void;

const defaultWarn: Warn = (message) => console.warn(`[walkthrough:social-meta] ${message}`);

/** Matches a whole `<meta ...>` tag, tolerating `>` inside quoted values. */
const META_TAG = /<meta\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;

/** Matches an HTML comment; used to keep commented-out tags untouched. */
const COMMENT = /(<!--[\s\S]*?-->)/;

/** Reads an attribute value, in any position and with any quoting or spacing. */
function readAttr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? '') : null;
}

/** Returns the tag with its `content` value replaced, keeping the original quoting. */
function withContent(tag: string, content: string): string {
  return tag.replace(
    /(\scontent\s*=\s*)(?:"[^"]*"|'[^']*')/i,
    (_m, head: string) => `${head}"${content}"`,
  );
}

/** Identifies the meta tag by its `property` or `name` attribute. */
function metaKey(tag: string): string | null {
  return readAttr(tag, 'property') ?? readAttr(tag, 'name');
}

/**
 * Rewrites the preview image meta tags to absolute URLs and adds `og:url`.
 *
 * `siteUrl` is the public base URL of the deployment: an origin, optionally
 * followed by a sub-path (`https://example.com/walk`). Root-relative image
 * paths are resolved against that base. Attribute order, quoting, and line
 * breaks inside the tags do not matter, and tags inside HTML comments are
 * left alone.
 *
 * Returns the HTML untouched when `siteUrl` is empty or not a valid absolute
 * http(s) URL, so the tags stay relative (valid for local use, ignored by
 * crawlers). Calls `warn` when a value is set but unusable, or when it is
 * valid but the page has no preview image tag to rewrite.
 */
export function applySiteUrl(
  html: string,
  siteUrl: string | undefined,
  warn: Warn = defaultWarn,
): string {
  const base = parseBase(siteUrl, warn);
  if (!base) return html;

  // Odd indexes are comments, even indexes are live markup.
  const parts = html.split(COMMENT);
  const live = parts.filter((_, i) => i % 2 === 0).join('\n');
  const hasOgUrl = [...live.matchAll(META_TAG)].some((m) => metaKey(m[0]) === 'og:url');

  let imageTagSeen = false;
  let ogUrlPending = !hasOgUrl;
  const ogUrlTag = `<meta property="og:url" content="${base}/" />`;

  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(META_TAG, (tag, offset: number, whole: string) => {
      const key = metaKey(tag);
      if (!key || !(IMAGE_META as readonly string[]).includes(key)) return tag;
      imageTagSeen = true;

      const content = readAttr(tag, 'content');
      let out = tag;
      if (content !== null && content.startsWith('/') && !content.startsWith('//')) {
        out = withContent(tag, `${base}${content}`);
      }

      if (key === 'og:image' && ogUrlPending) {
        ogUrlPending = false;
        const lineStart = whole.lastIndexOf('\n', offset - 1) + 1;
        const lead = whole.slice(lineStart, offset);
        const indent = /^[ \t]*$/.test(lead) ? lead : '';
        out = `${out}\n${indent}${ogUrlTag}`;
      }
      return out;
    });
  }

  let out = parts.join('');
  if (!imageTagSeen) {
    warn('VITE_SITE_URL is set but index.html has no og:image or twitter:image meta tag to rewrite.');
  }

  if (ogUrlPending) {
    // No og:image tag to anchor on: place it at the end of the live head.
    const headEnd = out.split(COMMENT).reduce<number | null>((found, part, i, all) => {
      if (i % 2 === 1) return found;
      const at = part.search(/<\/head\s*>/i);
      if (at === -1) return found;
      const before = all.slice(0, i).join('').length;
      return before + at;
    }, null);
    if (headEnd !== null) {
      out = `${out.slice(0, headEnd)}${ogUrlTag}\n${out.slice(headEnd)}`;
    }
  }
  return out;
}

/**
 * Normalises `VITE_SITE_URL` to origin plus pathname without a trailing
 * slash, or null when unusable. Query string and fragment are dropped.
 */
function parseBase(siteUrl: string | undefined, warn: Warn): string | null {
  const value = siteUrl?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      warn(`VITE_SITE_URL "${value}" ignored: only http(s) URLs are supported.`);
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    warn(`VITE_SITE_URL "${value}" ignored: not an absolute URL.`);
    return null;
  }
}

/** Vite plugin applying {@link applySiteUrl} with the resolved `VITE_SITE_URL`. */
export function socialMeta(siteUrl: string | undefined): Plugin {
  return {
    name: 'walkthrough:social-meta',
    transformIndexHtml: (html) => applySiteUrl(html, siteUrl),
  };
}
