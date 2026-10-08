# 100next accounts

Players can register with a unique name and password, remain signed in for 30 days, sign out, and recover an account using the private code shown after registration. Recovery changes the password, rotates the code, and ends previous sessions. No email is collected. Guest play is available.

The existing 100next backend has a separate SQLite Durable Object (`AccountStore`, `accounts-v1`). Stable 100 storage and publishing stay separate. Passwords use salted scrypt (N=32768, r=8, p=3); session tokens and recovery codes are stored as SHA-256 hashes. The browser session cookie is Secure, HttpOnly and SameSite=Lax. Same-origin JSON writes and persistent rate limits protect account requests.

Online room identity comes from the signed-in account. Only the private room binding can submit online statistics. Completed rounds are saved with idempotent event references and retried after transient failures. Local practice results are clearly separate client reports, queued on their originating device if offline. Practice deaths are recorded separately as player reports and cannot grant verified online outcomes. Freedom is reserved. Historical guest statistics stay on that device and are not imported as verified account statistics.

Death is recorded once when a settled match score reaches −16 or below. Freedom remains reserved until its finish rule is finalized. Names cannot be changed yet. A lost password and lost recovery code cannot be recovered through email.

Verification: `pnpm test:accounts` checks the real account handler with SQLite, hashes, sessions, recovery, isolation, origin/size/rate limits, repeated reports, authenticated room identities, and a complete online round. `node scripts/verify-accounts-live.mjs [origin]` checks the deployed account flow using a uniquely named QA account, without logging credentials.
