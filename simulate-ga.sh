#!/bin/bash

yarn build

export GITHUB_EVENT_PATH=$(mktemp)
echo $GITHUB_EVENT_PAYLOAD > $GITHUB_EVENT_PATH

node dist/index.js
