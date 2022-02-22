// Grab an existing namespace object, or create a blank object
// if it doesn't exist
var PG = window.PG || {};

// Stick on the modules that need to be exported.
// You only need to require the top-level modules, browserify
// will walk the dependency graph and load everything correctly
PG = require('./index');

// Replace/Create the global namespace
window.PG = PG;