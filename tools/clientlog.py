r"""Attach to the running 2016 player and append its console (F9 Client) output to C:\revival\logs\client.log.
Usage: python -I clientlog.py            (waits for RobloxPlayerBeta.exe, re-attaches on each new launch)
"""
import frida, time, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(os.path.dirname(HERE), 'logs', 'client.log')
SRC = open(os.path.join(HERE, 'clientlog.js'), encoding='utf-8').read()
os.makedirs(os.path.dirname(LOG), exist_ok=True)

def write(line):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')

attached = set()
while True:
    try:
        for p in frida.get_local_device().enumerate_processes():
            if p.name.lower() == 'robloxplayerbeta.exe' and p.pid not in attached:
                s = frida.attach(p.pid)
                s.on('detached', lambda reason, *a, pid=p.pid: (attached.discard(pid), write(f"[{pid}] [TOOL] detached: {reason}")))
                sc = s.create_script(SRC)
                pid = p.pid
                sc.on('message', lambda m, _, pid=pid: write(time.strftime('%H:%M:%S') + f" [{pid}] [{m['payload']['t']}] {m['payload']['msg']}" if m['type'] == 'send' else f"[{pid}] [SCRIPT-ERROR] {m}"))
                sc.load()
                attached.add(p.pid)
    except Exception as e:
        write(f"[TOOL-ERROR] {e}")
    time.sleep(0.3)
