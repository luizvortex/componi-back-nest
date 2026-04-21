# Componi — Frontend Design Brief

> Single-file prompt ready to paste into Claude Design (or any capable LLM
> that outputs React/Tailwind). Everything the model needs — product,
> audience, voice, tokens, screens — without fluff.

---

## 1. Product in one line

Componi is a social network for reusable UI components — think CodePen × npm × Twitter, built for the people who design and ship the web. Users publish components (code + deps), the community previews them live in a sandboxed iframe, forks them, composes them, and follows their favorite makers.

## 2. Audience

- **Primary**: frontend developers and design engineers, 22–45, globally distributed, English-fluent, dev-tool-native. They live in VS Code, Linear, and GitHub.
- **Secondary**: product designers exploring component patterns, engineering managers curating team libraries.

Design for someone who already uses Linear, Vercel, Raycast, GitHub, shadcn/ui, and v0 daily. Nothing should feel like a step down from those.

## 3. Voice

- Technical but not dry. Confident, not cocky. Playful in copy, serious in data.
- Reference tone: Linear's precision × Vercel's polish × CodePen's playfulness × GitHub's restraint.
- If a UI element isn't doing work, remove it.

## 4. Design principles

1. **The component is the hero.** Chrome disappears — preview + code own the viewport.
2. **Preview-first.** Every card renders a live-ish thumbnail. Detail pages boot the iframe before loading any meta.
3. **Zero-doubt interactions.** Every button tells you exactly what will happen before you click. No mystery-meat icons.
4. **Dark by default, light is polished.** Devs work in dark; light mode is a first-class citizen, never an afterthought.
5. **Keyboard-first.** `⌘K` everywhere, `j/k` in lists, `Esc` closes anything.
6. **Density that scales.** Tight by default, expands on focus. No decorative whitespace in data views.

## 5. Visual language

### Color tokens (HEX)

Dark mode is primary — design in dark first, adapt to light.

```
--bg-canvas        dark #0A0B0D   light #FAFAFA
--bg-surface       dark #12141A   light #FFFFFF
--bg-elevated      dark #1A1D24   light #F4F4F5
--border-subtle    dark #23262D   light #E4E4E7
--border-strong    dark #2E323B   light #D4D4D8
--fg-primary       dark #F5F5F7   light #0A0A0A
--fg-secondary     dark #A1A1AA   light #52525B
--fg-muted         dark #71717A   light #71717A
--accent           #7C3AED  (electric violet — one accent, used sparingly for hero actions)
--accent-fg        #FFFFFF
--success          dark #34D399   light #059669
--warn             dark #F59E0B   light #D97706
--danger           dark #F87171   light #DC2626
```

Rule: one accent, one job. Violet is reserved for primary actions, selection states, and the "fork" gesture. Never as a background fill for whole sections.

### Typography

- **UI**: Inter, fallback `-apple-system, system-ui`. Heading tracking `-0.02em`.
- **Code**: Geist Mono or JetBrains Mono, ligatures on.
- **Scale (px)**: 12 / 13 / 14 (body) / 16 / 20 / 28 / 40.
- **Line-height**: 1.45 body, 1.15 display.

### Space & radius

- 4px grid. Default component inner padding 12 / 16.
- Radius: `4px` chips, `6px` inputs, `8px` cards, `12px` modals. Pill only for tags + avatars.

### Elevation

- Dark mode: no drop shadows. Use `border-subtle` → `border-strong` to separate layers.
- Light mode: single soft shadow `0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)` on cards only.

### Motion

- 120ms state changes, 180ms layout shifts, 240ms page transitions.
- Spring only for modal enter/exit.
- Respect `prefers-reduced-motion` — reduce to fades at 80ms.

### Iconography

- Lucide. 16px inline, 20px in nav. 1.5px strokes.

## 6. Information architecture

```
/                          Home feed (logged-in: following + trending; logged-out: trending + sign-in CTA)
/explore                   Faceted grid (framework, category, tag, sort)
/new                       Publish flow (editor left, preview right)
/c/:author/:slug           Component detail
/c/:author/:slug/lineage   Fork lineage tree
/u/:username               Profile (Components / Collections / Likes / Forks tabs)
/collections/:id           Collection detail
/notifications
/settings
```

Global Cmd-K overlay is reachable from any route.

## 7. Surfaces to design (in priority order)

### 7.1 Home feed (logged-in)

Two-column layout at ≥ 1024px, single column below.

- **Left column (2/3 width)**: feed of component cards. Each card shows:
  - Live preview iframe at 16:10 ratio (lazy-mounted via IntersectionObserver).
  - Author avatar + username + relative time (top-left overlay).
  - Title + 1-line description (below preview).
  - Actions row: like, favorite, fork, share, comment count. All 32px targets.
  - Tag chips + framework badge.
- **Right column (1/3)**: "Trending this week" (compact list, 6 items), "People to follow" (3 items).
- Sticky top bar: logo, `⌘K` search pill, `+ New` primary button, avatar menu.

Empty state for new users: single component card-shaped skeleton with copy "Follow someone — or publish your first component."

### 7.2 Component detail

- **Hero**: preview iframe, edge-to-edge on mobile, rounded `12px` on desktop, framework + dependency count in a subtle overlay chip (top-right).
- **Tab bar under hero**: Preview · Code · Dependencies · Lineage · Discussion.
  - **Code tab**: Monaco read-only, file picker if multi-file, copy + download buttons.
  - **Dependencies tab**: list of packages with version badges, one-click "copy install command" for npm/pnpm/yarn.
  - **Lineage tab**: horizontal git-style tree. Each node = 80px rounded preview thumbnail with author avatar tucked into a corner. Click to navigate. Arrows indicate fork direction. Current component is highlighted with accent ring.
  - **Discussion tab**: threaded comments, collapsed-by-default deep threads.
- **Side rail (desktop)**: author card with follow button, metric tiles (likes, favorites, forks, views), tag chips, "Composed of" placeholder (future), version selector dropdown.
- **Floating action bar on mobile**: Like · Fork · Share.

### 7.3 Publish flow (/new)

- Split pane: Monaco on left (60%), live preview iframe on right (40%).
- Preview reloads on 500ms debounce after code change, with a subtle top-progress bar.
- Bottom sticky bar: `[Name input] [Framework dropdown] [+ Tag chips] [Public/Private toggle] [Publish →]`.
- Pre-publish validation shown inline: "Your dependencies contain 3 unpinned versions — publish anyway?"
- Reuse the same layout for "Edit" and "Publish v2" with a changelog textarea appearing above the publish button.

### 7.4 Profile

- Hero strip: cover (subtle gradient from user's most-used tag palette, or user-uploaded), avatar 96px overlapping, name + @username + pronouns, bio, website, follow button, "message" (future).
- Metric strip: followers / following / components / forks received.
- Tabs: Components · Collections · Likes · Forks (things they forked).
- Grid (3 col desktop, 2 col tablet, 1 col mobile) of the same component card as the feed, but more compact.

### 7.5 Cmd-K global search

- Centered modal, 560px wide, max-height 60vh.
- Input at top, recent searches chip row below, then categorized results:
  - Components (with tiny preview)
  - People (avatar + name + @username)
  - Tags (hashtag chip)
  - Actions (Create new, Go to profile, Toggle theme, View notifications)
- `↑/↓` navigates, `Enter` selects, `Esc` closes.
- Empty state: "Type to search · Try `react modal` or `/new`".

## 8. Signature moments — make these pop

- **Live-preview card hover**: subtle frame activation — border brightens from `--border-subtle` to `--border-strong`, iframe gets a barely-perceptible 1px glow with the accent at 20% opacity. The iframe only boots once the card enters the viewport.
- **Fork button**: triggers a 180ms scale-pulse on the source card, then a full-bleed toast with a live-updating preview of the new fork being created. Success state reveals a "Open →" link.
- **Fork lineage tree**: nodes connect with SVG curves in `--border-strong`, the active node has a 2px accent ring, hovering a node dims the rest of the tree to 40% opacity.
- **⌘K**: open animation is a quick 160ms scale + fade from 0.96 → 1.0 + slight downward translate. Input autofocuses.
- **Empty states**: one Lucide icon, one headline sentence, one CTA button. No illustrations, no emojis.

## 9. Accessibility (non-negotiable)

- WCAG AA for all text, including disabled and placeholder.
- All interactive targets ≥ 32px hit area (visually smaller is fine with invisible padding).
- Focus rings always visible: 2px solid accent, 2px offset, `border-radius` matching the element.
- Tab order matches visual order. Modals trap focus. `Escape` closes.
- Respect `prefers-reduced-motion` — replace all non-state animations with fades at 80ms.
- Every icon-only button has an `aria-label`. Every preview iframe has a `title`.

## 10. Anti-patterns (do NOT do)

- Carousel heroes on marketing pages.
- Skeuomorphic "code editor" visuals on the landing page (Monaco handles the real thing).
- Gradients beyond the single cover image per profile.
- Emoji-laden empty states.
- Gamification badges in the top nav. Streaks live deep in the profile, never front-and-center.
- Fake blurred-out "preview skeletons" that don't match the real content shape.

## 11. Implementation constraints

- **Framework**: Next.js 14 App Router, TypeScript strict.
- **Styling**: Tailwind CSS with a tokens layer matching §5.
- **Primitives**: shadcn/ui (Radix under the hood). Customize heavily; don't ship defaults.
- **Motion**: Framer Motion only where springs matter; plain CSS transitions elsewhere.
- **Code editor**: `@monaco-editor/react`.
- **Preview runtime**: `sucrase` transforming the stored `code` string, mounted into a sandboxed `<iframe sandbox="allow-scripts">`.
- **Data**: REST against `https://api.componi.dev/api/v1` (see OpenAPI at `/api/v1/docs`). Auth via Supabase JWT in the `Authorization` header.

## 12. Deliverables expected from Claude Design

Generate production-ready React components (TSX + Tailwind) for:

1. `HomeFeed` (logged-in variant) with the two-column layout and at least 6 populated cards of varying aspect ratios.
2. `ComponentDetailPage` — hero preview, tab bar, "Lineage" tab showing a tree with 2 ancestors and 3 descendants.
3. `PublishFlow` — Monaco left, live preview right, sticky bottom bar with all fields and the pre-publish validation warning.
4. `ProfilePage` — hero, metric strip, Components tab with 9 cards.
5. `CommandPalette` — Cmd-K modal with all 4 result categories populated.

Ship both dark and light mode for (1) and (2). Use only the tokens defined in §5. Include a single `tokens.css` file exporting the CSS variables so the design handoff is self-contained.

---

## Hand-off note to Claude Design

When in doubt, side with restraint: fewer words, fewer icons, one accent, sharper focus rings. The community we're building is allergic to "enterprise SaaS" aesthetics and to "playful-startup with four-color gradient" aesthetics. We want *tool-that-pros-use*: Linear-grade precision with CodePen's love for the craft.
