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
    ready_on_return: Object.freeze({
      visualCode: "return_relieved",
      family: "emotion",
      route: "return",
      expression: "relieved",
      accessibleLabel: "送完回来直接取到餐",
      text: "送完回来，直接取到餐了"
    }),
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
    VERSION: Mainline.protocol.historyPresentationVersion,
    PRESENTATIONS,
    FALLBACK,
    getPresentation
  });
});
