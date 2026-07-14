# Write Engine

Pluggable write backends for the Browser Transaction Runtime.

## Production vs Target

| | Backend | Role |
|--|---------|------|
| **Production default** | `accessibilityFill` | Reliable today |
| **Target** | trusted low-RT (e.g. CDP) | Register new file + `registerWriteBackend` — no Agent/Stage/Runtime API change |

## Add a backend

1. Create `backends/<id>.mjs` exporting `async function <id>Write({ definition, payload, run })`
2. Register in `index.mjs`: `registerWriteBackend("<id>", <id>Write)`
3. Optionally set `execution.writeBackend` on a Stage — or keep production default

Agent continues to call only `runStageTransaction(stageId, payload)`.

## Modes (production backend)

| Mode | When | Behavior |
|------|------|----------|
| default | `lead-pdp` (fields/checkboxes) | 1 snap + fill + validate |
| `cascade` | `offer-selection` (`execution.mode` + `steps[]`) | Re-snapshot between dependent selects/fills/clicks |
