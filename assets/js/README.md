# Classic script load order

These files are intentionally loaded as classic scripts, not ES modules. Keep the order in `index.html`:

1. `state.js` — global app state, local/server progress, backup controls.
2. `api.js` — `apiJson`, auth helpers, progress helpers, and server calls.
3. `utils.js` — DOM helpers, markdown rendering, formatting, toasts.
4. `router.js` — lightweight hash-route view toggles for `#/quiz`, `#/wiki`, and `#/guide`.
5. `quiz.js` — question lists, rendering, navigation, answer logic, knowledge-note payloads.
6. `auth.js` — auth UI, account menu, and account-bound progress bootstrap.
7. `wiki.js` — personal knowledge base save/search/preview/edit/soft-delete helpers.
8. `ai.js` — AI panel rendering, prompts, follow-up input, output rendering, save-to-knowledge-base entry.
9. `search.js` — question search, related-question UI, batch modal controls.
10. `app-init.js` — data loading and final boot via `initAuth()`.

The split preserves the original global-function style. Do not change this to `type="module"` unless the globals and load timing are refactored deliberately.
