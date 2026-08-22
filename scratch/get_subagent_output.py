import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for idx, line in enumerate(f):
        try:
            data = json.loads(line)
            if "browser_subagent" in str(data):
                print(f"Line {idx} (Step {data.get('step_index')}, Type {data.get('type')}, Source {data.get('source')}):")
                # print keys and slice of content
                print("  Keys:", list(data.keys()))
                content_str = str(data.get("content", ""))
                print("  Content Excerpt:", content_str[:1500])
                print("-" * 50)
        except Exception as e:
            pass
