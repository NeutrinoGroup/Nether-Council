# Google identity review corrections

- Use signed, expiring HttpOnly identity cookies; never authenticate a caller-selected userId. Logout validates Origin and expires the cookie.
- Start OAuth server-side with a random state and signed ten-minute flow cookie. Bind exchange to state, server origin and PKCE; require a verified Google email.
- Disable synthetic identity login in production regardless of demo flags. Local/test demo mode requires explicit flags. No copied Google client ID remains.
- Missing production storage fails closed. Database errors do not acknowledge a successful in-memory write. Stable referral codes survive fresh instances, and existing records retain their referral code.
- Limit service-role grants to users, not all public tables. This unmerged migration has not been applied.
- Refresh cached display profiles from the server; guard against late anonymous responses overwriting a completed login. Preserve successful OAuth exchange during React Strict Mode remounts.
- Bind the test webserver to loopback and generate a random test-only signing key.

Fresh verification after environment restoration: lint, workspace TypeScript, all80 tests and asset verification passed. Production build and remote CI are pending at publication. No prior run is presented as certification of the reconstructed tree. Live Google consent, database persistence and browser acceptance must be verified before merge.

This auth commit includes the build-repair commit as a parent while retaining the header reference, since the auth component now exists on this branch. It can follow the independent build repair without dropping the intended login control.
