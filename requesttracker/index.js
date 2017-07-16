var RequestTracker = function () {
    this.requests = {};
    this.requestCounter = 1;
};

/**
 * Returns the number of ongoing requests tracked by this RequestTracker instance.
 *
 * @return {Number}
 */
RequestTracker.prototype.size = function () {
    return Object.keys(this.requests).length;
};

/**
 * Returns the request with the given request ID, if it exists. If there's no request with the given request ID,
 * a RangeError will be thrown.
 *
 * @throws RangeError
 * @param requestId
 * @return {*}
 */
RequestTracker.prototype.get = function (requestId) {
    if (!this.has(requestId)) {
        throw new RangeError('The request with the request ID ' + requestId + ' is not or not anymore ' +
            'tracked by this RequestTracker.');
    }
    return this.requests[requestId];
};

/**
 * Returns an object of all requests tracked in this RequestTracker.
 *
 * @return {Object}
 */
RequestTracker.prototype.getAll = function () {
    return this.requests;
};

/**
 * Acquires a new, for this RequestTracker unique request ID.
 * TODO: migrate this to redis incr?
 *
 * @return {number}
 */
RequestTracker.prototype.acquireRequestId = function () {
    return this.requestCounter++;

};

/**
 * Adds the given request to the RequestTracker and returns it's new request ID. If the request ID patrameter
 * is set, this ID will be used to add the request and this ID will be returned.
 *
 * @param request
 * @param requestId
 * @return {*}
 */
RequestTracker.prototype.add = function (request, requestId) {
    if (!requestId)
        requestId = this.acquireRequestId();

    this.requests[requestId] = request;

    return requestId;
};

/**
 * Removes a request from the queue of tracked requests of this RequestTracker instance.
 *
 * @param requestId
 */
RequestTracker.prototype.remove = function (requestId) {
    if (!this.has(requestId)) {
        throw new RangeError('The request with the request ID ' + requestId + ' is not or not anymore ' +
            'tracked by this RequestTracker.');
    }
    delete this.requests[requestId];
};

/**
 * Checks, if a request with the given request ID exists.
 *
 * @param requestId
 * @return {boolean}
 */
RequestTracker.prototype.has = function (requestId) {
    return this.requests[requestId] !== undefined;
};

module.exports = RequestTracker;