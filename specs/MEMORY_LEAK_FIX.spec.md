# Specification: Memory Leak Fix

## Problem

The current implementation of `ko.pausableComputed` creates an internal `evaluateTrigger` observable that is never cleaned up when the pausable computed is disposed. This creates a memory leak because:

1. The `evaluateTrigger` observable maintains its own subscription tracking
2. When the computed is disposed, the trigger observable remains in memory
3. If many pausable computeds are created and disposed, memory usage grows

## Current Implementation Issue

In `src/ko.pausableComputed.js`:
```javascript
var evaluateTrigger = ko.observable();
// ... later ...
computed = ko.computed(function () {
    evaluateTrigger();  // Registers dependency
    // ...
});
```

The `evaluateTrigger` observable is created in the closure but never disposed.

## Solution

Override the `dispose` method on the computed to clean up the `evaluateTrigger` observable:

```javascript
var originalDispose = computed.dispose || function() {};
computed.dispose = function() {
    evaluateTrigger.dispose();
    originalDispose.apply(this, arguments);
};
```

## TDD Approach

### Step 1: Write a failing test
Create a test that verifies the memory leak by:
1. Creating a pausable computed
2. Disposing it
3. Checking that internal observables are cleaned up

### Step 2: Implement the fix
Add the dispose override as shown above.

### Step 3: Verify the fix
Run the test to ensure it passes.

## Test Strategy

```javascript
describe('Memory management', () => {
    it('should clean up evaluateTrigger on dispose', () => {
        const computed = ko.pausableComputed(() => 42);
        
        // Access internal trigger (may need to expose for testing)
        // or verify that disposing doesn't cause memory issues
        
        computed.dispose();
        
        // Verify cleanup happened
        // (This might require exposing internals or using weak references)
    });

    it('should not leak memory when creating and disposing many pausable computeds', () => {
        const initialCount = ko.subscribable.fn.getSubscriptionsCount();
        
        for (let i = 0; i < 100; i++) {
            const computed = ko.pausableComputed(() => i);
            computed.dispose();
        }
        
        // Should not have significantly more subscriptions
        const finalCount = ko.subscribable.fn.getSubscriptionsCount();
        expect(finalCount).toBeLessThan(initialCount + 10);
    });
});
```

## Implementation Notes

The fix is minimal and follows Knockout's pattern of allowing custom disposal logic. The `evaluateTrigger` observable is an implementation detail that should be cleaned up when the computed is disposed.
