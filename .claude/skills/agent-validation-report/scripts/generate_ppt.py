#!/usr/bin/env python3
"""
generate_ppt.py  —  AI Agent Validation Report (template-fill approach)

Usage:
  python generate_ppt.py [input.json] [output.pptx]

Loads reference/template.pptx and replaces text content slide-by-slide
using key-value data from input.json.  All images, colours, fonts, and
layout shapes are preserved from the template exactly as-is.

Slides filled:
  1  Cover
  2  Agent Goal Definition
  3  Data Sources & Tools
  4  Decision Logic & Flow  (fills the left table; right flow diagram untouched)
  5  Guardrails & Red Lines
  6  Golden Test Cases
  7  Task Completion Capability
  8  Offline Validation
  9  Online Validation
"""

import sys
import json
from pathlib import Path

try:
    from pptx import Presentation
except ImportError:
    sys.exit("python-pptx not installed.  Run: pip install python-pptx")

SCRIPT_DIR = Path(__file__).parent
TEMPLATE = SCRIPT_DIR.parent / "reference" / "template.pptx"


# ── data helpers ──────────────────────────────────────────────────────────────

def load_data(path):
    if path is None:
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def v(data, *keys):
    """Return value at nested keys, or '[待補]' if missing / empty string."""
    val = data
    for k in keys:
        if not isinstance(val, dict):
            return "[待補]"
        val = val.get(k)
    if val is None or val == "":
        return "[待補]"
    return str(val)


# ── text-replacement helpers ──────────────────────────────────────────────────

def _set_para(para, text):
    """Overwrite a paragraph: first run gets new text, rest are cleared."""
    runs = list(para.runs)
    if runs:
        runs[0].text = text
        for r in runs[1:]:
            r.text = ""
    else:
        para.add_run().text = text


def fill_tf(shape, text):
    """Replace all text in a text-frame with a single string.
    First paragraph gets the text; extra paragraphs are blanked."""
    if not shape.has_text_frame:
        return
    paras = list(shape.text_frame.paragraphs)
    if not paras:
        return
    _set_para(paras[0], text)
    for p in paras[1:]:
        _set_para(p, "")


def fill_tf_lines(shape, *lines):
    """Map each positional arg to the corresponding paragraph in the text-frame."""
    if not shape.has_text_frame:
        return
    paras = list(shape.text_frame.paragraphs)
    for i, line in enumerate(lines):
        if i < len(paras):
            _set_para(paras[i], line)
    for p in paras[len(lines):]:
        _set_para(p, "")


def fill_cell(table, row, col, text):
    """Set text in a single table cell (first paragraph)."""
    try:
        cell = table.rows[row].cells[col]
    except IndexError:
        return
    paras = list(cell.text_frame.paragraphs)
    if paras:
        _set_para(paras[0], text)
        for p in paras[1:]:
            _set_para(p, "")
    else:
        cell.text_frame.add_paragraph().add_run().text = text


def find(slide, name):
    for s in slide.shapes:
        if s.name == name:
            return s
    return None


def _fill_indexed(slide, shape_names, values):
    """Fill a list of shapes with corresponding values from a list.
    Extra shapes are cleared; missing values leave shapes untouched."""
    for i, name in enumerate(shape_names):
        s = find(slide, name)
        if s:
            fill_tf(s, values[i] if i < len(values) else "")


def tbl(slide, name):
    s = find(slide, name)
    return s.table if s and s.shape_type == 19 else None


# ── per-slide fillers ─────────────────────────────────────────────────────────

def slide1(sl, d):
    """Cover: title / subtitle / reporter / department / date"""
    s = find(sl, "標題 2")
    if s:
        fill_tf(s, v(d, "title"))

    s = find(sl, "文字方塊 5")
    if s:
        fill_tf(s, v(d, "subtitle"))

    s = find(sl, "文字版面配置區 2")
    if s:
        fill_tf_lines(
            s,
            f"報告人: {v(d, 'info', 'reporter')}",
            v(d, "info", "department"),
            v(d, "info", "date"),
        )


def slide2(sl, d):
    """Agent Goal Definition: project info table + metrics panel + process flowchart"""
    t = tbl(sl, "表格 2")
    if t:
        fill_cell(t, 0, 1, v(d, "project_desc"))
        fill_cell(t, 1, 1, v(d, "agent_role"))
        fill_cell(t, 2, 1, "")          # second agent-role row — leave blank
        fill_cell(t, 3, 1, v(d, "mission"))
        fill_cell(t, 4, 1, v(d, "trigger"))
        fill_cell(t, 5, 1, v(d, "success_threshold"))

    s = find(sl, "文字方塊 87")
    if s:
        fill_tf(s, v(d, "success_threshold"))

    s = find(sl, "文字方塊 10")
    if s:
        fill_tf(s, v(d, "project_metrics"))

    # Bottom process flowchart: Trigger source label
    s = find(sl, "文字方塊 176")
    if s:
        fill_tf(s, v(d, "trigger_source"))

    # Perception phase boxes (矩形 129, 130)
    perception = d.get("perception") or []
    _fill_indexed(sl, ["矩形 129", "矩形 130"], perception)

    # Reasoning phase boxes (矩形 9, 矩形 132, 矩形 133)
    reasoning = d.get("reasoning") or []
    _fill_indexed(sl, ["矩形 9", "矩形 132", "矩形 133"], reasoning)

    # Action phase boxes (矩形 134, 矩形 135, 矩形 136)
    action = d.get("action") or []
    _fill_indexed(sl, ["矩形 134", "矩形 135", "矩形 136"], action)

    # Feedback phase boxes (矩形 137, 矩形 138, 矩形 5)
    feedback = d.get("feedback") or []
    _fill_indexed(sl, ["矩形 137", "矩形 138", "矩形 5"], feedback)


def slide3(sl, d):
    """Data Sources & Tools: three info boxes + tools table"""
    s = find(sl, "文字方塊 12")
    if s:
        fill_tf(s, v(d, "data_sources"))

    s = find(sl, "文字方塊 17")
    if s:
        fill_tf(s, v(d, "model_usage"))

    s = find(sl, "文字方塊 18")
    if s:
        fill_tf(s, v(d, "knowledge_base"))

    t = tbl(sl, "表格 21")
    if t:
        # Row 0 = headers (Skills / Tools / Data / Source)
        fill_cell(t, 1, 0, v(d, "skills"))
        fill_cell(t, 1, 1, v(d, "tools"))
        fill_cell(t, 1, 2, v(d, "data"))
        fill_cell(t, 1, 3, v(d, "source"))
        for r in range(2, min(len(t.rows), 7)):
            for c in range(min(len(t.columns), 4)):
                fill_cell(t, r, c, "")


def slide4(sl, d):
    """Decision Logic: left table + right-side Decision Flow diagram."""
    t = tbl(sl, "表格 137")
    if t:
        fill_cell(t, 1, 0, v(d, "tasks"))
        fill_cell(t, 1, 1, v(d, "sub_agent"))
        fill_cell(t, 1, 2, v(d, "logic"))
        fill_cell(t, 1, 3, v(d, "logic_tools"))
        for r in range(2, min(len(t.rows), 5)):
            for c in range(min(len(t.columns), 4)):
                fill_cell(t, r, c, "")

    # Right side: Decision Flow text boxes
    # 文字方塊 3 has two paragraphs: Trigger line + Perception line
    s = find(sl, "文字方塊 3")
    if s:
        fill_tf_lines(
            s,
            f"Trigger: {v(d, 'decision_trigger')}",
            f"Perception: {v(d, 'decision_perception')}",
        )

    s = find(sl, "文字方塊 4")
    if s:
        fill_tf(s, v(d, "decision_q1"))

    s = find(sl, "文字方塊 6")
    if s:
        fill_tf(s, v(d, "decision_q1_no_result"))

    s = find(sl, "文字方塊 7")
    if s:
        fill_tf(s, v(d, "decision_q2"))

    s = find(sl, "文字方塊 9")
    if s:
        fill_tf(s, v(d, "decision_q2_no_result"))

    s = find(sl, "文字方塊 10")
    if s:
        fill_tf(s, v(d, "decision_q3"))

    s = find(sl, "文字方塊 12")
    if s:
        fill_tf(s, v(d, "decision_q3_no_result"))

    s = find(sl, "文字方塊 64")
    if s:
        fill_tf(s, v(d, "decision_q3_yes_result"))


def slide5(sl, d):
    """Guardrails & Red Lines table (No / Guardrails Lists / Description)"""
    t = tbl(sl, "表格 102")
    if not t:
        return
    guardrails = [
        ("Output Guardrail",        v(d, "g1_output")),
        ("Capability Guardrail",    v(d, "g2_capability")),
        ("Grounding Guardrail",     v(d, "g3_grounding")),
        ("Hallucination Guardrail", v(d, "g4_hallucination")),
        ("Goal Guardrail",          v(d, "g5_goal")),
    ]
    for i, (name, desc) in enumerate(guardrails):
        row = i + 1
        fill_cell(t, row, 0, str(i + 1))
        fill_cell(t, row, 1, name)
        fill_cell(t, row, 2, desc)
    # Template had a 6th guardrail row — clear it
    if len(t.rows) > 6:
        fill_cell(t, 6, 0, "")
        fill_cell(t, 6, 1, "")
        fill_cell(t, 6, 2, "")


def slide6(sl, d):
    """Golden Test Cases table (Scenario / 問題狀況 / 專家標準決策 / 驗證檢查點)"""
    t = tbl(sl, "表格 3")
    if not t:
        return
    cases = [
        (v(d, "t1_problem"), v(d, "t1_expert"), v(d, "t1_check")),
        (v(d, "t2_problem"), v(d, "t2_expert"), v(d, "t2_check")),
        (v(d, "t3_problem"), v(d, "t3_expert"), v(d, "t3_check")),
        (v(d, "t4_problem"), v(d, "t4_expert"), v(d, "t4_check")),
    ]
    for i, (prob, expert, check) in enumerate(cases):
        r = i + 1
        fill_cell(t, r, 0, f"情境 {r}")
        fill_cell(t, r, 1, prob)
        fill_cell(t, r, 2, expert)
        fill_cell(t, r, 3, check)


def slide7(sl, d):
    """Task Completion: summary text + task-rate table + accuracy-rate table"""
    task_rate = v(d, "task_rate")
    acc_rate  = v(d, "accuracy_rate")

    s = find(sl, "文字方塊 2")
    if s:
        fill_tf_lines(
            s,
            f"任務成功率 {task_rate}，結果準確率 {acc_rate}",
            "",
        )

    t = tbl(sl, "表格 5")
    if t:
        if len(t.rows) > 1:
            fill_cell(t, 1, 3, task_rate)
        if len(t.rows) > 2:
            fill_cell(t, 2, 3, task_rate)

    t = tbl(sl, "表格 7")
    if t:
        last_col = len(t.columns) - 1
        if len(t.rows) > 1:
            fill_cell(t, 1, last_col, acc_rate)
        if len(t.rows) > 2:
            fill_cell(t, 2, last_col, acc_rate)


def slide8(sl, d):
    """Offline Validation: summary text box"""
    s = find(sl, "文字方塊 3")
    if s:
        fill_tf_lines(
            s,
            "AI Agent 驗證有效性天數大於 7 天。",
            f"驗證期間 {v(d, 'period')}，共 {v(d, 'days')} 天，"
            f"任務成功率 {v(d, 'task_rate')}，結果準確率 {v(d, 'accuracy_rate')}",
            "",
        )


def slide9(sl, d):
    """Online Validation: summary text box"""
    s = find(sl, "文字方塊 7")
    if s:
        fill_tf_lines(
            s,
            "AI Agent 驗證持續運行天數大於 14 天。",
            f"Online 持續運行 {v(d, 'run_days')} 天。",
            "",
        )


# ── main ──────────────────────────────────────────────────────────────────────

FILLERS = [slide1, slide2, slide3, slide4, slide5, slide6, slide7, slide8, slide9]


def main():
    json_arg = sys.argv[1] if len(sys.argv) > 1 else None
    out_arg  = sys.argv[2] if len(sys.argv) > 2 else "AI_Agent_Validation_Report.pptx"

    if not TEMPLATE.exists():
        sys.exit(
            f"Template not found: {TEMPLATE}\n"
            "Place the template PPTX at reference/template.pptx first."
        )

    d   = load_data(json_arg)
    prs = Presentation(str(TEMPLATE))

    for i, (slide, filler) in enumerate(zip(prs.slides, FILLERS)):
        try:
            filler(slide, d)
            print(f"  slide {i + 1} ✓")
        except Exception as e:
            print(f"  slide {i + 1} warning: {e}")

    prs.save(out_arg)
    print(f"\nSaved → {out_arg}")


if __name__ == "__main__":
    main()
