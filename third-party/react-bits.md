# React Bits adaptations

Source: [React Bits](https://reactbits.dev), by David Haz. Retrieved on 2026-11-13.
The upstream license is preserved in [react-bits.LICENSE.md](./react-bits.LICENSE.md).

| Component | Official source | Application |
| --- | --- | --- |
| SpotlightCard | https://reactbits.dev/r/SpotlightCard-TS-CSS.json | Template buttons and material articles; accent color follows the pointer within the hovered card. |
| AnimatedContent | https://reactbits.dev/r/AnimatedContent-TS-CSS.json | A 240ms transition for each active workspace heading. |

The implementation lives in `src/components/react-bits/`. SpotlightCard keeps the existing button/article semantics, classes and event handlers. The application uses only local pointer lighting; upstream ambient movement, proximity lighting, grain and press effects are omitted. Updates occur at most once per animation frame while the pointer moves, with no idle loop. The light layer cannot receive pointer events. Keyboard focus and selected states remain static and visible.

AnimatedContent uses the browser's Web Animations API for the subset required here, so GSAP and ScrollTrigger are unnecessary. It animates only heading regions and releases transforms when finished. Inputs, editors, players and dialogs are never wrapped in an animated ancestor or remounted for transitions. Content is visible before JavaScript executes and remains visible if animation is unavailable.

Both adaptations follow `prefers-reduced-motion`, including preference changes during use. Touch devices retain normal selection and focus feedback without pointer lighting. Task, draft, audio, subtitle, render and fullscreen logic remains in the existing components.

Run `npm run verify:react-bits` against a local server to verify pointer, keyboard, touch, reduced-motion, navigation, material actions and desktop/mobile layout. Existing `verify:site` and `verify:fullscreen` scripts cover actual export and playback regressions.
