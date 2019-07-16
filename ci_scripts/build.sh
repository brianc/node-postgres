#!/bin/sh

BUILD_DIR="$(pwd)"
source ./ci_scripts/install_openssl.sh 1.1.1b
sudo updatedb
source ./ci_scripts/install_libpq.sh
sudo updatedb
sudo ldconfig
cd $BUILD_DIR
