'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ProfileStore, scopeForService, partitionForProfile, defaultProfiles, PROFILE_COLORS } = require('../src/core/profile_store');
const { StateStore, initialState } = require('../src/core/state_store');
const { TabEngine } = require('../src/core/tab_engine');
const { validCommand } = require('../src/main/ipc');

test('ProfileStore initializes with default profiles and derives correct partitions', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_profile_store_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'profiles.json');

  const store = new ProfileStore(file);
  const profiles = store.snapshot();
  assert.equal(profiles.length, 5);

  const googleProfile = profiles.find(p => p.scope_key === 'google');
  assert.ok(googleProfile);
  assert.equal(googleProfile.id, 'default_google');
  assert.equal(googleProfile.partition, 'persist:service-google');
  assert.equal(googleProfile.is_default, true);

  const messengerProfile = profiles.find(p => p.scope_key === 'messenger');
  assert.equal(messengerProfile.partition, 'persist:service-messenger');

  // Verify scope derivation
  assert.equal(scopeForService('gmail'), 'google');
  assert.equal(scopeForService('gemini'), 'google');
  assert.equal(scopeForService('meet'), 'google');
  assert.equal(scopeForService('messenger'), 'messenger');
  assert.equal(scopeForService('zalo'), 'zalo');
  assert.equal(scopeForService('slack'), 'slack');
  assert.equal(scopeForService('chatgpt'), 'chatgpt');

  // Verify partition derivation
  assert.equal(partitionForProfile('google', 'default_google'), 'persist:service-google');
  assert.equal(partitionForProfile('google', 'profile_xyz'), 'persist:service-google-profile_xyz');
  assert.equal(partitionForProfile('messenger', 'profile_xyz'), 'persist:service-messenger-profile_xyz');
});

test('ProfileStore supports create, update, delete and protects default profiles', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_profile_crud_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'profiles.json');
  const store = new ProfileStore(file);

  // Create custom profile
  const created = store.create({ scope_key: 'messenger', label: 'Công việc', color: 'emerald' });
  assert.ok(created.id.startsWith('profile_'));
  assert.equal(created.label, 'Công việc');
  assert.equal(created.color, 'emerald');
  assert.equal(created.partition, `persist:service-messenger-${created.id}`);
  assert.equal(created.is_default, false);

  assert.equal(store.snapshot().length, 6);

  // Update profile
  const updated = store.update(created.id, { label: 'Work Updated', color: 'rose' });
  assert.equal(updated.label, 'Work Updated');
  assert.equal(updated.color, 'rose');

  // Cannot delete default profile
  assert.throws(() => store.delete('default_google'), /cannot_delete_default_profile/);

  // Delete custom profile
  const deleted = store.delete(created.id);
  assert.equal(deleted.id, created.id);
  assert.equal(store.snapshot().length, 5);

  // Reload from disk to verify persistence
  const reloaded = new ProfileStore(file);
  assert.equal(reloaded.snapshot().length, 5);
});

test('TabEngine integrates with ProfileStore for multi-account lifecycle', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_tab_engine_profiles_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const stateFile = path.join(dir, 'state.json');
  const profileFile = path.join(dir, 'profiles.json');

  const stateStore = new StateStore(stateFile);
  const profileStore = new ProfileStore(profileFile);

  const createdOwners = [];
  const engine = new TabEngine({
    store: stateStore,
    profileStore,
    createOwner: ({ tab, instance }) => {
      const owner = {
        tab,
        instance,
        status: 'ready',
        load: () => {},
        setSelected: () => {},
        dispose: () => {},
        confirmClose: async () => true,
        snapshot: () => ({ location: 'https://example.test' })
      };
      createdOwners.push(owner);
      return owner;
    }
  });

  engine.start();
  assert.equal(engine.snapshot().instances.length, 7);

  // Create new account for Messenger
  const resMessenger = await engine.createAccount({
    service_id: 'messenger',
    label: 'Cá nhân 2',
    color: 'amber'
  });
  assert.ok(resMessenger.profile.id);
  assert.equal(resMessenger.instance.service_id, 'messenger');
  assert.equal(resMessenger.instance.profile_label, 'Cá nhân 2');
  assert.equal(resMessenger.instance.profile_color, 'amber');

  const snapMessenger = engine.snapshot();
  assert.equal(snapMessenger.instances.length, 8);
  const messengerTabs = snapMessenger.tabs.filter(t => t.service_id === 'messenger');
  assert.equal(messengerTabs.length, 2);
  assert.ok(messengerTabs.some(t => t.instance_id === 'default_messenger'));
  assert.ok(messengerTabs.some(t => t.instance_id === resMessenger.instance.id));

  // Create new account for Gmail -> must create instances for Gmail, Gemini, Meet
  const resGoogle = await engine.createAccount({
    service_id: 'gmail',
    label: 'Google Work',
    color: 'violet'
  });
  assert.ok(resGoogle.profile.id);

  const snapGoogle = engine.snapshot();
  // 7 defaults + 1 messenger + 3 google (gmail, gemini, meet) = 11 instances
  assert.equal(snapGoogle.instances.length, 11);

  const googleWorkInstances = snapGoogle.instances.filter(i => i.profile_id === resGoogle.profile.id);
  assert.equal(googleWorkInstances.length, 3);
  const googleServices = googleWorkInstances.map(i => i.service_id).sort();
  assert.deepEqual(googleServices, ['gemini', 'gmail', 'meet']);
  // All 3 share the same partition
  const partitions = new Set(googleWorkInstances.map(i => i.partition));
  assert.equal(partitions.size, 1);
  assert.equal([...partitions][0], `persist:service-google-${resGoogle.profile.id}`);

  // Update Google profile
  await engine.updateAccount(resGoogle.profile.id, { label: 'Google Cong Ty', color: 'cyan' });
  const snapUpdated = engine.snapshot();
  const updatedWorkInstances = snapUpdated.instances.filter(i => i.profile_id === resGoogle.profile.id);
  assert.ok(updatedWorkInstances.every(i => i.profile_label === 'Google Cong Ty' && i.profile_color === 'cyan'));
  const updatedGmailTab = snapUpdated.tabs.find(t => t.instance_id === resGoogle.instance.id);
  assert.equal(updatedGmailTab.label, 'Gmail (Google Cong Ty)');

  // Delete Google profile
  await engine.deleteAccount(resGoogle.profile.id);
  const snapDeleted = engine.snapshot();
  assert.equal(snapDeleted.instances.length, 8); // Back to 7 defaults + 1 messenger
  assert.equal(snapDeleted.instances.some(i => i.profile_id === resGoogle.profile.id), false);

  engine.dispose();
});

test('IPC commands validate multi-account actions correctly', () => {
  assert.equal(validCommand({ action: 'account_create', service_id: 'messenger', label: 'Work', color: 'amber' }), true);
  assert.equal(validCommand({ action: 'account_create', service_id: 'invalid_svc', label: 'Work', color: 'amber' }), false);
  assert.equal(validCommand({ action: 'account_create', service_id: 'messenger', label: '', color: 'amber' }), false);
  assert.equal(validCommand({ action: 'account_create', service_id: 'messenger', label: 'Work', color: 'invalid_color' }), false);

  assert.equal(validCommand({ action: 'account_update', profile_id: 'profile_123', label: 'New Label', color: 'rose' }), true);
  assert.equal(validCommand({ action: 'account_delete', profile_id: 'profile_123' }), true);
  assert.equal(validCommand({ action: 'instance_open', instance_id: 'instance_gmail_123' }), true);
});

test('ProfileStore throws profile_recovery_required on corrupt file and preserves file content', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_profile_corrupt_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'profiles.json');
  fs.writeFileSync(file, 'INVALID JSON CONTENT');

  assert.throws(() => new ProfileStore(file), /profile_recovery_required/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'INVALID JSON CONTENT');
});

test('ProfileStore rejects cross-scope partition spoofing', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_profile_spoof_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'profiles.json');
  const spoofed = [
    ...defaultProfiles(),
    { id: 'profile_spoof', scope_key: 'messenger', label: 'Spoof', color: 'blue', partition: 'persist:service-google-spoof', is_default: false }
  ];
  fs.writeFileSync(file, JSON.stringify(spoofed));
  assert.throws(() => new ProfileStore(file), /profile_recovery_required/);
});

test('TabEngine.deleteAccount rejects default profiles immediately without teardown', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_tab_engine_delete_def_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateStore = new StateStore(path.join(dir, 'state.json'));
  const profileStore = new ProfileStore(path.join(dir, 'profiles.json'));

  let disposed = false;
  const engine = new TabEngine({
    store: stateStore,
    profileStore,
    createOwner: () => ({ status: 'ready', load: () => {}, setSelected: () => {}, dispose: () => { disposed = true; }, confirmClose: async () => true, snapshot: () => ({}) })
  });
  engine.start();

  await assert.rejects(() => engine.deleteAccount('default_google'), /cannot_delete_default_profile/);
  assert.equal(disposed, false);
  engine.dispose();
});
