(function attachPomdpHistoryPresentation(root, factory) {
  const mainline = typeof module === "object" && module.exports
    ? require("./pomdp-v2-mainline.js")
    : root.PomdpV2Mainline;
  const api = factory(mainline);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PomdpHistoryPresentation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPomdpHistoryPresentation(Mainline) {
  "use strict";

  if (!Mainline?.protocol) throw new Error("POMDP mainline manifest must load before history presentation");
  function requestedMechanismVariant() {
    const environmentValue = typeof process !== "undefined" && process?.env
      ? process.env.POMDP_MECHANISM_VARIANT
      : null;
    let queryValue = null;
    if (typeof location !== "undefined" && typeof location.search === "string") {
      queryValue = new URLSearchParams(location.search).get("mechanism");
    }
    const normalized = String(environmentValue || queryValue || "")
      .trim()
      .toLowerCase()
      .replace(/[.-]+/g, "_");
    if (["k_u_unified_v1_3_pomdp_signal", "k_u_unified_v1_3", "k_u_v1_3", "pomdp_signal", "pomdp_signal_v1"].includes(normalized)) return "k_u_unified_v1_3_pomdp_signal";
    if (["k_u_unified_v1_2", "k_u_v1_2", "u_stronger", "stronger_u"].includes(normalized)) return "k_u_unified_v1_2";
    if (["k_u_unified_v1", "k_u", "u_unified", "unified"].includes(normalized)) return "k_u_unified_v1";
    if (["k_calibrated_v1", "candidate", "k_prior_calibration"].includes(normalized)) return "k_calibrated_v1";
    return "frozen_v2_0";
  }
  const MECHANISM_VARIANT = requestedMechanismVariant();

  const calibratedHistory = [
    "k_calibrated_v1",
    "k_u_unified_v1",
    "k_u_unified_v1_2",
    "k_u_unified_v1_3_pomdp_signal"
  ].includes(MECHANISM_VARIANT);
  const candidateReturnPresentation = calibratedHistory
    ? Object.freeze({
      visualCode: "return_observed",
      family: "emotion",
      route: "return",
      expression: "patient",
      accessibleLabel: "送完回来时餐已经做好",
      text: "送完回来时，餐已经做好"
    })
    : Object.freeze({
      visualCode: "return_relieved",
      family: "emotion",
      route: "return",
      expression: "relieved",
      accessibleLabel: "送完回来直接取到餐",
      text: "送完回来，直接取到餐了"
    });

  const PRESENTATIONS = Object.freeze({
    ready_after_short_wait: Object.freeze({
      visualCode: "wait_relieved",
      family: "emotion",
      route: "wait",
      expression: "relieved",
      accessibleLabel: "没等多久就取到餐",
      text: "没等多久，取到餐了"
    }),
    ready_after_medium_wait: Object.freeze({
      visualCode: "wait_patient",
      family: "emotion",
      route: "wait",
      expression: "patient",
      accessibleLabel: "等了一阵后取到餐",
      text: "等了一阵，取到餐了"
    }),
    ready_after_long_wait: Object.freeze({
      visualCode: "wait_weary",
      family: "emotion",
      route: "wait",
      expression: "weary",
      accessibleLabel: "等了很久才取到餐",
      text: "等了很久，才取到餐"
    }),
    ready_on_return: candidateReturnPresentation,
    still_not_ready_on_return: Object.freeze({
      visualCode: "return_weary",
      family: "emotion",
      route: "return",
      expression: "weary",
      accessibleLabel: "回来时餐还没好，继续等后取到餐",
      text: "回来时还没好，又等了一会才取到餐"
    })
  });

  const FALLBACK = Object.freeze({
    visualCode: "fact_recorded",
    family: "emotion",
    route: "fact",
    expression: "patient",
    accessibleLabel: "取餐事实已记录",
    text: "这次取餐已经记下"
  });

  function getPresentation(feedbackOutcome) {
    return PRESENTATIONS[feedbackOutcome] || FALLBACK;
  }

  return Object.freeze({
    VERSION: calibratedHistory
      ? "rider-history-visual-1.2-route-conditioned-candidate"
      : Mainline.protocol.historyPresentationVersion,
    MECHANISM_VARIANT,
    PRESENTATIONS,
    FALLBACK,
    getPresentation
  });
});
