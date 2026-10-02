# Implementation Plan: Test and Module-Wrapper Hardening

## Objective

Add regression coverage that proves the lifecycle fix and prevents the module wrapper from introducing a browser compatibility regression.

## Test plan

### Lifecycle tests

Add tests that:

- establish dependencies before disposal;
- dispose after subscribing;
- mutate dependencies after disposal;
- assert evaluator and subscriber counts remain unchanged;
- call dispose repeatedly; and
- exercise `evaluateImmediate` and `paused(false)` after disposal to verify they do not resurrect work.

Use observable counters or supported subscription APIs. Do not assert a specific post-disposal computed value because Knockout versions may differ in that detail.

### Module-loading tests

Retain the existing Jest/CommonJS setup and add a focused test that requires the package entry point without pre-populating a browser global. If browser-wrapper coverage is added, evaluate the source in a controlled VM context with an explicit `ko` global and a context without `ko`, according to the intended support contract.

### Regression matrix

Run:

- `npm test`;
- the lifecycle tests alone for fast iteration; and
- the full suite with the minimum supported Knockout version and the newest supported version, if the project declares a version range.

## Browser-wrapper recommendation

The wrapper should not reference `ko` as a bare identifier unless the browser branch has established that it exists. Prefer an explicit factory contract, such as a guarded `typeof ko !== 'undefined'` check or a wrapper compatible with the project's supported script-loading convention. Add a test for the chosen contract rather than silently changing browser behavior.

## Failure diagnosis

- If evaluation continues after disposal, the trigger or the original computed subscription was not fully detached.
- If repeated disposal throws, cleanup is not idempotent.
- If the original dispose path is skipped, subscriber/resource cleanup may regress.
- If browser loading fails only when `ko` is absent, the wrapper needs a guarded error or explicit dependency contract.
- If tests are flaky when checking subscriptions, replace timing/process-level assertions with deterministic subscription counters.

## Completion criteria

- The lifecycle regression tests fail before the production fix and pass after it.
- Existing 16 tests remain green.
- The test suite documents the supported post-disposal contract.
- The implementation plan and specification remain aligned with the final code.
