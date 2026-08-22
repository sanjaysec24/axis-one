import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            # Find the SYSTEM response containing console logs
            if data.get("source") == "SYSTEM":
                content = data.get("content", "")
                if "console" in content.lower() or "log" in content.lower():
                    # Check if there is actual console log content
                    if "[" in content or "Error" in content or "warning" in content:
                        print(f"Step {data.get('step_index')}:")
                        print(content[:2000])
                        print("=" * 60)
        except Exception as e:
            pass
