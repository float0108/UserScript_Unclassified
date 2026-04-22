// ==UserScript==
// @name         【联通】法律网站-无头后台刷分
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  使用隐藏 iframe 处理详情页点赞，不弹窗
// @author       Gemini Pro
// @match        https://lawplatform.chinaunicom.cn/*
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. 详情页内部逻辑（在 iframe 中运行）
    if (window.location.href.includes('/review/')) {
        const checkAndClick = setInterval(() => {
            // 目标：点赞按钮的 XPath
            const xpath = '//*[@id="ant-layout-content"]/div[2]/div[1]/div/div[4]/div[1]';
            const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            if (el) {
                const bg = window.getComputedStyle(el).backgroundColor;
                if (bg.includes('194') || bg.includes('red')) {
                    console.log("子页面：已点赞，通知父窗口...");
                    window.parent.postMessage({ status: 'done', url: window.location.href }, '*');
                    clearInterval(checkAndClick);
                } else {
                    $(el).trigger('click');
                }
            }
        }, 1000);
        return;
    }

    // 2. 主页调度逻辑
    async function startSilentProcess() {
        const headers = document.querySelectorAll(".publicity-more-right-cart-list-header");
        let tasks = Array.from(headers).filter(h => !h.innerText.includes("已读"));

        console.log(`共发现 ${tasks.length} 条待刷任务`);

        for (let header of tasks) {
            header.style.color = "blue";
            header.innerText += " (正在后台处理...)";

            // 创建隐藏 iframe
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            // 假设点击 header 会触发跳转，我们直接模拟获取它的点击行为来拿到链接
            // 或者通过 React 数据提取 ID 拼接 URL: `https://.../review/${id}`
            
            // 这里我们采用最简单的模拟方案：触发点击，拦截新窗口跳转改为 iframe 加载
            const originalOpen = window.open;
            let targetUrl = "";
            window.open = (url) => { targetUrl = url; return null; };
            header.click();
            window.open = originalOpen; // 还原

            if (targetUrl) {
                console.log("后台加载链接:", targetUrl);
                iframe.src = targetUrl;
                document.body.appendChild(iframe);

                // 等待子页面完成的信号
                await new Promise((resolve) => {
                    const handler = (e) => {
                        if (e.data.status === 'done') {
                            window.removeEventListener('message', handler);
                            document.body.removeChild(iframe);
                            resolve();
                        }
                    };
                    window.addEventListener('message', handler);
                    // 15秒兜底超时
                    setTimeout(() => { 
                        if (iframe.parentNode) document.body.removeChild(iframe);
                        resolve(); 
                    }, 15000);
                });

                header.style.color = "gray";
                header.innerText = header.innerText.replace("(正在后台处理...)", "✅ 已完成");
            }
            
            await new Promise(r => setTimeout(r, 2000)); // 间隔
        }
        alert("后台批量刷分结束！");
    }

    // UI 按钮
    const btn = document.createElement('button');
    btn.innerHTML = '🛡️ 开启后台静默刷分';
    btn.style.cssText = 'position:fixed;top:100px;right:20px;z-index:9999;padding:12px;background:#52c41a;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;';
    btn.onclick = startSilentProcess;
    document.body.appendChild(btn);

})();