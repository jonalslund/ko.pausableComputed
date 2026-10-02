# Specification: Pausable Computed Lifecycle Regression

## Recommendation

Add this focused regression specification in addition to `MEMORY_LEAK_FIX.spec.md` and `DISPOSE_METHOD.spec.md`.

The existing specifications describe the same desired change from two perspectives, but neither defines an executable lifecycle contract. A dedicated regression spec should make the acceptance criteria unambiguous and prevent the implementation from being considered complete while only the documentation has changed.

## Scope

This specification covers:

- disposal of the internal `evaluateTrigger` dependency;
- preservation of Knockout's original `dispose` behavior;
- idempotent disposal;
- prevention of work after disposal; and
- safe CommonJS and browser loading behavior.

It does not prescribe a particular private-field representation or memory-measurement technique.

## Required behavior

### 1. Cleanup on dispose

When a pausable computed is disposed, its internal `evaluateTrigger` must no longer retain subscriptions or participate in future evaluations. The implementation may satisfy this by disposing the trigger, severing its subscriptions, or using an equivalent cleanup mechanism.

### 2. Preserve the public dispose contract

`computed.dispose` must remain callable, must invoke the original Knockout computed disposal path, and must preserve any arguments and observable teardown behavior required by the supported Knockout version.

### 3. Idempotency

Calling `computed.dispose()` more than once must not throw, notify subscribers, or attempt to clean up the same resource twice.

### 4. No post-disposal evaluation

After disposal, changing an upstream observable or calling the computed must not invoke the evaluator again. The test must avoid depending on an unspecified return value after disposal; the evaluator call count and absence of exceptions are the contract.

### 5. Loading compatibility

The CommonJS entry point must continue to load with Knockout, and the browser wrapper must not evaluate an undeclared `ko` identifier. Browser behavior should be tested with a controlled global or guarded invocation appropriate to the project's supported environments.

## Suggested test cases

1. Create and evaluate a pausable computed, dispose it, change its dependency, and assert that the evaluator count does not increase.
2. Dispose the same computed twice and assert that no exception is thrown.
3. Subscribe to the computed, dispose it, change its dependency, and assert that no post-disposal notification is delivered.
4. Create and dispose a batch of computeds and verify that their dependency subscriptions are released using Knockout-supported subscription inspection rather than a fragile process-level heap measurement.
5. Load the package through CommonJS and exercise the factory without requiring a browser global.

## Acceptance criteria

- The tests fail against the current implementation because no lifecycle cleanup is present.
- The tests pass after the implementation adds cleanup and preserves existing pause/unpause behavior.
- No test relies on undocumented private Knockout fields unless the test explains why that is unavoidable.
- The implementation and tests document the supported Knockout version range.
