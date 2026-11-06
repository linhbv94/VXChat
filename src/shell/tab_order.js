(function (root) {
  'use strict';
  function tabOrder(ids, source, target, after) {
    if (source === target || !ids.includes(source) || !ids.includes(target)) return null;
    const next = ids.filter(id => id !== source); next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source); return next;
  }
  if (typeof module === 'object') module.exports = tabOrder;
  else root.vxchatTabOrder = tabOrder;
})(typeof window === 'object' ? window : globalThis);
