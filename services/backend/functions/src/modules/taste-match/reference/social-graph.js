'use strict';

const { assert, nonempty, keyOf } = require('./utils');

class SocialGraph {
  constructor(edges = []) {
    this.edges = new Set();
    for (const edge of edges) this.add(edge);
  }

  add({ fromUserId, toUserId, type }) {
    nonempty(fromUserId, 'fromUserId');
    nonempty(toUserId, 'toUserId');
    assert(fromUserId !== toUserId, 'Self relationships are not allowed');
    assert(
      ['friend', 'follow', 'block'].includes(type),
      'Unknown relationship type',
    );
    this.edges.add(keyOf(type, fromUserId, toUserId));
    if (type === 'friend') this.edges.add(keyOf(type, toUserId, fromUserId));
  }

  remove({ fromUserId, toUserId, type }) {
    this.edges.delete(keyOf(type, fromUserId, toUserId));
    if (type === 'friend') this.edges.delete(keyOf(type, toUserId, fromUserId));
  }

  has(type, from, to) {
    return this.edges.has(keyOf(type, from, to));
  }
  blocked(a, b) {
    return this.has('block', a, b) || this.has('block', b, a);
  }
  relation(viewer, author) {
    if (this.blocked(viewer, author)) return 'blocked';
    if (this.has('friend', viewer, author)) return 'friend';
    if (this.has('follow', viewer, author)) return 'follow';
    return 'stranger';
  }
}

module.exports = { SocialGraph };
