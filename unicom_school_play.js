// ==UserScript==
// @name         【联通】党校视频学时加速提交
// @namespace    http://tampermonkey.net/
// @version      0.0.3
// @description  自定义重试次数与间隔，SVG图标，溢出保护，章节切换刷新
// @author       Float0108 & Gemini
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @match        https://campus.chinaunicom.cn/training/pc/curriculum.html*

// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @license      GNU/GPLv3
// ==/UserScript==

(function() {
    // 把这两行复制到上面的区域
    // @require      https://cdn.bootcdn.net/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
    // @require      https://cdn.bootcdn.net/ajax/libs/jsencrypt/3.2.1/jsencrypt.min.js

    'use strict';

    // ==================== [1. 全局常量定义] ====================
    const CONFIG = {
        publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAooxomrujIP9vcxxNmS+Q1xxnaoxAfluwFvDR3+G+p84QMsePXDD67cLjJ+7n+79u2xoG7fVvDnzHDW+X5D/0/Dv9ajUaBpFQl3jqKwRiP3Lrx08seYzWIWDGHEjurbZrWGHRJNdoM7tEQPdPZftZC6iOm7kSjDIDiuqaIh9g3hqFSVQ5r15Dvae6qtREo1nDWKsf3tH6nkvVD2pIh3TBJUoGdfbPqnw/tNvzhwOX9tg7NjhZ8Yet1ctVt297G5HCwPSIBjhUKEtLYLk/8scPrzXnQpAU05m5WnHfDhfvvG2xoVXckveNvZhv6lvxTZqRkUBOI1pU16U9Tz4aDpCU7QIDAQAB',
        apiUrl: 'https://campus.chinaunicom.cn/training/app/course/playtimeV2',

        // 核心配置
        maxFailCount: 3,
        retryInterval: 10,
        interceptNative: true,

        // UI & 风格
        theme: '#A60209',
        noticeTitle: '学时助手',
        icons: {
            play: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="margin-left:2px;"><path d="M8 5v14l11-7z"/></svg>`,
            pause: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
        },

        // 监控路径
        videoSelector: '#tc_video_box_html5_api',
        switchXpaths: [
            '//*[@id="curriculum"]/div[1]/div[2]/div/div[1]/div/div[1]/div/div[2]/div[2]/div[3]/section/article/div/div/ul/li[1]',
            '//*[@id="curriculum"]/div[1]/div[2]/div/div[1]/div/div[1]/div/div[2]/div[2]/div[3]/section/article/div/div/ul/li[2]'
        ]
    };

    // ==================== [2. XHR 拦截：屏蔽原生请求] ====================
    if (CONFIG.interceptNative) {
        const rawOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function(method, url) {
            if (url && url.includes("playtimeV2")) {
                this.send = () => {};
                return;
            }
            return rawOpen.apply(this, arguments);
        };
    }

    // ==================== [3. 状态管理] ====================
    let state = {
        isRunning: false,
        isRequesting: false,
        failCount: 0,
        totalDuration: 0,
        nextRunTime: 0
    };

    // ==================== [4. 辅助工具] ====================
    const getVal = (key, def) => GM_getValue(key, def);
    const setVal = (key, def) => {
        let val = prompt(`设置 ${key}:`, getVal(key, def));
        if (val !== null) { GM_setValue(key, parseInt(val)); location.reload(); }
    };

    GM_registerMenuCommand("⏱️ 步进区间", () => { setVal('minStep', 175); setVal('maxStep', 179); });
    GM_registerMenuCommand("⌛ 间隔区间", () => { setVal('minInterval', 30); setVal('maxInterval', 35); });

    const getRandom = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

    function pushLog(msg, isError = false) {
        const logBox = document.getElementById("mini-log-container");
        if (logBox) {
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            const line = document.createElement("div");
            line.style.cssText = `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${isError ? '#ff4d4f' : '#666'};`;
            line.textContent = `[${time}] ${msg}`;
            logBox.insertBefore(line, logBox.firstChild);
            if (logBox.children.length > 2) logBox.removeChild(logBox.lastChild);
        }
    }

    function calcProgress() {
        try {
            const pctEl = document.querySelector('.planList-speed[class*="kpoint_progress_"]');
            const durEl = document.querySelector(".vjs-duration-display") || document.querySelector(".vjs-duration");
            if (!pctEl || !durEl) return { study: 0, total: 0 };
            const timeStr = durEl.innerText.replace(/[a-zA-Z]/g, '').trim();
            const parts = timeStr.split(':').map(Number);
            let total = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
            state.totalDuration = total;
            const study = Math.floor(total * (parseFloat(pctEl.innerText) / 100));
            return { study, total };
        } catch (e) { return { study: 0, total: 0 }; }
    }

    // ==================== [5. 逻辑控制] ====================
    async function submit() {
        if (state.isRequesting || !state.isRunning) return;

        const input = document.getElementById("in-study");
        let currentVal = parseInt(input.value);

        if (state.totalDuration > 0 && currentVal >= state.totalDuration) {
            pushLog("100% 已达成");
            GM_notification({ title: CONFIG.noticeTitle, text: "任务完成，已停止播放并提交。" });
            toggle(false);
            return;
        }

        state.isRequesting = true;
        const urlMatch = window.location.href.match(/course_courseDetails\/(\d+)/);
        const kpId = document.querySelector('.planList-speed[class*="kpoint_progress_"]')?.className.match(/kpoint_progress_(\d+)/)?.[1];

        const params = {
            accrualType: "1", breakpoint: (currentVal + 1).toString(), companyId: "1",
            courseId: urlMatch ? urlMatch[1] : "", from: "WEB", kpointId: kpId || "",
            organizationId: "67468", randomStr: Math.random().toString(36).substring(2, 10),
            studyTime: currentVal.toString(), timestamp: Math.floor(Date.now() / 1000).toString(),
            token: document.cookie.match(/token=([^;]+)/)?.[1] || "", type: "playback"
        };

        const sign = (() => {
            const t = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + '&';
            const enc = new JSEncrypt();
            enc.setPublicKey(CONFIG.publicKey);
            return enc.encrypt(CryptoJS.MD5(t).toString());
        })();

        GM_xmlhttpRequest({
            method: "POST",
            url: CONFIG.apiUrl,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: new URLSearchParams({ ...params, sign }).toString(),
            onload: (res) => {
                state.isRequesting = false;
                try {
                    const json = JSON.parse(res.responseText || "{}");
                    if (json.message?.includes('成功') || json.msg?.includes('成功') || json.code === 200) {
                        state.failCount = 0;
                        const step = getRandom(getVal('minStep', 175), getVal('maxStep', 179));
                        let nextVal = Math.min(currentVal + step, state.totalDuration);
                        input.value = nextVal;
                        updateUIPct(nextVal);
                        pushLog(`提交成功: ${nextVal}s`);
                        if (nextVal >= state.totalDuration) setTimeout(() => submit(), 1000);
                        else planNext();
                    } else { handleFail(json.message || "请求非法"); }
                } catch (e) { handleFail("解析异常"); }
            },
            onerror: () => handleFail("连接错误")
        });
    }

    function handleFail(reason) {
        state.isRequesting = false;
        state.failCount++;
        pushLog(`失败(${state.failCount}/${CONFIG.maxFailCount}): ${reason}`, true);
        if (state.failCount >= CONFIG.maxFailCount) {
            GM_notification({ title: CONFIG.noticeTitle, text: "连续失败，已自动停止。" });
            toggle(false);
        } else { planNext(CONFIG.retryInterval); }
    }

    function planNext(sec) {
        const wait = sec || getRandom(getVal('minInterval', 30), getVal('maxInterval', 35));
        state.nextRunTime = Date.now() + wait * 1000;
    }

    function updateUIPct(val) {
        const uiPct = document.getElementById("ui-pct");
        if (uiPct && state.totalDuration > 0) {
            uiPct.textContent = ` (${Math.min(((val / state.totalDuration) * 100), 100).toFixed(1)}%)`;
        }
    }

    function toggle(force) {
        state.isRunning = force !== undefined ? force : !state.isRunning;
        const btn = document.getElementById("btn-go");
        const video = document.querySelector(CONFIG.videoSelector);

        if (btn) {
            btn.innerHTML = state.isRunning ? CONFIG.icons.pause : CONFIG.icons.play;
            btn.style.background = state.isRunning ? "#555" : CONFIG.theme;
        }

        if (state.isRunning) {
            state.failCount = 0;
            // 核心逻辑：启动脚本时，静默暂停视频，节省资源
            if (video) {
                video.pause();
                pushLog("视频已自动静音暂停 (节能模式)");
            }
            const { study } = calcProgress();
            document.getElementById("in-study").value = study;
            submit();
        } else {
            if (video) video.pause();
        }
    }

    // ==================== [6. 初始化] ====================
    document.addEventListener('click', (e) => {
        for (const path of CONFIG.switchXpaths) {
            const node = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (node && (node === e.target || node.contains(e.target))) {
                setTimeout(() => location.reload(), 500);
                break;
            }
        }
    }, true);

    function initUI() {
        const { study } = calcProgress();
        const panel = document.createElement("div");
        panel.style.cssText = `position:fixed; top:20px; right:20px; z-index:10000; width:200px; background:rgba(255,255,255,0.96); backdrop-filter:blur(5px); border-radius:8px; padding:12px; box-shadow:0 4px 15px rgba(0,0,0,0.1); border:1px solid #eee; font-family:sans-serif;`;
        panel.innerHTML = `
            <div id="drag-h" style="height:12px; cursor:move; margin:-12px -12px 5px -12px; background:rgba(0,0,0,0.03); border-radius:8px 8px 0 0;"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span id="timer-val" style="font-size:22px; font-weight:bold; color:#333;">00:00</span>
                <button id="btn-go" style="width:36px; height:36px; border-radius:50%; border:none; background:${CONFIG.theme}; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;">${CONFIG.icons.play}</button>
            </div>
            <div style="font-size:12px; color:#666; margin-bottom:8px; border-bottom:1px solid #f0f0f0; padding-bottom:6px;">
                进度: <input type="number" id="in-study" value="${study}" style="width:55px; border:none; background:transparent; font-size:12px; color:${CONFIG.theme}; font-weight:bold;">s
                <span id="ui-pct"></span>
            </div>
            <div id="mini-log-container" style="font-size:10px; line-height:1.4; height:28px; overflow:hidden; color:#999;"><div>系统就绪</div></div>
        `;
        document.body.appendChild(panel);
        updateUIPct(study);
        setInterval(() => {
            if (!state.isRunning) return;
            const diff = Math.max(0, Math.ceil((state.nextRunTime - Date.now()) / 1000));
            document.getElementById("timer-val").textContent = `${Math.floor(diff/60).toString().padStart(2,'0')}:${(diff%60).toString().padStart(2,'0')}`;
            if (Date.now() >= state.nextRunTime && !state.isRequesting) submit();
        }, 1000);
        document.getElementById("btn-go").onclick = () => toggle();
        panel.onmousedown = (e) => {
            if(e.target.closest('input') || e.target.closest('button')) return;
            let ox = e.clientX - panel.offsetLeft, oy = e.clientY - panel.offsetTop;
            document.onmousemove = (e) => { panel.style.left = (e.clientX - ox) + "px"; panel.style.top = (e.clientY - oy) + "px"; panel.style.right = 'auto'; };
            document.onmouseup = () => document.onmousemove = null;
        };
    }

    setTimeout(initUI, 3000);
})();