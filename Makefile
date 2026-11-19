.PHONY: all prg iq clean key web web-v2 help

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
	@echo "run He-Kim-Koo frontend web: http://localhost:8080"
	@python3 -m http.server 8080 --directory web

# Start local web-v2 workstation (Vite + React)
web-v2:
	cd web-v2 && npm run dev -- --host

# Remove compiled artifacts
clean:
	@./scripts/build.sh clean

# Generate or verify developer key
key:
	@./scripts/build.sh key

help:
	@./scripts/build.sh help
	@echo "  make web    - Launch web companion workstation (http://localhost:8080)"
	@echo "  make web-v2 - Launch web-v2 React/MapLibre workstation (Vite dev server)"


