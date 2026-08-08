(function attachPomdpCourier(root, factory) {
  const mainline = typeof module === "object" && module.exports
    ? require("./pomdp-v2-mainline.js")
    : root.PomdpV2Mainline;
  const api = factory(mainline);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PomdpCourierV2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPomdpCourier(Mainline) {
  "use strict";

  if (!Mainline?.protocol || !Mainline?.structure || !Mainline?.task) {
    throw new Error("POMDP mainline manifest must load before the simulator");
  }

  const PROTOCOL_VERSION = Mainline.protocol.id;
  const VERSION = Mainline.protocol.simulatorVersion;
  const LOG_SCHEMA_VERSION = Mainline.protocol.logSchemaVersion;
  const COPY_VERSION = Mainline.protocol.copyVersion;
  const EXPERIENCE_COPY_VERSION = Mainline.protocol.experienceCopyVersion;
  const ACTION_MODEL = Mainline.protocol.actionModel;
  const FULL_INCOME = Mainline.task.fullIncome;
  const LATE_INCOME = Mainline.task.lateIncome;
  const MAX_CAPACITY = Mainline.task.maxCapacity;
  const DEFAULT_NODES_PER_WAVE = Mainline.structure.nodesPerWave;
  const WAIT_FEEDBACK_BANDS_SECONDS = Object.freeze({ shortMax: 90, mediumMax: 180 });
  const INCIDENT_DELAY_SECONDS = Mainline.task.incidentDelaySeconds;
  const INCIDENT_CAPACITY_COST = Mainline.task.incidentCapacityCost;
  const BONUS_INCOME = Mainline.task.bonusIncome;
  const WAIT_POLICY = Mainline.task.waitPolicy;
  const SHIFT_PERIOD = Mainline.structure.shiftPeriod;
  const MODES = Mainline.structure.modes;
  const ROUTE_ACTIONS = Object.freeze(["wait_until_ready", "deliver_carried_first"]);
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
  const EXPERIENCE_COPY = Object.freeze({
    usually_fast: Object.freeze([
      Object.freeze({ id: "usually_fast_01", text: "你以前午高峰跑这家店：大多数时候出餐比较快。" }),
      Object.freeze({ id: "usually_fast_02", text: "你以前午高峰跑这家店：通常不用等太久。" }),
      Object.freeze({ id: "usually_fast_03", text: "你以前午高峰跑这家店：多数时候到了没多久就能取餐。" }),
      Object.freeze({ id: "usually_fast_04", text: "你以前午高峰跑这家店：一般出餐挺利索。" })
    ]),
    variable: Object.freeze([
      Object.freeze({ id: "variable_01", text: "你以前午高峰跑这家店：有时很快，有时会拖一会儿。" }),
      Object.freeze({ id: "variable_02", text: "你以前午高峰跑这家店：出餐快慢不太稳定。" }),
      Object.freeze({ id: "variable_03", text: "你以前午高峰跑这家店：有时不用久等，有时要等上一阵。" }),
      Object.freeze({ id: "variable_04", text: "你以前午高峰跑这家店：每次出餐速度不太一样。" })
    ]),
    often_slow: Object.freeze([
      Object.freeze({ id: "often_slow_01", text: "你以前午高峰跑这家店：大多数时候出餐偏慢。" }),
      Object.freeze({ id: "often_slow_02", text: "你以前午高峰跑这家店：通常要等上一会儿。" }),
      Object.freeze({ id: "often_slow_03", text: "你以前午高峰跑这家店：多数时候不会马上出餐。" }),
      Object.freeze({ id: "often_slow_04", text: "你以前午高峰跑这家店：一般出餐不算快。" })
    ])
  });
  function merchant(id, name, experienceProfileId, experienceCopyIndex) {
    const copy = EXPERIENCE_COPY[experienceProfileId]?.[experienceCopyIndex];
    if (!copy) throw new Error(`missing experience copy for ${experienceProfileId}:${experienceCopyIndex}`);
    return Object.freeze({
      id,
      name,
      experienceProfileId,
      experienceCopyId: copy.id,
      experienceCopyVersion: EXPERIENCE_COPY_VERSION,
      experienceText: copy.text,
      experience: copy.text
    });
  }
  const MERCHANTS = Object.freeze([
    merchant("lantern", "灯火便当", "variable", 0),
    merchant("oldstreet", "老街炒饭", "usually_fast", 0),
    merchant("harbor", "河港砂锅", "often_slow", 0),
    merchant("mint", "青禾轻食", "variable", 1),
    merchant("osmanthus", "桂香米粉", "usually_fast", 1),
    merchant("westbridge", "西桥烧腊", "often_slow", 1),
    merchant("cloudlane", "云巷面馆", "variable", 2),
    merchant("kapok", "木棉小厨", "usually_fast", 2),
    merchant("northgate", "北门盖饭", "often_slow", 2),
    merchant("riverbend", "河湾蒸菜", "variable", 3),
    merchant("southwind", "南风馄饨", "usually_fast", 3),
    merchant("sanli", "三里饭堂", "often_slow", 3)
  ]);
  const DESTINATIONS = Object.freeze(["花园里", "滨河站", "云栖公寓", "春晓社区", "青石里", "望江台"]);
  const PROBE_SCENARIOS = Object.freeze([
    Object.freeze({ deadlineA: 300, deadlineB: 330, kind: "history_probe" }),
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

  function waitFeedbackOutcome(waitedSeconds) {
    if (waitedSeconds <= WAIT_FEEDBACK_BANDS_SECONDS.shortMax) return "ready_after_short_wait";
    if (waitedSeconds <= WAIT_FEEDBACK_BANDS_SECONDS.mediumMax) return "ready_after_medium_wait";
    return "ready_after_long_wait";
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
    if (waveCount > MERCHANTS.length) {
      throw new Error(`waveCount cannot exceed the ${MERCHANTS.length}-merchant catalog`);
    }
    const selectedMerchants = shuffle(MERCHANTS, rng).slice(0, waveCount);
    const profiles = shuffle(scenarioBankForWaveCount(waveCount), rng);
    let loadByMerchant;
    if (waveCount === MERCHANTS.length) {
      loadByMerchant = new Map();
      for (const profileId of Object.keys(EXPERIENCE_COPY)) {
        const profileMerchants = selectedMerchants.filter((item) => item.experienceProfileId === profileId);
        const loads = shuffle([
          ...Array(profileMerchants.length / 2).fill("busy"),
          ...Array(profileMerchants.length / 2).fill("smooth")
        ], rng);
        profileMerchants.forEach((item, index) => loadByMerchant.set(item.id, loads[index]));
      }
    } else {
      const loads = balancedLoadStates(waveCount, rng);
      loadByMerchant = new Map(selectedMerchants.map((item, index) => [
        item.id,
        loads[index]
      ]));
    }
    return selectedMerchants.map((item, index) => ({
      merchant: item,
      loadState: loadByMerchant.get(item.id),
      ...profiles[index]
    }));
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
    if (nodesPerWave === 6) {
      return [
        { ...probe, urgencyRole: "probe_baseline" },
        { ...middle[0] },
        { ...probe, urgencyRole: "probe_diagnostic" },
        { ...middle[1] },
        { ...probe, urgencyRole: "probe_diagnostic" },
        { ...probe, urgencyRole: "probe_repeat" }
      ];
    }
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
        protocolVersion: PROTOCOL_VERSION,
        version: VERSION,
        seed: Number(seed),
        participantId: typeof options.participantId === "string" && options.participantId.trim()
          ? options.participantId.trim()
          : null,
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
      routeCounts: { wait_until_ready: 0, deliver_carried_first: 0 },
      speedCounts: { normal: 0, rush: 0, sprint: 0 },
      currentRouteAction: null,
      currentRouteDecisionId: null,
      currentResult: null,
      wavePublicHistory: [],
      pendingDecision: null,
      nextEventSequence: 1,
      log: [],
      startedAt: new Date().toISOString(),
      finishedAt: null
    };
  }

  function currentTruth(state) {
    const wave = state.plan[state.waveIndex];
    return { wave, node: wave.nodes[state.nodeIndex] };
  }

  function logEvent(state, event) {
    const eventId = `${state.seed}-e${String(state.nextEventSequence).padStart(4, "0")}`;
    state.nextEventSequence += 1;
    state.log.push({ ...event, eventId });
  }

  function start(state) {
    if (state.phase !== "briefing") throw new Error("game has already started");
    state.phase = "approaching_store";
    logEvent(state, {
      eventType: "session_start",
      protocolVersion: PROTOCOL_VERSION,
      participantId: state.participantId,
      seed: state.seed,
      simulatorVersion: VERSION,
      copyVersion: COPY_VERSION,
      experienceCopyVersion: EXPERIENCE_COPY_VERSION,
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
      experienceId: `merchant-experience-${publicObservation.merchant.id}-v2`,
      experienceProfileId: publicObservation.merchant.experienceProfileId,
      experienceCopyId: publicObservation.merchant.experienceCopyId,
      experienceCopyVersion: publicObservation.merchant.experienceCopyVersion,
      experienceText: publicObservation.merchant.experienceText,
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
    logEvent(state, {
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
    logEvent(state, {
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
    logEvent(state, {
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

    if (routeAction === "wait_until_ready") {
      waitSeconds = node.prepRemainingSeconds;
      feedbackSource = "wait_until_ready";
      feedbackOutcome = waitFeedbackOutcome(waitSeconds);
      carriedDeliveredAt = waitSeconds + rideToCustomer + incidentDelay;
      newDeliveredAt = carriedDeliveredAt + deliverNewOrder;
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
      incidentCapacityCost: incident ? INCIDENT_CAPACITY_COST : 0,
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
    logEvent(state, {
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
    logEvent(state, {
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
    logEvent(state, { eventType: "bonus_settlement", ...settlement });
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
      protocolVersion: state.protocolVersion,
      seed: state.seed,
      participantId: state.participantId,
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
        protocolVersion: PROTOCOL_VERSION,
        protocolStructure: {
          trainingTrials: Mainline.structure.trainingTrials,
          pilotTrials: Mainline.structure.pilotTrials,
          experimentTrials: Mainline.structure.experimentTrials
        },
        researchScope: { ...Mainline.researchScope },
        simulatorVersion: VERSION,
        copyVersion: COPY_VERSION,
        experienceCopyVersion: EXPERIENCE_COPY_VERSION,
        actionModel: ACTION_MODEL,
        waveCount: state.waveCount,
        nodesPerWave: state.nodesPerWave,
        capacityMax: state.capacityMax,
        fullIncome: FULL_INCOME,
        lateIncome: LATE_INCOME,
        waitPolicy: WAIT_POLICY,
        waitFeedbackBandsSeconds: { ...WAIT_FEEDBACK_BANDS_SECONDS },
        incidentDelaySeconds: INCIDENT_DELAY_SECONDS,
        incidentCapacityCost: INCIDENT_CAPACITY_COST,
        incidentConsequences: ["current_trip_delay", "future_order_capacity_loss"],
        bonusIncome: BONUS_INCOME,
        shiftPeriod: { ...SHIFT_PERIOD },
        prepRemainingSeconds: PREP_REMAINING_SECONDS,
        prepDistributions: PREP_DISTRIBUTIONS,
        urgencyStructure: {
          persistentWithinSegment: ["merchant", "loadState"],
          variesByTrial: "deadline scenario",
          trialTemplate: state.nodesPerWave === 6
            ? ["probe_baseline", "tight/slack counterbalanced", "probe_diagnostic", "slack/tight counterbalanced", "probe_diagnostic", "probe_repeat"]
            : ["probe_baseline", "tight/slack counterbalanced", "slack/tight counterbalanced", "probe_repeat"]
        },
        merchantIdentityPolicy: "one_unique_merchant_per_segment_within_session",
        experienceCopyManifest: state.plan.map((wave) => ({
          merchantId: wave.merchant.id,
          experienceProfileId: wave.merchant.experienceProfileId,
          experienceCopyId: wave.merchant.experienceCopyId,
          experienceText: wave.merchant.experienceText
        }))
      },
      log: state.log.map((event) => JSON.parse(JSON.stringify(event)))
    };
  }

  return {
    MAINLINE: Mainline,
    PROTOCOL_VERSION,
    VERSION,
    LOG_SCHEMA_VERSION,
    COPY_VERSION,
    EXPERIENCE_COPY_VERSION,
    ACTION_MODEL,
    FULL_INCOME,
    LATE_INCOME,
    MAX_CAPACITY,
    DEFAULT_NODES_PER_WAVE,
    WAIT_FEEDBACK_BANDS_SECONDS,
    INCIDENT_DELAY_SECONDS,
    INCIDENT_CAPACITY_COST,
    BONUS_INCOME,
    WAIT_POLICY,
    SHIFT_PERIOD,
    MODES,
    ROUTE_ACTIONS,
    SPEEDS,
    PREP_REMAINING_SECONDS,
    PREP_DISTRIBUTIONS,
    waitFeedbackOutcome,
    EXPERIENCE_COPY,
    MERCHANTS,
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
