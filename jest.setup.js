// Load Knockout first
const ko = require('knockout');

// Make ko available globally BEFORE requiring the extension
global.ko = ko;

// Now load the pausableComputed extension (it uses IIFE with ko)
require('./src/ko.pausableComputed');

// Also export ko for tests
module.exports = ko;
