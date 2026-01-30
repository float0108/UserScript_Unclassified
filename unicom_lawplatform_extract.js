// ==UserScript==
// @name         【联通】法律网站提取元素（手动版）
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  提取高亮所有未读文章，如果均已读则触发翻页。优化菜单注册与配置显示。
// @author       float0108 & gemini Pro
// @match        https://lawplatform.chinaunicom.cn/*
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @license      GNU/GPLv3
// ==/UserScript==

(function () {
  "use strict";

  // 1. 常量与默认配置
  const DEFAULT_CONFIG = {
    DELAYS: {
      AFTER_CLICK: 500,
      AFTER_PAGE_TURN: 2000,
      INITIAL_SCAN: 1500,
      AFTER_MOUSEUP: 800,
    },
    SELECTORS: {
      UNREAD_ITEM: ".publicity-more-right-cart-list-header",
      NEXT_PAGE: ".ant-pagination-next:not(.ant-pagination-disabled)",
    },
    URL_PATTERNS: ["/sendlog", "/more"], // 改为字符串便于存储和判断
  };

  // 2. 配置加载 (保持 CONFIG 为最新引用)
  let CONFIG = GM_getValue("config_v4", DEFAULT_CONFIG);

  const STATE = {
    isProcessing: false,
    currentHighlight: null,
    cache: null,
    cacheTimestamp: 0,
    CACHE_TTL: 300,
  };

  // 3. 样式注入
  GM_addStyle(`
        #manualClickBtn {
            position: fixed; top: 30px; right: 30px; width: 70px; height: 70px;
            border-radius: 50%; color: white; border: none; cursor: pointer;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3); font-size: 13px; font-weight: bold;
            display: flex; align-items: center; justify-content: center;
            flex-direction: column; z-index: 2147483647;
            background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
            transition: transform 0.2s, background 0.3s;
            line-height: 1.2; text-align: center;
        }
        #manualClickBtn:hover { transform: scale(1.1); }
        #manualClickBtn:disabled { background: #bbb !important; cursor: not-allowed; }
        #manualClickBtn small { font-size: 10px; opacity: 0.9; margin-top: 2px; }

        .manual-highlight { outline: 4px solid #FF9800 !important; outline-offset: 2px; background: rgba(255, 152, 0, 0.1) !important; position: relative; z-index: 1000 !important; }
        .manual-highlight::after { content: "NEXT"; position: absolute; top: -20px; right: 0; background: #FF9800; color: white; padding: 2px 6px; font-size: 10px; border-radius: 4px; }

        .manual-clicked { opacity: 0.5; border: 1px dashed #4CAF50 !important; }

        /* 设置弹窗样式 */
        .cfg-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
        .cfg-dialog { background: white; padding: 25px; border-radius: 10px; width: 400px; max-height: 90vh; overflow-y: auto; font-family: sans-serif; }
        .cfg-dialog h3 { margin-top: 0; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
        .cfg-dialog label { display: block; font-size: 12px; color: #666; margin-top: 10px; }
        .cfg-dialog input { width: 100%; padding: 8px; margin: 5px 0 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .cfg-btn-group { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        .cfg-btn-group button { padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; }
        #cfgSave { background: #4CAF50; color: white; }
        #cfgCancel { background: #eee; }
        #cfgReset { background: #ff9800; color: white; }
    `);

  // 4. 工具函数
  function isTargetPage() {
    return CONFIG.URL_PATTERNS.some((p) => window.location.href.includes(p));
  }

  function getUnreadElements() {
    const now = Date.now();
    if (STATE.cache && now - STATE.cacheTimestamp < STATE.CACHE_TTL)
      return STATE.cache;

    const items = document.querySelectorAll(CONFIG.SELECTORS.UNREAD_ITEM);
    const result = Array.from(items).filter((el) => {
      return (
        !el.innerText.includes("已读") &&
        !el.classList.contains("manual-clicked")
      );
    });

    STATE.cache = result;
    STATE.cacheTimestamp = now;
    return result;
  }

  // 5. 设置面板逻辑
  function openSettings() {
    if (document.querySelector(".cfg-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "cfg-overlay";
    overlay.innerHTML = `
            <div class="cfg-dialog">
                <h3>⚙️ 脚本配置</h3>
                <label>点击后延迟 (ms):</label>
                <input type="number" id="inp-after-click">
                <label>翻页后延迟 (ms):</label>
                <input type="number" id="inp-after-page-turn">
                <label>未读项选择器 (CSS):</label>
                <input type="text" id="inp-unread-selector">
                <label>下一页选择器 (CSS):</label>
                <input type="text" id="inp-next-selector">

                <div class="cfg-btn-group">
                    <button id="cfgReset">恢复默认</button>
                    <button id="cfgCancel">取消</button>
                    <button id="cfgSave">保存设置</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    // 修复 XPath/Selector 显示问题：在 DOM 插入后赋值
    document.getElementById("inp-after-click").value =
      CONFIG.DELAYS.AFTER_CLICK;
    document.getElementById("inp-after-page-turn").value =
      CONFIG.DELAYS.AFTER_PAGE_TURN;
    document.getElementById("inp-unread-selector").value =
      CONFIG.SELECTORS.UNREAD_ITEM;
    document.getElementById("inp-next-selector").value =
      CONFIG.SELECTORS.NEXT_PAGE;

    // 事件处理
    document.getElementById("cfgSave").onclick = () => {
      const newCfg = JSON.parse(JSON.stringify(CONFIG));
      newCfg.DELAYS.AFTER_CLICK = parseInt(
        document.getElementById("inp-after-click").value,
      );
      newCfg.DELAYS.AFTER_PAGE_TURN = parseInt(
        document.getElementById("inp-after-page-turn").value,
      );
      newCfg.SELECTORS.UNREAD_ITEM = document
        .getElementById("inp-unread-selector")
        .value.trim();
      newCfg.SELECTORS.NEXT_PAGE = document
        .getElementById("inp-next-selector")
        .value.trim();

      GM_setValue("config_v4", newCfg);
      location.reload();
    };

    document.getElementById("cfgCancel").onclick = () => overlay.remove();
    document.getElementById("cfgReset").onclick = () => {
      if (confirm("确定重置吗？")) {
        GM_deleteValue("config_v4");
        location.reload();
      }
    };
  }

  // 6. UI 更新与动作
  function updateUI() {
    const btn = document.getElementById("manualClickBtn");
    if (!btn) return;

    const unread = getUnreadElements();
    const nextBtn = document.querySelector(CONFIG.SELECTORS.NEXT_PAGE);

    // 清除旧高亮
    if (STATE.currentHighlight)
      STATE.currentHighlight.classList.remove("manual-highlight");

    if (unread.length > 0) {
      btn.disabled = false;
      btn.style.background =
        "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)";
      btn.innerHTML = `点击<small>${unread.length}条待办</small>`;
      unread[0].classList.add("manual-highlight");
      STATE.currentHighlight = unread[0];
    } else if (nextBtn) {
      btn.disabled = false;
      btn.style.background =
        "linear-gradient(135deg, #2196F3 0%, #0D47A1 100%)";
      btn.innerHTML = `翻页<small>下一页</small>`;
      nextBtn.classList.add("manual-highlight");
      STATE.currentHighlight = nextBtn;
    } else {
      btn.disabled = true;
      btn.innerHTML = `完成<small>无任务</small>`;
    }
  }

  function doAction() {
    if (STATE.isProcessing) return;
    STATE.isProcessing = true;
    STATE.cache = null;

    const unread = getUnreadElements();
    if (unread.length > 0) {
      const target = unread[0];
      target.scrollIntoView({behavior: "smooth", block: "center"});
      target.click();
      target.classList.add("manual-clicked");
      setTimeout(() => {
        STATE.isProcessing = false;
        updateUI();
      }, CONFIG.DELAYS.AFTER_CLICK);
    } else {
      const nextBtn = document.querySelector(CONFIG.SELECTORS.NEXT_PAGE);
      if (nextBtn) {
        nextBtn.click();
        setTimeout(() => {
          STATE.isProcessing = false;
          updateUI();
        }, CONFIG.DELAYS.AFTER_PAGE_TURN);
      } else {
        STATE.isProcessing = false;
      }
    }
  }

  // 7. 初始化程序
  function init() {
    // 第一步：注册菜单 (不受页面限制)
    GM_registerMenuCommand("⚙️ 打开设置面板", openSettings);

    // 第二步：判断页面环境
    if (!isTargetPage()) {
      console.log("[法律网站脚本] 非目标路径，自动按钮不加载。");
      return;
    }

    // 第三步：创建浮动按钮
    const btn = document.createElement("button");
    btn.id = "manualClickBtn";
    btn.addEventListener("click", doAction);
    document.body.appendChild(btn);

    // 第四步：监听鼠标释放（用于手动点击后的 UI 同步）
    const debounceUpdate = (() => {
      let timer;
      return () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          STATE.cache = null;
          updateUI();
        }, CONFIG.DELAYS.AFTER_MOUSEUP);
      };
    })();
    document.addEventListener("mouseup", debounceUpdate);

    // 初始扫描
    setTimeout(updateUI, CONFIG.DELAYS.INITIAL_SCAN);
  }

  // 运行脚本
  init();
})();
