"""
외부 서버 실행 스크립트.

같은 폴더에 .env 파일을 만들고 아래처럼 넣으세요:
    OCR_SHARED_SECRET=실제비밀값
    OCR_PORT=8001

.env 파일이 없으면 이 파일 안의 기본값을 씁니다.
"""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

# .env 파일 읽기
env_path = os.path.join(here, ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

# .env 가 없을 때 기본값 (직접 수정해도 됨)
os.environ.setdefault("OCR_SHARED_SECRET", "ENTER_SECRET_HERE")
os.environ.setdefault("OCR_PORT", "8001")

if os.environ["OCR_SHARED_SECRET"] == "ENTER_SECRET_HERE":
    print("경고: OCR_SHARED_SECRET 이 설정되지 않았습니다.")
    print("  .env 파일을 만들고 OCR_SHARED_SECRET=실제값 을 넣으세요.")
    input("Press Enter to exit...")
    sys.exit(1)

print(f"서버 시작 (포트 {os.environ['OCR_PORT']})")
try:
    subprocess.run([sys.executable, "external_server.py"])
except KeyboardInterrupt:
    pass

input("Press Enter to exit...")
