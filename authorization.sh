#!/bin/bash

case "$1" in
    start)
        yarn start
        ;;
    develop)
        type docker-compose >/dev/null 2>&1 || { echo >&2 "docker-compose is required but it's not installed.  Aborting."; exit 1; }
        docker-compose -f docker-compose-develop.yml up --build
        ;;
    test)
        type docker-compose >/dev/null 2>&1 || { echo >&2 "docker-compose is required but it's not installed.  Aborting."; exit 1; }
        docker-compose -f docker-compose-test.yml up --build --abort-on-container-exit
        ;;
    debug)
        type docker-compose >/dev/null 2>&1 || { echo >&2 "docker-compose is required but it's not installed.  Aborting."; exit 1; }
        docker-compose -f docker-compose-debug.yml up --build
        ;;
    *)
        echo "Usage: authorization.sh {start|develop|test|debug}" >&2
        exit 1
        ;;
esac

exit 0
