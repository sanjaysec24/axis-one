import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("source") == "SYSTEM" and "DOM" in data.get("content", ""):
                content = data.get("content")
                if "axis" in content.lower():
                    print(f"Step {data.get('step_index')} contains 'axis'")
                    idx = content.lower().find("axis")
                    print(content[max(0, idx-50):min(len(content), idx+500)])
                    print("="*60)
                    break
        except Exception as e:
            pass
