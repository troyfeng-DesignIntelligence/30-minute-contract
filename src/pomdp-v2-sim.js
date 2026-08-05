(function attachPomdpCourier(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PomdpCourierV2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPomdpCourier() {
  "use strict";

  const VERSION = "pomdp-courier-experimental-v2.3";
  const LOG_SCHEMA_VERSION = "pomdp-courier-experimental-v2-log-0.5";
  const COPY_VERSION = "pomdp-v2-rider-copy-1.5";
  const ACTION_MODEL = "route-then-trip-pace-v1";
  const FULL_INCOME = 12;
  const LATE_INCOME = 8;
  const MAX_CAPACITY = 10;
  const DEFAULT_NODES_PER_WAVE = 4;
  const WAIT_WINDOW_SECONDS = 90;
  const INCIDENT_DELAY_SECONDS = 90;
  const BONUS_INCOME = FULL_INCOME;
  const SHIFT_PERIOD = Object.freeze({ id: "lunch_peak", label: "午高峰" });
  const MODES = Object.freeze({ preview: 2, pilot: 4, experiment: 12 });
  const ROUTE_ACTIONS = Object.freeze(["wait_briefly", "deliver_carried_first"]);
  const SPEEDS = Object.freeze({
    normal: Object.freeze({ id: "normal", label: "稳骑", travelFactor: 1, incidentChance: 0.02 }),
    rush: Object.freeze({ id: "rush", label: "赶路", travelFactor: 0.82, incidentChance: 0.125 }),
    sprint: Object.freeze({ id: "sprint", label: "冲刺", travelFactor: 0.66, incidentChance: 0.25 })
  });
  const PREP_REMAINING_SECONDS = Object.freeze([30, 90, 180, 420]);
  const PREP_DISTRIBUTIONS = Object.freeze({
    smooth: Object.freeze([0.55, 0.30, 0.12, 0.03]),
    busy: Object.freeze([0.10, 0.25, 0.35, 0.30])
  });
  const MERCHANTS = Object.freeze([
    Object.freeze({ id: "lantern", name: "灯火便当", experience: "我跑这家店的经验：午高峰有时会拖一会儿。" }),
    Object.freeze({ id: "mint", name: "青禾轻食", experience: "我跑这家店的经验：大多挺快，忙起来也会排队。" }),
    Object.freeze({ id: "harbor", name: "河港砂锅", experience: "我跑这家店的经验：出餐不算快，时间也不太准。" })
  ]);
  const DESTINATIONS = Object.freeze(["花园里", "滨河站", "云栖公寓", "春晓社区", "青石里", "望江台"]);
  const PROBE_SCENARIOS = Object.freeze([
    Object.freeze({ deadlineA: 300, deadlineB: 360, kind: "history_probe" }),
    Object.freeze({ deadlineA: 330, deadlineB: 450, kind: "history_probe" })
  ]);
  const TIGHT_SCENARIOS = Object.freeze([
    Object.freeze({ deadlineA: 240, deadlineB: 330, kind: "tight_challenge" })
  ]);
  const SLACK_SCENARIOS = Object.freeze([
    Object.freeze({ deadlineA: 300, deadlineB: 570, kind: "slack_control" }),
    Object.freeze({ deadlineA: 360, deadlineB: 570, kind: "slack_control" }),
    Object.freeze({ deadlineA: 420, deadlineB: 570, kind: "slack_control" })
  ]);

  function clamp(value, lower, upper) {
    return Math.min(upper, Math.max(lower, value));
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(values, rng) {
    const copy = values.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function scenarioBankForWaveCount(waveCount) {
    if (!Number.isInteger(waveCount) || waveCount < 2) {
      throw new Error("waveCount must be an integer of at least 2");
    }
    return Array.from({ length: waveCount }, (_, index) => ({
      probeScenario: PROBE_SCENARIOS[index % PROBE_SCENARIOS.length],
      tightScenario: TIGHT_SCENARIOS[index % TIGHT_SCENARIOS.length],
      slackScenario: SLACK_SCENARIOS[index % SLACK_SCENARIOS.length],
      middleOrder: index % 2 === 0 ? "tight_then_slack" : "slack_then_tight"
    }));
  }

  function drawDiscrete(values, probabilities, rng) {
    const draw = rng();
    let cumulative = 0;
    for (let index = 0; index < values.length; index += 1) {
      cumulative += probabilities[index];
      if (draw <= cumulative) return values[index];
    }
    return values.at(-1);
  }

  function balancedLoadStates(waveCount, rng) {
    const busyCount = Math.floor(waveCount / 2);
    return shuffle(Array.from(
      { length: waveCount },
      (_, index) => index < busyCount ? "busy" : "smooth"
    ), rng);
  }

  function balancedPlanRows(seed, waveCount) {
    const rng = mulberry32((seed ^ 0x50ad21) >>> 0);
    const scenarioProfiles = scenarioBankForWaveCount(waveCount);

    if (waveCount % (MERCHANTS.length * 2) !== 0) {
      const fallbackProfiles = shuffle(scenarioProfiles, rng);
      const fallbackLoads = balancedLoadStates(waveCount, rng);
      return fallbackProfiles.map((profile, index) => ({
        merchant: MERCHANTS[index % MERCHANTS.length],
        loadState: fallbackLoads[index],
        ...profile
      }));
    }

    const perMerchantPerLoad = waveCount / (MERCHANTS.length * 2);
    const rows = [];
    for (const [loadIndex, loadState] of ["busy", "smooth"].entries()) {
      for (const [merchantIndex, merchant] of MERCHANTS.entries()) {
        for (let repetition = 0; repetition < perMerchantPerLoad; repetition += 1) {
          const profileIndex = rows.length;
          rows.push({
            merchant,
            loadState,
            probeScenario: PROBE_SCENARIOS[repetition % PROBE_SCENARIOS.length],
            tightScenario: TIGHT_SCENARIOS[0],
            slackScenario: SLACK_SCENARIOS[(merchantIndex + loadIndex + repetition) % SLACK_SCENARIOS.length],
            middleOrder: profileIndex % 2 === 0 ? "tight_then_slack" : "slack_then_tight"
          });
        }
      }
    }
    return shuffle(rows, rng);
  }

  function urgencySequenceForProfile(profile, nodesPerWave) {
    const probe = { ...profile.probeScenario };
    if (nodesPerWave === 2) {
      return [
        { ...probe, urgencyRole: "probe_baseline" },
        { ...probe, urgencyRole: "probe_repeat" }
      ];
    }
    const middle = profile.middleOrder === "slack_then_tight"
      ? [
        { ...profile.slackScenario, urgencyRole: "slack_control" },
        { ...profile.tightScenario, urgencyRole: "tight_challenge" }
      ]
      : [
        { ...profile.tightScenario, urgencyRole: "tight_challenge" },
        { ...profile.slackScenario, urgencyRole: "slack_control" }
      ];
    const canonical = [
      { ...probe, urgencyRole: "probe_baseline" },
      ...middle,
      { ...probe, urgencyRole: "probe_repeat" }
    ];
    return Array.from({ length: nodesPerWave }, (_, index) => ({
      ...canonical[index % canonical.length],
      urgencyRole: index === nodesPerWave - 1 ? "probe_repeat" : canonical[index % canonical.length].urgencyRole
    }));
  }

  function capacityForNodes(nodesPerWave) {
    return nodesPerWave * 2 + 2;
  }

  function buildPlan(seed, waveCount, nodesPerWave = DEFAULT_NODES_PER_WAVE) {
    if (!Number.isInteger(nodesPerWave) || nodesPerWave < 2) {
      throw new Error("nodesPerWave must be an integer of at least 2");
    }
    // Keep preparation-time draws independent from the counterbalanced plan order.
    const rng = mulberry32((seed ^ 0x71e57) >>> 0);
    return balancedPlanRows(seed, waveCount).map((profile, waveIndex) => {
      const destinationOffset = waveIndex * nodesPerWave;
      const urgencySequence = urgencySequenceForProfile(profile, nodesPerWave);
      return {
        waveIndex,
        period: SHIFT_PERIOD,
        merchant: profile.merchant,
        loadState: profile.loadState,
        scenario: { ...profile.probeScenario },
        urgencyTemplate: profile.middleOrder,
        nodes: Array.from({ length: nodesPerWave }, (_, nodeIndex) => ({
          nodeIndex,
          scenario: { ...urgencySequence[nodeIndex] },
          prepRemainingSeconds: drawDiscrete(
            PREP_REMAINING_SECONDS,
            PREP_DISTRIBUTIONS[profile.loadState],
            rng
          ),
          carriedDestination: DESTINATIONS[(destinationOffset + nodeIndex) % DESTINATIONS.length],
          newDestination: DESTINATIONS[(destinationOffset + nodeIndex + 1) % DESTINATIONS.length]
        }))
      };
    });
  }

  function publicNode(wave, node) {
    const scenario = node.scenario || wave.scenario;
    const carriedUrgency = clamp(1 - (scenario.deadlineA - 180) / 270, 0.12, 0.92);
    const newUrgency = clamp(1 - (scenario.deadlineB - 330) / 300, 0.12, 0.92);
    return {
      waveIndex: wave.waveIndex,
      nodeIndex: node.nodeIndex,
      period: { ...wave.period },
      merchant: { ...wave.merchant },
      carriedDestination: node.carriedDestination,
      newDestination: node.newDestination,
      carriedUrgency,
      newUrgency,
      urgencyRole: scenario.urgencyRole,
      platformText: scenario.kind === "slack_control"
        ? "平台排的时间比较宽裕"
        : scenario.kind === "tight_challenge"
          ? "平台排的时间很紧"
          : "平台排的时间有点紧",
      mealStatus: "新餐还没好"
    };
  }

  function createGame(seed = Date.now(), options = {}) {
    const mode = Object.hasOwn(MODES, options.mode) ? options.mode : "preview";
    const waveCount = Number.isInteger(options.waveCount) ? options.waveCount : MODES[mode];
    const nodesPerWave = Number.isInteger(options.nodesPerWave)
      ? options.nodesPerWave
      : DEFAULT_NODES_PER_WAVE;
    const capacityMax = capacityForNodes(nodesPerWave);
    const plan = buildPlan(Number(seed), waveCount, nodesPerWave);
    return {
      version: VERSION,
      seed: Number(seed),
      mode,
      waveCount,
      nodesPerWave,
      routeChoiceCount: waveCount * nodesPerWave,
      shiftPeriod: { ...SHIFT_PERIOD },
      plan,
      rng: mulberry32((Number(seed) ^ 0x1c1de7) >>> 0),
      phase: "briefing",
      waveIndex: 0,
      nodeIndex: 0,
      income: 0,
      capacityMax,
      capacityRemaining: capacityMax,
      incidents: 0,
      onTime: 0,
      late: 0,
      bonusIncome: 0,
      bonusAwardedCount: 0,
      bonusMissedCount: 0,
      bonusSettlements: 0,
      lastBonusSettlement: null,
      routeCounts: { wait_briefly: 0, deliver_carried_first: 0 },
      speedCounts: { normal: 0, rush: 0, sprint: 0 },
      currentRouteAction: null,
      currentRouteDecisionId: null,
      currentResult: null,
      wavePublicHistory: [],
      pendingDecision: null,
      log: [],
      startedAt: new Date().toISOString(),
      finishedAt: null
    };
  }

  function currentTruth(state) {
    const wave = state.plan[state.waveIndex];
    return { wave, node: wave.nodes[state.nodeIndex] };
  }

  function start(state) {
    if (state.phase !== "briefing") throw new Error("game has already started");
    state.phase = "approaching_store";
    state.log.push({
      eventType: "session_start",
      simulatorVersion: VERSION,
      copyVersion: COPY_VERSION,
      actionModel: ACTION_MODEL,
      shiftPeriod: { ...state.shiftPeriod },
      at: new Date().toISOString()
    });
    return snapshot(state);
  }

  function decisionContext(state, stage, extra = {}) {
    const { wave, node } = currentTruth(state);
    const publicObservation = publicNode(wave, node);
    return {
      stage,
      periodId: state.shiftPeriod.id,
      merchantId: publicObservation.merchant.id,
      experienceId: `merchant-experience-${publicObservation.merchant.id}-v1`,
      platformCueId: node.scenario.kind,
      urgencyRole: node.scenario.urgencyRole,
      carriedUrgency: publicObservation.carriedUrgency,
      newUrgency: publicObservation.newUrgency,
      capacityRemaining: state.capacityRemaining,
      visibleHistory: state.wavePublicHistory.map((item) => ({ ...item })),
      ...extra
    };
  }

  function openDecision(state, stage, extra = {}) {
    const decisionId = `${state.seed}-w${state.waveIndex}-n${state.nodeIndex}-${stage}`;
    const openedAtMs = Date.now();
    const context = decisionContext(state, stage, extra);
    state.pendingDecision = { decisionId, stage, openedAtMs, context };
    state.log.push({
      eventType: "decision_snapshot",
      decisionId,
      waveIndex: state.waveIndex,
      nodeIndex: state.nodeIndex,
      openedAtMs,
      copyVersion: COPY_VERSION,
      actionModel: ACTION_MODEL,
      ...context
    });
    return state.pendingDecision;
  }

  function closeDecision(state, expectedStage) {
    if (!state.pendingDecision || state.pendingDecision.stage !== expectedStage) {
      throw new Error(`missing ${expectedStage} decision snapshot`);
    }
    const decision = state.pendingDecision;
    state.pendingDecision = null;
    return {
      ...decision,
      responseTimeMs: Math.max(0, Date.now() - decision.openedAtMs)
    };
  }

  function arriveAtStore(state) {
    if (state.phase !== "approaching_store") throw new Error("not approaching a store");
    state.phase = "route_decision";
    state.currentResult = null;
    state.currentRouteAction = null;
    state.currentRouteDecisionId = null;
    state.log.push({
      eventType: "meal_not_ready_observation",
      waveIndex: state.waveIndex,
      nodeIndex: state.nodeIndex,
      periodId: state.shiftPeriod.id
    });
    openDecision(state, "route");
    return snapshot(state);
  }

  function chooseRoute(state, routeAction) {
    if (state.phase !== "route_decision") throw new Error("route action is not available");
    if (!ROUTE_ACTIONS.includes(routeAction)) throw new Error("unknown route action");
    const decision = closeDecision(state, "route");
    state.currentRouteAction = routeAction;
    state.currentRouteDecisionId = decision.decisionId;
    state.routeCounts[routeAction] += 1;
    state.phase = "speed_decision";
    state.log.push({
      eventType: "route_choice",
      waveIndex: state.waveIndex,
      nodeIndex: state.nodeIndex,
      periodId: state.shiftPeriod.id,
      decisionId: decision.decisionId,
      responseTimeMs: decision.responseTimeMs,
      action: routeAction
    });
    openDecision(state, "trip_pace", { routeAction });
    return snapshot(state);
  }

  function resolveChoice(state, speedId) {
    if (state.phase !== "speed_decision") throw new Error("speed action is not available");
    const speed = SPEEDS[speedId];
    if (!speed) throw new Error("unknown speed action");
    const decision = closeDecision(state, "trip_pace");
    const { wave, node } = currentTruth(state);
    const scenario = node.scenario || wave.scenario;
    const routeAction = state.currentRouteAction;
    const incident = state.rng() < speed.incidentChance;
    const incidentDelay = incident ? INCIDENT_DELAY_SECONDS : 0;
    const rideToCustomer = Math.round(180 * speed.travelFactor);
    const returnToStore = Math.round(150 * speed.travelFactor);
    const deliverNewOrder = Math.round(180 * speed.travelFactor);
    let waitSeconds = 0;
    let carriedDeliveredAt;
    let newDeliveredAt;
    let feedbackSource;
    let feedbackOutcome;

    if (routeAction === "wait_briefly") {
      waitSeconds = Math.min(WAIT_WINDOW_SECONDS, node.prepRemainingSeconds);
      const readyWithinWindow = node.prepRemainingSeconds <= WAIT_WINDOW_SECONDS;
      feedbackSource = "wait_window";
      feedbackOutcome = readyWithinWindow ? "ready_within_window" : "still_not_ready";
      carriedDeliveredAt = waitSeconds + rideToCustomer + incidentDelay;
      if (readyWithinWindow) {
        newDeliveredAt = carriedDeliveredAt + deliverNewOrder;
      } else {
        const backAtStore = carriedDeliveredAt + returnToStore;
        const remainingWait = Math.max(0, node.prepRemainingSeconds - backAtStore);
        newDeliveredAt = backAtStore + remainingWait + deliverNewOrder;
      }
    } else {
      carriedDeliveredAt = rideToCustomer + incidentDelay;
      const backAtStore = carriedDeliveredAt + returnToStore;
      const readyOnReturn = node.prepRemainingSeconds <= backAtStore;
      feedbackSource = "return_to_store";
      feedbackOutcome = readyOnReturn ? "ready_on_return" : "still_not_ready_on_return";
      const remainingWait = Math.max(0, node.prepRemainingSeconds - backAtStore);
      waitSeconds = remainingWait;
      newDeliveredAt = backAtStore + remainingWait + deliverNewOrder;
    }

    const carriedOnTime = carriedDeliveredAt <= scenario.deadlineA;
    const newOnTime = newDeliveredAt <= scenario.deadlineB;
    const income = (carriedOnTime ? FULL_INCOME : LATE_INCOME)
      + (newOnTime ? FULL_INCOME : LATE_INCOME);
    const capacityCost = 2 + (incident ? 1 : 0);
    const result = {
      waveIndex: state.waveIndex,
      nodeIndex: state.nodeIndex,
      periodId: state.shiftPeriod.id,
      routeAction,
      routeDecisionId: state.currentRouteDecisionId,
      tripPaceDecisionId: decision.decisionId,
      speedId,
      tripPaceScope: "all_road_legs_until_both_orders_delivered",
      incident,
      incidentDelay,
      incidentCapacityCost: incident ? 1 : 0,
      feedbackSource,
      feedbackOutcome,
      waitedSeconds: waitSeconds,
      carriedDeliveredAt,
      newDeliveredAt,
      carriedOnTime,
      newOnTime,
      income,
      capacityCost
    };

    state.currentResult = result;
    state.speedCounts[speedId] += 1;
    state.income += income;
    state.capacityRemaining = Math.max(0, state.capacityRemaining - capacityCost);
    state.incidents += incident ? 1 : 0;
    state.onTime += Number(carriedOnTime) + Number(newOnTime);
    state.late += Number(!carriedOnTime) + Number(!newOnTime);
    state.phase = "resolving";
    state.log.push({
      eventType: "speed_choice",
      waveIndex: state.waveIndex,
      nodeIndex: state.nodeIndex,
      periodId: state.shiftPeriod.id,
      decisionId: decision.decisionId,
      routeAction,
      action: speedId,
      responseTimeMs: decision.responseTimeMs,
      tripPaceScope: result.tripPaceScope
    });
    state.log.push({
      eventType: "choice_outcome",
      decisionId: decision.decisionId,
      ...result,
      simulationTruth: {
        loadState: wave.loadState,
        scenarioKind: scenario.kind,
        urgencyRole: scenario.urgencyRole,
        prepRemainingSeconds: node.prepRemainingSeconds,
        deadlines: { carried: scenario.deadlineA, next: scenario.deadlineB }
      }
    });
    state.wavePublicHistory.push({
      nodeIndex: state.nodeIndex,
      routeAction,
      speedId,
      feedbackSource,
      feedbackOutcome,
      incident,
      incidentDelay,
      incidentCapacityCost: result.incidentCapacityCost,
      carriedOnTime,
      newOnTime,
      income,
      capacityAfter: state.capacityRemaining
    });
    return { ...result };
  }

  function showResult(state) {
    if (state.phase !== "resolving") throw new Error("no result is resolving");
    state.phase = "result";
    return snapshot(state);
  }

  function settleWaveBonus(state) {
    const capacityAtSettlement = state.capacityRemaining;
    const probability = capacityAtSettlement >= 2 ? 1 : capacityAtSettlement === 1 ? 0.5 : 0;
    const awarded = probability > 0 && state.rng() < probability;
    const settlement = {
      waveIndex: state.waveIndex,
      capacityAtSettlement,
      probability,
      awarded,
      income: awarded ? BONUS_INCOME : 0
    };
    state.lastBonusSettlement = settlement;
    state.bonusSettlements += 1;
    state.bonusAwardedCount += awarded ? 1 : 0;
    state.bonusMissedCount += awarded ? 0 : 1;
    state.bonusIncome += settlement.income;
    state.income += settlement.income;
    state.log.push({ eventType: "bonus_settlement", ...settlement });
    return settlement;
  }

  function continueAfterResult(state) {
    if (state.phase !== "result") throw new Error("result is not ready to continue");
    if (state.nodeIndex < state.plan[state.waveIndex].nodes.length - 1) {
      state.nodeIndex += 1;
      state.phase = "approaching_store";
    } else if (state.waveIndex < state.waveCount - 1) {
      settleWaveBonus(state);
      state.waveIndex += 1;
      state.nodeIndex = 0;
      state.wavePublicHistory = [];
      state.phase = "wave_break";
    } else {
      settleWaveBonus(state);
      state.phase = "summary";
      state.finishedAt = new Date().toISOString();
    }
    return snapshot(state);
  }

  function continueFromBreak(state) {
    if (state.phase !== "wave_break") throw new Error("not at a wave break");
    state.capacityRemaining = state.capacityMax;
    state.lastBonusSettlement = null;
    state.phase = "approaching_store";
    return snapshot(state);
  }

  function snapshot(state) {
    const truth = state.phase === "summary" ? null : currentTruth(state);
    return {
      version: state.version,
      seed: state.seed,
      mode: state.mode,
      waveCount: state.waveCount,
      nodesPerWave: state.nodesPerWave,
      routeChoiceCount: state.routeChoiceCount,
      shiftPeriod: { ...state.shiftPeriod },
      phase: state.phase,
      waveIndex: state.waveIndex,
      nodeIndex: state.nodeIndex,
      completedRouteChoices: Object.values(state.routeCounts).reduce((sum, value) => sum + value, 0),
      income: state.income,
      capacityRemaining: state.capacityRemaining,
      capacityMax: state.capacityMax,
      incidents: state.incidents,
      onTime: state.onTime,
      late: state.late,
      bonusIncome: state.bonusIncome,
      bonusAwardedCount: state.bonusAwardedCount,
      bonusMissedCount: state.bonusMissedCount,
      bonusSettlements: state.bonusSettlements,
      lastBonusSettlement: state.lastBonusSettlement ? { ...state.lastBonusSettlement } : null,
      currentNode: truth ? publicNode(truth.wave, truth.node) : null,
      currentRouteAction: state.currentRouteAction,
      currentResult: state.currentResult ? { ...state.currentResult } : null,
      visibleHistory: state.wavePublicHistory.map((item) => ({ ...item })),
      routeCounts: { ...state.routeCounts },
      speedCounts: { ...state.speedCounts },
      startedAt: state.startedAt,
      finishedAt: state.finishedAt
    };
  }

  function exportData(state) {
    return {
      schemaVersion: LOG_SCHEMA_VERSION,
      session: snapshot(state),
      configuration: {
        simulatorVersion: VERSION,
        copyVersion: COPY_VERSION,
        actionModel: ACTION_MODEL,
        waveCount: state.waveCount,
        nodesPerWave: state.nodesPerWave,
        capacityMax: state.capacityMax,
        fullIncome: FULL_INCOME,
        lateIncome: LATE_INCOME,
        waitWindowSeconds: WAIT_WINDOW_SECONDS,
        incidentDelaySeconds: INCIDENT_DELAY_SECONDS,
        incidentCapacityCost: 1,
        incidentConsequences: ["current_trip_delay", "future_order_capacity_loss"],
        bonusIncome: BONUS_INCOME,
        shiftPeriod: { ...SHIFT_PERIOD },
        prepRemainingSeconds: PREP_REMAINING_SECONDS,
        prepDistributions: PREP_DISTRIBUTIONS,
        urgencyStructure: {
          persistentWithinSegment: ["merchant", "loadState"],
          variesByTrial: "deadline scenario",
          fourTrialTemplate: ["probe_baseline", "tight/slack counterbalanced", "slack/tight counterbalanced", "probe_repeat"]
        }
      },
      log: state.log.map((event) => JSON.parse(JSON.stringify(event)))
    };
  }

  return {
    VERSION,
    LOG_SCHEMA_VERSION,
    COPY_VERSION,
    ACTION_MODEL,
    FULL_INCOME,
    LATE_INCOME,
    MAX_CAPACITY,
    DEFAULT_NODES_PER_WAVE,
    WAIT_WINDOW_SECONDS,
    INCIDENT_DELAY_SECONDS,
    BONUS_INCOME,
    SHIFT_PERIOD,
    MODES,
    ROUTE_ACTIONS,
    SPEEDS,
    PREP_REMAINING_SECONDS,
    PREP_DISTRIBUTIONS,
    PROBE_SCENARIOS,
    TIGHT_SCENARIOS,
    SLACK_SCENARIOS,
    scenarioBankForWaveCount,
    balancedPlanRows,
    urgencySequenceForProfile,
    capacityForNodes,
    buildPlan,
    createGame,
    start,
    arriveAtStore,
    chooseRoute,
    resolveChoice,
    showResult,
    continueAfterResult,
    continueFromBreak,
    snapshot,
    exportData
  };
});
