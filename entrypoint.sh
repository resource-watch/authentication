#!/bin/bash
set -e

case "$1" in
    debug)
        echo "Running Development Server in Debug mode"
        exec yarn run debug
        ;;
    develop)
        echo "Running Development Server"
        exec yarn run watch
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
