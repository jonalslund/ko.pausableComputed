/**
 * TDD Test Suite for ko.pausableComputed
 * 
 * These tests verify the core functionality:
 * 1. Pausable computed works like a normal computed when not paused
 * 2. Pausing prevents evaluation
 * 3. Unpausing triggers exactly one evaluation even if multiple dependencies changed
 * 4. The paused() method works as both getter and setter
 * 5. evaluateImmediate() forces evaluation
 */

describe('ko.pausableComputed', () => {
  let ko;

  beforeEach(() => {
    ko = global.ko;
  });

  describe('Basic functionality', () => {
    it('should work like a normal computed when not paused', () => {
      const a = ko.observable(1);
      const b = ko.observable(2);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => {
        evaluationCount(evaluationCount() + 1);
        return a() + b();
      });

      expect(computed()).toBe(3);
      expect(evaluationCount()).toBe(1);
    });

    it('should accept options object syntax', () => {
      const a = ko.observable(1);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed({
        read: function() {
          evaluationCount(evaluationCount() + 1);
          return a() * 2;
        },
        owner: this
      });

      expect(computed()).toBe(2);
      expect(evaluationCount()).toBe(1);
    });

    it('should accept evaluator function with target', () => {
      const context = { value: 10 };
      const computed = ko.pausableComputed(function() {
        return this.value;
      }, context);

      expect(computed()).toBe(10);
    });
  });

  describe('paused() method', () => {
    it('should return false by default', () => {
      const computed = ko.pausableComputed(() => 42);
      expect(computed.paused()).toBe(false);
    });

    it('should allow setting paused state', () => {
      const computed = ko.pausableComputed(() => 42);
      
      computed.paused(true);
      expect(computed.paused()).toBe(true);
      
      computed.paused(false);
      expect(computed.paused()).toBe(false);
    });

    it('should return current paused state when called without arguments', () => {
      const computed = ko.pausableComputed(() => 42);
      
      expect(computed.paused()).toBe(false);
      computed.paused(true);
      expect(computed.paused()).toBe(true);
      expect(computed.paused()).toBe(true);
    });
  });

  describe('Pausing behavior', () => {
    it('should prevent evaluation when paused', () => {
      const a = ko.observable(1);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => {
        evaluationCount(evaluationCount() + 1);
        return a();
      });

      // Initial evaluation
      computed();
      expect(evaluationCount()).toBe(1);

      // Pause and change dependency
      computed.paused(true);
      a(2);
      
      // Value should still be old value (1) because evaluation was skipped
      // Note: The computed might return undefined when paused
      const pausedValue = computed();
      
      // Unpause and check
      computed.paused(false);
      
      // After unpausing, it should have evaluated once
      expect(evaluationCount()).toBe(2);
    });

    it('should batch multiple dependency changes into single evaluation when paused', () => {
      const a = ko.observable(1);
      const b = ko.observable(2);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => {
        evaluationCount(evaluationCount() + 1);
        return a() + b();
      });

      // Initial evaluation
      computed();
      expect(evaluationCount()).toBe(1);

      // Pause, change multiple dependencies
      computed.paused(true);
      a(10);
      b(20);
      a(15);
      b(25);
      
      // Still only 1 evaluation
      expect(evaluationCount()).toBe(1);

      // Unpause - should trigger exactly one evaluation
      computed.paused(false);
      
      // Should have evaluated exactly once more
      expect(evaluationCount()).toBe(2);
      expect(computed()).toBe(40); // 15 + 25
    });

    it('should update value correctly after unpausing', () => {
      const a = ko.observable(1);
      const b = ko.observable(2);
      
      const computed = ko.pausableComputed(() => a() + b());

      expect(computed()).toBe(3);

      computed.paused(true);
      a(10);
      b(20);
      
      computed.paused(false);
      
      expect(computed()).toBe(30);
    });
  });

  describe('evaluateImmediate()', () => {
    it('should force evaluation when called', () => {
      const a = ko.observable(1);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => {
        evaluationCount(evaluationCount() + 1);
        return a();
      });

      computed();
      expect(evaluationCount()).toBe(1);

      // Change dependency
      a(2);
      expect(evaluationCount()).toBe(2);
      
      // Call evaluateImmediate - should force another evaluation
      computed.evaluateImmediate();
      
      // Should have evaluated again
      expect(evaluationCount()).toBe(3);
    });

    it('should work when paused by calling unpaused with pending notifications', () => {
      const a = ko.observable(1);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => {
        evaluationCount(evaluationCount() + 1);
        return a();
      });

      computed();
      expect(evaluationCount()).toBe(1);

      computed.paused(true);
      a(2);
      
      // While paused, changing a doesn't trigger evaluation
      expect(evaluationCount()).toBe(1);
      
      // Unpausing should trigger evaluation via evaluateImmediate
      computed.paused(false);
      
      // Should have evaluated once more
      expect(evaluationCount()).toBe(2);
      expect(computed()).toBe(2);
    });
  });

  describe('Subscription behavior', () => {
    it('should not notify subscribers when paused', () => {
      const a = ko.observable(1);
      const notificationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => a());

      computed.subscribe(() => {
        notificationCount(notificationCount() + 1);
      });

      computed(); // Initial evaluation doesn't trigger subscription
      
      a(2); // This should trigger notification
      
      expect(notificationCount()).toBe(1);

      computed.paused(true);
      a(3);
      
      // No additional notification while paused
      expect(notificationCount()).toBe(1);

      computed.paused(false);
      
      // Should have triggered one notification
      expect(notificationCount()).toBe(2);
    });

    it('should batch notifications when multiple dependencies change while paused', () => {
      const a = ko.observable(1);
      const b = ko.observable(2);
      const notificationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => a() + b());

      // Initial subscription - computed() doesn't trigger subscription callback
      computed.subscribe(() => {
        notificationCount(notificationCount() + 1);
      });

      // First evaluation to establish dependencies
      computed();
      
      // Reset counter after initial evaluation
      notificationCount(0);
      
      computed.paused(true);
      a(10);
      b(20);
      a(15);
      b(25);
      
      // No notifications while paused
      expect(notificationCount()).toBe(0);

      computed.paused(false);
      
      // Should have triggered exactly one notification for all the changes
      expect(notificationCount()).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle unpausing when already unpaused', () => {
      const a = ko.observable(1);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => {
        evaluationCount(evaluationCount() + 1);
        return a();
      });

      computed();
      expect(evaluationCount()).toBe(1);

      // Unpausing when already unpaused should not trigger extra evaluation
      computed.paused(false);
      
      expect(evaluationCount()).toBe(1);
    });

    it('should handle pausing when already paused', () => {
      const a = ko.observable(1);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed(() => {
        evaluationCount(evaluationCount() + 1);
        return a();
      });

      computed.paused(true);
      computed.paused(true); // Pause again
      
      a(2);
      
      computed.paused(false);
      
      // Should only evaluate once after unpausing
      expect(evaluationCount()).toBe(2); // Initial + one after unpause
    });

    it('should work with pure computed options', () => {
      const a = ko.observable(1);
      const evaluationCount = ko.observable(0);
      
      const computed = ko.pausableComputed({
        read: () => {
          evaluationCount(evaluationCount() + 1);
          return a();
        },
        pure: true
      });

      expect(computed()).toBe(1);
      expect(evaluationCount()).toBe(1);
    });
  });
});
