# Specification: Top 3 Bottom-Up Usage Patterns for ko.pausableComputed

## Overview

This specification defines the **three most widely applicable bottom-up patterns** that leverage `ko.pausableComputed` to solve common problems in Knockout applications. These patterns fill gaps in Knockout's core functionality without reinventing existing features.

**Selection Criteria**:
1. **Wider Usability**: Applicable to many common scenarios
2. **Knockout Gap**: No native Knockout mechanism provides this functionality
3. **Core Value**: Directly leverages pausable computed's unique capabilities
4. **Non-Redundant**: Doesn't duplicate existing libraries or Knockout features

---

## Pattern 1: Transaction Boundary

### Problem Statement

When updating multiple observables that a computed depends on, each change triggers a separate evaluation. For operations that should be treated as atomic (e.g., loading form data, applying bulk updates), this causes:
- Unnecessary intermediate evaluations
- Potential "flickering" of validation states
- Performance overhead from repeated calculations

### Solution

Use `ko.pausableComputed` to define **transaction boundaries** where multiple observable changes are treated as a single atomic operation.

### Required Behavior

1. **Pause on Entry**: When entering a transaction, pause the computed
2. **Bulk Changes**: Make all observable changes while paused
3. **Resume on Exit**: When exiting the transaction, resume the computed
4. **Single Evaluation**: All changes are evaluated exactly once upon resume

### Example: Form Data Loading

```javascript
function FormViewModel() {
    var self = this;
    
    // Form fields
    self.firstName = ko.observable('');
    self.lastName = ko.observable('');
    self.email = ko.observable('');
    
    // Validation computed (pausable)
    self.isValid = ko.pausableComputed(function() {
        return !!self.firstName() && 
               !!self.lastName() && 
               !!self.email();
    }, self);
    
    // Load form data from API
    self.loadData = function(data) {
        // PAUSE: Enter transaction boundary
        self.isValid.paused(true);
        
        // Make all changes (no validation triggered)
        self.firstName(data.firstName);
        self.lastName(data.lastName);
        self.email(data.email);
        
        // RESUME: Exit transaction boundary
        self.isValid.paused(false);
        
        // Validation runs ONCE with all final values
    };
}
```

### Why This is Valuable

- **No intermediate states**: Validation never sees partially-loaded data
- **Performance**: One evaluation instead of N evaluations for N fields
- **Consistency**: Same pattern works for any bulk update operation

### Test Cases

```javascript
describe('Transaction Boundary Pattern', () => {
    it('should prevent intermediate evaluations during transaction', () => {
        const a = ko.observable(1);
        const b = ko.observable(2);
        const c = ko.observable(3);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return a() + b() + c();
        });
        
        // Initial evaluation
        computed();
        expect(evaluationCount).toBe(1);
        
        // Transaction: pause, make changes, resume
        computed.paused(true);
        a(10);
        b(20);
        c(30);
        
        // Still only 1 evaluation (initial)
        expect(evaluationCount).toBe(1);
        
        computed.paused(false);
        
        // Now evaluated once with all final values
        expect(evaluationCount).toBe(2);
        expect(computed()).toBe(60); // 10 + 20 + 30
    });
    
    it('should work with form validation scenario', () => {
        const firstName = ko.observable('');
        const lastName = ko.observable('');
        let validationCount = 0;
        
        const isValid = ko.pausableComputed(() => {
            validationCount++;
            return !!firstName() && !!lastName();
        });
        
        // Load data
        isValid.paused(true);
        firstName('John');
        lastName('Doe');
        isValid.paused(false);
        
        // Validation ran once with complete data
        expect(validationCount).toBe(2); // initial + 1 after load
        expect(isValid()).toBe(true);
    });
    
    it('should handle nested transactions correctly', () => {
        const a = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return a();
        });
        
        computed();
        expect(evaluationCount).toBe(1);
        
        // Outer transaction
        computed.paused(true);
        a(2);
        
        // Inner transaction (already paused)
        computed.paused(true);
        a(3);
        
        // Resume inner
        computed.paused(false);
        
        // Still paused from outer
        expect(evaluationCount).toBe(1);
        
        // Resume outer
        computed.paused(false);
        
        // Evaluates once with final value
        expect(evaluationCount).toBe(2);
        expect(computed()).toBe(3);
    });
});
```

### Acceptance Criteria

- [ ] Multiple observable changes within a transaction trigger only one evaluation
- [ ] Transaction can be nested (pause while already paused)
- [ ] Resume triggers evaluation with all final values
- [ ] Works with validation scenarios
- [ ] No intermediate invalid states are exposed

---

## Pattern 2: Observable Coalescing

### Problem Statement

When multiple independent observables change simultaneously (e.g., multiple API responses arriving), each change triggers separate evaluations of dependent computeds. This causes:
- Multiple redundant calculations
- Multiple UI updates when one would suffice
- Performance issues with expensive computeds

### Solution

Use `ko.pausableComputed` to **coalesce** changes from multiple observables into a single evaluation.

### Required Behavior

1. **Pause on First Change**: When the first observable changes, pause the computed
2. **Buffer Subsequent Changes**: Additional changes while paused don't trigger evaluation
3. **Resume After Delay**: After a brief delay (or on explicit signal), resume and evaluate once
4. **Single Evaluation**: All buffered changes are evaluated together

### Example: Dashboard with Multiple Data Sources

```javascript
function DashboardViewModel() {
    var self = this;
    
    // Multiple data sources
    self.salesData = ko.observable(null);
    self.inventoryData = ko.observable(null);
    self.customerData = ko.observable(null);
    
    // Render count
    self.renderCount = ko.observable(0);
    
    // Pausable computed for dashboard rendering
    self.dashboardRenderer = ko.pausableComputed(function() {
        self.renderCount(self.renderCount() + 1);
        return renderDashboard({
            sales: self.salesData(),
            inventory: self.inventoryData(),
            customers: self.customerData()
        });
    }, self);
    
    // Coalesce function: pause on first change, resume after delay
    function coalesce() {
        if (self.dashboardRenderer.paused()) return;
        
        self.dashboardRenderer.paused(true);
        
        setTimeout(function() {
            self.dashboardRenderer.paused(false);
        }, 0);
    }
    
    // Subscribe all data sources to coalesce
    self.salesData.subscribe(coalesce);
    self.inventoryData.subscribe(coalesce);
    self.customerData.subscribe(coalesce);
    
    // Now when multiple data sources update simultaneously:
    // - First update pauses the renderer
    // - Subsequent updates see it's already paused
    // - After delay, one render with all final data
}
```

### Why This is Valuable

- **Cross-observable batching**: Works across unrelated observables
- **No manual tracking**: Doesn't need to know which observables changed
- **Framework-agnostic**: Works with any number of observables
- **Performance**: Reduces expensive operations to minimum necessary

### Test Cases

```javascript
describe('Observable Coalescing Pattern', () => {
    it('should coalesce multiple simultaneous changes into one evaluation', () => {
        const a = ko.observable(1);
        const b = ko.observable(2);
        const c = ko.observable(3);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return a() + b() + c();
        });
        
        // Setup coalescing
        function coalesce() {
            if (computed.paused()) return;
            computed.paused(true);
            setTimeout(() => computed.paused(false), 0);
        }
        
        a.subscribe(coalesce);
        b.subscribe(coalesce);
        c.subscribe(coalesce);
        
        // Initial
        computed();
        expect(evaluationCount).toBe(1);
        
        // Simulate simultaneous changes
        a(10);
        b(20);
        c(30);
        
        // Still only 1 evaluation (initial)
        expect(evaluationCount).toBe(1);
        
        // Wait for setTimeout
        return new Promise(resolve => {
            setTimeout(() => {
                expect(evaluationCount).toBe(2);
                expect(computed()).toBe(60);
                resolve();
            }, 10);
        });
    });
    
    it('should work with different numbers of observables', () => {
        const observables = [
            ko.observable(1),
            ko.observable(2),
            ko.observable(3),
            ko.observable(4),
            ko.observable(5)
        ];
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return observables.reduce((sum, obs) => sum + obs(), 0);
        });
        
        function coalesce() {
            if (computed.paused()) return;
            computed.paused(true);
            setTimeout(() => computed.paused(false), 0);
        }
        
        observables.forEach(obs => obs.subscribe(coalesce));
        
        computed();
        expect(evaluationCount).toBe(1);
        
        // Change all observables
        observables.forEach((obs, i) => obs(i * 10));
        
        expect(evaluationCount).toBe(1);
        
        return new Promise(resolve => {
            setTimeout(() => {
                expect(evaluationCount).toBe(2);
                resolve();
            }, 10);
        });
    });
    
    it('should handle rapid sequential changes', () => {
        const a = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return a();
        });
        
        function coalesce() {
            if (computed.paused()) return;
            computed.paused(true);
            setTimeout(() => computed.paused(false), 50);
        }
        
        a.subscribe(coalesce);
        
        computed();
        expect(evaluationCount).toBe(1);
        
        // Rapid changes
        a(2);
        a(3);
        a(4);
        a(5);
        
        expect(evaluationCount).toBe(1);
        
        return new Promise(resolve => {
            setTimeout(() => {
                expect(evaluationCount).toBe(2);
                expect(computed()).toBe(5);
                resolve();
            }, 60);
        });
    });
});
```

### Acceptance Criteria

- [ ] Multiple simultaneous observable changes trigger only one evaluation
- [ ] Works with any number of observables
- [ ] Handles rapid sequential changes
- [ ] Coalescing can be configured with different delays
- [ ] No evaluations occur while paused

---

## Pattern 3: Lazy Initialization

### Problem Statement

Expensive computations in computeds run immediately when dependencies change, even if the result is never used. This causes:
- Wasted CPU cycles on unused data
- Slow application startup (if many computeds evaluate on load)
- Poor performance for rarely-used features

### Solution

Use `ko.pausableComputed` with `deferred: true` to **lazily initialize** expensive computations only when the result is actually accessed.

### Required Behavior

1. **Deferred Start**: Computed starts in paused state
2. **No Initial Evaluation**: No computation until explicitly unpaused or accessed
3. **On-Demand Evaluation**: First access triggers evaluation
4. **Normal Behavior After**: Behaves like regular computed after first evaluation

### Example: Expensive Data Processing

```javascript
function DataViewModel() {
    var self = this;
    
    self.rawData = ko.observable(null);
    
    // Expensive processing - deferred until first access
    self.processedData = ko.pausableComputed(function() {
        var data = self.rawData();
        if (!data) return [];
        
        // Expensive: O(n^2) processing, filtering, transformation
        return data
            .filter(function(item) {
                return item.active && item.value > 0;
            })
            .map(function(item) {
                // Complex calculations
                return {
                    id: item.id,
                    processedValue: expensiveTransform(item.value),
                    metadata: generateMetadata(item)
                };
            })
            .sort(function(a, b) {
                return b.processedValue - a.processedValue;
            });
    }, self, { deferred: true });
    
    // Load data - NO processing happens yet
    self.loadData = function(data) {
        self.rawData(data);
        // processedData is still paused, no computation
    };
    
    // Only when accessed does processing happen
    self.showProcessed = function() {
        // This triggers evaluation
        var result = self.processedData();
        
        // Now it's active and will track changes
        self.processedData.paused(false);
        
        return result;
    };
}
```

### Why This is Valuable

- **True laziness**: Computation happens on-demand, not on data load
- **No wasted work**: If data is loaded but never viewed, no processing occurs
- **Performance**: Expensive operations only run when needed
- **Seamless**: From consumer's perspective, it's just a computed

### Test Cases

```javascript
describe('Lazy Initialization Pattern', () => {
    it('should not evaluate until unpaused', () => {
        const source = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return source() * 2;
        }, null, { deferred: true });
        
        // Should start paused
        expect(computed.paused()).toBe(true);
        
        // Should not have evaluated
        expect(evaluationCount).toBe(0);
        
        // Accessing should not trigger evaluation while paused
        const result = computed();
        expect(evaluationCount).toBe(0);
        expect(result).toBeUndefined();
        
        // Unpause
        computed.paused(false);
        
        // Now evaluation happens
        expect(evaluationCount).toBe(1);
        expect(computed()).toBe(2);
    });
    
    it('should work with data loading scenario', () => {
        const rawData = ko.observable(null);
        let processingCount = 0;
        
        const processed = ko.pausableComputed(() => {
            processingCount++;
            const data = rawData();
            if (!data) return [];
            return data.map(x => x * 2);
        }, null, { deferred: true });
        
        // Load data - no processing
        rawData([1, 2, 3, 4, 5]);
        expect(processingCount).toBe(0);
        
        // Unpause and access
        processed.paused(false);
        const result = processed();
        
        expect(processingCount).toBe(1);
        expect(result).toEqual([2, 4, 6, 8, 10]);
    });
    
    it('should evaluate on first access when unpaused', () => {
        const source = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return source();
        }, null, { deferred: true });
        
        // Start paused
        expect(computed.paused()).toBe(true);
        expect(evaluationCount).toBe(0);
        
        // Unpause
        computed.paused(false);
        
        // First access triggers evaluation
        expect(evaluationCount).toBe(0);
        const result = computed();
        expect(evaluationCount).toBe(1);
        expect(result).toBe(1);
    });
    
    it('should track changes after first evaluation', () => {
        const source = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return source();
        }, null, { deferred: true });
        
        // Unpause and first access
        computed.paused(false);
        computed();
        expect(evaluationCount).toBe(1);
        
        // Change source
        source(2);
        expect(evaluationCount).toBe(2);
        
        source(3);
        expect(evaluationCount).toBe(3);
    });
    
    it('should work with options object syntax', () => {
        const source = ko.observable(1);
        
        const computed = ko.pausableComputed({
            read: () => source() * 2,
            deferred: true
        });
        
        expect(computed.paused()).toBe(true);
        
        computed.paused(false);
        expect(computed()).toBe(2);
    });
});
```

### Acceptance Criteria

- [ ] Deferred computed starts in paused state
- [ ] No evaluation occurs until unpaused
- [ ] First access after unpause triggers evaluation
- [ ] Subsequent changes trigger normal evaluation
- [ ] Works with all constructor syntaxes
- [ ] No wasted computation on unused data

---

## Implementation Priority

| Pattern | Priority | Rationale |
|---------|----------|-----------|
| **Transaction Boundary** | **High** | Most common use case, fills critical gap |
| **Observable Coalescing** | **High** | Solves real performance issues |
| **Lazy Initialization** | **Medium** | Requires `deferred` option implementation |

---

## Dependencies

All three patterns depend on:
1. The existing `ko.pausableComputed` implementation
2. The `paused()` method working correctly
3. Proper lifecycle management (dispose cleanup)

The **Lazy Initialization** pattern additionally requires:
1. The `deferred` option to be implemented

---

## Non-Goals

These patterns are **documentation and examples**, not formal API extensions. They:

- Do not require changes to the core library (except Lazy Initialization's `deferred` option)
- Are not guaranteed to work in all edge cases
- May require additional application-level code
- Are provided as best practices and inspiration

---

## Success Criteria

For each pattern:

- [ ] Clear specification with examples
- [ ] Comprehensive TDD test cases
- [ ] Documentation of benefits and use cases
- [ ] Identification of edge cases and limitations
- [ ] Working code examples

For the library:

- [ ] All existing tests continue to pass
- [ ] New tests for patterns pass
- [ ] No breaking changes to existing API
- [ ] Patterns are well-documented for users
