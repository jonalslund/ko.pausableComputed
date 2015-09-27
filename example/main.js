(function () {
	"use strict";

	function ViewModel() {
		this.evaluationCnt = ko.observable(0);
		this.a = ko.observable(0);
		this.b = ko.observable(0);
		this.c = ko.pausableComputed(function () {
			this.evaluationCnt(this.evaluationCnt() + 1);
			return this.a() + this.b();
		}, this);

		this.normalIncrement = function () {
			this.a(this.a() + 1);
			this.b(this.b() + 1);
		}.bind(this);
		
		this.pausedIncrement = function () {
			// disable evaluation
			this.c.paused(true);
			// update denpendent observables
			this.normalIncrement();
			// re-enable evaluation and trigger re-evalation
			this.c.paused(false);

		}.bind(this);
	}

	window.onload = function () {
		var vm = new ViewModel();
		ko.applyBindings(vm, document.getElementById("test"));
	};
}());