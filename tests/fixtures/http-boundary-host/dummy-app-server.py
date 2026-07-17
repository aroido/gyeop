#!/usr/bin/python3

import json
import os
import socket
import sys
import threading

port = int(sys.argv[1])
capture_path = os.environ.get("GYEOP_CAPTURE_PATH", "/run/gyeop/capture.json")


def serve(connection):
    data = b""
    connection.settimeout(1)
    try:
        while b"\r\n\r\n" not in data and len(data) < 65536:
            chunk = connection.recv(4096)
            if not chunk:
                break
            data += chunk
        lines = data.split(b"\r\n")
        request_line = lines[0].split(b" ")
        valid_request = (
            b"\r\n\r\n" in data
            and len(request_line) == 3
            and request_line[2].startswith(b"HTTP/")
        )
        headers = {}
        for line in lines[1:]:
            if b":" not in line:
                continue
            name, value = line.split(b":", 1)
            key = name.decode("ascii", "ignore").lower()
            headers.setdefault(key, []).append(value.decode("ascii", "ignore").strip())
        if valid_request:
            temporary = f"{capture_path}.tmp"
            with open(temporary, "w", encoding="utf-8") as capture:
                json.dump(headers, capture, sort_keys=True)
            os.replace(temporary, capture_path)
        connection.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK")
    except OSError:
        pass
    finally:
        connection.close()


def listener(family, address):
    server = socket.socket(family, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if family == socket.AF_INET6:
        server.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
    server.bind(address)
    server.listen(32)
    while True:
        connection, _ = server.accept()
        threading.Thread(target=serve, args=(connection,), daemon=True).start()


threads = [
    threading.Thread(target=listener, args=(socket.AF_INET, ("127.0.0.1", port))),
    threading.Thread(target=listener, args=(socket.AF_INET6, ("::1", port, 0, 0))),
]
for thread in threads:
    thread.start()
for thread in threads:
    thread.join()
