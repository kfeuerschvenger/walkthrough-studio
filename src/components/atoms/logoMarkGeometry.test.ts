import { describe, expect, it } from 'vitest';
import faviconSvg from '../../../public/favicon.svg?raw';
import markColorSvg from '../../../docs/assets/brand/mark-color.svg?raw';
import markMonoSvg from '../../../docs/assets/brand/mark-mono.svg?raw';
import { LOGO_MARK_GEOMETRY } from './logoMarkGeometry';

/** Every `d` attribute of the SVG, in document order. */
function pathData(svg: string): string[] {
  return [...svg.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)].map((m) => m[1]);
}

const { edges, wall } = LOGO_MARK_GEOMETRY;

describe('brand mark assets', () => {
  it.each([
    ['public/favicon.svg', faviconSvg],
    ['docs/assets/brand/mark-color.svg', markColorSvg],
  ])('%s carries the component geometry', (_name, svg) => {
    expect(pathData(svg)).toEqual([...edges, wall]);
  });

  it('docs/assets/brand/mark-mono.svg carries the component geometry', () => {
    const data = pathData(markMonoSvg);
    // The mono mark draws the wall twice: once as the mask cut-out, once filled.
    expect(data).toEqual([wall, ...edges, wall]);
  });
});
