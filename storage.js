(function (angular) {
    'use strict';

    // Use existing module otherwise create a new one
    var module;
    try {
        module = angular.module('coUtils');
    } catch (e) {
        module = angular.module('coUtils', ['LocalForageModule']);
    }

    var CACHED_FILES = 'files';
    var DL_EVENT     = 'co-storage-downloading';

    module
        .service('cache', [
            '$localForage',
            '$rootScope',
            '$timeout',
            '$http',
            '$q',
            function(cache, $rootScope, $timeout, $http, $q) {

                // --------------------------
                // Files API
                // --------------------------
                var files = this,
                    currentJob = $q.reject(false), // Create a resolved promise to start from
                    downloadingComplete = $q.defer(),
                    cancelNext = false,
                    failures = [];
                

                downloadingComplete.resolve(true);
                files.downloading = false;

                function _cacheFile(defer, fileList, index) {
                    // download files sequentially. because ajax requests are async
                    // looping through each url and calling $http.get for each would
                    // result in multiple concurrent requests. instead, the success/
                    // error callbacks "recursively" call this function modifying
                    // index until the end of the array is reached. because the
                    // callbacks are called independently of the originating call,
                    // long url lists won't result in long stacks.
                    if (index >= fileList.length || cancelNext) {
                        files.downloading = false;
                        $rootScope.$broadcast(DL_EVENT, false);
                        if (cancelNext) {
                            defer.reject(false);
                        } else {
                            defer.resolve({
                                cached: fileList,
                                failed: failures
                            });
                        }
                        return;
                    }

                    var file = fileList[index];
                    function next() {
                        _cacheFile(defer, fileList, index + 1);
                    }

                    cache.getItem(file).then(function(exists) {
                        // Check we are not canceling the file
                        if (exists || cancelNext) {
                            if (exists && !cancelNext) {
                                defer.notify({
                                    loaded: file, 
                                    at: index
                                });
                            }
                            return next();
                        }

                        // Download the file
                        // TODO:: Monitor progress - need to use jQuery Ajax
                        // That way any downloads that don't progress can be canceled
                        // We should also have a global download reference so it can be canceled by a new list
                        $http.get(file, {
                            responseType: 'blob',
                            cache: true
                        }).success(function(blob, status, other) {
                            // Save the file to database
                            cache.setItem(file, blob).then(function() {
                                defer.notify({
                                    loaded: file, 
                                    at: index
                                });
                            }).catch(function(err) {
                                console.error('Error storing file', file, err);
                                failures.push(file);
                            });

                        }).error(function(resp, status) {

                            console.error('Error requesting file', file, status);
                            failures.push(file);

                        }).finally(next);

                    // always move to the next file, even on db errors
                    }).catch(function(err) {
                        console.error('Error calling _exists', file, err);
                        failures.push(file);
                        next();
                    });
                }

                files.load = function(fileList) {
                    var dc = downloadingComplete,
                        newDc = $q.defer();

                    downloadingComplete = newDc;

                    currentJob.finally(function () {
                        currentJob = cache.getItem(CACHED_FILES).then(function (old_files) {
                            old_files = old_files || [];

                            // Generate a file lookup
                            var new_urls = {};
                            fileList.forEach(function(file, index) {
                                if (!new_urls[file])
                                    new_urls[file] = index + 1; // index starting at 1 so we don't have 0 == false
                            });

                            // Remove files that are not in the new list
                            old_files.forEach(function(file) {
                                if (file in new_urls)
                                    return;

                                cache.removeItem(file).then(function() {
                                    console.log('Removed stale file', file);
                                }).catch(function(err) {
                                    console.error('Error removing stale file', file, err);
                                });
                            });
                            
                            // Save the new list
                            return cache.setItem(CACHED_FILES, fileList).catch(function(err) {
                                console.error('Error setting cached file list', err);
                            });
                        }).finally(function () {
                            // If there is an existing download occurring we want to stop it first
                            if (files.downloading) {
                                cancelNext = true;
                            }

                            // Wait for the downloading to stop and start the next download
                            dc.promise.finally(function () {
                                if (newDc === downloadingComplete) {
                                    // Lets start the caching!
                                    files.downloading = true;
                                    $rootScope.$broadcast(DL_EVENT, true);
                                    cancelNext = false;
                                    failures = [];
                                    _cacheFile(newDc, fileList, 0);
                                } else {
                                    // There is already a new list replacing this one
                                    newDc.reject(false);
                                }
                            });
                        });
                    });

                    return downloadingComplete.promise;
                };

                files.getImage = function(url, img) {
                    return cache.getItem(url).then(function(blob) {
                        if (blob) {
                            // fix for IE 10 (out of scope blobs revoke the URL)
                            var src = [URL.createObjectURL(blob), blob];

                            // give chrome a little time to make the link valid
                            return $timeout(function () {
                                img.attr('src', src[0]);
                                return function () {
                                    URL.revokeObjectURL(src[0]);
                                };
                            }, 100);
                        } else {
                            console.log('File not in cache', url);
                            return $q.reject('File not downloaded');
                        }
                    });
                };

                files.getVideo = function(url, video, mimeType) {
                    return cache.getItem(url).then(function(blob) {
                        if (blob) {
                            if (mimeType) {
-                                blob = new Blob([blob], {type: mimeType});
                            }

                            var src = [URL.createObjectURL(blob), blob];

                            return $timeout(function () {
                                video.attr('src', src[0]);
                                return function () {
                                    URL.revokeObjectURL(src[0]);
                                };
                            }, 100);
                        } else {
                            console.log('File not in cache', url);
                            return $q.reject('File not downloaded');
                        }
                    });
                };
            }
        ]);

}(this.angular));
