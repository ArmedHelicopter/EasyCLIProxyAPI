import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss, { type Declaration } from 'postcss';
import { themeTokenProperties } from '../src/themes/types';

const srcRoot = join(import.meta.dir, '..', 'src');

const EXCLUDED_DIRECTORIES = [
  {
    path: 'styles/tokens',
    reason: 'Token definitions layer where baseline palettes, semantic colors, and component tokens are authored',
  },
  {
    path: 'mocks',
    reason: 'Browser mock preview environment only; dev toolbar overlay not loaded in production desktop application',
  },
];

const REGISTERED_THEME_VARIABLES = new Set([
  ...Object.values(themeTokenProperties).flat().filter((name) => name.startsWith('--theme-')),
  '--theme-backdrop-image',
  '--theme-backdrop-color',
  '--theme-backdrop-sidebar',
  '--theme-backdrop-panel',
  '--theme-sticky-background',
  '--theme-sticky-hover-background',
  '--theme-overlay-surface',
  '--theme-overlay-soft-surface',
  '--theme-overlay-hover-background',
  '--theme-scrollbar-thumb',
  '--theme-scrollbar-hover',
]);

const NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque',
  'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue',
  'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan',
  'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey',
  'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey',
  'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
  'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink',
  'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey',
  'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
  'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin',
  'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered',
  'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple',
  'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
  'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue',
  'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue',
  'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat',
  'white', 'whitesmoke', 'yellow', 'yellowgreen',
]);

const ALLOWED_KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'none']);

interface WhitelistEntry {
  file: string;
  selector: string;
  value: string;
  reason: string;
}

const WHITELIST: WhitelistEntry[] = [];

function canPropertyTakeColor(prop: string): boolean {
  const p = prop.toLowerCase();
  if (p.startsWith('--')) return true;
  if (/^(animation|font|grid|counter|container|view-transition|columns|column-count|column-width|column-gap|gap|row-gap|z-index|opacity|order|flex|overflow|display|visibility|clip|cursor|user-select|resize|transform|transition|width|height|min-|max-|margin|padding|top|right|bottom|left|align-|justify-|place-)/.test(p)) {
    if (/color|shadow|fill|stroke|border|outline|image|background/.test(p)) {
      return true;
    }
    return false;
  }
  return true;
}

function unescapeCss(str: string): string {
  return str.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|([\s\S]))/g, (_, hex: string | undefined, char: string | undefined) => {
    if (hex) {
      const code = Number.parseInt(hex, 16);
      if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) {
        return '\uFFFD';
      }
      return String.fromCodePoint(code);
    }
    return char ?? '';
  });
}

function scanValueTokens(prop: string, val: string): string[] {
  const violations: string[] = [];
  const checkColor = canPropertyTakeColor(prop);

  let i = 0;
  const n = val.length;

  while (i < n) {
    if (/[\s,;/]/.test(val[i])) {
      i += 1;
      continue;
    }

    if (val[i] === '"' || val[i] === "'") {
      const quote = val[i];
      i += 1;
      while (i < n && val[i] !== quote) {
        if (val[i] === '\\') i += 1;
        i += 1;
      }
      if (i < n) i += 1;
      continue;
    }

    if (val[i] === '[') {
      let depth = 1;
      i += 1;
      while (i < n && depth > 0) {
        if (val[i] === '"' || val[i] === "'") {
          const q = val[i];
          i += 1;
          while (i < n && val[i] !== q) {
            if (val[i] === '\\') i += 1;
            i += 1;
          }
          if (i < n) i += 1;
          continue;
        }
        if (val[i] === '[') depth += 1;
        else if (val[i] === ']') depth -= 1;
        i += 1;
      }
      continue;
    }

    if (val.slice(i, i + 4).toLowerCase() === 'url(') {
      i += 4;
      let depth = 1;
      while (i < n && depth > 0) {
        if (val[i] === '"' || val[i] === "'") {
          const q = val[i];
          i += 1;
          while (i < n && val[i] !== q) {
            if (val[i] === '\\') i += 1;
            i += 1;
          }
          if (i < n) i += 1;
          continue;
        }
        if (val[i] === '(') depth += 1;
        else if (val[i] === ')') depth -= 1;
        i += 1;
      }
      continue;
    }

    const start = i;
    while (i < n && !/[\s,;()[\]"']/.test(val[i])) {
      if (val[i] === '\\') {
        i += 1;
        while (i < n && /[0-9a-fA-F]/.test(val[i])) i += 1;
        if (i < n && /[ \t\r\n\f]/.test(val[i])) i += 1;
      } else {
        i += 1;
      }
    }
    const token = val.slice(start, i);

    if (i < n && val[i] === '(') {
      const fnName = unescapeCss(token).toLowerCase();
      i += 1;
      let depth = 1;
      const bodyStart = i;
      while (i < n && depth > 0) {
        if (val[i] === '"' || val[i] === "'") {
          const q = val[i];
          i += 1;
          while (i < n && val[i] !== q) {
            if (val[i] === '\\') i += 1;
            i += 1;
          }
          if (i < n) i += 1;
          continue;
        }
        if (val[i] === '(') depth += 1;
        else if (val[i] === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
        i += 1;
      }
      const fnBody = val.slice(bodyStart, i);
      if (i < n && val[i] === ')') i += 1;

      if (fnName === 'var') {
        const commaIdx = fnBody.indexOf(',');
        const rawVar = (commaIdx === -1 ? fnBody : fnBody.slice(0, commaIdx)).trim();
        const unescapedVar = unescapeCss(rawVar);
        if (unescapedVar.startsWith('--theme-') && !REGISTERED_THEME_VARIABLES.has(unescapedVar)) {
          violations.push(`unregistered theme variable reference: ${unescapedVar}`);
        }
        if (commaIdx !== -1) {
          violations.push(...scanValueTokens(prop, fnBody.slice(commaIdx + 1).trim()));
        }
      } else {
        const isColorFn = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/.test(fnName);
        if (isColorFn) {
          if (/^\s*from\s+/i.test(fnBody)) {
            violations.push(...scanValueTokens(prop, fnBody.replace(/^\s*from\s+/i, '')));
          } else if (checkColor) {
            violations.push(`color literal function: ${token}(${fnBody})`);
          }
        } else {
          violations.push(...scanValueTokens(prop, fnBody));
        }
      }
      continue;
    }

    if (token.startsWith('#')) {
      if (checkColor && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(token)) {
        violations.push(`color literal hex: ${token}`);
      }
      continue;
    }

    if (token) {
      const unescaped = unescapeCss(token);
      if (unescaped.startsWith('--theme-')) {
        if (!REGISTERED_THEME_VARIABLES.has(unescaped)) {
          violations.push(`unregistered theme variable reference: ${unescaped}`);
        }
        continue;
      }

      if (checkColor) {
        const lower = unescaped.toLowerCase();
        if (NAMED_COLORS.has(lower) && !ALLOWED_KEYWORDS.has(lower)) {
          violations.push(`named color literal: ${lower}`);
        }
      }
    }
  }

  return violations;
}

function walkCss(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkCss(full);
    }
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

function getSelector(decl: Declaration): string {
  if (decl.parent?.type === 'rule' && 'selector' in decl.parent && typeof decl.parent.selector === 'string') {
    return decl.parent.selector;
  }
  return decl.parent?.type ?? 'unknown';
}

function findViolationsInDecl(relPath: string, decl: Declaration): string[] {
  const violations: string[] = [];
  const line = decl.source?.start?.line ?? 0;
  const selector = getSelector(decl);
  const prop = decl.prop;
  const value = decl.value;

  if (decl.important) {
    violations.push(`${relPath}:${line} [${selector}] ${prop}: ${value} !important (forbidden !important)`);
  }

  if (prop.startsWith('--theme-')) {
    const unescapedProp = unescapeCss(prop);
    if (!REGISTERED_THEME_VARIABLES.has(unescapedProp)) {
      violations.push(`${relPath}:${line} [${selector}] ${prop}: ${value} (unregistered theme variable declaration)`);
    }
  }

  const isWhitelisted = WHITELIST.some((entry) => {
    if (entry.file !== relPath) return false;
    if (entry.selector && !selector.includes(entry.selector)) return false;
    return value.includes(entry.value);
  });
  if (isWhitelisted) {
    return violations;
  }

  const valueViolations = scanValueTokens(prop, value);
  for (const violation of valueViolations) {
    violations.push(`${relPath}:${line} [${selector}] ${prop}: ${value} (${violation})`);
  }

  return violations;
}

export function scanCssViolations(cssText: string, relPath: string): string[] {
  const ast = postcss.parse(cssText, { from: relPath });
  const violations: string[] = [];
  ast.walkDecls((decl) => {
    violations.push(...findViolationsInDecl(relPath, decl));
  });
  return violations;
}

describe('CSS tokenization and theme variable lint', () => {
  it('prohibits color literals, unregistered --theme-* variables, and !important outside tokens layer', () => {
    const allFiles = walkCss(srcRoot);
    const nonExcludedFiles = allFiles.filter((filePath) => {
      const rel = relative(srcRoot, filePath).replaceAll('\\', '/');
      return !EXCLUDED_DIRECTORIES.some((exc) => rel === exc.path || rel.startsWith(`${exc.path}/`));
    });

    const allViolations: string[] = [];
    for (const filePath of nonExcludedFiles) {
      const relPath = relative(srcRoot, filePath).replaceAll('\\', '/');
      const css = readFileSync(filePath, 'utf8');
      allViolations.push(...scanCssViolations(css, relPath));
    }

    expect(allViolations).toEqual([]);
  });

  it('tolerates non-color identifiers, strings, urls, and token-derived relative colors', () => {
    const negativeCases = [
      'background: url("icons.svg#abcdef");',
      'background: url("--theme-abcdef.svg");',
      'background: url(white.svg);',
      'background: URL(white.svg);',
      'content: "white #abcdef rgba(0,0,0,.5) --theme-abcdef";',
      'animation-name: red;',
      'animation: red 1s ease;',
      'font-family: "Black", sans-serif;',
      'font: 12px Black;',
      'grid-template-areas: "white red";',
      'grid-template-columns: [red] 1fr [blue];',
      'color: rgb(from var(--color-text-primary) r g b);',
      'color: var(--color-text-primary);',
      'color: var(--theme-\\73 urface);',
      '--probe: \\ffffff;',
      'color: transparent;',
      'color: currentColor;',
    ];

    for (const snippet of negativeCases) {
      expect(scanCssViolations(`.sample { ${snippet} }`, 'sample.css')).toEqual([]);
    }
  });

  it('detects color literals in var fallbacks, modern color functions, and escaped names', () => {
    expect(scanCssViolations('.sample { color: var(--color-text-primary, white); }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: var(--color-text-primary, white) (named color literal: white)',
    ]);

    expect(scanCssViolations('.sample { color: var(--color-text-primary, #123456); }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: var(--color-text-primary, #123456) (color literal hex: #123456)',
    ]);

    expect(scanCssViolations('.sample { color: var(--color-text-primary, rgba(0,0,0,.5)); }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: var(--color-text-primary, rgba(0,0,0,.5)) (color literal function: rgba(0,0,0,.5))',
    ]);

    expect(scanCssViolations('.sample { color: var(--foo, var(--theme-abcdef)); }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: var(--foo, var(--theme-abcdef)) (unregistered theme variable reference: --theme-abcdef)',
    ]);

    expect(scanCssViolations('.sample { color: var(--theme-\\61 bcdef); }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: var(--theme-\\61 bcdef) (unregistered theme variable reference: --theme-abcdef)',
    ]);

    expect(scanCssViolations('.sample { color: r\\67 b(1 2 3); }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: r\\67 b(1 2 3) (color literal function: r\\67 b(1 2 3))',
    ]);

    expect(scanCssViolations('.sample { color: color(srgb 1 0 0); }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: color(srgb 1 0 0) (color literal function: color(srgb 1 0 0))',
    ]);

    expect(scanCssViolations('.sample { color: r\\65 d; }', 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: r\\65 d (named color literal: red)',
    ]);
  });

  it('mutates on hex color literal, rgba color literal, and unregistered theme variable', () => {
    const hexSample = '.sample { color: #123456; }';
    expect(scanCssViolations(hexSample, 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: #123456 (color literal hex: #123456)',
    ]);

    const rgbaSample = '.sample { background: rgba(0, 0, 0, 0.5); }';
    expect(scanCssViolations(rgbaSample, 'sample.css')).toEqual([
      'sample.css:1 [.sample] background: rgba(0, 0, 0, 0.5) (color literal function: rgba(0, 0, 0, 0.5))',
    ]);

    const unregisteredThemeVarSample = '.sample { color: var(--theme-abcdef); }';
    expect(scanCssViolations(unregisteredThemeVarSample, 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: var(--theme-abcdef) (unregistered theme variable reference: --theme-abcdef)',
    ]);

    const importantSample = '.sample { color: var(--color-text-primary) !important; }';
    expect(scanCssViolations(importantSample, 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: var(--color-text-primary) !important (forbidden !important)',
    ]);

    const namedColorSample = '.sample { color: white; }';
    expect(scanCssViolations(namedColorSample, 'sample.css')).toEqual([
      'sample.css:1 [.sample] color: white (named color literal: white)',
    ]);
  });
});
