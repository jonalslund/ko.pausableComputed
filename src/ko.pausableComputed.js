
(function (ko) {
	"use strict";
	ko.pausableComputed = function (evaluatorFunctionOrOptions, evaluatorFunctionTarget, options) {
		var paused = false,
			hasPendingNotifications = false,
			evaluateTrigger = ko.observable(),
			originalReadFunction = evaluatorFunctionOrOptions,
			originalNotifySubscribers = null,
			computed = null;
		
		// Input pre-processing. Provides same interface as ko.computed
		if (evaluatorFunctionOrOptions && typeof evaluatorFunctionOrOptions === "object") {
			// Single-parameter syntax - everything is on this "options" param
			options = evaluatorFunctionOrOptions;
			originalReadFunction = options["read"];
		} else {
			// Multi-parameter syntax - construct the options according to the params passed
			options = options || {};
			if (!originalReadFunction) {
				originalReadFunction = options["read"];
			}
			options["owner"] = options["owner"] || evaluatorFunctionTarget;
		}

		// Define a computed based on the given options, but inject a new evaluator with two purposes;
		// 1 - inject a dummy observable to make it possible to trigger evaluation on the computed
		// 2 - skip evaluation when paused
		computed = ko.computed(function () {
			// Register evaluateTrigger in the dependency tracker.
			evaluateTrigger();
			// Only invoke provided evaluator when not paused.
			// Note: Although this will actually set _latestValue to undefined, we make sure
			// that no notifications are sent to subscribers before the observable is u-paused and reevaluated,
			// hence no one will ever know.
			if (!paused) {
				return originalReadFunction.apply(options["owner"], arguments);
			}
		}, evaluatorFunctionTarget, options);

		// Override the notifySubscribers to be able to
		// 1 - abort nofication when paused
		// 2 - keep track of notifications so one can be triggered
		originalNotifySubscribers = computed.notifySubscribers;
		computed.notifySubscribers = function () {
			// When paused, just register that we need to trigger re-evaulation when un-paused
			if (paused) {
				hasPendingNotifications = true;
			} else {
				originalNotifySubscribers.apply(this, arguments);
			}
		};

		// The paused method will
		// - return the current value when invoked without arguments
		// - trigger re-evaluation when un-paused (if dependent objects has changed)
		computed.paused = function (isPaused) {
			if (isPaused === void 0) {
				return paused;
			} else {
				paused = isPaused;
				// When un-paused and has outstanding notifications, trigger a re-evaluation
				if (!paused && hasPendingNotifications) {
					computed.evaluateImmediate();
				}
			}
		};
		
		// Force a re-evaluation
		computed.evaluateImmediate = function () {
			evaluateTrigger.notifySubscribers();
			hasPendingNotifications = false;
		};
		
		return computed;
	};
}(ko = ko || {}));



