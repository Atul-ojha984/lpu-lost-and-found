# MongoDB Atlas Index Strategy

**Status:** Proposed from current Django query paths; must be validated against actual generated indexes and representative Atlas query plans before production.
**Data model source:** `docs/MONGODB_ATLAS_DATA_MAPPING.md`.

## Index policy

- Keep the automatically created unique `_id` index for each collection.
- Preserve current single-field uniqueness on identity keys, public reference numbers, taxonomy codes and locker numbers.
- Use compound indexes whose leading fields match actual equality filters and whose trailing fields match sort order. Revisit after measuring representative queries; do not add every possible permutation.
- Use partial unique indexes only when the exact backend v5.2 migration produces the intended filter and a real concurrent write test proves it. `UniqueConstraint(condition=...)` is business-critical and cannot be replaced by application pre-checks alone.
- Give every index a stable explicit name, document its owner/query, and test create/upgrade behavior. Backend v5.2 index migration support has limitations, especially for embedded/array indexes.
- Avoid TTL indexes on claims, OTPs, handovers, custody, disposal, audit, and notification records. Expiration is a state transition; records are needed for audit/history and must not disappear automatically.
- Query strings with `icontains` may use regex-like scans. Indexing a substring predicate with an ordinary B-tree does not make arbitrary substring search efficient. Atlas Search is a possible separate implementation, not assumed API-compatible.

## Proposed collection indexes

| Collection | Index | Purpose and validation |
|---|---|---|
| `accounts_user` | unique `{registration_number: 1}` | Registration-number login/account uniqueness. Preserve normalized uppercase behavior and case-insensitive import checks. |
| `accounts_user` | unique `{email: 1}` | Email login and duplicate prevention; preserve lowercase normalization. |
| `accounts_user` | `{role: 1, is_active: 1}` | Security/admin user lists and active-role operations. Validate actual list filters before retaining. |
| `accounts_user` | `{created_at: -1, _id: 1}` | Admin user list stable newest-first ordering. |
| `items_item` | unique `{reference_number: 1}` | Public reference lookup. |
| `items_item` | `{is_archived: 1, status: 1, item_type: 1, created_at: -1, _id: 1}` | Active public/security board filters and deterministic ordering. Explain this index against each filter variant; do not assume every left-prefix combination is used efficiently. |
| `items_item` | `{category_id: 1, location_id: 1, status: 1, item_type: 1}` | Category/location and status filtering. |
| `items_item` | `{reported_by_id: 1, is_archived: 1, created_at: -1, _id: 1}` | My Reports ownership scope and stable ordering. |
| `items_item` | `{retention_expires_at: 1, item_type: 1, status: 1}` | Expiry/ageing task selection; verify exact eligibility query and active claim exclusions. |
| `items_itemcategory` | unique `{code: 1}`; `{is_active: 1, name: 1}` | Category lookup/selection. |
| `locations_location` | unique `{code: 1}`; `{campus_zone: 1, is_active: 1}` | Campus location selection and filters. |
| `matching_matchsuggestion` | unique `{lost_item_id: 1, found_item_id: 1}` | Prevent duplicate candidate pairs. Add `{lost_item_id: 1, status: 1, created_at: -1}` and inverse found-item index only if list APIs use those filters. |
| `claims_claim` | `{claimant_id: 1, created_at: -1, _id: 1}` | My Claims and user history. |
| `claims_claim` | `{claim_status: 1, created_at: -1, _id: 1}` | Security pending/review queue. Add item/reviewer query indexes only when measured. |
| `claims_claim` | conditional unique `{item_id: 1, claimant_id: 1}` for current active statuses | Preserve `unique_active_claim_per_user_item`. Validate the `$in` status predicate, index creation and race behavior on the pinned backend. |
| `claims_claimchallengeanswer` | `{claim_id: 1, created_at: 1, _id: 1}` | Claim answer history. A uniqueness rule by claim/challenge must be added only if existing workflow requires it and source data passes duplicate audit. |
| `verification_privatedetail` | unique `{item_id: 1}` | One encrypted private vault per item. |
| `verification_verificationchallenge` | `{item_id: 1, is_active: 1, created_at: 1}` | Active verification questions for one item. |
| `custody_custodylocation` | unique `{code: 1}`; unique `{normalized_name: 1}` | Preserve location code uniqueness and current `Lower(name)` uniqueness using a maintained canonical lowercase field if expression uniqueness is unsupported. Normalize atomically on create/update. |
| `custody_locker` | unique `{locker_number: 1}` | Current model makes locker number globally unique; do not weaken to per-location uniqueness without a separate behavior change. |
| `custody_locker` | `{custody_location_id: 1, is_active: 1, locker_number: 1}` | Security location picker and locker lists. |
| `custody_locker` | partial unique `{current_item_id: 1}` only when assigned | Ensure a physical item cannot be assigned to two lockers. Also require conditional occupancy update on the locker document. |
| `custody_custodyrecord` | `{item_id: 1, timestamp: -1, _id: -1}` | Item movement history. |
| `custody_custodyrecord` | `{action: 1, timestamp: -1, _id: -1}` | Recent custody actions. |
| `handovers_handover` | unique `{claim_id: 1}` | Preserve one normal handover per claim. |
| `handovers_handover` | partial unique `{item_id: 1}` when `is_completed: true` | Preserve one completed normal handover per item. Validate filter support. |
| `handovers_handover` | `{recipient_id: 1, is_completed: 1, created_at: -1, _id: 1}` | Recovery history/pending view. |
| `handovers_directrecovery` | unique `{intake_custody_record_id: 1}` | Preserve one direct recovery per physical intake record. |
| `handovers_directrecovery` | partial unique `{item_id: 1}` when status is active | Preserve one active direct recovery per item. |
| `handovers_directrecovery` | partial unique `{item_id: 1}` when status is completed | Prevent duplicate completed direct recovery. |
| `handovers_directrecovery` | `{recipient_id: 1, status: 1, created_at: -1, _id: 1}` | Student direct recovery/history and security queue. |
| `handovers_directrecovery` | `{status: 1, created_at: -1, _id: 1}` | Active recovery queue. |
| `disposal_disposalrecord` | unique `{item_id: 1}` | One disposal record per item. |
| `audit_auditentry` | `{timestamp: -1, _id: -1}` | Admin/security feed ordering and page traversal. |
| `audit_auditentry` | `{actor_id: 1, action: 1, timestamp: -1}` | Filter by actor/action/time. |
| `audit_auditentry` | `{target_entity: 1, target_id: 1, timestamp: -1}` | Target activity history. |
| `audit_auditentry` | `{action: 1, timestamp: -1}` | Action filtering and relevant analytics. |
| `audit_notification` | unique `{recipient_id: 1, source_audit_entry_id: 1}` when source exists | Preserve notification deduplication; ensure absent/null source entries do not collide. |
| `audit_notification` | `{recipient_id: 1, created_at: -1, _id: -1}` | Recipient-scoped notification polling/cursor ordering. |
| `audit_notification` | `{recipient_id: 1, read_at: 1}` | Unread counts/read state. |
| `audit_notification` | `{recipient_id: 1, audience_role: 1}` | Recipient role filtering, if still used in the API. |

The table includes candidate indexes inferred from model metadata and current query code. In particular, indexes marked partial or conditional must not be declared complete until the exact filter is present in Atlas and the parallel-write test demonstrates uniqueness under races. Extra indexes add storage and write costs; remove candidates that have no observed query after profiling.

## Search indexes

No PostgreSQL full-text or `pg_trgm` index is used in the current backend. Current item, report, locker, and audit search uses ordinary text filters. Phase 4 should first preserve current API behavior with backend-supported string lookups and structured indexes.

If a later measurement shows a need for Atlas Search, propose one explicitly versioned Search index over item title, public description, reference number and specific location, plus appropriate filter fields. Before enabling it, test exact/partial matches, case normalization, query punctuation, pagination order, role scoping, empty results, and search index build delay. Do not add vector/geospatial indexes: no current vector/geospatial model or endpoint was found.

## Pagination, sorting, and explain review

- Existing API page/limit inputs and response envelopes remain unchanged.
- Use stable ascending/descending tie-breakers with UUID `_id` when timestamps match.
- Preserve current limits and role-scoped filters before paginating.
- Measure count queries and skip cost at realistic data volume. Deep offsets may be expensive; only add internal cursor/keyset handling if the public contract remains compatible and frontend tests pass.
- Capture sanitized `explain()` output for public item listing, security claim/recovery queues, My Reports/My Claims, notification polling, admin audit filters and custody history. Store plans without personal data or secrets in test artifacts.

## Index rollout and verification

1. Run a duplicate/normalization report against the PostgreSQL source before any unique index is built.
2. Build indexes in isolated test Atlas, then staging; verify actual names, key order, uniqueness, partial expressions and `explain()` use.
3. Exercise concurrent inserts/updates for active claims, locker occupancy, normal/direct completed handovers, and notifications.
4. Keep migrations repeatable and index creation observable. Do not use `migrate --fake-initial` or infer successful creation from a migration recorder entry alone.
5. Before any future production import, compare index definitions against this strategy and reconcile every duplicate conflict without deleting or silently merging records.

## Official references

- [Django MongoDB Backend v5.2 index guidance](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/model-data/indexes/)
- [Django MongoDB Backend v5.2 compatibility limitations](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/limitations-upcoming/)
- [Django MongoDB Backend v5.2 query guidance](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/interact-data/specify-a-query/)
