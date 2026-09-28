# ThreadPilot Design System & Light-First Architecture Specification

## 1. Primary Design Direction
ThreadPilot authenticated interface is **LIGHT FIRST**:
- **Editorial Paper Canvas**: Warm paper surfaces (`#FFFDF8`, `#F7F4EE`, `#FFFFFF`), subtle borders (`#E8E5DF`), soft gray (`#F4F3F0`), and high-contrast charcoal typography (`#151518`, `#5F5D61`).
- **Semantic Color Palette**:
  - **Coral & Lava Orange** (`#FF6B4A`, `#FF5722`): Creation, publishing, primary CTA.
  - **Electric Violet** (`#7C3AED`, `#A855F7`): AI intelligence, voice vector, generation.
  - **Pacific Cyan** (`#00ADB5`, `#22D3EE`): Analytics, sync, pipeline telemetry.
  - **Lime** (`#84CC16`, `#B8F34A`): Success, verified connection, active state.
- **Micro-Interactions & Motion**: 150ms-250ms fast, spring-like, predictable, honoring `prefers-reduced-motion`.

## 2. Navigation Architecture
- **Overview**: `/dashboard`
- **Content Studio / Composer**: `/create`
- **Publishing Calendar**: `/schedules`
- **Publishing Queue**: `/queue`
- **Threads Posts Library**: `/posts`
- **Analytics & Trends**: `/analytics`
- **Replies & Social Feed**: `/replies`
- **Intelligence & Learning**: `/learning`
- **Voice & Profile**: `/profile`
- **Connected Accounts**: `/connect`
- **Settings & Guardrails**: `/settings`

## 3. Spacing & Radius Tokens
- Large surfaces: 16–20px (`rounded-2xl` / `rounded-3xl`)
- Standard cards: 12–14px (`rounded-xl` / `rounded-2xl`)
- Inputs & Controls: 8–10px (`rounded-xl`)
- Buttons: 8–10px (`rounded-xl`)
- Borders: `1px solid #E8E5DF` (default) / `1px solid #DDD9D1` (muted)
- Subtle soft shadows: `0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)`
