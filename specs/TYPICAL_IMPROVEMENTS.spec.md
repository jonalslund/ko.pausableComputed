# Specification: Typical Improvements for ko.pausableComputed

## Overview

This specification defines three typical evolution paths for `ko.pausableComputed` that enhance developer experience, performance, and coordination without changing the core pause/unpause semantics.

## Scope

This document specifies:

1. **Deferred Evaluation Mode**: Option to start paused by default.
2. **Batch Pause/Unpause API**: Coordinate multiple pausable computeds atomically.

> **Note**: TypeScript Definitions were removed from this specification. TypeScript support requires significant infrastructure changes (tsconfig.json, build pipeline, devDependencies) and is better handled as a separate initiative.

All changes must preserve backward compatibility with the existing API.

---

## Backward Compatibility Guarantee

All existing APIs and behaviors MUST remain unchanged. New features are opt-in only and do not affect existing code.

---

## 1. Deferred Evaluation Mode

### Required Behavior

- The `ko.pausableComputed` factory MUST accept a `deferred` option (boolean, default `false`).
- When `deferred: true`, the computed MUST start in a paused state (`paused() === true`).
- The computed MUST NOT evaluate until explicitly unpaused via `paused(false)`.
- After unpausing, the computed MUST behave identically to a non-deferred pausable computed.
- The `deferred` option MUST be orthogonal to all other options (e.g., `pure`, `owner`).

### Example

```javascript
const a = ko.observable(1);
const b = ko.observable(2);

// Starts paused - no initial evaluation
const computed = ko.pausableComputed(
  () => a() + b(),
  null,
  { deferred: true }
);

// or with options object syntax:
const computed2 = ko.pausableComputed({
  read: () => a() + b(),
  deferred: true
});

console.log(computed.paused()); // true
console.log(computed());       // undefined (not evaluated yet)

computed.paused(false);
console.log(computed());       // 3 (now evaluated)
```

### Acceptance Criteria

- Deferred computeds start paused
- No evaluation occurs until unpaused
- Works with all constructor overloads
- Batches changes correctly when unpaused
- Existing tests still pass

---

## 2. Batch Pause/Unpause API

### Required Behavior

- The `ko.pausableComputed` namespace MUST expose static methods:
  - `pauseAll(computeds: KnockoutPausableComputed<any>[]): void`
  - `resumeAll(computeds: KnockoutPausableComputed<any>[]): void`
- These methods MUST atomically pause/resume all provided pausable computeds.
- The methods MUST be idempotent (pausing an already-paused computed is a no-op).
- The methods MUST preserve the original pause state of each computed (so `resumeAll` restores the *previous* state, not just unpauses).
- The methods MUST throw a `TypeError` if any argument is not a pausable computed.

### Implementation Note

> **IMPORTANT**: When implementing `pauseAll`/`resumeAll`, **DO NOT** store state on computed objects directly (property pollution). **USE** WeakMap to avoid property collisions:
> ```javascript
> var originalStates = new WeakMap();
> originalStates.set(computed, computed.paused());
> ```

### Example

```javascript
const c1 = ko.pausableComputed(() => a());
const c2 = ko.pausableComputed(() => b());
const c3 = ko.pausableComputed(() => c());

// Pause all three
ko.pausableComputed.pauseAll([c1, c2, c3]);

// Make many changes - only one evaluation per computed when resumed
a(1);
b(2);
c(3);
a(4);
b(5);

// Resume all three - each evaluates once
ko.pausableComputed.resumeAll([c1, c2, c3]);

console.log(c1()); // 4
console.log(c2()); // 5
console.log(c3()); // 3
```

### Acceptance Criteria

- `pauseAll` and `resumeAll` work with any number of pausable computeds.
- Non-pausable computeds passed to these methods cause a `TypeError`.
- The batch operations are atomic from the perspective of dependency tracking.
- The original pause state of each computed is preserved across `pauseAll`/`resumeAll` cycles.
- Uses WeakMap for state storage (no property pollution).

---

## Test Cases

### Deferred Evaluation Mode

1. Create a deferred computed and verify it starts paused.
2. Verify no evaluation occurs until unpaused.
3. Verify evaluation occurs exactly once after unpausing, even if dependencies changed multiple times while deferred.
4. Verify deferred computeds work with all constructor syntaxes.

### Batch Pause/Unpause API

1. Pause multiple computeds, change dependencies, resume, and verify each evaluates exactly once.
2. Call `pauseAll` on already-paused computeds and verify no errors.
3. Call `resumeAll` and verify each computed returns to its pre-pause state.
4. Pass a non-pausable computed to `pauseAll` and verify `TypeError` is thrown.
5. Pass an empty array to both methods and verify no errors.
6. Verify state storage uses WeakMap (no property pollution).

---

## Non-Goals

- Changing the existing `paused()` or `evaluateImmediate()` API.
- Adding new dependencies beyond Knockout.
- Supporting the batch API on non-pausable computeds (they must be pausable computeds).
- TypeScript definitions (separate initiative).

---

## Verification Checklist

- [ ] Deferred computeds start paused
- [ ] No evaluation occurs until unpaused
- [ ] Works with all constructor overloads
- [ ] Batches changes correctly when unpaused
- [ ] Existing tests still pass
- [ ] `pauseAll` pauses all provided computeds
- [ ] `resumeAll` resumes all provided computeds
- [ ] Batch operations trigger exactly one evaluation per computed on resume
- [ ] Original pause state is preserved
- [ ] TypeError thrown for non-pausable computeds
- [ ] Works with empty arrays
- [ ] Idempotent operations
- [ ] Uses WeakMap for state storage
