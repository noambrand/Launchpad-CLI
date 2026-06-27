#!/bin/bash
cd "$(dirname "$0")"
node voice.js off
echo
read -n 1 -s -r -p "Press any key to close."
