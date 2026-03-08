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

# Lint code
lint:
    npm run lint

# Auto-fix linting errors
lint-fix:
    npm run lint:fix

# Run server and watch for changes
watch:
    npm run watch

# Show all available commands
help:
    @just --list
