define([
    "dojo/_base/declare",
    "dojo/_base/Deferred",
    "dojo/_base/lang",
    "dojo/json",
    "dojo/store/Memory",
    "dojo/store/JsonRest"
], function (declare, Deferred, lang, JSON, Memory, JsonRest) {
    var memoryStore = new Memory(),
        jsonRestStore = new JsonRest();

    return declare(null, {
        // summary:
        //      JsonRest store that allows offline storage.
        // isOnline: Boolean
        //      If the store is in online mode.  If so, the JsonRest store methods are used.
        isOnline: true,
        // hasLocalStorage: Boolean
        //      If localStorage functionality exists in the browser.
        hasLocalStorage: "localStorage" in window,
        // accepts: String
        //      Accepts headers for JsonRest call.
        accepts: "application/javascript, application/json",
        constructor: function (/*Object?*/ options) {
            // summary:
            //      Constructor of the class.
            // options: [optional] Object
            //      Properties/methods that will be mixed into the class.
            var data, item;
            
            lang.mixin(options);
            
            data = [];
            // Populate with any existing data in localStorage.
            if (this.hasLocalStorage) {
                for (item in localStorage) {
                    if (localStorage.hasOwnProperty(item) && item.indexOf(this.name) > -1) {
                        data.push(JSON.parse(localStorage.getItem(item)));
                    }
                }
            }
            
            this._setData(data);
            this.sync();
        },
        
        // Existing store methods
        _memoryGet: lang.hitch(this, memoryStore.get),
        _jsonRestGet: lang.hitch(this, jsonRestStore.get),
        _setData: lang.hitch(this, memoryStore.setData),
        _memoryPut: lang.hitch(this, memoryStore.put),
        _jsonRestPut: lang.hitch(this, jsonRestStore.put),
        _memoryQuery: lang.hitch(this, memoryStore.query),
        _jsonRestQuery: lang.hitch(this, jsonRestStore.query),
        
        get: function (/*String|Number*/ id) {
            // summary:
            //      Gets an item form the store.
            // id: String|Number
            //      ID of the object to retrieve.
            // returns: Object|Promise
            var item = this._memoryGet(id),
                getDeferred = new Deferred(),
                getPromise;

            if (this.isOnline && item && item.outdated && !item.removed) {
                getPromise = this._jsonRestGet(id);
                
                getPromise.then(lang.hitch(this, function (item) {
                    // if the request succeeds,  update memory and local, and resolve to the item
                    item.outdated = false;
                    item.modified = false;
                    
                    this._memoryPut(item);
                    this._localPut(item);
                    
                    getDeferred.resolve(item);
                }), lang.hitch(this, function () {
                    // if the request fails, put the store into offline mode and resolve to the stored item
                    this.makeOffline();
                    
                    getDeferred.resolve(item);
                }));
                
                return getDeferred.promise;
            } else {
                return item;
            }
        },
        _localPut: function (/*Object*/ object) {
            // summary:
            //      Store an item in localStorage.
            // object: Object
            //      Object to store.
            if (this.hasLocalStorage) {
                try {
                    localStorage.setItem(this.name + '-' + this.getIdentity(object), JSON.stringify(object));
                } catch (e) {
                    this._purge();
                    localStorage.setItem(this.name + '-' + this.getIdentity(object), JSON.stringify(object));
                }
            }
        },
        put: function (/*Object*/ object, /*PutDirectives?*/ options) {
            // summary:
            //      Put an object into the store.
            // object: Object
            //      Object to put into the store.
            // options: [optional] PutDirectives
            //      Options for the put call.
            var putPromise;
            
            if (this.isOnline) {
                object.outdated = false;
                object.modified = false;
                
                putPromise = this._jsonRestPut(object, options);
                putPromise.otherwise(lang.hitch(this, function () {
                    this.makeOffline();
                });
            } else {
                object.modified = true;
            }
            
            this._memoryPut(object, options);
            this._localPut(object, options);
        },
        query: function (/*Object*/ query, /*QueryOptions*/ options) {
            // summary:
            //      Query the store for data.  If the store is online, JsonRest is used.
            //      Otherwise, the Memory store is used.
            // query: Object
            //      Object containing key value pairs that can be converted
            //      into the query.
            // options: [optional] QueryOptions
            //      Options to be used in the query, such as count, start, etc.
            //  |   store.query({ name: "foo" });
            if (this.isOnline) {
                return this._jsonRestQuery(query, options);
            } else {
                return this._memoryQuery(query, options);
            }
        },
        sync: function () {
            // summary:
            //      Attempts to sync items with the server.
            if (this.isOnline) {
                this._memoryQuery(function (object) {
                    return object.outdated || object.modified
                }).forEach(lang.hitch(function (item) {
                    this.put(item);
                });
            }
        },
        _purge: function () {
            // summary:
            //      Purges the oldest item in the store.
            var item = this.data[0];
            
            item.removed = true;
            item.modified = true;
            
            if (this.hasLocalStorage) {
                localStorage.removeItem(this.name + '-' + this.getIdentity(item));
            }
            
            this.sync();
        },
        makeOnline: function () {
            // summary:
            //      Set the store into online mode.
            this.isOnline = true;
            this.sync();
        },
        makeOffline: function () {
            // summary:
            //      Set the store into offline mode.
            this.isOnline = false;
        }
    });
});
