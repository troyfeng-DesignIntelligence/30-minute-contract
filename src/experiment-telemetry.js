(function attachExperimentTelemetry(root, factory) {
  const mainline = typeof module === "object" && module.exports
    ? require("./pomdp-v2-mainline.js")
    : root.PomdpV2Mainline;
  const api = factory(root, mainline);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PomdpExperimentTelemetry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTelemetryApi(root, Mainline) {
  "use strict";

  if (!Mainline?.protocol) throw new Error("POMDP mainline manifest must load before telemetry");
  const VERSION = Mainline.protocol.telemetryVersion;
  const BUILD_ID = Mainline.protocol.buildId;

  function finiteNonNegative(value) {
    return Number.isFinite(value) && value >= 0;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function safeJsonParse(value) {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  }

  function safePersistentStorage(browser) {
    for (const storageName of ["localStorage", "sessionStorage"]) {
      try {
        const storage = browser[storageName];
        if (!storage) continue;
        const probe = `${VERSION}:probe`;
        storage.setItem(probe, "1");
        storage.removeItem(probe);
        return storage;
      } catch {
        // Try the next browser storage implementation.
      }
    }
    return null;
  }

  function round(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function deviceSnapshot(browser) {
    const navigator = browser.navigator || {};
    const screen = browser.screen || {};
    const coarsePointer = browser.matchMedia?.("(pointer: coarse)")?.matches || false;
    const userAgentMobile = typeof navigator.userAgentData?.mobile === "boolean"
      ? navigator.userAgentData.mobile
      : /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
    return {
      deviceClass: userAgentMobile || coarsePointer ? "mobile" : "desktop",
      viewport: {
        width: Number(browser.innerWidth) || null,
        height: Number(browser.innerHeight) || null
      },
      screen: {
        width: Number(screen.width) || null,
        height: Number(screen.height) || null,
        availableWidth: Number(screen.availWidth) || null,
        availableHeight: Number(screen.availHeight) || null,
        colorDepth: Number(screen.colorDepth) || null
      },
      devicePixelRatio: Number(browser.devicePixelRatio) || 1,
      reducedMotion: browser.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false,
      userAgent: navigator.userAgent || null,
      language: navigator.language || null,
      onlineAtSnapshot: navigator.onLine !== false
    };
  }

  function createExperimentTelemetry(options = {}, browser = root) {
    if (!browser?.performance) throw new Error("experiment telemetry requires a browser performance API");
    const performance = browser.performance;
    const bootAtIso = new Date().toISOString();
    const bootAtMs = performance.now();
    const navigationEntry = performance.getEntriesByType?.("navigation")?.[0] || null;
    const navigationType = navigationEntry?.type || "unknown";
    const storage = safePersistentStorage(browser);
    const activeBuildId = options.buildId || BUILD_ID;
    const storageKey = `${VERSION}:${activeBuildId}:${options.mode || "missing"}:${options.participantId || "missing"}:${options.seed || "missing"}`;
    const previousMarker = safeJsonParse(storage?.getItem(storageKey));
    const instanceId = browser.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const previousIncomplete = Boolean(previousMarker && previousMarker.completed !== true);
    const state = {
      version: VERSION,
      buildId: activeBuildId,
      instanceId,
      bootAtIso,
      bootAtMs,
      identifiers: {
        participantId: options.participantId || null,
        participantIdProvided: options.participantIdProvided === true,
        seed: Number.isFinite(options.seed) ? Number(options.seed) : null,
        seedProvided: options.seedProvided === true,
        mode: options.mode || null,
        modeProvided: options.modeProvided === true
      },
      expectedTrialCount: Number.isInteger(options.expectedTrialCount) ? options.expectedTrialCount : null,
      navigation: {
        type: navigationType,
        refreshDetected: navigationType === "reload" || previousIncomplete,
        previousIncompleteSession: previousIncomplete,
        previousMarker: previousIncomplete ? clone(previousMarker) : null
      },
      firstOperableAtMs: null,
      visualReadyAtMs: null,
      visualReadyRuntime: null,
      currentState: null,
      continuity: {
        offlineAtBoot: browser.navigator?.onLine === false,
        offlineEvents: [],
        onlineRestoreEvents: [],
        visibilityInterruptions: [],
        hiddenSinceMs: null,
        pageHideCount: 0,
        contextErrors: [],
        contextRestores: []
      },
      export: {
        jsonSerializationSucceeded: false,
        jsonGeneratedAt: null,
        jsonBytes: null,
        jsonGenerationError: null,
        downloadAttemptedAt: null,
        downloadFilename: null
      }
    };

    function elapsedMs() {
      return round(performance.now() - bootAtMs);
    }

    function writeMarker(extra = {}) {
      if (!storage) return false;
      try {
        storage.setItem(storageKey, JSON.stringify({
          telemetryVersion: VERSION,
          buildId: state.buildId,
          instanceId,
          participantId: state.identifiers.participantId,
          seed: state.identifiers.seed,
          mode: state.identifiers.mode,
          bootAtIso,
          lastSeenAt: new Date().toISOString(),
          currentState: state.currentState,
          completed: state.currentState?.phase === "summary",
          ...extra
        }));
        return true;
      } catch {
        return false;
      }
    }

    function updateState(snapshot, detail = {}) {
      state.currentState = snapshot ? {
        phase: snapshot.phase,
        waveIndex: snapshot.waveIndex,
        nodeIndex: snapshot.nodeIndex,
        completedRouteChoices: snapshot.completedRouteChoices,
        trainingActive: detail.trainingActive === true,
        atMs: elapsedMs()
      } : null;
      writeMarker();
    }

    function markFirstOperable(runtime) {
      if (state.firstOperableAtMs !== null) return;
      state.firstOperableAtMs = elapsedMs();
      state.visualReadyAtMs = state.firstOperableAtMs;
      state.visualReadyRuntime = runtime ? {
        requestedArtLevel: runtime.requestedArtLevel || null,
        layers: clone(runtime.layers || {}),
        assetFallbackUsed: runtime.assetFallbackUsed === true
      } : null;
      writeMarker();
    }

    function recordContextError(message = "webgl_context_lost") {
      state.continuity.contextErrors.push({ atMs: elapsedMs(), message: String(message) });
      writeMarker();
    }

    function recordContextRestore() {
      state.continuity.contextRestores.push({ atMs: elapsedMs() });
      writeMarker();
    }

    function markJsonGenerated(bytes) {
      state.export.jsonSerializationSucceeded = true;
      if (!state.export.jsonGeneratedAt) state.export.jsonGeneratedAt = new Date().toISOString();
      state.export.jsonBytes = Number.isFinite(bytes) ? Number(bytes) : null;
      state.export.jsonGenerationError = null;
      writeMarker();
    }

    function markJsonGenerationFailed(error) {
      state.export.jsonSerializationSucceeded = false;
      state.export.jsonGenerationError = error?.message || String(error || "unknown serialization error");
      writeMarker();
    }

    function markDownloadAttempt(filename) {
      state.export.downloadAttemptedAt = new Date().toISOString();
      state.export.downloadFilename = filename || null;
      writeMarker();
    }

    function markCompleted(snapshot) {
      updateState(snapshot, { trainingActive: false });
      writeMarker({ completed: true, completedAt: new Date().toISOString() });
    }

    function onOffline() {
      state.continuity.offlineEvents.push({ atMs: elapsedMs() });
      writeMarker();
    }

    function onOnline() {
      state.continuity.onlineRestoreEvents.push({ atMs: elapsedMs() });
      writeMarker();
    }

    function onVisibilityChange() {
      if (browser.document.visibilityState === "hidden") {
        state.continuity.hiddenSinceMs = elapsedMs();
        writeMarker();
        return;
      }
      if (state.continuity.hiddenSinceMs !== null) {
        const visibleAtMs = elapsedMs();
        state.continuity.visibilityInterruptions.push({
          hiddenAtMs: state.continuity.hiddenSinceMs,
          visibleAtMs,
          durationMs: round(visibleAtMs - state.continuity.hiddenSinceMs)
        });
        state.continuity.hiddenSinceMs = null;
        writeMarker();
      }
    }

    function onPageHide() {
      state.continuity.pageHideCount += 1;
      writeMarker({ pageHiddenAt: new Date().toISOString() });
    }

    browser.addEventListener?.("offline", onOffline);
    browser.addEventListener?.("online", onOnline);
    browser.addEventListener?.("pagehide", onPageHide);
    browser.document?.addEventListener?.("visibilitychange", onVisibilityChange);
    writeMarker({ completed: false });

    function snapshot(visualRuntime = null) {
      const currentHiddenDurationMs = state.continuity.hiddenSinceMs === null
        ? 0
        : Math.max(0, elapsedMs() - state.continuity.hiddenSinceMs);
      const visualLayers = visualRuntime?.layers || state.visualReadyRuntime?.layers || {};
      const fallbackLayers = Object.entries(visualLayers)
        .filter(([, status]) => status === "fallback")
        .map(([layer]) => layer);
      return {
        version: VERSION,
        buildId: state.buildId,
        instanceId,
        bootAtIso,
        pageUptimeMs: elapsedMs(),
        identifiers: clone(state.identifiers),
        expectedTrialCount: state.expectedTrialCount,
        device: deviceSnapshot(browser),
        navigation: clone(state.navigation),
        timing: {
          firstOperableAtMs: state.firstOperableAtMs,
          visualReadyAtMs: state.visualReadyAtMs
        },
        continuity: {
          refreshDetected: state.navigation.refreshDetected,
          previousIncompleteSession: state.navigation.previousIncompleteSession,
          offlineAtBoot: state.continuity.offlineAtBoot,
          offlineEventCount: state.continuity.offlineEvents.length,
          onlineRestoreEventCount: state.continuity.onlineRestoreEvents.length,
          visibilityInterruptionCount: state.continuity.visibilityInterruptions.length,
          totalHiddenDurationMs: round(
            state.continuity.visibilityInterruptions.reduce((sum, item) => sum + item.durationMs, 0)
            + currentHiddenDurationMs
          ),
          pageHideCount: state.continuity.pageHideCount,
          contextErrorCount: state.continuity.contextErrors.length,
          contextRestoreCount: state.continuity.contextRestores.length,
          offlineEvents: clone(state.continuity.offlineEvents),
          onlineRestoreEvents: clone(state.continuity.onlineRestoreEvents),
          visibilityInterruptions: clone(state.continuity.visibilityInterruptions),
          contextErrors: clone(state.continuity.contextErrors),
          contextRestores: clone(state.continuity.contextRestores)
        },
        assets: {
          requestedArtLevel: visualRuntime?.requestedArtLevel || state.visualReadyRuntime?.requestedArtLevel || null,
          assetFallbackUsed: visualRuntime?.assetFallbackUsed === true || fallbackLayers.length > 0,
          fallbackLayers,
          layers: clone(visualLayers)
        },
        export: clone(state.export),
        currentState: clone(state.currentState)
      };
    }

    function destroy() {
      browser.removeEventListener?.("offline", onOffline);
      browser.removeEventListener?.("online", onOnline);
      browser.removeEventListener?.("pagehide", onPageHide);
      browser.document?.removeEventListener?.("visibilitychange", onVisibilityChange);
    }

    return {
      updateState,
      markFirstOperable,
      recordContextError,
      recordContextRestore,
      markJsonGenerated,
      markJsonGenerationFailed,
      markDownloadAttempt,
      markCompleted,
      snapshot,
      destroy
    };
  }

  function auditExperimentIntegrity({ exportedData, runtimeTelemetry, expectedTrialCount } = {}) {
    const checks = [];
    const failures = [];
    const warnings = [];
    const log = Array.isArray(exportedData?.log) ? exportedData.log : [];
    const session = exportedData?.session || {};
    const identifiers = runtimeTelemetry?.identifiers || {};
    const expected = Number.isInteger(expectedTrialCount)
      ? expectedTrialCount
      : Number.isInteger(runtimeTelemetry?.expectedTrialCount)
        ? runtimeTelemetry.expectedTrialCount
        : Number(session.waveCount) * Number(session.nodesPerWave);

    function check(id, pass, actual, expectedValue, severity = "error") {
      const item = { id, pass: Boolean(pass), actual: clone(actual), expected: clone(expectedValue), severity };
      checks.push(item);
      if (!item.pass) (severity === "warning" ? warnings : failures).push(id);
      return item.pass;
    }

    check("participant_id_present", Boolean(identifiers.participantId && identifiers.participantIdProvided), identifiers.participantId, "explicit pid query parameter");
    check("seed_present", finiteNonNegative(identifiers.seed) && identifiers.seed > 0 && identifiers.seedProvided, identifiers.seed, "explicit positive seed query parameter");
    check("mode_present", Boolean(identifiers.mode && identifiers.modeProvided), identifiers.mode, "explicit valid mode query parameter");
    check("build_id_present", Boolean(runtimeTelemetry?.buildId), runtimeTelemetry?.buildId || null, "non-empty build ID");
    check("session_reached_summary", session.phase === "summary", session.phase || null, "summary");
    check("trial_count_exact", session.completedRouteChoices === expected, session.completedRouteChoices, expected);
    if (session.mode === "pilot") check("instrument_pilot_has_24_trials", expected === 24 && session.completedRouteChoices === 24, session.completedRouteChoices, 24);

    const expectedCounts = {
      session_start: 1,
      decision_snapshot: expected * 2,
      route_choice: expected,
      speed_choice: expected,
      choice_outcome: expected,
      bonus_settlement: Number(session.waveCount) || 0
    };
    const eventCounts = Object.fromEntries(Object.keys(expectedCounts).map((type) => [
      type,
      log.filter((event) => event.eventType === type).length
    ]));
    Object.entries(expectedCounts).forEach(([type, count]) => {
      check(`event_count_${type}`, eventCounts[type] === count, eventCounts[type], count);
    });

    const customerMessagesUEnabled = exportedData?.configuration?.researchScope?.customerMessagesUEnabled === true;
    if (customerMessagesUEnabled) {
      const windows = log.filter((event) => event.eventType === "customer_message_window_open");
      const exposures = log.filter((event) => event.eventType === "customer_message_exposure");
      const gates = log.filter((event) => event.eventType === "customer_message_gate_ready");
      const speeds = log.filter((event) => event.eventType === "speed_choice");
      const scheduledWindows = windows.filter((event) => event.messageScheduled);
      check("u_message_window_count_exact", windows.length === expected, windows.length, expected);
      check("u_message_gate_count_exact", gates.length === expected, gates.length, expected);
      check("u_scheduled_messages_all_exposed", exposures.length === scheduledWindows.length,
        { exposures: exposures.length, scheduled: scheduledWindows.length },
        { exposures: scheduledWindows.length, scheduled: scheduledWindows.length });
      check("u_all_speed_choices_have_condition_and_exposure_state", speeds.every((event) => (
        ["none", "ordinary", "urging"].includes(event.customerMessageCondition)
          && event.customerMessageScheduled === (event.customerMessageCondition !== "none")
          && event.customerMessageSeen === (event.customerMessageCondition !== "none")
          && finiteNonNegative(event.responseTimeAfterGateMs)
          && (event.customerMessageCondition === "none"
            ? event.responseTimeAfterMessageMs === null
            : finiteNonNegative(event.responseTimeAfterMessageMs))
      )), speeds.filter((event) => !["none", "ordinary", "urging"].includes(event.customerMessageCondition)).length, 0);
      const orderFailures = [];
      for (let waveIndex = 0; waveIndex < Number(session.waveCount || 0); waveIndex += 1) {
        for (let nodeIndex = 0; nodeIndex < Number(session.nodesPerWave || 0); nodeIndex += 1) {
          const indexed = log.map((event, index) => ({ event, index })).filter(({ event }) => (
            event.waveIndex === waveIndex && event.nodeIndex === nodeIndex
          ));
          const routeIndex = indexed.find(({ event }) => event.eventType === "route_choice")?.index ?? -1;
          const speedIndex = indexed.find(({ event }) => event.eventType === "speed_choice")?.index ?? -1;
          const exposureIndex = indexed.find(({ event }) => event.eventType === "customer_message_exposure")?.index ?? null;
          const condition = indexed.find(({ event }) => event.eventType === "speed_choice")?.event?.customerMessageCondition;
          const ordered = routeIndex >= 0 && speedIndex > routeIndex
            && (condition === "none" ? exposureIndex === null : exposureIndex > routeIndex && exposureIndex < speedIndex);
          if (!ordered) orderFailures.push(`w${waveIndex}-n${nodeIndex}`);
        }
      }
      check("u_route_message_speed_event_order", orderFailures.length === 0, orderFailures, []);
      if (session.mode === "experiment") {
        const counts = Object.fromEntries(["none", "ordinary", "urging"].map((condition) => [
          condition,
          speeds.filter((event) => event.customerMessageCondition === condition).length
        ]));
        check("u_experiment_condition_counts", counts.none === 36 && counts.ordinary === 18 && counts.urging === 18,
          counts, { none: 36, ordinary: 18, urging: 18 });
      }
      check("u_sound_attempt_logged_for_exposed_messages", exposures.every((event) => typeof event.soundPlayed === "boolean"),
        exposures.filter((event) => typeof event.soundPlayed !== "boolean").length, 0, "warning");
    }

    const trialProblems = [];
    const duplicateTrialEvents = [];
    const waveCount = Number(session.waveCount) || 0;
    const nodesPerWave = Number(session.nodesPerWave) || 0;
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
      for (let nodeIndex = 0; nodeIndex < nodesPerWave; nodeIndex += 1) {
        const trialKey = `w${waveIndex}-n${nodeIndex}`;
        const events = log.filter((event) => event.waveIndex === waveIndex && event.nodeIndex === nodeIndex);
        const snapshots = events.filter((event) => event.eventType === "decision_snapshot");
        const routes = events.filter((event) => event.eventType === "route_choice");
        const speeds = events.filter((event) => event.eventType === "speed_choice");
        const outcomes = events.filter((event) => event.eventType === "choice_outcome");
        if (snapshots.length > 2 || routes.length > 1 || speeds.length > 1 || outcomes.length > 1) duplicateTrialEvents.push(trialKey);
        const routeSnapshot = snapshots.find((event) => event.stage === "route");
        const speedSnapshot = snapshots.find((event) => event.stage === "trip_pace");
        const route = routes[0];
        const speed = speeds[0];
        const outcome = outcomes[0];
        const valid = snapshots.length === 2
          && routes.length === 1
          && speeds.length === 1
          && outcomes.length === 1
          && Boolean(route?.eventId)
          && Boolean(speed?.eventId)
          && Boolean(outcome?.eventId)
          && Boolean(routeSnapshot?.decisionId)
          && Boolean(speedSnapshot?.decisionId)
          && route?.decisionId === routeSnapshot.decisionId
          && speed?.decisionId === speedSnapshot.decisionId
          && outcome?.routeDecisionId === route.decisionId
          && outcome?.tripPaceDecisionId === speed.decisionId
          && outcome?.decisionId === speed.decisionId
          && finiteNonNegative(route.responseTimeMs)
          && finiteNonNegative(speed.responseTimeMs);
        if (!valid) trialProblems.push(trialKey);
      }
    }
    check("all_trials_have_linked_events_and_response_times", trialProblems.length === 0, trialProblems, []);
    check("no_duplicate_trial_events", duplicateTrialEvents.length === 0, [...new Set(duplicateTrialEvents)], []);

    const decisionIdsByType = ["decision_snapshot", "route_choice", "speed_choice", "choice_outcome"]
      .map((eventType) => {
        const ids = log.filter((event) => event.eventType === eventType).map((event) => event.decisionId).filter(Boolean);
        return { eventType, count: ids.length, uniqueCount: new Set(ids).size };
      });
    const duplicateDecisionIdTypes = decisionIdsByType.filter((item) => item.count !== item.uniqueCount).map((item) => item.eventType);
    check("decision_ids_unique_within_event_type", duplicateDecisionIdTypes.length === 0, duplicateDecisionIdTypes, []);
    const eventIds = log.map((event) => event.eventId).filter(Boolean);
    check("all_log_events_have_unique_event_ids",
      eventIds.length === log.length && new Set(eventIds).size === log.length,
      { eventCount: log.length, eventIdCount: eventIds.length, uniqueEventIdCount: new Set(eventIds).size },
      { eventCount: log.length, eventIdCount: log.length, uniqueEventIdCount: log.length });

    const continuity = runtimeTelemetry?.continuity || {};
    const rendererPerformance = exportedData?.visualRuntime?.performance || {};
    const webglContextLossCount = Math.max(
      continuity.contextErrorCount || 0,
      rendererPerformance.contextLossCount || 0
    );
    check("no_refresh_or_prior_incomplete_page", continuity.refreshDetected !== true, continuity.refreshDetected === true, false);
    const offlineObserved = continuity.offlineAtBoot === true || (continuity.offlineEventCount || 0) > 0;
    check("no_offline_event", !offlineObserved, {
      offlineAtBoot: continuity.offlineAtBoot === true,
      offlineEventCount: continuity.offlineEventCount || 0
    }, { offlineAtBoot: false, offlineEventCount: 0 });
    check("no_webgl_context_error", webglContextLossCount === 0, webglContextLossCount, 0);
    check("no_visibility_interruption", (continuity.visibilityInterruptionCount || 0) === 0, continuity.visibilityInterruptionCount || 0, 0, "warning");
    check("json_serialization_succeeded", runtimeTelemetry?.export?.jsonSerializationSucceeded === true, runtimeTelemetry?.export?.jsonSerializationSucceeded === true, true);

    check("renderer_performance_recorded", finiteNonNegative(rendererPerformance.averageFps) && finiteNonNegative(rendererPerformance.minimumFps), {
      averageFps: rendererPerformance.averageFps,
      minimumFps: rendererPerformance.minimumFps
    }, "finite average/minimum FPS");

    return {
      version: "pomdp-experiment-integrity-audit-v1",
      checkedAt: new Date().toISOString(),
      expectedTrialCount: expected,
      overallPass: failures.length === 0,
      dataCompletenessPass: !failures.some((id) => id.startsWith("event_count_") || [
        "trial_count_exact",
        "instrument_pilot_has_24_trials",
        "all_trials_have_linked_events_and_response_times",
        "no_duplicate_trial_events",
        "decision_ids_unique_within_event_type",
        "all_log_events_have_unique_event_ids"
      ].includes(id)),
      sessionContinuityPass: !failures.some((id) => [
        "no_refresh_or_prior_incomplete_page",
        "no_offline_event",
        "no_webgl_context_error"
      ].includes(id)),
      failures,
      warnings,
      observations: {
        refreshDetected: continuity.refreshDetected === true,
        offlineAtBoot: continuity.offlineAtBoot === true,
        offlineEventCount: continuity.offlineEventCount || 0,
        visibilityInterruptionCount: continuity.visibilityInterruptionCount || 0,
        webglContextErrorCount: continuity.contextErrorCount || 0,
        webglContextLossCount,
        duplicateTrialKeys: [...new Set(duplicateTrialEvents)],
        incompleteOrBrokenTrialKeys: trialProblems,
        eventCounts
      },
      checks
    };
  }

  return { VERSION, BUILD_ID, createExperimentTelemetry, auditExperimentIntegrity };
});
