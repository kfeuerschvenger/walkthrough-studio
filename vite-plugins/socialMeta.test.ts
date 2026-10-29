import { describe, expect, it, vi } from 'vitest';
import { applySiteUrl } from './socialMeta';

const HTML = [
  '<meta property="og:image" content="/social-preview.png" />',
  '<meta name="twitter:image" content="/social-preview.png" />',
].join('\n');

const SITE = 'https://walk.example.com';

describe('applySiteUrl', () => {
  it('leaves the tags relative when the site URL is unset or blank', () => {
    const warn = vi.fn();
    expect(applySiteUrl(HTML, undefined, warn)).toBe(HTML);
    expect(applySiteUrl(HTML, '  ', warn)).toBe(HTML);
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores a value that is not an absolute http(s) URL and warns', () => {
    const warn = vi.fn();
    expect(applySiteUrl(HTML, 'example.com', warn)).toBe(HTML);
    expect(applySiteUrl(HTML, 'ftp://example.com', warn)).toBe(HTML);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('makes both image tags absolute and adds og:url', () => {
    const out = applySiteUrl(HTML, SITE);
    expect(out).toContain('property="og:image" content="https://walk.example.com/social-preview.png"');
    expect(out).toContain('name="twitter:image" content="https://walk.example.com/social-preview.png"');
    expect(out).toContain('<meta property="og:url" content="https://walk.example.com/" />');
  });

  it('drops a trailing slash from the site URL', () => {
    const out = applySiteUrl(HTML, `${SITE}/`);
    expect(out).toContain('content="https://walk.example.com/social-preview.png"');
    expect(out).toContain('<meta property="og:url" content="https://walk.example.com/" />');
  });

  it('keeps a sub-path from the site URL', () => {
    const out = applySiteUrl(HTML, 'https://example.com/walk/');
    expect(out).toContain('property="og:image" content="https://example.com/walk/social-preview.png"');
    expect(out).toContain('name="twitter:image" content="https://example.com/walk/social-preview.png"');
    expect(out).toContain('<meta property="og:url" content="https://example.com/walk/" />');
  });

  it('does not duplicate an existing og:url', () => {
    const html = `<meta property="og:url" content="https://x.test/" />\n${HTML}`;
    const out = applySiteUrl(html, SITE);
    expect(out.match(/property="og:url"/g)).toHaveLength(1);
    expect(out).toContain('content="https://x.test/"');
  });

  it('does not touch an image that is already absolute, and still adds og:url', () => {
    const html = '<meta property="og:image" content="https://cdn.test/a.png" />';
    const out = applySiteUrl(html, SITE);
    expect(out).toContain('https://cdn.test/a.png');
    expect(out).toContain('<meta property="og:url" content="https://walk.example.com/" />');
  });

  it('handles a tag split across several lines', () => {
    const html = [
      '  <meta',
      '    property="og:image"',
      '    content="/social-preview.png"',
      '  />',
    ].join('\n');
    const out = applySiteUrl(html, SITE);
    expect(out).toContain('content="https://walk.example.com/social-preview.png"');
    expect(out).toContain('  <meta property="og:url" content="https://walk.example.com/" />');
  });

  it('handles content before property', () => {
    const html = '<meta content="/social-preview.png" property="og:image" />';
    const out = applySiteUrl(html, SITE);
    expect(out).toContain('content="https://walk.example.com/social-preview.png" property="og:image"');
    expect(out).toContain('<meta property="og:url" content="https://walk.example.com/" />');
  });

  it('leaves commented-out tags alone', () => {
    const html = `<!-- <meta property="og:image" content="/old.png" /> -->\n${HTML}`;
    const out = applySiteUrl(html, SITE);
    expect(out).toContain('<!-- <meta property="og:image" content="/old.png" /> -->');
    expect(out.match(/property="og:url"/g)).toHaveLength(1);
    expect(out).toContain('property="og:image" content="https://walk.example.com/social-preview.png"');
  });

  it('ignores an og:url that only appears inside a comment', () => {
    const html = `<!-- <meta property="og:url" content="https://x.test/" /> -->\n${HTML}`;
    const out = applySiteUrl(html, SITE);
    expect(out).toContain('<meta property="og:url" content="https://walk.example.com/" />');
  });

  it('warns when the site URL is set but no image tag matches', () => {
    const warn = vi.fn();
    const html = '<head><title>x</title></head>';
    const out = applySiteUrl(html, SITE, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(out).toContain('<meta property="og:url" content="https://walk.example.com/" />\n</head>');
  });
});
