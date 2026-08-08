#!/bin/bash
cd "$(dirname "$0")"
echo "Playing the five alert sounds in the current mode..."
echo "1/5  done";       node play.js done;       sleep 3
echo "2/5  error";      node play.js error;      sleep 3
echo "3/5  permission"; node play.js permission; sleep 3
echo "4/5  waiting";    node play.js waiting;    sleep 3
echo "5/5  save";       node play.js save;       sleep 3
echo
node voice.js status
echo
read -n 1 -s -r -p "Press any key to close."
