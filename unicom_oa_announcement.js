// ==UserScript==
// @name         【联通】沃通知已阅脚本
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  自动循环点击指定按钮
// @author       float0108 & gemini Pro
// @match        https://wonotice.chinaunicom.cn/*
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @grant        none
// @license      GNU/GPLv3
// ==/UserScript==

(function () {
  "use strict";
  const clickInterval = 200;

  // 检查并点击按钮的逻辑
  const autoClick = setInterval(() => {
    const selector = "#handle > div.woN_qicaobtm > div > button:nth-child(4)";
    const targetButton = document.querySelector(selector);

    if (targetButton) {
      targetButton.click();
      console.log("已触发点击动作");
      // 如果只需要点击一次，可以取消注释下面这行
      // clearInterval(autoClick);
    }
  }, clickInterval);
})();
