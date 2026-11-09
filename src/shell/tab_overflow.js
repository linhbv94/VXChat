(function (root) {
  'use strict';

  function calculateTabOverflow({ groupWidths = [], availableWidth = 0, activeIndex = -1, pillWidth = 56, gap = 3 }) {
    if (!Array.isArray(groupWidths) || groupWidths.length === 0 || availableWidth <= 0) {
      return { overflow: false, overflowCount: 0, visibleIndices: [], overflowIndices: [] };
    }

    const totalWidth = groupWidths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
    if (totalWidth <= availableWidth) {
      return {
        overflow: false,
        overflowCount: 0,
        visibleIndices: groupWidths.map((_, i) => i),
        overflowIndices: []
      };
    }

    const budget = availableWidth - pillWidth - gap;
    const visibleSet = new Set();
    let currentUsed = 0;

    // Prioritize active group if specified
    if (activeIndex >= 0 && activeIndex < groupWidths.length) {
      visibleSet.add(activeIndex);
      currentUsed = groupWidths[activeIndex];
    }

    // Fill remaining budget with other groups from left to right
    for (let i = 0; i < groupWidths.length; i++) {
      if (i === activeIndex) continue;
      const needed = groupWidths[i] + (visibleSet.size > 0 ? gap : 0);
      if (currentUsed + needed <= budget) {
        visibleSet.add(i);
        currentUsed += needed;
      }
    }

    const visibleIndices = [];
    const overflowIndices = [];
    for (let i = 0; i < groupWidths.length; i++) {
      if (visibleSet.has(i)) visibleIndices.push(i);
      else overflowIndices.push(i);
    }

    return {
      overflow: overflowIndices.length > 0,
      overflowCount: overflowIndices.length,
      visibleIndices,
      overflowIndices
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { calculateTabOverflow };
  } else {
    root.vxchatTabOverflow = { calculateTabOverflow };
  }
})(typeof window === 'object' ? window : globalThis);
