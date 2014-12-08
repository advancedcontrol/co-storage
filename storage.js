(function (angular) {
    'use strict';

    // Use existing module otherwise create a new one
    var module;
    try {
        module = angular.module('coUtils');
    } catch (e) {
        module = angular.module('coUtils', []);
    }

    // stores
    var FILE_STORE   = 'files';
    var JSON_STORE   = 'json';
    var META_STORE   = 'meta';
    var STORES       = [FILE_STORE, JSON_STORE, META_STORE];

    // special keys
    var BLOB         = 'blob';
    var CACHED_FILES = 'files';

    // events
    var DL_EVENT     = 'co-storage-downloading';
    var FIVE_MINUTES = 5 * 60 * 1000;

    module
        // each store is represented by a different physical db
        .factory('CacheStore', [
            '$q',
            function($q) {
                return function(name) {
                    // --------------------------
                    // initialisation
                    // --------------------------
                    var db = new PouchDB(name);
                    var store = this;
                    this.db = db;

                    this.compact = function() {
                        db.compact().catch(function(err) {
                            console.log('compaction failed for cache db ' + name, err);
                        });
                    }

                    // pouchdb stores all revisions of a record until compaction
                    setInterval(function() {
                        store.compact();
                    }, FIVE_MINUTES);

                    // Value handling: values can be objects and simple values -
                    // cache.meta.put('name', 'benny') is valid, as is
                    // cache.files.put('file_name', {url: 'http://...'})
                    // To satisfy pouchdb's record format, the actual value stored
                    // in the db is an object with this structure:
                    // {_id: key, _rev: revision, val: your_value}
                    // When you call get, the value stored in val is returned as is.
                    // If the record has an associated file, however, the returned
                    // value is an object with this structure:
                    // {blob: Blob(), val: your_value}
                    // This means simple use (e.g with the meta and json stores)
                    // avoids having to traverse an object to use .val; but does
                    // mean you need to know ahead of time whether a record will
                    // be storing a file.

                    // --------------------------
                    // methods
                    // --------------------------
                    this.get = function(key) {
                        return $q(function(resolve, reject) {
                            db.get(key, {attachments: true}, function(err, doc) {
                                if (err) {
                                    if (err.status == 404)
                                        resolve(undefined);
                                    else
                                        reject(err);
                                } else {
                                    if (!doc._attachments)
                                        return resolve(doc.val);
                                    db.getAttachment(key, BLOB).then(function(blob) {
                                        resolve({
                                            val: doc.val,
                                            blob: blob
                                        });
                                    }).catch(function(err) {
                                        reject(err);
                                    });
                                }
                            });
                        });
                    }

                    this.put = function(key, value, blob) {
                        var doc = {
                            _id: key,
                            val: value
                        };

                        return $q(function(resolve, reject) {
                            function put() {
                                db.put(doc).then(function(result) {
                                    if (!blob) {
                                        resolve(true);
                                    } else {
                                        return db.putAttachment(key, BLOB, result.rev, blob, blob.type).then(function() {
                                            resolve(true);
                                        });
                                    }
                                }).catch(function(err) {
                                    reject(err);
                                });
                            }

                            db.get(key).then(function(existing) {
                                doc._rev = existing._rev;
                                put();
                            }).catch(function(err) {
                                if (err.status == 404)
                                    put();
                                else
                                    reject(err);
                            })
                        });
                    }

                    this.remove = function(key) {
                        return $q(function(resolve, reject) {
                            db.get(key, function(err, doc) {
                                if (err) {
                                    if (err.status == 404)
                                        resolve(true);
                                    else
                                        reject(err);
                                } else {
                                    db.remove(doc).then(function() {
                                        resolve(true);
                                    }).catch(function(err) {
                                        reject(err);
                                    })
                                }
                            });
                        });
                    }

                    this.exists = function(key) {
                        return $q(function(resolve, reject) {
                            db.get(key, function(err, doc) {
                                if (err) {
                                    if (err.status == 404)
                                        resolve(false);
                                    else
                                        reject(err);
                                } else {
                                    resolve(true);
                                }
                            });
                        });
                    }
                }
            }
        ])

        .service('cache', [
            'CacheStore',
            '$rootScope',
            '$http',
            '$q',
            function(CacheStore, $rootScope, $http, $q) {
                // --------------------------
                // initialisation
                // --------------------------
                var cache = this;

                STORES.forEach(function(name) {
                    cache[name] = new CacheStore(name);
                    cache[name].compact();
                });

                // --------------------------
                // Files API
                // --------------------------
                var files = this.files;
                files.downloading = false;

                function _cacheFile(fileList, index, complete, error) {
                    // download files sequentially. because ajax requests are async
                    // looping through each url and calling $http.get for each would
                    // result in multiple concurrent requests. instead, the success/
                    // error callbacks "recursively" call this function modifying
                    // index until the end of the array is reached. because the
                    // callbacks are called independently of the originating call,
                    // long url lists won't result in long stacks.
                    if (index >= fileList.length) {
                        files.downloading = false;
                        $rootScope.$broadcast(DL_EVENT, false);
                        files.compact();
                        return;
                    }

                    var file = fileList[index];
                    var url = file.url;
                    function next() {
                        _cacheFile(fileList, index + 1, complete, error);
                    }

                    files.exists(url).then(function(exists) {
                        if (exists)
                            return next();

                        $http.get(url, {
                            responseType: 'blob',
                            cache: true
                        }).success(function(blob, status) {
                            files.put(url, file, blob).then(function() {
                                complete(url);
                            }).catch(function(err) {
                                console.error('Error storing file', url, err);
                                error(url, 'db', err);
                            });

                        }).error(function(resp, status) {
                            console.error('Error requesting file', url, status);
                            error(url, 'http', status);

                        }).finally(function() {
                            next();
                        });

                    // always move to the next file, even on db errors
                    }).catch(function(err) {
                        console.error('Error calling _exists', url, err);
                        next();
                    });
                }

                files.load = function(fileList, complete, error) {
                    // Optional callback functions
                    complete = complete || angular.noop;
                    error = error || angular.noop;
                    
                    cache.meta.get(CACHED_FILES).then(function(old_files) {
                        if (old_files != undefined) {
                            var new_urls = {};
                            fileList.forEach(function(file) {
                                new_urls[file.url] = true;
                            });

                            old_files.forEach(function(file) {
                                if (file.url in new_urls)
                                    return;
                                files.remove(file.url).then(function() {
                                    console.log('Removed stale file', file.url);
                                }).catch(function(err) {
                                    console.error('Error removing stale file', file.url, err);
                                });
                            });
                        }

                        cache.meta.put(CACHED_FILES, fileList).catch(function(err) {
                            console.error('Error setting cached file list', err);
                        });

                    }).catch(function(err) {
                        console.error('Unable to load cached file list');

                    }).finally(function() {
                        files.downloading = true;
                        $rootScope.$broadcast(DL_EVENT, true);
                        _cacheFile(fileList, 0, complete, error);
                    });
                }

                files.getImage = function(url, img) {
                    return files.get(url).then(function(doc) {
                        if (doc === undefined || doc.blob === undefined) {
                            img.attr('src', null);
                        } else {
                            img.attr('src', URL.createObjectURL(doc.blob));
                            img.on('load', function() {
                                URL.revokeObjectURL(this.src);
                            });
                        }
                    });
                }

                files.getVideo = function(url, video) {
                    return files.get(url).then(function(doc) {
                        if (doc === undefined || doc.blob === undefined) {
                            video.attr('src', null);
                        } else {
                            video.attr('src', URL.createObjectURL(doc.blob));
                            video.on('progress', function() {
                                if (video.prop('buffered').end(0) == video.prop('duration'))
                                    URL.revokeObjectURL(this.src);
                            });
                        }
                    });
                }
            }
        ]);

}(this.angular));
