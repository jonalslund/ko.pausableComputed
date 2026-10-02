# Implementation Plan: Typical Improvements for ko.pausableComputed

## Overview

This plan covers the implementation of two typical improvements:
1. Deferred Evaluation Mode
2. Batch Pause/Unpause API

> **Note**: TypeScript Definitions have been removed from this plan. TypeScript support requires significant infrastructure changes (tsconfig.json, build pipeline, devDependencies) and is better handled as a separate initiative.

All implementations must follow TDD: tests first, then minimal production code changes.

---

## Backward Compatibility Guarantee

All existing APIs and behaviors MUST remain unchanged. New features are opt-in only and do not affect existing code.

---

## 1. Deferred Evaluation Mode

### Implementation Steps

1. **Add deferred option handling**: Modify the factory to accept and process the `deferred` option.
2. **Initialize paused state**: If `deferred: true`, start with `paused = true`.
3. **Preserve existing behavior**: Non-deferred computeds work exactly as before.

### Detailed Tasks

#### Step 1.1: Update option processing

In `src/ko.pausableComputed.js`, modify the input pre-processing:

```javascript
// Extract deferred option
var deferred = false;

if (evaluatorFunctionOrOptions && typeof evaluatorFunctionOrOptions === "object") {
  options = evaluatorFunctionOrOptions;
  originalReadFunction = options["read"];
  deferred = options["deferred"] === true;
} else {
  options = options || {};
  if (!originalReadFunction) {
    originalReadFunction = options["read"];
  }
  deferred = options["deferred"] === true;
  options["owner"] = options["owner"] || evaluatorFunctionTarget;
}
```

#### Step 1.2: Initialize paused state

```javascript
var paused = deferred;  // Start paused if deferred is true
```

#### Step 1.3: Add tests to `__tests__/ko.pausableComputed.test.js`

Add a new describe block:

```javascript
describe('Deferred evaluation mode', () => {
  it('should start paused when deferred: true', () => {
    const computed = ko.pausableComputed(() => 42, null, { deferred: true });
    expect(computed.paused()).toBe(true);
  });

  it('should not evaluate until unpaused', () => {
    const a = ko.observable(1);
    let evaluationCount = 0;
    const computed = ko.pausableComputed(() => {
      evaluationCount++;
      return a();
    }, null, { deferred: true });

    expect(evaluationCount).toBe(0);
    computed.paused(false);
    computed();
    expect(evaluationCount).toBe(1);
  });

  it('should work with options object syntax', () => {
    const computed = ko.pausableComputed({
      read: () => 42,
      deferred: true
    });
    expect(computed.paused()).toBe(true);
  });

  it('should batch changes while deferred and paused', () => {
    const a = ko.observable(1);
    let evaluationCount = 0;
    const computed = ko.pausableComputed(() => {
      evaluationCount++;
      return a();
    }, null, { deferred: true });

    a(2);
    a(3);
    computed.paused(false);
    
    expect(evaluationCount).toBe(1);
    expect(computed()).toBe(3);
  });
});
```

### Verification Checklist

- [ ] Deferred computeds start paused
- [ ] No evaluation occurs until unpaused
- [ ] Works with all constructor overloads
- [ ] Batches changes correctly when unpaused
- [ ] Existing tests still pass

### Compatibility Considerations

- Default behavior (non-deferred) must remain unchanged
- The `deferred` option should work with `pure` and other Knockout options
- Consider whether `deferred: false` should be explicitly allowed (it is the default)

---

## 2. Batch Pause/Unpause API

### Implementation Steps

1. **Add static methods**: Extend the factory to expose `pauseAll` and `resumeAll`.
2. **Implement pause tracking**: Store the original pause state for each computed using WeakMap.
3. **Implement batch operations**: Pause/resume all computeds atomically.

### Detailed Tasks

#### Step 2.1: Extend the factory return value

The factory currently returns `ko` for CommonJS or calls `factory(ko)` for browser. We need to add static methods to the pausableComputed function itself.

```javascript
// At the end of the factory function, before returning ko:
ko.pausableComputed.pauseAll = function(computeds) {
  // Implementation
};

ko.pausableComputed.resumeAll = function(computeds) {
  // Implementation
};
```

#### Step 2.2: Implement `pauseAll`

```javascript
// Use WeakMap to avoid property pollution
var originalPauseStates = new WeakMap();

ko.pausableComputed.pauseAll = function(computeds) {
  if (!Array.isArray(computeds)) {
    throw new TypeError('pauseAll requires an array of pausable computeds');
  }
  
  for (var i = 0; i < computeds.length; i++) {
    var c = computeds[i];
    if (!c || typeof c.paused !== 'function') {
      throw new TypeError('pauseAll requires pausable computeds');
    }
    // Store original state if not already stored
    if (!originalPauseStates.has(c)) {
      originalPauseStates.set(c, c.paused());
    }
    c.paused(true);
  }
};
```

#### Step 2.3: Implement `resumeAll`

```javascript
ko.pausableComputed.resumeAll = function(computeds) {
  if (!Array.isArray(computeds)) {
    throw new TypeError('resumeAll requires an array of pausable computeds');
  }
  
  for (var i = 0; i < computeds.length; i++) {
    var c = computeds[i];
    if (!c || typeof c.paused !== 'function') {
      throw new TypeError('resumeAll requires pausable computeds');
    }
    // Restore original state or unpause
    if (originalPauseStates.has(c)) {
      var originalState = originalPauseStates.get(c);
      c.paused(originalState);
      originalPauseStates.delete(c);
    } else {
      c.paused(false);
    }
  }
};
```

#### Step 2.4: Add tests to `__tests__/ko.pausableComputed.test.js`

Add a new describe block:

```javascript
describe('Batch pause/unpause API', () => {
  it('should pause multiple computeds', () => {
    const c1 = ko.pausableComputed(() => 1);
    const c2 = ko.pausableComputed(() => 2);
    
    ko.pausableComputed.pauseAll([c1, c2]);
    
    expect(c1.paused()).toBe(true);
    expect(c2.paused()).toBe(true);
  });

  it('should resume multiple computeds', () => {
    const c1 = ko.pausableComputed(() => 1);
    const c2 = ko.pausableComputed(() => 2);
    
    ko.pausableComputed.pauseAll([c1, c2]);
    ko.pausableComputed.resumeAll([c1, c2]);
    
    expect(c1.paused()).toBe(false);
    expect(c2.paused()).toBe(false);
  });

  it('should batch dependency changes into single evaluations', () => {
    const a = ko.observable(1);
    const b = ko.observable(2);
    let evalCount1 = 0, evalCount2 = 0;
    
    const c1 = ko.pausableComputed(() => {
      evalCount1++;
      return a();
    });
    const c2 = ko.pausableComputed(() => {
      evalCount2++;
      return b();
    });
    
    c1(); c2(); // Initial evaluations
    
    ko.pausableComputed.pauseAll([c1, c2]);
    a(10); b(20); a(15); b(25);
    
    ko.pausableComputed.resumeAll([c1, c2]);
    
    expect(evalCount1).toBe(2); // initial + 1 after resume
    expect(evalCount2).toBe(2);
    expect(c1()).toBe(15);
    expect(c2()).toBe(25);
  });

  it('should preserve original pause state on resumeAll', () => {
    const c1 = ko.pausableComputed(() => 1);
    const c2 = ko.pausableComputed(() => 2);
    
    c1.paused(true); // c1 was already paused
    
    ko.pausableComputed.pauseAll([c1, c2]);
    ko.pausableComputed.resumeAll([c1, c2]);
    
    expect(c1.paused()).toBe(true);  // Restored to original
    expect(c2.paused()).toBe(false); // Was not paused before
  });

  it('should throw TypeError for non-pausable computeds', () => {
    const c1 = ko.pausableComputed(() => 1);
    const c2 = ko.computed(() => 2); // Regular computed
    
    expect(() => {
      ko.pausableComputed.pauseAll([c1, c2]);
    }).toThrow(TypeError);
  });

  it('should work with empty array', () => {
    expect(() => {
      ko.pausableComputed.pauseAll([]);
      ko.pausableComputed.resumeAll([]);
    }).not.toThrow();
  });

  it('should be idempotent', () => {
    const c1 = ko.pausableComputed(() => 1);
    const c2 = ko.pausableComputed(() => 2);
    
    ko.pausableComputed.pauseAll([c1, c2]);
    ko.pausableComputed.pauseAll([c1, c2]); // Pause again
    
    expect(c1.paused()).toBe(true);
    expect(c2.paused()).toBe(true);
    
    ko.pausableComputed.resumeAll([c1, c2]);
    expect(c1.paused()).toBe(false);
    expect(c2.paused()).toBe(false);
  });
});
```

### Verification Checklist

- [ ] `pauseAll` pauses all provided computeds
- [ ] `resumeAll` resumes all provided computeds
- [ ] Batch operations trigger exactly one evaluation per computed on resume
- [ ] Original pause state is preserved
- [ ] TypeError thrown for non-pausable computeds
- [ ] Works with empty arrays
- [ ] Idempotent operations
- [ ] Uses WeakMap for state storage (no property pollution)

### Compatibility Considerations

- The static methods should be added to the `ko.pausableComputed` function object
- Ensure the methods work in both CommonJS and browser environments
- The WeakMap ensures no memory leaks and no property collisions

---

## Implementation Sequence

1. **Deferred Evaluation Mode** (medium risk, small runtime change)
   - Update option processing
   - Initialize paused state
   - Add tests
   - Run full test suite

2. **Batch Pause/Unpause API** (higher risk, new public API)
   - Add static methods
   - Implement pause tracking with WeakMap
   - Add tests
   - Run full test suite

---

## Rollback Plan

Each improvement should be implemented as a separate commit/PR:

1. If Deferred mode breaks anything: revert the `deferred` option handling
2. If Batch API breaks anything: remove the static methods

This allows each feature to be shipped independently.

---

## Success Criteria

- All existing tests pass
- All new tests pass
- No breaking changes to existing API
- Each feature can be used independently
