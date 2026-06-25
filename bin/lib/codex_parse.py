#!/usr/bin/env python3
"""Parse `codex exec --json` JSONL into a small result object.

Codex streams newline-delimited JSON events. The shape (verified against
codex-cli 0.125.0):
  {"type":"thread.started","thread_id":"..."}
  {"type":"turn.started"}
  {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
  {"type":"item.completed","item":{"type":"reasoning","text":"..."}}
  {"type":"item.completed","item":{"type":"command_execution","command":"..."}}
  {"type":"turn.completed","usage":{"input_tokens":N,"output_tokens":N,...}}

The final answer is the agent_message text. `turn.completed` carries usage.
Non-JSON lines are skipped (codex also logs a benign rollout-persistence ERROR
to *stderr*, which never reaches us here).

Reads JSONL on stdin, writes one compact JSON object to stdout:
  {"text","reasoning","thread_id","tokens","commands","turn_completed"}

`turn_completed` is false when no turn.completed event arrived -> a likely
mid-stream disconnect the caller should treat as suspect.
"""
import json
import sys


def main():
    agent_texts = []
    reasoning_texts = []
    commands = []
    thread_id = ""
    tokens = 0
    turn_completed = False

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(obj, dict):
            continue

        etype = obj.get("type", "")
        if etype == "thread.started":
            thread_id = obj.get("thread_id") or thread_id
        elif etype == "item.completed":
            item = obj.get("item") or {}
            itype = item.get("type", "")
            text = item.get("text", "") or ""
            if itype == "agent_message" and text:
                agent_texts.append(text)
            elif itype == "reasoning" and text:
                reasoning_texts.append(text)
            elif itype == "command_execution":
                cmd = item.get("command", "") or ""
                if cmd:
                    commands.append(cmd)
        elif etype == "turn.completed":
            turn_completed = True
            usage = obj.get("usage") or {}
            tokens = int(usage.get("input_tokens", 0) or 0) + int(usage.get("output_tokens", 0) or 0)

    result = {
        "text": "\n".join(agent_texts).strip(),
        "reasoning": "\n".join(reasoning_texts).strip(),
        "thread_id": thread_id,
        "tokens": tokens,
        "commands": commands,
        "turn_completed": turn_completed,
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
