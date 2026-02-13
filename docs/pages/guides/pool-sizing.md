---
title: Pool Sizing
---

If you're using a [pool](/apis/pool) in an application with multiple instances of your service running (common in most cloud/container environments currently), you'll need to think a bit about the `max` parameter of your pool across all services and all _instances_ of all services which are connecting to your Postgres server.

This can get pretty complex depending on your cloud environment. Further nuance is introduced with things like pg-bouncer, RDS connection proxies, etc., which will do some forms of connection pooling and connection multiplexing. So, it's definitely worth thinking about. Let's run through a few setups. While certainly not exhaustive, these examples hopefully prompt you into thinking about what's right for your setup.

## Simple apps, dev mode, fixed instance counts, etc.

If your app isn't running in a k8s style env with containers scaling automatically or lambdas or cloud functions etc., you can do some "napkin math" for the `max` pool config you can use. Let's assume your Postgres instance is configured to have a maximum of 200 connections at any one time. You know your service is going to run on 4 instances. You can set the `max` pool size to 50, but if all your services are saturated waiting on database connections, you won't be able to connect to the database from any mgmt tools or scale up your services without changing config/code to adjust the max size.

In this situation, I'd probably set the `max` to 20 or 25. This lets you have plenty of headroom for scaling more instances and realistically, if your app is starved for db connections, you probably want to take a look at your queries and make them execute faster, or cache, or something else to reduce the load on the database. I worked on a more reporting-heavy application with limited users, but each running 5-6 queries at a time which all took 100-200 milliseconds to run. In that situation, I upped the `max` to 50. Typically, though, I don't bother setting it to anything other than the default of `10` as that's usually _fine_.

## Auto-scaling, cloud-functions, multi-tenancy, etc.

If the number of instances of your services which connect to your database is more dynamic and based on things like load, auto-scaling containers, or running in cloud-functions, you need to be a bit more thoughtful about what your max might be. Often in these environments, there will be another database pooling proxy in front of the database like pg-bouncer or the RDS-proxy, etc. I'm not sure how all these function exactly, and they all have some trade-offs, but let's assume you're not using a proxy. Then I'd be pretty cautious about how large you set any individual pool. If you're running an application under pretty serious load where you need dynamic scaling or lots of lambdas spinning up and sending queries, your queries are likely fast and you should be fine setting the `max` to a low value like 10 -- or just leave it alone, since `10` is the default.

## pg-bouncer, RDS-proxy, etc.

I'm not sure of all the pooling services for Postgres. I haven't used any myself. Throughout the years of working on `pg`, I've addressed issues caused by various proxies behaving differently than an actual Postgres backend. There are also gotchas with things like transactions. On the other hand, plenty of people run these with much success. In this situation, I would just recommend using some small but reasonable `max` value like the default value of `10` as it can still be helpful to keep a few TCP sockets from your services to the Postgres proxy open.

## Conclusion, tl;dr

It's a bit of a complicated topic and doesn't have much impact on things until you need to start scaling. At that point, your number of connections _still_ probably won't be your scaling bottleneck. It's worth thinking about a bit, but mostly I'd just leave the pool size to the default of `10` until you run into troubles: hopefully you never do!
