# Classic script load order

These files are intentionally loaded as classic scripts, not ES modules. Keep the order in index.html:

1. state.js — global app state, local progress, backup controls.
2. api.js — apiJson plus auth/progress server helpers.
3. utils.js — DOM helpers, markdown rendering, formatting, toasts.
4. router.js — lightweight hash-route view toggles for #/quiz and #/wiki.
5. quiz.js — question lists, rendering, navigation, answer logic.
6. auth.js — auth UI, account menu, question preview helpers.
7. wiki.js — personal wiki save payloads, safeHeaderToken, and idempotent save headers.
8. ai.js — AI panel rendering, prompts, streaming, and history hooks.
9. search.js — search, related-question UI, batch modal controls.
10. app-init.js — data loading and final boot via initAuth().

The split preserves the original global-function style. Do not change this to type="module" unless the globals and load timing are refactored deliberately.
