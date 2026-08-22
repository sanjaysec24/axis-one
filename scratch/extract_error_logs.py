import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            # Find the SYSTEM response containing console logs from the subagent
            if data.get("source") == "SYSTEM" and "logs" in data.get("content", "").lower():
                content = data.get("content")
                # Look for common React/Next error patterns
                if "error" in content.lower() or "exception" in content.lower() or "fail" in content.lower():
                    print(f"Step {data.get('step_index')}:")
                    print(content[:2500])
                    print("="*60)
        except Exception as e:
            pass
