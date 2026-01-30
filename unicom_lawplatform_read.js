// ==UserScript==
// @name         【联通】法律公文阅读
// @namespace    http://tampermonkey.net/
// @version      2025-12-26
// @description  自动点击指定元素，完成后自动关闭标签页
// @author       float0108 & gemini Pro
// @match        https://lawplatform.chinaunicom.cn/*
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        window.close
// @license      GNU/GPLv3
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // 1. 常量与配置初始化
  const DEFAULT_CONFIG = {
    INITIAL_DELAY: 500,
    CLOSE_DELAY: 300,
    TARGET_XPATH:
      '//*[@id="ant-layout-content"]/div[2]/div[1]/div/div[4]/div[1]',
    SUCCESS_COLOR: "rgb(194, 0, 0)",
    CHECK_INTERVAL: 300,
    TIMEOUT: 20000,
  };

  const CONFIG = {
    INITIAL_DELAY: GM_getValue(
      "INITIAL_DELAY_MS",
      DEFAULT_CONFIG.INITIAL_DELAY,
    ),
    CLOSE_DELAY: GM_getValue("CLOSE_DELAY_MS", DEFAULT_CONFIG.CLOSE_DELAY),
    TARGET_XPATH: GM_getValue("TARGET_XPATH", DEFAULT_CONFIG.TARGET_XPATH),
    SUCCESS_COLOR: GM_getValue("SUCCESS_COLOR", DEFAULT_CONFIG.SUCCESS_COLOR),
    CHECK_INTERVAL: GM_getValue(
      "CHECK_INTERVAL_MS",
      DEFAULT_CONFIG.CHECK_INTERVAL,
    ),
    TIMEOUT: GM_getValue("TIMEOUT_MS", DEFAULT_CONFIG.TIMEOUT),
  };

  // 2. 注入全局样式
  GM_addStyle(`
        .custom-toast { position: fixed; top: 30px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 8px; color: white; z-index: 100000; transition: all 0.3s ease; font-size: 14px; box-shadow: 0 3px 10px rgba(0,0,0,0.3); backdrop-filter: blur(4px); }
        .custom-dialog-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; align-items: center; justify-content: center; }
        .custom-dialog { background: white; padding: 25px; border-radius: 10px; width: 380px; font-family: sans-serif; box-shadow: 0 5px 15px rgba(0,0,0,0.3); max-height: 90vh; overflow-y: auto; }
        .custom-dialog h3 { margin: 0 0 15px 0; text-align: center; color: #333; }
        .custom-dialog label { display: block; font-size: 12px; color: #666; margin-top: 10px; }
        .custom-dialog input { width: 100%; padding: 8px; margin: 5px 0 15px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .btn-group { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
        .btn-group button { padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; }
        #cfgSave { background: #4CAF50; color: white; }
        #cfgCancel { background: #eee; color: #333; }
        #cfgReset { background: #ff9800; color: white; }
        .color-preview { display: inline-block; width: 20px; height: 20px; border-radius: 3px; vertical-align: middle; margin-left: 5px; border: 1px solid #ddd; }
    `);

  // 3. 工具函数
  function showToast(msg, type = "info") {
    const toast = document.createElement("div");
    const colors = {
      success: "#388e3c",
      error: "#d32f2f",
      warning: "#fbc02d",
      info: "#333",
    };
    toast.className = "custom-toast";
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.top = "10px";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function getElement(xpath) {
    try {
      return document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
    } catch (e) {
      console.error("XPath 语法错误:", e);
      return null;
    }
  }

  function isColorMatch(computedColor, targetColor) {
    const temp = document.createElement("div");
    temp.style.color = targetColor;
    document.body.appendChild(temp);
    const normalizedTarget = window.getComputedStyle(temp).color;
    document.body.removeChild(temp);
    return computedColor === normalizedTarget;
  }

  function validateNumber(value, min, max, defaultValue) {
    const num = parseInt(value);
    if (isNaN(num) || num < min || num > max) return defaultValue;
    return num;
  }

  // 4. 菜单与弹窗逻辑
  function openConfigDialog() {
    if (document.querySelector(".custom-dialog-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "custom-dialog-overlay";
    overlay.innerHTML = `
            <div class="custom-dialog">
                <h3>⚙️ 脚本配置</h3>
                <label>初始延迟 (ms):</label>
                <input type="number" id="initDelay" min="0" max="5000">
                <label>关闭延迟 (ms):</label>
                <input type="number" id="closeDelay" min="0" max="5000">
                <label>检查间隔 (ms):</label>
                <input type="number" id="checkInterval" min="100" max="5000">
                <label>超时时间 (ms):</label>
                <input type="number" id="timeout" min="1000" max="60000">
                <label>目标 XPath:</label>
                <input type="text" id="targetXPath">
                <label>成功颜色 (rgb/hex):</label>
                <input type="text" id="successColor">
                <span class="color-preview"></span>
                <div class="btn-group">
                    <button id="cfgReset">重置</button>
                    <button id="cfgCancel">取消</button>
                    <button id="cfgSave">保存</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    // 修复显示问题：在 DOM 插入后通过 value 属性显式赋值
    document.getElementById("initDelay").value = CONFIG.INITIAL_DELAY;
    document.getElementById("closeDelay").value = CONFIG.CLOSE_DELAY;
    document.getElementById("checkInterval").value = CONFIG.CHECK_INTERVAL;
    document.getElementById("timeout").value = CONFIG.TIMEOUT;
    document.getElementById("targetXPath").value = CONFIG.TARGET_XPATH;
    document.getElementById("successColor").value = CONFIG.SUCCESS_COLOR;

    const colorPreview = overlay.querySelector(".color-preview");
    colorPreview.style.backgroundColor = CONFIG.SUCCESS_COLOR;

    // 绑定事件
    const colorInput = document.getElementById("successColor");
    colorInput.addEventListener("input", () => {
      colorPreview.style.backgroundColor = colorInput.value;
    });

    document.getElementById("cfgSave").onclick = () => {
      const newConfigs = {
        INITIAL_DELAY_MS: validateNumber(
          document.getElementById("initDelay").value,
          0,
          5000,
          DEFAULT_CONFIG.INITIAL_DELAY,
        ),
        CLOSE_DELAY_MS: validateNumber(
          document.getElementById("closeDelay").value,
          0,
          5000,
          DEFAULT_CONFIG.CLOSE_DELAY,
        ),
        CHECK_INTERVAL_MS: validateNumber(
          document.getElementById("checkInterval").value,
          100,
          5000,
          DEFAULT_CONFIG.CHECK_INTERVAL,
        ),
        TIMEOUT_MS: validateNumber(
          document.getElementById("timeout").value,
          1000,
          60000,
          DEFAULT_CONFIG.TIMEOUT,
        ),
        TARGET_XPATH:
          document.getElementById("targetXPath").value.trim() ||
          DEFAULT_CONFIG.TARGET_XPATH,
        SUCCESS_COLOR:
          document.getElementById("successColor").value.trim() ||
          DEFAULT_CONFIG.SUCCESS_COLOR,
      };

      Object.entries(newConfigs).forEach(([key, val]) => GM_setValue(key, val));
      showToast("✅ 配置已保存，正在刷新...", "success");
      setTimeout(() => location.reload(), 800);
    };

    document.getElementById("cfgCancel").onclick = () => overlay.remove();
    document.getElementById("cfgReset").onclick = () => {
      if (confirm("确定要重置所有配置吗？")) {
        [
          "INITIAL_DELAY_MS",
          "CLOSE_DELAY_MS",
          "TARGET_XPATH",
          "SUCCESS_COLOR",
          "CHECK_INTERVAL_MS",
          "TIMEOUT_MS",
        ].forEach((k) => GM_deleteValue(k));
        location.reload();
      }
    };
  }

  // 5. 核心任务逻辑
  function mainTask() {
    const isTargetPage = window.location.href.includes("review");
    const isIgnorePage =
      window.location.href.includes("publicityPage/index") ||
      window.location.href.includes("more/");

    if (!isTargetPage || isIgnorePage) {
      console.log("非阅读目标页面，自动脚本跳过。");
      return;
    }

    console.log(`脚本将在 ${CONFIG.INITIAL_DELAY}ms 后运行任务...`);

    setTimeout(() => {
      const startTime = Date.now();
      let clicked = false;

      const timer = setInterval(() => {
        const el = getElement(CONFIG.TARGET_XPATH);

        if (el) {
          const computedStyle = window.getComputedStyle(el);
          const currentBg = computedStyle.backgroundColor;
          const isRed = isColorMatch(currentBg, CONFIG.SUCCESS_COLOR);

          if (isRed) {
            showToast("✨ 该公文已阅读", "warning");
            clearInterval(timer);
            setTimeout(() => window.close(), CONFIG.CLOSE_DELAY);
          } else if (!clicked) {
            el.click();
            clicked = true;
            // 点击后稍作等待确认颜色变化
            setTimeout(() => {
              const newColor = window.getComputedStyle(el).backgroundColor;
              if (isColorMatch(newColor, CONFIG.SUCCESS_COLOR)) {
                showToast("🎉 自动阅读完成！", "success");
                clearInterval(timer);
                setTimeout(() => window.close(), CONFIG.CLOSE_DELAY);
              } else {
                clicked = false; // 如果没变红，下一轮继续尝试
              }
            }, CONFIG.CHECK_INTERVAL);
          }
        }

        if (Date.now() - startTime > CONFIG.TIMEOUT) {
          clearInterval(timer);
          showToast("❌ 自动点击超时，请手动处理", "error");
        }
      }, CONFIG.CHECK_INTERVAL * 2);
    }, CONFIG.INITIAL_DELAY);
  }

  // 6. 初始化入口
  function init() {
    // 第一步：注册菜单（不受页面判断影响）
    GM_registerMenuCommand("⚙️ 脚本配置", openConfigDialog);

    // 第二步：执行主任务（内部包含页面判断）
    mainTask();
  }

  // 启动
  init();
})();
