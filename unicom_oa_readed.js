// ==UserScript==
// @name         【联通】云公文已阅，拦截wps打开请求
// @namespace    http://tampermonkey.net/
// @version      0.0.1
// @description  拦截wps打开申请，自动填充“已阅”并自动点击“下一步”按钮
// @author       Float0108 & Gemini
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @match        https://sh-doc.chinaunicom.cn/*
// @grant        none
// @run-at       document-start
// @license      GNU/GPLv3
// ==/UserScript==
 
(function() {
    'use strict';
 
    // 1. 静默拦截 WPS 检测请求
    const proxiedOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && url.includes('127.0.0.1')) {
            this.send = () => {};
            return;
        }
        return proxiedOpen.apply(this, arguments);
    };
 
    // 2. 核心自动处理函数
    const autoProcess = (inputEl, btnEl) => {
        if (!inputEl || !btnEl) return;
 
        // --- 步骤 A: 填充内容 ---
        const prototype = (inputEl.tagName === 'TEXTAREA') ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        setter.call(inputEl, '已阅');
 
        // 模拟必要事件激活校验
        ['input', 'change', 'blur'].forEach(type => {
            try {
                const evt = document.createEvent('HTMLEvents');
                evt.initEvent(type, true, true);
                inputEl.dispatchEvent(evt);
            } catch (e) {}
        });
 
        // 清理 UI 状态类
        inputEl.classList.remove('mini-textbox-empty', 'invalid');
 
        // --- 步骤 B: 自动点击下一步 ---
        // 增加 500ms 延迟，给系统的“值改变”监听留出处理时间
        setTimeout(() => {
            console.log("准备点击下一步...");
            // 优先调用元素原生的 click()
            btnEl.click();
 
            // 补刀：如果 click() 没反应，尝试直接运行它 onclick 里的函数
            if (typeof window.nextStep0_onclick === 'function') {
                window.nextStep0_onclick();
            }
        }, 500);
    };
 
    // 3. 快速监测布局与按钮
    const checkTimer = setInterval(() => {
        const rightPanel = document.evaluate('//*[@id="hbox5"]/table', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        const inputEl = document.evaluate('//*[@id="commonOpinion$text"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        const nextBtn = document.getElementById('nextStep0');
 
        // 当布局、输入框、按钮全部就绪时执行
        if (rightPanel && inputEl && nextBtn && rightPanel.offsetWidth > 0) {
            clearInterval(checkTimer);
 
            // 1秒延迟确保所有初始化脚本运行完毕
            setTimeout(() => {
                autoProcess(inputEl, nextBtn);
            }, 1000);
        }
    }, 200);
 
})();