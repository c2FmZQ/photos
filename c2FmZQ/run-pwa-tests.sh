#!/bin/bash
# This script runs the browser tests with selenium in docker containers.
#
# Usage:
#   ./run-pwa-tests.sh [regexp]
#
# Arguments:
#   regexp (optional): A regular expression to select specific tests to run.
#                      If not provided, all tests will be run.
#
# Examples:
#   # Run all tests
#   ./run-pwa-tests.sh
#
#   # Run a single test named TestCreateDeleteAlbum
#   ./run-pwa-tests.sh TestCreateDeleteAlbum
#
#   # Run all tests in albums_test.go
#   ./run-pwa-tests.sh "TestCreateDeleteAlbum|TestSharing"

# Set the working directory to the directory of the script
cd $(dirname $0)

# Export environment variables needed by docker-compose
# GOCACHE: The Go cache directory, used to speed up builds
export GOCACHE=$(go env GOCACHE)
# GOPATH: The Go path, where Go projects are stored
export GOPATH=$(go env GOPATH)
# USERID: The current user's ID, to run containers with the same user
export USERID=$(id -u)
# SRCDIR: The absolute path to the project's source code
export SRCDIR=$(realpath ..)
# TESTS: The specific tests to run (optional, defaults to all)
export TESTS="$1"

# Run the tests using docker-compose
# --abort-on-container-exit: Stop all containers if any container stops
# --exit-code-from=devtest: Return the exit code of the devtest container
docker compose -f docker-compose-browser-tests.yaml up \
  --abort-on-container-exit \
  --exit-code-from=devtest
RES=$?

# Clean up the containers
docker compose -f docker-compose-browser-tests.yaml rm -f

# Check the exit code of the tests and exit accordingly
if [[ $RES == 0 ]]; then
  echo PASS
else
  echo FAIL
  exit 1
fi