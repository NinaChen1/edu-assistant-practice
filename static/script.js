// ============================================================
// 小芽的科学乐园 —— 前端逻辑
// 问答流程：输入/示例/实验提问 → askQuestion() → fetch /api/ask
//           → 渲染回答 + 来源标签 + RAG 依据 → 出错降级提示
// 乐园部分：学习能量、知识配对、闪电挑战（全部本地逻辑，零后端）
// ============================================================

// 先取出页面上要用到的元素
const form = document.getElementById("ask-form");
const input = document.getElementById("question");
const sendBtn = document.getElementById("send-btn");
const chat = document.getElementById("chat");
const hint = document.getElementById("hint");
const suggestions = document.getElementById("suggestions");
const clearBtn = document.getElementById("clear-btn");

// 记住聊天区的初始内容（欢迎消息），清空对话时恢复它
const welcomeHTML = chat.innerHTML;

// ===== 学习能量相关元素 =====
const plantStage = document.getElementById("plant-stage");
const energyFill = document.getElementById("energy-fill");
const energyNum = document.getElementById("energy-num");
const energyStage = document.getElementById("energy-stage");

// ===== 探索实验室相关元素 =====
const labInputs = {
  light: document.getElementById("lab-light"),
  water: document.getElementById("lab-water"),
  co2: document.getElementById("lab-co2"),
};
const labVals = {
  light: document.getElementById("lab-light-val"),
  water: document.getElementById("lab-water-val"),
  co2: document.getElementById("lab-co2-val"),
};
const labPlant = document.getElementById("lab-plant");
const labStatus = document.getElementById("lab-status");
const labAskBtn = document.getElementById("lab-ask");

// ===== 知识配对相关元素 =====
const pairBoard = document.getElementById("pair-board");
const pairProgress = document.getElementById("pair-progress");
const pairFeedback = document.getElementById("pair-feedback");
const pairSummary = document.getElementById("pair-summary");
const pairSummaryText = document.getElementById("pair-summary-text");
const pairAskBtn = document.getElementById("pair-ask");
const pairRestart = document.getElementById("pair-restart");

// ===== 闪电挑战相关元素 =====
const quizList = document.getElementById("quiz-list");
const quizResult = document.getElementById("quiz-result");
const quizResultText = document.getElementById("quiz-result-text");
const quizRestart = document.getElementById("quiz-restart");

// ---------------- 工具函数 ----------------

// 往聊天区追加一条消息；role 是 "user" 或 "bot"
function addMessage(text, role) {
  const wrapper = document.createElement("div");
  wrapper.className = role === "user" ? "msg msg-user" : "msg msg-bot";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  // 用 textContent 而不是 innerHTML：用户输入不会被当成网页代码执行，更安全
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

// 显示“思考中”的三个跳动圆点，返回这个气泡，方便之后替换成真正的回答
function addTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "msg msg-bot";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';

  wrapper.appendChild(bubble);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

// 显示红色提示条
function showHint(message) {
  hint.textContent = message;
  hint.hidden = false;
}

// 隐藏提示条
function hideHint() {
  hint.hidden = true;
  hint.textContent = "";
}

// 切换“请求中”状态：按钮变灰、输入框只读，避免用户重复点击
function setLoading(loading) {
  sendBtn.disabled = loading;
  sendBtn.textContent = loading ? "回答中…" : "发送";
  input.readOnly = loading;
  // 示例问题、清空、实验提问按钮在请求期间也一并禁用
  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.disabled = loading;
  });
  clearBtn.disabled = loading;
  labAskBtn.disabled = loading;
}

// ---------------- 学习能量系统 ----------------

// 能量初始 40；三个里程碑各奖励一次，防止重复点击刷能量
let energy = 40;
const energyAwards = { pair: false, quiz: false, lab: false };

// 根据能量值返回植物成长阶段：发芽 → 幼苗 → 成长 → 开花
function stageInfo() {
  if (energy < 40) return { emoji: "🌱", name: "发芽期" };
  if (energy < 70) return { emoji: "🌿", name: "幼苗期" };
  if (energy < 100) return { emoji: "🌳", name: "成长期" };
  return { emoji: "🌸", name: "开花啦！" };
}

// 把能量渲染到顶部卡片；pulse 为 true 时植物跳一下
function renderEnergy(pulse) {
  energyFill.style.width = energy + "%";
  energyNum.textContent = energy + " / 100";
  const info = stageInfo();
  energyStage.textContent = info.name;
  plantStage.textContent = info.emoji;
  if (pulse) {
    plantStage.classList.remove("pop");
    // 强制浏览器重新计算，让动画能重复播放
    void plantStage.offsetWidth;
    plantStage.classList.add("pop");
  }
}

// 实际增加能量（内部使用）
function addEnergyRaw(amount) {
  energy = Math.min(100, energy + amount);
  renderEnergy(true);
}

// 带里程碑锁的能量奖励：同一个 key 只奖励一次，返回是否真的加了
function awardEnergy(amount, key) {
  if (key && energyAwards[key]) return false;
  if (key) energyAwards[key] = true;
  addEnergyRaw(amount);
  return true;
}

// ---------------- 主流程：问答 ----------------

async function askQuestion(question) {
  hideHint();
  setLoading(true);

  // 立刻把用户的问题显示出来，体验上更即时
  addMessage(question, "user");
  // 同时显示“思考中”
  const typingBubble = addTyping();

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question }),
    });

    // 后端出错时（比如 400/500），响应体可能不是 JSON，所以单独处理
    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error("服务器返回的内容无法解析，请查看后端控制台日志。");
    }

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "请求失败，请稍后重试。");
    }

    // 成功：把“思考中”替换成真正的回答（去掉 Markdown 加粗符号）
    typingBubble.textContent = data.answer.replace(/\*\*/g, "");

    // 明确标注回答来源：AI 生成 / 模拟回答，不伪装
    const tag = document.createElement("span");
    if (data.source === "ai") {
      tag.className = "source-tag source-ai";
      tag.textContent = "DeepSeek AI 生成";
    } else {
      tag.className = "source-tag source-mock";
      tag.textContent = data.fallback_reason
        ? "模拟回答（" + data.fallback_reason + "）"
        : "模拟回答";
    }
    typingBubble.appendChild(tag);

    // RAG 命中的课程资料来源，如"依据课程资料：光合作用的定义"
    if (data.references && data.references.length > 0) {
      const ref = document.createElement("div");
      ref.className = "ref-line";
      ref.textContent = "依据课程资料：" + data.references.join("、");
      typingBubble.appendChild(ref);
    }
  } catch (error) {
    // 失败：移除“思考中”，改为错误气泡 + 顶部提示条
    typingBubble.parentElement.remove();

    const isNetworkError = error instanceof TypeError;
    const msg = isNetworkError
      ? "网络连接失败：请确认 Flask 服务是否仍在运行。"
      : error.message;

    addMessage("⚠ " + msg, "bot");
    showHint(msg);
  } finally {
    // 无论成功失败，都恢复按钮可用
    setLoading(false);
    input.focus();
  }
}

// ---------------- 事件绑定：问答 ----------------

form.addEventListener("submit", function (event) {
  event.preventDefault();

  const question = input.value.trim();

  // 空输入校验：不发送请求，直接提示
  if (!question) {
    showHint("请先输入你的问题，再点发送。");
    input.focus();
    return;
  }

  hideHint();
  input.value = "";
  askQuestion(question);
});

// 用户一开始输入，就把之前的错误提示收起来
input.addEventListener("input", function () {
  if (!hint.hidden) hideHint();
});

// 示例问题：点击后走和手动输入完全相同的 askQuestion 流程
document.querySelectorAll(".chip[data-question]").forEach(function (chip) {
  chip.addEventListener("click", function () {
    if (sendBtn.disabled) return;
    suggestions.style.display = "none";
    askQuestion(chip.dataset.question);
  });
});

// 清空对话：只清除页面聊天记录，不动后端、课程资料和小游戏进度
clearBtn.addEventListener("click", function () {
  if (sendBtn.disabled) return;
  chat.innerHTML = welcomeHTML;
  suggestions.style.display = "";
  hideHint();
  input.value = "";
  input.focus();
});

// ---------------- 四个入口卡片 ----------------

document.querySelectorAll(".entry").forEach(function (entry) {
  entry.addEventListener("click", function () {
    const target = document.getElementById(entry.dataset.target);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    // 高亮一下目标区域，告诉用户“到站了”
    target.classList.add("flash");
    setTimeout(function () {
      target.classList.remove("flash");
    }, 900);
    if (entry.dataset.target === "chat-section") {
      setTimeout(function () {
        input.focus();
      }, 400);
    }
  });
});

// ---------------- 探索实验室 ----------------

// 教学规则（科学依据：光合作用三因子缺一不可，且受最弱一项限制——"木桶效应"）
function labState() {
  const light = Number(labInputs.light.value);
  const water = Number(labInputs.water.value);
  const co2 = Number(labInputs.co2.value);
  const lowest = Math.min(light, water, co2);

  if (light === 0 || water === 0 || co2 === 0) {
    const missing = light === 0 ? "光照" : water === 0 ? "水分" : "二氧化碳";
    return {
      emoji: "🥀",
      cls: "lab-withered",
      text: "小芽枯萎了！因为缺了 " + missing + " ——它是光合作用不可缺少的条件。",
      desc: "缺少了" + missing + "，植物枯萎了",
    };
  }

  if (lowest >= 70) {
    return {
      emoji: "🌳",
      cls: "lab-thriving",
      text: "小芽茁壮成长！光照、水分、二氧化碳都很充足，光合作用开足马力。",
      desc: "光照、水分、二氧化碳都很充足，小芽茁壮成长",
    };
  }

  if (lowest >= 40) {
    const bottleneck =
      lowest === light ? "光照" : lowest === water ? "水分" : "二氧化碳";
    return {
      emoji: "🌱",
      cls: "lab-normal",
      text: "小芽正常生长。不过 " + bottleneck + " 还不够充足，它还能长得更好！",
      desc: "各项条件中等，" + bottleneck + " 稍显不足，小芽正常生长",
    };
  }

  const bottleneck =
    lowest === light ? "光照" : lowest === water ? "水分" : "二氧化碳";
  return {
    emoji: "🌱",
    cls: "lab-weak",
    text: "小芽长得瘦小，因为 " + bottleneck + " 太少了——光合作用被最缺的那一项拖了后腿。",
    desc: bottleneck + " 太少，小芽长得瘦小",
  };
}

// 根据滑块值更新植物显示；同时记住当前状态描述，供“问问小芽”使用
let labDesc = "";
function updateLab() {
  labVals.light.textContent = labInputs.light.value + "%";
  labVals.water.textContent = labInputs.water.value + "%";
  labVals.co2.textContent = labInputs.co2.value + "%";

  const state = labState();
  labPlant.textContent = state.emoji;
  labPlant.className = "lab-plant " + state.cls;
  labStatus.textContent = state.text;
  labDesc = state.desc;

  // 首次把植物养到茁壮 → 奖励能量（只奖一次，防止反复拖滑块刷分）
  if (state.cls === "lab-thriving") {
    awardEnergy(20, "lab");
  }
}

// 把实验状态拼成一句话，走和普通提问完全相同的 askQuestion 流程
function askLab() {
  if (sendBtn.disabled) return;
  const q =
    "我正在做光合作用小实验：光照 " + labInputs.light.value +
    "%、水分 " + labInputs.water.value +
    "%、二氧化碳 " + labInputs.co2.value +
    "%，结果" + labDesc + "。为什么会这样？请结合光合作用需要的原料和条件解释。";
  suggestions.style.display = "none";
  askQuestion(q);
}

Object.values(labInputs).forEach(function (slider) {
  slider.addEventListener("input", updateLab);
});

labAskBtn.addEventListener("click", askLab);

// ---------------- 知识配对小游戏 ----------------

// 5 组配对：概念 ↔ 答案（内容全部来自课程资料，表述准确）
const PAIRS = [
  { a: "光合作用的场所", b: "叶绿体" },
  { a: "光合作用的原料", b: "二氧化碳和水" },
  { a: "光合作用的产物", b: "有机物和氧气" },
  { a: "吸收二氧化碳的门户", b: "气孔" },
  { a: "吸收光能的色素", b: "叶绿素" },
];

let pairFirst = null;   // 当前已翻开的第一张卡
let pairLock = false;   // 翻第二张后的判定期间，禁止点击
let pairMatched = 0;    // 已配对组数

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// 每局开始：把 10 张卡（5 组 × 2 张）打乱放到棋盘上
function startPairGame() {
  pairFirst = null;
  pairLock = false;
  pairMatched = 0;
  pairProgress.textContent = "已配对 0 / " + PAIRS.length;
  pairFeedback.textContent = "";
  pairSummary.hidden = true;
  pairBoard.innerHTML = "";

  const cards = [];
  PAIRS.forEach(function (p, i) {
    cards.push({ pair: i, text: p.a });
    cards.push({ pair: i, text: p.b });
  });
  shuffle(cards);

  cards.forEach(function (c) {
    const card = document.createElement("button");
    card.className = "pair-card";
    card.type = "button";
    card.dataset.pair = c.pair;
    const front = document.createElement("span");
    front.className = "pair-front";
    front.textContent = "❓";
    const back = document.createElement("span");
    back.className = "pair-back";
    back.textContent = c.text;
    card.append(front, back);
    card.addEventListener("click", function () {
      onPairCardClick(card);
    });
    pairBoard.appendChild(card);
  });
}

function onPairCardClick(card) {
  if (pairLock) return;
  if (card.classList.contains("matched") || card.classList.contains("flipped")) return;
  card.classList.add("flipped");

  // 还没有翻开第一张：先记住它
  if (!pairFirst) {
    pairFirst = card;
    return;
  }

  // 翻开第二张：进入判定
  const first = pairFirst;
  pairFirst = null;
  pairLock = true;

  if (first.dataset.pair === card.dataset.pair) {
    // 配对成功：两张卡定格为绿色
    setTimeout(function () {
      first.classList.add("matched");
      card.classList.add("matched");
      first.classList.remove("flipped");
      card.classList.remove("flipped");
      pairMatched++;
      pairProgress.textContent = "已配对 " + pairMatched + " / " + PAIRS.length;
      const p = PAIRS[Number(card.dataset.pair)];
      pairFeedback.textContent = "🎉 配对成功：" + p.a + " ↔ " + p.b;
      pairFeedback.className = "pair-feedback ok";
      pairLock = false;
      if (pairMatched === PAIRS.length) {
        finishPair();
      }
    }, 350);
  } else {
    // 配对失败：抖一抖再翻回去
    pairFeedback.textContent = "❌ 还不是一对，再想想它们之间的联系～";
    pairFeedback.className = "pair-feedback no";
    first.classList.add("shake");
    card.classList.add("shake");
    setTimeout(function () {
      first.classList.remove("flipped", "shake");
      card.classList.remove("flipped", "shake");
      pairLock = false;
    }, 800);
  }
}

// 全部配对成功：显示知识总结，发一次能量奖励
function finishPair() {
  const gained = awardEnergy(30, "pair");
  pairSummaryText.textContent =
    "🎉 全部配对成功！场所、原料、产物、气孔、叶绿素你都记住了。" +
    (gained ? " ⚡学习能量 +30" : "");
  pairSummary.hidden = false;
}

pairRestart.addEventListener("click", startPairGame);
pairAskBtn.addEventListener("click", function () {
  if (sendBtn.disabled) return;
  suggestions.style.display = "none";
  // 把配对学到的知识点转成一个问题，交给现有 RAG 问答流程
  askQuestion("请帮我总结：光合作用的场所、原料和产物分别是什么？");
});

// ---------------- 闪电挑战 ----------------

// 5 道单选题：内容与课程资料一致，带提示和解析
const QUIZ = [
  {
    q: "光合作用发生的场所是？",
    opts: ["线粒体", "叶绿体", "细胞核", "细胞壁"],
    a: 1,
    hint: "叶片为什么是绿色的？想想叶绿体里的色素。",
    exp: "光合作用在叶绿体中进行，叶绿素就藏在叶绿体里。",
  },
  {
    q: "光合作用需要的原料是？",
    opts: ["二氧化碳和水", "氧气和葡萄糖", "只有阳光", "土壤里的肥料"],
    a: 0,
    hint: "记忆口诀：原料「二氧和水」。",
    exp: "二氧化碳通过气孔进入，水由根从土壤吸收后运来。",
  },
  {
    q: "光合作用释放到空气中的气体是？",
    opts: ["二氧化碳", "氮气", "氧气", "水蒸气"],
    a: 2,
    hint: "它能让快要熄灭的卫生香复燃。",
    exp: "光合作用释放氧气，助燃正是氧气的特性。",
  },
  {
    q: "下列哪一项不是光合作用必需的条件？",
    opts: ["光", "叶绿体", "二氧化碳", "黑暗的环境"],
    a: 3,
    hint: "反过来想：没有光，光合作用还能进行吗？",
    exp: "光、叶绿体、二氧化碳和水都是必需的，黑暗恰恰不行。",
  },
  {
    q: "叶片大多呈现绿色的原因是？",
    opts: ["细胞壁是绿色的", "含有叶绿素", "反射了所有光线", "吸收了绿光"],
    a: 1,
    hint: "叶绿体里有一种专门吸收光能的色素。",
    exp: "叶绿素呈绿色，所以叶片看起来是绿色的。",
  },
];

let quizAnswered = 0;
let quizCorrect = 0;
let quizFirstTry = 0;

// 每轮开始：按题库重新生成题目
function startQuiz() {
  quizAnswered = 0;
  quizCorrect = 0;
  quizFirstTry = 0;
  quizResult.hidden = true;
  quizList.innerHTML = "";

  QUIZ.forEach(function (item, qi) {
    const block = document.createElement("div");
    block.className = "quiz-q";

    const title = document.createElement("p");
    title.className = "quiz-q-title";
    title.textContent = qi + 1 + ". " + item.q;

    const opts = document.createElement("div");
    opts.className = "quiz-opts";

    const hintBtn = document.createElement("button");
    hintBtn.className = "quiz-hint-btn";
    hintBtn.type = "button";
    hintBtn.textContent = "💡 看提示";
    const hintP = document.createElement("p");
    hintP.className = "quiz-hint";
    hintP.hidden = true;
    hintP.textContent = "提示：" + item.hint;
    hintBtn.addEventListener("click", function () {
      hintP.hidden = false;
    });

    const feedback = document.createElement("p");
    feedback.className = "quiz-feedback";
    feedback.hidden = true;

    let solved = false;
    let attempts = 0;

    item.opts.forEach(function (text, oi) {
      const opt = document.createElement("button");
      opt.className = "opt";
      opt.type = "button";
      opt.textContent = String.fromCharCode(65 + oi) + ". " + text;

      opt.addEventListener("click", function () {
        if (solved) return;

        if (oi === item.a) {
          // 答对：绿色定格，展示解析
          solved = true;
          attempts++;
          quizAnswered++;
          quizCorrect++;
          if (attempts === 1) quizFirstTry++;
          opt.classList.add("correct");
          block.classList.add("done");
          opts.querySelectorAll(".opt").forEach(function (o) {
            o.disabled = true;
          });
          hintBtn.disabled = true;
          feedback.textContent = "✅ 答对啦！" + item.exp;
          feedback.hidden = false;
          if (quizAnswered === QUIZ.length) {
            finishQuiz();
          }
        } else {
          // 答错：标红这个选项，自动亮出提示，鼓励再试，不惩罚
          attempts++;
          opt.classList.add("wrong");
          opt.disabled = true;
          hintP.hidden = false;
          feedback.textContent = "再想一想！提示已经帮你点亮了 💡（答错不扣分）";
          feedback.hidden = false;
        }
      });

      opts.appendChild(opt);
    });

    block.append(title, opts, hintBtn, hintP, feedback);
    quizList.appendChild(block);
  });
}

// 全部答完：显示得分、掌握情况，发一次能量奖励
function finishQuiz() {
  let mastery;
  if (quizCorrect === QUIZ.length) {
    mastery = "🏆 全部答对，你就是光合作用小专家！";
  } else if (quizCorrect >= 3) {
    mastery = "👍 掌握得不错！错题的解析再看一眼就完美了。";
  } else {
    mastery = "💪 别灰心！读一读每题解析，再去问答区问问小芽。";
  }

  let energyNote = "";
  if (!energyAwards.quiz) {
    const amount = quizCorrect >= 3 ? 30 : 15;
    energyAwards.quiz = true;
    addEnergyRaw(amount);
    energyNote = " ⚡学习能量 +" + amount;
  }

  quizResultText.textContent =
    "⚡ 本轮得分：" + quizCorrect + " / " + QUIZ.length +
    "（首次尝试答对 " + quizFirstTry + " 题）。" + mastery + energyNote;
  quizResult.hidden = false;
}

quizRestart.addEventListener("click", startQuiz);

// ---------------- 初始化 ----------------

updateLab();
renderEnergy(false);
startPairGame();
startQuiz();
