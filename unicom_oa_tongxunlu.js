// ==UserScript==
// @name         【联通】通讯录批量查询
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  持久化存储修复 | 强力图标显示 | 暂停继续无缝衔接 | 设置状态感知
// @author       float0108 & gemini Pro
// @match        https://tongxunlu.chinaunicom.cn/searchPage.html?v_202412&*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @license      GNU/GPLv3
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEYS = {
    pos: "u_csv_pos",
    delay: "u_csv_delay",
    status: "u_csv_status",
    todo: "u_csv_todo",
    done: "u_csv_done",
    index: "u_csv_index",
    lastSearch: "u_csv_last",
  };

  const themeColor = "#C20000";
  const initialTop = GM_getValue(STORAGE_KEYS.pos, "40%");

  // 重新定义的图标库
  const ICONS = {
    play: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    pause: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    reset: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`,
    copy: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    download: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  };

  // 使用 DataURI 保证对勾图标绝对显示 (白色对勾)
  const CHECK_ICON_URI = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlsaW5lIHBvaW50cz0iMjAgNiA5IDE3IDQgMTIiPjwvcG9seWxpbmU+PC9zdmc+`;

  GM_addStyle(`
        #u-main-wrap { position: fixed; right: 0; top: ${initialTop}; z-index: 100000; user-select: none; font-family: sans-serif; }
        #u-bubble {
            width: 48px; height: 48px; background: ${themeColor}; color: white;
            border-radius: 24px 0 0 24px; display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: bold; box-shadow: -4px 4px 15px rgba(194,0,0,0.3);
            cursor: default; transition: all 0.2s; writing-mode: vertical-lr; text-orientation: upright; letter-spacing: -2px;
        }
        #u-bubble:hover { background: #d60000; width: 52px; }

        #u-csv-box {
            position: absolute; top: 0; right: 55px;
            width: 340px; background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            border-radius: 12px; border: 1px solid rgba(0,0,0,0.08); display: none; padding: 15px;
        }

        .u-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
        .u-btn {
            background: #f0f2f5; color: #555; border: none; border-radius: 8px;
            width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: 0.2s;
        }
        .u-btn:hover { background: #e4e6eb; color: ${themeColor}; }

        textarea.u-io {
            width: 100%; height: 150px; padding: 10px; border: 1px solid #eee;
            border-radius: 8px; font-size: 12px; background: #fafafa; box-sizing: border-box;
            line-height: 1.5; outline: none; resize: none; white-space: pre; font-family: monospace;
        }

        .u-progress-container { margin-top: 12px; height: 4px; background: #eee; border-radius: 2px; overflow: hidden; }
        #u-progress-bar { height: 100%; width: 0%; background: linear-gradient(90deg, ${themeColor}, #ff4d4d); transition: width 0.1s linear; }

        .u-footer { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #888; }
        .u-config-box { display: flex; align-items: center; gap: 6px; background: #f5f5f5; padding: 4px 8px; border-radius: 4px; }
        .u-config-box input { width: 45px; border: none; background: transparent; text-align: center; color: #333; outline: none; font-weight: bold; transition: background 0.3s; }
        .u-config-box input.u-saved { background: #e8f5e9; }

        .u-btn-mini {
            width: 24px; height: 24px; border: none; border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s; cursor: not-allowed;
            background: #e0e0e0 no-repeat center; background-size: 16px;
        }

        /* 状态控制 */
        .u-btn-mini.u-dirty {
            background-color: #2196F3;
            background-image: url("${CHECK_ICON_URI}");
            cursor: pointer;
        }
        .u-btn-mini.u-success {
            background-color: #4CAF50 !important;
            background-image: url("${CHECK_ICON_URI}");
            cursor: default;
        }

        .u-status-text { font-weight: 500; color: ${themeColor}; }
    `);

  class SearchTask {
    constructor() {
      this.timer = null;
      this.renderUI();
      this.initDraggable();
      this.syncIndex();
      this.checkTaskOnLoad();
    }

    renderUI() {
      const wrap = document.createElement("div");
      wrap.id = "u-main-wrap";
      const savedDelay = GM_getValue(STORAGE_KEYS.delay, 2000);
      wrap.innerHTML = `
                <div id="u-bubble" title="拖动调整 / 点击展开">查询</div>
                <div id="u-csv-box">
                    <div class="u-toolbar">
                        <button id="u-btn-play" class="u-btn" style="color:${themeColor}">${ICONS.play}</button>
                        <button id="u-btn-reset" class="u-btn">${ICONS.reset}</button>
                        <div style="flex:1"></div>
                        <button id="u-btn-copy" class="u-btn">${ICONS.copy}</button>
                        <button id="u-btn-down" class="u-btn">${ICONS.download}</button>
                    </div>
                    <div id="u-input-layer"><textarea id="u-input" class="u-io" placeholder="每行一个姓名..."></textarea></div>
                    <textarea id="u-output" class="u-io" style="display:none;" readonly></textarea>
                    <div class="u-progress-container"><div id="u-progress-bar"></div></div>
                    <div class="u-footer">
                        <span id="u-status" class="u-status-text">Ready</span>
                        <div class="u-config-box">
                            <span>⏱</span>
                            <input type="number" id="u-delay-input" step="100" min="100" value="${savedDelay}">
                            <span>ms</span>
                            <button id="u-btn-save-delay" class="u-btn-mini" title="保存"></button>
                        </div>
                    </div>
                </div>
            `;
      document.body.appendChild(wrap);

      this.dom = {
        wrap,
        bubble: wrap.querySelector("#u-bubble"),
        box: wrap.querySelector("#u-csv-box"),
        input: wrap.querySelector("#u-input"),
        output: wrap.querySelector("#u-output"),
        btnPlay: wrap.querySelector("#u-btn-play"),
        btnReset: wrap.querySelector("#u-btn-reset"),
        btnCopy: wrap.querySelector("#u-btn-copy"),
        btnDown: wrap.querySelector("#u-btn-down"),
        status: wrap.querySelector("#u-status"),
        progressBar: wrap.querySelector("#u-progress-bar"),
        inputLayer: wrap.querySelector("#u-input-layer"),
        delayInput: wrap.querySelector("#u-delay-input"),
        btnSaveDelay: wrap.querySelector("#u-btn-save-delay"),
      };

      this.dom.bubble.onclick = () => {
        if (!this.isDraggingMoved) this.togglePanel();
      };
      this.dom.btnPlay.onclick = () => this.startOrPause();
      this.dom.btnReset.onclick = () => this.softReset();
      this.dom.btnCopy.onclick = () => {
        this.dom.output.select();
        document.execCommand("copy");
      };
      this.dom.btnDown.onclick = () => this.download();

      // 实时监听输入，比对存储值
      this.dom.delayInput.addEventListener("input", () => {
        const currentVal = parseInt(this.dom.delayInput.value);
        const savedVal = GM_getValue(STORAGE_KEYS.delay, 2000);
        this.dom.btnSaveDelay.classList.toggle(
          "u-dirty",
          currentVal !== savedVal,
        );
      });

      this.dom.btnSaveDelay.onclick = () => {
        if (this.dom.btnSaveDelay.classList.contains("u-dirty"))
          this.saveDelay();
      };
      this.dom.delayInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.saveDelay();
      });
    }

    saveDelay() {
      let val = parseInt(this.dom.delayInput.value);
      if (isNaN(val) || val < 100) {
        val = 100;
        this.dom.delayInput.value = 100;
      }
      GM_setValue(STORAGE_KEYS.delay, val);

      const btn = this.dom.btnSaveDelay;
      const input = this.dom.delayInput;
      btn.classList.remove("u-dirty");
      btn.classList.add("u-success");
      input.classList.add("u-saved");

      setTimeout(() => {
        btn.classList.remove("u-success");
        input.classList.remove("u-saved");
      }, 1000);
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
        if (Math.abs(dy) > 5) {
          this.isDraggingMoved = true;
          this.dom.box.style.display = "none";
        }
        let newTop = initialTopPx + dy;
        newTop = Math.max(0, Math.min(window.innerHeight - 48, newTop));
        this.dom.wrap.style.top = newTop + "px";
      };
      document.onmouseup = () => {
        if (isDragging && this.isDraggingMoved) {
          GM_setValue(STORAGE_KEYS.pos, this.dom.wrap.style.top);
        }
        isDragging = false;
      };
    }

    togglePanel() {
      this.dom.box.style.display =
        this.dom.box.style.display === "none" ? "block" : "none";
    }

    parseRecord(text, queryName) {
      let raw = text
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const staffId = (raw.match(/\b(\d{7})\b/) || ["", ""])[1];
      const phone = (raw.match(/(?:手机[:：]?\s*)?(1[3-9]\d{9})/) || [
        "",
        "",
      ])[1];
      const email = (raw.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      ) || [""])[0];
      let job = raw
        .replace(/\[\d{2}:\d{2}:\d{2}\]/g, "")
        .replace(email, "")
        .replace(new RegExp(`(手机[:：]?\\s*)?${phone}`), "")
        .replace(staffId, "")
        .split(queryName)
        .join("")
        .replace(/(员工编号|手机|固话)[:：]?\s*[\d-]*\s*/g, "")
        .replace(/^[,\s]+|[,\s]+$/g, "")
        .trim();
      const safe = (s) => (s ? `"${s.replace(/"/g, '""')}"` : "");
      return `${safe(queryName)},${safe(staffId)},${safe(job)},${safe(email)},${safe(phone)}`;
    }

    syncIndex() {
      const status = GM_getValue(STORAGE_KEYS.status);
      const todo = GM_getValue(STORAGE_KEYS.todo, []);
      let index = GM_getValue(STORAGE_KEYS.index, 0);
      const doneText = GM_getValue(STORAGE_KEYS.done, "");
      if (status !== "done" && todo.length > 0) {
        while (index < todo.length && doneText.includes(`"${todo[index]}"`)) {
          index++;
        }
        GM_setValue(STORAGE_KEYS.index, index);
      }
    }

    checkTaskOnLoad() {
      const status = GM_getValue(STORAGE_KEYS.status);
      const todo = GM_getValue(STORAGE_KEYS.todo, []);
      const index = GM_getValue(STORAGE_KEYS.index, 0);
      if (status === "running") {
        this.dom.bubble.textContent = `${index + 1}/${todo.length}`;
        this.dom.bubble.style.writingMode = "horizontal-tb";
        this.dom.bubble.style.letterSpacing = "0";
        this.dom.box.style.display = "block";
        this.dom.btnPlay.innerHTML = ICONS.pause;
        this.switchToOutput();
        setTimeout(() => this.decisionMaker(todo, index), 600);
      } else if (status === "paused") {
        this.dom.bubble.textContent = "暂停";
        this.dom.bubble.style.writingMode = "horizontal-tb";
        this.dom.box.style.display = "block";
        this.switchToOutput();
      } else if (status === "done") {
        this.finish();
      }
    }

    decisionMaker(todo, index) {
      if (index >= todo.length) {
        this.finish();
        return;
      }
      const name = todo[index];
      const container = document.querySelector("#summaryContBody");
      const inputEl = document.querySelector(
        'input.js_search_item[data-name="name"]',
      );
      const currentInputVal = inputEl ? inputEl.value.trim() : "";
      if (currentInputVal !== name) {
        this.search(name);
        return;
      }
      if (container) {
        const innerText = container.innerText;
        if (innerText.includes(name)) {
          if (GM_getValue(STORAGE_KEYS.lastSearch) !== name) {
            const parts = innerText
              .split(name)
              .filter((p) => p.trim().length > 5);
            let csv = "";
            if (parts.length > 0)
              parts.forEach(
                (p) => (csv += this.parseRecord(name + p, name) + "\n"),
              );
            else csv = `"${name}",解析异常,,,\n`;
            this.appendResult(csv, name);
          }
          this.nextStep(todo, index + 1);
        } else {
          if (GM_getValue(STORAGE_KEYS.lastSearch) !== name)
            this.appendResult(`"${name}",未找到/无结果,,,\n`, name);
          this.nextStep(todo, index + 1);
        }
      } else {
        this.search(name);
      }
    }

    appendResult(csv, name) {
      const old = GM_getValue(STORAGE_KEYS.done, "");
      GM_setValue(STORAGE_KEYS.done, old + csv);
      GM_setValue(STORAGE_KEYS.lastSearch, name);
      this.dom.output.value = "姓名,工号,岗位,邮箱,手机\n" + old + csv;
      this.dom.output.scrollTop = this.dom.output.scrollHeight;
    }

    nextStep(todo, nextIndex) {
      if (nextIndex < todo.length) {
        GM_setValue(STORAGE_KEYS.index, nextIndex);
        this.countdown(todo[nextIndex]);
      } else this.finish();
    }

    countdown(nextName) {
      const base = GM_getValue(STORAGE_KEYS.delay, 2000); // 实时读取存储
      const delay = Math.floor(base * (0.8 + Math.random() * 0.4));
      let msLeft = delay;
      this.dom.status.textContent = `冷却中 (${delay}ms)...`;
      this.timer = setInterval(() => {
        this.dom.progressBar.style.width = (msLeft / delay) * 100 + "%";
        if (msLeft <= 0) {
          clearInterval(this.timer);
          this.timer = null;
          this.search(nextName);
        }
        msLeft -= 50;
      }, 50);
    }

    search(name) {
      const input = document.querySelector(
        'input.js_search_item[data-name="name"]',
      );
      const btn = document.querySelector("#search_part");
      if (input && btn) {
        input.focus();
        input.value = name;
        input.dispatchEvent(new Event("input", {bubbles: true}));
        input.dispatchEvent(new Event("change", {bubbles: true}));
        setTimeout(() => btn.click(), 100);
      }
    }

    startOrPause() {
      const status = GM_getValue(STORAGE_KEYS.status);
      if (status === "running") {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        GM_setValue(STORAGE_KEYS.status, "paused");
        this.dom.btnPlay.innerHTML = ICONS.play;
        this.dom.bubble.textContent = "暂停";
      } else {
        const names = this.dom.input.value
          .split(/[\r\n\s,，;|；]+/)
          .map((n) => n.trim())
          .filter((n) => n);
        if (status !== "paused" && names.length === 0)
          return alert("请输入名单");
        if (status !== "paused") {
          GM_setValue(STORAGE_KEYS.todo, names);
          GM_setValue(STORAGE_KEYS.index, 0);
          GM_setValue(STORAGE_KEYS.done, "");
          GM_setValue(STORAGE_KEYS.lastSearch, "");
        }
        GM_setValue(STORAGE_KEYS.status, "running");
        location.reload();
      }
    }

    softReset() {
      if (this.timer) clearInterval(this.timer);
      Object.values(STORAGE_KEYS).forEach((k) => GM_deleteValue(k));
      location.reload();
    }

    switchToOutput() {
      this.dom.inputLayer.style.display = "none";
      this.dom.output.style.display = "block";
      this.dom.output.value =
        "姓名,工号,岗位,邮箱,手机\n" + GM_getValue(STORAGE_KEYS.done, "");
      this.dom.output.scrollTop = this.dom.output.scrollHeight;
    }

    finish() {
      GM_setValue(STORAGE_KEYS.status, "done");
      this.dom.status.textContent = "完成";
      this.dom.bubble.textContent = "完成";
      this.dom.progressBar.style.width = "0%";
      this.dom.btnPlay.innerHTML = ICONS.play;
    }

    download() {
      const blob = new Blob(["\ufeff" + this.dom.output.value], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Unicom_CSV_${new Date().getTime()}.csv`;
      link.click();
    }
  }

  const init = () => {
    if (document.body && document.querySelector("#search_part"))
      new SearchTask();
    else setTimeout(init, 100);
  };
  init();
})();
