#!/usr/bin/env bash
set -e

# ==============================================================================
# He-Kim-Koo (Firefly) - Automated Garmin Connect IQ Build Script
# Supports:
#   1. .prg binary for direct USB sideloading to Garmin Venu 2 Plus
#   2. .iq package for uploading to Garmin Connect IQ Developer Dashboard (Beta)
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# ANSI Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

APP_NAME="hekimkoo"
TARGET_DEVICE="venu2plus"
OUTPUT_DIR="bin"
KEY_FILE="developer_key.der"

echo -e "${CYAN}${BOLD}=== He-Kim-Koo Garmin Connect IQ Build Tool ===${NC}"

# 1. Resolve Java Runtime
if [ -x "/opt/homebrew/opt/openjdk/bin/java" ]; then
    export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
    export JAVA_HOME="/opt/homebrew/opt/openjdk"
fi

if ! command -v java >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Java Runtime not found!${NC}"
    echo "Please install Java (e.g., brew install openjdk or brew install --cask temurin)"
    exit 1
fi

# 2. Resolve Connect IQ SDK
SDK_CFG="$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg"
if [ -n "$GARMIN_SDK_PATH" ] && [ -d "$GARMIN_SDK_PATH" ]; then
    SDK_PATH="$GARMIN_SDK_PATH"
elif [ -f "$SDK_CFG" ]; then
    SDK_PATH="$(cat "$SDK_CFG" | tr -d '\r\n')"
    SDK_PATH="${SDK_PATH%/}"
else
    # Fallback to search in default SDK directory
    SDK_PATH="$(find "$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks" -maxdepth 1 -type d -name "connectiq-sdk-*" 2>/dev/null | sort -V | tail -n 1)"
fi

if [ -z "$SDK_PATH" ] || [ ! -d "$SDK_PATH" ]; then
    echo -e "${RED}[ERROR] Connect IQ SDK not found!${NC}"
    echo "Please ensure the SDK is downloaded via Garmin SDK Manager."
    exit 1
fi

MONKEYC="$SDK_PATH/bin/monkeyc"
if [ ! -x "$MONKEYC" ]; then
    echo -e "${RED}[ERROR] monkeyc compiler not found at: $MONKEYC${NC}"
    exit 1
fi

SDK_VERSION="$("$MONKEYC" -v 2>&1 | head -n 1 || echo "Unknown")"
echo -e "${GREEN}✓ Found SDK:${NC} $SDK_PATH"
echo -e "${GREEN}✓ Compiler:${NC} $SDK_VERSION"

# 3. Ensure Developer Key
if [ ! -f "$KEY_FILE" ]; then
    if [ -f "developer_key" ]; then
        KEY_FILE="developer_key"
    else
        echo -e "${YELLOW}Developer key not found. Automatically generating 4096-bit RSA key ($KEY_FILE)...${NC}"
        openssl genrsa -out developer_key.pem 4096 >/dev/null 2>&1
        openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt >/dev/null 2>&1
        rm -f developer_key.pem
        chmod 600 developer_key.der
        echo -e "${GREEN}✓ Developer key generated: $KEY_FILE${NC}"
    fi
fi
echo -e "${GREEN}✓ Developer Key:${NC} $KEY_FILE"

mkdir -p "$OUTPUT_DIR"

# 4. Action Handlers
build_prg() {
    local OUT_FILE="$OUTPUT_DIR/$APP_NAME.prg"
    echo -e "\n${CYAN}Building USB Sideload Binary (.prg) for ${BOLD}$TARGET_DEVICE${NC}..."

    "$MONKEYC" \
        -o "$OUT_FILE" \
        -f monkey.jungle \
        -y "$KEY_FILE" \
        -d "$TARGET_DEVICE" \
        -w -r

    if [ -f "$OUT_FILE" ]; then
        local SIZE="$(ls -lh "$OUT_FILE" | awk '{print $5}')"
        echo -e "${GREEN}${BOLD}✔ PRG Build Successful!${NC} ($SIZE)"
        echo -e "  File: ${BOLD}$OUT_FILE${NC}"
        echo -e "\n${YELLOW}${BOLD}📲 How to USB Sideload to Venu 2 Plus:${NC}"
        echo -e "  1. Connect watch via USB cable."
        echo -e "  2. On macOS: Open ${BOLD}OpenMTP${NC} (or Android File Transfer)."
        echo -e "     On Windows: Open watch drive in File Explorer."
        echo -e "  3. Copy ${BOLD}$OUT_FILE${NC} into the watch's ${BOLD}/GARMIN/APPS/${NC} folder."
        echo -e "  4. Safely eject and disconnect USB."
    else
        echo -e "${RED}[ERROR] PRG output file was not created.${NC}"
        exit 1
    fi
}

build_iq() {
    local OUT_FILE="$OUTPUT_DIR/$APP_NAME.iq"
    echo -e "\n${CYAN}Building Store / Beta Package (.iq)...${NC}"

    "$MONKEYC" \
        -e \
        -o "$OUT_FILE" \
        -f monkey.jungle \
        -y "$KEY_FILE" \
        -w -r

    if [ -f "$OUT_FILE" ]; then
        local SIZE="$(ls -lh "$OUT_FILE" | awk '{print $5}')"
        echo -e "${GREEN}${BOLD}✔ IQ Package Build Successful!${NC} ($SIZE)"
        echo -e "  File: ${BOLD}$OUT_FILE${NC}"
        echo -e "\n${YELLOW}${BOLD}☁️ How to Upload Beta to Connect IQ Store:${NC}"
        echo -e "  1. Visit: ${BOLD}https://apps.garmin.com/developer/dashboard${NC}"
        echo -e "  2. Click ${BOLD}'Upload an App'${NC} and select ${BOLD}$OUT_FILE${NC}."
        echo -e "  3. Check ${BOLD}'This is a Beta app'${NC}."
        echo -e "  4. Install wirelessly to watch via Connect IQ Store phone app over Bluetooth!"
    else
        echo -e "${RED}[ERROR] IQ output file was not created.${NC}"
        exit 1
    fi
}

clean() {
    echo -e "\n${YELLOW}Cleaning build artifacts and temporary files...${NC}"
    rm -rf "$OUTPUT_DIR" gen mir internal-mir "$PROJECT_DIR"/gen "$PROJECT_DIR"/mir "$PROJECT_DIR"/internal-mir
    rm -f "$PROJECT_DIR"/*.prg "$PROJECT_DIR"/*.prg.debug.xml "$PROJECT_DIR"/*.iq "$PROJECT_DIR"/*-settings.json "$PROJECT_DIR"/.DS_Store
    echo -e "${GREEN}✓ Clean complete.${NC}"
}

COMMAND="${1:-all}"

case "$COMMAND" in
    prg|device|usb)
        build_prg
        ;;
    iq|beta|store|package)
        build_iq
        ;;
    all)
        build_prg
        build_iq
        echo -e "\n${GREEN}${BOLD}🎉 All builds completed successfully!${NC}"
        ;;
    clean)
        clean
        ;;
    key)
        echo "Developer key is ready at: $KEY_FILE"
        ;;
    help|--help|-h)
        echo -e "\nUsage: ./scripts/build.sh [target]"
        echo "Targets:"
        echo "  prg    - Build .prg binary for USB sideloading to watch (/GARMIN/APPS/)"
        echo "  iq     - Build .iq package for Garmin Connect IQ Developer Dashboard (Beta app)"
        echo "  all    - (Default) Build both .prg and .iq"
        echo "  clean  - Remove bin/ build output folder"
        echo "  key    - Generate or verify developer_key.der"
        ;;
    *)
        echo -e "${RED}Unknown target: $COMMAND${NC}"
        echo "Run './scripts/build.sh help' for usage instructions."
        exit 1
        ;;
esac

