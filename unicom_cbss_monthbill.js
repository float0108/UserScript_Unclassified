// ==UserScript==
// @name         【联通】CBSS实时月结账单批量查询
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  进入月结账单iframe后生效，先选好筛选条件再填写查询编号。如果查到空值暂时没有保护，会直接卡停。
// @author       float0108 & gemini Pro
// @match        https://sh.cbss.10010.cn/ambillquerypls*
// @require      https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @run-at       document-idle
// @license      GNU/GPLv3
// ==/UserScript==

(function () {
  "use strict";

  // ================= 核心配置 =================
  const TARGETS = {
    inputXpath: '//*[@id="formserialNumber"]/div[1]/input', // 原始输入框定位
    searchBtnXpath: '//*[@id="query_btn"]/button', // 查询按钮定位
    headerRow: ".datagrid-view2 .datagrid-header-row",
    dataRows: ".datagrid-view2 .datagrid-body tr",
    loadingMask: ".datagrid-mask", // 加载遮罩层(用于智能等待)
  };

  const STORAGE_KEYS = {
    delay: "cbss_delay_v20",
    mergedData: "cbss_data_v20",
    pos: "cbss_pos_v20",
  };

  const REMOVE_COLUMNS = ["查询号码", "发票账目编码", "账期", "操作"];
  const THEME_COLOR = "#2980b9";

  // ================= 样式定义 =================
  GM_addStyle(`
        #u-main-wrap { position: fixed; right: 0; top: 10%; z-index: 99999; user-select: none; font-family: "Segoe UI", sans-serif; }

        /* 悬浮球 */
        #u-bubble {
            width: 48px; height: 48px; background: ${THEME_COLOR}; color: white;
            border-radius: 8px 0 0 8px; display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: bold; box-shadow: -2px 2px 10px rgba(0,0,0,0.2);
            cursor: pointer; transition: 0.2s; writing-mode: vertical-lr; letter-spacing: 2px;
            border: 1px solid rgba(255,255,255,0.3);
        }
        #u-bubble:hover { width: 52px; filter: brightness(1.1); }

        /* 主面板 */
        #u-csv-box {
            position: absolute; top: 0; right: 50px;
            width: 340px; background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(8px); box-shadow: 0 5px 25px rgba(0,0,0,0.15);
            border-radius: 8px; border: 1px solid #e1e4e8; display: none; padding: 12px;
        }

        /* 下载按钮 */
        #u-btn-down {
            width: 36px; height: 36px; border: none; background: #f4f6f8;
            color: ${THEME_COLOR}; cursor: pointer; border-radius: 6px;
            font-size: 20px; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s; opacity: 0.5;
            position: relative;
        }
        #u-btn-down:hover { background: #e0e4e8; color: ${THEME_COLOR}; transform: scale(1.05); }
        #u-btn-down.has-data { opacity: 1; }
        /* 计数角标 */
        #u-btn-down::after {
            content: attr(data-count);
            position: absolute; top: -2px; right: -2px;
            background: #e74c3c; color: white; font-size: 9px;
            padding: 1px 4px; border-radius: 10px; font-weight: bold;
            display: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        #u-btn-down.has-data::after { display: block; }

        /* 工具栏 */
        .u-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .u-toolbar > div { display: flex; gap: 10px; }
        .u-btn {
            background: #f4f6f8; color: #555; border: none; border-radius: 6px;
            width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: 0.2s; font-size: 16px;
        }
        .u-btn:hover { background: #e0e4e8; color: ${THEME_COLOR}; }

        /* 输入与日志框 */
        textarea.u-io {
            width: 100%; height: 140px; padding: 8px; border: 1px solid #eee; border-radius: 6px;
            font-size: 12px; background: #fff; box-sizing: border-box; outline: none; resize: vertical;
        }

        /* 彩色日志容器 */
        #u-log-box {
            width: 100%; height: 140px; padding: 8px; border: 1px solid #eee; border-radius: 6px;
            font-size: 12px; background: #fafafa; box-sizing: border-box;
            overflow-y: auto; font-family: Consolas, monospace; white-space: pre-wrap; word-break: break-all;
        }
        .log-item { margin-bottom: 3px; border-bottom: 1px dashed #eee; padding-bottom: 2px; }
        .log-info { color: #333; }
        .log-success { color: #27ae60; font-weight: bold; }
        .log-error { color: #c0392b; font-weight: bold; }
        .log-warn { color: #d35400; }
        .log-sys { color: #2980b9; font-style: italic; }

        /* 底部状态 */
        .u-progress-container { margin-top: 10px; height: 3px; background: #eee; border-radius: 2px; overflow: hidden; }
        #u-progress-bar { height: 100%; width: 0%; background: ${THEME_COLOR}; transition: width 0.2s; }
        .u-footer { margin-top: 8px; display: flex; justify-content: space-between; font-size: 11px; color: #999; }
        .u-config input { width: 40px; border: none; border-bottom: 1px solid #ddd; text-align: center; outline: none; color: #333; }
    `);

  // ================= 辅助函数 =================
  const getEl = (xpath) => {
    try {
      return document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
    } catch (e) {
      return null;
    }
  };
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // ================= 核心逻辑类 =================
  class SearchTask {
    constructor() {
      this.isRunning = false;
      this.isPaused = false;
      this.currentIndex = 0;
      this.todoList = [];
      this.mergedData = JSON.parse(GM_getValue(STORAGE_KEYS.mergedData, "[]"));

      this.renderUI();
      this.initDraggable();
      this.updateDownloadIcon();
    }

    renderUI() {
      if (document.getElementById("u-main-wrap")) return;
      const wrap = document.createElement("div");
      wrap.id = "u-main-wrap";
      const savedDelay = GM_getValue(STORAGE_KEYS.delay, 2000);

      wrap.innerHTML = `
                <div id="u-bubble" title="拖动调整位置">EXCEL</div>
                <div id="u-csv-box">
                    <div class="u-toolbar">
                        <div>
                            <button id="u-btn-toggle" class="u-btn" title="开始/暂停">▶</button>
                            <button id="u-btn-clear" class="u-btn" style="color:#e74c3c" title="清空重置">🗑</button>
                        </div>
                        <button id="u-btn-down" title="数据为空" data-count="0">📥</button>
                    </div>

                    <textarea id="u-input" class="u-io" placeholder="在此粘贴号码，一行一个..."></textarea>
                    <div id="u-log-box" style="display:none;"></div>

                    <div class="u-progress-container"><div id="u-progress-bar"></div></div>

                    <div class="u-footer">
                        <span id="u-status">就绪</span>
                        <div class="u-config">
                            <span>兜底</span>
                            <input type="number" id="u-delay-input" value="${savedDelay}">ms
                        </div>
                    </div>
                </div>
            `;
      document.body.appendChild(wrap);

      // 绑定 DOM
      this.dom = {
        wrap,
        bubble: wrap.querySelector("#u-bubble"),
        box: wrap.querySelector("#u-csv-box"),
        input: wrap.querySelector("#u-input"),
        output: wrap.querySelector("#u-log-box"),
        btnToggle: wrap.querySelector("#u-btn-toggle"),
        btnDown: wrap.querySelector("#u-btn-down"),
        btnClear: wrap.querySelector("#u-btn-clear"),
        status: wrap.querySelector("#u-status"),
        bar: wrap.querySelector("#u-progress-bar"),
        delayInput: wrap.querySelector("#u-delay-input"),
      };

      // 绑定事件
      this.dom.bubble.onclick = () => {
        if (!this.isDraggingMoved) this.togglePanel();
      };
      this.dom.btnToggle.onclick = () => this.toggleState();
      this.dom.btnDown.onclick = () => this.downloadExcel();
      this.dom.btnClear.onclick = () => this.clearData();
      this.dom.delayInput.onchange = () =>
        GM_setValue(STORAGE_KEYS.delay, this.dom.delayInput.value);

      // 恢复上次位置
      const savedTop = GM_getValue(STORAGE_KEYS.pos);
      if (savedTop) wrap.style.top = savedTop;
    }

    // --- 核心功能控制 ---

    toggleState() {
      if (this.isRunning) this.pause();
      else this.start();
    }

    async start() {
      if (!this.isPaused) {
        const text = this.dom.input.value.trim();
        if (!text) return alert("请输入查询号码");
        this.todoList = text
          .split(/[\r\n]+/)
          .map((x) => x.trim())
          .filter((x) => x);
        this.currentIndex = 0;
        this.log("=== 任务启动 ===", "sys");
      } else {
        this.log(">>> 继续任务", "sys");
      }

      this.isRunning = true;
      this.isPaused = false;
      this.dom.btnToggle.textContent = "⏸";
      this.switchView("log");

      const waitTime = parseInt(this.dom.delayInput.value) || 2000;

      while (this.currentIndex < this.todoList.length) {
        if (!this.isRunning) break;
        const phone = this.todoList[this.currentIndex];
        this.dom.status.textContent = `[${this.currentIndex + 1}/${this.todoList.length}] ${phone}`;
        this.dom.bar.style.width = `${(this.currentIndex / this.todoList.length) * 100}%`;

        try {
          await this.processOne(phone, waitTime);
        } catch (err) {
          this.log(`❌ ${phone}: ${err.message}`, "error");
        }

        this.currentIndex++;
        await delay(800); // 批次间缓冲
      }
      if (this.isRunning) {
        this.dom.status.textContent = "全部完成";
        this.dom.btnToggle.textContent = "✅";
        this.dom.bar.style.width = "100%";
        this.log("=== 全部完成 ===", "sys");
        this.isRunning = false;
      }
    }

    pause() {
      this.isRunning = false;
      this.isPaused = true;
      this.dom.btnToggle.textContent = "▶";
      this.log("⏸ 暂停中...", "warn");
    }

    // --- 单次查询处理 (含智能等待) ---

    async processOne(phone, fallbackDelay) {
      const inputEl = getEl(TARGETS.inputXpath);
      const searchBtn = getEl(TARGETS.searchBtnXpath);

      if (!inputEl || !searchBtn) throw new Error("找不到元素，请刷新页面");

      // 1. 模拟原生输入 (绕过框架限制)
      let lastValue = inputEl.value;
      inputEl.value = phone;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      if (nativeSetter) nativeSetter.call(inputEl, phone);

      inputEl.dispatchEvent(new Event("input", {bubbles: true}));
      inputEl.dispatchEvent(new Event("change", {bubbles: true}));

      // 2. 点击查询
      searchBtn.click();

      // 3. 智能等待遮罩层
      let loadingAppeared = await this.waitForLoading(2000);

      if (loadingAppeared) {
        await this.waitWhileLoading(15000); // 等待遮罩消失
        await delay(300); // 渲染缓冲
      } else {
        await delay(fallbackDelay); // 兜底死等
      }

      this.extractAndMerge(phone);
    }

    extractAndMerge(phone) {
      // 初始化表头
      if (this.mergedData.length === 0) {
        const headerRow = document.querySelector(TARGETS.headerRow);
        if (headerRow) {
          const headers = Array.from(headerRow.querySelectorAll("td")).map(
            (td) => td.innerText.trim(),
          );
          headers.unshift("查询号码");
          this.mergedData.push(headers);
        }
      }

      const rows = document.querySelectorAll(TARGETS.dataRows);
      // 检查无记录情况
      if (rows.length === 1 && rows[0].innerText.includes("没有相关记录")) {
        this.log(`⚠️ ${phone}: 无相关记录`, "warn");
        return;
      }

      let validCount = 0;
      rows.forEach((tr) => {
        if (tr.style.display === "none") return;
        const rowData = Array.from(tr.querySelectorAll("td")).map((td) =>
          td.innerText.trim(),
        );
        if (rowData.join("").length < 2) return;
        rowData.unshift(phone);
        this.mergedData.push(rowData);
        validCount++;
      });

      if (validCount > 0) {
        this.log(`✔ ${phone}: 提取 ${validCount} 条`, "success");
        GM_setValue(STORAGE_KEYS.mergedData, JSON.stringify(this.mergedData));
        this.updateDownloadIcon();
      } else {
        this.log(`⚠️ ${phone}: 表格为空或未刷新`, "warn");
      }
    }

    // --- 导出与数据处理 ---

    downloadExcel() {
      const data = this.mergedData;
      if (data.length === 0) {
        this.log("❌ 暂无数据可导出", "error");
        return;
      }

      // 导出前统计
      const totalRows = data.length - 1;
      const uniquePhones = new Set(data.slice(1).map((row) => row[0])).size;

      this.log("---------------------------", "sys");
      this.log(`📊 导出统计汇总：`, "sys");
      this.log(`   - 累计号码: ${uniquePhones} 个`, "success");
      this.log(`   - 累计行数: ${totalRows} 行`, "info");
      this.log("---------------------------", "sys");
      this.log("⏳ 正在生成 Excel...", "sys");

      // 清洗数据 (向下填充 + 列筛选)
      const header = data[0];
      const keepIndices = header
        .map((h, i) => (REMOVE_COLUMNS.includes(h) ? -1 : i))
        .filter((i) => i !== -1);

      const cleanData = [keepIndices.map((i) => header[i])];
      let lastRow = null;

      for (let i = 1; i < data.length; i++) {
        let row = [...data[i]];
        // 填充逻辑: 如果该列为空且非首列(号码列)，则继承上一行
        if (lastRow) {
          for (let j = 1; j < row.length; j++) {
            if ((!row[j] || row[j] === "") && lastRow[j]) {
              row[j] = lastRow[j];
            }
          }
        }
        lastRow = row;
        cleanData.push(keepIndices.map((idx) => row[idx]));
      }

      const ws = XLSX.utils.aoa_to_sheet(cleanData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(
        wb,
        `CBSS_Result_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      this.log("✅ 导出完成", "success");
    }

    // --- UI状态管理 ---

    log(msg, type = "info") {
      const div = document.createElement("div");
      div.className = `log-item log-${type}`;
      div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      this.dom.output.appendChild(div);
      this.dom.output.scrollTop = this.dom.output.scrollHeight;
    }

    switchView(mode) {
      if (mode === "log") {
        this.dom.input.style.display = "none";
        this.dom.output.style.display = "block";
      } else {
        this.dom.input.style.display = "block";
        this.dom.output.style.display = "none";
      }
    }

    updateDownloadIcon() {
      const count = Math.max(0, this.mergedData.length - 1);
      const btn = this.dom.btnDown;
      btn.setAttribute("data-count", count);
      btn.title = count > 0 ? `可导出 ${count} 条数据` : "暂无数据";
      if (count > 0) btn.classList.add("has-data");
      else btn.classList.remove("has-data");
    }

    clearData() {
      if (!confirm("确定清空列表和抓取记录？")) return;
      this.isRunning = false;
      this.isPaused = false;
      this.todoList = [];
      this.currentIndex = 0;
      this.mergedData = [];
      GM_deleteValue(STORAGE_KEYS.mergedData);

      this.dom.output.innerHTML = ""; // 清空日志
      this.log("数据已重置", "sys");

      this.switchView("input");
      this.dom.input.value = "";
      this.dom.btnToggle.textContent = "▶";
      this.dom.bar.style.width = "0%";
      this.updateDownloadIcon();
    }

    // --- 异步等待工具 ---
    async waitForLoading(timeout) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (document.querySelector(TARGETS.loadingMask)) return true;
        await delay(50);
      }
      return false;
    }

    async waitWhileLoading(timeout) {
      const start = Date.now();
      while (document.querySelector(TARGETS.loadingMask)) {
        if (Date.now() - start > timeout) throw new Error("查询超时(Loading)");
        await delay(100);
      }
    }

    initDraggable() {
      let isDragging = false;
      this.isDraggingMoved = false;
      let startY, initialTopPx;
      this.dom.bubble.onmousedown = (e) => {
        isDragging = true;
        this.isDraggingMoved = false;
        startY = e.clientY;
        initialTopPx = this.dom.wrap.getBoundingClientRect().top;
        e.preventDefault();
      };
      document.onmousemove = (e) => {
        if (!isDragging) return;
        const dy = e.clientY - startY;
        if (Math.abs(dy) > 3) {
          this.isDraggingMoved = true;
          this.dom.box.style.display = "none";
        }
        this.dom.wrap.style.top =
          Math.max(0, Math.min(window.innerHeight - 48, initialTopPx + dy)) +
          "px";
      };
      document.onmouseup = () => {
        if (isDragging && this.isDraggingMoved)
          GM_setValue(STORAGE_KEYS.pos, this.dom.wrap.style.top);
        isDragging = false;
      };
    }
    togglePanel() {
      this.dom.box.style.display =
        this.dom.box.style.display === "none" ? "block" : "none";
    }
  }

  setTimeout(() => new SearchTask(), 1000);
})();
