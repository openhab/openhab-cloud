var rt = require('../../../requesttracker');

QUnit.module("RequestTracker");

QUnit.test('Acquiring request ID twice returns not equal IDs', function (assert) {
    var tracker = new rt(),
        id1 = tracker.acquireRequestId(),
        id2 = tracker.acquireRequestId();

    assert.notEqual(id1, id2);
});

QUnit.test('Adding request without ID generates a new request ID', function (assert) {
    var tracker = new rt(),
        request = {},
        nextId = tracker.acquireRequestId(),
        requestId = tracker.add(request);

    assert.notEqual(nextId, requestId);
    assert.equal(tracker.get(requestId), request);
});

QUnit.test('Adding request with ID', function (assert) {
    var tracker = new rt(),
        request = {},
        nextId = tracker.acquireRequestId(),
        requestId = tracker.add(request, nextId);

    assert.equal(nextId, requestId);
    assert.equal(tracker.get(nextId), request);
});

QUnit.test('#has', function (assert) {
    var tracker = new rt(),
        requestId = tracker.acquireRequestId();

    assert.notOk(tracker.has(1234));
    assert.notOk(tracker.has(requestId));

    tracker.add({}, requestId);

    assert.ok(tracker.has(requestId));
});