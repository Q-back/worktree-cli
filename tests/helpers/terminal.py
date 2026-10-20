"""Drive real terminal input while keeping command stdout separately observable."""

import errno
import json
import os
import pty
import select
import signal
import subprocess
import sys
import time

config = json.load(sys.stdin)
master, slave = pty.openpty()
process = subprocess.Popen(
    config["command"], stdin=slave, stdout=subprocess.PIPE, stderr=slave,
    env={**os.environ, "TERM": "xterm-256color"},
)
os.close(slave)
transcript = b""
steps = iter(config.get("steps", []))
step = next(steps, None)
offset = 0
deadline = time.monotonic() + 10
try:
    while True:
        if time.monotonic() > deadline:
            raise TimeoutError(transcript.decode(errors="replace"))
        ready, _, _ = select.select([master], [], [], 0.05)
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not chunk:
                break
            transcript += chunk
            text = transcript.decode(errors="replace")
            while step is not None and (index := text.find(step["waitFor"], offset)) >= 0:
                offset = index + len(step["waitFor"])
                for file in step.get("check", []):
                    if not os.path.exists(file):
                        raise AssertionError(f"Deleted before authorization: {file}")
                if "input" in step:
                    os.write(master, step["input"].encode())
                if "signal" in step:
                    os.kill(process.pid, getattr(signal, step["signal"]))
                step = next(steps, None)
        elif process.poll() is not None:
            break
    stdout, _ = process.communicate(timeout=2)
    print(json.dumps({
        "stdout": stdout.decode(),
        "stderr": transcript.decode(errors="replace"),
        "code": process.returncode,
    }))
finally:
    os.close(master)
    if process.poll() is None:
        process.kill()
        process.wait()
