#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
GRADLE_PROPS="$PROJECT_DIR/android/gradle.properties"
BUILD_GRADLE="$PROJECT_DIR/android/app/build.gradle"

# ── 1. Fix Kotlin version mismatch ────────────────────────────────────────────
echo "android.kotlinVersion=1.9.24" >> "$GRADLE_PROPS"
echo "✓ Patched gradle.properties (kotlinVersion)"

# ── 2. Inject release signing into app/build.gradle ──────────────────────────
python3 - "$BUILD_GRADLE" "$PROJECT_DIR" <<'PYEOF'
import sys, re

build_gradle_path = sys.argv[1]
project_dir = sys.argv[2]

with open(build_gradle_path, 'r') as f:
    content = f.read()

if 'keystorePropertiesFile' in content:
    print("✓ app/build.gradle already patched, skipping")
    sys.exit(0)

# 1. Prepend keystore properties loader before "android {"
loader = '''def keystorePropertiesFile = rootProject.file("../keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

'''
content = content.replace('android {', loader + 'android {', 1)

# 2. Add release entry inside signingConfigs, just before its closing brace
release_entry = """        release {
            storeFile keystorePropertiesFile.exists() ? file(keystoreProperties['KEYSTORE_FILE']) : null
            storePassword keystoreProperties['KEYSTORE_PASSWORD']
            keyAlias keystoreProperties['KEY_ALIAS']
            keyPassword keystoreProperties['KEY_PASSWORD']
        }
"""
# Insert before the closing "    }" of the signingConfigs block (which is followed by "    buildTypes")
content = content.replace(
    "        }\n    }\n    buildTypes {",
    "        }\n" + release_entry + "    }\n    buildTypes {",
    1
)

# 3. In buildTypes.release, swap signingConfigs.debug → signingConfigs.release
# Only replace the one inside buildTypes.release (second occurrence)
parts = content.split('signingConfig signingConfigs.debug')
if len(parts) >= 3:
    # parts[0]=before debug block, parts[1]=inside debug buildType, parts[2]=inside release buildType...
    content = parts[0] + 'signingConfig signingConfigs.debug' + parts[1] + 'signingConfig signingConfigs.release' + 'signingConfig signingConfigs.debug'.join(parts[2:])

with open(build_gradle_path, 'w') as f:
    f.write(content)

print("✓ Patched app/build.gradle with release signing config")
PYEOF

echo "✓ Android patch complete"
