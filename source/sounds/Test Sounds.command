#!/bin/bash
cd "$(dirname "$0")"
echo "Playing the three voice clips..."
echo "1/3  done";  node play.js done;  sleep 3
echo "2/3  permission"; node play.js permission; sleep 3
echo "3/3  save";  node play.js save;  sleep 3
echo
node voice.js status
echo
read -n 1 -s -r -p "Press any key to close."
