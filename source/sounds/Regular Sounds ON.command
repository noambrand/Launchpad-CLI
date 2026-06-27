#!/bin/bash
cd "$(dirname "$0")"
node voice.js mode regular
echo
read -n 1 -s -r -p "Press any key to close."
