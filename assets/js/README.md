# Classic script load order

These files are intentionally loaded as classic scripts, not ES modules. Keep the order in `index.html`:

1. `state.js` — global app state, local/server progress, backup controls.
2. `learning.js` — answer history, spaced-review scheduling, activity and dashboard metrics.
3. `api.js` — `apiJson`, auth helpers, progress helpers, and server calls.
4. `utils.js` — DOM helpers, markdown rendering, formatting, toasts.
5. `router.js` — lightweight hash-route view toggles.
6. `quiz.js` — question lists, rendering, navigation, answer logic, knowledge-note payloads.
7. `auth.js` — auth UI, account menu, and account-bound progress bootstrap.
8. `wiki.js` — personal knowledge base save/search/preview/edit/soft-delete helpers.
9. `ai.js` — AI panel rendering, prompts, follow-up input, output rendering, save-to-knowledge-base entry.
10. `search.js` — question search, related-question UI, batch modal controls.
11. `dashboard.js` — learning dashboard and priority-review actions.
12. `app-init.js` — data loading and final boot via `initAuth()`.

The split preserves the original global-function style. Do not change this to `type="module"` unless the globals and load timing are refactored deliberately.
