"""Structured field extraction + auto-create-project tests (A6 + A7)."""
from __future__ import annotations

from app.models import Project
from app.services.blueprint import extract_fields
from app.services.ingestion import _create_project_from_fields, _next_project_id

FILLED = """
# AI Agent 開發規劃書

## 文件資訊

| 欄位 | 內容 |
| --- | --- |
| Agent 名稱 | 智慧合約稽核 Agent |
| 提案人 / 部門 | 陳柏宇 / 法務科技部 |
| 日期 / 版本 | 2026/06/17 / v0.1 |

## 一、目標（Goal）
- 一句話定位:自動標記合約高風險條款並輸出建議。

## 二、範圍（Scope）
- 納入範圍:供應商合約審閱。

## 三、時程與里程碑
| M1 設計 | 2026/07 | 設計稿 |

## 四、風險
資料來源不一致導致解析失敗。

## 五、資源需求
- 人力:兩名工程師
"""

# The template file itself is full of placeholders → should NOT yield a name.
PLACEHOLDER_ONLY = """
| Agent 名稱 | `[例:信用風險評估 Agent]` |
| 提案人 / 部門 | `[姓名] / [部門]` |

## 一、目標（Goal）★必填
- 一句話定位:`[這個 Agent 解決什麼問題]`
"""


def test_extract_filled_blueprint():
    f = extract_fields(FILLED)
    assert f.agent_name == "智慧合約稽核 Agent"
    assert f.proposer == "陳柏宇"
    assert f.department == "法務科技部"
    assert "高風險條款" in f.goal
    assert "供應商合約" in f.scope
    assert f.resource  # 人力 line captured


def test_placeholders_are_not_treated_as_values():
    f = extract_fields(PLACEHOLDER_ONLY)
    assert f.agent_name == ""
    assert f.goal == ""


def test_next_project_id_continues_sequence(db):
    db.add(Project(project_id="PROJ-006", name="x", owner_id="o", department="d",
                   last_update_timestamp=__import__("datetime").datetime.utcnow()))
    db.commit()
    assert _next_project_id(db) == "PROJ-007"


def test_create_project_from_fields(db):
    fields = extract_fields(FILLED)
    project = _create_project_from_fields(db, fields)
    db.commit()
    assert project.project_id == "PROJ-001"
    assert project.name == "智慧合約稽核 Agent"
    assert project.department == "法務科技部"
    assert db.query(Project).count() == 1
