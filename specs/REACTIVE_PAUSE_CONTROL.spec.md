# Specification: Reactive Pause Control for ko.pausableComputed

## Overview

This specification defines an **out-of-the-ordinary** enhancement that enables pause state to be controlled *reactively* via an observable, rather than imperatively via method calls. This inverts the control flow and allows pause state to respond to application state changes declaratively.

## Core Concept

Instead of:
```javascript
computed.paused(true);  // imperative
```

Enable:
```javascript
const isBusy = ko.observable(false);
const computed = ko.pausableComputed(evaluator, {
  pauseControl: isBusy
});

isBusy(true);  // computed automatically pauses
isBusy(false); // computed automatically resumes
```

## Scope

This document specifies:

1. The `pauseControl` option for `ko.pausableComputed`.
2. Reactive behavior when the pause control observable changes.
3. Interaction with the existing imperative `paused()` API.
4. Edge cases and lifecycle considerations.

---

## Required Behavior

### 1. Pause Control Option

- The factory MUST accept a `pauseControl` option of type `KnockoutObservable<boolean>` or a function returning a boolean observable.
- When `pauseControl` is provided, the computed's pause state MUST track the observable's value:
  - If `pauseControl()` is `true`, the computed MUST be paused.
  - If `pauseControl()` is `false` or falsy, the computed MUST be unpaused.
- The `pauseControl` option MUST be orthogonal to all other options.

### 2. Reactive Synchronization

- The computed MUST subscribe to the `pauseControl` observable.
- When `pauseControl` changes, the computed MUST update its pause state *synchronously*.
- If the computed transitions from paused to unpaused due to `pauseControl` changing, it MUST trigger a re-evaluation if there are pending notifications (same as calling `paused(false)`).
- The subscription to `pauseControl` MUST be established *before* the computed's first evaluation.

### 3. API Compatibility

- The imperative `paused()` method MUST continue to work.
- When `pauseControl` is set:
  - `paused()` **getter** returns `!!pauseControl()` (the effective pause state from the control)
  - `paused()` **setter** is a **no-op** (pauseControl is the single source of truth)
- This ensures predictable behavior with a clear precedence: pauseControl > imperative calls.

### 4. Lifecycle

- If the `pauseControl` observable is disposed, the computed MUST fall back to its last known pause state (or unpaused, as a safe default).
- Disposing the computed MUST clean up the subscription to `pauseControl`.
- If `pauseControl` is disposed while the computed is still active, the computed MUST NOT throw and MUST continue to work with its last known pause state.

### 5. Edge Cases

- If `pauseControl` is `undefined` or `null`, the computed MUST behave as if no `pauseControl` was provided.
- If `pauseControl` is not an observable, the factory MUST throw a `TypeError` during construction.

### Error Handling

- If `pauseControl()` throws during evaluation (e.g., the observable's evaluator throws), the computed MUST treat it as `true` (paused) as a fail-safe to prevent infinite loops and ensure stability.

---

## Example Usage

### Basic Reactive Pause

```javascript
const isModalOpen = ko.observable(false);
const heavyComputed = ko.pausableComputed(
  () => expensiveCalculation(),
  null,
  { pauseControl: isModalOpen }
);

// When modal opens, heavy computation pauses automatically
isModalOpen(true);

// When modal closes, heavy computation resumes and re-evaluates once
isModalOpen(false);
```

### Coordinated Pause Control

```javascript
const isDragging = ko.observable(false);
const isLoading = ko.observable(false);

// Combine observables - pause when EITHER is true
const shouldPause = ko.computed(() => isDragging() || isLoading());

const computed = ko.pausableComputed(
  () => a() + b(),
  { pauseControl: shouldPause }
);

// Now computed pauses during drag OR load
```

### With Options Object Syntax

```javascript
const computed = ko.pausableComputed({
  read: () => a() + b(),
  pauseControl: isPausedObservable,
  pure: true
});
```

---

## Acceptance Criteria

1. A computed with `pauseControl` starts in the state matching the observable's initial value.
2. Changing the `pauseControl` observable pauses/unpauses the computed.
3. When unpaused via `pauseControl`, pending notifications trigger exactly one re-evaluation.
4. The imperative `paused()` method does not override `pauseControl` (or follows the documented precedence rule).
5. Disposing the computed cleans up the `pauseControl` subscription.
6. Invalid `pauseControl` values throw `TypeError` at construction time.
7. Disposing the `pauseControl` observable does not break the computed.

---

## Test Cases

### Basic Functionality
1. Create a computed with `pauseControl: ko.observable(true)` and verify it starts paused.
2. Change `pauseControl` to `false` and verify the computed unpauses and evaluates.
3. Change dependencies while `pauseControl` is `true`, then set it to `false`, and verify exactly one evaluation occurs.

### Precedence and Interaction
4. Create a computed with `pauseControl`, call `paused(false)` imperatively, and verify the computed remains paused (if `pauseControl` is `true`).
5. Verify that `paused()` getter still returns the effective pause state (controlled by `pauseControl`).

### Lifecycle
6. Dispose a computed with `pauseControl` and verify the subscription to `pauseControl` is cleaned up.
7. Dispose the `pauseControl` observable and verify the computed continues to work with its last known state.

### Error Handling
8. Pass a non-observable as `pauseControl` and verify `TypeError` is thrown.
9. Pass `undefined` as `pauseControl` and verify the computed works normally.
10. Make the `pauseControl` observable throw during evaluation and verify the computed pauses safely.

### Edge Cases
11. Create a computed with `pauseControl: ko.observable(false)` and verify it starts unpaused.
12. Rapidly toggle `pauseControl` and verify the computed's pause state tracks correctly.
13. Use `pauseControl` with a computed observable that depends on other observables.

---

## Design Decisions

### Why PauseControl Takes Precedence

Giving `pauseControl` precedence over imperative `paused()` ensures predictable behavior. With precedence, users know: "if you set `pauseControl`, that's the source of truth." The setter being a no-op prevents confusion about which mechanism controls the pause state.

### Why Synchronous Updates

Synchronous updates ensure that the pause state is always consistent with the `pauseControl` observable. This prevents race conditions where a dependency change and a pause control change could interact unpredictably.

### Why Fail-Safe on Errors

If the `pauseControl` observable throws, treating it as paused (`true`) prevents infinite evaluation loops and ensures the computed doesn't break the application. This is a conservative, safe default.

---

## Non-Goals

- Supporting `pauseControl` as a non-observable function (it must be an observable).
- Adding a `pauseControl` property to the computed instance (use the option at construction only).
- Making `pauseControl` bidirectional (changing pause state imperatively does not update the observable).
