'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.vxchatDownloadFeedback = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function formatCueText(items, lang = 'vi') {
    if (!Array.isArray(items) || items.length === 0) return '';
    const isEn = lang === 'en';
    if (items.length === 1) {
      const name = items[0].name || (isEn ? 'file' : 'tệp');
      return isEn ? `Download completed: ${name}` : `Đã tải xong: ${name}`;
    }
    return isEn ? `${items.length} downloads completed` : `Đã tải xong ${items.length} tệp`;
  }

  function createDownloadFeedbackTracker(options = {}) {
    const onCue = typeof options.onCue === 'function' ? options.onCue : null;
    const knownStatus = new Map();
    let isInitialized = false;

    // Seed baseline from initialRecords if provided
    if (Array.isArray(options.initialRecords) && options.initialRecords.length > 0) {
      for (const item of options.initialRecords) {
        if (item && item.id) knownStatus.set(item.id, item.status);
      }
      isInitialized = true;
    }

    function update(records) {
      if (!Array.isArray(records)) return [];

      // First snapshot serves as baseline to avoid replaying cues for already completed files
      if (!isInitialized) {
        for (const item of records) {
          if (item && item.id) knownStatus.set(item.id, item.status);
        }
        isInitialized = true;
        return [];
      }

      const completedNow = [];
      for (const item of records) {
        if (!item || !item.id) continue;
        const previousStatus = knownStatus.get(item.id);
        const currentStatus = item.status;

        knownStatus.set(item.id, currentStatus);

        // Only trigger cue when transitioning from downloading to completed
        if (previousStatus === 'downloading' && currentStatus === 'completed') {
          completedNow.push(item);
        }
      }

      // Memory bound: trim entries that are no longer in active records if map grows large
      if (knownStatus.size > 200) {
        const activeIds = new Set(records.map(r => r.id));
        for (const id of knownStatus.keys()) {
          if (!activeIds.has(id)) knownStatus.delete(id);
        }
      }

      if (completedNow.length > 0 && onCue) {
        onCue(completedNow);
      }

      return completedNow;
    }

    function reset() {
      knownStatus.clear();
      isInitialized = false;
    }

    return {
      update,
      formatCueText,
      reset,
      _knownStatus: knownStatus
    };
  }

  return {
    createDownloadFeedbackTracker,
    formatCueText
  };
});
