"""
教育助手 Demo —— 第三阶段：接入 DeepSeek API
  - 访问 /         → 返回网页（templates/index.html）
  - 请求 /api/ask  → 接收问题，返回 JSON 回答

回答来源（通过返回 JSON 里的 source 字段区分，绝不伪装）：
  - source = "ai"   → DeepSeek 真实生成的回答
  - source = "mock" → 本地模拟回答（没配 Key / 调用失败时自动降级）

安全设计：
  - API Key 只从 .env 读取，不写进代码、不打印、不进日志
  - 任何调用失败都只记录「错误类别」，不记录密钥
"""

import json
import os
import re
import urllib.error
import urllib.request
from socket import timeout

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

import retriever  # 本项目的课程资料检索模块（最小 RAG）

# 读取项目根目录的 .env（密钥只存在这一个地方）
load_dotenv()

DEEPSEEK_API_KEY = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_BASE_URL = (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").strip().rstrip("/")
DEEPSEEK_MODEL = (os.getenv("DEEPSEEK_MODEL") or "deepseek-chat").strip()

# 调用 DeepSeek 的超时时间（秒）：演示场景不宜等太久
REQUEST_TIMEOUT = 30

app = Flask(__name__)


# ---------------------------------------------------------------
# 调用 DeepSeek Chat API（官方接口：POST {base_url}/chat/completions）
# 成功返回 (回答文本, None)；失败返回 (None, 错误类别说明)
# 注意：绝不打印或记录 API Key
# ---------------------------------------------------------------
def call_deepseek(question: str, context: str = None):
    url = DEEPSEEK_BASE_URL + "/chat/completions"

    # 系统提示：告诉模型它是教育助手，以及如何使用课程资料
    system_content = (
        "你是一个面向学生的学习助手，名叫「教育助手」。"
        "请用简洁、分步骤、适合初学者的中文回答，"
        "先给一句直接结论，再展开讲解，最后给一条学习建议。"
    )
    if context:
        # RAG 模式：把检索到的课程资料交给模型，要求只依据资料回答
        system_content += (
            "\n\n以下是课程资料，请优先依据资料内容回答；"
            "资料中没有涉及的内容可以补充通用知识，但不要与资料冲突，"
            "也不要编造资料里不存在的结论：\n\n" + context
        )

    payload = json.dumps({
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": question},
        ],
        # 限制回答长度，演示更快也更省额度
        "max_tokens": 500,
        "temperature": 0.7,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + DEEPSEEK_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        answer = data["choices"][0]["message"]["content"].strip()
        if not answer:
            return None, "DeepSeek 返回了空回答"
        return answer, None

    except urllib.error.HTTPError as e:
        # 只按状态码归类错误，不打印响应里可能包含的敏感信息
        if e.code in (401, 403):
            return None, "API Key 无效或无权限"
        if e.code == 402:
            return None, "API 余额不足"
        if e.code == 429:
            return None, "请求过于频繁（触发限流）"
        return None, "DeepSeek 服务异常（HTTP %d）" % e.code

    except timeout:
        return None, "请求超时（%d 秒）" % REQUEST_TIMEOUT

    except urllib.error.URLError:
        return None, "网络连接失败，无法访问 DeepSeek 服务"

    except (KeyError, IndexError, ValueError):
        return None, "DeepSeek 返回格式异常"


# ---------------------------------------------------------------
# 模拟回答：作为降级兜底，保证任何情况下页面都有内容
# ---------------------------------------------------------------
def make_mock_answer(question: str) -> str:
    q = question.lower()

    if "光合作用" in question:
        return (
            "光合作用是绿色植物利用阳光，把二氧化碳和水转化成有机物（葡萄糖），"
            "并释放氧气的过程。可以记成三步：\n"
            "1) 叶绿体吸收光能；\n"
            "2) 把光能转成化学能，固定二氧化碳；\n"
            "3) 生成葡萄糖，同时放出氧气。\n"
            "（这是 Demo 的模拟回答，接入模型后会变成实时生成的内容。）"
        )

    if "函数" in question:
        return (
            "函数可以理解成一台「加工机器」：你投入原料（参数），"
            "它按固定规则处理，最后吐出成品（返回值）。\n"
            "比如 f(x) = x + 1，输入 3 就输出 4。好处是同样的逻辑写一次，可以反复调用。\n"
            "（这是 Demo 的模拟回答。）"
        )

    if any(word in q for word in ["python", "列表", "循环"]):
        return (
            "Python 是一门语法接近自然语言的编程语言。学习顺序建议：\n"
            "变量 → 条件判断 → 循环 → 列表/字典 → 函数 → 文件读写。\n"
            "每个知识点都配一个小练习，比只看教程有效得多。\n"
            "（这是 Demo 的模拟回答。）"
        )

    if "谢谢" in question or "thank" in q:
        return "不客气！有不懂的随时问我。（这是 Demo 的模拟回答。）"

    return (
        f"关于「{question}」，我目前还是 Demo 版本，只能给出示例回答。\n"
        "正式版本会自动拆解问题、给出分步骤讲解并附上练习建议。\n"
        "（模拟数据，未接入大模型。）"
    )


# ---------------------------------------------------------------
# 课程资料回答：没配 API Key 时，若 RAG 检索命中了课程资料，
# 直接用资料原文作答——零 token 消耗，且内容真实来自资料库
# ---------------------------------------------------------------
def make_material_answer(context: str) -> str:
    return (
        "根据课程资料，回答如下：\n\n" + context +
        "\n\n（以上内容摘自课程资料库，未调用大模型。）"
    )


# ---------------------------------------------------------------
# 统一入口：有 Key 就先试真实 AI，失败自动降级；
# 没配 Key 时优先用检索到的课程资料作答，无命中再用模拟话术
# 返回 (回答, 来源, 降级原因)
# ---------------------------------------------------------------
def get_answer(question: str, context: str = None):
    if not DEEPSEEK_API_KEY:
        if context:
            # 资料库里有相关内容：直接依据资料回答，不花任何 token
            return make_material_answer(context), "material", None
        return make_mock_answer(question), "mock", "未配置 API Key"

    answer, error = call_deepseek(question, context)
    if answer is not None:
        return answer, "ai", None

    # 调用失败：记录错误类别（不含密钥），降级为模拟回答
    app.logger.warning("DeepSeek 调用失败，已降级为模拟回答。原因：%s", error)
    return make_mock_answer(question), "mock", error


# ---------------------------------------------------------------
# 路由 1：首页，返回网页
# ---------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------
# 路由 2：问答接口（保持原有请求/返回结构，新增 source 字段）
# ---------------------------------------------------------------
@app.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json(silent=True) or request.form
    question = (data.get("question") or "").strip()

    if not question:
        return jsonify({"ok": False, "error": "问题不能为空，请输入你想问的内容。"}), 400

    if len(question) > 500:
        return jsonify({"ok": False, "error": "问题太长了，请控制在 500 字以内。"}), 400

    # ---- RAG 第一步：检索最相关的课程资料（标题一起带上，便于展示出处） ----
    blocks = retriever.search(question)
    # 块内容自带 "## 标题" 行，与【标题】重复，去掉首行标题
    context = "\n\n---\n\n".join(
        "【" + b["title"] + "】\n" + re.sub(r"^##[^\n]*\n*", "", b["content"]).strip()
        for b in blocks
    ) if blocks else None
    references = [b["title"] for b in blocks]

    # ---- 第二步：把资料交给模型生成回答（失败自动降级） ----
    answer, source, fallback_reason = get_answer(question, context)

    return jsonify({
        "ok": True,
        "question": question,
        "answer": answer,
        "source": source,             # "ai" = DeepSeek 真实生成；"mock" = 本地模拟
        "fallback_reason": fallback_reason,  # 降级原因（正常时为 null）
        "references": references,     # RAG 命中的课程资料小节标题
    })


if __name__ == "__main__":
    # 云部署沙箱通过 PORT 环境变量指定端口；本地默认 5000
    port = int(os.environ.get("PORT") or 5000)
    # 仅在显式设置 FLASK_DEBUG=1 时开启调试自动重载（线上必须关闭）
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true")
    app.run(host="0.0.0.0", port=port, debug=debug)
