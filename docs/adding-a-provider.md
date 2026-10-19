# Adding a provider's limits

Footer Dock shows the limit windows (5h, week, month) that a provider's own usage service reports. Each provider is **one small, self-contained module** plus one line in a registry. Nothing else changes when one is added. You do not need to understand the rest of the code.

## Before you start: is your provider a fit?

A source may be added only if all of these hold:

1. The provider has a **usage endpoint over HTTPS that returns how much is used or left and when it resets**, for the same credential Pi already holds for that provider.
2. Calling it is something the provider's own app or CLI does. Do not add an endpoint that the provider's terms forbid third parties to call; say in the pull request where the endpoint comes from.
3. A request needs nothing but that credential: no cookies, no scraped pages, no extra sign-in.

If it does not fit (no endpoint, or the only way is scraping), Footer Dock cannot support it.

## The contract

`src/quota-sources/contract.ts` defines what a source is:

```ts
export interface ProviderQuotaSource {
  provider: string; // the Pi provider id (what /model shows before the slash)
  label: string; // a name for humans
  origin: string; // the ONLY origin that may ever receive the credential (HTTPS)
  path: string; // the usage endpoint's path
  parse: (body: unknown) => RateLimitWindow[] | undefined; // strict parser
  credential?: CredentialResolver; // only if Pi's token for this provider is not what the endpoint wants
}
```

A window is `{ label, remainingPercent, resetAt }` (`resetAt` in seconds). `shared/window.ts` has `windowOf(label, usedPercent, resetTimestamp)`, which returns a window only if both values are valid, and `record()` for safe object access.

## Steps

1. **Write the module** `src/quota-sources/<provider>.ts`. Copy `opencode-go.ts` (about 30 lines): a `parse…` function and the exported source object.
2. **Parse strictly.** The body is untrusted. Return `undefined` for anything you do not recognise: Footer Dock then shows nothing rather than a guess. Use `windowOf`, bound loops (see `clinepass.ts`), and accept only the labels you expect.
3. **Register it** with one line in `src/quota-sources/registry.ts`.
4. **Add tests** to `tests/provider-quota-parsers.test.ts` (or a new file): a real-shaped body that parses, and hostile or malformed bodies (wrong types, negative or over-100 percentages, missing reset, huge arrays, prototype keys) that return `undefined` or only the valid windows.
5. **Document it:** add a row to the "Supported providers" table in `README.md` (provider, Pi id, windows, the exact host and path asked) and a line in `CHANGELOG.md`.
6. **Run `scripts/gate.sh`.** The architecture check enforces that a source imports only `contract.ts` and `shared/`, never another source.

## Rules that are not negotiable

- **The credential goes only to `origin`.** It comes from Pi's public API at the moment of the request, is never stored, logged or shown, and Footer Dock never reads credential files. Do not add a path that reads `auth.json` or similar.
- **No new network destination besides the provider's own host,** no redirects followed to other hosts, no telemetry.
- **Never invent a number.** If the provider does not say it, the window is not shown.
- **Off by default stays.** The user turns limits on in `/dock-settings`; your source runs only then.

## Pull request checklist

- [ ] The endpoint, its host and its origin of knowledge are stated (the provider's docs or its own client).
- [ ] A fixture body of the real shape, with the secrets and ids removed.
- [ ] Parser tests including hostile bodies.
- [ ] README table row and changelog line.
- [ ] `scripts/gate.sh` passes.

A maintainer may decline a source whose terms forbid third-party use or whose endpoint is too unstable to depend on.
