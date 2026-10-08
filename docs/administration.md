# 100next administration

The owner dashboard is `/velvet-ledger/`. The static page contains no account data or credentials. Its user listing, pagination, search and CSV export require an authenticated session whose account ID is in the private `administrators` table. A distinctive path is cosmetic; authorization is enforced by the account service.

The dashboard shows signup dates, registration country, resettable overall points and all-time online/practice counters. It never selects or exports password hashes, recovery hashes or session tokens. Guests' device-only history is not available here. CSV text cells are escaped to prevent spreadsheet formula execution.

Country is an estimate of the signup connection, not nationality or residence. The frontend Worker strips a client-supplied country header and forwards only Cloudflare's `request.cf.country`. Existing accounts remain Unknown; their current location is not used to invent a registration country. No IP address is stored for this feature.

`My login` requires the current password, supports a new unique name/email, a new password and rotation of the private recovery code. Identity and statistics remain attached to the same account ID, so changing an administrator's login preserves the role. All prior sessions are revoked and the requesting owner gets a fresh session. Recovery-code recovery also retains the role and statistics. Email is a login identifier; email delivery/recovery is not implemented.

`Edit login` on another user's row requires the administrator's current password. It supports renaming the account and setting a new password, preserves statistics and invalidates the target's sessions. It cannot promote administrators or delete data. Names/email addresses must be unique without regard to case.

Owner initialization uses two short-lived backend secrets: `ADMIN_BOOTSTRAP_USERNAME` and `ADMIN_BOOTSTRAP_PASSWORD_HASH`. Public registration cannot take the reserved login. Only a correct login matching the private scrypt hash provisions the first administrator. Bootstrap is permanently disabled once any administrator exists, including after changing their login. Remove both backend secrets after verifying initialization. Never commit a password or its bootstrap hash. No admin credentials are sent to the frontend build.

The account tests exercise bootstrap reservation, unauthorized requests, CSRF protection, secret exclusion, pagination/search, country migration, identity changes, role preservation, recovery and session revocation. The routing tests verify country cannot be supplied by clients and private internal endpoints remain inaccessible.
