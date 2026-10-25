#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p app/build/screenshots app/build/diagnostics
collect() {
  adb logcat -d -s AndroidRuntime:E chromium:W libc:F > app/build/diagnostics/logcat.txt || true
  for name in 01-login 02-cadastro 03-pdf 04-portaria; do
    adb exec-out run-as br.com.atlas.sst.homologacao cat "files/$name.png" > "app/build/screenshots/$name.png" || true
  done
}
trap collect EXIT
./gradlew --no-daemon :app:connectedDebugAndroidTest
