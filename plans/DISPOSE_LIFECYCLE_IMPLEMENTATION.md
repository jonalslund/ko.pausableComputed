# Implementation Plan: Dispose and Lifecycle Cleanup

## Objective

Implement the missing lifecycle cleanup for `ko.pausableComputed` without changing its existing pause, batching, or evaluation semantics.

## Current risk

`src/ko.pausableComputed.js` creates `evaluateTrigger` and registers it as a dependency, but the returned computed does not override `dispose`. The new specification therefore describes a real regression against the current branch rather than a hypothetical enhancement.

## Proposed design

1. Keep a reference to the computed's original `dispose` method immediately after creating the computed.
2. Add a private `isDisposed` flag, initialized to `false`.
3. Replace `computed.dispose` with an idempotent wrapper:
   - return immediately if `isDisposed` is already `true`;
   - set `isDisposed` before cleanup to prevent re-entrant disposal;
   - dispose or otherwise detach `evaluateTrigger` when the supported Knockout API permits it;
   - invoke the original computed dispose with the original `this` value and arguments.
4. Ensure `evaluateImmediate` and the pause transition do not cause work after disposal. Either make them no-ops after disposal or ensure the disposed computed cannot be triggered.
5. Preserve the existing public methods and the existing behavior for non-disposed computeds.

## Compatibility considerations

- Confirm whether the target Knockout version exposes `dispose` on an observable. If it does not, use the supported equivalent cleanup mechanism instead of calling a nonexistent method.
- Preserve the original dispose call even if trigger cleanup is unavailable; cleanup should not prevent Knockout's own disposal.
- Avoid exposing `evaluateTrigger` solely for tests.
- Do not use a global `ko` reference in the CommonJS path.

## Implementation sequence

1. Add lifecycle tests from `specs/PAUSABLE_COMPUTED_LIFECYCLE_REGRESSION.spec.md`.
2. Run the tests against the current implementation and record the expected failures.
3. Implement the disposal wrapper and post-disposal guards.
4. Run the complete Jest suite.
5. Manually inspect the generated package behavior in both CommonJS and browser-like loading contexts.

## Verification checklist

- Existing pause/unpause tests remain green.
- A dependency changed after disposal does not invoke the evaluator.
- Repeated disposal is safe.
- Subscribers receive no post-disposal notifications.
- The original Knockout disposal path is invoked.
- CommonJS loading still returns the Knockout instance with the extension installed.
- No undocumented Knockout internals are required for production behavior.

## Out of scope

- Fixing documentation typos.
- Introducing a heap-profiler-based memory test into Jest.
- Refactoring the pause implementation unrelated to lifecycle cleanup.
