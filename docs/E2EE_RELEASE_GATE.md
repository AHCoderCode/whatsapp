# End-to-end encryption release gate

## Current status

**End-to-end encryption is not implemented.** The current app sends message text to Supabase Postgres and stores attachments in Supabase Storage under row-level-security and storage policies. Those controls are access control, not end-to-end encryption. Do not advertise this app as E2EE or promise that the service provider cannot read message content.

## Why this is not a quick AES switch

A safe messenger needs authenticated encryption plus a complete key lifecycle:
- independently generated identity and signed pre-key material per device;
- authenticated session establishment and a ratcheting protocol for forward secrecy and post-compromise security;
- identity-change verification and a way for users to compare safety numbers or QR fingerprints;
- encrypted attachments, thumbnails, voice notes, backups, local caches and notification previews;
- group key distribution and membership-change handling;
- multi-device linking, device revocation, recovery and lost-device handling;
- protocol versioning, downgrade protection, abuse-report evidence export and carefully scoped metadata retention.

A custom AES-GCM wrapper or one-off Diffie–Hellman exchange is not a substitute for a reviewed messenger protocol. The existing web/native client combination does not currently ship a vetted Signal Protocol implementation with reviewed key storage and group/multi-device support.

## Required implementation path

1. Select and pin a maintained, reputable Signal Protocol implementation whose licence supports this project and whose web/Android support is actively maintained.
2. Design identity keys and device keys separately; private keys must remain in device-protected storage and never be uploaded in plaintext.
3. Implement one-to-one sessions and identity verification before adding group encryption.
4. Add encrypted attachments and ensure previews, push payloads, logs and analytics never leak message contents.
5. Design multi-device linking and device revocation with explicit cryptographic trust transitions.
6. Ensure reporting allows a user to intentionally include selected decrypted messages when submitting a report; moderators must not gain a universal decrypt key.
7. Add interoperability, test-vector, replay/tampering, key-change, offline, restore, multi-device and adversarial tests.
8. Obtain an independent cryptographic review before enabling the feature for real users.

Until every release gate passes, the product must continue to disclose that messages are protected by Supabase access controls but are not end-to-end encrypted.
