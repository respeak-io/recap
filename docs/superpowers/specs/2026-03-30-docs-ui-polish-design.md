# Docs UI Polish: Sidebar Redesign + Shiki Code Highlighting

## Summary

Two targeted improvements to the public-facing docs display (`/[projectSlug]/*`):

1. Redesign the sidebar navigation to be cleaner and more structured (inspired by fumadocs)
2. Replace lowlight/highlight.js code block rendering with Shiki for better visual quality

## Scope

**In scope:**
- `components/docs/sidebar.tsx` — full redesign
- `components/docs/article-renderer.tsx` — swap code block highlighting

**Out of scope:**
- Article content rendering (Tiptap JSON pipeline unchanged)
- TOC, search dialog, video player, analytics tracker
- Dashboard/editor pages
- Content storage or API changes

## 1. Sidebar Redesign

### Current State

- Flat list of articles grouped under uppercase chapter headers
- Search bar and language selector between logo and nav
- Active item: full background highlight with `bg-accent`
- No collapsible sections
- File: `components/docs/sidebar.tsx`

### Target State

**Layout (top to bottom):**
1. Project logo/name (sticky top)
2. Search bar
3. Collapsible chapter navigation
4. Language selector (pinned to bottom)

**Collapsible chapters:**
- Each chapter is a clickable header with a chevron icon
- Chevron points right when collapsed, down when expanded
- Default state: first chapter expanded, rest collapsed
- Auto-expand: the chapter containing the currently active article is always expanded
- Smooth expand/collapse transition (CSS `grid-template-rows` trick or similar)

**Active state styling:**
- Left border accent: 2px colored left border using the project's primary/accent color
- Subtle tinted background (e.g. `bg-primary/5`)
- Medium font weight on active item
- Inactive items: muted foreground, no border, hover shows subtle background

**Chapter headers:**
- Uppercase, small font, semibold, muted color (keep existing pattern)
- Chevron icon (lucide `ChevronRight`) inline before the text
- Clickable to toggle expand/collapse
- Subtle hover state

**Language selector:**
- Move from between search and nav to pinned at sidebar bottom
- Use `mt-auto` or similar to push to bottom of the flex column
- Keep existing `Select` component and flag display

**Responsive:**
- Mobile sheet behavior unchanged — same redesign applies inside the `SheetContent`

### State Management

- `expandedChapters: Set<string>` — track which chapters are expanded
- Initialize: first chapter ID + chapter containing active article
- Toggle on chapter header click
- Update on route change (auto-expand active article's chapter)

## 2. Shiki Code Highlighting

### Current State

- Uses `lowlight` (highlight.js) in `article-renderer.tsx`
- Client-side highlighting via `createLowlight(common)` + `toHtml()`
- Limited theme options, basic highlighting quality
- File: `components/docs/article-renderer.tsx`

### Target State

- Replace `lowlight` + `hast-util-to-html` with `shiki/bundle/web`
- Use `github-light` / `github-dark` dual themes
- Lazy-load Shiki on first code block encounter to avoid bundle bloat
- Client-side rendering (stays in `ArticleRenderer`, no architectural change)

### Implementation

- Import `codeToHtml` from `shiki/bundle/web` (smaller than full bundle, includes common languages)
- Highlight in a `useEffect` or use a small `<ShikiCodeBlock>` client component with `useState` for the highlighted HTML
- Apply `github-light` theme by default, `github-dark` when `dark` class is present
- Fall back to plain `<code>` while Shiki loads (no flash — code is still readable)

### Dependencies

- Add: `shiki`
- Remove: `hast-util-to-html` (only used in article-renderer)
- Keep: `lowlight` stays in package.json — `@tiptap/extension-code-block-lowlight` (editor) depends on it

## Files Changed

| File | Change |
|------|--------|
| `components/docs/sidebar.tsx` | Full redesign — collapsible chapters, left border active state, language selector at bottom |
| `components/docs/article-renderer.tsx` | Replace lowlight code block with Shiki `<ShikiCodeBlock>` component |
| `package.json` | Add `shiki`, remove `lowlight` + `hast-util-to-html` |

## Testing

- Visual: verify sidebar renders correctly with 1+ chapters, active state tracks navigation
- Collapse/expand: click chapter headers, verify animation, verify auto-expand on navigation
- Language selector: verify it works from bottom position
- Mobile: verify sheet sidebar has same redesign
- Code blocks: verify Shiki renders with correct theme in light/dark mode
- Fallback: verify code blocks render plain text before Shiki loads
