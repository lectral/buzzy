# Justfile for Buzzy project

# Install dependencies
install:
    npm install

# Start the server
start:
    node src/server.js

# Start server in development mode
dev:
    node src/server.js

# Show all available commands
help:
    @just --list
