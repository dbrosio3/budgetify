#!/bin/bash
set -e

# Add Fly CLI to PATH
export FLYCTL_INSTALL="/Users/danielbrosio/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

flyctl logs -a budgetify-bot "$@"

