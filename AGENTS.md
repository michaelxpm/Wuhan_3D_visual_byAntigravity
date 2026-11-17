# AGENTS.md — 3D Wuhan Visual Map

## Communication Preferences
For each major task or milestone:
1. Explain what is being achieved and why it is necessary.
2. Summarize the approach in plain language before executing complex operations.
3. After important tool calls, explain what the results mean.
4. If a command fails, explain the likely cause, its impact, and the recovery plan.
5. Report important technical decisions and alternatives considered.
6. Clearly distinguish verified results from assumptions.
7. Provide periodic progress updates during long tasks (approximately every 5–10 minutes or after a significant milestone).
8. At completion, summarize what was accomplished, what was tested, and what remains unfinished.

Keep raw command logs available, but prioritize clear explanations over technical jargon.
Do not expose hidden internal reasoning; provide concise decision rationales, evidence, and progress summaries.

---

## Autonomous Development and Version Control Rules

### 1. Autonomous Development
- Independently plan, implement, test, debug, and proceed through approved development phases without requiring approval between ordinary phases.
- Autonomously create/modify project files, run local dev/test commands, download permitted public geographic data, diagnose errors, update plans, and commit to `develop`.
- Prioritize reliability, geographic accuracy, maintainability, and rendering performance.

### 2. Git Workflow
- Single Git repository at the project root (`D:\coding\2611-3D-wuhan-visual--map-byAntigravity`).
- `main` is the stable branch (do not merge into `main` or create official release tags without explicit user acceptance).
- `develop` is the autonomous development branch for ordinary work.
- Make meaningful commits after completing and testing each milestone; record branch, commit hash, and Git status.
- Do not rewrite Git history, force-push, delete branches, or discard existing changes.
- Only push `develop` after successful milestones if a remote repository is configured and no history rewrite is needed.

### 3. Recoverable Checkpoints
- Preserve original downloaded datasets; save cleaned/validated data and generated scene assets separately.
- Use local caching and resumable processing; avoid repeating successful downloads or expensive computations.
- Maintain `PROGRESS.md` with: current phase, completed milestones, current Git branch & latest commit, generated files & data locations, failed operations & causes, known limitations, next planned actions, and resume instructions.

### 4. Testing and Validation
- After each significant milestone: run relevant tests, check geographic data integrity, validate geometry & coordinate transforms, check browser console errors & asset-loading failures, check rendering performance, and record actual test results.
- Never report a feature as verified unless it has passed the relevant tests.
- If blocked by missing permissions, unavailable data, repeated failures, or scope-changing decisions, stop and ask the user.

### 5. Progress Communication
- Provide human-readable progress summaries explaining what is being done, why, what completed, errors/recovery, and next steps.
- Avoid unnecessary repeated analysis and redundant tool calls.

### 6. Phase Transitions
- When a phase completes: run acceptance tests, record results, commit to `develop`, push `develop` if configured, update `PROGRESS.md`, and continue automatically to the next approved phase.

### 7. Release Workflow
- Only when the user explicitly states a release is validated and accepted: verify tests & Git status, merge into `main`, create version tag, push `main` and tag, verify remote sync, then return to `develop`.

### 8. Safety and Data Protection
- Never modify `D:\WuhanGIS` (read-only external reference data source). Process copied/extracted datasets inside the project workspace only.
- Do not execute destructive operations, access unrelated private files, expose credentials, or bypass asset licensing restrictions.
- Before downloading exceptionally large datasets or making major architectural changes, report expected impact and request approval.
