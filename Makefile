.PHONY: all prg iq clean key web help

# Default target builds both PRG and IQ
all:
	@./scripts/build.sh all

# Build .prg for USB sideloading to Garmin watch
prg:
	@./scripts/build.sh prg

# Build .iq for Garmin Connect IQ Developer Dashboard (Beta app)
iq:
	@./scripts/build.sh iq

# Start local web companion workstation
web:
	@echo "啟動 He-Kim-Koo 前端工作台: http://localhost:8080"
	@python3 -m http.server 8080 --directory web

# Remove compiled artifacts
clean:
	@./scripts/build.sh clean

# Generate or verify developer key
key:
	@./scripts/build.sh key

help:
	@./scripts/build.sh help
	@echo "  make web    - 啟動網頁端 GPX 轉檔與腕錶模擬工作台 (http://localhost:8080)"


