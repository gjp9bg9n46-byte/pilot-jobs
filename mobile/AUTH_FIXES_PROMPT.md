# Prompt: Fix the two auth bugs and make sign-in reliable

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`).

---

We have three related issues in the mobile auth flow that need fixing together. Read these files first:

- `mobile/App.tsx` — does the session-restore on launch
- `mobile/src/services/api.ts` — axios client + interceptors
- `mobile/src/navigation/index.tsx` — picks Login stack vs Main stack from `auth.token`
- `mobile/src/store/index.ts` — auth slice (`setAuth`, `logout`)
- `mobile/src/screens/auth/LoginScreen.tsx` and `mobile/src/screens/auth/RegisterScreen.tsx`

## Bug 1 — Flash of Login screen on every cold launch

`App.tsx` already restores the auth token from SecureStore on startup and calls `authApi.me()` to refresh the pilot, but it does so *after* the first render. Because the navigator decides Login vs Main from `auth.token` (which starts at `null`), every cold start shows the Login screen for a beat before bouncing into the app.

Fix it by introducing a bootstrapping state and a splash:

1. Add `bootstrapping: boolean` to the `auth` slice initial state, defaulted to `true`. Add an action `setBootstrapped()` that flips it to `false`.
2. In `App.tsx`, dispatch `setBootstrapped()` in the `finally` of the session-restore IIFE — both on success and on failure / missing token.
3. In `mobile/src/navigation/index.tsx`, read `bootstrapping` alongside `token`. While `bootstrapping === true`, render a `<SplashScreen />` (a simple full-screen view, dark background, centered logo + spinner — match the existing palette). Only after bootstrapping is false do you decide Login vs Main based on `token`.
4. Bonus: use `expo-splash-screen`'s `preventAutoHideAsync()` at module load and `hideAsync()` once bootstrapping completes, so the native splash blends into the JS splash with no flash at all.

## Bug 2 — Expired sessions leave the user stuck on the authenticated stack

In `api.ts`, the 401 interceptor deletes the token from SecureStore but doesn't update Redux. So when the JWT expires, `auth.token` stays set, the navigator stays on Main, every screen quietly fails to load, and the user has no way out short of force-quitting the app.

Fix:

1. Import the Redux store at the top of `api.ts` (`import { store, logout } from '../store'` — adjust the path).
2. In the response interceptor, when `error.response?.status === 401`, after deleting the token from SecureStore, also call `store.dispatch(logout())`.
3. Guard against the obvious circular-import risk: if importing the store at the top of `api.ts` causes issues, move the dispatch behind a tiny event-emitter shim (`mobile/src/services/authEvents.ts`) that `App.tsx` subscribes to and calls `dispatch(logout())` from there. Pick whichever is cleaner — call it out in your summary.
4. Don't fire `logout()` for the initial `authApi.me()` call during bootstrap — that one is *expected* to 401 when the stored token is stale, and the bootstrap code already handles it by deleting the SecureStore entry. Either skip the interceptor for that single call (set a header flag and check for it) or have `me()` use a separate axios instance without the 401 dispatcher.

## "The sign-in problem" — make the flow actually reliable end-to-end

Beyond the two bugs above, the sign-in flow has a few silent-failure modes worth fixing in the same pass:

1. **Validate the login response shape.** `LoginScreen.tsx` does `dispatch(setAuth({ token: data.token, pilot: data.pilot }))` without checking those keys exist. If the backend returns `{ accessToken, user }` instead, login appears to succeed and the user stays on the Login screen with no error. Add a check: if `data.token` is missing, throw a clear error like `"Server returned an unexpected response — contact support"` so the failure is visible.

2. **Distinguish error types in the catch.** Right now any failure shows `"Check your email and password and try again."` — even network outages and 500s. Use the axios error:
   - No `error.response` → "Can't reach the server. Check your internet connection."
   - 401 / 403 → "Invalid email or password."
   - 429 → "Too many sign-in attempts. Try again in a few minutes."
   - 5xx → "Server error. Please try again shortly."
   - Anything else → fall back to `error.response?.data?.error` if present, otherwise the generic message.
   - Apply the same pattern in `RegisterScreen.tsx`.

3. **Normalize the email before sending.** Both Login and Register should `email.trim().toLowerCase()` before calling the API. Without this, "Alice@Example.com" and "alice@example.com" become two accounts on register, and become "wrong password" on login.

4. **Disable the submit button while loading and on empty fields.** Currently the button visually disables but `handleLogin` doesn't early-return cleanly enough — fine on closer look, but unify with the disabled-prop pattern from the Register screen and make the disabled style obvious (60% opacity).

5. **Push notification timing.** `App.tsx` requests notification permission on every cold launch, including before the user has signed in. iOS treats early permission prompts harshly — users dismiss the dialog once and it's gone forever. Move the push permission request out of the launch effect and into the post-sign-in flow: only fire it after `setAuth` is dispatched (either subscribe via a store listener in App.tsx, or call it from inside `handleLogin` / `handleRegister` after the dispatch succeeds). For users who already have a token on launch, still register their push token, but skip the permission *prompt* if not already granted — only call `getExpoPushTokenAsync` when status is already `granted`.

## Conventions

- Keep using Redux Toolkit. No new state libs.
- All new types in the existing slice file or a `mobile/src/types/auth.ts` if it gets noisy — no `any` on new code.
- Match the existing palette and component style.
- Don't break any existing test if there is one; if there isn't, don't add one in this PR.

## Deliverables

1. The modified files.
2. A short summary at the end: which fix landed in which file, any tradeoff calls (circular-import shim vs direct store import, splash via `expo-splash-screen` or a JS-only splash), and a manual test script the user can follow to verify each fix (cold launch with token, cold launch without token, expired-token-during-use, network-off login, wrong-password login).
