// ==UserScript==
// @name         超星自动化
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  自动刷网课工具，但非常高级
// @author       You
// @match        https://mooc1.chaoxing.com/mycourse/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chaoxing.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    try {
      startInjection();
    } catch(e) {
      notify(`咋回事？ ${e}`, 'error');
    }
})();

let settings = {
  skipVideoIfPossible: true
}

async function startInjection() {
  console.log('Chaoxing Automation: injection started');
  const ignored = [];

  while (true) {
    await waitForPageLoad();

    const next = getNextCourseNode(ignored);
    if (!next) {
      notify('学完了 太牛逼了');
      break;
    }

    next.click();
    await waitForPageLoad();

    const courseMain = document.querySelector('.course_main');
    await handlePage(courseMain, next, ignored);

    const nextTab = getNextTab();
    if (nextTab) nextTab.click();

    await handlePage(courseMain, next, ignored);
  }
}

async function handlePage(courseMain, node, ignored) {
  console.log(courseMain);
  if (!courseMain.querySelector('.ans-attach-ct')) {
    const frame = courseMain.querySelector('iframe');
    if (!frame) {
      notify('什么？空页面？', 'error');
    } else {
      handlePage(frame.contentDocument, node, ignored);
    }
  } else {
    let containsUnknown = false;
    const retry = [];

    for (const item of courseMain.querySelectorAll('iframe')) {
      const result = await handleItem(item);
      
      switch (result) {
        case 'unknown':
          if (!containsUnknown) {
            ignored.push(node);
            containsUnknown = true;
          }
          break;
        case 'retry':
          retry.push(item);
          break;
      }
    }

    if (retry.length > 0) {
      notify('有些东西得再试一次', 'warn');
      let notWorking = false;
      for (const item of retry) {
        const result = await handleItem(item);
        if (result !== 'done') {
          notWorking = true;
        }
      }
      if (notWorking) {
        notify('又出问题，不干了');
        if (!ignored.includes(node)) ignored.push(node);
      }
    }

    if (containsUnknown) {
      notify('有些东西不知道是啥，跳过', 'warn');
    }
  }
}


/**
 * @param {HTMLIFrameElement} item the item to play
 * @returns {Promise<'done'|'unknown'|'retry'>} whether the item has been dealt with
 */
async function handleItem(item) {
  await waitFrameLoad(item);
  if (isCheckpointDone(item)) {
    return 'done';
  }
  const container = item.contentDocument
  if (container.querySelector('.ans-insertvideo-online')) {
    await handleVid(item);
  } else {
    return 'unknown';
  }
  return 'done';
}

/**
 * Get the next incompleted course
 * @param {Array<HTMLElement>} ignored
 * @returns {HTMLDivElement}
 */
function getNextCourseNode(ignored) {
  const tree = document.getElementById('coursetree');
  function walkThrough(node) {
    if (node.tagName === 'LI') {
      if (node.childElementCount == 1 && node.children[0].tagName === 'DIV' 
          && node.children[0].childElementCount > 0 && node.children[0].children[0].tagName === 'SPAN'
          && node.children[0].children[0].classList.contains('posCatalog_name')) {
        const target = node.children[0].children[0];
        if (!ignored.includes(target)) {
          const completed = node.querySelector('.icon_Completed');
          if (!completed) return target;
        }
      }
    }
    for (const child of node.children) {
      const find = walkThrough(child);
      if (find) return find;
    }
  }

  return walkThrough(tree);
}

/**
 * Pop up a text message
 * @param {string} text what to notify
 * @param {"success"|"error"|"warn"} level how to notify
 */
function notify(text, level) {
  let surface = 'green', onSurface = 'white';
  switch (level) {
    case 'error':
      surface = 'red';
      onSurface = 'white';
      break;
    case 'success':
      surface = 'green';
      onSurface = 'white';
      break;
    case 'warn':
      surface = 'orange';
      onSurface = 'white';
      break;
  }
  const html = `
  <div class="notification-container">
    <div class="notification">
      <h1>${text}</h1>
    </div>
  </div>

  <style>
  .notification-container {
    position: fixed;
    display: flex;
    top: 36px;
    left: 0;
    right: 0;
    width: 100%;
    animation: fly-in-and-out 6s forwards;
    justify-content: center;
    z-index: 100000;
  }

  .notification {
    max-width: 50%;
    padding: 12px;
    border-radius: 8px;
    background: ${surface};
    text-align: center;
    color: ${onSurface};
  }

  @keyframes fly-in-and-out {
    0% {
      transform: translate(0, -100px);
      opacity: 0;
    }
    10% {
      transform: translate(0, 0);
      opacity: 1;
    }
    90% {
      transform: translate(0, 0);
      opacity: 1;
    }
    100% {
      transform: translate(0, -100px);
      opacity: 0; 
    }
  }
  </style>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => {
    document.body.removeChild(document.querySelector('.notification-container'))
  }, 6000);
}

/**
 * @param {HTMLIFrameElement} container the container to judege
 * @returns {Boolean}
 */
function isCheckpointDone(container) {
  return Boolean(container.contentDocument.querySelector('.ans-job-finished'));
}

/**
 * @param {HTMLIFrameElement} container the video frame to handle
 */
async function handleVid(container) {
  const player = container.contentDocument.querySelector('.ans-insertvideo-online').contentDocument;
  const play = await waitUntilNotNull(() => player.querySelector('.vjs-big-play-button'));

  return new Promise((resolve) => {
    block('mouseout', window);
    play.click();
    
    const videoEle = player.querySelector('video');
    videoEle.addEventListener('ended', () => {
      resolve();
    }, {once: true});

    if (settings.skipVideoIfPossible) {
      let i = 1;
      function progresser() {
        if (i > 10) {
          clear();
          return;
        }
        
        setTimeout(() => {
          if (videoEle.currentTime < videoEle.duration * (i - 1) / 10 - 4) {
            clear();
            return;
          }
          videoEle.currentTime = videoEle.duration * i / 10 - 3;
          i++;
        }, 1000);
      }
      videoEle.addEventListener('canplaythrough', progresser);

      function clear() {
        videoEle.removeEventListener('canplaythrough', progresser);
      }
    }

    
  });
}

/**
 * Block propagation of a sepecific kind of event
 * @param {string} eventName 
 * @param {Window} window 
 */
function block(eventName, window) {
  window.addEventListener(eventName, (event) => {
      event.stopImmediatePropagation();
  }, false);
}

/**
 * @returns {HTMLLIElement|undefined}
 */
function getNextTab() {
  const tabs = document.getElementById('prev_tab').querySelectorAll('li').values();
  let next, hasActivated = false;
  while (next = tabs.next()) {
    if (next.done) break;
    if (hasActivated) return next.value;
    if (next.value.classList.contains('active')) hasActivated = true;
  }
}

/**
 * Blocks the current coroutine until a given frame is loaded
 * @param {HTMLIFrameElement} frame 
 */
async function waitFrameLoad(frame) {
  const content = await waitUntilNotNull(() => frame.contentDocument);
  return new Promise((res) => {
    function resolve() {
      setTimeout(res, 500);
    }
    
    const detector = setInterval(() => {
      if (content.readyState === 'complete') {
        clearInterval(detector);
        resolve();
      }
    }, 100);
  })
}

/**
 * Wait until something turns to non null
 * @param {Function} resolve wait for what
 */
async function waitUntilNotNull(resolve) {
  return new Promise((res) => {
    const detector = setInterval(() => {
      const value = resolve();
      if (value) {
        clearInterval(detector);
        res(value);
      }
    }, 100);
  })
}


async function waitForPageLoad() {
  const frame = await waitUntilNotNull(() => document.querySelector('iframe'));
  await waitFrameLoad(frame);
}
