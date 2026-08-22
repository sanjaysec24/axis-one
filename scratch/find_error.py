import json

log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            content = str(data.get("content", ""))
            # Search for typical browser error stack traces or React errors
            if "Error" in content or "exception" in content or "uncaught" in content.lower() or "fail" in content.lower():
                # check if there's log text
                if "console" in content or "log" in content or "text" in content:
                    print(f"Index {data.get('step_index')} (type: {data.get('type')}, source: {data.get('source')}):")
                    # truncate print
                    lines = content.split("\\n")
                    for l in lines:
                        if any(x in l.lower() for x in ["error", "fail", "exception", "refused", "warn", "uncaught"]):
                            print("  ", l[:200])
                    print("="*40)
        except Exception as e:
            pass
