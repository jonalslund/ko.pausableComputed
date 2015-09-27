# ko.pausableComputed
Knockoutjs extension. Makes it possible to synchronously delay a computed observable's evaluation and insure that it's only evaluated once when re-enabled.

## Example
This example shows how normal changes to two observables will trigger two evaluations of a computed observable. When the computed is paused the evaluation will only trigger once.

`(function () {
	"use strict";

	function ViewModel() {
		this.evaluationCnt = ko.observable(0);
		this.a = ko.observable(0);
		this.b = ko.observable(0);
		// create the computed observable with the ability to pause
		this.c = ko.pausableComputed(function () {
			// track evaluations
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
}());`

Try it out here: https://rawgit.com/jonalslund/ko.pausableComputed/master/example/index.html


