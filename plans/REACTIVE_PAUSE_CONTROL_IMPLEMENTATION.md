# Implementation Plan: Reactive Pause Control for ko.pausableComputed

## Overview

This plan covers the implementation of **reactive pause control**, an out-of-the-ordinary enhancement that allows pause state to be controlled by an observable rather than imperative method calls.

**Key Principle**: The `pauseControl` observable is the source of truth for the computed's pause state. When it changes, the computed's pause state updates synchronously.

---

## Implementation Strategy

### Core Changes

1. Accept a `pauseControl` option at construction
2. Subscribe to the `pauseControl` observable
3. Synchronize the computed's pause state with the observable's value
4. Handle lifecycle and edge cases

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Precedence | `pauseControl` overrides imperative `paused()` | Predictable, single source of truth |
| Sync Timing | Synchronous updates | Prevents race conditions |
| Error Handling | Treat observable errors as `true` (paused) | Fail-safe, prevents infinite loops |
| Subscription | Use Knockout's subscription mechanism | Consistent with Knockout patterns |
| Cleanup | Unsubscribe on computed disposal | Prevents memory leaks |

---

## Detailed Implementation Steps

### Step 1: Update Factory Signature

Modify the factory to accept and validate the `pauseControl` option.

```javascript
// In the input pre-processing section:
var pauseControl = null;

if (evaluatorFunctionOrOptions && typeof evaluatorFunctionOrOptions === "object") {
  options = evaluatorFunctionOrOptions;
  originalReadFunction = options["read"];
  pauseControl = options["pauseControl"];
} else {
  options = options || {};
  if (!originalReadFunction) {
    originalReadFunction = options["read"];
  }
  pauseControl = options["pauseControl"];
  options["owner"] = options["owner"] || evaluatorFunctionTarget;
}

// Validate pauseControl
if (pauseControl !== null && pauseControl !== undefined) {
  if (typeof pauseControl !== 'function' && 
      !(typeof pauseControl.subscribe === 'function')) {
    throw new TypeError('pauseControl must be an observable');
  }
}
```

### Step 2: Initialize Pause State from Control

```javascript
// Determine initial paused state
var paused = false;
if (pauseControl) {
  try {
    paused = !!pauseControl();
  } catch (e) {
    paused = true; // Fail-safe: pause on error
  }
}
```

### Step 3: Subscribe to Pause Control

Add subscription setup after the computed is created:

```javascript
var pauseControlSubscription = null;

if (pauseControl) {
  pauseControlSubscription = pauseControl.subscribe(function(newValue) {
    if (isDisposed) {
      return;
    }
    var shouldPause = true;
    try {
      shouldPause = !!newValue;
    } catch (e) {
      shouldPause = true; // Fail-safe
    }
    
    if (paused !== shouldPause) {
      paused = shouldPause;
      // When unpausing, trigger evaluation if there are pending notifications
      if (!paused && hasPendingNotifications) {
        computed.evaluateImmediate();
      }
    }
  });
}
```

### Step 4: Override `paused()` Method

When `pauseControl` is set, the `paused()` method should reflect the control's state:

```javascript
computed.paused = function (isPaused) {
  if (isDisposed) {
    return paused;
  }
  
  // If pauseControl is set, it's the source of truth
  if (pauseControl !== null && pauseControl !== undefined) {
    if (isPaused === void 0) {
      // Getter: return the effective pause state
      try {
        return !!pauseControl();
      } catch (e) {
        return true; // Fail-safe
      }
    } else {
      // Setter: no-op when pauseControl is active
      // This is intentional - pauseControl is the source of truth
      return paused;
    }
  }
  
  // Original implementation for non-pauseControl computeds
  if (isPaused === void 0) {
    return paused;
  } else {
    if (paused === isPaused) {
      return paused;
    }
    paused = isPaused;
    if (!paused && hasPendingNotifications) {
      computed.evaluateImmediate();
    }
    return paused;
  }
};
```

### Step 5: Update Dispose Method

Clean up the `pauseControl` subscription:

```javascript
computed.dispose = function () {
  if (isDisposed) {
    return;
  }
  isDisposed = true;
  hasPendingNotifications = false;
  
  // Clean up pauseControl subscription
  if (pauseControlSubscription) {
    pauseControlSubscription.dispose();
    pauseControlSubscription = null;
  }
  
  if (evaluateTrigger && typeof evaluateTrigger.dispose === "function") {
    evaluateTrigger.dispose();
  }
  if (originalDispose) {
    originalDispose.apply(this, arguments);
  }
};
```

### Step 6: Handle Pause Control Disposal

If the `pauseControl` observable is disposed externally, we need to handle it gracefully:

```javascript
// In the pauseControl subscription:
pauseControlSubscription = pauseControl.subscribe(function(newValue) {
  if (isDisposed) {
    // If the computed is disposed, clean up this subscription
    // This handles the case where pauseControl is disposed first
    if (pauseControlSubscription) {
      pauseControlSubscription.dispose();
      pauseControlSubscription = null;
    }
    return;
  }
  // ... rest of the handler
});
```

Actually, Knockout subscriptions are automatically cleaned up when the observable is disposed, so we just need to ensure our reference is cleared.

### Step 7: Add Tests

Add comprehensive tests to `__tests__/ko.pausableComputed.test.js`:

```javascript
describe('Reactive pause control', () => {
  it('should accept pauseControl option', () => {
    const control = ko.observable(false);
    const computed = ko.pausableComputed(() => 42, null, { pauseControl: control });
    expect(computed.paused()).toBe(false);
  });

  it('should start paused when pauseControl is true', () => {
    const control = ko.observable(true);
    const computed = ko.pausableComputed(() => 42, null, { pauseControl: control });
    expect(computed.paused()).toBe(true);
  });

  it('should pause when pauseControl changes to true', () => {
    const control = ko.observable(false);
    const a = ko.observable(1);
    let evaluationCount = 0;
    
    const computed = ko.pausableComputed(() => {
      evaluationCount++;
      return a();
    }, null, { pauseControl: control });
    
    computed();
    expect(evaluationCount).toBe(1);
    
    control(true);
    expect(computed.paused()).toBe(true);
    
    a(2);
    expect(evaluationCount).toBe(1); // No evaluation while paused
  });

  it('should unpause and evaluate when pauseControl changes to false', () => {
    const control = ko.observable(true);
    const a = ko.observable(1);
    let evaluationCount = 0;
    
    const computed = ko.pausableComputed(() => {
      evaluationCount++;
      return a();
    }, null, { pauseControl: control });
    
    a(2);
    expect(evaluationCount).toBe(0);
    
    control(false);
    expect(evaluationCount).toBe(1);
    expect(computed()).toBe(2);
  });

  it('should batch changes while paused by control', () => {
    const control = ko.observable(true);
    const a = ko.observable(1);
    let evaluationCount = 0;
    
    const computed = ko.pausableComputed(() => {
      evaluationCount++;
      return a();
    }, null, { pauseControl: control });
    
    a(2);
    a(3);
    a(4);
    
    control(false);
    
    expect(evaluationCount).toBe(1);
    expect(computed()).toBe(4);
  });

  it('should make imperative paused() a no-op when pauseControl is set', () => {
    const control = ko.observable(true);
    const computed = ko.pausableComputed(() => 42, null, { pauseControl: control });
    
    computed.paused(false); // Should have no effect
    expect(computed.paused()).toBe(true);
    
    control(false);
    expect(computed.paused()).toBe(false);
  });

  it('should return effective pause state from paused() getter', () => {
    const control = ko.observable(true);
    const computed = ko.pausableComputed(() => 42, null, { pauseControl: control });
    
    expect(computed.paused()).toBe(true);
    
    control(false);
    expect(computed.paused()).toBe(false);
  });

  it('should throw TypeError for non-observable pauseControl', () => {
    expect(() => {
      ko.pausableComputed(() => 42, null, { pauseControl: true });
    }).toThrow(TypeError);
    
    expect(() => {
      ko.pausableComputed(() => 42, null, { pauseControl: {} });
    }).toThrow(TypeError);
  });

  it('should handle pauseControl throwing during evaluation', () => {
    const control = ko.observable(false);
    // Override to throw
    control.peek = jest.fn(() => { throw new Error('test'); });
    
    const computed = ko.pausableComputed(() => 42, null, { pauseControl: control });
    
    // Should treat as paused (true) when it throws
    expect(computed.paused()).toBe(true);
  });

  it('should clean up pauseControl subscription on dispose', () => {
    const control = ko.observable(false);
    const computed = ko.pausableComputed(() => 42, null, { pauseControl: control });
    
    const subscriptionsBefore = control.getSubscriptionsCount();
    expect(subscriptionsBefore).toBeGreaterThan(0);
    
    computed.dispose();
    
    const subscriptionsAfter = control.getSubscriptionsCount();
    expect(subscriptionsAfter).toBe(0);
  });

  it('should work with computed observable as pauseControl', () => {
    const isBusy = ko.observable(false);
    const shouldPause = ko.computed(() => isBusy());
    const a = ko.observable(1);
    let evaluationCount = 0;
    
    const computed = ko.pausableComputed(() => {
      evaluationCount++;
      return a();
    }, null, { pauseControl: shouldPause });
    
    computed();
    expect(evaluationCount).toBe(1);
    
    isBusy(true);
    a(2);
    expect(evaluationCount).toBe(1); // Still paused
    
    isBusy(false);
    expect(evaluationCount).toBe(2); // Evaluated once
  });

  it('should work with options object syntax', () => {
    const control = ko.observable(true);
    const computed = ko.pausableComputed({
      read: () => 42,
      pauseControl: control
    });
    
    expect(computed.paused()).toBe(true);
    
    control(false);
    expect(computed.paused()).toBe(false);
  });

  it('should handle pauseControl disposal gracefully', () => {
    const control = ko.observable(false);
    const computed = ko.pausableComputed(() => 42, null, { pauseControl: control });
    
    // Dispose the control
    control.dispose();
    
    // Computed should still work (with last known state)
    expect(computed.paused()).toBe(false);
    expect(computed()).toBe(42);
  });

  it('should not notify subscribers when paused by control', () => {
    const control = ko.observable(false);
    const a = ko.observable(1);
    let notificationCount = 0;
    
    const computed = ko.pausableComputed(() => a(), null, { pauseControl: control });
    computed.subscribe(() => { notificationCount++; });
    
    computed(); // Initial
    notificationCount = 0;
    
    control(true);
    a(2);
    expect(notificationCount).toBe(0);
    
    control(false);
    expect(notificationCount).toBe(1);
  });
});
```

---

## Verification Checklist

### Functional Tests
- [ ] Computed starts in correct state based on `pauseControl`
- [ ] Pause state updates when `pauseControl` changes
- [ ] Evaluation is batched when unpaused via `pauseControl`
- [ ] Imperative `paused()` reflects effective state
- [ ] Imperative `paused()` setter is a no-op when `pauseControl` is set
- [ ] TypeError thrown for invalid `pauseControl`
- [ ] Handles `pauseControl` observable errors gracefully
- [ ] Subscription cleaned up on computed disposal
- [ ] Works with computed observables as `pauseControl`
- [ ] Works with all constructor overloads
- [ ] Handles `pauseControl` disposal gracefully

### Integration Tests
- [ ] Works with existing pause/unpause functionality
- [ ] Works with deferred evaluation mode (if implemented)
- [ ] Works with pure computeds
- [ ] No memory leaks

### Edge Cases
- [ ] `pauseControl: undefined` or `null` works as no-op
- [ ] Rapid toggling of `pauseControl`
- [ ] Multiple computeds sharing the same `pauseControl`
- [ ] Nested pause control scenarios

---

## Implementation Sequence

1. **Add option processing**: Parse and validate `pauseControl` option
2. **Initialize pause state**: Set initial paused state from `pauseControl()`
3. **Add subscription**: Subscribe to `pauseControl` and update pause state
4. **Modify paused() method**: Make it reflect `pauseControl` state
5. **Update dispose**: Clean up `pauseControl` subscription
6. **Add tests**: Write all tests before finalizing implementation
7. **Run tests**: Verify all existing and new tests pass

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing API | All existing tests must pass; new feature is opt-in |
| Memory leaks | Proper subscription cleanup in dispose |
| Performance overhead | Minimal: one extra subscription per computed with pauseControl |
| Complexity | Clear documentation and examples |
| Edge cases | Comprehensive test coverage |

---

## Rollback Plan

If issues are discovered:
1. The feature is implemented as a separate, optional code path
2. Simply revert the changes to `src/ko.pausableComputed.js`
3. Remove the tests for this feature
4. All existing functionality remains intact

---

## Success Criteria

- All existing tests pass
- All new reactive pause control tests pass
- No memory leaks (subscriptions are cleaned up)
- No breaking changes to existing API
- The feature works in both CommonJS and browser environments
- Performance impact is negligible for computeds without `pauseControl`

---

## Future Considerations

### Potential Extensions

1. **Bidirectional binding**: Allow changes to pause state via `paused()` to update the `pauseControl` observable (would require `pauseControl` to be writable)
2. **Multiple pause controls**: Support AND/OR logic for multiple control observables
3. **Pause control with debounce**: Combine with Knockout's rate limiting

### Not Recommended

- Making `pauseControl` the default behavior (breaks backward compatibility)
- Automatic pause control inference (too magical, hard to debug)
- Global pause control (violates encapsulation)
