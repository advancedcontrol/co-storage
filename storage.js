(function(angular) {
    'use strict';

    // Use existing module otherwise create a new one
    var module;
    try {
        module = angular.module('coUtils');
    } catch (e) {
        module = angular.module('coUtils', []);
    }
    
    module.
        provider('$storage', function() {
            this.prefix = '';

            this.$get = ['$window', function($window) {
                var self = this,
                    localStorage = $window.localStorage;

                return {
                    get: function(key) {
                        var value = localStorage[self.prefix + key];
                        return value ? angular.fromJson(value)[0] : value;
                    },

                    put: function(key, value) {
                        localStorage[self.prefix + key] = angular.toJson([value]);
                    },

                    remove: function(key) {
                        localStorage.removeItem(self.prefix + key);
                    },

                    clear: function() {
                        localStorage.clear();
                    }
                };
            }];
        });

})(this.angular);  // this === window unless in a webworker
