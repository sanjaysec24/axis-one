import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("type") == "PLANNER_RESPONSE" and data.get("tool_calls"):
                for tc in data.get("tool_calls"):
                    if "runTests" in str(tc):
                        print(f"Step {data.get('step_index')} Tool Call:")
                        print(json.dumps(tc, indent=2))
                        print("-" * 50)
        except Exception as e:
            pass
