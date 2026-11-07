// For skill pages opened straight from disk (no server: the audition page, listening pages): the design system's
// stylesheet with its fonts pointed at this folder by file URL, and the logo header the served pages use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEME_TOGGLE } from './theme.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = pathToFileURL(HERE).href;

/** ui.css with /ui/ URLs made absolute file URLs, for a page opened as a file. */
export function uiCssInline() {
  return fs.readFileSync(path.join(HERE, 'ui.css'), 'utf8').replaceAll('url("/ui/', `url("${base}/`);
}

/** The logo header (light and dark colourways), with file URLs. */
export function udHeadInline() {
  return `<header class="ud-head"><img class="ud-logo ud-logo--light" src="${base}/logos/ultrademo-horizontal-flow-light.svg" alt="Ultrademo" width="168" height="28"><img class="ud-logo ud-logo--dark" src="${base}/logos/ultrademo-horizontal-flow-dark.svg" alt="" width="168" height="28">${THEME_TOGGLE}</header>`;
}
