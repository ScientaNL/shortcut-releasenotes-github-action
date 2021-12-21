#!/bin/bash

yarn build

source .env
export GITHUB_EVENT_PATH=$(mktemp)
echo $GITHUB_EVENT_PAYLOAD > $GITHUB_EVENT_PATH

node dist/index.js
