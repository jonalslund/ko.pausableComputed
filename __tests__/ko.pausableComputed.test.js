
  describe('Lifecycle and disposal', () => {
    it('should expose dispose and stop evaluating after disposal', () => {
      const source = ko.observable(1);
      let evaluationCount = 0;
      const computed = ko.pausableComputed(() => {
        evaluationCount += 1;
        return source();
      });

      computed();
      expect(evaluationCount).toBe(1);

      computed.dispose();
      source(2);
      computed();

      expect(evaluationCount).toBe(1);
    });

    it('should allow dispose to be called more than once', () => {
      const computed = ko.pausableComputed(() => 42);

      expect(() => {
        computed.dispose();
        computed.dispose();
      }).not.toThrow();
    });

    it('should not notify subscribers after disposal', () => {
      const source = ko.observable(1);
      let notificationCount = 0;
      const computed = ko.pausableComputed(() => source());
      computed.subscribe(() => {
        notificationCount += 1;
      });

      computed();
      computed.dispose();
      source(2);

      expect(notificationCount).toBe(0);
    });
  });
});
