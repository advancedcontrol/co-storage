(function (angular) {
    'use strict';

    angular.module('coUtils')
        .controller('AppCtrl', [
            '$rootScope',
            '$element',
            '$scope',
            'cache',
            '$http',
            function ($rootScope, $element, $scope, cache, $http) {
                $scope.put_json_key = null;
                $scope.put_json_value = null;
                $scope.get_json_key = null;
                $scope.remove_json_key = null;

                $scope.put_json_result = 'not run';
                $scope.get_json_result = 'not run';
                $scope.remove_json_result = 'not run';

                $scope.load_files_urls = '';
                $scope.file_image_url = null;
                $scope.file_video_url = null;
                $scope.cached_files = [];

                window.cache = cache;

                // db
                $scope.loaded = cache.db != null;
                $scope.downloading = cache.downloading;

                $rootScope.$on('co-storage-downloading', function(event, state) {
                    $scope.downloading = state;
                });


                // JSON
                $scope.putJSON = function() {
                    cache.json.put($scope.put_json_key, $scope.put_json_value).then(function(success) {
                        $scope.put_json_result = success;
                    }, function(evt) {
                        $scope.put_json_result = 'failed';
                    });
                }

                $scope.getJSON = function() {
                    cache.json.get($scope.get_json_key).then(function(value) {
                        if (value == undefined)
                            $scope.get_json_result = 'null';
                        else
                            $scope.get_json_result = value;
                    }, function(evt) {
                       $scope.get_json_result = 'failed';
                    });
                }

                $scope.removeJSON = function() {
                    cache.json.remove($scope.remove_json_key).then(function(success) {
                        $scope.remove_json_result = success;
                    }, function(evt) {
                       $scope.remove_json_result = 'failed';
                    });
                }


                // Files
                $scope.loadFiles = function() {
                    if ($scope.load_files_urls == '')
                        var urls = [];
                    else
                        var urls = $scope.load_files_urls.split("\n");
                    var files = [];

                    urls.forEach(function(url) {
                        files.push({url: url, size: 0, status: 2});
                    });

                    cache.files.load(files, function(url) {
                        console.log('cached', url);
                    }, function(url, type, err) {
                        console.log('error caching', url, type, err);
                    });
                }
                
                $scope.reloadCachedFiles = function() {
                    $scope.cached_files = [];
                    cache.meta.get('files').then(function(val) {
                        (val || []).forEach(function(file) {
                            $scope.cached_files.push(file.url);
                        });
                    });
                }

                $scope.getImage = function() {
                    cache.files.getImage($scope.file_image_url, $element.find('img'));
                }

                $scope.getVideo = function() {
                    cache.files.getVideo($scope.file_video_url, $element.find('video'));
                }
            }
        ]);

}(this.angular));
