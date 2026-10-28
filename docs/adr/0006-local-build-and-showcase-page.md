# 0006: Build the APK locally, host it on Drive, link it from a Vercel showcase page

Date: 2026-10-28

## Context

The spec planned a Vercel-hosted download page. The group is 5 to 10 friends, and the owner prefers to control the build and hand over the APK directly. The owner also wants a showcase page with app screenshots and features, not just a bare link. Updates install over the old APK, which works only if every APK is signed with the same key.

## Decision

- The owner builds each APK locally and sends it by email or Google Drive.
- The owner holds the signing keystore. It is never committed to git.
- Before the first APK goes out, one offline backup of the keystore and its passwords exists in a password manager.
- A static Vercel page keeps its place in v1. It shows screenshots and features, and links to the current APK on Drive.
- The in-app update banner links to that page, not to Drive. The page URL never changes, so the owner can replace the Drive link without touching the app.

## Consequences

- Vercel stays in the integrations table, hosting only the static page.
- Losing the keystore means every friend must uninstall, reinstall and sign in again.
- Drive may show a virus-scan warning on larger files, and Android shows its "install unknown apps" prompt.

Refines the Vercel download page in the original spec: it becomes a showcase page, and Drive holds the APK file.
