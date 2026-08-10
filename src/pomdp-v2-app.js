import { createFirstPersonWorld } from "./fp-render.js";

const Sim = window.PomdpCourierV2;
if (!Sim) throw new Error("PomdpCourierV2 failed to load");
const kCalibratedCandidate = Sim.MECHANISM_CONFIG.kCalibrated === true;
const customerMessagesUEnabled = Sim.MECHANISM_CONFIG.customerMessagesUEnabled === true;
const customerMessageCopyVersion = Sim.MECHANISM_CONFIG.customerMessageCopyVersion || "customer-message-copy-v1.1-polite";
const HistoryPresentation = window.PomdpHistoryPresentation;
if (!HistoryPresentation) throw new Error("PomdpHistoryPresentation failed to load");
const Telemetry = window.PomdpExperimentTelemetry;
if (!Telemetry) throw new Error("PomdpExperimentTelemetry failed to load");
const activeBuildId = Sim.MECHANISM_CONFIG.candidateBuildId || Telemetry.BUILD_ID;

const query = new URLSearchParams(location.search);
const requestedMode = query.get("mode");
const modeProvided = Object.hasOwn(Sim.MODES, requestedMode);
const mode = Object.hasOwn(Sim.MODES, requestedMode) ? requestedMode : "preview";
const seedParameter = query.get("seed");
const querySeed = Number(seedParameter);
const seedProvided = seedParameter !== null && Number.isFinite(querySeed) && querySeed > 0;
const seed = Number.isFinite(querySeed) && querySeed > 0
  ? querySeed
  : crypto.getRandomValues(new Uint32Array(1))[0];
const participantIdParameter = query.get("pid")?.trim() || "";
const participantIdProvided = participantIdParameter.length > 0;
const participantId = participantIdParameter || `anon-${seed}`;
const debug = query.get("debug") === "1";
const fastMotion = query.get("motion") === "fast";
const requestedArtLevel = query.get("art") || "all";
const requestedRenderStyle = query.get("look") || "county";
const formalGameOptions = Object.freeze({ mode, nodesPerWave: 6, participantId });
const expectedTrialCount = Sim.MODES[mode] * formalGameOptions.nodesPerWave;
const experimentTelemetry = Telemetry.createExperimentTelemetry({
  buildId: activeBuildId,
  participantId,
  participantIdProvided,
  seed,
  seedProvided,
  mode,
  modeProvided,
  expectedTrialCount
});
let game = Sim.createGame(seed, formalGameOptions);
const trainingVisualPlan = Sim.createGame(seed ^ 0x7a11, { mode: "preview", nodesPerWave: 2 });
const visualMerchantIds = [...new Set(
  game.plan.concat(trainingVisualPlan.plan).map((wave) => wave.merchant.id)
)];

const byId = (id) => document.getElementById(id);
const els = Object.fromEntries([
  "pomdpGame", "gameCanvas", "webglFallback", "hud", "objectiveChip", "segmentLabel", "objectiveLabel",
  "merchantLabel", "storeProgress", "storeProgressTitle", "storeProgressNodes", "storeProgressLabel", "capacityStatus", "capacityCells", "incomeStatus", "incomeValue", "travelPrompt", "travelIcon", "travelTitle", "travelDetail",
  "travelProgress", "routeDecision", "experienceText", "riderNotebook", "notebookMerchant", "historyFact1", "historyFact2", "carriedUrgencyLabel", "newUrgencyLabel",
  "carriedUrgency", "newUrgency", "carriedDestination", "platformText", "carriedOrderCard", "newOrderCard", "routeActions", "speedDecision",
  "chosenRouteText", "routeTransitionStatus", "goButton", "customerMessageCard", "customerMessageText", "feedbackCard", "feedbackIcon", "feedbackKicker", "feedbackTitle",
  "feedbackText", "rewardBurst", "rewardBurstLabel", "rewardBurstValue", "rewardBurstLoss", "resultCard", "resultTitle", "carriedResult", "carriedLateLoss", "newResult", "newLateLoss", "incidentResult",
  "incomeResult", "resultGrid", "incidentConsequences", "incidentDelayResult", "incidentCapacityResult", "continueButton", "startScreen", "startButton", "modeDescription", "briefingModal",
  "briefingStep", "briefingProgress", "briefingKicker", "briefingTitle", "briefingLead",
  "briefingVisual", "briefingNext", "tutorialCoach", "coachStep", "coachTitle", "coachText", "coachNext",
  "notebookTutorialModal", "notebookTutorialStep", "notebookTutorialMerchant", "notebookTutorialFact1", "notebookTutorialFact2", "notebookTutorialHowToRead", "notebookTutorialNext",
  "gearLever", "breakModal", "breakTitle", "breakNextText", "breakButton", "summaryModal", "summaryGrid",
  "breakBonus", "breakBonusTitle", "breakBonusText", "downloadButton", "restartButton", "debugPanel"
].map((id) => [id, byId(id)]));

const startButtonReadyMarkup = els.startButton.innerHTML;
let preparedExportArtifact = null;
els.startButton.disabled = true;
els.startButton.textContent = "正在准备街景…";
els.startButton.setAttribute("aria-busy", "true");

const world = createFirstPersonWorld(els.gameCanvas, {
  seed,
  merchantIds: visualMerchantIds,
  artLevel: requestedArtLevel,
  renderStyle: requestedRenderStyle,
  onReady() { els.pomdpGame.classList.add("world-ready"); },
  onVisualReady(runtime) {
    experimentTelemetry.markFirstOperable(runtime);
    els.pomdpGame.classList.add("visual-ready");
    els.pomdpGame.dataset.artLevel = runtime.requestedArtLevel;
    els.startButton.innerHTML = startButtonReadyMarkup;
    els.startButton.disabled = false;
    els.startButton.removeAttribute("aria-busy");
  },
  onContextError(error) {
    experimentTelemetry.recordContextError(error?.message || "WebGL context error");
    els.webglFallback.classList.remove("is-hidden");
  },
  onContextRestored() {
    experimentTelemetry.recordContextRestore();
    els.webglFallback.classList.add("is-hidden");
  }
});
window.__pomdpVisualRuntime = () => world.getVisualRuntime();
window.__pomdpRuntimeTelemetry = () => experimentTelemetry.snapshot(world.getVisualRuntime());

// Retained from the reviewed copy set for provenance. The live one-page briefing is rendered below.
const BRIEFING = Object.freeze([
  {
    section: null,
    kicker: null,
    title: null,
    lead: null,
    cards: [
      [],
      [],
      []
    ]
  },
  {
    section: null,
    kicker: null,
    title: null,
    lead: "每单的基础收入一样。迟到会少赚，骑得太猛又可能出事故。事故还会吃掉接单余力，让后面的机会变少。",
    cards: [
      ["准时", "拿到完整收入", "订单送到红线之前，就按完整金额结算。"],
      ["迟到", "这单少赚一点", "不会丢掉整单收入，但拖得越久越不划算。"],
      ["事故", "眼前和后面都会受影响", "同一次事故会让这一趟多耽误约一分半，也会额外用掉一格接单余力。"]
    ]
  },
  {
    section: null,
    kicker: null,
    title: null,
    lead: null,
    cards: [
      [null, null, "新餐没好时，决定等一会还是先送。"],
      ["第二步", "选骑行档位", "路线排好后，再决定这趟路骑多快。"],
      ["第三步", "看结果", "订单、事故和收入结算后，再处理下一组。"]
    ]
  },
  {
    section: "界面",
    kicker: "先认清屏幕上的东西",
    title: "上面看全局，下面看眼前两单",
    lead: "左上角会一直写明现在是午高峰，也告诉你跑到哪一段、正在做第几次安排。右上角是接单余力和今天累计赚到的钱。到店后，下面会展开两张订单的情况。",
    cards: [
      ["接单余力", "每家店从十四格开始", "每组两张订单用两格；事故再用一格。店铺结束时剩2格稳拿加单，1格碰运气，0格没有。"],
      ["今天赚到", "一直累计", "不会在段与段之间清零，最后按总收入结算。"],
      ["两条时间条", "越长越赶", "左边是手上待送的单，右边是店里正在做的新单。"]
    ]
  },
  {
    section: "判断",
    kicker: "到店后先看什么",
    title: "平台、经验和眼前时间要放在一起看",
    lead: "平台会告诉你这单排得紧不紧。你也知道这家店平时大概快不快。两条时间条则说明眼前哪一单更急。它们可能说的是同一件事，也可能互相打架。",
    cards: [
      ["手上这单", "先看还能不能拖", "条很长时，继续等更容易让它迟到。"],
      ["等取的新单", "再看它急不急", "条短不等于餐快做好，只表示它的送达时间比较宽裕。"],
      ["这家店的经验", "只是平时印象", "今天这一刻可能顺，也可能比平时忙，不能当成保证。"]
    ]
  },
  {
    section: "选择",
    kicker: "新餐还没好时",
    title: "留下等，还是先送？",
    lead: "这里没有永远正确的按钮。手上订单很赶时，先送更稳；觉得餐快好了、两单时间也够时，留下等可能少跑一次折返。",
    cards: [
      ["等餐做好再一起送", "会一直等到出餐", "餐一做好就一起走，可以少跑一次折返，但手上的单也会跟着等。"],
      ["先送手上这单", "现在就离店", "店家继续做餐。你送完以后回来取，但会多跑一段路。"],
      ["现场结果", "会直接告诉你", "你会看到餐有没有等到、回来时有没有做好，不用猜发生了什么。"]
    ]
  },
  {
    section: "速度",
    kicker: "路线排好以后",
    title: "选一个整趟骑行档位",
    lead: "现实中骑手会按路段和路况变速。这里把接下来几段路合成一次选择：选定后，直到这两单送完都按同一档骑。绿色条表示能省多少路上时间，橙色条表示事故风险。",
    cards: [
      ["稳骑", "最安全", "省下的时间最少，适合时间还够的订单。"],
      ["赶路", "折中一档", "能抢回一些时间，事故风险也会增加。"],
      ["冲刺", "最快也最危险", "可能保住快迟到的单，也最容易出事故。骑快不会让店家提前出餐。"]
    ]
  },
  {
    section: "反馈",
    kicker: "第一组跑完以后",
    title: kCalibratedCandidate ? "骑手笔记只记下你亲眼遇到的事" : "刚才的出餐结果，可以留在心里",
    lead: kCalibratedCandidate
      ? "同一家店的六组订单里，临时忙闲通常会持续一阵。留下等餐时，你知道自己等了多久；先送再回来时，你只知道回来那刻餐好了没有。笔记保留最近两次事实，但不会替你判断店里忙不忙。"
      : "同一家店的六组订单里，临时忙闲通常不会立刻翻过来。屏幕会替你保留最近两次取餐事实，但不会直接告诉你店里忙不忙。换店后，这些临时记录会清空。",
    cards: kCalibratedCandidate ? [
      ["留店等餐", "记下等了多久", "这是从到店到出餐的完整等待事实。"],
      ["先送再回来", "记下回来时好了没有", "它不能告诉你餐究竟提前多久做好。"],
      ["换到下一家店", "重新判断", "这家店的临时记录会清空。"]
    ] : [
      ["等到了", "这一刻可能比较顺", "下一组仍要看时间，不能闭眼照搬。"],
      ["一直没好", "这一刻可能比较忙", "再遇到紧单时，继续等就要更谨慎。"],
      ["下一段", "重新判断", "接单余力会恢复，店里的临时情况也会重置。"]
    ]
  }
]);

let briefingIndex = 0;
let selectedSpeed = null;
let interactionLocked = false;
let trainingActive = false;
let trainingStep = 0;
let coachResolve = null;
let notebookTutorialResolve = null;
let notebookTutorialShown = false;
let lastCapacity = null;
let lastIncome = 0;
let incomeAnimationFrame = 0;
let rewardTimer = 0;
let messageGateReady = !customerMessagesUEnabled;
let messageWindowToken = 0;
let messageAudioContext = null;
let messageAudioPrewarmAttempted = false;
let customerMessageAnimation = null;
let lastMessageUiPerformance = null;
const TRAINING_STEP_COUNT = customerMessagesUEnabled ? 13 : 12;

function hide(element) { element.classList.add("is-hidden"); }
function show(element) { element.classList.remove("is-hidden"); }
function hideCustomerMessage() {
  hide(els.customerMessageCard);
  els.pomdpGame.classList.remove("has-customer-message");
}
function showCustomerMessage() {
  show(els.customerMessageCard);
  els.pomdpGame.classList.add("has-customer-message");
}
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function duration(normalMilliseconds) { return fastMotion ? Math.min(90, normalMilliseconds) : normalMilliseconds; }
function setOptionalText(element, value) {
  const visible = typeof value === "string" && value.trim().length > 0;
  element.textContent = visible ? value : "";
  element.hidden = !visible;
}

function customerMessageCopy(condition) {
  if (condition === "urging" && customerMessageCopyVersion === "customer-message-copy-v1.2-direct-pressure") {
    return "怎么还没到？我现在很饿了，赶紧给我送过来。";
  }
  return condition === "urging"
    ? "您好，麻烦尽量快点送到，谢谢。"
    : "您好，送到后放门口就行，谢谢。";
}

function ensureCustomerMessageAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  messageAudioContext ||= new AudioContextClass();
  return messageAudioContext;
}

function prewarmCustomerMessageTone() {
  if (!customerMessagesUEnabled) return;
  messageAudioPrewarmAttempted = true;
  try {
    const context = ensureCustomerMessageAudio();
    if (context?.state === "suspended") void context.resume().catch(() => {});
  } catch {
    // Sound is supplementary; the visible message remains the experimental exposure.
  }
}

function playCustomerMessageTone() {
  try {
    const context = ensureCustomerMessageAudio();
    if (!context || context.state !== "running") {
      if (context?.state === "suspended") void context.resume().catch(() => {});
      return false;
    }
    const oscillator = messageAudioContext.createOscillator();
    const gain = messageAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(720, messageAudioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, messageAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, messageAudioContext.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, messageAudioContext.currentTime + 0.19);
    oscillator.connect(gain).connect(messageAudioContext.destination);
    oscillator.start();
    oscillator.stop(messageAudioContext.currentTime + 0.2);
    return true;
  } catch {
    return false;
  }
}

function rendererPerformanceCheckpoint() {
  const performanceState = world.getVisualRuntime().performance;
  return {
    atPerformanceMs: Math.round(performance.now() * 100) / 100,
    longFramesOver50Ms: Number(performanceState.longFramesOver50Ms || 0)
  };
}

function afterTwoRenderedFrames() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function animateCustomerMessage() {
  customerMessageAnimation?.cancel();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !els.customerMessageCard.animate) return;
  customerMessageAnimation = els.customerMessageCard.animate([
    { opacity: 0, transform: "translate(-50%, -10px) scale(.985)" },
    { opacity: 1, transform: "translate(-50%, 0) scale(1)" }
  ], {
    duration: 220,
    easing: "cubic-bezier(.2, .8, .2, 1)",
    fill: "both"
  });
}

function updateGoButtonState() {
  const speedButtonsLocked = customerMessagesUEnabled && !messageGateReady;
  els.speedDecision.querySelectorAll("[data-speed]").forEach((button) => {
    button.disabled = speedButtonsLocked;
    button.setAttribute("aria-disabled", String(speedButtonsLocked));
  });
  if (speedButtonsLocked) {
    els.goButton.disabled = true;
    els.goButton.textContent = "准备出发…";
    return;
  }
  if (!selectedSpeed) {
    els.goButton.disabled = true;
    els.goButton.textContent = "先选一个档位";
    return;
  }
  els.goButton.disabled = false;
  els.goButton.textContent = `${Sim.SPEEDS[selectedSpeed].label}出发`;
}

async function runCustomerMessageWindow() {
  if (!customerMessagesUEnabled) return;
  const token = ++messageWindowToken;
  const plan = Sim.customerMessagePlanFor(game);
  messageGateReady = false;
  hideCustomerMessage();
  show(els.routeTransitionStatus);
  els.speedDecision.classList.add("is-preparing");
  updateGoButtonState();
  const timeScale = fastMotion ? 0.04 : 1;
  const gateWaitMs = Math.max(90, Math.round(Sim.CUSTOMER_MESSAGE_GATE_MS * timeScale));
  const messageDelayMs = plan.messageScheduled
    ? Math.max(30, Math.round(plan.scheduledDelayMs * timeScale))
    : null;
  const windowStarted = rendererPerformanceCheckpoint();
  let beforeReveal = null;
  let afterReveal = null;
  const exposureTask = plan.messageScheduled ? (async () => {
    await delay(messageDelayMs);
    if (token !== messageWindowToken || game.phase !== "speed_decision") return;
    els.customerMessageText.textContent = customerMessageCopy(plan.condition);
    els.customerMessageCard.dataset.condition = plan.condition;
    beforeReveal = rendererPerformanceCheckpoint();
    showCustomerMessage();
    animateCustomerMessage();
    const soundPlayed = playCustomerMessageTone();
    Sim.markCustomerMessageExposed(game, { soundPlayed });
    await afterTwoRenderedFrames();
    afterReveal = rendererPerformanceCheckpoint();
    if (trainingActive && Sim.snapshot(game).nodeIndex === 0) {
      await showCoach(
        els.customerMessageCard,
        "顾客有时会在你定好路线后发消息",
        "消息不会影响平台时间、收入或事故风险；整趟骑多快，还是由你决定。"
      );
    }
  })() : Promise.resolve();
  await delay(gateWaitMs);
  await exposureTask;
  if (token !== messageWindowToken || game.phase !== "speed_decision") return;
  const gateEnded = rendererPerformanceCheckpoint();
  lastMessageUiPerformance = {
    measurement: "visible_request_animation_frame_intervals",
    messageScheduled: plan.messageScheduled,
    plannedWindowDurationMs: gateWaitMs,
    windowDurationMs: Math.round((gateEnded.atPerformanceMs - windowStarted.atPerformanceMs) * 100) / 100,
    windowTimerOverrunMs: Math.max(0, Math.round((
      gateEnded.atPerformanceMs - windowStarted.atPerformanceMs - gateWaitMs
    ) * 100) / 100),
    plannedMessageRevealDelayMs: messageDelayMs,
    messageRevealLatencyMs: beforeReveal
      ? Math.round((beforeReveal.atPerformanceMs - windowStarted.atPerformanceMs) * 100) / 100
      : null,
    messageRevealTimerOverrunMs: beforeReveal
      ? Math.max(0, Math.round((
        beforeReveal.atPerformanceMs - windowStarted.atPerformanceMs - messageDelayMs
      ) * 100) / 100)
      : null,
    longFramesBeforeReveal: beforeReveal
      ? Math.max(0, beforeReveal.longFramesOver50Ms - windowStarted.longFramesOver50Ms)
      : null,
    longFramesImmediatelyAfterReveal: beforeReveal && afterReveal
      ? Math.max(0, afterReveal.longFramesOver50Ms - beforeReveal.longFramesOver50Ms)
      : null,
    longFramesAfterRevealUntilGate: afterReveal
      ? Math.max(0, gateEnded.longFramesOver50Ms - afterReveal.longFramesOver50Ms)
      : null,
    longFramesDuringWindow: Math.max(0, gateEnded.longFramesOver50Ms - windowStarted.longFramesOver50Ms)
  };
  Sim.markCustomerMessageGateReady(game, { uiPerformance: lastMessageUiPerformance });
  messageGateReady = true;
  hide(els.routeTransitionStatus);
  els.speedDecision.classList.remove("is-preparing");
  updateGoButtonState();
  updateDebug();
}

function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function showReward(value, label = "收入入账", lateLoss = 0) {
  window.clearTimeout(rewardTimer);
  els.rewardBurstLabel.textContent = label;
  els.rewardBurstValue.textContent = `+¥${value}`;
  els.rewardBurstLoss.textContent = `超时少赚 ¥${lateLoss}`;
  els.rewardBurstLoss.classList.toggle("is-hidden", lateLoss <= 0);
  els.rewardBurst.classList.toggle("has-late-loss", lateLoss > 0);
  show(els.rewardBurst);
  replayAnimation(els.rewardBurst, "is-playing");
  rewardTimer = window.setTimeout(() => hide(els.rewardBurst), fastMotion ? 1050 : 1680);
}

function renderIncome(targetIncome) {
  const previousIncome = lastIncome;
  const increased = targetIncome > previousIncome;
  window.cancelAnimationFrame(incomeAnimationFrame);
  if (!increased || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.incomeValue.textContent = `¥${targetIncome}`;
  } else {
    const started = performance.now();
    const animationDuration = fastMotion ? 180 : 560;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / animationDuration);
      const eased = 1 - ((1 - progress) ** 3);
      const displayed = Math.round(previousIncome + (targetIncome - previousIncome) * eased);
      els.incomeValue.textContent = `¥${displayed}`;
      if (progress < 1) incomeAnimationFrame = requestAnimationFrame(tick);
    };
    incomeAnimationFrame = requestAnimationFrame(tick);
  }
  if (increased) replayAnimation(els.incomeStatus, "is-earning");
  lastIncome = targetIncome;
}

function setUrgencyTone(card, value) {
  card.classList.toggle("is-urgent", value >= .72);
  card.classList.toggle("is-watch", value >= .45 && value < .72);
  card.classList.toggle("is-calm", value < .45);
}

function clearTutorialFocus() {
  document.querySelectorAll(".tutorial-focus").forEach((element) => element.classList.remove("tutorial-focus"));
}

function showCoach(target, title, text, buttonText = "明白了，继续") {
  clearTutorialFocus();
  trainingStep += 1;
  target?.classList.add("tutorial-focus");
  els.tutorialCoach.classList.toggle("is-notebook-coach", target === els.riderNotebook);
  els.coachStep.textContent = `上岗提示 · ${trainingStep}/${TRAINING_STEP_COUNT}`;
  els.coachTitle.textContent = title;
  setOptionalText(els.coachText, text);
  els.coachNext.textContent = buttonText;
  show(els.tutorialCoach);
  return new Promise((resolve) => { coachResolve = resolve; });
}

function closeCoach() {
  hide(els.tutorialCoach);
  els.tutorialCoach.classList.remove("is-notebook-coach");
  clearTutorialFocus();
  const resolve = coachResolve;
  coachResolve = null;
  resolve?.();
}

function showNotebookTutorial(snapshot) {
  if (notebookTutorialShown) return Promise.resolve();
  notebookTutorialShown = true;
  trainingStep += 1;
  const recent = (snapshot.visibleHistory || []).slice(-2).reverse();
  els.notebookTutorialStep.textContent = `上岗提示 · ${trainingStep}/${TRAINING_STEP_COUNT}`;
  els.notebookTutorialMerchant.textContent = snapshot.currentNode?.merchant?.name || "当前店铺";
  renderHistoryFactRow(els.notebookTutorialFact1, recent[0], "上一次", "刚才的情况已经记下");
  if (recent[1]) renderHistoryFactRow(els.notebookTutorialFact2, recent[1], "上上次");
  els.notebookTutorialFact2.classList.toggle("is-hidden", !recent[1]);
  if (kCalibratedCandidate) {
    els.notebookTutorialHowToRead.textContent = "表情反映等餐耗时；若有折返箭头，表示该次选择了折返送餐。";
  }
  show(els.notebookTutorialModal);
  return new Promise((resolve) => { notebookTutorialResolve = resolve; });
}

function closeNotebookTutorial() {
  hide(els.notebookTutorialModal);
  const resolve = notebookTutorialResolve;
  notebookTutorialResolve = null;
  resolve?.();
}

function urgencyLabel(value) {
  if (value >= .72) return "很赶";
  if (value >= .45) return "有点赶";
  return "时间还够";
}

function updateDebug() {
  experimentTelemetry.updateState(Sim.snapshot(game), { trainingActive });
  if (!debug) return;
  show(els.debugPanel);
  els.debugPanel.textContent = JSON.stringify({
    snapshot: Sim.snapshot(game),
    log: game.log.slice(-4),
    runtimeTelemetry: experimentTelemetry.snapshot(world.getVisualRuntime()),
    integrityAudit: preparedExportArtifact?.payload?.integrityAudit || null
  }, null, 2);
}

function renderCapacity(snapshot) {
  els.capacityCells.replaceChildren(...Array.from({ length: snapshot.capacityMax }, (_, index) => {
    const cell = document.createElement("i");
    if (index < snapshot.capacityRemaining) cell.className = "is-full";
    return cell;
  }));
  els.capacityStatus.classList.toggle("is-low", snapshot.capacityRemaining <= 1);
  els.capacityStatus.classList.toggle("is-mid", snapshot.capacityRemaining === 2);
  if (lastCapacity !== null && snapshot.capacityRemaining < lastCapacity) {
    replayAnimation(els.capacityStatus, "is-draining");
  }
  lastCapacity = snapshot.capacityRemaining;
}

function renderStoreProgress(snapshot) {
  const count = Math.max(1, Number(snapshot.nodesPerWave) || 1);
  const currentIndex = Math.min(count - 1, Math.max(0, Number(snapshot.nodeIndex) || 0));
  const title = trainingActive ? "试跑进度" : "本店进度";
  els.storeProgressTitle.textContent = title;
  els.storeProgressLabel.textContent = `${currentIndex + 1}/${count}组`;
  els.storeProgress.setAttribute("aria-label", `${title}：第 ${currentIndex + 1} / ${count} 组`);
  els.storeProgressNodes.style.setProperty("--progress-count", count);
  els.storeProgressNodes.replaceChildren(...Array.from({ length: count }, (_, index) => {
    const node = document.createElement("i");
    node.className = index < currentIndex
      ? "is-complete"
      : index === currentIndex ? "is-current" : "is-upcoming";
    return node;
  }));
}

function renderHud(snapshot = Sim.snapshot(game)) {
  renderCapacity(snapshot);
  renderIncome(snapshot.income);
  if (snapshot.currentNode) {
    const periodLabel = snapshot.currentNode.period?.label || Sim.SHIFT_PERIOD.label;
    els.segmentLabel.textContent = trainingActive
      ? `${periodLabel} · 上岗试跑`
      : `${periodLabel} · 第 ${snapshot.waveIndex + 1} / ${snapshot.waveCount} 家`;
    els.merchantLabel.textContent = `当前店铺：${snapshot.currentNode.merchant.name}`;
    renderStoreProgress(snapshot);
    world.setActiveMerchant(snapshot.currentNode.merchant.id, snapshot.currentNode.merchant.name);
  }
  updateDebug();
}

function hidePlaySurfaces() {
  messageWindowToken += 1;
  hideCustomerMessage();
  hide(els.routeTransitionStatus);
  els.speedDecision.classList.remove("is-preparing");
  [els.routeDecision, els.riderNotebook, els.speedDecision, els.feedbackCard, els.rewardBurst, els.resultCard, els.travelPrompt].forEach(hide);
}

function renderBriefing() {
  els.briefingStep.textContent = "上岗准备 · 1/1";
  els.briefingProgress.style.width = "100%";
  els.briefingKicker.textContent = "熟悉跑法";
  els.briefingTitle.textContent = "你就是今天跑单的骑手";
  els.briefingLead.textContent = "";
  els.briefingVisual.replaceChildren(...[
    {
      label: "你现在是骑手",
      title: "平台已经把单排好了",
      text: customerMessagesUEnabled
        ? "导航会自动带路。你先安排路线，之后顾客有时会发来消息，再决定整趟骑多快。"
        : "导航会自动带路。到了店，你来决定等到餐好再一起送，还是先送手上的。"
    },
    { label: "今天要多赚钱", title: "准时送，路上别出事", text: "准时能拿完整收入；同一次事故会让眼前这趟多耽误约一分半，也会让后面的接单机会变少。" },
    { label: "同一家店连续跑六组", title: "刚才的取餐情况会记下来", text: "不用硬记。换店时会提醒你，骑手笔记也会重新开始。", visual: "same-store-six-groups" }
  ].map(({ label, title, text, visual }) => {
    const article = document.createElement("article");
    article.innerHTML = `<span>${label}</span>`;
    if (visual === "same-store-six-groups") {
      article.classList.add("has-store-flow");
      const flow = document.createElement("div");
      flow.className = "briefing-store-flow";
      flow.setAttribute("aria-hidden", "true");
      flow.innerHTML = `
        <div class="briefing-store-symbol">
          <svg viewBox="0 0 40 34" focusable="false">
            <path d="M6 13h28v17H6zM4 13l4-8h24l4 8M11 13v5m6-5v5m6-5v5m6-5v5M10 30V20h12v10m4-7h5" />
          </svg>
          <b></b>
        </div>
        <div class="briefing-group-track"></div>
        <div class="briefing-next-store"><b>→</b><em></em></div>
      `;
      flow.querySelector(".briefing-store-symbol b").textContent = "本店";
      flow.querySelector(".briefing-next-store em").textContent = "换店";
      flow.querySelector(".briefing-group-track").replaceChildren(...[1, 2, 3, 4, 5, 6].map((number) => {
        const node = document.createElement("i");
        node.textContent = number;
        return node;
      }));
      article.append(flow);
    }
    article.insertAdjacentHTML("beforeend", `<strong>${title}</strong><small>${text}</small>`);
    return article;
  }));
}

function createHistoryFactSymbol(presentation) {
  const symbol = document.createElement("span");
  symbol.className = `history-fact-symbol is-${presentation.family}`;
  symbol.dataset.visualCode = presentation.visualCode;
  symbol.dataset.expression = presentation.expression || "patient";
  symbol.dataset.route = presentation.route || "fact";
  symbol.setAttribute("aria-hidden", "true");
  const expressions = {
    relieved: {
      eyes: '<path d="M7.5 10.3c.8-.9 1.8-.9 2.6 0m3.8 0c.8-.9 1.8-.9 2.6 0"></path>',
      mouth: '<path d="M8.3 14.3c1.8 2.2 5.6 2.2 7.4 0"></path>',
      extra: ""
    },
    weary: {
      eyes: '<path d="M7.3 10.1l2.7.8m4-.1 2.7-.8"></path>',
      mouth: '<path d="M8.8 16c1.6-1.7 4.8-1.7 6.4 0"></path>',
      extra: '<path class="history-emotion-extra" d="M18.6 7.3c1.1 1.5.9 2.7-.2 3.1-1.1.3-1.8-.9.2-3.1Z"></path>'
    },
    patient: {
      eyes: '<path d="M8.3 10.2h.1m7.2 0h.1"></path>',
      mouth: '<path d="M9 15h6"></path>',
      extra: ""
    }
  };
  const face = expressions[presentation.expression] || expressions.patient;
  const returnBadge = presentation.route === "return"
    ? '<span class="history-route-badge">↩</span>'
    : "";
  symbol.innerHTML = `
    <svg class="history-emotion-face" viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="8.2"></circle>
      ${face.eyes}${face.mouth}${face.extra}
    </svg>
    ${returnBadge}
  `;
  return symbol;
}

function renderHistoryFactRow(row, entry, lead, fallbackText = "这次取餐已经记下") {
  const source = HistoryPresentation.getPresentation(entry?.feedbackOutcome);
  const presentation = entry ? source : { ...source, text: fallbackText };
  const leadNode = document.createElement("span");
  leadNode.className = "history-fact-lead";
  leadNode.textContent = `${lead}：`;
  const textNode = document.createElement("span");
  textNode.className = "history-fact-text";
  textNode.textContent = presentation.text;
  row.dataset.feedbackOutcome = entry?.feedbackOutcome || "fact_recorded";
  row.dataset.visualCode = presentation.visualCode;
  row.setAttribute("aria-label", `${lead}：${presentation.text}`);
  row.replaceChildren(createHistoryFactSymbol(presentation), leadNode, textNode);
}

function renderRiderNotebook(snapshot) {
  const recent = (snapshot.visibleHistory || []).slice(-2).reverse();
  if (recent.length === 0) {
    hide(els.riderNotebook);
    return;
  }
  els.notebookMerchant.textContent = snapshot.currentNode?.merchant?.name || "当前店铺";
  renderHistoryFactRow(els.historyFact1, recent[0], "上一次");
  if (recent[1]) renderHistoryFactRow(els.historyFact2, recent[1], "上上次");
  els.historyFact2.classList.toggle("is-hidden", !recent[1]);
  show(els.riderNotebook);
}

function renderRouteDecision(snapshot) {
  const node = snapshot.currentNode;
  els.routeDecision.classList.remove("is-resolving");
  els.routeDecision.querySelectorAll("[data-route]").forEach((button) => button.classList.remove("is-committed"));
  els.objectiveLabel.textContent = "策略选择";
  els.experienceText.textContent = node.merchant.experienceText;
  renderRiderNotebook(snapshot);
  els.carriedUrgency.style.width = `${Math.round(node.carriedUrgency * 100)}%`;
  els.newUrgency.style.width = `${Math.round(node.newUrgency * 100)}%`;
  els.carriedUrgencyLabel.textContent = urgencyLabel(node.carriedUrgency);
  els.newUrgencyLabel.textContent = urgencyLabel(node.newUrgency);
  setUrgencyTone(els.carriedOrderCard, node.carriedUrgency);
  setUrgencyTone(els.newOrderCard, node.newUrgency);
  els.carriedDestination.textContent = `送往${node.carriedDestination}`;
  els.platformText.textContent = node.platformText;
  show(els.routeDecision);
  els.routeDecision.focus({ preventScroll: true });
  renderHud(snapshot);
}

async function guideStoreDecision(snapshot) {
  if (!trainingActive) return;
  if (snapshot.nodeIndex === 0) {
    await showCoach(
      els.experienceText,
      "你对取餐店有个大概的印象",
      "这是你过去午高峰跑这家店留下的印象，可以帮你先有个大概判断。"
    );
    await showCoach(
      els.carriedOrderCard,
      "左边是手上正在送的单",
      null
    );
    await showCoach(
      els.newOrderCard,
      "右边是店里正在做的新单",
      null
    );
    await showCoach(
      els.routeActions,
      "现在决定：等餐做好，还是马上走",
      "选择“等餐做好再一起送”，你会留在店里直到餐做好，再把两单一起送；选择“先送手上这单”，现在就走，之后再回来取新餐。",
      "知道了，我来选"
    );
  } else {
    await showNotebookTutorial(snapshot);
  }
}

async function playTravelLeg({ targetType, targetLabel, title, detail, milliseconds, speedId = "normal" }) {
  els.objectiveLabel.textContent = title;
  els.travelIcon.textContent = targetType === "merchant" ? "⌂" : "➜";
  els.travelTitle.textContent = title;
  setOptionalText(els.travelDetail, detail);
  els.travelProgress.style.width = "0%";
  els.travelPrompt.classList.remove("is-waiting");
  show(els.travelPrompt);
  world.setArrivalTarget(targetType, targetLabel);
  await world.animatePath(null, null, duration(milliseconds), speedId, (progress) => {
    els.travelProgress.style.width = `${Math.round(progress * 100)}%`;
  });
  hide(els.travelPrompt);
}

async function playWaitLeg(merchantName, waitedSeconds, copy = {}) {
  const visualDuration = waitedSeconds <= Sim.WAIT_FEEDBACK_BANDS_SECONDS.shortMax
    ? 520
    : waitedSeconds <= Sim.WAIT_FEEDBACK_BANDS_SECONDS.mediumMax ? 740 : 980;
  els.objectiveLabel.textContent = "留在店里等餐";
  els.travelIcon.textContent = "◷";
  els.travelTitle.textContent = copy.title || "等新餐做好";
  setOptionalText(els.travelDetail, copy.detail || "餐好后把两单一起送");
  els.travelProgress.style.width = "0%";
  els.travelPrompt.classList.add("is-waiting");
  show(els.travelPrompt);
  world.setArrivalTarget("merchant", merchantName);
  await world.waitAtMerchant(duration(visualDuration), (progress) => {
    els.travelProgress.style.width = `${Math.round(progress * 100)}%`;
  });
  hide(els.travelPrompt);
  els.travelPrompt.classList.remove("is-waiting");
}

async function approachStore() {
  if (interactionLocked) return;
  interactionLocked = true;
  hidePlaySurfaces();
  const snapshot = Sim.snapshot(game);
  renderHud(snapshot);
  await playTravelLeg({
    targetType: "merchant",
    targetLabel: snapshot.currentNode.merchant.name,
    title: `去${snapshot.currentNode.merchant.name}取餐`,
    milliseconds: 900
  });
  const arrived = Sim.arriveAtStore(game);
  renderRouteDecision(arrived);
  await guideStoreDecision(arrived);
  interactionLocked = false;
}

function renderSpeedDecision(routeAction) {
  selectedSpeed = null;
  messageGateReady = !customerMessagesUEnabled;
  hideCustomerMessage();
  els.speedDecision.classList.toggle("is-preparing", customerMessagesUEnabled);
  els.routeTransitionStatus.classList.toggle("is-hidden", !customerMessagesUEnabled);
  els.speedDecision.querySelectorAll("[data-speed]").forEach((button) => button.setAttribute("aria-checked", "false"));
  updateGoButtonState();
  els.chosenRouteText.textContent = routeAction === "wait_until_ready"
    ? "留在店里等到餐做好，再把两单一起送。两单送完前都按同一档骑。"
    : "先送手上的，之后折返回来取餐。两单送完前都按同一档骑。";
  show(els.speedDecision);
}

function feedbackCopy(result) {
  if (result.feedbackOutcome === "ready_after_short_wait") return {
    kicker: "没等多久",
    title: "餐做好了",
    icon: "✓"
  };
  if (result.feedbackOutcome === "ready_after_medium_wait") return {
    kicker: "等了一阵",
    title: "餐做好了",
    icon: "✓"
  };
  if (result.feedbackOutcome === "ready_after_long_wait") return {
    kicker: "等了很久",
    title: "餐终于做好了",
    icon: "✓"
  };
  if (result.feedbackOutcome === "ready_on_return") return {
    kicker: "送完手上这单，回到店里",
    title: "餐已经做好了",
    text: kCalibratedCandidate ? null : "现在可以直接取走。",
    icon: kCalibratedCandidate ? "↩" : "✓"
  };
  return {
    kicker: "回来后又等了一会",
    title: "取到餐了",
    icon: "✓"
  };
}

async function flashFeedback(result) {
  const copy = feedbackCopy(result);
  els.feedbackKicker.textContent = copy.kicker;
  setOptionalText(els.feedbackTitle, copy.title);
  setOptionalText(els.feedbackText, copy.text);
  els.feedbackIcon.textContent = copy.icon;
  els.feedbackCard.dataset.tone = [
    "ready_after_short_wait", "ready_after_medium_wait", "ready_after_long_wait",
    ...(kCalibratedCandidate ? [] : ["ready_on_return"])
  ].includes(result.feedbackOutcome)
    ? "good"
    : "watch";
  show(els.feedbackCard);
  replayAnimation(els.feedbackCard, "is-arriving");
  if (trainingActive && Sim.snapshot(game).nodeIndex === 0) {
    await showCoach(
      els.feedbackCard,
      "留意取餐店情况",
      kCalibratedCandidate
        ? "出餐速度可以为你接下来的判断提供一定的参考。"
        : "店家的出餐速度说明了今天实际忙不忙，能为你再回到这家店时提供参考。"
    );
  } else {
    await delay(fastMotion ? 360 : 950);
  }
  hide(els.feedbackCard);
}

async function flashIncidentConsequences() {
  await world.playIncident();
  els.feedbackIcon.textContent = "!";
  els.feedbackKicker.textContent = "发生事故";
  setOptionalText(els.feedbackTitle, null);
  setOptionalText(els.feedbackText, "事故耽误了时间，并且多扣除接单余力");
  els.feedbackCard.dataset.tone = "danger";
  show(els.feedbackCard);
  replayAnimation(els.feedbackCard, "is-arriving");
  renderCapacity(Sim.snapshot(game));
  updateDebug();
  await delay(fastMotion ? 320 : 1050);
  hide(els.feedbackCard);
}

async function animateResolution(result, snapshotBefore) {
  const node = snapshotBefore.currentNode;
  hide(els.speedDecision);

  if (result.routeAction === "wait_until_ready") {
    await playWaitLeg(node.merchant.name, result.waitedSeconds);
    await flashFeedback(result);
    await playTravelLeg({
      targetType: "customer",
      targetLabel: node.carriedDestination,
      title: `送手上的单 · ${node.carriedDestination}`,
      milliseconds: 620,
      speedId: result.speedId
    });
    if (result.incident) await flashIncidentConsequences();
    await world.playDelivery();
  } else {
    await playTravelLeg({
      targetType: "customer",
      targetLabel: node.carriedDestination,
      title: `先送手上的单 · ${node.carriedDestination}`,
      milliseconds: 640,
      speedId: result.speedId
    });
    if (result.incident) await flashIncidentConsequences();
    await world.playDelivery();
    await playTravelLeg({
      targetType: "merchant",
      targetLabel: node.merchant.name,
      title: `返回${node.merchant.name}取餐`,
      milliseconds: 500,
      speedId: result.speedId
    });
    if (result.feedbackOutcome === "still_not_ready_on_return") {
      await playWaitLeg(node.merchant.name, result.waitedSeconds, {
        title: "回来时餐还没好",
        detail: "留在店里继续等到取餐"
      });
    }
    await flashFeedback(result);
  }

  await playTravelLeg({
    targetType: "customer",
    targetLabel: node.newDestination,
    title: `送新取的单 · ${node.newDestination}`,
    milliseconds: 600,
    speedId: result.speedId
  });
  await world.playDelivery();
}

function outcomeText(onTime) { return onTime ? "准时" : "超时"; }

function renderResult(result) {
  const bothOnTime = result.carriedOnTime && result.newOnTime;
  const latePenaltyPerOrder = Sim.FULL_INCOME - Sim.LATE_INCOME;
  const lateCount = Number(!result.carriedOnTime) + Number(!result.newOnTime);
  const lateLoss = lateCount * latePenaltyPerOrder;
  els.resultTitle.textContent = bothOnTime ? "两单都准时送达" : "订单送达，但有超时";
  els.carriedResult.textContent = outcomeText(result.carriedOnTime);
  els.newResult.textContent = outcomeText(result.newOnTime);
  els.carriedLateLoss.textContent = `比准时少赚 ¥${latePenaltyPerOrder}`;
  els.newLateLoss.textContent = `比准时少赚 ¥${latePenaltyPerOrder}`;
  els.carriedLateLoss.classList.toggle("is-hidden", result.carriedOnTime);
  els.newLateLoss.classList.toggle("is-hidden", result.newOnTime);
  els.incidentResult.textContent = result.incident ? "出了事故" : "未出事故";
  els.incomeResult.textContent = `+¥${result.income}`;
  els.carriedResult.classList.toggle("is-bad", !result.carriedOnTime);
  els.newResult.classList.toggle("is-bad", !result.newOnTime);
  els.incidentResult.classList.toggle("is-bad", result.incident);
  if (result.incident) {
    els.incidentDelayResult.textContent = "事故误时";
    els.incidentCapacityResult.textContent = `接单余力 −${result.incidentCapacityCost}`;
    show(els.incidentConsequences);
  } else {
    hide(els.incidentConsequences);
  }
  els.resultCard.classList.toggle("has-problem", !bothOnTime || result.incident);
  show(els.resultCard);
  replayAnimation(els.resultCard, "is-arriving");
  renderHud();
  showReward(result.income, bothOnTime ? "两单送达" : "本趟收入", lateLoss);
  updateDebug();
}

async function submitSpeed() {
  if (!selectedSpeed || !messageGateReady || interactionLocked) return;
  interactionLocked = true;
  messageWindowToken += 1;
  hideCustomerMessage();
  const snapshotBefore = Sim.snapshot(game);
  const result = Sim.resolveChoice(game, selectedSpeed);
  world.setSpeedTone(selectedSpeed);
  await animateResolution(result, snapshotBefore);
  Sim.showResult(game);
  renderResult(result);
  if (trainingActive && snapshotBefore.nodeIndex === 0) {
    await showCoach(
      els.resultGrid,
      "送餐结果",
      "这里会写出本次送餐是否准时，有无事故。"
    );
  }
  interactionLocked = false;
}

async function showBreak() {
  hidePlaySurfaces();
  els.objectiveLabel.textContent = "这家店跑完了";
  const breakSnapshot = Sim.snapshot(game);
  const settlement = breakSnapshot.lastBonusSettlement;
  els.breakBonus.classList.toggle("is-missed", !settlement.awarded);
  if (settlement.awarded) {
    els.breakBonusTitle.textContent = `接到了 · +¥${settlement.income}`;
    els.breakBonusText.textContent = settlement.capacityAtSettlement >= 2
      ? "还剩两格以上余力，这单稳稳接到了。"
      : "还剩一格余力，这次刚好接到了。";
  } else {
    els.breakBonusTitle.textContent = "这次没接到";
    els.breakBonusText.textContent = settlement.capacityAtSettlement === 1
      ? "只剩一格余力，这次没有排到最后一单。"
      : "余力已经用完，这一段没有最后加单。";
  }
  const nextMerchant = breakSnapshot.currentNode?.merchant?.name;
  els.breakTitle.textContent = trainingActive
    ? "看看有没有接到最后一单"
    : `接下来前往${nextMerchant || "下一家店"}`;
  els.breakNextText.textContent = trainingActive
    ? "试跑到这里。接下来正式开工，从第一家店重新跑。"
    : "到了下一家店，接单余力会恢复，骑手笔记也会清空。";
  els.breakButton.textContent = trainingActive
    ? "试跑结束，开始正式跑单"
    : `前往${nextMerchant || "下一家店"}`;
  show(els.breakModal);
  renderHud();
  if (trainingActive) {
    interactionLocked = true;
    await showCoach(
      els.breakBonus,
      "还有余力，平台才可能再派一单",
      "余力为2：可以再接一单；余力为1，有可能再接一单；余力为0，无法接单。",
      "知道了，开始跑单"
    );
    interactionLocked = false;
  }
}

function sanitizeFilePart(value) {
  return String(value || "missing").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "missing";
}

function assembleExportPayload() {
  const payload = Sim.exportData(game);
  payload.configuration.buildId = activeBuildId;
  payload.configuration.historyPresentationVersion = HistoryPresentation.VERSION;
  payload.visualRuntime = world.getVisualRuntime();
  payload.runtimeTelemetry = experimentTelemetry.snapshot(payload.visualRuntime);
  payload.integrityAudit = Telemetry.auditExperimentIntegrity({
    exportedData: payload,
    runtimeTelemetry: payload.runtimeTelemetry,
    expectedTrialCount
  });
  return payload;
}

function prepareExportArtifact() {
  try {
    const probePayload = assembleExportPayload();
    JSON.stringify(probePayload);
    experimentTelemetry.markJsonGenerated(0);
    const payload = assembleExportPayload();
    let json = "";
    let jsonBytes = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      payload.runtimeTelemetry.export.jsonBytes = jsonBytes;
      json = `${JSON.stringify(payload, null, 2)}\n`;
      const measuredBytes = new TextEncoder().encode(json).byteLength;
      if (measuredBytes === jsonBytes) break;
      jsonBytes = measuredBytes;
    }
    payload.runtimeTelemetry.export.jsonBytes = jsonBytes;
    json = `${JSON.stringify(payload, null, 2)}\n`;
    experimentTelemetry.markJsonGenerated(new TextEncoder().encode(json).byteLength);
    preparedExportArtifact = { payload, json };
    els.summaryModal.dataset.integrityStatus = payload.integrityAudit.overallPass ? "pass" : "fail";
    els.summaryModal.dataset.integrityFailures = payload.integrityAudit.failures.join(",");
    return preparedExportArtifact;
  } catch (error) {
    experimentTelemetry.markJsonGenerationFailed(error);
    preparedExportArtifact = null;
    els.summaryModal.dataset.integrityStatus = "json-error";
    els.summaryModal.dataset.integrityFailures = "json_serialization_succeeded";
    console.error("Failed to prepare experiment JSON", error);
    return null;
  }
}

window.__pomdpIntegrityReport = () => {
  if (preparedExportArtifact?.payload?.integrityAudit) {
    return JSON.parse(JSON.stringify(preparedExportArtifact.payload.integrityAudit));
  }
  return assembleExportPayload().integrityAudit;
};

function showSummary() {
  hidePlaySurfaces();
  hide(els.hud);
  const snapshot = Sim.snapshot(game);
  els.summaryGrid.replaceChildren(...[
    ["今天赚到", `¥${snapshot.income}`],
    ["准时送达", `${snapshot.onTime}单`],
    ["超时", `${snapshot.late}单`],
    ["最后加单", `${snapshot.bonusAwardedCount}单`]
  ].map(([label, value]) => {
    const article = document.createElement("article");
    article.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    return article;
  }));
  show(els.summaryModal);
  experimentTelemetry.markCompleted(snapshot);
  prepareExportArtifact();
  updateDebug();
}

function continueGame() {
  if (interactionLocked) return;
  hide(els.resultCard);
  hide(els.rewardBurst);
  const snapshot = Sim.continueAfterResult(game);
  renderHud(snapshot);
  if (snapshot.phase === "approaching_store") approachStore();
  else if (snapshot.phase === "wave_break") showBreak();
  else if (snapshot.phase === "summary") showSummary();
}

async function startTrainingShift() {
  hide(els.briefingModal);
  trainingActive = true;
  trainingStep = 0;
  notebookTutorialShown = false;
  game = Sim.createGame(seed ^ 0x7a11, {
    mode: "preview",
    nodesPerWave: 2,
    messageScheduleMode: customerMessagesUEnabled ? "tutorial" : undefined
  });
  show(els.hud);
  Sim.start(game);
  renderHud();
  interactionLocked = true;
  await showCoach(
    els.objectiveChip,
    "左上角：当前店铺和跑单进度",
    "正式开工后，每家店需要连续跑六组，共12份订单。"
  );
  await showCoach(
    els.capacityStatus,
    "右上角：接单余力",
    "每跑完一组单，余力-2；事故发生会让送餐延时，并额外扣除余力；保留余力可以让你接到更多订单。"
  );
  await showCoach(
    els.incomeStatus,
    "右上角：今日收入",
    "准时送达的收入更多，订单迟到的收入较少；试跑阶段的收入不计入正式体验。",
    "明白了，开始试跑"
  );
  interactionLocked = false;
  approachStore();
}

async function startFormalSession() {
  interactionLocked = true;
  hide(els.breakModal);
  hide(els.tutorialCoach);
  hide(els.notebookTutorialModal);
  clearTutorialFocus();
  trainingActive = false;
  game = Sim.createGame(seed, formalGameOptions);
  lastCapacity = null;
  lastIncome = 0;
  Sim.start(game);
  renderHud();
  els.feedbackCard.dataset.tone = "good";
  els.feedbackIcon.textContent = "✓";
  els.feedbackKicker.textContent = "试跑结束";
  setOptionalText(els.feedbackTitle, "正式开工！");
  setOptionalText(
    els.feedbackText,
    "骑手笔记只显示最近两次取餐情况；到了下一家店，会重新开始记录。"
      + (customerMessagesUEnabled ? " 顾客消息有时会出现，但不会改变订单的实际剩余时间。" : "")
  );
  show(els.feedbackCard);
  await delay(fastMotion ? 250 : 1100);
  hide(els.feedbackCard);
  interactionLocked = false;
  approachStore();
}

els.modeDescription.remove();

els.startButton.addEventListener("click", () => {
  prewarmCustomerMessageTone();
  world.setCruising(false);
  replayAnimation(els.startButton, "is-launching");
  hide(els.startScreen);
  renderBriefing();
  show(els.briefingModal);
});

els.briefingNext.addEventListener("click", startTrainingShift);
els.coachNext.addEventListener("click", closeCoach);
els.notebookTutorialNext.addEventListener("click", closeNotebookTutorial);

els.routeDecision.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (interactionLocked) return;
    interactionLocked = true;
    const action = button.dataset.route;
    const snapshotBefore = Sim.snapshot(game);
    button.classList.add("is-committed");
    els.routeDecision.classList.add("is-resolving");
    await delay(duration(220));
    Sim.chooseRoute(game, action);
    hide(els.routeDecision);
    hide(els.riderNotebook);
    renderSpeedDecision(action);
    if (trainingActive && snapshotBefore.nodeIndex === 0) {
      await showCoach(
        els.gearLever,
        "路线定好后，选整趟骑行档位",
        "这一趟全程都会按照你选择的速度骑，骑得越快越省时，但风险越高。",
        "知道了，我来选档"
      );
    }
    interactionLocked = false;
    void runCustomerMessageWindow();
    updateDebug();
  });
});

els.speedDecision.querySelectorAll("[data-speed]").forEach((button) => {
  button.addEventListener("click", () => {
    if (interactionLocked || (customerMessagesUEnabled && !messageGateReady)) return;
    selectedSpeed = button.dataset.speed;
    els.speedDecision.querySelectorAll("[data-speed]").forEach((option) => {
      option.setAttribute("aria-checked", String(option === button));
    });
    updateGoButtonState();
    replayAnimation(button, "is-shifting");
  });
});

els.goButton.addEventListener("click", submitSpeed);
els.continueButton.addEventListener("click", continueGame);
els.breakButton.addEventListener("click", () => {
  if (interactionLocked) return;
  if (trainingActive) {
    startFormalSession();
    return;
  }
  hide(els.breakModal);
  Sim.continueFromBreak(game);
  approachStore();
});
els.restartButton.addEventListener("click", () => location.reload());
els.downloadButton.addEventListener("click", () => {
  const filename = `${sanitizeFilePart(participantId)}_${seed}_${sanitizeFilePart(activeBuildId)}.json`;
  experimentTelemetry.markDownloadAttempt(filename);
  const artifact = prepareExportArtifact();
  if (!artifact) return;
  const blob = new Blob([artifact.json], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
});

if (debug) {
  window.__pomdpInstrumentationTest = Object.freeze({
    async startFormalUiTest() {
      trainingActive = false;
      interactionLocked = false;
      [els.startScreen, els.briefingModal, els.tutorialCoach, els.notebookTutorialModal, els.breakModal, els.summaryModal].forEach(hide);
      hidePlaySurfaces();
      game = Sim.createGame(seed, formalGameOptions);
      lastCapacity = null;
      lastIncome = 0;
      Sim.start(game);
      show(els.hud);
      renderHud();
      await approachStore();
      return Sim.snapshot(game);
    },
    completeFormalSession() {
      trainingActive = false;
      interactionLocked = false;
      game = Sim.createGame(seed, formalGameOptions);
      Sim.start(game);
      while (game.phase !== "summary") {
        if (game.phase === "approaching_store") Sim.arriveAtStore(game);
        else if (game.phase === "route_decision") {
          Sim.chooseRoute(game, game.nodeIndex % 2 ? "wait_until_ready" : "deliver_carried_first");
        } else if (game.phase === "speed_decision") {
          if (customerMessagesUEnabled) {
            const messagePlan = Sim.customerMessagePlanFor(game);
            if (messagePlan.messageScheduled) Sim.markCustomerMessageExposed(game, { soundPlayed: false });
            Sim.markCustomerMessageGateReady(game, {
              uiPerformance: {
                measurement: "visible_request_animation_frame_intervals",
                messageScheduled: messagePlan.messageScheduled,
                plannedWindowDurationMs: Sim.CUSTOMER_MESSAGE_GATE_MS,
                windowDurationMs: Sim.CUSTOMER_MESSAGE_GATE_MS,
                windowTimerOverrunMs: 0,
                plannedMessageRevealDelayMs: messagePlan.scheduledDelayMs,
                messageRevealLatencyMs: messagePlan.scheduledDelayMs,
                messageRevealTimerOverrunMs: messagePlan.messageScheduled ? 0 : null,
                longFramesBeforeReveal: messagePlan.messageScheduled ? 0 : null,
                longFramesImmediatelyAfterReveal: messagePlan.messageScheduled ? 0 : null,
                longFramesAfterRevealUntilGate: messagePlan.messageScheduled ? 0 : null,
                longFramesDuringWindow: 0,
                instrumentationBypass: true
              }
            });
          }
          Sim.resolveChoice(game, game.nodeIndex % 3 ? "normal" : "rush");
          Sim.showResult(game);
        } else if (game.phase === "result") Sim.continueAfterResult(game);
        else if (game.phase === "wave_break") Sim.continueFromBreak(game);
        else throw new Error(`unexpected debug completion phase ${game.phase}`);
      }
      showSummary();
      return {
        snapshot: Sim.snapshot(game),
        integrityAudit: window.__pomdpIntegrityReport()
      };
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (!els.routeDecision.classList.contains("is-hidden") && ["1", "2"].includes(event.key)) {
    els.routeDecision.querySelectorAll("[data-route]")[Number(event.key) - 1]?.click();
  } else if (!els.speedDecision.classList.contains("is-hidden") && ["1", "2", "3"].includes(event.key)) {
    els.speedDecision.querySelectorAll("[data-speed]")[Number(event.key) - 1]?.click();
  } else if (event.key === "Enter" && !els.goButton.disabled && !els.speedDecision.classList.contains("is-hidden")) {
    els.goButton.click();
  } else if (event.key === "Enter" && !els.resultCard.classList.contains("is-hidden")) {
    els.continueButton.click();
  }
});

window.addEventListener("beforeunload", () => world.destroy());
window.__pomdpMessageRuntime = () => ({
  copyVersion: customerMessageCopyVersion,
  gateDurationMs: Sim.CUSTOMER_MESSAGE_GATE_MS,
  delayRangeMs: { ...Sim.CUSTOMER_MESSAGE_DELAY_RANGE_MS },
  audioPrewarmAttempted: messageAudioPrewarmAttempted,
  audioContextCreated: Boolean(messageAudioContext),
  audioContextState: messageAudioContext?.state || "unavailable",
  lastUiPerformance: lastMessageUiPerformance ? { ...lastMessageUiPerformance } : null
});
world.setCruising(true);
renderHud();
updateDebug();
