// ==UserScript==
// @name         【联通】自动填充手机号
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  点击悬浮球展开列表，自动切换短信登录并填充手机号（需要在脚本里手动填入手机号））
// @author       float0108 & gemini Pro
// @match        https://uac.sso.chinaunicom.cn/uac-sso-eip/*
// @homepage     https://github.com/float0108/UserScript_Unclassified/
// @grant        none
// @license      GNU/GPLv3
// ==/UserScript==

(function () {
  "use strict";

  // ----------------------------------------------------
  // 1. 数据配置
  // ----------------------------------------------------
  const contacts = [{name: "测试", phone: "1860172XXXX"}];

  const STORAGE_KEY = "my_fill_helper_pos";

  // ----------------------------------------------------
  // 2. 初始位置逻辑
  // ----------------------------------------------------
  let savedTop = localStorage.getItem(STORAGE_KEY);
  // 默认距离顶部 20%
  let initialTop = savedTop ? JSON.parse(savedTop).top : "20%";

  // ----------------------------------------------------
  // 3. UI 样式与构建
  // ----------------------------------------------------
  const style = document.createElement("style");
  style.innerHTML = `
        #my-fill-helper {
            position: fixed;
            right: 0; /* 修改：固定在右侧边 */
            top: ${initialTop};
            z-index: 9999;
            user-select: none;
        }
        .helper-ball {
            width: 48px; height: 48px;
            background: #C20000;
            /* 修改：左侧圆角，右侧直角，贴边更自然（可选，如不喜欢可改回50%） */
            border-radius: 24px 0 0 24px;
            box-shadow: -2px 2px 10px rgba(0,0,0,0.2);
            cursor: ns-resize; /* 修改：鼠标样式改为上下箭头 */
            color: white;
            display: flex; align-items: center; justify-content: center; font-size: 12px;
            transition: transform 0.1s;
        }
        .helper-ball:active {
            transform: scale(0.95);
            background: #900000; /* 修改处：建议按压时颜色稍微加深，增加交互感 */
        }
        .helper-list {
            position: absolute;
            top: 0;
            right: 50px; /* 显示在球的左边 */
            margin-top: 0;
            background: white;
            border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            display: none; width: 140px; overflow: hidden; max-height: 300px; overflow-y: auto;
        }
        .helper-item {
            padding: 10px 15px; cursor: pointer; font-size: 14px; color: #333;
            border-bottom: 1px solid #eee; transition: background 0.2s;
        }
        .helper-item:last-child { border-bottom: none; }
        .helper-item:hover {
            color: #C20000;
        }
    `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = "my-fill-helper";

  const listHtml = contacts
    .map(
      (c) => `<div class="helper-item" data-phone="${c.phone}">${c.name}</div>`,
    )
    .join("");

  container.innerHTML = `
        <div class="helper-ball" id="helperBall">填充</div>
        <div class="helper-list" id="helperList">${listHtml}</div>
    `;
  document.body.appendChild(container);

  // ----------------------------------------------------
  // ----------------------------------------------------
  // 4. 拖拽与记忆逻辑 (修改：只允许垂直拖拽)
  // ----------------------------------------------------
  const ball = document.getElementById("helperBall");
  const list = document.getElementById("helperList");

  let isDragging = false;
  let hasMoved = false;
  let startY, initialDomTop; // 只需要 Y 轴数据

  ball.addEventListener("mousedown", (e) => {
    isDragging = true;
    hasMoved = false;

    // 记录起始 Y 位置
    startY = e.clientY;
    // 获取当前元素的 top 值 (解析为数字)
    const rect = container.getBoundingClientRect();
    initialDomTop = rect.top;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dy = e.clientY - startY;

    // 只有垂直移动超过 3px 才算拖拽
    if (Math.abs(dy) > 3) {
      hasMoved = true;
      list.style.display = "none";
    }

    // 修改：只改变 Top，限制不超出屏幕上下边界
    let newTop = initialDomTop + dy;
    const maxTop = window.innerHeight - 48; // 减去球的高度

    // 简单的边界限制
    if (newTop < 0) newTop = 0;
    if (newTop > maxTop) newTop = maxTop;

    container.style.top = newTop + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;

    // 拖拽结束，只保存 Top
    if (hasMoved) {
      const finalPos = {
        top: container.style.top,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalPos));
    }
  });

  // ----------------------------------------------------
  // 5. 点击交互逻辑
  // ----------------------------------------------------
  ball.addEventListener("click", (e) => {
    // 如果刚刚发生了拖拽，则忽略这次点击
    if (hasMoved) return;

    // 切换列表显示
    list.style.display = list.style.display === "block" ? "none" : "block";
  });

  // 点击人名触发填充
  list.querySelectorAll(".helper-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const phone = e.target.getAttribute("data-phone");
      doFill(phone);
      list.style.display = "none";
      e.stopPropagation(); // 防止冒泡
    });
  });

  // 点击页面其他地方关闭列表
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      list.style.display = "none";
    }
  });

  // ----------------------------------------------------
  // 6. 核心填充功能 (保持不变)
  // ----------------------------------------------------
  function doFill(phoneNum) {
    const switchBtn = document.querySelector("#accountLoginNoteBtn");
    if (switchBtn) switchBtn.click();

    setTimeout(() => {
      const input = document.querySelector("#loginPhoneNum");
      if (input) {
        input.value = phoneNum;
        input.dispatchEvent(new Event("input", {bubbles: true}));
        input.dispatchEvent(new Event("change", {bubbles: true}));
      }
    }, 300);
  }

  // 默认触发我自己的
  doFill(contacts[0].phone);
})();
