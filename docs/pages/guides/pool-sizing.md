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

### Vercel

If you're running on Vercel with [fluid compute](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute), your serverless functions can handle multiple requests concurrently and stick around between invocations. In this case, you can treat it similarly to a traditional long-lived process and use a default-ish pool size of `10`. The pool will stay warm across requests and you'll get the benefits of connection reuse. You'll probably need to put pgBouncer (or some kinda pooler like what is offered w/ supabase, rds, gcp, etc) in front of your database as vercel worker count can grow quite a bit larger than the number of reasonable max connections postgres can handle.

### Cloudflare workers

In a fully stateless serverless environment like cloudflare workers where your worker is killed, suspended, moved to a new compute node, or shut down at the end of every request, you'll still probably be okay with a pool size `max` of `10` though you can lower it if you start hitting connection exhaustion limits on your pooler. In cloudflare the pooler is hyperdrive and in my experience it works fantastically at pooling w/ their workers setup. Make sure at the end of your serverless handler, after everything is done, you close the pool and dispose of the pool by calling `pool.end()`. Setting the pool to a size larger than 1 is still recommeded as things like tRPC and other server-side routing & request batching code could result in multiple independent queries executing at the same time. With a pool size of `1` you are turning what is "a few things at once" into all things waiting in line one after another on the one available client in the pool.

## pg-bouncer, RDS-proxy, etc.

I'm not sure of all the pooling services for Postgres. I haven't used any myself. Throughout the years of working on `pg`, I've addressed issues caused by various proxies behaving differently than an actual Postgres backend. There are also gotchas with things like transactions. On the other hand, plenty of people run these with much success. In this situation, I would just recommend using some small but reasonable `max` value like the default value of `10` as it can still be helpful to keep a few TCP sockets from your services to the Postgres proxy open.

## Conclusion, tl;dr

It's a bit of a complicated topic and doesn't have much impact on things until you need to start scaling. At that point, your number of connections _still_ probably won't be your scaling bottleneck. It's worth thinking about a bit, but mostly I'd just leave the pool size to the default of `10` until you run into troubles: hopefully you never do!

## Need help?

In my career this has been the most error-prone thing related to running postgres & node. Particularly with the differences in various serverless providers (Cloudflare, Vercel, Lamda, etc...) versus a more traditional hosting. If you have any questions or need help please don't hesitate to email me at [brian.m.carlson@gmail.com](mailto:brian.m.carlson@gmail.com]) or reach out on GitHub.
