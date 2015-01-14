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
                $scope.load_files_urls = '';
                $scope.file_image_url = null;
                $scope.file_video_url = null;
                $scope.file_video_mime = null;

                window.cache = cache;

                // db
                $scope.loaded = cache.db != null;
                $scope.downloading = cache.downloading;

                $rootScope.$on('co-storage-downloading', function(event, state) {
                    $scope.downloading = state;
                });

                // Files
                $scope.loadFiles = function() {
                    if ($scope.load_files_urls == '')
                        var urls = [];
                    else
                        var urls = $scope.load_files_urls.split("\n");
                    var files = [];

                    urls.forEach(function(url) {
                        files.push(url);
                    });

                    cache.load(files, function(url) {
                        console.log('cached', url);
                    }, function(url, type, err) {
                        console.log('error caching', url, type, err);
                    });
                }
                
                $scope.getImage = function() {
                    cache.getImage($scope.file_image_url, $element.find('img'));
                }

                $scope.getVideo = function() {
                    cache.getVideo($scope.file_video_url, $element.find('video'), $scope.file_video_mime);
                }
            }
        ]);

}(this.angular));
