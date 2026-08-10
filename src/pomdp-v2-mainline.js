(function attachPomdpMainline(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PomdpV2Mainline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPomdpMainline() {
  "use strict";

  const protocol = Object.freeze({
    id: "pomdp-core-pilot-mainline-v2.0",
    status: "FROZEN_MAINLINE_SYNCED_FORMATIVE_QA_PENDING",
    frozenAt: "2026-08-08",
    page: "prototype/pomdp-v2.html",
    simulatorVersion: "pomdp-courier-experimental-v2.6.4",
    logSchemaVersion: "pomdp-courier-experimental-v2-log-0.12",
    copyVersion: "pomdp-v2-rider-copy-1.14-briefing-review",
    experienceCopyVersion: "merchant-k-copy-1.11",
    actionModel: "route-then-trip-pace-v2-wait-until-ready",
    telemetryVersion: "pomdp-experiment-telemetry-v1",
    buildId: "pomdp-v2.6.4-pilot-history-emotion-20260808.11",
    historyPresentationVersion: "rider-history-visual-1.1-emotion",
    recoveryVersion: "pomdp-v25-recovery-0.2"
  });

  const structure = Object.freeze({
    modes: Object.freeze({ preview: 2, pilot: 4, experiment: 12 }),
    nodesPerWave: 6,
    trainingTrials: 2,
    pilotTrials: 24,
    experimentTrials: 72,
    shiftPeriod: Object.freeze({ id: "lunch_peak", label: "午高峰" })
  });

  const task = Object.freeze({
    fullIncome: 12,
    lateIncome: 8,
    maxCapacity: 14,
    incidentDelaySeconds: 90,
    incidentCapacityCost: 1,
    bonusIncome: 12,
    waitPolicy: "until_ready"
  });

  const researchScope = Object.freeze({
    customerMessagesUEnabled: false,
    sourceConfigurationManipulated: false,
    platformTimeVisible: true,
    primaryStage: "formative_pilot",
    computationalLevel: "group_candidate_model_comparison"
  });

  return Object.freeze({ protocol, structure, task, researchScope });
});
