.PHONY: all prg iq clean key help

# Default target builds both PRG and IQ
all:
	@./scripts/build.sh all

# Build .prg for USB sideloading to Garmin watch
prg:
	@./scripts/build.sh prg

# Build .iq for Garmin Connect IQ Developer Dashboard (Beta app)
iq:
	@./scripts/build.sh iq

# Remove compiled artifacts
clean:
	@./scripts/build.sh clean

# Generate or verify developer key
key:
	@./scripts/build.sh key

help:
	@./scripts/build.sh help

