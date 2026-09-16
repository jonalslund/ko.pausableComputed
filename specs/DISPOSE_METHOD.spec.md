# Specification: Dispose Method Enhancement

## Problem

The current implementation does not provide a custom `dispose` method for the pausable computed. While the computed itself is a standard Knockout computed and inherits `dispose`, the internal `evaluateTrigger` observable is not cleaned up.

This is related to the memory leak issue but focuses specifically on the API design.

## Current Implementation

The pausable computed returns a standard `ko.computed` with two additional methods:
- `paused(isPaused)` - Get/set paused state
- `evaluateImmediate()` - Force immediate evaluation

But it does not override `dispose()`.

## Solution

Provide a proper `dispose` method that:
1. Cleans up the internal `evaluateTrigger` observable
2. Calls the original computed's dispose method
3. Maintains the chain of disposal

## TDD Approach

### Step 1: Write a failing test
```javascript
describe('dispose method', () => {
    it('should have a dispose method', () => {
        const computed = ko.pausableComputed(() => 42);
        expect(typeof computed.dispose).toBe('function');
    });

    it('should clean up resources when disposed', () => {
        const computed = ko.pausableComputed(() => 42);
        
        // Spy on or verify internal cleanup
        computed.dispose();
        
        // Should not throw when accessing disposed computed
        // (Knockout computeds typically handle this gracefully)
    });

    it('should allow multiple disposals without error', () => {
        const computed = ko.pausableComputed(() => 42);
        
        computed.dispose();
        computed.dispose(); // Should not throw
    });

    it('should not allow evaluation after dispose', () => {
        const computed = ko.pausableComputed(() => 42);
        
        computed.dispose();
        
        // In Knockout, accessing a disposed computed typically returns undefined
        // or throws an error depending on version
        expect(() => computed()).not.toThrow();
    });
});
```

### Step 2: Implement the fix

Add to `src/ko.pausableComputed.js`:
```javascript
// Store original dispose
var originalDispose = computed.dispose;

// Override dispose to clean up evaluateTrigger
computed.dispose = function() {
    // Clean up the trigger observable
    if (evaluateTrigger && evaluateTrigger.dispose) {
        evaluateTrigger.dispose();
    }
    
    // Call original dispose
    if (originalDispose) {
        originalDispose.apply(this, arguments);
    }
};
```

### Step 3: Verify the fix

Run the tests to ensure:
1. Dispose method exists and works
2. Internal resources are cleaned up
3. Multiple disposals don't cause errors
4. Behavior is consistent with Knockout's computed dispose

## Additional Considerations

1. **Dispose order**: The `evaluateTrigger` should be disposed before or after the computed?
   - Before: Ensures no notifications can be triggered during disposal
   - After: Follows typical teardown order
   - Recommendation: Before, to prevent any edge cases

2. **Null checks**: Ensure `evaluateTrigger` exists and has a dispose method

3. **Idempotency**: Disposing multiple times should be safe

## Implementation Priority

This should be implemented alongside the memory leak fix, as they address the same underlying issue from different perspectives (API design vs. memory management).
