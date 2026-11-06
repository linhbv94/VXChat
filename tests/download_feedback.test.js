'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDownloadFeedbackTracker } = require('../src/shell/download_feedback');

test('first snapshot serves as baseline and does not replay cues for existing completed downloads', () => {
  let cues = [];
  const tracker = createDownloadFeedbackTracker({ onCue: items => cues.push(...items) });

  const initialList = [
    { id: 'dl-1', name: 'photo.jpg', status: 'completed' },
    { id: 'dl-2', name: 'doc.pdf', status: 'completed' },
    { id: 'dl-3', name: 'video.mp4', status: 'downloading' }
  ];

  const result = tracker.update(initialList);
  assert.equal(result.length, 0);
  assert.equal(cues.length, 0);
});

test('transitions from downloading to completed trigger cue exactly once per file ID', () => {
  let cues = [];
  const tracker = createDownloadFeedbackTracker({ onCue: items => cues.push(...items) });

  // Baseline
  tracker.update([{ id: 'dl-1', name: 'archive.zip', status: 'downloading' }]);
  assert.equal(cues.length, 0);

  // Still downloading -> no cue
  tracker.update([{ id: 'dl-1', name: 'archive.zip', status: 'downloading' }]);
  assert.equal(cues.length, 0);

  // Transition to completed -> trigger cue once
  const completed = tracker.update([{ id: 'dl-1', name: 'archive.zip', status: 'completed' }]);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, 'dl-1');
  assert.equal(cues.length, 1);

  // Repeated completed snapshot -> no duplicate cue
  const repeat = tracker.update([{ id: 'dl-1', name: 'archive.zip', status: 'completed' }]);
  assert.equal(repeat.length, 0);
  assert.equal(cues.length, 1);
});

test('cancelled, failed, or cleared downloads do not trigger a success cue', () => {
  let cues = [];
  const tracker = createDownloadFeedbackTracker({ onCue: items => cues.push(...items) });

  tracker.update([
    { id: 'dl-cancel', name: 'cancel.bin', status: 'downloading' },
    { id: 'dl-fail', name: 'fail.bin', status: 'downloading' }
  ]);

  tracker.update([
    { id: 'dl-cancel', name: 'cancel.bin', status: 'cancelled' },
    { id: 'dl-fail', name: 'fail.bin', status: 'failed' }
  ]);
  assert.equal(cues.length, 0);

  // List cleared -> no cue
  tracker.update([]);
  assert.equal(cues.length, 0);
});

test('multiple files completing in the same snapshot aggregate cleanly', () => {
  let cueBatches = [];
  const tracker = createDownloadFeedbackTracker({ onCue: batch => cueBatches.push(batch) });

  tracker.update([
    { id: 'f-1', name: 'file1.png', status: 'downloading' },
    { id: 'f-2', name: 'file2.png', status: 'downloading' }
  ]);

  const finished = tracker.update([
    { id: 'f-1', name: 'file1.png', status: 'completed' },
    { id: 'f-2', name: 'file2.png', status: 'completed' }
  ]);

  assert.equal(finished.length, 2);
  assert.equal(cueBatches.length, 1);
  assert.equal(cueBatches[0].length, 2);

  // Formatter tests
  assert.equal(tracker.formatCueText(finished.slice(0, 1), 'vi'), 'Đã tải xong: file1.png');
  assert.equal(tracker.formatCueText(finished.slice(0, 1), 'en'), 'Download completed: file1.png');
  assert.equal(tracker.formatCueText(finished, 'vi'), 'Đã tải xong 2 tệp');
  assert.equal(tracker.formatCueText(finished, 'en'), '2 downloads completed');
});

test('initialRecords option allows deterministic seeding on construction', () => {
  let cues = [];
  const tracker = createDownloadFeedbackTracker({
    initialRecords: [{ id: 'seeded-1', status: 'downloading' }],
    onCue: items => cues.push(...items)
  });

  const completed = tracker.update([{ id: 'seeded-1', status: 'completed' }]);
  assert.equal(completed.length, 1);
  assert.equal(cues.length, 1);
});
