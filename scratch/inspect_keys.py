import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    lines = f.readlines()
    print("Total lines:", len(lines))
    for idx in range(max(0, len(lines)-10), len(lines)):
        try:
            data = json.loads(lines[idx])
            print(f"Line {idx} Step index {data.get('step_index')}:")
            print("  keys:", list(data.keys()))
            print("  type:", data.get("type"))
            print("  source:", data.get("source"))
            if data.get("tool_calls"):
                print("  tool_calls:", [tc.get("name") for tc in data.get("tool_calls")])
            print("  content excerpt:", str(data.get("content"))[:200])
            print("-" * 40)
        except Exception as e:
            print("Error parsing line", idx, e)
