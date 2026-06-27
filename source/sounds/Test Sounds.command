#!/bin/bash
cd "$(dirname "$0")"
echo "Playing the four alert sounds in the current mode..."
echo "1/4  done";       node play.js done;       sleep 3
echo "2/4  permission"; node play.js permission; sleep 3
echo "3/4  waiting";    node play.js waiting;    sleep 3
echo "4/4  save";       node play.js save;       sleep 3
echo
node voice.js status
echo
read -n 1 -s -r -p "Press any key to close."
