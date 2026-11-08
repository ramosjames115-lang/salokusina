import DOMPurify, { type Config } from 'dompurify';

// The recipe editor embeds images/videos as data: URLs and YouTube links as
// <iframe>s, neither of which DOMPurify allows by default - everything else
// stays default-strict (no <script>, no inline event handlers, etc).
const SANITIZE_CONFIG: Config = {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target'],
};

// Strips any executable content (script tags, event handlers, javascript:
// URLs, etc.) from recipe HTML before it's stored or rendered. Recipe
// content comes from other users' contenteditable input, so it must never
// be trusted as-is - see recipe-editor.page.ts and recipe-detail.page.ts.
export function sanitizeRecipeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
