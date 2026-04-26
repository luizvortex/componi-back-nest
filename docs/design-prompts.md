# Componi — Claude Design Page Prompts

> One prompt per page. Each is self-contained — paste directly into Claude Design.
> All prompts share the same token set and constraints defined in §TOKEN SYSTEM below.

---

## TOKEN SYSTEM (include in every prompt or reference via design system)

```
Product: Componi — social network for reusable UI components (CodePen × npm × Twitter for devs).
Stack: Next.js 14 App Router + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion.
Auth: Supabase JWT (GitHub, Google, email). API base: https://api.componi.dev/api/v1

COLOR TOKENS — Dark mode (default):
  --bg-canvas:     #0A0B0D
  --bg-surface:    #12141A
  --bg-elevated:   #1A1D24
  --border-subtle: #23262D
  --border-strong: #2E323B
  --fg-primary:    #F5F5F7
  --fg-secondary:  #A1A1AA
  --fg-muted:      #71717A
  --accent:        #8B1A2F   ← vermelho vinho, ONE accent, hero actions only
  --accent-hover:  #A31F37
  --accent-muted:  #3D0B14
  --accent-fg:     #FFFFFF
  --success:       #34D399
  --warn:          #F59E0B
  --danger:        #F87171

COLOR TOKENS — Light mode:
  --bg-canvas:     #FAFAFA
  --bg-surface:    #FFFFFF
  --bg-elevated:   #F4F4F5
  --border-subtle: #E4E4E7
  --border-strong: #D4D4D8
  --fg-primary:    #0A0A0A
  --fg-secondary:  #52525B
  --fg-muted:      #71717A
  --accent:        #8B1A2F   ← same hex, 4.8:1 contrast on white, passes AA
  --accent-hover:  #701525
  --accent-muted:  #F9E5E8
  --accent-fg:     #FFFFFF
  --success:       #059669
  --warn:          #D97706
  --danger:        #DC2626

THEMING: data-theme="dark" (default) | data-theme="light" — CSS var overrides.

TYPOGRAPHY: Inter (UI), Geist Mono (code). Scale px: 12/13/14/16/20/28/40. 
SPACING: 4px grid. Inner padding: 12/16px. 
RADIUS: 4px chips · 6px inputs · 8px cards · 12px modals.
ICONS: Lucide — 16px inline, 20px nav, 1.5px stroke.
MOTION: 120ms state · 180ms layout · 240ms page. Spring only for modal enter/exit.
ELEVATION dark: borders only, no shadows. Light: 0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04) on cards.
ACCENT RULE: --accent (#8B1A2F) is reserved for primary CTAs, selection rings, and the fork gesture. Never as section backgrounds.
A11Y: WCAG AA all text. Focus rings: 2px solid --accent, 2px offset. Hit targets ≥ 32px. Modals trap focus. Esc closes.
```

---

## PROMPT 1 — Home Feed (logged-in)

```
Design the logged-in Home Feed for Componi — a social network for reusable UI components.
The layout feel is Instagram-inspired: single centered column, visually dominant previews,
author info above the card, actions below, bottom navigation bar. Tool-grade aesthetics.

Use the token system defined above. Deliver BOTH dark and light variants.

OVERALL STRUCTURE
  Mobile-first single column, max-w-[470px] centered on desktop.
  bg-canvas fills the page. No sidebars. Content breathes.

STICKY TOP BAR (height 52px, bg-canvas/90 backdrop-blur, border-b border-subtle)
  Left: "Componi" wordmark fg-primary Inter bold 18px.
  Right (flex gap-2): 
    Search icon button (Lucide Search, 24px, fg-primary, 40px tap target).
    Bell icon button (Lucide Bell, 24px, fg-primary) + unread badge "3" (bg-accent rounded-full 16px accent-fg 10px, top-right of icon).

STORIES ROW (horizontal scroll, px-4 py-3, gap-3, no scrollbar, border-b border-subtle)
  "Your story" bubble first: avatar 56px circle with dashed border-2 border-subtle + "+" icon overlay (bg-accent rounded-full 16px, bottom-right) + label "You" fg-muted 11px below.
  Then 5 creator bubbles (avatar 56px, ring-2 ring-accent when unread/new, label @username 11px fg-secondary below, truncate):
    @sarah_dev · @carlosm · @priya_ui · @felix · @anya
  Unread ring: 2px ring in --accent (#8B1A2F), 2px offset white/canvas gap.

FEED (flex flex-col, divide-y divide-border-subtle)
Show 3 full posts:

POST STRUCTURE (py-4):
  HEADER ROW (px-4, flex items-center gap-3, mb-3):
    Avatar 36px circle.
    Author info: displayName fg-primary 13px semibold + "@username · 2h ago" fg-muted 12px stacked.
    Framework badge right-aligned (pill, bg-elevated, border-subtle, fg-secondary 12px, px-2 py-0.5, rounded-full): "React".
    ··· Lucide MoreHorizontal button 32px fg-muted.

  PREVIEW AREA (full-width, no horizontal padding, aspect-ratio 4/3):
    bg-elevated, shows a realistic sketch of the UI component (shapes, colors, no real code).
    No border-radius (edge-to-edge like Instagram). 
    Double-tap heart animation hint: faint heart icon centered, opacity-0 (only appears on double-tap).

  ACTIONS ROW (px-4, pt-3, flex items-center gap-4):
    Left group (gap-4):
      ♥ Heart icon (Lucide Heart, 24px) + count "1.2k" fg-secondary 13px. Filled accent (#8B1A2F) when liked.
      💬 Comment icon (Lucide MessageCircle, 24px, fg-primary) + count "34".
      ⑂ Fork icon (Lucide GitFork, 24px, fg-primary) + count "89".
      Share icon (Lucide Share2, 24px, fg-primary).
    Right: ★ Bookmark (Lucide Bookmark, 24px, fg-primary) — filled when favorited.

  COMPONENT INFO (px-4, pt-1):
    Title: displayName fg-primary 13px semibold + component name fg-primary 13px. E.g. "luiz  Command Palette".
    Description: fg-secondary 13px, max 2 lines, "See more" fg-muted link if truncated.
    Tags row (mt-1, flex gap-1.5, flex-wrap): chip pills bg-elevated border-subtle fg-secondary 12px radius-4px. e.g. #search #keyboard #modal.
    "View 34 comments" fg-muted 13px mt-1 (link).
    Timestamp "2 HOURS AGO" fg-muted 10px uppercase tracking-wider mt-1.

POST DATA:
  Post 1: @luiz · "Command Palette" · React · tags: search, keyboard, modal · ♥ 1.2k · 💬 34 · ⑂ 89. Liked state (heart filled accent).
  Post 2: @sarah_dev · "Animated Tab Bar" · React · tags: animation, tabs, framer · ♥ 876 · 💬 21 · ⑂ 45.
  Post 3: @carlosm · "Multi-Step Form" · Vue · tags: forms, validation · ♥ 543 · 💬 12 · ⑂ 23.

BOTTOM NAVIGATION BAR (fixed bottom-0, full-width, h-14, bg-canvas/95 backdrop-blur, border-t border-subtle, flex items-center justify-around px-4)
  5 items — each 40px tap target, flex flex-col items-center gap-0.5:
    🏠 Home (Lucide Home 24px) — active: filled accent icon.
    🔍 Explore (Lucide Compass 24px) — fg-muted.
    ➕ New (Lucide PlusSquare 24px) — fg-muted. On mobile this is the "publish" shortcut.
    🔔 Notifications (Lucide Bell 24px) — fg-muted + badge "3" bg-accent.
    👤 Profile (avatar 24px circle, ring-1 ring-accent when active) — active state.
  No text labels. Active icon: fg-primary or accent fill.

EMPTY STATE (show below stories if new account, no feed items):
  py-16 flex flex-col items-center gap-3 px-8 text-center:
    Lucide Compass 32px fg-muted.
    "Your feed is empty" fg-primary 16px semibold.
    "Follow creators to see their components here." fg-muted 14px.
    "Explore components →" accent button rounded-6px px-5 py-2 13px.

Deliver: dark mode (Post 1 liked, stories unread for @sarah_dev and @felix) + light mode (same content, unfollowed state). Both show the bottom nav.
```

---

## PROMPT 2 — Component Detail Page

```
Design the Component Detail Page for Componi.

Use the token system above. Deliver dark + light variants.

URL pattern: /c/:author/:slug — example: /c/luiz/command-palette

STICKY TOP BAR — same as Home Feed prompt.

HERO (below topbar)
  Preview iframe area: full-width on mobile, max-w-5xl centered on desktop, aspect ratio 16:9, rounded-12px on desktop. bg-elevated placeholder with a realistic UI sketch (command palette interface with search input and results list). 
  Top-right overlay chip: "React · 3 deps" (bg-elevated/80% backdrop, border-subtle, fg-secondary 12px, px-3 py-1, rounded-full).
  Bottom-right: "↗ Open in new tab" ghost icon button 32px.

TAB BAR (mt-4, border-b border-subtle, gap-6)
  Tabs: Preview · Code · Dependencies · Lineage · Discussion
  Active tab: fg-primary, border-b-2 border-accent (--accent #8B1A2F). Inactive: fg-muted. No background fill on active.

TAB CONTENT — show "Lineage" tab as active:

  LINEAGE TAB
  Horizontal scrollable tree. Show: 2 ancestors + current component (highlighted) + 3 descendants.
  Tree nodes connect with SVG curves in --border-strong color.
  Each node: 80px × 80px rounded-8px preview thumbnail (bg-elevated with mini UI sketch). Author avatar 20px tucked bottom-right corner of thumbnail. Component name fg-primary 12px below thumbnail. Fork count fg-muted 11px.
  Current node: 2px solid --accent ring, scale 1.05, z-10.
  Hover on non-current nodes: other nodes dim to 40% opacity (transition 120ms).
  Ancestors are to the left, descendants to the right. Arrow SVG lines indicate fork direction (→).
  Tree layout: ancestor1 → ancestor2 → [CURRENT] → desc1, desc2, desc3 (branching).

CODE TAB (show as second variant):
  Monaco editor read-only (dark bg matching --bg-canvas). File picker tabs at top if multi-file. Top-right: "Copy" + "Download" ghost buttons.

SIDE RAIL (desktop only, 280px, sticky, ml-6)
  Author card (bg-surface, border, rounded-8px, p-4):
    Avatar 48px + displayName fg-primary 14px bold + @username fg-secondary 13px + bio 2 lines fg-muted 13px.
    "Follow" button: border, rounded-6px, full-width, 36px. Active state: bg-accent accent-fg.
  
  Metrics tile row (2×2 grid, gap-2, mt-4):
    ♥ Likes: 1.2k · ★ Favorites: 340 · ⑂ Forks: 89 · 👁 Views: 14.5k
    Each tile: bg-elevated, rounded-8px, p-3, number fg-primary 16px bold, label fg-muted 12px.
  
  Tags (mt-4, flex flex-wrap gap-2):
    3 chips: #search, #keyboard, #modal
  
  Version selector (mt-4):
    Dropdown "v3 (latest)" — border, rounded-6px, full-width, fg-primary 13px.

MOBILE FLOATING ACTION BAR (fixed bottom-0, full-width, bg-surface border-t, h-14, flex):
  Like · Fork (accent-filled) · Share — three equal sections.

Deliver: Lineage tab in dark mode. Code tab in light mode.
```

---

## PROMPT 3 — Publish Flow (/new)

```
Design the Publish Flow page (/new) for Componi.

Use the token system above. Dark mode only.

STICKY TOP BAR (same as other pages) — right side shows "Save draft" ghost button + "Publish →" accent button (disabled state, reduced opacity).

SPLIT PANE LAYOUT (below topbar, full-height viewport)
  Left pane (60% width): Monaco editor
    bg-canvas, header row (file name "App.tsx" fg-muted 13px + language badge "TSX" bg-elevated fg-muted 12px).
    Editor area: realistic code snippet — a React component (e.g. command palette). Syntax highlighted: keywords accent, strings success-ish, comments fg-muted. Line numbers fg-muted 12px.
    No horizontal padding waste — editor fills the pane.
  
  Vertical resize handle: 4px wide, bg-border-subtle, hover bg-accent/30.
  
  Right pane (40%): Live preview
    Header: "Preview" fg-muted 13px + reload spinner (animated, 16px, when updating) + "Reload" ghost button.
    Preview iframe placeholder: bg-elevated, rounded-8px, margin 12px, shows the rendered component (sketch of a command palette UI).
    Top progress bar (4px, bg-accent, animated pulse): appears during the 500ms debounce reload window.

BOTTOM STICKY BAR (h-14, bg-surface, border-t, px-4, flex items-center gap-3)
  [Name input: "Component name…" 180px, border, rounded-6px, 32px height]
  [Framework dropdown: "React ▾" 120px, border, rounded-6px]
  [+ Add tags: pill button with + icon, fg-muted, border-dashed, rounded-full 32px]
  [Existing tags: "#search" "#modal" as dismissible chips]
  [Spacer grows]
  [Public toggle: label "Public" fg-secondary 13px + toggle switch, active=accent]
  [Publish → : accent button, rounded-6px, 36px, semibold]

PRE-PUBLISH VALIDATION BANNER (shown above bottom bar, bg-warn/10, border-t border-warn/30, px-4 py-2, flex items-center gap-2):
  ⚠ icon (warn color 16px) + "3 dependencies have unpinned versions — " + "publish anyway?" (accent underline link) + dismiss × button.

EDIT MODE VARIANT (show as a second frame):
  Same layout, but bottom bar shows version badge "v2" + changelog textarea (above bottom bar, 64px height, bg-elevated, border, rounded-6px, placeholder "What changed in v2?").

Deliver: New mode (with validation banner) + Edit/v2 mode. Both dark.
```

---

## PROMPT 4 — Profile Page

```
Design the Profile Page (/u/:username) for Componi.

Use the token system above. Deliver dark + light variants.

URL example: /u/luiz

STICKY TOP BAR — same pattern.

HERO STRIP (w-full, position-relative)
  Cover area: 200px height desktop / 140px mobile. Subtle gradient background derived from user's tag palette — use a very dark radial gradient from #1A0A0D to #0A0B0D (dark mode) or #FFF0F0 to #FAFAFA (light mode). Avoid bright gradients.
  Avatar: 96px circle, border-4 border-bg-canvas (cutout effect), positioned overlapping bottom of cover (-48px offset).
  Info block (mt-14, px-4 or px-0 desktop):
    displayName "Luiz Felipe" fg-primary 20px bold + @username "luiz" fg-muted 14px.
    Pronouns (optional) fg-muted 12px.
    Bio: "Design engineer. Building Componi." fg-secondary 14px, max 2 lines.
    Website link: fg-accent 13px with external link icon 14px.
  Action row (right-aligned desktop, below info mobile):
    "Follow" button border rounded-6px 32px. Active state: filled accent.
    ··· more menu ghost button.

METRIC STRIP (mt-4, flex gap-6, border-b border-subtle pb-4)
  Followers: 2.1k · Following: 340 · Components: 47 · Forks received: 312
  Each: number fg-primary 16px semibold + label fg-muted 13px. Clickable (hover underline).

TAB BAR (mt-4, gap-6, border-b border-subtle)
  Components · Collections · Likes · Forks
  Active: Components — fg-primary, border-b-2 border-accent.

COMPONENTS GRID (mt-6)
  3 columns desktop · 2 tablet · 1 mobile. gap-4.
  Show 9 compact component cards (same structure as Home Feed cards, but slightly more compact — no description line, just title + tags + actions row).
  Populate with realistic names: "Modal System", "Tooltip", "Sidebar Nav", "Badge", "Skeleton Loader", "Dropdown Menu", "Pagination", "File Upload", "Avatar Group".

Deliver: dark variant (Components tab) + light variant (Forks tab — same grid showing components they forked, with a small "forked from @original" label beneath each card title).
```

---

## PROMPT 5 — Command Palette (⌘K)

```
Design the ⌘K Command Palette overlay for Componi.

Use the token system above. Show it rendered on top of a blurred Home Feed background. Deliver dark + light.

BACKDROP: bg-canvas/60 backdrop-blur-sm, full-screen overlay. Click outside closes.

MODAL (centered, w-[560px] max-h-[60vh], bg-surface, border border-strong, rounded-12px, shadow-xl)
  Open animation: scale 0.96→1.0 + fade 0→1 + translateY -4px→0, 160ms ease-out.

TOP INPUT ROW (px-4, pt-3, pb-2, border-b border-subtle)
  Search icon (Lucide Search, 16px, fg-muted) + input (flex-1, bg-transparent, fg-primary 14px, placeholder "Search components, people… or try /new" fg-muted) + "Esc" key badge (bg-elevated, border, rounded-4px, fg-muted 12px, px-1.5).

RECENT SEARCHES (px-4, py-2, flex gap-2, flex-wrap)
  Label "Recent" fg-muted 11px uppercase tracking-wider + 3 chips: "react modal", "data table", "animation" — pill chips, bg-elevated, border-subtle, fg-secondary 12px, dismiss × on hover.

RESULTS (scrollable, px-2, pb-2)
  Section: COMPONENTS (label fg-muted 11px uppercase px-2 mb-1)
    3 rows — each: 36px height, rounded-6px, flex items-center gap-3, hover bg-elevated.
      Tiny preview thumbnail (32px × 32px, rounded-4px, bg-elevated, mini UI sketch) + component name fg-primary 13px + author @handle fg-muted 12px + framework badge fg-muted 12px right-aligned.
    Items: "Command Palette · @luiz · React" | "Animated Tab Bar · @sarah · React" | "Data Table · @priya · React"
  
  Section: PEOPLE
    2 rows — avatar 28px circle + displayName fg-primary 13px + @username fg-muted 12px + follower count fg-muted 12px right-aligned.
    Items: "Sarah Chen · @sarah_dev · 4.2k followers" | "Carlos Mendes · @carlosm · 1.8k followers"

  Section: TAGS
    2 rows — # icon fg-accent 14px + tag name fg-primary 13px + usage count fg-muted 12px right-aligned.
    Items: "#animation · 1.2k components" | "#forms · 890 components"

  Section: ACTIONS
    4 rows — Lucide icon fg-muted 16px + action label fg-primary 13px + shortcut badge right-aligned fg-muted 12px.
    Items: "Create new component" ⌘N | "Go to my profile" | "Toggle theme" | "View notifications" (with unread badge 3, bg-accent, rounded-full, 16px)

KEYBOARD NAVIGATION INDICATOR (bottom strip, px-4, py-2, border-t border-subtle, flex gap-4)
  ↑↓ navigate · Enter select · Esc close — all fg-muted 11px + key badge styling.

EMPTY STATE (when input has value but no results):
  Lucide "SearchX" icon 24px fg-muted centered + "No results for "abc"" fg-secondary 14px + "Try /new to create it." fg-muted 13px.

Deliver: dark (with results populated, 2nd item highlighted in accent bg-muted) + light (empty state variant).
```

---

## PROMPT 6 — Explore Page (/explore)

```
Design the Explore page (/explore) for Componi — faceted grid of all public components.

Use the token system above. Dark mode.

STICKY TOP BAR — same pattern.

FILTER BAR (sticky below topbar, bg-surface, border-b border-subtle, px-6 py-3, flex items-center gap-4, overflow-x-auto)
  "Filter:" label fg-muted 13px.
  Framework pills (toggle chips): All · React (active, bg-accent accent-fg) · Vue · Svelte · Solid · Angular — rounded-full, border, 28px height, 13px.
  Divider |.
  Sort dropdown "Trending ▾" — border, rounded-6px, 32px.
  Tags multi-select pill "+ Tags" — border-dashed, rounded-full.
  Right: result count "1,284 components" fg-muted 13px.

GRID (px-6 pt-6, 3 columns desktop · 2 tablet · 1 mobile, gap-4)
  Show 9 component cards (same card structure as Home Feed). Vary: some cards tall (16:10), one card spans 2 columns (featured, wider preview). Use same 6 components from Feed + 3 more: "Rich Text Editor", "Drag & Drop List", "Calendar Picker".

PAGINATION / INFINITE SCROLL TRIGGER (mt-8, text-center)
  "Load more" ghost button (border, rounded-6px, fg-secondary) with spinner placeholder.

Deliver: Desktop layout, dark, React filter active.
```

---

## PROMPT 7 — Notifications Page (/notifications)

```
Design the Notifications page for Componi.

Use the token system above. Dark + light.

STICKY TOP BAR — same pattern. Bell icon in nav shows badge "5" (bg-accent, rounded-full).

PAGE HEADER (px-6, pt-6, pb-4, flex items-center justify-between)
  "Notifications" fg-primary 28px bold.
  "Mark all as read" ghost button fg-muted 13px.

FILTER TABS (mt-0, border-b border-subtle, flex gap-6 px-6)
  All · Unread (5) · Likes · Comments · Follows
  Active: fg-primary border-b-2 border-accent.

NOTIFICATION LIST (px-6, divide-y divide-border-subtle)
  Show 8 notifications mixing types. Unread items have bg-elevated left border 3px accent.
  
  Each row (py-4, flex gap-3, items-start):
    Actor avatar 36px circle (or system icon for non-actor types).
    Content block:
      Actor displayName fg-primary 13px semibold + action text fg-secondary 13px + target name fg-primary 13px semibold (linked). E.g.: "Sarah Chen liked your component Command Palette".
      Relative time fg-muted 12px.
      For comments/replies: quoted comment body fg-secondary 13px, bg-elevated rounded-6px px-3 py-2 mt-1, max 2 lines.
    Right: component thumbnail 48px × 36px rounded-6px bg-elevated (for like/favorite/fork/version types).

  NOTIFICATION TYPES TO SHOW:
    1. UNREAD — Like: "Sarah Chen liked Command Palette" · 2m ago · thumbnail
    2. UNREAD — Fork: "Carlos Mendes forked Command Palette" · 15m ago · thumbnail
    3. UNREAD — Comment: "priya_ui commented: 'Loved this implementation, could you add keyboard trap?'" · 1h ago · thumbnail
    4. UNREAD — Reply: "felix replied to your comment: 'Great point!'" · 2h ago · thumbnail
    5. UNREAD — Follow: "anya started following you" · 3h ago · avatar only
    6. READ — Version: "sarah_dev published v3 of Animated Tab Bar" · 1d ago · thumbnail
    7. READ — Like: "felix liked Data Table" · 2d ago · thumbnail
    8. READ — Mention: "carlosm mentioned you in a comment" · 3d ago · thumbnail

Deliver: dark (Unread tab, items 1-5 visible) + light (All tab, all 8 items).
```

---

## PROMPT 8 — Settings Page (/settings)

```
Design the Settings page for Componi.

Use the token system above. Dark mode.

STICKY TOP BAR — same pattern.

TWO-COLUMN LAYOUT (max-w-4xl mx-auto, pt-8, gap-8)
  Left: settings nav (200px, sticky).
  Right: settings content (flex-1).

LEFT NAV (bg-surface rounded-8px border p-2)
  Section groups with labels fg-muted 11px uppercase tracking-wider mb-1:
  ACCOUNT: Profile · Account · Privacy
  PREFERENCES: Appearance · Notifications
  SAFETY: Blocked users · Muted users
  LEGAL: Data export · Delete account
  
  Each nav item: 32px height, rounded-6px, fg-secondary 13px, hover bg-elevated. Active: bg-elevated fg-primary semibold left-border 2px accent.
  Active: "Profile"

RIGHT CONTENT — Profile settings:
  Section header "Profile" fg-primary 20px bold + fg-muted 14px subtitle "How others see you on Componi".
  
  AVATAR UPLOAD (flex gap-4, items-center, mb-6):
    Avatar 72px circle + "Change avatar" ghost button + "Remove" text link fg-danger 13px.
  
  FORM FIELDS (flex flex-col gap-4):
    Display name: label fg-secondary 13px + input (full-width, border, rounded-6px, 36px, bg-elevated).
    Username: label + input (value "@luiz", prefix "@" inside input fg-muted).
    Pronouns: label + input optional placeholder "e.g. they/them".
    Bio: label + textarea 80px height + char count "42 / 160" fg-muted 12px right.
    Website: label + input placeholder "https://…".
    GitHub username: label + input placeholder "@handle".
  
  SAVE BUTTON ROW (border-t border-subtle, pt-4, mt-4, flex justify-end):
    "Cancel" ghost button + "Save changes" accent button.
  
  APPEARANCE SECTION (show below profile, separated by border-t):
    "Appearance" fg-primary 16px semibold.
    Theme toggle: "Dark" / "System" / "Light" — segmented control (3 options, rounded-6px border, active segment bg-elevated or bg-accent).

Deliver: Desktop, dark mode, Profile section active.
```

---

## NOTES FOR CLAUDE DESIGN

- Always use `--accent: #8B1A2F` (vermelho vinho). Never substitute with any other accent.
- Ship dark + light variants when specified; use `data-theme` attribute on `<html>`.
- Include `tokens.css` once with all CSS custom properties.
- Use shadcn/ui primitives; heavily customize, never ship defaults visually.
- All prompts share the same topbar — extract it as a `<TopBar />` component.
- Realtime: components with live counts (likes, forks) should use optimistic UI patterns visible in the design (e.g., count updates on click before server confirms).
