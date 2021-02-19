#!/bin/bash
set -e

case "$1" in
    develop)
        echo "Running Develop"
        exec yarn watch
        ;;
    test)
        echo "Running Test"
        exec yarn test
        ;;
    start)
        echo "Running Start"
        exec yarn start
        ;;
    *)
        exec "$@"
esac
