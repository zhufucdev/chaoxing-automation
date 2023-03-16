// ==UserScript==
// @name         超星自动化
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  自动刷网课工具，但非常高级
// @author       You
// @run-at       document-end
// @grant        GM_getResourceText
// @grant        unsafeWindow
// @match        https://mooc1.chaoxing.com/mycourse/*
// @require      https://cdn.jsdelivr.net/gh/photopea/Typr.js@15aa12ffa6cf39e8788562ea4af65b42317375fb/src/Typr.min.js
// @require      https://cdn.jsdelivr.net/gh/photopea/Typr.js@f4fcdeb8014edc75ab7296bd85ac9cde8cb30489/src/Typr.U.min.js
// @require      https://cdn.bootcss.com/blueimp-md5/2.12.0/js/md5.min.js
// @resource     Table https://www.forestpolice.org/ttf/2.0/table.json
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chaoxing.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    startInjection().catch((reason) => {
        notify(`咋回事？ ${reason}`, 'error');
    });
})();

let settings = {
    skipVideoIfPossible: true
}

async function startInjection() {
    console.log('Chaoxing Automation: injection started');
    const ignored = [];

    while (true) {
        console.log('Chaoxing Automation: next course');
        await waitForPageLoad();

        const next = getNextCourseNode(ignored);
        if (!next) {
            notify('学完了 太牛逼了');
            break;
        }

        next.click();

        while (true) {
            await waitForPageLoad();

            function ignoreCurrent() {
                if (!ignored.includes(next.textContent)) {
                    ignored.push(next.textContent);
                    next.style.color = 'orange';
                }
            }

            await handlePage(document.querySelector('.course_main'), ignoreCurrent);

            const nextTab = getNextTab();
            if (nextTab) {
                nextTab.click();
            } else {
                break;
            }
        }
    }
}

async function handlePage(courseMain, ignore) {
    if (!courseMain.querySelector('.ans-attach-ct')) {
        const frame = courseMain.querySelector('iframe');
        if (!frame) {
            notify('什么？空页面？', 'error');
        } else {
            await handlePage(frame.contentDocument, ignore);
        }
    } else {
        let containsUnknown = false;
        const retry = [];
        for (const item of courseMain.querySelectorAll('iframe')) {
            const result = await handleItem(item);

            switch (result) {
                case 'unknown':
                    containsUnknown = true;
                    break;
                case 'retry':
                    retry.push(item);
                    break;
            }
        }

        if (retry.length > 0) {
            notify('有些东西得再试一次', 'warn');
            for (const item of retry) {
                retry.style.background = 'orange';
            }
            let notWorking = false;
            for (const item of retry) {
                const result = await handleItem(item);
                if (result !== 'done') {
                    notWorking = true;
                }
            }
            if (notWorking) {
                notify('又出问题，不干了');
                ignore();
            }
        }

        if (containsUnknown) {
            notify('有些东西不知道是啥，跳过', 'warn');
            ignore();
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
    if (item.classList.contains('ans-insertvideo-online')) {
        console.log('Chaoxing Automation: handle video');
        await handleVid(item);
    } else if (item.hasAttribute('jobid') && item.getAttribute('jobid').toLowerCase().startsWith("work")) {
        console.log('Chaoxing Automation: handle quiz');
        await handleQuiz(item);
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
            if (node.childElementCount === 1 && node.children[0].tagName === 'DIV'
                && node.children[0].childElementCount > 0 && node.children[0].children[0].tagName === 'SPAN'
                && node.children[0].children[0].classList.contains('posCatalog_name')) {
                const target = node.children[0].children[0];
                if (!ignored.includes(target.textContent)) {
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
 * @param {HTMLIFrameElement|HTMLDivElement} container the container to judege
 * @returns {Boolean}
 */
function isCheckpointDone(container) {
    if (container.tagName === 'DIV' && container.classList.contains('ans-attach-ct'))
        return Boolean(container.classList.contains('ans-job-finished'));

    return Boolean(isCheckpointDone(container.parentElement));
}

/**
 * @param {HTMLIFrameElement} container the video frame to handle, should be loaded
 */
async function handleVid(container) {
    const player = container.contentDocument;
    const play = player.querySelector('.vjs-big-play-button');

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
                        notify('无法快进', 'warn');
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
 * @param {HTMLIFrameElement} item the quiz frame to handle, should be loaded
 */
async function handleQuiz(item) {
    const container = await waitFrameLoad(item.contentDocument.getElementById('frame_content'));
    const quiz = container.querySelectorAll('.TiMu');
    for (const q of quiz) {
        const parsed = parseQuiz(q);
        console.log(parsed);
    }
}

/**
 * Block propagation of a sepecific kind of event
 * @param {string} eventName
 * @param {Window} window
 */
function block(eventName, window) {
    window.addEventListener(eventName, (event) => {
        event.stopImmediatePropagation();
    }, true);
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
 * @returns {Promise<Document>} the frame's content document
 */
async function waitFrameLoad(frame) {
    return new Promise((res) => {
        function resolve(content) {
            setTimeout(() => res(content), 500);
        }

        const detector = setInterval(() => {
            const content = frame.contentDocument;
            if (content && content.readyState === 'complete') {
                clearInterval(detector);
                resolve(content);
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

const decryptFont = function () {
    let cache = {};

    /**
     * @param scope {Document}
     */
    function getMap(scope) {
        if (cache.scope === scope.documentURI) {
            return cache.map;
        }

        const style = scope.evaluate(`//style[contains(text(), "font-cxsecret")]`, scope).iterateNext();
        const font = style.textContent.match(/base64,([\w\W]+?)'/)[1];

        let map = {};
        const data = window.atob(font);
        const buffer = new Uint8Array(data.length);
        for (let i = 0; i < data.length; ++i) {
            buffer[i] = data.charCodeAt(i);
        }

        const parsed = Typr.parse(buffer)[0];
        const table = JSON.parse(GM_getResourceText('Table'));

        for (let i = 19968; i < 40870; i++) {
            const glyph = Typr.U.codeToGlyph(parsed, i);
            if (!glyph) continue;
            const path = Typr.U.glyphToPath(parsed, glyph);
            const hash = md5(JSON.stringify(path)).slice(24);
            map[i] = table[hash];
        }
        cache = {
            map, scope: scope.documentURI
        };
        return map;
    }

    /**
     * The Chaoxing has a ttf-based font encryption,
     * which I don't really understand.
     *
     *
     * So I copied other people's work
     *
     * @param char one string bit to decrypt
     * @param scope {Document} where the decryption happens
     */
    return function (char, scope) {
        const decrypted = getMap(scope)[char.charCodeAt(0)];
        if (decrypted) {
            return String.fromCharCode(decrypted);
        }
        return char;
    }
}();

/**
 * Abstracts a quiz dom element
 * @param {HTMLDivElement} quiz the .TiMu element
 * @returns {Quiz|undefined}
 */
function parseQuiz(quiz) {
    let decrypted = "";
    const encrypted = quiz.textContent;
    for (let i = 0; i < quiz.textContent.length; i++) {
        const char = decryptFont(encrypted.charAt(i), quiz.ownerDocument);
        if (!isEmpty(char))
            decrypted += char;
    }

    const lines = decrypted.split('\n').filter(line => !isEmpty(line));
    let type = 'unknown';
    for (const line of lines) {
        if (line.includes('单选')) {
            type = 'single';
        } else if (line.includes('多选')) {
            type = 'multi';
        } else if (line.includes('判断')) {
            type = 'tof';
        }
        if (type !== 'unknown') {
            break;
        }
    }

    let title;
    const options = [];
    for (const line of lines) {
        let remaining = line;
        const matchSign = line.match(/^([A-Z])/);
        if (matchSign) {
            const sign = matchSign[1];
            remaining = line.substring(sign.length + 1).trim();
        }
        const matchPrefix = remaining.match(/^([.。、]|[0-9]+) */);
        if (matchPrefix) {
            remaining = remaining.substring(matchPrefix[1].length + 1);
        }
        // now remains the quiz body
        if (remaining.length > 0) {
            if (title) options.push(remaining);
            else title = remaining;
        }
    }
    switch (type) {
        case 'single':
            return new SingleSelection(title, options);
        case 'multi':
            return new MultiSelection(title, options);
        case 'tof':
            return new TrueOrFalseQuiz(title);
    }
}

/**
 * @param str {string}
 * @returns {boolean}
 */
function isEmpty(str) {
    return Boolean(str.match(/^[  \t]*$/));
}

class Quiz {
    constructor(title, type) {
        this.title = title;
        this.type = type;
    }
}

class TrueOrFalseQuiz extends Quiz {
    constructor(title) {
        super(title, 'tof');
    }

    #answer = false;

    /**
     * @returns {boolean} corrsponding to the answer
     */
    answer() {
        return this.#answer;
    }

    /**
     * @param {boolean} correct the answer to fill in
     */
    setAnswer(correct) {
        this.#answer = correct;
    }
}

class SelectionQuiz extends Quiz {
    constructor(title, selections, type) {
        super(title, type);
        this.#options = selections;
    }

    #options = [];

    options() {
        return [...this.#options];
    }
}

class SingleSelection extends SelectionQuiz {
    constructor(title, selections) {
        super(title, selections, 'sigma');
    }

    #choice = -1

    /**
     * @returns {number} corrsponding to two or more options
     */
    answer() {
        return this.#choice;
    }

    /**
     *
     * @param {number} choice the answer to fill in
     */
    setAnswer(choice) {
        this.#choice = choice;
    }
}

class MultiSelection extends SelectionQuiz {
    constructor(title, selections) {
        super(title, selections, 'multi');
    }

    #choices = [];

    /**
     * @returns {number[]}
     */
    answer() {
        return [...this.#choices];
    }

    /**
     * @param  {...number} choices the answer to fill in
     */
    setAnswer(...choices) {
        this.#choices = choices;
    }
}