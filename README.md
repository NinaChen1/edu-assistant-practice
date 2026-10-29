# 🌱 小芽的科学乐园（AI 学习伙伴）

> 一个面向初中生的「互动探索 + RAG 问答」教育助手 Demo
> 当前主题：初中生物 · 光合作用

## 🔗 在线演示

**👉 [点这里直接体验](https://sprout-science-park.app.workbuddy.host/?sharecode=DEISCEUSOO)**

> 说明：在线演示版为「零额度模式」——提问由本地课程资料库（RAG）直接作答，标注「📖 课程资料回答」，不调用大模型、不消耗任何 API 额度。在本地按下方步骤配置自己的 Key 后，即可体验 DeepSeek 实时生成的完整版本。

## ✨ 项目简介

「小芽的科学乐园」把 AI 问答变成一场科学探索：学生先在**探索实验室**里动手做模拟实验、在**小游戏**里巩固知识，产生疑问后一键「问问小芽」，由后端结合**课程资料检索（RAG）**调用大模型给出有据可依的回答。

核心亮点：

- 🔬 **探索实验室**：光照 / 水分 / 二氧化碳三滑块模拟光合作用（木桶效应模型），观察植物从 🥀 枯萎到 🌳 茁壮的变化；
- 🤔 **RAG 问答**：回答基于本地课程资料检索结果生成，页面明确标注「依据课程资料：xxx」，不编造、不伪装；
- 🧩 **知识配对**：5 组光合作用概念翻牌配对，即时反馈 + 完成总结；
- ⚡ **闪电挑战**：5 道本地判分单选题，答错有提示、不惩罚；
- ⚡ **学习能量**：完成探索 / 游戏获得能量，植物随能量成长（里程碑只奖励一次，防刷）；
- 🛡 **诚实降级**：API 未配置或调用失败时自动退回本地模拟回答，并明确标注来源，绝不把模拟结果冒充 AI 生成。

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python + Flask |
| 大模型 | DeepSeek API |
| RAG | 纯标准库实现：Markdown 按 `##` 切块 + 标题加权的关键词匹配检索（零额外依赖） |
| 前端 | 原生 HTML / CSS / JavaScript，无框架、无构建工具 |

## 📁 项目结构

```
edu-assistant-practice/
├─ app.py                    # Flask 后端：页面路由 + /api/ask 问答接口
├─ retriever.py              # RAG 检索模块：课程资料切块 + 相关度打分
├─ requirements.txt          # Python 依赖清单
├─ .env.example              # 环境变量模板（不含任何真实密钥）
├─ data/
│  └─ course_materials/
│     └─ photosynthesis.md   # 初中生物·光合作用课程资料（RAG 知识源）
├─ templates/
│  └─ index.html             # 页面结构
└─ static/
   ├─ style.css              # 样式
   └─ script.js              # 前端逻辑（fetch 提问、小游戏、能量系统）
```

## 🚀 快速开始

```bash
# 1. 创建虚拟环境（Windows）
python -m venv .venv

# 2. 安装依赖
.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3. 配置密钥：复制 .env.example 为 .env，填入你的 DeepSeek API Key
copy .env.example .env
#   然后编辑 .env：DEEPSEEK_API_KEY=sk-你的密钥

# 4. 启动
.venv\Scripts\python.exe app.py

# 5. 打开浏览器访问 http://127.0.0.1:5000
```

> 没有配置 Key 也能运行：程序会自动降级为本地模拟回答，并在页面上如实标注「模拟回答」。

## 🔒 安全说明

- API Key 只存放在本机 `.env` 文件（已被 `.gitignore` 排除），仅由后端通过环境变量读取，**前端代码零密钥**；
- `.env.example` 只包含变量名模板，可放心公开；
- 日志中不打印任何密钥，错误只按类别记录（如「余额不足」「超时」）。

## 🗺 路线图

- [x] 第一阶段：教育助手网页（输入问题 → 展示回答）
- [x] 第二阶段：Flask 后端接口
- [x] 第三阶段：接入 DeepSeek API（含降级开关与来源标注）
- [x] 第四阶段：课程资料检索（基础 RAG）
- [x] 第五阶段：演示界面打磨（互动实验、小游戏、能量系统）
- [ ] 第六阶段：更多课程主题、检索升级（向量检索）
