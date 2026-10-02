# Implementation Plan: Top 3 Bottom-Up Patterns

## Overview

This plan covers the implementation and integration of the **three most widely applicable bottom-up patterns** for `ko.pausableComputed`. These patterns provide practical solutions to common problems without reinventing existing Knockout functionality.

**Important Note**: Two of these patterns (Transaction Boundary and Observable Coalescing) require **no changes to the core library** - they are usage patterns that work with the existing implementation. Only the Lazy Initialization pattern requires a core feature addition (`deferred` option).

---

## Pattern 1: Transaction Boundary

### Status: ✅ Ready for Use (No Core Changes Required)

This pattern works with the **existing** `ko.pausableComputed` implementation. No library changes needed.

### Implementation Guide

#### Step 1: Identify Transaction Boundaries

Find places in your code where multiple observable changes should be treated as atomic:
- Form data loading
- Bulk updates
- Batch operations
- State transitions

#### Step 2: Apply the Pattern

```javascript
// Before: Multiple evaluations
function loadForm(data) {
    this.firstName(data.firstName);  // Triggers validation
    this.lastName(data.lastName);    // Triggers validation
    this.email(data.email);          // Triggers validation
}

// After: Single evaluation
function loadForm(data) {
    this.validation.paused(true);
    
    this.firstName(data.firstName);
    this.lastName(data.lastName);
    this.email(data.email);
    
    this.validation.paused(false);  // Triggers validation ONCE
}
```

#### Step 3: Helper Utility (Optional)

Create a reusable transaction helper:

```javascript
// Transaction helper for pausable computeds
ko.pausableComputed.transaction = function(computeds, callback) {
    // Pause all computeds
    computeds.forEach(function(c) {
        c.paused(true);
    });
    
    try {
        // Execute callback with all computeds paused
        callback();
    } finally {
        // Resume all computeds (in reverse order)
        computeds.slice().reverse().forEach(function(c) {
            c.paused(false);
        });
    }
};

// Usage:
ko.pausableComputed.transaction([vm.validation], function() {
    vm.firstName(data.firstName);
    vm.lastName(data.lastName);
    vm.email(data.email);
});
```

### Test Implementation

Add to `__tests__/ko.pausableComputed.test.js`:

```javascript
describe('Transaction Boundary Pattern', () => {
    beforeEach(() => {
        ko = global.ko;
    });

    it('should batch multiple changes into single evaluation', () => {
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

        // Transaction
        computed.paused(true);
        a(10);
        b(20);
        c(30);
        
        expect(evaluationCount).toBe(1);
        
        computed.paused(false);
        
        expect(evaluationCount).toBe(2);
        expect(computed()).toBe(60);
    });

    it('should work with form loading scenario', () => {
        const form = {
            firstName: ko.observable(''),
            lastName: ko.observable(''),
            email: ko.observable('')
        };
        let validationCount = 0;
        
        const isValid = ko.pausableComputed(() => {
            validationCount++;
            return !!form.firstName() && 
                   !!form.lastName() && 
                   !!form.email();
        });

        // Load form data
        isValid.paused(true);
        form.firstName('John');
        form.lastName('Doe');
        form.email('john@example.com');
        isValid.paused(false);

        expect(validationCount).toBe(2); // initial + 1 after load
        expect(isValid()).toBe(true);
    });

    it('should handle nested transactions', () => {
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

        // Inner transaction
        computed.paused(true);
        a(3);

        // Resume inner
        computed.paused(false);
        
        // Still paused from outer
        expect(evaluationCount).toBe(1);

        // Resume outer
        computed.paused(false);

        expect(evaluationCount).toBe(2);
        expect(computed()).toBe(3);
    });

    it('should work with transaction helper', () => {
        // Add transaction helper
        ko.pausableComputed.transaction = function(computeds, callback) {
            computeds.forEach(c => c.paused(true));
            try {
                callback();
            } finally {
                computeds.slice().reverse().forEach(c => c.paused(false));
            }
        };

        const a = ko.observable(1);
        const b = ko.observable(2);
        let evalCountA = 0, evalCountB = 0;
        
        const computedA = ko.pausableComputed(() => {
            evalCountA++;
            return a();
        });
        const computedB = ko.pausableComputed(() => {
            evalCountB++;
            return b();
        });

        computedA();
        computedB();
        
        ko.pausableComputed.transaction([computedA, computedB], () => {
            a(10);
            b(20);
        });

        expect(evalCountA).toBe(2); // initial + 1
        expect(evalCountB).toBe(2);
        expect(computedA()).toBe(10);
        expect(computedB()).toBe(20);
    });
});
```

### Usage Examples

#### Example 1: Loading User Profile

```javascript
function UserProfileViewModel() {
    var self = this;
    
    self.user = ko.observable(null);
    self.profilePicture = ko.observable('');
    self.bio = ko.observable('');
    self.location = ko.observable('');
    
    // Expensive computed that depends on profile data
    self.profileSummary = ko.pausableComputed(function() {
        // This only runs once after all data is loaded
        return generateProfileSummary({
            user: self.user(),
            picture: self.profilePicture(),
            bio: self.bio(),
            location: self.location()
        });
    }, self);
    
    self.loadProfile = function(userId) {
        self.profileSummary.paused(true);
        
        // Load all data
        self.user({ id: userId, name: 'Loading...' });
        self.profilePicture('/loading.gif');
        self.bio('Loading...');
        self.location('Loading...');
        
        // Fetch from API
        Promise.all([
            fetchUser(userId),
            fetchProfilePicture(userId),
            fetchBio(userId),
            fetchLocation(userId)
        ]).then(([user, picture, bio, location]) => {
            self.user(user);
            self.profilePicture(picture);
            self.bio(bio);
            self.location(location);
            
            self.profileSummary.paused(false);
        });
    };
}
```

#### Example 2: Bulk Edit Operations

```javascript
function ProductCatalogViewModel() {
    var self = this;
    
    self.products = ko.observableArray([]);
    self.totalValue = ko.pausableComputed(function() {
        return self.products().reduce((sum, p) => sum + p.price, 0);
    }, self);
    
    self.applyDiscount = function(discountPercent) {
        self.totalValue.paused(true);
        
        // Update all products
        self.products().forEach(p => {
            p.price(p.price * (1 - discountPercent / 100));
        });
        
        self.totalValue.paused(false);
        // Total recalculates ONCE with all updated prices
    };
}
```

---

## Pattern 2: Observable Coalescing

### Status: ✅ Ready for Use (No Core Changes Required)

This pattern also works with the **existing** implementation. It's an application-level pattern that uses pausable computed's pause/resume capabilities.

### Implementation Guide

#### Step 1: Identify Coalescing Candidates

Find computeds that depend on multiple observables where simultaneous changes should be batched:
- Dashboards with multiple data sources
- UI components that depend on multiple state variables
- Aggregation computeds

#### Step 2: Create Coalescing Wrapper

```javascript
// Coalescing helper
function createCoalescingComputed(evaluator, options) {
    var computed = ko.pausableComputed(evaluator, options);
    var timeoutId = null;
    var delay = options && options.delay !== undefined ? options.delay : 0;
    
    function coalesce() {
        if (computed.paused()) {
            // Already paused, just extend the delay
            if (timeoutId) clearTimeout(timeoutId);
        } else {
            // First change, pause and schedule resume
            computed.paused(true);
        }
        
        timeoutId = setTimeout(function() {
            timeoutId = null;
            computed.paused(false);
        }, delay);
    }
    
    // Return an object with the computed and coalesce function
    return {
        computed: computed,
        coalesce: coalesce,
        pause: function() { computed.paused(true); },
        resume: function() { computed.paused(false); }
    };
}
```

#### Step 3: Apply to Observables

```javascript
function DashboardViewModel() {
    var self = this;
    
    self.sales = ko.observable(null);
    self.inventory = ko.observable(null);
    self.customers = ko.observable(null);
    
    // Create coalescing computed
    var coalescer = createCoalescingComputed(function() {
        return renderDashboard({
            sales: self.sales(),
            inventory: self.inventory(),
            customers: self.customers()
        });
    }, { delay: 0 });
    
    // Subscribe all observables to coalesce
    self.sales.subscribe(coalescer.coalesce);
    self.inventory.subscribe(coalescer.coalesce);
    self.customers.subscribe(coalescer.coalesce);
    
    // Access the computed
    self.dashboard = coalescer.computed;
}
```

### Test Implementation

Add to `__tests__/ko.pausableComputed.test.js`:

```javascript
describe('Observable Coalescing Pattern', () => {
    beforeEach(() => {
        ko = global.ko;
    });

    it('should coalesce multiple simultaneous changes', (done) => {
        const a = ko.observable(1);
        const b = ko.observable(2);
        const c = ko.observable(3);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return a() + b() + c();
        });
        
        // Coalesce function
        let timeoutId = null;
        function coalesce() {
            if (computed.paused()) {
                if (timeoutId) clearTimeout(timeoutId);
            } else {
                computed.paused(true);
            }
            timeoutId = setTimeout(() => {
                timeoutId = null;
                computed.paused(false);
            }, 0);
        }
        
        a.subscribe(coalesce);
        b.subscribe(coalesce);
        c.subscribe(coalesce);
        
        // Initial
        computed();
        expect(evaluationCount).toBe(1);
        
        // Simultaneous changes
        a(10);
        b(20);
        c(30);
        
        expect(evaluationCount).toBe(1);
        
        // Wait for coalesce
        setTimeout(() => {
            expect(evaluationCount).toBe(2);
            expect(computed()).toBe(60);
            done();
        }, 10);
    });

    it('should work with createCoalescingComputed helper', (done) => {
        const a = ko.observable(1);
        const b = ko.observable(2);
        let evaluationCount = 0;
        
        // Create coalescing computed with helper
        function createCoalescingComputed(evaluator, options) {
            var computed = ko.pausableComputed(evaluator, options);
            var timeoutId = null;
            var delay = options && options.delay !== undefined ? options.delay : 0;
            
            function coalesce() {
                if (computed.paused()) {
                    if (timeoutId) clearTimeout(timeoutId);
                } else {
                    computed.paused(true);
                }
                timeoutId = setTimeout(() => {
                    timeoutId = null;
                    computed.paused(false);
                }, delay);
            }
            
            return {
                computed: computed,
                coalesce: coalesce
            };
        }
        
        const coalescer = createCoalescingComputed(() => {
            evaluationCount++;
            return a() + b();
        }, { delay: 0 });
        
        a.subscribe(coalescer.coalesce);
        b.subscribe(coalescer.coalesce);
        
        coalescer.computed();
        expect(evaluationCount).toBe(1);
        
        a(10);
        b(20);
        
        expect(evaluationCount).toBe(1);
        
        setTimeout(() => {
            expect(evaluationCount).toBe(2);
            expect(coalescer.computed()).toBe(30);
            done();
        }, 10);
    });

    it('should handle rapid sequential changes', (done) => {
        const a = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return a();
        });
        
        let timeoutId = null;
        function coalesce() {
            if (computed.paused()) {
                if (timeoutId) clearTimeout(timeoutId);
            } else {
                computed.paused(true);
            }
            timeoutId = setTimeout(() => {
                timeoutId = null;
                computed.paused(false);
            }, 50);
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
        
        setTimeout(() => {
            expect(evaluationCount).toBe(2);
            expect(computed()).toBe(5);
            done();
        }, 60);
    });

    it('should work with custom delay', (done) => {
        const a = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return a();
        });
        
        let timeoutId = null;
        function coalesce() {
            if (computed.paused()) {
                if (timeoutId) clearTimeout(timeoutId);
            } else {
                computed.paused(true);
            }
            timeoutId = setTimeout(() => {
                timeoutId = null;
                computed.paused(false);
            }, 100); // Custom delay
        }
        
        a.subscribe(coalesce);
        
        computed();
        a(2);
        a(3);
        
        expect(evaluationCount).toBe(1);
        
        // Should not have evaluated yet (delay is 100ms)
        setTimeout(() => {
            expect(evaluationCount).toBe(1);
        }, 50);
        
        // Should have evaluated after delay
        setTimeout(() => {
            expect(evaluationCount).toBe(2);
            done();
        }, 150);
    });
});
```

### Usage Examples

#### Example 1: Real-Time Dashboard

```javascript
function RealTimeDashboardViewModel() {
    var self = this;
    
    // Data from various APIs
    self.salesData = ko.observable(null);
    self.inventoryData = ko.observable(null);
    self.customerData = ko.observable(null);
    self.weatherData = ko.observable(null);
    
    self.renderCount = ko.observable(0);
    
    // Create coalescing computed for dashboard
    var coalescer = createCoalescingComputed(function() {
        self.renderCount(self.renderCount() + 1);
        return renderDashboard({
            sales: self.salesData(),
            inventory: self.inventoryData(),
            customers: self.customerData(),
            weather: self.weatherData()
        });
    }, { delay: 50 }); // 50ms coalescing window
    
    // Subscribe all data sources
    self.salesData.subscribe(coalescer.coalesce);
    self.inventoryData.subscribe(coalescer.coalesce);
    self.customerData.subscribe(coalescer.coalesce);
    self.weatherData.subscribe(coalescer.coalesce);
    
    self.dashboard = coalescer.computed;
    
    // Load all data
    self.loadAllData = function() {
        Promise.all([
            fetch('/api/sales'),
            fetch('/api/inventory'),
            fetch('/api/customers'),
            fetch('/api/weather')
        ]).then(([sales, inventory, customers, weather]) => {
            // All these will be coalesced into one render
            self.salesData(sales);
            self.inventoryData(inventory);
            self.customerData(customers);
            self.weatherData(weather);
        });
    };
}
```

#### Example 2: Search with Multiple Filters

```javascript
function SearchViewModel() {
    var self = this;
    
    self.query = ko.observable('');
    self.category = ko.observable('all');
    self.sortBy = ko.observable('relevance');
    self.page = ko.observable(1);
    
    self.results = ko.observableArray([]);
    self.isSearching = ko.observable(false);
    
    // Coalescing search trigger
    var searchCoalescer = createCoalescingComputed(function() {
        return performSearch({
            query: self.query(),
            category: self.category(),
            sortBy: self.sortBy(),
            page: self.page()
        });
    }, { delay: 300 }); // 300ms debounce
    
    // Subscribe all filters
    self.query.subscribe(searchCoalescer.coalesce);
    self.category.subscribe(searchCoalescer.coalesce);
    self.sortBy.subscribe(searchCoalescer.coalesce);
    self.page.subscribe(searchCoalescer.coalesce);
    
    // Results come from the computed
    searchCoalescer.computed.subscribe(results => {
        self.results(results);
        self.isSearching(false);
    });
    
    // Track search state
    searchCoalescer.computed.subscribe(() => {
        self.isSearching(true);
    });
}
```

---

## Pattern 3: Lazy Initialization

### Status: ⚠️ Requires Core Feature (deferred option)

This pattern requires implementing the `deferred` option in `ko.pausableComputed`.

### Implementation Steps

#### Step 1: Update Factory to Accept deferred Option

Modify `src/ko.pausableComputed.js`:

```javascript
// In the input pre-processing section, extract deferred option
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

// Initialize paused state based on deferred option
var paused = deferred;
```

#### Step 2: Add Tests for deferred Option

Add to `__tests__/ko.pausableComputed.test.js`:

```javascript
describe('Deferred Option (for Lazy Initialization)', () => {
    beforeEach(() => {
        ko = global.ko;
    });

    it('should start paused when deferred: true', () => {
        const computed = ko.pausableComputed(() => 42, null, { deferred: true });
        expect(computed.paused()).toBe(true);
    });

    it('should start unpaused when deferred: false', () => {
        const computed = ko.pausableComputed(() => 42, null, { deferred: false });
        expect(computed.paused()).toBe(false);
    });

    it('should start unpaused by default', () => {
        const computed = ko.pausableComputed(() => 42);
        expect(computed.paused()).toBe(false);
    });

    it('should not evaluate until unpaused', () => {
        const source = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return source();
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

    it('should batch changes made while deferred and paused', () => {
        const source = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return source();
        }, null, { deferred: true });

        source(2);
        source(3);
        
        expect(evaluationCount).toBe(0);
        
        computed.paused(false);
        
        expect(evaluationCount).toBe(1);
        expect(computed()).toBe(3);
    });
});
```

#### Step 3: Helper Function for Lazy Computed

```javascript
// Lazy computed helper
ko.pausableComputed.lazy = function(evaluator, evaluatorTarget, options) {
    options = options || {};
    options.deferred = true;
    return ko.pausableComputed(evaluator, evaluatorTarget, options);
};

// Usage:
const processedData = ko.pausableComputed.lazy(function() {
    // Expensive computation
    return expensiveTransform(this.rawData());
}, this);
```

#### Step 4: Lazy Initialization Pattern Implementation

```javascript
function LazyViewModel() {
    var self = this;
    
    self.rawData = ko.observable(null);
    
    // Lazy computed - won't evaluate until accessed
    self.processedData = ko.pausableComputed.lazy(function() {
        var data = self.rawData();
        if (!data) return [];
        
        // Expensive processing
        return data
            .filter(item => item.active)
            .map(item => expensiveTransform(item));
    }, self);
    
    // Load data - no processing happens
    self.loadData = function(data) {
        self.rawData(data);
        // processedData is still paused
    };
    
    // Access processed data - triggers evaluation
    self.getProcessed = function() {
        // This unpauses and evaluates
        self.processedData.paused(false);
        return self.processedData();
    };
    
    // Alternative: Auto-unpause on first access
    self.getProcessedAuto = function() {
        if (self.processedData.paused()) {
            self.processedData.paused(false);
        }
        return self.processedData();
    };
}
```

### Test Implementation for Lazy Pattern

Add to `__tests__/ko.pausableComputed.test.js`:

```javascript
describe('Lazy Initialization Pattern', () => {
    beforeEach(() => {
        ko = global.ko;
    });

    it('should not evaluate until first access', () => {
        const source = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return source() * 2;
        }, null, { deferred: true });

        expect(computed.paused()).toBe(true);
        expect(evaluationCount).toBe(0);

        // Access while paused returns undefined
        const result = computed();
        expect(result).toBeUndefined();
        expect(evaluationCount).toBe(0);

        // Unpause
        computed.paused(false);

        // Now evaluation happens
        expect(evaluationCount).toBe(0);
        const result2 = computed();
        expect(evaluationCount).toBe(1);
        expect(result2).toBe(2);
    });

    it('should work with lazy helper', () => {
        // Add lazy helper
        ko.pausableComputed.lazy = function(evaluator, evaluatorTarget, options) {
            options = options || {};
            options.deferred = true;
            return ko.pausableComputed(evaluator, evaluatorTarget, options);
        };

        const source = ko.observable(5);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed.lazy(() => {
            evaluationCount++;
            return source() * 2;
        });

        expect(computed.paused()).toBe(true);
        expect(evaluationCount).toBe(0);

        computed.paused(false);
        computed();

        expect(evaluationCount).toBe(1);
        expect(computed()).toBe(10);
    });

    it('should only evaluate once even if accessed multiple times after unpause', () => {
        const source = ko.observable(1);
        let evaluationCount = 0;
        
        const computed = ko.pausableComputed(() => {
            evaluationCount++;
            return source();
        }, null, { deferred: true });

        computed.paused(false);
        
        // Multiple accesses
        computed();
        computed();
        computed();

        // Should only evaluate once (Knockout's default behavior)
        expect(evaluationCount).toBe(1);
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

    it('should work in data loading scenario', () => {
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

        // Unpause
        processed.paused(false);

        // Access - triggers processing
        const result = processed();
        expect(processingCount).toBe(1);
        expect(result).toEqual([2, 4, 6, 8, 10]);

        // Change data - triggers reprocessing
        rawData([10, 20]);
        expect(processingCount).toBe(2);
        expect(processed()).toEqual([20, 40]);
    });
});
```

### Usage Examples

#### Example 1: Expensive Report Generation

```javascript
function ReportViewModel() {
    var self = this;
    
    self.reportData = ko.observable(null);
    self.filters = ko.observable({});
    
    // Lazy report - only generates when viewed
    self.generatedReport = ko.pausableComputed.lazy(function() {
        var data = self.reportData();
        var filters = self.filters();
        
        if (!data) return null;
        
        // Very expensive: could take seconds
        return generateReport(data, filters);
    }, self);
    
    // Load data - report not generated
    self.loadData = function(data) {
        self.reportData(data);
    };
    
    // Apply filters - report not regenerated (still paused)
    self.applyFilters = function(filters) {
        self.filters(filters);
    };
    
    // View report - triggers generation
    self.viewReport = function() {
        if (self.generatedReport.paused()) {
            self.generatedReport.paused(false);
        }
        return self.generatedReport();
    };
}
```

#### Example 2: Heavy Image Processing

```javascript
function ImageGalleryViewModel() {
    var self = this;
    
    self.images = ko.observableArray([]);
    self.selectedFilter = ko.observable('none');
    
    // Lazy processed images - only process when displayed
    self.processedImages = ko.pausableComputed.lazy(function() {
        var images = self.images();
        var filter = self.selectedFilter();
        
        if (!images.length) return [];
        
        // Expensive: apply filter to each image
        return images.map(img => applyFilter(img, filter));
    }, self);
    
    // Load images - no processing
    self.loadImages = function(images) {
        self.images(images);
    };
    
    // Change filter - no processing (still paused)
    self.setFilter = function(filter) {
        self.selectedFilter(filter);
    };
    
    // Show gallery - triggers processing
    self.showGallery = function() {
        if (self.processedImages.paused()) {
            self.processedImages.paused(false);
        }
        return self.processedImages();
    };
}
```

#### Example 3: Conditional Heavy Computation

```javascript
function AnalyticsViewModel() {
    var self = this;
    
    self.rawMetrics = ko.observable(null);
    self.needsProcessing = ko.observable(false);
    
    // Lazy processed metrics
    self.processedMetrics = ko.pausableComputed.lazy(function() {
        var metrics = self.rawMetrics();
        if (!metrics) return null;
        
        // Only process if needed
        if (!self.needsProcessing()) {
            return metrics; // Return raw if no processing needed
        }
        
        // Expensive processing
        return heavyAnalyticsProcessing(metrics);
    }, self);
    
    // Load metrics
    self.loadMetrics = function(metrics) {
        self.rawMetrics(metrics);
    };
    
    // Toggle processing
    self.toggleProcessing = function() {
        self.needsProcessing(!self.needsProcessing());
    };
    
    // Get processed metrics
    self.getMetrics = function() {
        if (self.processedMetrics.paused()) {
            self.processedMetrics.paused(false);
        }
        return self.processedMetrics();
    };
}
```

---

## Implementation Priority & Dependencies

| Pattern | Priority | Core Changes | Dependencies |
|---------|----------|--------------|--------------|
| Transaction Boundary | **High** | None | Works now |
| Observable Coalescing | **High** | None | Works now |
| Lazy Initialization | **Medium** | `deferred` option | Requires implementation |

---

## Success Criteria

### For Documentation
- [ ] Each pattern has clear, working examples
- [ ] Each pattern has comprehensive test cases
- [ ] Benefits and use cases are well-documented
- [ ] Edge cases and limitations are identified

### For Implementation
- [ ] All existing tests continue to pass
- [ ] New tests for patterns pass
- [ ] No breaking changes to existing API
- [ ] Patterns are well-documented for users

### For Lazy Initialization
- [ ] `deferred` option is implemented
- [ ] `deferred` option has tests
- [ ] `deferred` option works with all constructor syntaxes
- [ ] Lazy helper function is provided

---

## Rollback Plan

### Transaction Boundary & Observable Coalescing
- **No rollback needed**: These are usage patterns, not library changes
- Simply remove documentation if issues arise

### Lazy Initialization
- **Easy rollback**: Remove `deferred` option handling
- Revert to original behavior
- No breaking changes (it's a new, opt-in feature)

---

## Recommendations

1. **Implement Transaction Boundary and Observable Coalescing first** - They work with existing code
2. **Add Lazy Initialization as a separate PR** - It requires core changes
3. **Document all patterns with examples** - Help users understand the value
4. **Add patterns to README** - Show real-world use cases
5. **Consider adding helper functions** - Like `transaction()` and `createCoalescingComputed()`

---

## Next Steps

1. ✅ Create specification (this document)
2. ✅ Create implementation plan (this document)
3. ⏳ Add tests for Transaction Boundary pattern
4. ⏳ Add tests for Observable Coalescing pattern
5. ⏳ Implement `deferred` option for Lazy Initialization
6. ⏳ Add tests for Lazy Initialization pattern
7. ⏳ Add examples to README
8. ⏳ Consider adding helper functions to library
