"""
最小可用 RAG 的检索模块（不依赖任何第三方库）

思路：
1. 启动时把 data/course_materials/ 下所有 .md 文件读进来，
   按 "## 标题" 切成一个个知识块（每个块能独立回答一个具体问题）；
2. 用户提问时，把问题切成交叠的"二字组"（中文最简单的分词替代方案），
   和每个知识块的文本做匹配，重合越多得分越高；
3. 返回得分最高的前 1~2 个知识块，交给 DeepSeek 作为回答依据。

单文档演示场景下，这种关键词检索简单可靠；以后资料多了再升级成向量检索。
"""

import re
from pathlib import Path

# 课程资料目录（项目根目录/data/course_materials）
DATA_DIR = Path(__file__).parent / "data" / "course_materials"


def load_blocks():
    """读取所有课程资料，按二级标题切成知识块列表。"""
    blocks = []
    for md_file in sorted(DATA_DIR.glob("*.md")):
        text = md_file.read_text(encoding="utf-8")

        # 在每个 "## " 标题前切开；文件开头（标题、适用年级等）也算一块
        parts = re.split(r"\n(?=## )", text)
        for part in parts:
            part = part.strip()
            if not part:
                continue
            match = re.match(r"## (.+)", part)
            if match:
                title = match.group(1).strip()
            else:
                title = "课程简介"
            blocks.append({
                "title": title,
                "content": part,
                "source": md_file.name,
            })
    return blocks


def _bigrams(text: str):
    """把文本转成汉字二元组集合，例如'光合作用'→{'光合','合作','作用'}。"""
    # 只保留中文、字母、数字，去掉标点、空格和 Markdown 符号
    cleaned = re.sub(r"[^\u4e00-\u9fff a-zA-Z0-9]", "", text.lower())
    cleaned = re.sub(r"\s+", "", cleaned)
    if len(cleaned) < 2:
        return {cleaned} if cleaned else set()
    return {cleaned[i:i + 2] for i in range(len(cleaned) - 1)}


def search(question: str, top_k: int = 2):
    """
    检索与问题最相关的知识块。
    打分规则：标题命中一个词组得 3 分，正文命中得 1 分——
    因为标题最能代表小节主题，避免正文反复出现同一个词导致误判。
    最高分低于 3 分视为"资料里没有相关内容"，返回空列表。
    返回 [{"title":..., "content":..., "source":...}, ...]
    """
    q_grams = _bigrams(question)
    if not q_grams:
        return []

    scored = []
    for block in BLOCKS:
        title_matches = sum(1 for gram in q_grams if gram in block["title"])
        content_matches = sum(1 for gram in q_grams if gram in block["content"])
        score = title_matches * 3 + content_matches
        if score > 0:
            scored.append((score, block))

    if not scored:
        return []

    # 无关问题（得分过低）不返回资料，让后端走通用回答
    scored.sort(key=lambda x: -x[0])
    if scored[0][0] < 3:
        return []

    return [block for score, block in scored[:top_k] if score >= 2]


# 服务启动时加载一次，之后一直复用（避免每次提问都读文件）
BLOCKS = load_blocks()
