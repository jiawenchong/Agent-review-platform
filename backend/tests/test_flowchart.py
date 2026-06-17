"""Flowchart generation tests — structured parse + inferred fallback."""
from __future__ import annotations

from app.services.flowchart import generate_flowchart, parse_structured

STRUCTURED = """
## 流程定義
- S1 [start] 開始
- S2 [process] 接收上傳規劃書 -> S3
- S3 [decision] 文件解析成功? -> 是:S4 | 否:S9
- S4 [process] AI 評審中心判讀 -> S5
- S5 [decision] 評審綠燈? -> 綠燈:S6 | 紅燈:S9
- S6 [process] 同步至 KANBAN -> S7
- S7 [end] 進入進度監控
- S9 [end] 退件
"""

FREEFORM = """
一、專案背景與目標
二、整體架構設計
三、Decision Flow
四、紅線設定
五、為什麼需要 LLM
"""


def test_structured_parse_counts_nodes():
    nodes = parse_structured(STRUCTURED)
    assert len(nodes) == 8
    s3 = next(n for n in nodes if n.id == "S3")
    assert s3.type == "decision"
    assert ("是", "S4") in s3.transitions
    assert ("否", "S9") in s3.transitions


def test_structured_mode_and_mermaid():
    result = generate_flowchart(STRUCTURED)
    assert result.mode == "structured"
    assert result.mermaid.startswith("flowchart TD")
    assert "S1([" in result.mermaid          # start = stadium
    assert "S3{" in result.mermaid           # decision = rhombus
    assert "-->|是|" in result.mermaid        # branch label


def test_inferred_fallback_from_headings():
    result = generate_flowchart(FREEFORM)
    assert result.mode == "inferred"
    assert result.mermaid.startswith("flowchart TD")
    # start + 5 sections + end
    assert result.node_count == 7
    assert "專案背景與目標" in result.mermaid


def test_empty_text_still_produces_minimal_flow():
    result = generate_flowchart("一段沒有任何標題或步驟的純文字內容。")
    assert result.mode == "inferred"
    assert result.node_count >= 3
    assert result.mermaid.startswith("flowchart TD")
