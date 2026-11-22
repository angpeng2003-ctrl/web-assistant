#!/bin/bash
# Start the local site-building assistant (Jianzhan Zhushou) on macOS
cd "$(dirname "$0")" || exit 1
# 双击打开时 PATH 可能不含 Homebrew / nvm 装的 node，补上常见位置
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ] && ! command -v node >/dev/null 2>&1; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Please install Node.js 20 or newer: https://nodejs.org"
  read -r -p "Press Enter to close..."
  exit 1
fi
(sleep 1; open "http://127.0.0.1:4520") &
node server/index.js
read -r -p "Press Enter to close..."
