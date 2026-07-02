"""Validation report: interview LLM, compile JSON, generate PPTX, convert to PDF preview.

Flow:
  1. get_interview_response()  — multi-turn chat with the interview assistant
  2. compile_json()            — compile conversation → structured JSON via LLM
  3. generate_pptx()           — call generate_ppt.py script with the JSON → .pptx
  4. to_pdf()                  — LibreOffice headless converts .pptx → .pdf
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

from . import prompts
from .llm import LLMUnavailable, ProphetAILLM, _task_credentials_present

# Path to the skill's generate_ppt.py script (relative to repo root).
# We resolve it from this file's location: backend/app/services/ → up 3 → repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SKILL_DIR = _REPO_ROOT / ".claude" / "skills" / "agent-validation-report"
_GENERATE_PPT_SCRIPT = _SKILL_DIR / "scripts" / "generate_ppt.py"
_COMPILE_PROMPT_FILE = _SKILL_DIR / "reference" / "prompt.md"

# Output directory for generated files (per-session subdirectory).
# Written INSIDE the backend folder — where uvicorn already runs and reads
# credentials.env / governance.db — so it's guaranteed writable on every OS.
# A hardcoded "/tmp" resolved to "\tmp" at the drive root on Windows and failed
# with "存取被拒 (WinError 5)"; even the OS temp dir can be locked down on
# corporate machines, so we use a dir we know the app can write to.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_TMP_BASE = _BACKEND_DIR / "generated_reports"


def _ensure_tmp_dir(session_id: str) -> Path:
    """Create and return the temp directory for this session."""
    d = _TMP_BASE / session_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _load_compile_prompt() -> tuple[str, str]:
    """Load SYSTEM and USER sections from the skill's prompt.md."""
    _SYSTEM_MARKER = re.compile(r"(?m)^=== SYSTEM ===[ \t]*$")
    _USER_MARKER = re.compile(r"(?m)^=== USER ===[ \t]*$")

    text = _COMPILE_PROMPT_FILE.read_text(encoding="utf-8")

    sys_split = _SYSTEM_MARKER.split(text, maxsplit=1)
    if len(sys_split) != 2:
        raise RuntimeError(f"prompt.md missing '=== SYSTEM ===' line: {_COMPILE_PROMPT_FILE}")
    user_split = _USER_MARKER.split(sys_split[1], maxsplit=1)
    if len(user_split) != 2:
        raise RuntimeError(f"prompt.md missing '=== USER ===' line: {_COMPILE_PROMPT_FILE}")
    return sys_split[1].split(_USER_MARKER.pattern)[0].strip() if False else (
        user_split[0].strip(),
        user_split[1].strip(),
    )


def validation_llm_available() -> bool:
    """True if the validation-report ProphetAI agent has credentials configured.

    When False, the interview + compile steps run in a degraded/stub mode and
    can't extract structured fields — the UI uses this to show an accurate
    reason ("LLM not configured") instead of "found nothing".
    """
    return _task_credentials_present("validation")


def _documents_block(documents: list[dict] | None) -> str:
    """Render uploaded documents as a single reference block for the LLM.

    documents: [{"filename": str, "text": str}, ...]
    Returns "" when there are no documents.
    """
    if not documents:
        return ""
    parts = ["=== 使用者上傳的參考文件 ==="]
    for d in documents:
        parts.append(f"【文件:{d.get('filename', '未命名')}】\n{d.get('text', '')}")
    return "\n\n".join(parts)


def get_interview_response(messages: list[dict], documents: list[dict] | None = None) -> str:
    """Call the interview LLM with full conversation history.

    messages: [{"role": "user"|"assistant", "content": str}, ...]
    documents: optional uploaded files whose extracted text is folded into the
    system prompt so the assistant can read and analyse them (kept out of the
    visible chat history so the UI stays clean).

    Returns the assistant's text response, or a fallback string if LLM unavailable.
    """
    system = prompts.validation_interview_system_prompt()

    docs = _documents_block(documents)
    if docs:
        system = (
            f"{system}\n\n{docs}\n\n"
            "(請根據以上使用者上傳的文件內容,主動幫他整理驗證報告所需的資訊,"
            "並針對文件中缺漏或不清楚的部分提問。)"
        )

    try:
        prophet = ProphetAILLM()
        return prophet.chat_multi_turn(system=system, messages=messages, task="validation")
    except LLMUnavailable as exc:
        # Graceful degradation: return a helpful stub message
        return (
            "抱歉，目前 AI 訪談服務暫時無法使用（LLM 連線失敗）。\n\n"
            "您可以繼續填寫資料，或稍後再試。如需立即生成報告，"
            "請確認 COMPANY_VALIDATION_KEY 與 COMPANY_VALIDATION_AGENT 已設定。\n\n"
            f"（錯誤詳情：{exc}）"
        )


def _format_conversation_as_source_material(messages: list[dict]) -> str:
    """Format the conversation history as a readable Q&A transcript."""
    lines: list[str] = ["=== 訪談對話記錄 ===", ""]
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "assistant":
            lines.append(f"【訪談助手】{content}")
        else:
            lines.append(f"【受訪者】{content}")
        lines.append("")
    return "\n".join(lines)


def _strip_json_fences(text: str) -> str:
    """Remove ```json ... ``` fences from LLM output."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return fence.group(1)
    brace = re.search(r"\{.*\}", text, re.DOTALL)
    if brace:
        return brace.group(0)
    return text


def compile_json(
    messages: list[dict],
    documents: list[dict] | None = None,
    note: str = "",
) -> dict:
    """Compile uploaded documents + notes (+ any conversation) into structured JSON.

    Loads the compilation prompt from .claude/skills/agent-validation-report/reference/prompt.md,
    feeds the source material as {source_material}, calls ProphetAI, parses JSON.

    `note` is the user's free-text supplementary input from the form page (things
    not in the uploaded file). Falls back to empty dict if LLM is unavailable.
    """
    source_material = _format_conversation_as_source_material(messages) if messages else ""
    docs = _documents_block(documents)
    if docs:
        source_material = f"{docs}\n\n{source_material}"
    if note.strip():
        source_material = f"=== 使用者補充說明 ===\n{note.strip()}\n\n{source_material}"

    # Load the compile prompt
    system_text, user_template = _load_compile_prompt()
    user_text = user_template.format(source_material=source_material)

    # Build a single-turn message to compile
    compile_messages = [{"role": "user", "content": user_text}]

    try:
        prophet = ProphetAILLM()
        raw = prophet.chat_multi_turn(
            system=system_text,
            messages=compile_messages,
            task="validation",
        )
    except LLMUnavailable:
        # No LLM available — return empty dict; PPTX will show [待補] for all fields
        return {}

    # Parse JSON from response
    cleaned = _strip_json_fences(raw)
    try:
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            return {}
        return data
    except (json.JSONDecodeError, ValueError):
        return {}


def generate_pptx(data: dict, session_id: str) -> Path:
    """Write data to JSON, call generate_ppt.py, return .pptx path.

    The script is called as a subprocess:
      <this-python> <script> <input.json> <output.pptx>
    """
    import sys

    out_dir = _ensure_tmp_dir(session_id)
    json_path = out_dir / "input.json"
    pptx_path = out_dir / "AI_Agent_Validation_Report.pptx"

    # Write input JSON
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # Run the generator script with the SAME interpreter running the backend
    # (sys.executable), so it uses the venv that has python-pptx installed —
    # a bare "python" may resolve to a different interpreter on Windows.
    result = subprocess.run(
        [sys.executable, str(_GENERATE_PPT_SCRIPT), str(json_path), str(pptx_path)],
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"generate_ppt.py failed (exit {result.returncode}):\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )

    if not pptx_path.exists():
        raise RuntimeError(f"generate_ppt.py succeeded but output not found: {pptx_path}")

    return pptx_path


def to_pdf(pptx_path: Path) -> Path | None:
    """Convert a .pptx to .pdf using LibreOffice headless.

    Returns the PDF path, or None if LibreOffice is not available or conversion fails.
    """
    out_dir = pptx_path.parent

    try:
        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to", "pdf",
                "--outdir", str(out_dir),
                str(pptx_path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # LibreOffice not installed or conversion timed out
        return None

    if result.returncode != 0:
        return None

    # LibreOffice outputs <stem>.pdf in the same directory
    pdf_path = out_dir / (pptx_path.stem + ".pdf")
    if pdf_path.exists():
        return pdf_path
    return None


def cleanup_session(session_id: str) -> None:
    """Delete temp files for a session."""
    import shutil
    session_dir = _TMP_BASE / session_id
    if session_dir.exists():
        shutil.rmtree(session_dir, ignore_errors=True)
