(function () {
	"use strict";

	function ViewModel() {
		this.evaluationCnt = ko.observable(0);
		this.a = ko.observable(1);
		this.b = ko.observable(1);
		this.c = ko.pausableComputed(function () {
			this.evaluationCnt(this.evaluationCnt() + 1);
			return this.a() + this.b();
		}, this);
		
		this.paused = ko.observable(false);
		this.buttonText = ko.computed(function ()
		{
			return this.paused() ? "Enable evaluation" : "Disable evaluation";
		}, this);

		this.update = function ()
		{
			// I want to update two observables and c is dependent of both.
			// This will trigger two evalutions of c.
			// Can I delay the evalution and still keep it synchronous? (rateLimit is async)

			// vm.c.temporaryDisableEvaluate();
			// Make the two changes
			vm.a(vm.a() + 1);
			vm.b(vm.b() + 1);
			// I'm done updating, now evaluate
			// v.c.enableEvaluate();
		};

		this.pause = function ()
		{
			this.paused(!this.paused());
			this.c.paused(!this.c.paused());
			this.c.notifySubscribers();
		};
	}

	var vm = new ViewModel();
	window.onload = function ()
	{
		ko.applyBindings(vm, document.getElementById("test"));
	};
}());