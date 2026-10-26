# Local image storage

Recipe and cookbook images used to be embedded in the localStorage workspace. A handful of camera photos could exceed Web Storage's per-origin limit even when the phone had free disk space.

`imageStorage.ts` persists unique image payloads in the `forma-image-assets-v1` IndexedDB database. Only the local workspace cache uses `forma-image:v1:` references. Application state, validation, merges, exports and cloud payloads retain full inline images. Images are registered for encoding only after the write transaction commits. Recipe and cookbook editors await that commit before saving metadata; if IndexedDB is unavailable, inline saving remains the fallback.

At startup, only referenced assets are read. Existing inline caches (including recovery copies) are migrated without deleting metadata: commit images, compare the original cache against the current value to avoid overwriting another tab, then atomically replace that cache with compact metadata. Failed migrations retain their original inline data. A missing asset protects the original cache from replacement and shows a recovery message. Storage events fetch unfamiliar assets before merging a second tab's metadata. Fresh cloud/imported images are optimized in the background through the existing workspace persistence path.

Images are intentionally retained rather than garbage-collected: recovery copies and other tabs may still reference them. New uploads target at most 240,000 data-URL characters, while retaining the previous 700,000-character fallback for an image that cannot meet that target at 640px. Existing photo quality is unchanged.

Verify with `npm test`, `npm run build`, and `APP_URL=http://127.0.0.1:4189 npm run test:image-storage` against a running dev or preview server. The browser tests fill real Web Storage to reproduce QuotaExceededError, migrate legacy photos, verify deduplication, save and reload new images, synchronize across tabs, and protect original data when IndexedDB or an asset is unavailable.

## Signed-in source of truth

For authenticated accounts, the database is authoritative. Workspace cache failures do not reject edits or override a confirmed server revision. An edit initially shows Sparar and becomes Sparat i molnet only after the server acknowledges it (or a fresh fetch confirms the same snapshot). Guest mode still requires local persistence.

Without a local cache, pending edits remain in memory until the database accepts them. Offline/network failures clearly describe this state; logout is blocked and beforeunload requests a browser warning while such edits are pending. Mobile browsers may not show a beforeunload warning, so the inline pending/error state remains essential. These are optimistic edits, not falsely acknowledged saves. A fresh online session restores its workspace from Supabase without requiring a successful local cache write. A real cloud revision mismatch continues to require conflict resolution.

`APP_URL=http://127.0.0.1:4189 npm run test:cloud-primary` exercises the real Supabase JS client with isolated HTTP test responses in Chromium and WebKit. Workspace cache writes are forced to fail. It verifies pending status before server acknowledgement, successful save without any local workspace cache, fresh-session database restoration, full error state for rejected server writes, and mobile status layout. This is an isolated integration test; it does not access or modify a production user's database row.
