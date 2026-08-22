import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            # Find the DOM response from the subagent
            if data.get("source") == "SYSTEM" and "DOM" in data.get("content", ""):
                content = data.get("content")
                if "something went wrong" in content.lower() or "application-level" in content.lower() or "error" in content.lower():
                    print(f"Step {data.get('step_index')} DOM contains matches:")
                    for block in content.split("<"):
                        if any(x in block.lower() for x in ["error", "wrong", "fail", "exception"]):
                            print("  <" + block[:150])
                    print("="*50)
        except Exception as e:
            pass
