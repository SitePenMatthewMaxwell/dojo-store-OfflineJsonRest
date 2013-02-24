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
        isOnline: true,
        hasLocalStorage: "localStorage" in window,
        accepts: "application/javascript, application/json",
        constructor: function (options) {
            var data, item;
            
            lang.mixin(options);
            
            data = [];
            // if localStorage is available and contains data for a store of this name, pull it in
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
        
        /* piggy back off of existing methods */
        _memoryGet: lang.hitch(this, memoryStore.get),
        _jsonRestGet: lang.hitch(this, jsonRestStore.get),
        _setData: lang.hitch(this, memoryStore.setData),
        _memoryPut: lang.hitch(this, memoryStore.put),
        _jsonRestPut: lang.hitch(this, jsonRestStore.put),
        _memoryQuery: lang.hitch(this, memoryStore.query),
        _jsonRestQuery: lang.hitch(this, jsonRestStore.query),
        
        // get an item by its id, returns the item or a promise to the item
        get: function (id) {
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
        // locally store an item in localStorage
        _localPut: function (object) {
            if (this.hasLocalStorage) {
                try {
                    localStorage.setItem(this.name + '-' + this.getIdentity(object), JSON.stringify(object));
                } catch (e) {
                    this._purge();
                    localStorage.setItem(this.name + '-' + this.getIdentity(object), JSON.stringify(object));
                }
            }
        },
        // put an object into the store
        put: function (object, options) {
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
        // if the store is online, use json rest query, otherwise use memory query
        query: function (query, options) {
            if (this.isOnline) {
                return this._jsonRestQuery(object, options);
            } else {
                return this._memoryQuery(object, options);
            }
        },
        // utilize dojo/store/Memory's built in query
        // *may make sense to just pull in SimpleQueryEngine, as this feels a little janky
        _memoryQuery: function () {
            return this.inherited("query", arguments);
        },
        // sync items with the server
        sync: function () {
            if (this.isOnline) {
                this._memoryQuery(function (object) {
                    return object.outdated || object.modified
                }).forEach(lang.hitch(function (item) {
                    this.put(item);
                });
            }
        },
        // purge the oldest item in the store
        _purge: function () {
            var item = this.data[0];
            
            item.removed = true;
            item.modified = true;
            
            if (this.hasLocalStorage) {
                localStorage.removeItem(this.name + '-' + this.getIdentity(item));
            }
            
            this.sync();
        },
        // set store to online mode
        makeOnline: function () {
            this.isOnline = true;
            this.sync();
        },
        // set store to offline mode
        makeOffline: function () {
            this.isOnline = false;
        }
    });
});