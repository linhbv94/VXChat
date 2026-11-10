'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { PreferencesStore, DEFAULTS, PRESET_CUSTOM_ICONS } = require('../src/core/preferences_store');
const { ProfileStore } = require('../src/core/profile_store');
const { StateStore, initialState } = require('../src/core/state_store');
const { ServiceState, initialServiceState } = require('../src/core/service_state');
const { PermissionStore } = require('../src/core/permission_store');
const { TabEngine } = require('../src/core/tab_engine');
const { service, navigationKind, popupDisposition, clearCustomServices } = require('../src/core/services');
const { navigationDecision } = require('../src/core/workflow');
const { validCommand } = require('../src/main/ipc');

test('custom services: schema 3 to 4 migration and preferences validation', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_custom_pref_'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearCustomServices();
  });
  const file = path.join(dir, 'prefs.json');

  // Schema 3 without custom_services migrates to schema 4 with custom_services: []
  const schema3 = {
    ...DEFAULTS,
    schema_version: 3
  };
  delete schema3.custom_services;
  fs.writeFileSync(file, JSON.stringify(schema3));
  const store = new PreferencesStore(file);
  assert.equal(store.snapshot().schema_version, 4);
  assert.deepEqual(store.snapshot().custom_services, []);

  // Update with valid custom service
  const validCustom = {
    id: 'custom_0123456789abcdef0123456789abcdef',
    label: 'My Mattermost',
    service_url: 'https://chat.example.com/',
    login_url: 'https://auth.example.com/login',
    icon_key: 'zchat',
    created_at: Date.now()
  };

  const nextOrder = [...DEFAULTS.service_order, validCustom.id];
  store.update({
    custom_services: [validCustom],
    service_order: nextOrder
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.custom_services.length, 1);
  assert.equal(snapshot.custom_services[0].id, validCustom.id);
  assert.equal(snapshot.custom_services[0].label, 'My Mattermost');
  assert.ok(snapshot.service_order.includes(validCustom.id));

  // Reset preserves custom_services but resets theme/hidden/order to defaults + custom
  const resetResult = store.reset();
  assert.equal(resetResult.custom_services.length, 1);
  assert.equal(resetResult.custom_services[0].id, validCustom.id);
  assert.ok(resetResult.service_order.includes(validCustom.id));

  // Update with valid http custom service (e.g. intranet/localhost)
  const validHttpCustom = {
    ...validCustom,
    id: 'custom_11111111111111111111111111111111',
    service_url: 'http://localhost:3000/chat',
    login_url: 'http://localhost:3000/login'
  };
  store.update({
    custom_services: [validCustom, validHttpCustom],
    service_order: [...DEFAULTS.service_order, validCustom.id, validHttpCustom.id]
  });
  assert.equal(store.snapshot().custom_services.length, 2);

  // Invalid custom service rejection
  const invalidCases = [
    { ...validCustom, id: 'not_custom_format' },
    { ...validCustom, label: '' },
    { ...validCustom, label: 'a'.repeat(33) },
    { ...validCustom, service_url: 'ftp://insecure.example.com' },
    { ...validCustom, service_url: 'javascript:alert(1)' },
    { ...validCustom, login_url: 'ftp://ftp.example.com' },
    { ...validCustom, icon_key: 'not_an_icon' },
    { ...validCustom, created_at: 'not_a_number' }
  ];

  for (const inv of invalidCases) {
    assert.throws(() => store.update({ custom_services: [inv] }), /invalid_preferences/);
  }
});

test('custom services: dynamic registration and navigationKind origin-based routing', t => {
  t.after(() => clearCustomServices());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_custom_routing_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'prefs.json');

  const customId = 'custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const customDef = {
    id: customId,
    label: 'Custom Jira',
    service_url: 'https://jira.company.internal/projects',
    login_url: 'https://sso.company.internal/login',
    icon_key: 'ztask',
    created_at: Date.now()
  };

  const store = new PreferencesStore(file);
  store.update({
    custom_services: [customDef],
    service_order: [...DEFAULTS.service_order, customId]
  });

  const reg = service(customId);
  assert.ok(reg);
  assert.equal(reg.id, customId);
  assert.equal(reg.label, 'Custom Jira');
  assert.equal(reg.origin, 'https://jira.company.internal');
  assert.equal(reg.icon_key, 'ztask');

  // Same origin as service_url -> 'service'
  assert.equal(navigationKind(customId, 'https://jira.company.internal/browse/PROJ-123'), 'service');
  // Same origin as login_url -> 'service'
  assert.equal(navigationKind(customId, 'https://sso.company.internal/auth/callback'), 'service');
  // Known OAuth IdP -> 'auth'
  assert.equal(navigationKind(customId, 'https://accounts.google.com/o/oauth2/auth'), 'auth');
  // Different external origin -> 'external'
  assert.equal(navigationKind(customId, 'https://github.com/project'), 'external');
  assert.equal(navigationKind(customId, 'https://malicious.site.com/'), 'external');

  // navigationDecision: auxiliary or starting phase CANNOT bypass external origin
  assert.equal(navigationDecision(customId, 'https://github.com/project', { auxiliary: true, phase: 'starting' }), 'external');
  assert.equal(navigationDecision(customId, 'https://jira.company.internal/browse', { auxiliary: true }), 'allow');
  assert.equal(navigationDecision(customId, 'https://sso.company.internal/auth', { auxiliary: true }), 'allow');
  assert.equal(navigationDecision(customId, 'https://accounts.google.com/o/oauth2/auth', { auxiliary: true }), 'allow');

  // popupDisposition: external origin CANNOT become owned for custom service
  assert.equal(popupDisposition(customId, 'https://github.com/project', { auxiliary: true, phase: 'starting' }), 'external');

  // ServiceState: startURL returns login_url when configured
  const svcFile = path.join(dir, 'service.json');
  fs.writeFileSync(svcFile, JSON.stringify(initialServiceState()));
  const serviceState = new ServiceState(svcFile);
  const startUrl = serviceState.startURL({ service_id: customId, id: `default_${customId}` });
  assert.equal(startUrl, 'https://sso.company.internal/login');

  // PermissionStore: supports permissions for custom service default instance and profile instance
  const permFile = path.join(dir, 'permissions.json');
  const permStore = new PermissionStore(permFile);
  permStore.set(`default_${customId}`, 'https://jira.company.internal', ['notifications', 'fullscreen'], 'allow');
  assert.equal(permStore.decision(`default_${customId}`, 'https://jira.company.internal', 'notifications'), 'allow');
  assert.equal(permStore.decision(`default_${customId}`, 'https://jira.company.internal', 'fullscreen'), 'allow');

  // Test HTTP custom service routing & popup disposition
  const httpCustomId = 'custom_cccccccccccccccccccccccccccccccc';
  store.update({
    custom_services: [customDef, {
      id: httpCustomId,
      label: 'Local Dev Chat',
      service_url: 'http://localhost:3000/chat',
      login_url: 'http://localhost:3000/login',
      icon_key: 'zcode',
      created_at: Date.now()
    }],
    service_order: [...DEFAULTS.service_order, customId, httpCustomId]
  });
  assert.equal(navigationKind(httpCustomId, 'http://localhost:3000/chat/room-1'), 'service');
  assert.equal(navigationKind(httpCustomId, 'http://localhost:3000/login'), 'service');
  assert.equal(navigationKind(httpCustomId, 'http://127.0.0.1:3000/chat'), 'external');
  assert.equal(navigationKind(httpCustomId, 'https://example.com/'), 'external');
  assert.equal(navigationKind(httpCustomId, 'not-a-valid-url'), 'blocked');

  assert.equal(popupDisposition(httpCustomId, 'http://localhost:3000/popup'), 'owned');
  assert.equal(popupDisposition(httpCustomId, 'http://otherhost:3000/popup'), 'external');
  assert.equal(popupDisposition(httpCustomId, 'invalid-url'), 'blocked');
});

test('custom services: TabEngine lifecycle (create, multi-account, delete cascade)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_custom_engine_'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearCustomServices();
  });

  const statePath = path.join(dir, 'state.json');
  const profPath = path.join(dir, 'profiles.json');
  const permPath = path.join(dir, 'permissions.json');

  fs.writeFileSync(statePath, JSON.stringify(initialState()));

  const stateStore = new StateStore(statePath);
  const profileStore = new ProfileStore(profPath);
  const permissionStore = new PermissionStore(permPath);

  const engine = new TabEngine({
    store: stateStore,
    profileStore,
    permissionStore,
    createOwner: ({ tab, instance }) => ({
      tab,
      instance,
      status: 'ready',
      load: () => {},
      setSelected: () => {},
      dispose: () => {},
      confirmClose: async () => true,
      snapshot: () => ({ location: 'https://example.test' })
    })
  });
  engine.start();

  // Create custom service
  const customRecord = {
    id: 'custom_0123456789abcdef0123456789abcdef',
    label: 'Rocket Chat',
    service_url: 'https://chat.rocket.internal/',
    login_url: 'https://chat.rocket.internal/login',
    icon_key: 'zchat',
    created_at: Date.now()
  };
  const customService = await engine.createCustomService(customRecord);

  assert.ok(customService.service.id.startsWith('custom_'));
  assert.equal(customService.service.label, 'Rocket Chat');

  // Verify state has tab and instance for custom service
  const snap1 = engine.snapshot();
  const customTab = snap1.tabs.find(t => t.service_id === customRecord.id);
  assert.ok(customTab, 'Custom service tab should be created');
  assert.equal(customTab.label, 'Rocket Chat');

  const customInst = snap1.instances.find(i => i.service_id === customRecord.id);
  assert.ok(customInst, 'Custom service default instance should exist');
  assert.equal(customInst.id, `default_${customRecord.id}`);

  // Create additional account for this custom service
  const newProfile = await engine.createAccount({
    service_id: customRecord.id,
    label: 'Second Account',
    color: 'emerald'
  });
  assert.ok(newProfile);

  const snap2 = engine.snapshot();
  const instances = snap2.instances.filter(i => i.service_id === customRecord.id);
  assert.equal(instances.length, 2);

  // Set permissions for both instances of this custom service
  permissionStore.set(`default_${customRecord.id}`, 'https://chat.rocket.internal', ['notifications'], 'allow');
  permissionStore.set(newProfile.instance.id, 'https://chat.rocket.internal', ['media:audio'], 'allow');
  assert.equal(permissionStore.decision(`default_${customRecord.id}`, 'https://chat.rocket.internal', 'notifications'), 'allow');
  assert.equal(permissionStore.decision(newProfile.instance.id, 'https://chat.rocket.internal', 'media:audio'), 'allow');

  // Delete custom service
  await engine.deleteCustomService(customRecord.id);

  // Verify cascade deletion
  const snap3 = engine.snapshot();
  assert.equal(snap3.tabs.filter(t => t.service_id === customRecord.id).length, 0);
  assert.equal(snap3.instances.filter(i => i.service_id === customRecord.id).length, 0);
  assert.equal(profileStore.snapshot().filter(p => p.scope_key === customRecord.id).length, 0);

  // Verify permission scope was purged and does not leave orphan entries
  assert.equal(permissionStore.decision(`default_${customRecord.id}`, 'https://chat.rocket.internal', 'notifications'), undefined);
  assert.equal(permissionStore.decision(newProfile.instance.id, 'https://chat.rocket.internal', 'media:audio'), undefined);
  // Re-instantiating PermissionStore must not fail validatePermissions
  const reloadedPerms = new PermissionStore(permPath);
  assert.doesNotThrow(() => reloadedPerms.snapshot());

  // Verify 32-character service + 32-character profile label (67 chars total) succeeds without label limit errors
  const longService = await engine.createCustomService({
    id: 'custom_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    label: 'A'.repeat(32),
    service_url: 'https://chat.longname.internal/',
    login_url: null,
    icon_key: 'zchat',
    created_at: Date.now()
  });
  const longProfile = await engine.createAccount({
    service_id: longService.service.id,
    label: 'B'.repeat(32),
    color: 'rose'
  });
  assert.ok(longProfile);
  await engine.deleteCustomService(longService.service.id);

  // Verify atomic rollback when account creation tab allocation fails
  const instancesBefore = engine.snapshot().instances.length;
  const profilesBefore = profileStore.snapshot().length;
  const originalAddNow = engine.addNow;
  engine.addNow = async () => { throw new Error('simulated_view_fail'); };
  await assert.rejects(
    async () => engine.createAccount({
      service_id: 'messenger',
      label: 'Fail Profile',
      color: 'amber'
    }),
    /simulated_view_fail/
  );
  engine.addNow = originalAddNow;
  assert.equal(engine.snapshot().instances.length, instancesBefore, 'Instances must be rolled back on failure');
  assert.equal(profileStore.snapshot().length, profilesBefore, 'Profiles must be rolled back on failure');

  // Verify atomic rollback when custom service profileStore.createDefault fails
  const failedCustomId = 'custom_ffffffffffffffffffffffffffffffff';
  const origCreateDefault = profileStore.createDefault;
  profileStore.createDefault = () => { throw new Error('simulated_profile_fail'); };
  await assert.rejects(
    async () => engine.createCustomService({
      id: failedCustomId,
      label: 'Fail Service',
      service_url: 'https://fail.example.com/',
      login_url: null,
      icon_key: 'zweb',
      created_at: Date.now()
    }),
    /simulated_profile_fail/
  );
  profileStore.createDefault = origCreateDefault;
  // Service must be unregistered from registry
  assert.throws(() => service(failedCustomId), /service_not_enabled/, 'Failed custom service must be unregistered');
  // Tabs and instances must not retain the failed custom service
  assert.equal(engine.snapshot().tabs.some(t => t.service_id === failedCustomId), false);
  assert.equal(engine.snapshot().instances.some(i => i.service_id === failedCustomId), false);

  // Deleting builtin service is forbidden
  await assert.rejects(
    async () => engine.deleteCustomService('messenger'),
    /cannot_delete_builtin_service/
  );
});

test('custom services: IPC command validation for create and delete', () => {
  // valid custom_service_create
  assert.equal(validCommand({
    action: 'custom_service_create',
    label: 'Discourse',
    service_url: 'https://forum.example.com/',
    login_url: 'https://forum.example.com/login',
    icon_key: 'zweb'
  }), true);

  // login_url optional (can be null or '')
  assert.equal(validCommand({
    action: 'custom_service_create',
    label: 'Discourse',
    service_url: 'https://forum.example.com/',
    login_url: null,
    icon_key: 'zweb'
  }), true);

  // invalid icon_key
  assert.equal(validCommand({
    action: 'custom_service_create',
    label: 'Discourse',
    service_url: 'https://forum.example.com/',
    login_url: null,
    icon_key: 'unknown_icon'
  }), false);

  // valid service_url (http)
  assert.equal(validCommand({
    action: 'custom_service_create',
    label: 'Discourse',
    service_url: 'http://localhost:3000/',
    login_url: null,
    icon_key: 'zweb'
  }), true);

  // invalid service_url (ftp)
  assert.equal(validCommand({
    action: 'custom_service_create',
    label: 'Discourse',
    service_url: 'ftp://insecure.example.com/',
    login_url: null,
    icon_key: 'zweb'
  }), false);

  // empty label
  assert.equal(validCommand({
    action: 'custom_service_create',
    label: '   ',
    service_url: 'https://forum.example.com/',
    login_url: null,
    icon_key: 'zweb'
  }), false);

  // valid custom_service_delete
  assert.equal(validCommand({
    action: 'custom_service_delete',
    service_id: 'custom_11223344556677889900aabbccddeeff'
  }), true);

  // invalid delete target (not a valid custom service ID)
  assert.equal(validCommand({
    action: 'custom_service_delete',
    service_id: 'invalid_id'
  }), false);
});

test('custom services: multi-store crash recovery and self-healing', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_crash_recovery_'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearCustomServices();
  });

  const orphanedServiceId = 'custom_99999999999999999999999999999999';
  // Registry does NOT contain orphanedServiceId (simulating app stopped right after preferences deleted service)

  // 1. StateStore self-healing
  const stateFile = path.join(dir, 'state.json');
  const baseState = initialState();
  const orphanedInstance = {
    id: `default_${orphanedServiceId}`,
    service_id: orphanedServiceId,
    label: 'Ghost Service',
    partition: `persist:service-${orphanedServiceId}`
  };
  const orphanedTab = {
    id: 'tab_ghost_123',
    instance_id: orphanedInstance.id,
    label: 'Ghost Service'
  };
  const dirtyState = {
    ...baseState,
    instances: [...baseState.instances, orphanedInstance],
    tabs: [...baseState.tabs, orphanedTab],
    active_tab_id: orphanedTab.id
  };
  fs.writeFileSync(stateFile, JSON.stringify(dirtyState));

  const stateStore = new StateStore(stateFile);
  let loadedState;
  assert.doesNotThrow(() => {
    loadedState = stateStore.load();
  }, 'StateStore.load must not throw state_recovery_required when encountering orphaned custom services');
  assert.equal(loadedState.instances.some(i => i.service_id === orphanedServiceId), false);
  assert.equal(loadedState.tabs.some(t => t.instance_id === orphanedInstance.id), false);
  assert.notEqual(loadedState.active_tab_id, orphanedTab.id);

  // 2. ProfileStore self-healing
  const profFile = path.join(dir, 'profiles.json');
  const profStoreInitial = new ProfileStore(profFile);
  const dirtyProfiles = {
    schema_version: 1,
    profiles: [
      ...profStoreInitial.snapshot(),
      {
        id: 'profile_ghost_1234567890',
        scope_key: orphanedServiceId,
        label: 'Ghost Profile',
        color: 'blue',
        partition: `persist:service-${orphanedServiceId}-profile_ghost_1234567890`,
        is_default: false,
        created_at: Date.now()
      }
    ]
  };
  fs.writeFileSync(profFile, JSON.stringify(dirtyProfiles));

  let reloadedProfiles;
  assert.doesNotThrow(() => {
    reloadedProfiles = new ProfileStore(profFile);
  }, 'ProfileStore must not throw profile_recovery_required when encountering orphaned custom service profiles');
  assert.equal(reloadedProfiles.snapshot().some(p => p.scope_key === orphanedServiceId), false);

  // 3. PermissionStore self-healing and independent deleteScope
  const permFile = path.join(dir, 'permissions.json');
  const permStore = new PermissionStore(permFile);
  // Temporarily register service to allow setting initial valid permissions
  const { registerCustomService } = require('../src/core/services');
  registerCustomService({
    id: orphanedServiceId,
    label: 'Ghost Service',
    service_url: 'https://ghost.example.com/',
    login_url: 'https://ghost.example.com/login',
    icon_key: 'zweb',
    created_at: Date.now()
  });
  permStore.set(`default_${orphanedServiceId}`, 'https://ghost.example.com', ['notifications'], 'allow');
  permStore.set(`instance_${orphanedServiceId}_profile_ghost_1234567890`, 'https://ghost.example.com', ['media:audio'], 'allow');
  assert.equal(permStore.decision(`default_${orphanedServiceId}`, 'https://ghost.example.com', 'notifications'), 'allow');

  // Unregister service before calling deleteScope (reproducing the IPC dispatch flow where preferences updates first)
  clearCustomServices();

  // deleteScope must successfully purge entries even when service is already unregistered
  permStore.deleteScope(orphanedServiceId);
  assert.equal(permStore.decision(`default_${orphanedServiceId}`, 'https://ghost.example.com', 'notifications'), undefined);
  assert.equal(permStore.decision(`instance_${orphanedServiceId}_profile_ghost_1234567890`, 'https://ghost.example.com', 'media:audio'), undefined);

  // Reloading PermissionStore from disk must not throw permissions_recovery_required
  let reloadedPerms;
  assert.doesNotThrow(() => {
    reloadedPerms = new PermissionStore(permFile);
  }, 'PermissionStore must reload cleanly without permissions_recovery_required');
  assert.equal(reloadedPerms.snapshot().length, 0);
});

test('custom services: profileStore.deleteScope failure propagates and protects state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_prof_fail_'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    clearCustomServices();
  });

  const statePath = path.join(dir, 'state.json');
  const profPath = path.join(dir, 'profiles.json');
  fs.writeFileSync(statePath, JSON.stringify(initialState()));

  const stateStore = new StateStore(statePath);
  const profileStore = new ProfileStore(profPath);

  const engine = new TabEngine({
    store: stateStore,
    profileStore,
    createOwner: ({ tab, instance }) => ({
      tab,
      instance,
      status: 'ready',
      load: () => {},
      setSelected: () => {},
      dispose: () => {},
      confirmClose: async () => true,
      snapshot: () => ({ location: 'https://example.test' })
    })
  });
  engine.start();

  const testId = 'custom_77777777777777777777777777777777';
  await engine.createCustomService({
    id: testId,
    label: 'Test Service',
    service_url: 'https://test.internal/',
    login_url: null,
    icon_key: 'zweb',
    created_at: Date.now()
  });

  // Simulate disk failure in profileStore.deleteScope
  const originalDeleteScope = profileStore.deleteScope;
  profileStore.deleteScope = () => { throw new Error('simulated_profile_disk_failure'); };

  await assert.rejects(
    async () => engine.deleteCustomService(testId),
    /simulated_profile_disk_failure/,
    'profileStore.deleteScope error must propagate and not be silently swallowed'
  );

  profileStore.deleteScope = originalDeleteScope;

  // Custom service must remain intact because operation failed
  assert.ok(service(testId), 'Service must remain registered');
  assert.ok(engine.snapshot().tabs.some(t => t.service_id === testId), 'Tab must remain in engine state');
  assert.ok(engine.snapshot().instances.some(i => i.service_id === testId), 'Instance must remain in engine state');
});

test('preferences and state forward compatibility: preserves user order, hidden setup, and multi-account profiles without throwing recovery dialog', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxchat_forward_compat_'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // 1. PreferencesStore forward compatibility
  const prefFile = path.join(dir, 'prefs.json');
  const futurePrefs = {
    schema_version: 5, // Future schema version
    theme: 'black',
    language: 'en',
    future_feature_flag: true,
    extra_unknown_key: { nested: 123 },
    service_order: [
      'gmail', // User dragged Gmail to front
      'slack',
      'unknown_future_service_xyz', // Service from future or experimental version
      'slack', // Duplicate to test deduplication
      'chatgpt',
      'messenger'
      // deliberately omitted remaining built-in services to test additive healing
    ],
    hidden_services: [
      'meet',
      'unknown_future_service_xyz',
      'meet' // Duplicate hidden item
    ],
    custom_services: []
  };
  fs.writeFileSync(prefFile, JSON.stringify(futurePrefs));

  let store;
  assert.doesNotThrow(() => {
    store = new PreferencesStore(prefFile);
  }, 'PreferencesStore must self-heal future/unknown schema without throwing preferences_recovery_required');

  const snapshot = store.snapshot();
  assert.equal(snapshot.theme, 'black', 'Theme must be preserved');
  assert.equal(snapshot.language, 'en', 'Language must be preserved');
  assert.equal(snapshot.service_order[0], 'gmail', 'User drag-and-drop first position (gmail) must be preserved');
  assert.equal(snapshot.service_order[1], 'slack', 'User drag-and-drop second position (slack) must be preserved');
  assert.equal(snapshot.service_order.includes('unknown_future_service_xyz'), false, 'Unknown service must be safely pruned');
  assert.equal(new Set(snapshot.service_order).size, snapshot.service_order.length, 'Order must be deduplicated');
  assert.equal(snapshot.service_order.length, 10, 'All 10 built-in services must be present');
  assert.deepEqual(snapshot.hidden_services, ['meet'], 'Valid hidden services must be preserved without duplicates');

  // 2. StateStore forward compatibility
  const stateFile = path.join(dir, 'state.json');
  const baseState = initialState();
  const customGoogleProfileInstance = {
    id: 'instance_gmail_profile_vx_user',
    service_id: 'gmail',
    label: 'Gmail (VX)',
    partition: 'persist:service-google-profile_vx_user',
    profile_id: 'profile_vx_user',
    profile_label: 'VX',
    profile_color: 'cyan'
  };
  const unknownServiceInstance = {
    id: 'instance_future_service_001',
    service_id: 'future_unsupported_service',
    label: 'Future Chat',
    partition: 'persist:service-future_unsupported_service'
  };
  const dirtyState = {
    schema_version: 2,
    instances: [
      ...baseState.instances,
      customGoogleProfileInstance,
      unknownServiceInstance
    ],
    tabs: [
      ...baseState.tabs,
      {
        id: 'tab_custom_google_1',
        instance_id: customGoogleProfileInstance.id,
        label: 'Gmail (VX)'
      },
      {
        id: 'tab_future_1',
        instance_id: unknownServiceInstance.id,
        label: 'Future Chat'
      }
    ],
    active_tab_id: 'tab_custom_google_1'
  };
  fs.writeFileSync(stateFile, JSON.stringify(dirtyState));

  const stateStore = new StateStore(stateFile);
  let loadedState;
  assert.doesNotThrow(() => {
    loadedState = stateStore.load();
  }, 'StateStore must load without throwing state_recovery_required');

  assert.ok(
    loadedState.instances.some(i => i.id === customGoogleProfileInstance.id),
    'Custom Google profile instance must be preserved'
  );
  assert.ok(
    loadedState.tabs.some(t => t.id === 'tab_custom_google_1'),
    'Custom Google tab must be preserved'
  );
  assert.equal(
    loadedState.instances.some(i => i.id === unknownServiceInstance.id),
    false,
    'Unknown service instance must be filtered out gracefully'
  );
  assert.equal(
    loadedState.tabs.some(t => t.instance_id === unknownServiceInstance.id),
    false,
    'Tab belonging to unknown service must be filtered out gracefully'
  );
  assert.equal(loadedState.active_tab_id, 'tab_custom_google_1');
});
