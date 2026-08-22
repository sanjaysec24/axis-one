import json

log_path = r"C:\Users\admin\AsIs" # Wait, the actual path is:
log_path = r"C:\Users\admin\.gemini\antigravity-ide\brain\11db29e2-d1a3-4911-af63-5d9c3b474b54\.system_generated\logs\transcript_full.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            if "capture_browser_console_logs" in line:
                print(f"Step {data.get('step_index')}:")
                # print tool outputs
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    print(f"  Tool: {tc.get('name')}")
            # Check if this is the step with the tool response
            if data.get("type") == "PLANNER_RESPONSE" and "console" in str(data):
                pass
            # Let's search for "message" or console log texts in the system-delivered responses
            if data.get("source") == "SYSTEM" and "logs" in data.get("content", ""):
                print(f"System Message index {data.get('step_index')}:")
                print(data.get("content")[:1000])
                print("-" * 50)
        except Exception as e:
            pass
