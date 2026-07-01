"""一次性清理:移除 app/seed.py 灌入的示範資料(6 個假 Agent 專案 + 對應紅線
事件與月報),保留你自己建立的真實專案與使用者不受影響。

比對方式:同時符合種子清單裡的 id **與**內容(名稱/期間)才會刪除,所以就算你的
真實資料剛好撞到相同的 project_id(例如 PROJ-001),只要名稱不同就不會被誤刪。

保留 U-mgr(主管身分)不刪除,因為側邊欄「目前身份」切換器、以及非主管使用者
以外的 ACL 判斷都需要至少一個主管身分才能繼續正常運作。

使用方式:
    cd backend
    python scripts/remove_demo_seed.py

清乾淨後記得:
    - 確認 APP_SEED_ON_STARTUP 沒有被設成 true(預設已改成 false),
      否則下次重啟後端又會把示範資料種回去。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.models import GuardrailEvent, Project, Report, User  # noqa: E402
from app.seed import GUARDRAIL_EVENTS, PROJECTS, REPORTS, USERS  # noqa: E402

_KEEP_USER_IDS = {"U-mgr"}  # 主管身分保留,不然畫面上會沒有任何可切換的身分


def main() -> None:
    db = SessionLocal()
    removed = {"projects": 0, "users": 0, "guardrail_events": 0, "reports": 0}
    try:
        for pid, name, *_ in PROJECTS:
            proj = db.get(Project, pid)
            if proj is not None and proj.name == name:
                db.delete(proj)
                removed["projects"] += 1

        for uid, name, *_ in USERS:
            if uid in _KEEP_USER_IDS:
                continue
            user = db.get(User, uid)
            if user is not None and user.name == name:
                db.delete(user)
                removed["users"] += 1

        seed_event_keys = {(pid, detail) for pid, _gtype, _days, detail, _res in GUARDRAIL_EVENTS}
        for ev in db.query(GuardrailEvent).all():
            if (ev.project_id, ev.detail) in seed_event_keys:
                db.delete(ev)
                removed["guardrail_events"] += 1

        for rid, period in REPORTS:
            rpt = db.get(Report, rid)
            if rpt is not None and rpt.period == period:
                db.delete(rpt)
                removed["reports"] += 1

        db.commit()
    finally:
        db.close()

    print("已移除示範資料:")
    for key, count in removed.items():
        print(f"  {key}: {count}")
    print("\n保留:U-mgr(主管身分,供畫面切換使用)。")
    print("再次執行這個腳本是安全的 — 已清除過的資料不會被重複計算或報錯。")


if __name__ == "__main__":
    main()
