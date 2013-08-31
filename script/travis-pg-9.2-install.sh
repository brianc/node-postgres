#! /usr/bin/env bash
#sudo cat /etc/postgresql/9.1/main/pg_hba.conf
#sudo cat /etc/postgresql/9.1/main/pg_ident.conf
#sudo cat /etc/postgresql/9.1/main/postgresql.conf
sudo /etc/init.d/postgresql stop
sudo apt-get -y --purge remove postgresql
echo "yes" | sudo add-apt-repository ppa:pitti/postgresql
sudo apt-get update -qq
sudo apt-get -q -y -o Dpkg::Options::=--force-confdef install postgresql-9.2 postgresql-contrib-9.2
sudo chmod 777 /etc/postgresql/9.2/main/pg_hba.conf
sudo echo "local   all         postgres                          trust" > /etc/postgresql/9.2/main/pg_hba.conf
sudo echo "local   all         all                               trust" >> /etc/postgresql/9.2/main/pg_hba.conf
sudo echo "host    all         all         127.0.0.1/32          trust" >> /etc/postgresql/9.2/main/pg_hba.conf
sudo echo "host    all         all         ::1/128               trust" >> /etc/postgresql/9.2/main/pg_hba.conf
sudo echo "host    all         all         0.0.0.0/0             trust" >> /etc/postgresql/9.2/main/pg_hba.conf
sudo echo "host    all         all         0.0.0.0 255.255.255.255 trust" >> /etc/postgresql/9.2/main/pg_hba.conf
sudo /etc/init.d/postgresql restart
# for some reason both postgres 9.1 and 9.2 are started
# 9.2 is running on port 5433
node script/create-test-tables.js postgres://postgres@localhost:5433/postgres
